import unittest

from native_host.openai_oauth import parse_callback_url


class OpenAIOAuthTests(unittest.TestCase):
    def test_parse_callback_url_extracts_code_and_state(self):
        parsed = parse_callback_url(
            "http://127.0.0.1:1455/auth/callback?code=abc123&state=state-1"
        )

        self.assertEqual(parsed["code"], "abc123")
        self.assertEqual(parsed["state"], "state-1")
        self.assertEqual(parsed["error"], "")

    def test_parse_callback_url_extracts_error_details(self):
        parsed = parse_callback_url(
            "http://localhost:1455/auth/callback?error=access_denied&error_description=user+cancelled"
        )

        self.assertEqual(parsed["code"], "")
        self.assertEqual(parsed["error"], "access_denied")
        self.assertEqual(parsed["error_description"], "user cancelled")


if __name__ == "__main__":
    unittest.main()
