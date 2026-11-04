#!/usr/bin/env bash
# Script de instalação do Nó Dedicado Vox Populi para macOS (via launchd)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="/usr/local/share/vox"
PLIST_DEST="$HOME/Library/LaunchAgents/org.vox.populi.plist"

echo "=== Instalando Nó Dedicado Vox Populi no macOS ==="

# 1. Copiar arquivos de relay
sudo mkdir -p "$TARGET_DIR"
sudo cp -R "$ROOT_DIR/relay" "$TARGET_DIR/"

# 2. Instalar arquivo LaunchAgent
mkdir -p "$HOME/Library/LaunchAgents"
cp "$SCRIPT_DIR/org.vox.populi.plist" "$PLIST_DEST"

# 3. Carregar e iniciar o serviço
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load -w "$PLIST_DEST"

echo ""
echo "=========================================================="
echo "  NÓ DEDICADO VOX POPULI ATIVO NO MACOS!"
echo "  Escutando em: http://127.0.0.1:3921"
echo "  Logs disponíveis em: /tmp/vox-populi.log"
echo "=========================================================="
