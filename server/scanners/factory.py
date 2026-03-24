"""Scanner adapter factory."""

from __future__ import annotations

from server.scanners.base import ScannerAdapter
from server.scanners.mock_scanner import MockScannerAdapter
from server.scanners.termux_scanner import TermuxScannerAdapter


def build_scanner(backend: str) -> ScannerAdapter:
    if backend == "termux":
        return TermuxScannerAdapter()
    return MockScannerAdapter()
