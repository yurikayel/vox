#!/usr/bin/env bash
# ==============================================================================
# install.sh — Instalador Automatizado e Verificável do Vox Populi para Linux
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/vox-populi"
SERVICE_NAME="vox-populi.service"
TIMER_NAME="vox-populi-health.timer"
HEALTH_SERVICE="vox-populi-health.service"
USER_NAME="vox-populi"
LEGACY_TARGET_DIR="/opt/vox-farol"
LEGACY_SERVICE_NAME="vox-farol.service"
LEGACY_TIMER_NAME="vox-farol-health.timer"
LEGACY_HEALTH_SERVICE="vox-farol-health.service"

echo "======================================================================"
echo "          Vox Populi — Instalador do Nó Comunitário Autônomo           "
echo "======================================================================"
echo "Este script instalará o Vox Populi como serviço systemd de baixo consumo."
echo "Destino da instalação: ${TARGET_DIR}"
echo "Usuário do serviço:    ${USER_NAME} (sem privilégios administrativos)"
echo "Porta padrão:          127.0.0.1:3921 (sem portas abertas na WAN)"
echo "----------------------------------------------------------------------"

if [[ "${1:-}" != "--yes" ]]; then
    read -rp "Deseja prosseguir com a instalação do Vox Populi? [s/N]: " CONFIRM
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

echo "[*] Migrando instalação anterior, se encontrada..."
if [[ -d "${LEGACY_TARGET_DIR}" || -f "/etc/systemd/system/${LEGACY_SERVICE_NAME}" ]]; then
    for legacy_unit in "${LEGACY_TIMER_NAME}" "${LEGACY_SERVICE_NAME}"; do
        $SUDO systemctl disable --now "${legacy_unit}" 2>/dev/null || true
    done
    if [[ -d "${LEGACY_TARGET_DIR}" && ! -e "${TARGET_DIR}" ]]; then
        $SUDO mv "${LEGACY_TARGET_DIR}" "${TARGET_DIR}"
    fi
    if [[ -d /var/lib/vox-farol && ! -e /var/lib/vox-populi ]]; then
        $SUDO mv /var/lib/vox-farol /var/lib/vox-populi
    fi
    if [[ -d /var/log/vox-farol && ! -e /var/log/vox-populi ]]; then
        $SUDO mv /var/log/vox-farol /var/log/vox-populi
    fi
    $SUDO rm -f "/etc/systemd/system/${LEGACY_TIMER_NAME}" \
        "/etc/systemd/system/${LEGACY_HEALTH_SERVICE}" \
        "/etc/systemd/system/${LEGACY_SERVICE_NAME}"
    $SUDO systemctl daemon-reload
fi

echo "[*] Criando usuário de sistema '${USER_NAME}' (sem privilégios)..."
if ! id -u "${USER_NAME}" >/dev/null 2>&1; then
    $SUDO useradd -r -s /usr/sbin/nologin -d /var/lib/vox-populi -M "${USER_NAME}" 2>/dev/null || \
    $SUDO adduser --system --no-create-home --group "${USER_NAME}"
fi

echo "[*] Preparando diretórios de dados e logs..."
$SUDO mkdir -p /var/lib/vox-populi/cache
$SUDO mkdir -p /var/log/vox-populi
$SUDO mkdir -p "${TARGET_DIR}/monitoring"
$SUDO mkdir -p "${TARGET_DIR}/config"

echo "[*] Copiando arquivos do serviço e relay Python..."
if [[ -d "${SCRIPT_DIR}/relay" ]]; then
    $SUDO cp -r "${SCRIPT_DIR}/relay" "${TARGET_DIR}/"
elif [[ -d "${SCRIPT_DIR}/../relay" ]]; then
    $SUDO cp -r "${SCRIPT_DIR}/../relay" "${TARGET_DIR}/"
else
    echo "[!] Erro: Módulo relay não encontrado em ${SCRIPT_DIR}/relay nem ${SCRIPT_DIR}/../relay."
    exit 1
fi
$SUDO cp "${SCRIPT_DIR}/config/vox-populi.json" "${TARGET_DIR}/config/"
$SUDO cp "${SCRIPT_DIR}/monitoring/status.json" "${TARGET_DIR}/monitoring/"
$SUDO cp "${SCRIPT_DIR}/health-check.sh" "${TARGET_DIR}/"
$SUDO chmod +x "${TARGET_DIR}/health-check.sh"

echo "[*] Ajustando permissões de propriedade..."
$SUDO chown -R "${USER_NAME}:${USER_NAME}" /var/lib/vox-populi
$SUDO chown -R "${USER_NAME}:${USER_NAME}" /var/log/vox-populi
$SUDO chown -R "${USER_NAME}:${USER_NAME}" "${TARGET_DIR}"

echo "[*] Instalando unidades systemd (serviço e temporizador de saúde)..."
$SUDO cp "${SCRIPT_DIR}/systemd/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
$SUDO cp "${SCRIPT_DIR}/systemd/${HEALTH_SERVICE}" "/etc/systemd/system/${HEALTH_SERVICE}"
$SUDO cp "${SCRIPT_DIR}/systemd/${TIMER_NAME}" "/etc/systemd/system/${TIMER_NAME}"
$SUDO chmod 0644 "/etc/systemd/system/${SERVICE_NAME}"
$SUDO chmod 0644 "/etc/systemd/system/${HEALTH_SERVICE}"
$SUDO chmod 0644 "/etc/systemd/system/${TIMER_NAME}"


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
    echo "[!] ERRO FATAL: O serviço Vox Populi falhou na verificação de inicialização."
    echo "[!] Verificando status do systemd:"
    systemctl status "${SERVICE_NAME}" --no-pager || true
    echo "[!] Últimos logs de erro (journalctl):"
    journalctl -u "${SERVICE_NAME}" -n 25 --no-pager || true
    exit 1
fi

echo "[*] Executando verificação de saúde inicial e gerando telemetria..."
if command -v sudo >/dev/null 2>&1; then
    sudo -u "${USER_NAME}" bash "${TARGET_DIR}/health-check.sh"
elif command -v runuser >/dev/null 2>&1; then
    runuser -u "${USER_NAME}" -- bash "${TARGET_DIR}/health-check.sh"
else
    su -s /bin/bash "${USER_NAME}" -c "bash \"${TARGET_DIR}/health-check.sh\""
fi

echo "----------------------------------------------------------------------"
echo "[+] SUCESSO COMPROVADO: Vox Populi instalado, ativo e validado via systemd!"
echo "Status do serviço:     systemctl status ${SERVICE_NAME}"
echo "Temporizador de saúde: systemctl status ${TIMER_NAME}"
echo "Verificação manual:    ${TARGET_DIR}/health-check.sh"
echo "Telemetria local:      ${TARGET_DIR}/monitoring/status.json"
echo "======================================================================"
