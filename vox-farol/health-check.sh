#!/usr/bin/env bash
# ==============================================================================
# health-check.sh — Verificação de Saúde e Telemetria Local Honesta do Vox Farol
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
    if command -v free >/dev/null 2>&1; then
        free -m 2>/dev/null | awk '/^Mem:/ {print $3}' || echo "0"
    elif [[ -f "/proc/meminfo" ]]; then
        local total avail
        total=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
        avail=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
        echo "$(((total - avail) / 1024))"
    else
        echo "0"
    fi
}

read_cpu_percent() {
    if command -v top >/dev/null 2>&1; then
        top -bn1 2>/dev/null | awk -F',' '/Cpu\(s\):/ {print $1}' | awk '{print $2}' || echo "0.0"
    else
        echo "0.0"
    fi
}

read_storage_metrics() {
    local cache_dir="${1:-/var/lib/vox-farol/cache}"
    local used_mb=0
    local avail_mb=0

    if [[ -d "${cache_dir}" ]]; then
        used_mb=$(du -sm "${cache_dir}" 2>/dev/null | awk '{print $1}' || echo "0")
        avail_mb=$(df -m "${cache_dir}" 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
    elif [[ -d "$(dirname "${cache_dir}")" ]]; then
        avail_mb=$(df -m "$(dirname "${cache_dir}")" 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
    fi

    echo "${used_mb} ${avail_mb}"
}

check_gateway_connectivity() {
    if command -v curl >/dev/null 2>&1; then
        # Testa conectividade com upstream arweave.net ou turbo-gateway
        if curl -s -f -m 3 "https://arweave.net/health" >/dev/null 2>&1 || \
           curl -s -f -m 3 "https://turbo-gateway.com/health" >/dev/null 2>&1 || \
           curl -s -f -m 3 -I "https://arweave.net" >/dev/null 2>&1; then
            echo "true"
        else
            echo "false"
        fi
    else
        echo "unknown"
    fi
}

check_relay_health() {
    local port="${1:-3921}"
    if command -v curl >/dev/null 2>&1; then
        local body
        body=$(curl -s -f -m 3 "http://127.0.0.1:${port}/health" 2>/dev/null || echo "")
        if [[ "${body}" == *'"status": "ok"'* || "${body}" == *'"status":"ok"'* ]]; then
            echo "true"
        else
            echo "false"
        fi
    else
        nc -z 127.0.0.1 "${port}" >/dev/null 2>&1 && echo "true" || echo "false"
    fi
}

main() {
    local port="3921"
    local cache_dir="/var/lib/vox-farol/cache"

    if [[ -f "${CONFIG_FILE}" ]] && command -v grep >/dev/null 2>&1; then
        local parsed_port parsed_dir
        parsed_port=$(grep -o '"listenPort":[[:space:]]*[0-9]*' "${CONFIG_FILE}" | grep -o '[0-9]*' || true)
        if [[ -n "${parsed_port}" ]]; then
            port="${parsed_port}"
        fi
        parsed_dir=$(grep -o '"cacheDir":[[:space:]]*"[^"]*"' "${CONFIG_FILE}" | cut -d'"' -f4 || true)
        if [[ -n "${parsed_dir}" ]]; then
            cache_dir="${parsed_dir}"
        fi
    fi

    local temp ram cpu relay_alive gw_reach now storage_info used_mb avail_mb node_status
    temp=$(read_temperature)
    ram=$(read_ram_mb)
    cpu=$(read_cpu_percent)
    relay_alive=$(check_relay_health "${port}")
    gw_reach=$(check_gateway_connectivity)
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    storage_info=$(read_storage_metrics "${cache_dir}")
    used_mb=$(echo "${storage_info}" | awk '{print $1}')
    avail_mb=$(echo "${storage_info}" | awk '{print $2}')

    if [[ "${relay_alive}" == "true" ]]; then
        node_status="operational_relay_only"
    else
        node_status="degraded"
    fi

    mkdir -p "$(dirname "${STATUS_FILE}")"
    cat <<EOF > "${STATUS_FILE}.tmp"
{
  "nodeStatus": "${node_status}",
  "version": "0.1.1",
  "updatedAt": "${now}",
  "system": {
    "cpuPercent": ${cpu:-0.0},
    "ramUsageMb": ${ram:-0},
    "temperatureC": ${temp},
    "storageUsedMb": ${used_mb:-0},
    "storageAvailableMb": ${avail_mb:-0}
  },
  "network": {
    "lanPeersCount": 0,
    "upstreamGatewayReachable": ${gw_reach},
    "signalingReachable": "unknown",
    "lastHealthCheck": "${now}"
  },
  "services": {
    "relayRunning": ${relay_alive},
    "seederActive": false,
    "seederStatus": "not_implemented"
  }
}
EOF
    mv -f "${STATUS_FILE}.tmp" "${STATUS_FILE}"
    echo "[+] Vox Farol health check completed: status=${node_status} (relayRunning=${relay_alive}, cacheUsed=${used_mb}MB)"
}

main "$@"
