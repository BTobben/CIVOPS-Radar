# Local API v1 Contract (Draft)

## Versioned namespace
All new endpoints should be exposed under `/api/v1/...` while preserving legacy routes during migration.

## Core resources
- `GET /api/v1/signals`
- `GET /api/v1/statistics`
- `GET /api/v1/networks/{bssid}`
- `POST /api/v1/scan/start`
- `POST /api/v1/scan/stop`
- `GET /api/v1/export/{format}`

## Design rules
- Stable JSON envelopes with explicit `version`, `timestamp`, and `data` fields.
- No UI-only fields in API models.
- Add schema validation at route boundaries.
