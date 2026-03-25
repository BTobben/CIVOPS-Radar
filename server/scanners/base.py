"""Scanner adapter interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod


class ScannerAdapter(ABC):
    @abstractmethod
    def scan_once(self) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    def start_scan_loop(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def stop_scan_loop(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> dict:
        raise NotImplementedError
