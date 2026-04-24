"""Local native host entrypoint for the extension."""

from __future__ import annotations

import os
import sys
from typing import Any, Callable

try:  # pragma: no cover - import resolution differs between direct script and package tests
    from .cpa_upload import upload_auth_file
    from .gmail_imap import test_connection, wait_for_verification_code
    from .messages import read_message, write_message
    from .openai_oauth import exchange_callback
except ImportError:  # pragma: no cover - runtime fallback for direct execution
    from cpa_upload import upload_auth_file
    from gmail_imap import test_connection, wait_for_verification_code
    from messages import read_message, write_message
    from openai_oauth import exchange_callback


Handler = Callable[[dict[str, Any]], dict[str, Any]]


def _not_configured_handler(_payload: dict[str, Any]) -> dict[str, Any]:
    return {"status": "not_configured"}


def configure_stdio_binary_mode(
    *,
    stdin: Any | None = None,
    stdout: Any | None = None,
    os_module: Any = os,
    msvcrt_module: Any | None = None,
) -> None:
    if getattr(os_module, "name", "") != "nt":
        return

    if msvcrt_module is None:
        try:
            import msvcrt as imported_msvcrt
        except ImportError:  # pragma: no cover - defensive Windows import path
            return
        msvcrt_module = imported_msvcrt

    binary_flag = getattr(os_module, "O_BINARY", None)
    if binary_flag is None:
        return

    for stream in (stdin or sys.stdin, stdout or sys.stdout):
        try:
            file_descriptor = stream.fileno()
        except (AttributeError, OSError, ValueError):
            continue
        msvcrt_module.setmode(file_descriptor, binary_flag)


def build_command_handlers() -> dict[str, Handler]:
    return {
        "gmail.testConnection": test_connection,
        "gmail.waitForVerificationCode": wait_for_verification_code,
        "oauth.exchangeCallback": exchange_callback,
        "cpa.uploadAuthFile": upload_auth_file,
    }


def handle_request(message: dict[str, Any], handlers: dict[str, Handler] | None = None) -> dict[str, Any]:
    handlers = handlers or build_command_handlers()
    command = str(message.get("command") or "").strip()
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}
    if not command:
        return {"ok": False, "error": "Missing command"}
    handler = handlers.get(command)
    if handler is None:
        return {"ok": False, "error": f"Unsupported command: {command}"}
    try:
        return {"ok": True, "result": handler(payload)}
    except Exception as exc:  # pragma: no cover - defensive runtime path
        return {"ok": False, "error": str(exc)}


def main() -> None:
    configure_stdio_binary_mode()
    handlers = build_command_handlers()
    while True:
        message = read_message()
        if message is None:
            break
        write_message(handle_request(message, handlers=handlers))


if __name__ == "__main__":
    main()
