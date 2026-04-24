import base64
import json
import unittest

from native_host.cpa_upload import build_auth_file_payload, normalize_cpa_api_url


def encode_jwt(payload):
    header = {"alg": "RS256", "typ": "JWT"}

    def encode_part(data):
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{encode_part(header)}.{encode_part(payload)}.signature"


class CpaUploadTests(unittest.TestCase):
    def test_normalize_cpa_api_url_strips_management_route(self):
        self.assertEqual(
            normalize_cpa_api_url("http://127.0.0.1:8317/management.html#/oauth"),
            "http://127.0.0.1:8317",
        )

    def test_build_auth_file_payload_uses_token_claims(self):
        access_token = encode_jwt(
            {
                "exp": 1760000000,
                "https://api.openai.com/auth": {
                    "chatgpt_account_id": "account-1",
                    "chatgpt_user_id": "user-1",
                },
            }
        )

        payload = build_auth_file_payload(
            {
                "accountEmail": "user@example.com",
                "accessToken": access_token,
                "refreshToken": "refresh-token",
                "idToken": "id-token",
            }
        )

        self.assertEqual(payload["type"], "codex")
        self.assertEqual(payload["email"], "user@example.com")
        self.assertEqual(payload["account_id"], "account-1")
        self.assertEqual(payload["access_token"], access_token)
        self.assertEqual(payload["refresh_token"], "refresh-token")
        self.assertEqual(payload["id_token"], "id-token")


if __name__ == "__main__":
    unittest.main()
