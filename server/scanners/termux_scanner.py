"""Termux scanner adapter for transitional external-producer mode.

Runtime model: the Termux shell scanner remains the producer that writes the SQLite DB.
This adapter reports readiness/freshness and provides compatibility start/stop responses.
"""

from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime, timezone

from server.scanners.base import ScannerAdapter


class TermuxScannerAdapter(ScannerAdapter):
    def __init__(self, db_path: str) -> None:
        self._running = False
        self.db_path = db_path

    def scan_once(self) -> list[dict]:
        # Transitional mode: shell producer owns actual scan ingestion.
        return []

    def start_scan_loop(self) -> dict:
        self._running = True
        return {
            "status": "scan_started",
            "backend": "termux",
            "mode": "external_scanner_producer",
            "note": "Start termux/radar_prototype.sh scan to generate live scan rows.",
        }

    def stop_scan_loop(self) -> dict:
        self._running = False
        return {
            "status": "scan_stopped",
            "backend": "termux",
            "mode": "external_scanner_producer",
        }

    def health(self) -> dict:
        termux_api_available = shutil.which("termux-wifi-scaninfo") is not None
        latest_scan_time = None
        latest_scan_age_seconds = None
        db_ready = False

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(timestamp) FROM scans")
            row = cursor.fetchone()
            conn.close()
            db_ready = True

            if row and row[0]:
                latest_scan_time = row[0]
                raw = str(row[0]).strip()
                parsed = None

                # SQLite defaults are often naive local timestamps like "YYYY-MM-DD HH:MM:SS".
                try:
                    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                except ValueError:
                    parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")

                if parsed.tzinfo is None:
                    age_delta = datetime.now() - parsed
                else:
                    age_delta = datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)

                latest_scan_age_seconds = max(0, int(age_delta.total_seconds()))
        except Exception:
            db_ready = False

        scanner_ready = bool(termux_api_available and db_ready)
        scanner_live = latest_scan_age_seconds is not None and latest_scan_age_seconds <= 30

        return {
            "backend": "termux",
            "mode": "external_scanner_producer",
            "running": self._running,
            "termux_api_available": termux_api_available,
            "db_ready": db_ready,
            "scanner_ready": scanner_ready,
            "scanner_live": scanner_live,
            "latest_scan_timestamp": latest_scan_time,
            "latest_scan_age_seconds": latest_scan_age_seconds,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
