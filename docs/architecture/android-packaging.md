# Android Shell Packaging Design (Draft)

## Stage 1 target
Ship a native Android shell app that manages permissions/lifecycle and hosts the local radar UI in a WebView.

## Responsibilities
- **Native shell (Kotlin):** permissions, foreground-service lifecycle, notifications, storage checks.
- **Local backend service:** scan ingestion + API + persistence.
- **WebView UI:** operator dashboard consuming local API only.

## Startup sequence
1. App launches and validates required permissions.
2. Native layer starts/attaches to local backend.
3. Health check succeeds (`/health` or `/api/v1/health`).
4. WebView loads local UI endpoint.
5. UI shows degraded mode if scanner adapter is unavailable.
