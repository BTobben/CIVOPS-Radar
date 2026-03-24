# Scanner Abstraction Contract (Draft)

## Goal
Decouple scan collection from Termux-specific shell assumptions.

## Interface
```python
class ScannerAdapter:
    def scan_once(self) -> list[dict]: ...
    def start_scan_loop(self, interval_seconds: int = 3) -> None: ...
    def stop_scan_loop(self) -> None: ...
    def health(self) -> dict: ...
```

## Notes
- Keep adapter passive (no active injection/deauth operations).
- Preserve current Termux implementation as one concrete adapter.
- Add a mock adapter for UI and API tests.
