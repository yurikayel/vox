#!/usr/bin/env bash
# ==============================================================================
# update.sh — Atualização Segura do Vox Farol com Verificação de Integridade
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/vox-farol"
SERVICE_NAME="vox-farol.service"

echo "======================================================================"
echo "          Vox Farol — Atualização do Nó Comunitário                   "
echo "======================================================================"

if [[ ! -d "${TARGET_DIR}" ]]; then
    echo "[!] Erro: Diretório de destino ${TARGET_DIR} não existe. Execute install.sh primeiro."
    exit 1
fi

SUDO=""
if [[ $EUID -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "[!] Erro: Privilégios de superusuário ou 'sudo' são necessários."
        exit 1
    fi
fi

echo "[*] Verificando integridade dos arquivos fonte..."
RELAY_SRC=""
if [[ -d "${SCRIPT_DIR}/relay" ]]; then
    RELAY_SRC="${SCRIPT_DIR}/relay"
elif [[ -d "${SCRIPT_DIR}/../relay" ]]; then
    RELAY_SRC="${SCRIPT_DIR}/../relay"
else
    echo "[!] Erro: Código do relay não encontrado em ${SCRIPT_DIR}/relay nem ${SCRIPT_DIR}/../relay."
    exit 1
fi

echo "[*] Atualizando módulos do relay em ${TARGET_DIR}/relay..."
$SUDO cp -r "${RELAY_SRC}"/* "${TARGET_DIR}/relay/"
$SUDO cp "${SCRIPT_DIR}/health-check.sh" "${TARGET_DIR}/"
$SUDO chmod +x "${TARGET_DIR}/health-check.sh"

echo "[*] Reiniciando serviço systemd..."
$SUDO systemctl restart "${SERVICE_NAME}"

echo "[*] Verificando prontidão pós-atualização..."
IS_UP=false
for attempt in {1..10}; do
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        HEALTH_RESP=$(curl -s -f -m 2 "http://127.0.0.1:3921/health" 2>/dev/null || echo "")
        if [[ "${HEALTH_RESP}" == *'"status": "ok"'* || "${HEALTH_RESP}" == *'"status":"ok"'* ]]; then
            IS_UP=true
            break
        fi
    fi
    sleep 1
done

if [[ "${IS_UP}" != "true" ]]; then
    echo "[!] ERRO FATAL: Falha no reinício do Vox Farol após atualização."
    exit 1
fi

echo "[*] Executando verificação de saúde e telemetria..."
if command -v sudo >/dev/null 2>&1; then
    sudo -u vox-farol bash "${TARGET_DIR}/health-check.sh"
elif command -v runuser >/dev/null 2>&1; then
    runuser -u vox-farol -- bash "${TARGET_DIR}/health-check.sh"
else
    su -s /bin/bash vox-farol -c "bash \"${TARGET_DIR}/health-check.sh\""
fi


echo "----------------------------------------------------------------------"
echo "[+] SUCESSO: Vox Farol atualizado com sucesso!"
echo "======================================================================"
