#!/usr/bin/env bash
# Script de instalação do Cliente Vox para distribuições Linux (Debian, Ubuntu, Fedora, Arch)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Instalando o Cliente Vox (Linux) ==="

# 1. Copiar script executável para /usr/local/bin
echo "1. Instalando executável em /usr/local/bin/vox..."
sudo install -m 755 "$SCRIPT_DIR/vox.py" /usr/local/bin/vox

# 2. Instalar ícone da aplicação
echo "2. Instalando ícones em /usr/share/icons/hicolor/..."
sudo install -d -m 755 /usr/share/icons/hicolor/scalable/apps
sudo install -d -m 755 /usr/share/icons/hicolor/512x512/apps
if [[ -f "$ROOT_DIR/client/icons/icon.svg" ]]; then
    sudo install -m 644 "$ROOT_DIR/client/icons/icon.svg" /usr/share/icons/hicolor/scalable/apps/vox.svg
fi
if [[ -f "$ROOT_DIR/client/icons/icon-512.png" ]]; then
    sudo install -m 644 "$ROOT_DIR/client/icons/icon-512.png" /usr/share/icons/hicolor/512x512/apps/vox.png
fi

# 3. Instalar lançador .desktop
echo "3. Instalando atalho em /usr/share/applications/vox.desktop..."
sudo install -m 644 "$SCRIPT_DIR/vox.desktop" /usr/share/applications/vox.desktop

# 4. Atualizar caches do sistema
if command -v update-desktop-database >/dev/null 2>&1; then
    sudo update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi

echo ""
echo "=========================================================="
echo "  CLIENTE VOX INSTALADO COM SUCESSO!"
echo "  Inicie digitando 'vox' no terminal ou busque no menu."
echo "=========================================================="
