"""Runtime configuration for CIVOPS-Radar."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RadarConfig:
    radar_dir: str
    db_path: str
    export_dir: str
    scanner_backend: str


DEFAULT_RADAR_DIR = "/data/data/com.termux/files/home/radar"


def load_config() -> RadarConfig:
    radar_dir = os.getenv("RADAR_DIR", DEFAULT_RADAR_DIR)
    db_path = os.getenv("RADAR_DB_PATH", os.path.join(radar_dir, "data", "scans.db"))
    export_dir = os.getenv("RADAR_EXPORT_DIR", os.path.join(radar_dir, "exports"))
    scanner_backend = os.getenv("RADAR_SCANNER_BACKEND", "termux").lower()

    return RadarConfig(
        radar_dir=radar_dir,
        db_path=db_path,
        export_dir=export_dir,
        scanner_backend=scanner_backend,
    )
