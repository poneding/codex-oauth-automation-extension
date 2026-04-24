import unittest
from datetime import datetime, timezone
from email.message import EmailMessage
from unittest.mock import patch

from native_host.gmail_imap import (
    apply_imap_deadline,
    encode_imap_mailbox_name,
    extract_message_text,
    extract_verification_code,
    fetch_recent_messages,
    normalize_email_search_text,
    wait_for_verification_code,
    pick_verification_code,
    resolve_imap_operation_timeout_seconds,
)


class FakeImapConnection:
    def __init__(self, mailboxes, search_results=None):
        self.mailboxes = mailboxes
        self.search_results = search_results or {}
        self.current_mailbox = None
        self.selected_mailboxes = []
        self.sock = None
        self.search_queries = []

    def select(self, mailbox, readonly=True):
        self.selected_mailboxes.append(mailbox)
        self.current_mailbox = mailbox
        if mailbox not in self.mailboxes:
            return "NO", []
        return "OK", [b""]

    def search(self, charset, query):
        self.search_queries.append((charset, query))
        configured_ids = self.search_results.get((self.current_mailbox, query))
        if configured_ids is not None:
            if not configured_ids:
                return "OK", [b""]
            ids = b" ".join(
                item if isinstance(item, bytes) else str(item).encode("ascii")
                for item in configured_ids
            )
            return "OK", [ids]
        mailbox_messages = self.mailboxes.get(self.current_mailbox, [])
        if not mailbox_messages:
            return "OK", [b""]
        ids = b" ".join(str(index + 1).encode("ascii") for index in range(len(mailbox_messages)))
        return "OK", [ids]

    def fetch(self, message_id, _query):
        mailbox_messages = self.mailboxes.get(self.current_mailbox, [])
        index = int(message_id) - 1
        message = mailbox_messages[index]
        return "OK", [(b"RFC822", message.as_bytes())]

    def logout(self):
        return "BYE", [b"LOGOUT Requested"]


class UnicodeMailboxFakeImapConnection(FakeImapConnection):
    def __init__(self, mailboxes, encoded_localized_mailbox):
        super().__init__(mailboxes)
        self.encoded_localized_mailbox = encoded_localized_mailbox

    def select(self, mailbox, readonly=True):
        self.selected_mailboxes.append(mailbox)
        if isinstance(mailbox, str) and any(ord(char) > 127 for char in mailbox):
            raise UnicodeEncodeError("ascii", mailbox, 8, 12, "ordinal not in range(128)")
        if mailbox == self.encoded_localized_mailbox:
            self.current_mailbox = mailbox
            return "OK", [b""]
        self.current_mailbox = mailbox
        if mailbox not in self.mailboxes:
            return "NO", []
        return "OK", [b""]


class GmailImapTests(unittest.TestCase):
    def test_resolve_imap_operation_timeout_seconds_uses_remaining_deadline(self):
        with patch("native_host.gmail_imap.time.monotonic", return_value=100.0):
            self.assertEqual(resolve_imap_operation_timeout_seconds(108.0), 8.0)
            self.assertEqual(resolve_imap_operation_timeout_seconds(160.0), 10.0)

    def test_apply_imap_deadline_updates_socket_timeout(self):
        class FakeSocket:
            def __init__(self):
                self.timeouts = []

            def settimeout(self, value):
                self.timeouts.append(value)

        fake_conn = FakeImapConnection({})
        fake_conn.sock = FakeSocket()

        with patch("native_host.gmail_imap.time.monotonic", return_value=100.0):
            apply_imap_deadline(fake_conn, 106.0)

        self.assertEqual(fake_conn.sock.timeouts, [6.0])

    def test_extract_verification_code_supports_english_and_chinese(self):
        self.assertEqual(
            extract_verification_code("OpenAI verification code: 123456"),
            "123456",
        )
        self.assertEqual(
            extract_verification_code("你的验证码是 654321，请勿泄露"),
            "654321",
        )

    def test_pick_verification_code_prefers_target_email_and_excludes_rejected_codes(self):
        messages = [
            {
                "from": "noreply@tm.openai.com",
                "subject": "OpenAI verification code",
                "timestamp": 100,
                "text": "To: other@example.com Your verification code is 111111",
            },
            {
                "from": "noreply@tm.openai.com",
                "subject": "OpenAI verification code",
                "timestamp": 200,
                "text": "To: user@example.com Your verification code is 222222",
            },
        ]

        code = pick_verification_code(
            messages,
            filter_after_timestamp=150,
            target_email="user@example.com",
            exclude_codes={"111111"},
            sender_filters=["openai", "noreply"],
            subject_filters=["verification", "code"],
        )

        self.assertEqual(code, "222222")

    def test_pick_verification_code_matches_target_email_with_quoted_printable_at_sign(self):
        messages = [
            {
                "from": "noreply@tm.openai.com",
                "subject": "OpenAI verification code",
                "timestamp": 300,
                "text": "To: yearly.ruction.8b=40icloud.com Your verification code is 444444",
            },
        ]

        code = pick_verification_code(
            messages,
            target_email="yearly.ruction.8b@icloud.com",
            sender_filters=["openai", "noreply"],
            subject_filters=["verification", "code"],
        )

        self.assertEqual(code, "444444")

    def test_extract_message_text_includes_forwarding_headers_for_target_email_matching(self):
        message = EmailMessage()
        message["From"] = "noreply@tm.openai.com"
        message["To"] = "worker@gmail.com"
        message["X-Forwarded-To"] = "yearly.ruction.8b@icloud.com"
        message["Subject"] = "OpenAI verification code"
        message.set_content("输入此临时验证码以继续：504032")

        text = normalize_email_search_text(extract_message_text(message))

        self.assertIn("yearly.ruction.8b@icloud.com", text)

    def test_extract_message_text_includes_nested_forwarded_message_headers_and_body(self):
        forwarded = EmailMessage()
        forwarded["From"] = "noreply@tm.openai.com"
        forwarded["To"] = "yearly.ruction.8b@icloud.com"
        forwarded["Subject"] = "OpenAI verification code"
        forwarded.set_content("输入此临时验证码以继续：504032")

        wrapper = EmailMessage()
        wrapper["From"] = "forwarder@example.com"
        wrapper["To"] = "worker@gmail.com"
        wrapper["Subject"] = "Fwd: OpenAI verification code"
        wrapper.set_content("请查看转发邮件")
        wrapper.make_mixed()
        wrapper.add_attachment(forwarded)

        text = normalize_email_search_text(extract_message_text(wrapper))

        self.assertIn("yearly.ruction.8b@icloud.com", text)
        self.assertIn("504032", text)

    def test_fetch_recent_messages_checks_gmail_trash_when_inbox_has_no_code(self):
        message = EmailMessage()
        message["From"] = "noreply@tm.openai.com"
        message["To"] = "user@example.com"
        message["Subject"] = "OpenAI verification code"
        message["Date"] = "Thu, 23 Apr 2026 12:00:00 +0000"
        message.set_content("Your verification code is 333333")

        fake_conn = FakeImapConnection({
            "INBOX": [],
            "[Gmail]/Trash": [message],
        })

        with patch("native_host.gmail_imap.open_imap_connection", return_value=fake_conn):
            messages = fetch_recent_messages({})

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["subject"], "OpenAI verification code")
        self.assertIn("[Gmail]/Trash", fake_conn.selected_mailboxes)

    def test_fetch_recent_messages_checks_localized_gmail_spam_folder(self):
        message = EmailMessage()
        message["From"] = "noreply@tm.openai.com"
        message["To"] = "user@example.com"
        message["Subject"] = "OpenAI verification code"
        message["Date"] = "Thu, 23 Apr 2026 12:00:00 +0000"
        message.set_content("Your verification code is 555555")
        encoded_mailbox = encode_imap_mailbox_name("[Gmail]/垃圾邮件")

        fake_conn = FakeImapConnection({
            "INBOX": [],
            encoded_mailbox: [message],
        })

        with patch("native_host.gmail_imap.open_imap_connection", return_value=fake_conn):
            messages = fetch_recent_messages({})

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["subject"], "OpenAI verification code")
        self.assertIn(encoded_mailbox, fake_conn.selected_mailboxes)

    def test_fetch_recent_messages_encodes_non_ascii_mailboxes_before_select(self):
        message = EmailMessage()
        message["From"] = "noreply@tm.openai.com"
        message["To"] = "user@example.com"
        message["Subject"] = "OpenAI verification code"
        message["Date"] = "Thu, 23 Apr 2026 12:00:00 +0000"
        message.set_content("Your verification code is 666666")
        encoded_mailbox = encode_imap_mailbox_name("[Gmail]/垃圾邮件")

        fake_conn = UnicodeMailboxFakeImapConnection({
            "INBOX": [],
            encoded_mailbox: [message],
        }, encoded_mailbox)

        with patch("native_host.gmail_imap.open_imap_connection", return_value=fake_conn):
            messages = fetch_recent_messages({})

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["subject"], "OpenAI verification code")
        self.assertTrue(any(isinstance(mailbox, bytes) for mailbox in fake_conn.selected_mailboxes))

    def test_wait_for_verification_code_recovers_from_transient_imap_errors(self):
        baseline_conn = FakeImapConnection({"INBOX": []})
        success_message = EmailMessage()
        success_message["From"] = "noreply@tm.openai.com"
        success_message["To"] = "user@example.com"
        success_message["Subject"] = "OpenAI verification code"
        success_message["Date"] = "Thu, 23 Apr 2026 12:02:00 +0000"
        success_message.set_content("Your verification code is 777777")
        poll_conn = FakeImapConnection({"INBOX": [success_message]})

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[baseline_conn, RuntimeError("imap boom"), poll_conn],
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "user@example.com",
                "timeoutMs": 5000,
                "pollIntervalSeconds": 1,
            })

        self.assertEqual(result["code"], "777777")
        self.assertTrue(any("IMAP 轮询异常" in entry.get("message", "") for entry in result["diagnostics"]))

    def test_wait_for_verification_code_passes_deadline_to_imap_connections(self):
        captured_deadlines = []
        baseline_conn = FakeImapConnection({"INBOX": []})
        message = EmailMessage()
        message["From"] = "noreply@tm.openai.com"
        message["To"] = "user@example.com"
        message["Subject"] = "OpenAI verification code"
        message["Date"] = "Thu, 23 Apr 2026 12:03:00 +0000"
        message.set_content("Your verification code is 888888")
        poll_conn = FakeImapConnection({"INBOX": [message]})

        def fake_open_imap_connection(_payload, deadline=None):
            captured_deadlines.append(deadline)
            return baseline_conn if len(captured_deadlines) == 1 else poll_conn

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=fake_open_imap_connection,
        ), patch("native_host.gmail_imap.time.monotonic", return_value=100.0):
            result = wait_for_verification_code({
                "targetEmail": "user@example.com",
                "timeoutMs": 5000,
                "pollIntervalSeconds": 1,
            })

        self.assertEqual(result["code"], "888888")
        self.assertEqual(captured_deadlines, [105.0, 105.0])

    def test_extract_verification_code_prefers_real_otp_over_tracking_digits_in_html(self):
        html = """
        <table>
          <tbody>
            <tr>
              <td>
                <p>输入此临时验证码以继续：</p>
                <p>504032</p>
                <p>
                  如果你无意登录 ChatGPT，请<a href="https://u20216706.ct.sendgrid.net/ls/click?ust=1777010551482000">重置密码</a>。
                </p>
              </td>
            </tr>
          </tbody>
        </table>
        """

        self.assertEqual(extract_verification_code(html), "504032")

    def test_wait_for_verification_code_uses_before_ids_baseline_and_imap_to_search(self):
        history = EmailMessage()
        history["From"] = "noreply@tm.openai.com"
        history["To"] = "yearly.ruction.8b@icloud.com"
        history["Subject"] = "OpenAI verification code"
        history["Date"] = "Thu, 23 Apr 2026 12:00:00 +0000"
        history.set_content("Your verification code is 111111")

        fresh = EmailMessage()
        fresh["From"] = "noreply@tm.openai.com"
        fresh["To"] = "yearly.ruction.8b@icloud.com"
        fresh["Subject"] = "OpenAI verification code"
        fresh["Date"] = "Thu, 23 Apr 2026 12:01:00 +0000"
        fresh.set_content("Your verification code is 222222")

        baseline_conn = FakeImapConnection({"INBOX": [history]})
        poll_conn = FakeImapConnection({"INBOX": [history, fresh]})

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[baseline_conn, poll_conn],
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "yearly.ruction.8b@icloud.com",
                "timeoutMs": 5000,
                "pollIntervalSeconds": 1,
            })

        self.assertEqual(result["code"], "222222")
        self.assertEqual(
            baseline_conn.search_queries,
            [(None, '(TO "yearly.ruction.8b@icloud.com")'), (None, "ALL")],
        )
        self.assertEqual(
            poll_conn.search_queries,
            [(None, '(TO "yearly.ruction.8b@icloud.com")')],
        )
        self.assertTrue(any("before_ids" in entry.get("message", "") for entry in result.get("diagnostics", [])))

    def test_wait_for_verification_code_falls_back_to_all_when_to_search_misses_forwarded_mail(self):
        history = EmailMessage()
        history["From"] = "forwarder@example.com"
        history["To"] = "worker@gmail.com"
        history["X-Forwarded-To"] = "roster_honey.4j@icloud.com"
        history["Subject"] = "OpenAI verification code"
        history["Date"] = "Thu, 23 Apr 2026 12:00:00 +0000"
        history.set_content("Your verification code is 111111")

        fresh = EmailMessage()
        fresh["From"] = "forwarder@example.com"
        fresh["To"] = "worker@gmail.com"
        fresh["X-Forwarded-To"] = "roster_honey.4j@icloud.com"
        fresh["Subject"] = "OpenAI verification code"
        fresh["Date"] = "Thu, 23 Apr 2026 12:01:00 +0000"
        fresh.set_content("输入此临时验证码以继续：504032")

        baseline_conn = FakeImapConnection(
            {"INBOX": [history]},
            search_results={
                ("INBOX", '(TO "roster_honey.4j@icloud.com")'): [],
                ("INBOX", "ALL"): [1],
            },
        )
        poll_conn = FakeImapConnection(
            {"INBOX": [history, fresh]},
            search_results={
                ("INBOX", '(TO "roster_honey.4j@icloud.com")'): [1],
                ("INBOX", "ALL"): [1, 2],
            },
        )

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[baseline_conn, poll_conn],
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "roster_honey.4j@icloud.com",
                "timeoutMs": 5000,
                "pollIntervalSeconds": 1,
            })

        self.assertEqual(result["code"], "504032")
        self.assertEqual(
            baseline_conn.search_queries,
            [(None, '(TO "roster_honey.4j@icloud.com")'), (None, "ALL")],
        )
        self.assertEqual(
            poll_conn.search_queries,
            [(None, '(TO "roster_honey.4j@icloud.com")'), (None, "ALL")],
        )
        self.assertTrue(any("ALL 回退结果" in entry.get("message", "") for entry in result.get("diagnostics", [])))

    def test_wait_for_verification_code_inspects_recent_baseline_candidates_when_filter_window_is_active(self):
        fresh = EmailMessage()
        fresh["From"] = "noreply@tm.openai.com"
        fresh["To"] = "roster_honey.4j@icloud.com"
        fresh["Subject"] = "你的 OpenAI 代码为 310902"
        fresh["Date"] = "Thu, 23 Apr 2026 17:01:00 +0000"
        fresh.set_content("输入此临时验证码以继续：310902")

        baseline_conn = FakeImapConnection({"INBOX": [fresh]})
        poll_conn = FakeImapConnection({"INBOX": [fresh]})

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[baseline_conn, poll_conn],
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "roster_honey.4j@icloud.com",
                "timeoutMs": 5000,
                "pollIntervalSeconds": 1,
                "filterAfterTimestamp": 1,
            })

        self.assertEqual(result["code"], "310902")
        self.assertTrue(any("检查基线内最近邮件" in entry.get("message", "") for entry in result.get("diagnostics", [])))

    def test_wait_for_verification_code_falls_back_to_latest_existing_match_when_no_new_mail_arrives(self):
        existing = EmailMessage()
        existing["From"] = "noreply@tm.openai.com"
        existing["To"] = "roster_honey.4j@icloud.com"
        existing["Subject"] = "你的临时 ChatGPT 登录代码"
        existing["Date"] = "Thu, 23 Apr 2026 17:01:00 +0000"
        existing.set_content("输入此临时验证码以继续：310902")

        baseline_conn = FakeImapConnection({"INBOX": [existing]})
        poll_conn = FakeImapConnection({"INBOX": [existing]})
        fallback_conn = FakeImapConnection({"INBOX": [existing]})
        clock = {"value": 100.0}

        def fake_monotonic():
            current = clock["value"]
            clock["value"] += 0.45
            return current

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[baseline_conn, poll_conn, fallback_conn],
        ), patch(
            "native_host.gmail_imap.time.monotonic",
            side_effect=fake_monotonic,
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "roster_honey.4j@icloud.com",
                "timeoutMs": 1000,
                "pollIntervalSeconds": 1,
                "filterAfterTimestamp": 9999999999999,
            })

        self.assertEqual(result["code"], "310902")
        self.assertTrue(any("开始检查最近已有匹配邮件" in entry.get("message", "") for entry in result.get("diagnostics", [])))

    def test_wait_for_verification_code_uses_recent_all_query_when_filter_window_is_active(self):
        empty_conn_1 = FakeImapConnection({"INBOX": []})
        empty_conn_2 = FakeImapConnection({"INBOX": []})
        filter_after_timestamp = int(datetime(2026, 4, 23, 12, 0, tzinfo=timezone.utc).timestamp() * 1000)
        clock = {"value": 100.0}

        def fake_monotonic():
            current = clock["value"]
            clock["value"] += 1.1
            return current

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[empty_conn_1, empty_conn_2],
        ), patch(
            "native_host.gmail_imap.time.monotonic",
            side_effect=fake_monotonic,
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            wait_for_verification_code({
                "targetEmail": "roster_honey.4j@icloud.com",
                "timeoutMs": 2000,
                "pollIntervalSeconds": 1,
                "filterAfterTimestamp": filter_after_timestamp,
            })

        expected_all_query = "(SINCE 22-Apr-2026)"
        self.assertEqual(
            empty_conn_1.search_queries,
            [(None, '(TO "roster_honey.4j@icloud.com")'), (None, expected_all_query)],
        )
        self.assertEqual(
            empty_conn_2.search_queries,
            [(None, '(TO "roster_honey.4j@icloud.com")'), (None, expected_all_query)],
        )

    def test_wait_for_verification_code_returns_timeout_error_with_diagnostics(self):
        empty_conn_1 = FakeImapConnection({"INBOX": []})
        empty_conn_2 = FakeImapConnection({"INBOX": []})
        clock = {"value": 100.0}

        def fake_monotonic():
            current = clock["value"]
            clock["value"] += 0.4
            return current

        with patch(
            "native_host.gmail_imap.open_imap_connection",
            side_effect=[empty_conn_1, empty_conn_2],
        ), patch(
            "native_host.gmail_imap.time.monotonic",
            side_effect=fake_monotonic,
        ), patch("native_host.gmail_imap.time.sleep", return_value=None):
            result = wait_for_verification_code({
                "targetEmail": "yearly.ruction.8b@icloud.com",
                "timeoutMs": 2000,
                "pollIntervalSeconds": 1,
            })

        self.assertIn("error", result)
        self.assertIn("diagnostics", result)
        self.assertTrue(any("INBOX" in entry.get("message", "") for entry in result["diagnostics"]))


if __name__ == "__main__":
    unittest.main()
