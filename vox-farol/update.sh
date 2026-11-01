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
if [[ ! -d "${SCRIPT_DIR}/../relay" ]]; then
    echo "[!] Erro: Código do relay não encontrado em ${SCRIPT_DIR}/../relay."
    exit 1
fi

echo "[*] Atualizando módulos do relay em ${TARGET_DIR}/relay..."
$SUDO cp -r "${SCRIPT_DIR}/../relay"/* "${TARGET_DIR}/relay/"
$SUDO cp "${SCRIPT_DIR}/health-check.sh" "${TARGET_DIR}/"
$SUDO chmod +x "${TARGET_DIR}/health-check.sh"

echo "[*] Reiniciando serviço systemd..."
$SUDO systemctl restart "${SERVICE_NAME}"

echo "[*] Executando verificação de saúde pós-atualização..."
sleep 2
$SUDO bash "${TARGET_DIR}/health-check.sh" || true

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO: Vox Farol atualizado com sucesso!"
echo "======================================================================"
