#!/usr/bin/env bash
# ==============================================================================
# install.sh — Instalador Automatizado do Vox Farol para Linux (Raspberry Pi/x86)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/vox-farol"
SERVICE_NAME="vox-farol.service"
USER_NAME="vox-farol"

echo "======================================================================"
echo "          Vox Farol — Instalador do Nó Comunitário Autônomo           "
echo "======================================================================"
echo "Este script instalará o Vox Farol como serviço systemd de baixo consumo."
echo "Destino da instalação: ${TARGET_DIR}"
echo "Usuário do serviço:    ${USER_NAME} (sem privilégios administrativos)"
echo "Porta padrão:          127.0.0.1:3921 (sem portas abertas na WAN)"
echo "----------------------------------------------------------------------"

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Deseja prosseguir com a instalação do Vox Farol? [s/N]: " CONFIRM
    if [[ "${CONFIRM}" != "s" && "${CONFIRM}" != "S" && "${CONFIRM}" != "sim" ]]; then
        echo "[-] Instalação cancelada pelo operador."
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

echo "[*] Criando usuário de sistema '${USER_NAME}' (sem privilégios)..."
if ! id -u "${USER_NAME}" >/dev/null 2>&1; then
    $SUDO useradd -r -s /usr/sbin/nologin -d /var/lib/vox-farol -M "${USER_NAME}" 2>/dev/null || \
    $SUDO adduser --system --no-create-home --group "${USER_NAME}"
fi

echo "[*] Preparando diretórios de dados e logs..."
$SUDO mkdir -p /var/lib/vox-farol/cache
$SUDO mkdir -p /var/log/vox-farol
$SUDO mkdir -p "${TARGET_DIR}/monitoring"
$SUDO mkdir -p "${TARGET_DIR}/config"

echo "[*] Copiando arquivos do serviço e relay Python..."
$SUDO cp -r "${SCRIPT_DIR}/../relay" "${TARGET_DIR}/"
$SUDO cp "${SCRIPT_DIR}/config/farol.json" "${TARGET_DIR}/config/"
$SUDO cp "${SCRIPT_DIR}/monitoring/status.json" "${TARGET_DIR}/monitoring/"
$SUDO cp "${SCRIPT_DIR}/health-check.sh" "${TARGET_DIR}/"
$SUDO chmod +x "${TARGET_DIR}/health-check.sh"

echo "[*] Ajustando permissões de propriedade..."
$SUDO chown -R "${USER_NAME}:${USER_NAME}" /var/lib/vox-farol
$SUDO chown -R "${USER_NAME}:${USER_NAME}" /var/log/vox-farol
$SUDO chown -R "${USER_NAME}:${USER_NAME}" "${TARGET_DIR}"

echo "[*] Instalando serviço systemd..."
$SUDO cp "${SCRIPT_DIR}/systemd/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
$SUDO systemctl daemon-reload
$SUDO systemctl enable "${SERVICE_NAME}"
$SUDO systemctl restart "${SERVICE_NAME}"

echo "[*] Executando verificação de saúde inicial..."
sleep 2
$SUDO -u "${USER_NAME}" bash "${TARGET_DIR}/health-check.sh" || true

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO: Vox Farol instalado e ativo via systemd!"
echo "Status do serviço: systemctl status ${SERVICE_NAME}"
echo "Verificação de saúde: ${TARGET_DIR}/health-check.sh"
echo "Arquivo de telemetria: ${TARGET_DIR}/monitoring/status.json"
echo "======================================================================"
