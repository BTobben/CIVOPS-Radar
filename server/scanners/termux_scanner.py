"""Termux scanner adapter stub.

This adapter documents the runtime boundary while preserving passive behavior.
"""

from __future__ import annotations

from datetime import datetime

from server.scanners.base import ScannerAdapter


class TermuxScannerAdapter(ScannerAdapter):
    def __init__(self) -> None:
        self._running = False

    def scan_once(self) -> list[dict]:
        # Placeholder for a passive Termux scan integration.
        return []

    def start_scan_loop(self) -> dict:
        self._running = True
        return {"status": "scan_started", "backend": "termux"}

    def stop_scan_loop(self) -> dict:
        self._running = False
        return {"status": "scan_stopped", "backend": "termux"}

    def health(self) -> dict:
        return {
            "backend": "termux",
            "running": self._running,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
