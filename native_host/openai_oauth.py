"""OpenAI OAuth callback exchange helpers for the native host."""

from __future__ import annotations

import base64
import json
from typing import Any
from urllib import error, parse, request


DEFAULT_OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
DEFAULT_OPENAI_OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback"
DEFAULT_OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token"


def parse_callback_url(raw_url: str) -> dict[str, str]:
    parsed = parse.urlparse(str(raw_url or "").strip())
    query = parse.parse_qs(parsed.query or "")
    return {
        "code": str((query.get("code") or [""])[0] or "").strip(),
        "state": str((query.get("state") or [""])[0] or "").strip(),
        "error": str((query.get("error") or [""])[0] or "").strip(),
        "error_description": str((query.get("error_description") or [""])[0] or "").strip(),
    }


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


def _extract_email_from_token_response(token_response: dict[str, Any]) -> str:
    id_payload = _decode_jwt_payload(str(token_response.get("id_token") or ""))
    access_payload = _decode_jwt_payload(str(token_response.get("access_token") or ""))

    candidates = [
        id_payload.get("email"),
        (id_payload.get("https://api.openai.com/profile") or {}).get("email")
        if isinstance(id_payload.get("https://api.openai.com/profile"), dict)
        else "",
        access_payload.get("email"),
        (access_payload.get("https://api.openai.com/profile") or {}).get("email")
        if isinstance(access_payload.get("https://api.openai.com/profile"), dict)
        else "",
    ]

    for candidate in candidates:
        email = str(candidate or "").strip().lower()
        if email:
            return email
    return ""


def _read_json_response(response: Any) -> dict[str, Any]:
    body = response.read()
    if not body:
        return {}
    parsed_body = json.loads(body.decode("utf-8"))
    return parsed_body if isinstance(parsed_body, dict) else {}


def exchange_callback(payload: dict[str, Any]) -> dict[str, Any]:
    callback_url = str(payload.get("callbackUrl") or payload.get("localhostUrl") or "").strip()
    expected_state = str(payload.get("expectedState") or payload.get("state") or "").strip()
    code_verifier = str(payload.get("codeVerifier") or "").strip()
    redirect_uri = str(payload.get("redirectUri") or DEFAULT_OPENAI_OAUTH_REDIRECT_URI).strip() or DEFAULT_OPENAI_OAUTH_REDIRECT_URI
    client_id = str(payload.get("clientId") or DEFAULT_OPENAI_OAUTH_CLIENT_ID).strip() or DEFAULT_OPENAI_OAUTH_CLIENT_ID
    token_url = str(payload.get("tokenUrl") or DEFAULT_OPENAI_OAUTH_TOKEN_URL).strip() or DEFAULT_OPENAI_OAUTH_TOKEN_URL

    if not callback_url:
        raise ValueError("callback url is required")
    if not code_verifier:
        raise ValueError("code verifier is required")

    callback = parse_callback_url(callback_url)
    if callback["error"]:
        detail = f": {callback['error_description']}" if callback["error_description"] else ""
        raise RuntimeError(f"oauth error: {callback['error']}{detail}")
    if not callback["code"]:
        raise ValueError("callback url missing ?code=")
    if not callback["state"]:
        raise ValueError("callback url missing ?state=")
    if expected_state and callback["state"] != expected_state:
        raise ValueError("OAuth callback state mismatch")

    form_data = parse.urlencode(
        {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": callback["code"],
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }
    ).encode("utf-8")

    req = request.Request(
        token_url,
        data=form_data,
        headers={
            "accept": "application/json",
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": "codex-oauth-automation-extension/1.0",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            token_response = _read_json_response(response)
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        message = body[:300] if body else f"HTTP {exc.code}"
        raise RuntimeError(f"oauth token exchange failed: {message}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"oauth token exchange failed: {exc.reason}") from exc

    access_token = str(token_response.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("oauth token exchange failed: missing access_token")

    return {
        "email": _extract_email_from_token_response(token_response),
        "accessToken": access_token,
        "refreshToken": str(token_response.get("refresh_token") or "").strip(),
        "idToken": str(token_response.get("id_token") or "").strip(),
        "tokenType": str(token_response.get("token_type") or "").strip(),
        "expiresIn": int(token_response.get("expires_in") or 0),
        "scope": str(token_response.get("scope") or "").strip(),
    }
