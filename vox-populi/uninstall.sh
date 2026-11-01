#!/usr/bin/env bash
# ==============================================================================
# uninstall.sh — Desinstalador Limpo do Vox Populi
# ==============================================================================
set -euo pipefail

TARGET_DIR="/opt/vox-populi"
SERVICE_NAME="vox-populi.service"
TIMER_NAME="vox-populi-health.timer"
HEALTH_SERVICE="vox-populi-health.service"
USER_NAME="vox-populi"
LEGACY_SERVICE_NAME="vox-farol.service"
LEGACY_TIMER_NAME="vox-farol-health.timer"
LEGACY_HEALTH_SERVICE="vox-farol-health.service"

echo "======================================================================"
echo "          Vox Populi — Desinstalação do Nó Comunitário                 "
echo "======================================================================"
echo "Este script removerá o serviço systemd, temporizador e os binários do Vox Populi."
echo "----------------------------------------------------------------------"

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Tem certeza que deseja desinstalar o Vox Populi deste sistema? [s/N]: " CONFIRM
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
for timer in "${TIMER_NAME}" "${LEGACY_TIMER_NAME}"; do
    if systemctl is-active --quiet "${timer}" 2>/dev/null; then
        $SUDO systemctl stop "${timer}" || true
    fi
    if systemctl is-enabled --quiet "${timer}" 2>/dev/null; then
        $SUDO systemctl disable "${timer}" || true
    fi
done

echo "[*] Parando e desativando serviço principal..."
for service in "${SERVICE_NAME}" "${LEGACY_SERVICE_NAME}"; do
    if systemctl is-active --quiet "${service}" 2>/dev/null; then
        $SUDO systemctl stop "${service}" || true
    fi
    if systemctl is-enabled --quiet "${service}" 2>/dev/null; then
        $SUDO systemctl disable "${service}" || true
    fi
done

echo "[*] Removendo arquivos de unidades systemd..."
$SUDO rm -f "/etc/systemd/system/${TIMER_NAME}"
$SUDO rm -f "/etc/systemd/system/${HEALTH_SERVICE}"
$SUDO rm -f "/etc/systemd/system/${SERVICE_NAME}"
$SUDO rm -f "/etc/systemd/system/${LEGACY_TIMER_NAME}"
$SUDO rm -f "/etc/systemd/system/${LEGACY_HEALTH_SERVICE}"
$SUDO rm -f "/etc/systemd/system/${LEGACY_SERVICE_NAME}"
$SUDO systemctl daemon-reload

echo "[*] Removendo diretório de instalação (${TARGET_DIR})..."
$SUDO rm -rf "${TARGET_DIR}"
$SUDO rm -rf /opt/vox-farol

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Deseja remover também os dados de cache e logs do Vox Populi? [s/N]: " PURGE_DATA
    if [[ "${PURGE_DATA}" == "s" || "${PURGE_DATA}" == "S" || "${PURGE_DATA}" == "sim" ]]; then
        echo "[*] Purgando /var/lib/vox-populi e /var/log/vox-populi..."
        $SUDO rm -rf /var/lib/vox-populi
        $SUDO rm -rf /var/log/vox-populi
        $SUDO rm -rf /var/lib/vox-farol
        $SUDO rm -rf /var/log/vox-farol
    fi
fi

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO: Vox Populi foi desinstalado com sucesso do sistema."
echo "======================================================================"
