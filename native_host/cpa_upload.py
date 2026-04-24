"""CPA auth-file payload generation and upload helpers."""

from __future__ import annotations

import base64
import json
import ssl
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import error, parse, request


DISPLAY_TZ = timezone(timedelta(hours=8))


def normalize_cpa_api_url(raw_value: str) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""

    parsed = parse.urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return ""

    path = parsed.path or ""
    if path in {"/management.html", "/management.html/", "/oauth"}:
        path = ""

    normalized = parse.urlunparse((parsed.scheme, parsed.netloc, path.rstrip("/"), "", "", ""))
    return normalized.rstrip("/")


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    parts = str(token or "").split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1]
    padding = "=" * ((4 - len(payload) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode((payload + padding).encode("ascii"))
        result = json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}
    return result if isinstance(result, dict) else {}


def _get_auth_info(payload: dict[str, Any]) -> dict[str, Any]:
    nested = payload.get("https://api.openai.com/auth")
    return nested if isinstance(nested, dict) else {}


def _b64url_json(data: dict[str, Any]) -> str:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_bytes(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _derive_display_name(email: str) -> str:
    local = str(email or "").split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
    parts = [part for part in local.split() if part]
    if not parts:
        return "OpenAI User"
    return " ".join(part[:1].upper() + part[1:] for part in parts[:3])


def _build_compat_id_token(access_token: str, email: str) -> str:
    payload = _decode_jwt_payload(access_token)
    if not payload:
      return ""

    auth_info = _get_auth_info(payload)
    account_id = str(auth_info.get("chatgpt_account_id") or auth_info.get("account_id") or "").strip()
    user_id = str(auth_info.get("chatgpt_user_id") or auth_info.get("user_id") or payload.get("sub") or "").strip()
    email_value = str(email or payload.get("email") or "").strip().lower()
    iat = int(payload.get("iat") or 0)
    exp = int(payload.get("exp") or 0)
    auth_time = int(payload.get("auth_time") or iat or 0)

    compat_payload = {
        "aud": ["app_EMoamEEZ73f0CkXaXp7hrann"],
        "auth_provider": "password",
        "auth_time": auth_time,
        "email": email_value,
        "email_verified": True,
        "exp": exp,
        "https://api.openai.com/auth": {
            "chatgpt_account_id": account_id,
            "chatgpt_plan_type": str(auth_info.get("chatgpt_plan_type") or "free"),
            "chatgpt_user_id": user_id,
            "completed_platform_onboarding": bool(auth_info.get("completed_platform_onboarding", False)),
            "groups": auth_info.get("groups", []),
            "is_org_owner": bool(auth_info.get("is_org_owner", True)),
            "localhost": True,
            "organization_id": str(auth_info.get("organization_id") or ""),
            "organizations": auth_info.get("organizations") or [],
            "project_id": str(auth_info.get("project_id") or ""),
            "user_id": user_id,
        },
        "iat": iat,
        "iss": payload.get("iss") or "https://auth.openai.com",
        "name": _derive_display_name(email_value),
        "sub": payload.get("sub") or user_id,
    }
    header = {"alg": "RS256", "typ": "JWT", "kid": "compat"}
    signature = _b64url_bytes(b"compat_signature_for_cpa_parsing_only")
    return f"{_b64url_json(header)}.{_b64url_json(compat_payload)}.{signature}"


def _format_timestamp(timestamp: int) -> str:
    if timestamp <= 0:
        return ""
    return datetime.fromtimestamp(timestamp, tz=DISPLAY_TZ).isoformat(timespec="seconds")


def build_auth_file_payload(payload: dict[str, Any]) -> dict[str, Any]:
    email = str(payload.get("accountEmail") or payload.get("email") or "").strip().lower()
    access_token = str(payload.get("accessToken") or payload.get("access_token") or "").strip()
    refresh_token = str(payload.get("refreshToken") or payload.get("refresh_token") or "").strip()
    id_token = str(payload.get("idToken") or payload.get("id_token") or "").strip()

    if access_token and not id_token:
        id_token = _build_compat_id_token(access_token, email)

    jwt_payload = _decode_jwt_payload(access_token)
    auth_info = _get_auth_info(jwt_payload)
    exp_timestamp = int(jwt_payload.get("exp") or 0)

    return {
        "type": "codex",
        "email": email,
        "expired": _format_timestamp(exp_timestamp),
        "id_token": id_token,
        "account_id": str(auth_info.get("chatgpt_account_id") or auth_info.get("account_id") or "").strip(),
        "access_token": access_token,
        "last_refresh": datetime.now(DISPLAY_TZ).isoformat(timespec="seconds"),
        "refresh_token": refresh_token,
    }


def _build_multipart_body(field_name: str, filename: str, content: bytes, content_type: str) -> tuple[bytes, str]:
    boundary = f"----CodexOAuthBoundary{uuid.uuid4().hex}"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8"),
            f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
            content,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    return body, boundary


def _build_ssl_context(upload_url: str) -> ssl.SSLContext | None:
    parsed = parse.urlparse(upload_url)
    if parsed.scheme != "https":
        return None
    if parsed.hostname in {"localhost", "127.0.0.1"}:
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def upload_auth_file(payload: dict[str, Any]) -> dict[str, Any]:
    cpa_api_url = normalize_cpa_api_url(str(payload.get("cpaApiUrl") or payload.get("apiUrl") or ""))
    cpa_management_key = str(payload.get("cpaManagementKey") or payload.get("apiKey") or "").strip()
    if not cpa_api_url:
        raise RuntimeError("CPA API URL 未配置")
    if not cpa_management_key:
        raise RuntimeError("CPA 管理密钥未配置")

    auth_payload = build_auth_file_payload(payload)
    email = str(auth_payload.get("email") or "").strip().lower()
    if not email:
        raise RuntimeError("缺少账号邮箱，无法生成 CPA 认证文件")

    filename = f"{email.replace('/', '_').replace('\\\\', '_')}.json"
    file_content = json.dumps(auth_payload, ensure_ascii=False, indent=2).encode("utf-8")
    body, boundary = _build_multipart_body("file", filename, file_content, "application/json")
    upload_url = f"{cpa_api_url.rstrip('/')}/v0/management/auth-files"

    req = request.Request(
        upload_url,
        data=body,
        headers={
            "Authorization": f"Bearer {cpa_management_key}",
            "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "codex-oauth-automation-extension/1.0",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30, context=_build_ssl_context(upload_url)) as response:
            raw_body = response.read().decode("utf-8", errors="ignore")
            parsed_body = json.loads(raw_body) if raw_body else {}
            if parsed_body and not isinstance(parsed_body, dict):
                parsed_body = {"raw": parsed_body}
            return {
                "uploaded": True,
                "accountEmail": email,
                "filename": filename,
                "response": parsed_body if parsed_body else raw_body,
                "status": int(getattr(response, "status", 200) or 200),
            }
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="ignore")
        message = body_text[:300] if body_text else f"HTTP {exc.code}"
        raise RuntimeError(f"CPA auth file upload failed: {message}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"CPA auth file upload failed: {exc.reason}") from exc
