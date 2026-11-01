#!/usr/bin/env bash
# ==============================================================================
# uninstall.sh — Desinstalador Limpo do Vox Farol
# ==============================================================================
set -euo pipefail

TARGET_DIR="/opt/vox-farol"
SERVICE_NAME="vox-farol.service"
TIMER_NAME="vox-farol-health.timer"
HEALTH_SERVICE="vox-farol-health.service"
USER_NAME="vox-farol"

echo "======================================================================"
echo "          Vox Farol — Desinstalação do Nó Comunitário                 "
echo "======================================================================"
echo "Este script removerá o serviço systemd, temporizador e os binários do Vox Farol."
echo "----------------------------------------------------------------------"

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Tem certeza que deseja desinstalar o Vox Farol deste sistema? [s/N]: " CONFIRM
    if [[ "${CONFIRM}" != "s" && "${CONFIRM}" != "S" && "${CONFIRM}" != "sim" ]]; then
        echo "[-] Desinstalação cancelada pelo operador."
        exit 0
    fi
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

echo "[*] Parando e desativando temporizador de saúde..."
if systemctl is-active --quiet "${TIMER_NAME}" 2>/dev/null; then
    $SUDO systemctl stop "${TIMER_NAME}" || true
fi
if systemctl is-enabled --quiet "${TIMER_NAME}" 2>/dev/null; then
    $SUDO systemctl disable "${TIMER_NAME}" || true
fi

echo "[*] Parando e desativando serviço principal..."
if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    $SUDO systemctl stop "${SERVICE_NAME}" || true
fi
if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
    $SUDO systemctl disable "${SERVICE_NAME}" || true
fi

echo "[*] Removendo arquivos de unidades systemd..."
$SUDO rm -f "/etc/systemd/system/${TIMER_NAME}"
$SUDO rm -f "/etc/systemd/system/${HEALTH_SERVICE}"
$SUDO rm -f "/etc/systemd/system/${SERVICE_NAME}"
$SUDO systemctl daemon-reload

echo "[*] Removendo diretório de instalação (${TARGET_DIR})..."
$SUDO rm -rf "${TARGET_DIR}"

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Deseja remover também os dados de cache (/var/lib/vox-farol) e logs? [s/N]: " PURGE_DATA
    if [[ "${PURGE_DATA}" == "s" || "${PURGE_DATA}" == "S" || "${PURGE_DATA}" == "sim" ]]; then
        echo "[*] Purgando /var/lib/vox-farol e /var/log/vox-farol..."
        $SUDO rm -rf /var/lib/vox-farol
        $SUDO rm -rf /var/log/vox-farol
    fi
fi

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO: Vox Farol foi desinstalado com sucesso do sistema."
echo "======================================================================"
