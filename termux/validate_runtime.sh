#!/bin/bash
# CIVOPS-Radar runtime validation helper
set -euo pipefail

RADAR_DIR="/data/data/com.termux/files/home/radar"

cd "$RADAR_DIR"

echo "[CHECK] backend process"
pgrep -af "server.app" >/dev/null && echo "[PASS] backend process running" || echo "[FAIL] backend process not running"

echo "[CHECK] scanner process"
pgrep -af "radar_prototype.sh scan" >/dev/null && echo "[PASS] scanner process running" || echo "[FAIL] scanner process not running"

echo "[CHECK] /api/v1/health"
curl -sf http://127.0.0.1:5000/api/v1/health && echo

echo "[CHECK] /api/v1/statistics"
curl -sf http://127.0.0.1:5000/api/v1/statistics && echo

echo "[CHECK] /api/v1/signals"
curl -sf http://127.0.0.1:5000/api/v1/signals && echo

echo "[INFO] server.log tail"
tail -n 20 server.log 2>/dev/null || true

echo "[INFO] scanner.log tail"
tail -n 20 scanner.log 2>/dev/null || true
