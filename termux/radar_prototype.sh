#!/bin/bash
# CIVOPS-Radar: Main Wi-Fi Scanning Script
# Author: CIVOPS-Radar Contributors
# License: MIT
# 
# This script performs passive Wi-Fi scanning using Termux:API
# and stores results in SQLite database for radar visualization.

set -euo pipefail

# Configuration
RADAR_DIR="/data/data/com.termux/files/home/radar"
DB_PATH="${RADAR_DIR}/data/scans.db"
SCAN_INTERVAL=5  # seconds between scans
MAX_SCANS=1000   # maximum scans to keep in database
LOG_FILE="${RADAR_DIR}/scan.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

# Check if running in Termux
check_termux() {
    if [[ ! -d "/data/data/com.termux" ]]; then
        error_exit "This script must be run in Termux environment"
    fi
}

# Check Termux:API installation
check_termux_api() {
    if ! command -v termux-wifi-scaninfo &> /dev/null; then
        error_exit "Termux:API not installed. Run: pkg install termux-api"
    fi
}

# Create radar directory structure
setup_directories() {
    log "${BLUE}Setting up radar directories...${NC}"
    mkdir -p "$RADAR_DIR"/{data,exports,samples,server}
    mkdir -p "$RADAR_DIR"/server/{templates,static}
}

# Initialize SQLite database
init_database() {
    log "${BLUE}Initializing SQLite database...${NC}"
    
    sqlite3 "$DB_PATH" << 'EOF'
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
);

CREATE INDEX IF NOT EXISTS idx_bssid ON scans(bssid);
CREATE INDEX IF NOT EXISTS idx_timestamp ON scans(timestamp);
CREATE INDEX IF NOT EXISTS idx_level ON scans(level);

-- Create view for latest scan results
CREATE VIEW IF NOT EXISTS latest_scans AS
SELECT 
    bssid,
    ssid,
    capabilities,
    frequency,
    level,
    distance,
    risk_score,
    is_hidden,
    is_open,
    vendor,
    first_seen,
    last_seen,
    scan_count,
    timestamp
FROM scans s1
WHERE timestamp = (
    SELECT MAX(timestamp) 
    FROM scans s2 
    WHERE s2.bssid = s1.bssid
);
EOF
}

# Perform single Wi-Fi scan
perform_scan() {
    local scan_output
    local payload_file

    log "${YELLOW}Performing Wi-Fi scan...${NC}"

    if ! scan_output=$(termux-wifi-scaninfo 2>/dev/null); then
        log "${RED}Failed to get scan results. This may be due to Android throttling.${NC}"
        return 1
    fi

    if [[ -z "$scan_output" ]]; then
        log "${YELLOW}No networks detected in scan.${NC}"
        return 1
    fi

    payload_file=$(mktemp)
    printf '%s\n' "$scan_output" > "$payload_file"

    if ! python3 - "$DB_PATH" "$payload_file" <<'PY'
import json
import sqlite3
import sys
from datetime import datetime


def calculate_distance(rssi, frequency=2400):
    if rssi == 0:
        return 999.0
    tx_power = 20
    path_loss = tx_power - rssi
    if path_loss <= 0:
        return 0.1
    distance = 10 ** ((path_loss - 32.45 - 20 * 3.38) / 20)
    return max(0.1, min(999.0, distance))


def calculate_risk_score(ssid, capabilities, level, is_hidden):
    score = 0
    if 'WPA' not in capabilities and 'WEP' not in capabilities:
        score += 30
    if is_hidden:
        score += 20
    if level < -80:
        score += 10
    if level > -30:
        score += 5
    return min(100, max(0, score))


def process_scan_data(db_path, payload_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        with open(payload_path, 'r', encoding='utf-8') as handle:
            scan_data = json.load(handle)
        current_time = datetime.now().isoformat()

        for network in scan_data:
            bssid = network.get('bssid', '')
            ssid = network.get('ssid', '')
            capabilities = network.get('capabilities', '')
            frequency = network.get('frequency', 0)
            level = network.get('level', -100)

            is_hidden = ssid == '' or ssid == '<unknown ssid>'
            is_open = 'WPA' not in capabilities and 'WEP' not in capabilities
            distance = calculate_distance(level, frequency)
            risk_score = calculate_risk_score(ssid, capabilities, level, is_hidden)

            cursor.execute(
                'SELECT id FROM scans WHERE bssid = ? ORDER BY timestamp DESC LIMIT 1',
                (bssid,),
            )
            existing = cursor.fetchone()

            if existing:
                cursor.execute(
                    '''
                    UPDATE scans
                    SET timestamp = ?, level = ?, distance = ?, risk_score = ?,
                        last_seen = ?, scan_count = scan_count + 1,
                        ssid = ?, capabilities = ?, frequency = ?, is_hidden = ?, is_open = ?
                    WHERE bssid = ?
                    ''',
                    (current_time, level, distance, risk_score, current_time, ssid, capabilities, frequency, is_hidden, is_open, bssid),
                )
            else:
                cursor.execute(
                    '''
                    INSERT INTO scans (bssid, ssid, capabilities, frequency, level,
                                       distance, risk_score, is_hidden, is_open,
                                       first_seen, last_seen, scan_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ''',
                    (bssid, ssid, capabilities, frequency, level, distance,
                     risk_score, is_hidden, is_open, current_time, current_time),
                )

        conn.commit()
        print(f'Processed {len(scan_data)} networks')
        return 0
    except json.JSONDecodeError as exc:
        print(f'JSON decode error: {exc}')
        return 1
    except Exception as exc:
        print(f'Error processing scan data: {exc}')
        return 1
    finally:
        conn.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python ingest.py <db_path> <payload_file>')
        sys.exit(1)
    sys.exit(process_scan_data(sys.argv[1], sys.argv[2]))
PY
    then
        rm -f "$payload_file"
        log "${RED}Failed to process scan data${NC}"
        return 1
    fi

    rm -f "$payload_file"
    log "${GREEN}Scan completed successfully${NC}"
    return 0
}

# Clean old scans to prevent database bloat
cleanup_old_scans() {
    log "${BLUE}Cleaning up old scans...${NC}"
    sqlite3 "$DB_PATH" "DELETE FROM scans WHERE timestamp < datetime('now', '-1 hour') AND scan_count > 10;"
    sqlite3 "$DB_PATH" "VACUUM;"
}

# Display current scan statistics
show_stats() {
    local total_networks
    local active_networks
    local high_risk_networks
    
    total_networks=$(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT bssid) FROM scans;")
    active_networks=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM latest_scans;")
    high_risk_networks=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM latest_scans WHERE risk_score > 50;")
    
    log "${GREEN}=== Scan Statistics ===${NC}"
    log "Total networks discovered: $total_networks"
    log "Currently active: $active_networks"
    log "High risk networks: $high_risk_networks"
}

# Main scanning loop
scan_loop() {
    local scan_count=0
    
    log "${GREEN}Starting CIVOPS-Radar scanning loop...${NC}"
    log "Scan interval: ${SCAN_INTERVAL} seconds"
    log "Press Ctrl+C to stop"
    
    while true; do
        scan_count=$((scan_count + 1))
        log "${BLUE}=== Scan #$scan_count ===${NC}"
        
        if perform_scan; then
            show_stats
        else
            log "${YELLOW}Scan failed, retrying in ${SCAN_INTERVAL} seconds...${NC}"
        fi
        
        # Cleanup every 10 scans
        if ((scan_count % 10 == 0)); then
            cleanup_old_scans
        fi
        
        sleep "$SCAN_INTERVAL"
    done
}

# Export scan data
export_data() {
    local format="${1:-json}"
    local output_file="${RADAR_DIR}/exports/scan_export_$(date +%Y%m%d_%H%M%S).${format}"
    
    case "$format" in
        json)
            sqlite3 -json "$DB_PATH" "SELECT * FROM latest_scans;" > "$output_file"
            ;;
        csv)
            sqlite3 -header -csv "$DB_PATH" "SELECT * FROM latest_scans;" > "$output_file"
            ;;
        *)
            log "${RED}Unsupported format: $format${NC}"
            return 1
            ;;
    esac
    
    log "${GREEN}Data exported to: $output_file${NC}"
}

# Main function
main() {
    log "${GREEN}=== CIVOPS-Radar Scanner ===${NC}"
    log "Initializing Wi-Fi scanning system..."
    
    # Pre-flight checks
    check_termux
    check_termux_api
    
    # Setup
    setup_directories
    init_database
    
    # Handle command line arguments
    case "${1:-scan}" in
        scan)
            scan_loop
            ;;
        export)
            export_data "${2:-json}"
            ;;
        stats)
            show_stats
            ;;
        init)
            log "${GREEN}Database initialized successfully${NC}"
            ;;
        *)
            echo "Usage: $0 {scan|export|stats|init}"
            echo "  scan   - Start continuous scanning (default)"
            echo "  export - Export data (json|csv)"
            echo "  stats  - Show current statistics"
            echo "  init   - Initialize database only"
            exit 1
            ;;
    esac
}

# Trap Ctrl+C for graceful shutdown
trap 'log "${YELLOW}Shutting down CIVOPS-Radar...${NC}"; exit 0' INT

# Run main function
main "$@"
