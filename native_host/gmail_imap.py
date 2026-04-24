"""Gmail IMAP helpers for the native host."""

from __future__ import annotations

import base64
import email
import imaplib
import re
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.message import Message
from email.utils import parsedate_to_datetime
from html import unescape
from typing import Any

DEFAULT_SENDER_FILTERS = ["openai", "noreply", "verify", "auth", "chatgpt", "forward"]
DEFAULT_SUBJECT_FILTERS = ["verify", "verification", "code", "验证码", "confirm", "login"]
DEFAULT_IMAP_TIMEOUT_SECONDS = 10.0
MAX_MESSAGES_PER_MAILBOX = 8
MAX_TOTAL_MESSAGES = 24
MAX_DIAGNOSTIC_ENTRIES = 80
RECENT_ALL_SEARCH_PADDING_DAYS = 1
IMAP_MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]
DEFAULT_MAILBOXES = [
    "INBOX",
    "[Gmail]/Spam",
    "[Google Mail]/Spam",
    "[Gmail]/Junk",
    "[Gmail]/垃圾邮件",
    "[Google Mail]/垃圾邮件",
    "Spam",
    "Junk",
    "垃圾邮件",
    "[Gmail]/Trash",
    "[Google Mail]/Trash",
    "[Gmail]/已删除邮件",
    "[Google Mail]/已删除邮件",
    "Trash",
    "已删除邮件",
    "垃圾箱",
]
MESSAGE_SEARCH_HEADERS = [
    "Subject",
    "From",
    "To",
    "Cc",
    "Bcc",
    "Delivered-To",
    "X-Original-To",
    "X-Forwarded-To",
    "Resent-To",
    "Resent-Cc",
    "Envelope-To",
    "X-Envelope-To",
    "Apparently-To",
    "Original-Recipient",
]


def resolve_imap_operation_timeout_seconds(deadline: float | None = None) -> float:
    if deadline is None:
        return DEFAULT_IMAP_TIMEOUT_SECONDS
    remaining_seconds = float(deadline) - time.monotonic()
    if remaining_seconds <= 0:
        return 1.0
    return max(1.0, min(DEFAULT_IMAP_TIMEOUT_SECONDS, remaining_seconds))


def apply_imap_deadline(conn: imaplib.IMAP4_SSL, deadline: float | None = None) -> None:
    sock = getattr(conn, "sock", None)
    if sock is None or not hasattr(sock, "settimeout"):
        return
    sock.settimeout(resolve_imap_operation_timeout_seconds(deadline))


def append_diagnostic(
    diagnostics: list[dict[str, str]],
    level: str,
    message: str,
) -> None:
    diagnostics.append({
        "level": str(level or "info"),
        "message": normalize_text(message),
    })
    if len(diagnostics) > MAX_DIAGNOSTIC_ENTRIES:
        del diagnostics[:-MAX_DIAGNOSTIC_ENTRIES]


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_email_search_text(value: Any) -> str:
    return (
        str(value or "")
        .lower()
        .replace("=\r\n", "")
        .replace("=\n", "")
        .replace("=40", "@")
        .replace("%40", "@")
        .replace("&#64;", "@")
        .replace("&commat;", "@")
    )


def encode_imap_mailbox_name(mailbox: Any) -> str | bytes:
    value = str(mailbox or "")
    if not value:
        return ""
    if all(0x20 <= ord(char) <= 0x7E and char != "&" for char in value):
        return value

    chunks: list[str] = []
    unicode_buffer: list[str] = []

    def flush_unicode_buffer() -> None:
        if not unicode_buffer:
            return
        utf16_bytes = "".join(unicode_buffer).encode("utf-16-be")
        encoded = base64.b64encode(utf16_bytes).decode("ascii").rstrip("=").replace("/", ",")
        chunks.append(f"&{encoded}-")
        unicode_buffer.clear()

    for char in value:
        if 0x20 <= ord(char) <= 0x7E and char != "&":
            flush_unicode_buffer()
            chunks.append(char)
            continue
        if char == "&":
            flush_unicode_buffer()
            chunks.append("&-")
            continue
        unicode_buffer.append(char)

    flush_unicode_buffer()
    return "".join(chunks).encode("ascii")


def decode_header_value(value: str) -> str:
    parts = decode_header(value or "")
    decoded: list[str] = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="ignore"))
        else:
            decoded.append(str(part))
    return normalize_text(" ".join(decoded))


def html_to_text(value: str) -> str:
    text = unescape(str(value or ""))
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return normalize_text(text)


def extract_verification_code(text: str) -> str:
    normalized = str(text or "")
    patterns = [
        r"(?:verification\s+code|temporary\s+verification\s+code|your\s+chatgpt\s+code|code(?:\s+is)?)[^0-9]{0,16}(\d{6})",
        r"(?:验证码|代码)[^0-9]{0,16}(\d{6})",
        r"\b(\d{6})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, flags=re.I)
        if match:
            return match.group(1)
    return ""


def parse_message_timestamp(message: Message) -> int:
    raw_date = decode_header_value(message.get("Date", ""))
    if not raw_date:
        return 0
    try:
        parsed = parsedate_to_datetime(raw_date)
    except (TypeError, ValueError, IndexError):
        return 0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def collect_message_header_text(message: Message) -> list[str]:
    parts: list[str] = []
    for header_name in MESSAGE_SEARCH_HEADERS:
        for value in message.get_all(header_name, []):
            decoded = decode_header_value(value)
            if decoded:
                parts.append(decoded)
    return parts


def decode_message_body_part(message: Message) -> str:
    content_type = (message.get_content_type() or "").lower()
    if content_type not in {"text/plain", "text/html"}:
        return ""

    payload = message.get_payload(decode=True)
    if payload is None:
        raw_payload = message.get_payload()
        text = str(raw_payload or "")
    else:
        charset = message.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="ignore")
        except LookupError:
            text = payload.decode("utf-8", errors="ignore")

    return html_to_text(text) if content_type == "text/html" else normalize_text(text)


def extract_message_text(message: Message) -> str:
    parts: list[str] = collect_message_header_text(message)

    if message.is_multipart():
        payload = message.get_payload()
        if isinstance(payload, list):
            for part in payload:
                if isinstance(part, Message):
                    nested_text = extract_message_text(part)
                    if nested_text:
                        parts.append(nested_text)
        return normalize_text(" ".join(parts))

    nested_content_type = (message.get_content_type() or "").lower()
    if nested_content_type == "message/rfc822":
        nested_payload = message.get_payload()
        if isinstance(nested_payload, list):
            for nested_message in nested_payload:
                if isinstance(nested_message, Message):
                    nested_text = extract_message_text(nested_message)
                    if nested_text:
                        parts.append(nested_text)
        elif isinstance(nested_payload, bytes):
            nested_text = extract_message_text(email.message_from_bytes(nested_payload))
            if nested_text:
                parts.append(nested_text)
        elif isinstance(nested_payload, str):
            nested_text = extract_message_text(email.message_from_string(nested_payload))
            if nested_text:
                parts.append(nested_text)
        return normalize_text(" ".join(parts))

    body_text = decode_message_body_part(message)
    if body_text:
        parts.append(body_text)
    return normalize_text(" ".join(parts))


def build_message_entry(message: Message) -> dict[str, Any]:
    return {
        "from": decode_header_value(message.get("From", "")),
        "subject": decode_header_value(message.get("Subject", "")),
        "timestamp": parse_message_timestamp(message),
        "text": extract_message_text(message),
    }


def pick_verification_code(
    messages: list[dict[str, Any]],
    *,
    filter_after_timestamp: int = 0,
    target_email: str = "",
    exclude_codes: set[str] | None = None,
    sender_filters: list[str] | None = None,
    subject_filters: list[str] | None = None,
) -> str:
    normalized_target = normalize_email_search_text(normalize_text(target_email))
    excluded = {str(code).strip() for code in (exclude_codes or set()) if str(code).strip()}
    resolved_sender_filters = [normalize_text(item).lower() for item in (sender_filters or DEFAULT_SENDER_FILTERS) if normalize_text(item)]
    resolved_subject_filters = [normalize_text(item).lower() for item in (subject_filters or DEFAULT_SUBJECT_FILTERS) if normalize_text(item)]

    for message in sorted(messages, key=lambda item: int(item.get("timestamp") or 0), reverse=True):
        timestamp = int(message.get("timestamp") or 0)
        if filter_after_timestamp and timestamp and timestamp < int(filter_after_timestamp):
            continue

        sender = normalize_text(message.get("from", "")).lower()
        subject = normalize_text(message.get("subject", "")).lower()
        text = normalize_email_search_text(normalize_text(message.get("text", "")))

        if resolved_sender_filters and not any(token in sender or token in text for token in resolved_sender_filters):
            continue
        if resolved_subject_filters and not any(token in subject or token in text for token in resolved_subject_filters):
            continue
        if normalized_target and normalized_target not in text:
            continue

        code = extract_verification_code(f"{message.get('subject', '')} {message.get('text', '')}")
        if not code or code in excluded:
            continue
        return code

    return ""


def build_imap_to_search_query(target_email: Any) -> str:
    normalized_target = normalize_text(target_email)
    if not normalized_target:
        return "ALL"
    escaped = normalized_target.replace("\\", "\\\\").replace('"', r'\"')
    return f'(TO "{escaped}")'


def format_imap_search_date(date_value: datetime) -> str:
    normalized = date_value.astimezone(timezone.utc)
    month_name = IMAP_MONTH_NAMES[normalized.month - 1]
    return f"{normalized.day:02d}-{month_name}-{normalized.year:04d}"


def build_recent_all_search_query(filter_after_timestamp: int) -> str:
    if not int(filter_after_timestamp or 0):
        return "ALL"

    recent_start = datetime.fromtimestamp(
        max(0, int(filter_after_timestamp)) / 1000,
        tz=timezone.utc,
    ) - timedelta(days=RECENT_ALL_SEARCH_PADDING_DAYS)
    return f"(SINCE {format_imap_search_date(recent_start)})"


def evaluate_message_code_candidate(
    message: dict[str, Any],
    *,
    filter_after_timestamp: int = 0,
    target_email: str = "",
    exclude_codes: set[str] | None = None,
    sender_filters: list[str] | None = None,
    subject_filters: list[str] | None = None,
) -> tuple[str, str]:
    normalized_target = normalize_email_search_text(normalize_text(target_email))
    excluded = {str(code).strip() for code in (exclude_codes or set()) if str(code).strip()}
    resolved_sender_filters = [normalize_text(item).lower() for item in (sender_filters or DEFAULT_SENDER_FILTERS) if normalize_text(item)]
    resolved_subject_filters = [normalize_text(item).lower() for item in (subject_filters or DEFAULT_SUBJECT_FILTERS) if normalize_text(item)]

    timestamp = int(message.get("timestamp") or 0)
    if filter_after_timestamp and timestamp and timestamp < int(filter_after_timestamp):
        return "", "old_timestamp"

    sender = normalize_text(message.get("from", "")).lower()
    subject = normalize_text(message.get("subject", "")).lower()
    text = normalize_email_search_text(normalize_text(message.get("text", "")))

    if resolved_sender_filters and not any(token in sender or token in text for token in resolved_sender_filters):
        return "", "sender_filter_mismatch"
    if resolved_subject_filters and not any(token in subject or token in text for token in resolved_subject_filters):
        return "", "subject_filter_mismatch"
    if normalized_target and normalized_target not in text:
        return "", "target_email_mismatch"

    code = extract_verification_code(f"{message.get('subject', '')} {message.get('text', '')}")
    if not code:
        return "", "code_not_found"
    if code in excluded:
        return "", "excluded_code"
    return code, ""


def search_message_ids(
    conn: imaplib.IMAP4_SSL,
    *,
    query: str = "ALL",
    deadline: float | None = None,
) -> list[bytes]:
    apply_imap_deadline(conn, deadline)
    status, _ = conn.select("INBOX", readonly=True)
    if status != "OK":
        raise RuntimeError("无法打开 Gmail INBOX")

    apply_imap_deadline(conn, deadline)
    status, data = conn.search(None, query)
    if status != "OK" or not data:
        return []
    return data[0].split() if data and data[0] else []


def fetch_parsed_message(
    conn: imaplib.IMAP4_SSL,
    message_id: bytes,
    *,
    deadline: float | None = None,
) -> Message | None:
    apply_imap_deadline(conn, deadline)
    status, msg_data = conn.fetch(message_id, "(RFC822)")
    if status != "OK" or not msg_data:
        return None

    raw_email = None
    for item in msg_data:
        if isinstance(item, tuple) and len(item) > 1 and item[1]:
            raw_email = item[1]
            break

    if not raw_email:
        return None
    return email.message_from_bytes(raw_email)


def get_current_message_ids(
    config: dict[str, Any],
    *,
    query: str = "ALL",
    deadline: float | None = None,
) -> set[bytes]:
    conn = open_imap_connection(config, deadline=deadline)
    try:
        return set(search_message_ids(conn, query=query, deadline=deadline))
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def open_imap_connection(config: dict[str, Any], *, deadline: float | None = None) -> imaplib.IMAP4_SSL:
    gmail_imap_email = normalize_text(config.get("gmailImapEmail"))
    gmail_imap_app_password = str(config.get("gmailImapAppPassword") or "")
    gmail_imap_host = normalize_text(config.get("gmailImapHost")) or "imap.gmail.com"
    gmail_imap_port = int(config.get("gmailImapPort") or 993)

    if not gmail_imap_email or not gmail_imap_app_password:
        raise RuntimeError("Gmail IMAP 邮箱或 App Password 未配置")

    timeout_seconds = resolve_imap_operation_timeout_seconds(deadline)
    conn = imaplib.IMAP4_SSL(gmail_imap_host, gmail_imap_port, timeout=timeout_seconds)
    apply_imap_deadline(conn, deadline)
    conn.login(gmail_imap_email, gmail_imap_app_password)
    return conn


def fetch_recent_messages(
    config: dict[str, Any],
    mailbox_names: list[str] | None = None,
    *,
    deadline: float | None = None,
) -> list[dict[str, Any]]:
    conn = open_imap_connection(config, deadline=deadline)
    mailbox_candidates = mailbox_names or DEFAULT_MAILBOXES
    messages: list[dict[str, Any]] = []
    try:
        for mailbox in mailbox_candidates:
            if deadline is not None and time.monotonic() >= deadline:
                break
            encoded_mailbox = encode_imap_mailbox_name(mailbox)
            try:
                apply_imap_deadline(conn, deadline)
                status, _ = conn.select(encoded_mailbox, readonly=True)
            except (imaplib.IMAP4.error, UnicodeEncodeError):
                continue
            if status != "OK":
                continue

            if deadline is not None and time.monotonic() >= deadline:
                break

            apply_imap_deadline(conn, deadline)
            status, data = conn.search(None, "ALL")
            if status != "OK" or not data or not data[0]:
                continue

            ids = data[0].split()[-MAX_MESSAGES_PER_MAILBOX:]
            for message_id in reversed(ids):
                if deadline is not None and time.monotonic() >= deadline:
                    break
                if len(messages) >= MAX_TOTAL_MESSAGES:
                    return messages
                apply_imap_deadline(conn, deadline)
                status, msg_data = conn.fetch(message_id, "(RFC822)")
                if status != "OK" or not msg_data:
                    continue
                raw_email = msg_data[0][1]
                if not raw_email:
                    continue
                parsed_message = email.message_from_bytes(raw_email)
                messages.append(build_message_entry(parsed_message))
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return messages


def test_connection(payload: dict[str, Any]) -> dict[str, Any]:
    conn = open_imap_connection(payload)
    try:
        status, _ = conn.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("无法打开 Gmail INBOX")
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return {"status": "ok"}


def get_baseline_message_ids(
    config: dict[str, Any],
    *,
    to_query: str,
    all_query: str = "ALL",
    deadline: float | None = None,
) -> tuple[set[bytes], set[bytes]]:
    conn = open_imap_connection(config, deadline=deadline)
    try:
        before_ids_to = set(search_message_ids(conn, query=to_query, deadline=deadline))
        before_ids_all = set(search_message_ids(conn, query=all_query, deadline=deadline))
        return before_ids_to, before_ids_all
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def collect_verification_code_from_message_ids(
    conn: imaplib.IMAP4_SSL,
    message_ids: list[bytes],
    *,
    scope_label: str,
    seen: set[bytes],
    baseline_ids: set[bytes] | None,
    diagnostics: list[dict[str, str]],
    filter_after_timestamp: int,
    target_email: str,
    exclude_codes: set[str],
    sender_filters: list[str],
    subject_filters: list[str],
    keyword: str,
    allow_existing_baseline_candidates: bool = False,
    deadline: float | None = None,
) -> dict[str, Any] | None:
    recent_message_ids = message_ids[-MAX_MESSAGES_PER_MAILBOX:]
    normalized_baseline_ids = baseline_ids or set()

    if allow_existing_baseline_candidates:
        baseline_candidate_count = sum(1 for message_id in recent_message_ids if message_id in normalized_baseline_ids)
        if baseline_candidate_count:
            append_diagnostic(
                diagnostics,
                "info",
                f"{scope_label} 检查基线内最近邮件: {baseline_candidate_count} 封",
            )

    for message_id in reversed(recent_message_ids):
        if message_id in seen:
            continue
        if message_id in normalized_baseline_ids and not allow_existing_baseline_candidates:
            continue
        seen.add(message_id)

        parsed_message = fetch_parsed_message(conn, message_id, deadline=deadline)
        if parsed_message is None:
            append_diagnostic(diagnostics, "warn", f"{scope_label} message_id={message_id!r} fetch 空响应")
            continue

        message_entry = build_message_entry(parsed_message)
        subject = message_entry["subject"] or "-"
        timestamp = int(message_entry["timestamp"] or 0)

        append_diagnostic(
            diagnostics,
            "info",
            f"{scope_label} 命中新邮件 subject={subject} id={message_id!r}",
        )

        if keyword and keyword not in str(message_entry["text"]).lower():
            append_diagnostic(diagnostics, "warn", f"{scope_label} 跳过关键字不匹配邮件 subject={subject}")
            continue

        code, reason = evaluate_message_code_candidate(
            message_entry,
            filter_after_timestamp=filter_after_timestamp,
            target_email=target_email,
            exclude_codes=exclude_codes,
            sender_filters=sender_filters,
            subject_filters=subject_filters,
        )
        if reason == "old_timestamp":
            append_diagnostic(diagnostics, "warn", f"{scope_label} 跳过旧邮件 subject={subject} timestamp={timestamp}")
            continue
        if reason == "sender_filter_mismatch":
            append_diagnostic(diagnostics, "warn", f"{scope_label} 跳过发件人不匹配邮件 subject={subject}")
            continue
        if reason == "subject_filter_mismatch":
            append_diagnostic(diagnostics, "warn", f"{scope_label} 跳过主题不匹配邮件 subject={subject}")
            continue
        if reason == "target_email_mismatch":
            append_diagnostic(diagnostics, "warn", f"{scope_label} 跳过目标邮箱不匹配邮件 subject={subject}")
            continue
        if reason == "code_not_found":
            append_diagnostic(diagnostics, "warn", f"{scope_label} 未提取到验证码 subject={subject}")
            continue
        if reason == "excluded_code":
            candidate_text = f"{message_entry.get('subject', '')} {message_entry.get('text', '')}"
            append_diagnostic(
                diagnostics,
                "warn",
                f"{scope_label} 跳过已尝试验证码: {extract_verification_code(candidate_text)}",
            )
            continue

        append_diagnostic(diagnostics, "info", f"{scope_label} 验证码提取成功: {code}")
        return {
            "code": code,
            "emailTimestamp": timestamp or int(datetime.now(timezone.utc).timestamp() * 1000),
            "diagnostics": diagnostics,
        }

    return None


def inspect_existing_matching_messages(
    config: dict[str, Any],
    *,
    to_query: str,
    all_query: str,
    diagnostics: list[dict[str, str]],
    target_email: str,
    exclude_codes: set[str],
    sender_filters: list[str],
    subject_filters: list[str],
    keyword: str,
    deadline: float | None = None,
) -> dict[str, Any] | None:
    append_diagnostic(diagnostics, "warn", "未发现可用新邮件，开始检查最近已有匹配邮件。")
    conn = open_imap_connection(config, deadline=deadline)
    try:
        to_msg_ids = search_message_ids(conn, query=to_query, deadline=deadline)
        append_diagnostic(diagnostics, "info", f"TO 最近已有邮件检查: 共 {len(to_msg_ids)} 封")
        result = collect_verification_code_from_message_ids(
            conn,
            to_msg_ids,
            scope_label="TO-FALLBACK",
            seen=set(),
            baseline_ids=set(to_msg_ids),
            diagnostics=diagnostics,
            filter_after_timestamp=0,
            target_email=target_email,
            exclude_codes=exclude_codes,
            sender_filters=sender_filters,
            subject_filters=subject_filters,
            keyword=keyword,
            allow_existing_baseline_candidates=True,
            deadline=deadline,
        )
        if result:
            return result

        all_msg_ids = search_message_ids(conn, query=all_query, deadline=deadline)
        append_diagnostic(diagnostics, "info", f"ALL 最近已有邮件检查: 共 {len(all_msg_ids)} 封")
        return collect_verification_code_from_message_ids(
            conn,
            all_msg_ids,
            scope_label="ALL-FALLBACK",
            seen=set(),
            baseline_ids=set(all_msg_ids),
            diagnostics=diagnostics,
            filter_after_timestamp=0,
            target_email=target_email,
            exclude_codes=exclude_codes,
            sender_filters=sender_filters,
            subject_filters=subject_filters,
            keyword=keyword,
            allow_existing_baseline_candidates=True,
            deadline=deadline,
        )
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def wait_for_verification_code(payload: dict[str, Any]) -> dict[str, Any]:
    timeout_ms = max(1000, int(payload.get("timeoutMs") or 90000))
    poll_interval_seconds = max(1, int(payload.get("pollIntervalSeconds") or 3))
    filter_after_timestamp = int(payload.get("filterAfterTimestamp") or 0)
    target_email = normalize_text(payload.get("targetEmail"))
    exclude_codes = {
        str(code).strip()
        for code in (payload.get("excludeCodes") or [])
        if str(code).strip()
    }
    keyword = normalize_text(payload.get("keyword")).lower()
    diagnostics: list[dict[str, str]] = []
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_exception: Exception | None = None
    round_index = 0
    to_query = build_imap_to_search_query(target_email)
    all_query = build_recent_all_search_query(filter_after_timestamp)
    sender_filters = list(payload.get("senderFilters") or DEFAULT_SENDER_FILTERS)
    subject_filters = list(payload.get("subjectFilters") or DEFAULT_SUBJECT_FILTERS)

    try:
        before_ids_to, before_ids_all = get_baseline_message_ids(
            payload,
            to_query=to_query,
            all_query=all_query,
            deadline=deadline,
        )
        append_diagnostic(
            diagnostics,
            "info",
            f'before_ids 基线数量: {len(before_ids_to)}；搜索条件: {to_query}',
        )
        append_diagnostic(
            diagnostics,
            "info",
            f'ALL 基线数量: {len(before_ids_all)}；搜索条件: {all_query}',
        )
    except Exception as exc:
        last_exception = exc
        before_ids_to = set()
        before_ids_all = set()
        append_diagnostic(diagnostics, "warn", f"获取 before_ids 基线失败: {exc}")

    seen: set[bytes] = set()
    allow_existing_baseline_candidates = bool(filter_after_timestamp)
    baseline_candidate_ids_for_to = before_ids_to | before_ids_all

    while time.monotonic() < deadline:
        round_index += 1
        try:
            conn = open_imap_connection(payload, deadline=deadline)
            try:
                msg_ids = search_message_ids(conn, query=to_query, deadline=deadline)
                new_ids = [message_id for message_id in msg_ids if message_id not in before_ids_to]
                append_diagnostic(
                    diagnostics,
                    "info",
                    f"第 {round_index} 轮 INBOX TO 搜索结果: 共 {len(msg_ids)} 封，新增 {len(new_ids)} 封",
                )
                result = collect_verification_code_from_message_ids(
                    conn,
                    msg_ids,
                    scope_label="TO",
                    seen=seen,
                    baseline_ids=baseline_candidate_ids_for_to,
                    diagnostics=diagnostics,
                    filter_after_timestamp=filter_after_timestamp,
                    target_email=target_email,
                    exclude_codes=exclude_codes,
                    sender_filters=sender_filters,
                    subject_filters=subject_filters,
                    keyword=keyword,
                    allow_existing_baseline_candidates=allow_existing_baseline_candidates,
                    deadline=deadline,
                )
                if result:
                    return result

                all_msg_ids = search_message_ids(conn, query=all_query, deadline=deadline)
                all_new_ids = [message_id for message_id in all_msg_ids if message_id not in before_ids_all]
                append_diagnostic(
                    diagnostics,
                    "info",
                    f"第 {round_index} 轮 INBOX ALL 回退结果: 共 {len(all_msg_ids)} 封，新增 {len(all_new_ids)} 封",
                )
                result = collect_verification_code_from_message_ids(
                    conn,
                    all_msg_ids,
                    scope_label="ALL",
                    seen=seen,
                    baseline_ids=before_ids_all,
                    diagnostics=diagnostics,
                    filter_after_timestamp=filter_after_timestamp,
                    target_email=target_email,
                    exclude_codes=exclude_codes,
                    sender_filters=sender_filters,
                    subject_filters=subject_filters,
                    keyword=keyword,
                    allow_existing_baseline_candidates=allow_existing_baseline_candidates,
                    deadline=deadline,
                )
                if result:
                    return result
            finally:
                try:
                    conn.logout()
                except Exception:
                    pass
            last_exception = None
        except Exception as exc:
            last_exception = exc
            append_diagnostic(diagnostics, "warn", f"第 {round_index} 轮 IMAP 轮询异常: {exc}")

        remaining_seconds = deadline - time.monotonic()
        if remaining_seconds <= 0:
            break
        time.sleep(min(poll_interval_seconds, max(0, remaining_seconds)))

    if filter_after_timestamp:
        try:
            result = inspect_existing_matching_messages(
                payload,
                to_query=to_query,
                all_query=all_query,
                diagnostics=diagnostics,
                target_email=target_email,
                exclude_codes=exclude_codes,
                sender_filters=sender_filters,
                subject_filters=subject_filters,
                keyword=keyword,
                deadline=deadline,
            )
            if result:
                return result
        except Exception as exc:
            last_exception = exc
            append_diagnostic(diagnostics, "warn", f"最近已有邮件兜底检查失败: {exc}")

    detail = f" 最近异常：{last_exception}" if last_exception else ""
    return {
        "error": f"Gmail IMAP 轮询结束，但未获取到验证码。{detail}".strip(),
        "diagnostics": diagnostics,
    }
