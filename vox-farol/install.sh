#!/usr/bin/env bash
# ==============================================================================
# install.sh — Instalador Automatizado e Verificável do Vox Farol para Linux
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/vox-farol"
SERVICE_NAME="vox-farol.service"
TIMER_NAME="vox-farol-health.timer"
HEALTH_SERVICE="vox-farol-health.service"
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

echo "[*] Instalando unidades systemd (serviço e temporizador de saúde)..."
$SUDO cp "${SCRIPT_DIR}/systemd/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
$SUDO cp "${SCRIPT_DIR}/systemd/${HEALTH_SERVICE}" "/etc/systemd/system/${HEALTH_SERVICE}"
$SUDO cp "${SCRIPT_DIR}/systemd/${TIMER_NAME}" "/etc/systemd/system/${TIMER_NAME}"

$SUDO systemctl daemon-reload
$SUDO systemctl enable "${SERVICE_NAME}"
$SUDO systemctl restart "${SERVICE_NAME}"
$SUDO systemctl enable "${TIMER_NAME}"
$SUDO systemctl restart "${TIMER_NAME}"

echo "[*] Verificando inicialização obrigatória do serviço..."
IS_OPERATIONAL=false
for attempt in {1..10}; do
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        HEALTH_RESP=""
        if command -v curl >/dev/null 2>&1; then
            HEALTH_RESP=$(curl -s -f -m 2 "http://127.0.0.1:3921/health" 2>/dev/null || echo "")
        fi
        if [[ "${HEALTH_RESP}" == *'"status": "ok"'* || "${HEALTH_RESP}" == *'"status":"ok"'* ]]; then
            IS_OPERATIONAL=true
            echo "[+] Serviço ativo e endpoint /health verificado com sucesso na tentativa ${attempt}."
            break
        fi
    fi
    sleep 1
done

if [[ "${IS_OPERATIONAL}" != "true" ]]; then
    echo "[!] ERRO FATAL: O serviço Vox Farol falhou na verificação de inicialização."
    echo "[!] Verificando status do systemd:"
    systemctl status "${SERVICE_NAME}" --no-pager || true
    echo "[!] Últimos logs de erro (journalctl):"
    journalctl -u "${SERVICE_NAME}" -n 25 --no-pager || true
    exit 1
fi

echo "[*] Executando verificação de saúde inicial e gerando telemetria..."
$SUDO -u "${USER_NAME}" bash "${TARGET_DIR}/health-check.sh"

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO COMPROVADO: Vox Farol instalado, ativo e validado via systemd!"
echo "Status do serviço:     systemctl status ${SERVICE_NAME}"
echo "Temporizador de saúde: systemctl status ${TIMER_NAME}"
echo "Verificação manual:    ${TARGET_DIR}/health-check.sh"
echo "Telemetria local:      ${TARGET_DIR}/monitoring/status.json"
echo "======================================================================"
