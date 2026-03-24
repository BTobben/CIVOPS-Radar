"""Business logic for radar data and exports."""

from __future__ import annotations

import csv
import io
import json
import math
import os
from datetime import datetime
from typing import Any

from server.repositories.scan_repository import ScanRepository
from server.scanners.base import ScannerAdapter


class RadarService:
    def __init__(self, repository: ScanRepository, scanner: ScannerAdapter, export_dir: str):
        self.repository = repository
        self.scanner = scanner
        self.export_dir = export_dir

    def get_signals(self, limit: int = 50) -> list[dict[str, Any]]:
        scans = self.repository.latest_scans(limit=limit)
        output = []
        for scan in scans:
            position = self.calculate_radar_position(scan["bssid"], scan["distance"])
            output.append(
                {
                    "bssid": scan["bssid"],
                    "ssid": scan["ssid"] or "Hidden",
                    "level": scan["level"],
                    "distance": scan["distance"],
                    "risk_score": scan["risk_score"],
                    "is_hidden": scan["is_hidden"],
                    "is_open": scan["is_open"],
                    "capabilities": scan["capabilities"],
                    "frequency": scan["frequency"],
                    "vendor": scan["vendor"],
                    "last_seen": scan["last_seen"],
                    "scan_count": scan["scan_count"],
                    "position": position,
                }
            )
        return output

    def calculate_radar_position(self, bssid: str, distance: float) -> dict[str, float]:
        hash_val = hash(bssid) % 360
        angle = math.radians(hash_val)
        max_distance = 200
        normalized_distance = min((distance or 0) / max_distance, 1.0)
        radius = (1 - normalized_distance) * 0.8
        return {
            "x": radius * math.cos(angle),
            "y": radius * math.sin(angle),
            "angle": hash_val,
            "radius": radius,
        }

    def statistics(self) -> dict[str, int]:
        return self.repository.statistics()

    def network_details(self, bssid: str) -> dict[str, Any] | None:
        return self.repository.network_details(bssid)

    def start_scan(self) -> dict:
        return self.scanner.start_scan_loop()

    def stop_scan(self) -> dict:
        return self.scanner.stop_scan_loop()

    def health(self) -> dict:
        return {
            "service": "civops-radar",
            "scanner": self.scanner.health(),
            "database": {"path": self.repository.db_path},
        }

    def export_data(self, format_type: str = "json") -> dict[str, str]:
        scans = self.repository.latest_scans(limit=1000)
        if format_type == "json":
            contents = json.dumps(scans, indent=2, default=str)
        elif format_type == "csv":
            output = io.StringIO()
            if scans:
                writer = csv.DictWriter(output, fieldnames=scans[0].keys())
                writer.writeheader()
                writer.writerows(scans)
            contents = output.getvalue()
        elif format_type == "kml":
            contents = self.generate_kml(scans)
        else:
            raise ValueError(f"Unsupported format: {format_type}")

        os.makedirs(self.export_dir, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"radar_export_{timestamp}.{format_type}"
        filepath = os.path.join(self.export_dir, filename)
        with open(filepath, "w", encoding="utf-8") as handle:
            handle.write(contents)

        return {
            "filename": filename,
            "filepath": filepath,
            "format": format_type,
        }

    def generate_kml(self, scans: list[dict[str, Any]]) -> str:
        header = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n'
            '    <name>CIVOPS-Radar Scan Results</name>\n'
            '    <description>Wi-Fi network scan results</description>\n'
        )
        footer = "\n</Document>\n</kml>"
        parts = [header]
        for scan in scans:
            name = scan["ssid"] or f"Hidden Network ({scan['bssid']})"
            lat = 37.7749 + (hash(scan["bssid"]) % 1000 - 500) / 100000
            lon = -122.4194 + (hash(scan["bssid"]) % 1000 - 500) / 100000
            parts.append(
                f"""
    <Placemark>
        <name>{name}</name>
        <description>
            BSSID: {scan['bssid']}
            Signal: {scan['level']} dBm
            Risk Score: {scan['risk_score']}
            Security: {scan['capabilities']}
        </description>
        <Point>
            <coordinates>{lon},{lat},0</coordinates>
        </Point>
    </Placemark>"""
            )
        parts.append(footer)
        return "".join(parts)

    def session_contract(self) -> dict[str, Any]:
        return {
            "session_id": "pending-runtime-id",
            "observation_timestamp": datetime.utcnow().isoformat() + "Z",
            "export_manifest": {
                "path": self.export_dir,
                "items": [],
            },
            "analysis_artifacts": [
                {"type": "wifi_enrichment", "status": "placeholder"},
                {"type": "vision_analysis", "status": "placeholder"},
                {"type": "route_analysis", "status": "placeholder"},
                {"type": "sensor_fusion", "status": "placeholder"},
            ],
        }
