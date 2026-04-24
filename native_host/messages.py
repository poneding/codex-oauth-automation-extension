"""Chrome Native Messaging framing helpers."""

from __future__ import annotations

import json
import struct
import sys
from typing import Any


def read_message() -> dict[str, Any] | None:
    """Read one Chrome Native Messaging JSON payload from stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
      return None
    if len(raw_length) != 4:
      raise RuntimeError("Invalid native message length prefix")

    message_length = struct.unpack("<I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
      raise RuntimeError("Incomplete native message payload")

    try:
      decoded = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
      raise RuntimeError(f"Invalid native message JSON: {exc}") from exc

    return decoded if isinstance(decoded, dict) else {}


def write_message(message: dict[str, Any]) -> None:
    """Write one JSON payload to stdout using Chrome Native Messaging framing."""
    encoded = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()
