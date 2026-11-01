#!/usr/bin/env bash
# ==============================================================================
# health-check.sh — Verificação de Saúde e Telemetria Local do Vox Farol
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS_FILE="${SCRIPT_DIR}/monitoring/status.json"
CONFIG_FILE="${SCRIPT_DIR}/config/farol.json"

read_temperature() {
    if [[ -f "/sys/class/thermal/thermal_zone0/temp" ]]; then
        local raw
        raw=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "0")
        echo "$((raw / 1000))"
    elif command -v vcgencmd >/dev/null 2>&1; then
        vcgencmd measure_temp 2>/dev/null | tr -cd '0-9.' | cut -d. -f1 || echo "null"
    else
        echo "null"
    fi
}

read_ram_mb() {
    free -m 2>/dev/null | awk '/^Mem:/ {print $3}' || echo "0"
}

read_cpu_percent() {
    top -bn1 2>/dev/null | awk -F',' '/Cpu\(s\):/ {print $1}' | awk '{print $2}' || echo "0.0"
}

check_service_alive() {
    local port="${1:-3921}"
    if command -v curl >/dev/null 2>&1; then
        curl -s -f -m 3 "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && echo "true" || echo "false"
    else
        nc -z 127.0.0.1 "${port}" >/dev/null 2>&1 && echo "true" || echo "false"
    fi
}

main() {
    local port="3921"
    if [[ -f "${CONFIG_FILE}" ]] && command -v grep >/dev/null 2>&1; then
        local parsed_port
        parsed_port=$(grep -o '"listenPort":[[:space:]]*[0-9]*' "${CONFIG_FILE}" | grep -o '[0-9]*' || true)
        if [[ -n "${parsed_port}" ]]; then
            port="${parsed_port}"
        fi
    fi

    local temp ram cpu alive now
    temp=$(read_temperature)
    ram=$(read_ram_mb)
    cpu=$(read_cpu_percent)
    alive=$(check_service_alive "${port}")
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$(dirname "${STATUS_FILE}")"
    cat <<EOF > "${STATUS_FILE}.tmp"
{
  "nodeStatus": "$([[ "${alive}" == "true" ]] && echo "healthy" || echo "degraded")",
  "version": "0.1.0",
  "updatedAt": "${now}",
  "system": {
    "cpuPercent": ${cpu:-0.0},
    "ramUsageMb": ${ram:-0},
    "temperatureC": ${temp},
    "storageUsedMb": 0,
    "storageAvailableMb": 2048
  },
  "network": {
    "lanPeersCount": 0,
    "signalingReachable": true,
    "lastHealthCheck": "${now}"
  },
  "services": {
    "relayRunning": ${alive},
    "seederActive": ${alive}
  }
}
EOF
    mv -f "${STATUS_FILE}.tmp" "${STATUS_FILE}"
    echo "[+] Vox Farol health check completed: status=$([[ "${alive}" == "true" ]] && echo "OK" || echo "DEGRADED") (port ${port})"
}

main "$@"
