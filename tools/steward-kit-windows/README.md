# Steward Kit — Windows 1-clique (P1)

Pacote MVP para operadores comunitários: inicia relay local + abre o assistente steward do Vox.

## Pré-requisitos

- Windows 10+
- Python 3.11+ no PATH
- Repositório Vox clonado (esta pasta fica em `vox/tools/steward-kit-windows/`)

## Uso rápido (sem PyInstaller)

```powershell
cd c:\caminho\para\vox
.\tools\steward-kit-windows\Start-StewardKit.ps1
```

O script:

1. Cria venv em `%LOCALAPPDATA%\VoxSteward\venv` (se não existir) e instala `relay/requirements.txt`.
2. Sobe `relay/server.py` na porta **8787** (ou `VOX_RELAY_PORT`).
3. Abre o navegador em `#/settings/network/steward` (servidor estático em `client/` na porta **8080** se nada estiver ouvindo).

## Build executável (opcional)

```powershell
pip install pyinstaller
pyinstaller --onefile --name VoxStewardKit tools/steward-kit-windows/steward_launcher.py
```

Distribua `dist/VoxStewardKit.exe` com este README. O `.exe` embute apenas o launcher; relay continua Python embutido via PyInstaller `--add-data` se você empacotar o diretório `relay/` (ver comentários em `steward_launcher.py`).

## Operação

- Relay HTTP padrão: `http://127.0.0.1:8787`
- Cole a URL no passo 4 do wizard steward (`docs/steward-seed-15min.md`, `docs/steward-relay-kit.md`).
- Atestado ADR-001: stub local até protocolo wired — wizard grava URLs em `localStorage` do PWA.

## Mac / Linux

AppImage documentado como P1.1 — reutilize `steward_launcher.py` com shebang e systemd user unit.
