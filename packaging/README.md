# packaging/

**Instaladores e empacotamento** do Vox para desktop e servidores domésticos. Cada pasta tem o próprio README com build e uso.

| Pasta | O que gera | Plataforma |
|---|---|---|
| [`desktop-linux/`](./desktop-linux/) | Cliente desktop (GTK/WebKit) e instalador | Linux |
| [`desktop-windows-native/`](./desktop-windows-native/) | Cliente nativo com WebView2 (C#) | Windows |
| [`desktop-seeder-windows/`](./desktop-seeder-windows/) | App desktop + seeder (PyInstaller) | Windows |
| [`node-zero-windows/`](./node-zero-windows/) | Nó Vox Populi na bandeja (`VoxPopuli.exe`) | Windows |
| [`node-macos/`](./node-macos/) | Nó como serviço `launchd` | macOS |
| [`steward-kit-windows/`](./steward-kit-windows/) | Kit 1-clique: relay + PWA (`iniciar_steward.bat`, `Start-StewardKit.ps1`) | Windows |
| [`steward-kit-linux/`](./steward-kit-linux/) | Kit 1-clique para Linux | Linux |
| [`zero-central-memory-windows/`](./zero-central-memory-windows/) | Memória central standalone (C#) + `dashboard.html` | Windows |

O relay em servidor (Docker, Render, VPS) fica em [`relay/`](../relay/) e [`relay/deploy/`](../relay/deploy/). O app Android fica em [`android/`](../android/).
