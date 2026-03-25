"""API response envelope helpers."""

from __future__ import annotations

from datetime import datetime

API_VERSION = "v1"


def _timestamp() -> str:
    return datetime.utcnow().isoformat() + "Z"


def success(data: dict | list, message: str | None = None) -> dict:
    payload = {
        "version": API_VERSION,
        "timestamp": _timestamp(),
        "ok": True,
        "data": data,
    }
    if message:
        payload["message"] = message
    return payload


def error(code: str, message: str, status: int = 400, details: dict | None = None) -> tuple[dict, int]:
    payload = {
        "version": API_VERSION,
        "timestamp": _timestamp(),
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if details:
        payload["error"]["details"] = details
    return payload, status
