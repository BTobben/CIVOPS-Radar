"""Mock scanner adapter for development and UI testing."""

from __future__ import annotations

from datetime import datetime

from server.scanners.base import ScannerAdapter


class MockScannerAdapter(ScannerAdapter):
    def __init__(self) -> None:
        self._running = False

    def scan_once(self) -> list[dict]:
        return []

    def start_scan_loop(self) -> dict:
        self._running = True
        return {"status": "scan_started", "backend": "mock"}

    def stop_scan_loop(self) -> dict:
        self._running = False
        return {"status": "scan_stopped", "backend": "mock"}

    def health(self) -> dict:
        return {
            "backend": "mock",
            "running": self._running,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
