"""Persistence layer for scan records."""

from __future__ import annotations

import sqlite3
from typing import Any


class ScanRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def initialize(self) -> None:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                bssid TEXT NOT NULL,
                ssid TEXT,
                capabilities TEXT,
                frequency INTEGER,
                level INTEGER,
                distance REAL,
                risk_score INTEGER DEFAULT 0,
                is_hidden BOOLEAN DEFAULT 0,
                is_open BOOLEAN DEFAULT 0,
                vendor TEXT,
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                scan_count INTEGER DEFAULT 1
            )
            '''
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_bssid ON scans(bssid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON scans(timestamp)")
        conn.commit()
        conn.close()

    def latest_scans(self, limit: int = 100) -> list[dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT
                bssid, ssid, capabilities, frequency, level, distance,
                risk_score, is_hidden, is_open, vendor, first_seen, last_seen,
                scan_count, timestamp
            FROM scans s1
            WHERE timestamp = (
                SELECT MAX(timestamp)
                FROM scans s2
                WHERE s2.bssid = s1.bssid
            )
            ORDER BY timestamp DESC
            LIMIT ?
            ''',
            (limit,),
        )
        columns = [description[0] for description in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        return results

    def statistics(self) -> dict[str, int]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(DISTINCT bssid) FROM scans")
        total_networks = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM scans WHERE timestamp > datetime('now', '-5 minutes')")
        active_networks = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM scans WHERE risk_score > 50 AND timestamp > datetime('now', '-5 minutes')")
        high_risk_networks = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM scans WHERE is_open = 1 AND timestamp > datetime('now', '-5 minutes')")
        open_networks = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM scans WHERE is_hidden = 1 AND timestamp > datetime('now', '-5 minutes')")
        hidden_networks = cursor.fetchone()[0]

        conn.close()
        return {
            "total_networks": total_networks,
            "active_networks": active_networks,
            "high_risk_networks": high_risk_networks,
            "open_networks": open_networks,
            "hidden_networks": hidden_networks,
        }

    def network_details(self, bssid: str) -> dict[str, Any] | None:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT * FROM scans
            WHERE bssid = ?
            ORDER BY timestamp DESC
            LIMIT 1
            ''',
            (bssid,),
        )
        columns = [description[0] for description in cursor.description]
        result = cursor.fetchone()
        if not result:
            conn.close()
            return None

        network = dict(zip(columns, result))
        cursor.execute(
            '''
            SELECT timestamp, level, distance, risk_score
            FROM scans
            WHERE bssid = ?
            ORDER BY timestamp DESC
            LIMIT 20
            ''',
            (bssid,),
        )
        network["history"] = [
            {
                "timestamp": row[0],
                "level": row[1],
                "distance": row[2],
                "risk_score": row[3],
            }
            for row in cursor.fetchall()
        ]
        conn.close()
        return network
