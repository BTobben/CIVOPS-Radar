"""Scanner adapter factory."""

from __future__ import annotations

from server.scanners.base import ScannerAdapter
from server.scanners.mock_scanner import MockScannerAdapter
from server.scanners.termux_scanner import TermuxScannerAdapter


def build_scanner(backend: str, db_path: str) -> ScannerAdapter:
    if backend == "termux":
        return TermuxScannerAdapter(db_path=db_path)
    return MockScannerAdapter()
