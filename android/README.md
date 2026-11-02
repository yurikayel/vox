# Vox Populi — aplicativo Android leve

Wrapper Android nativo em Java puro (sem AndroidX / sem Jetpack) que abre o PWA Vox Populi e inicia um foreground service com uma WebView. O serviço não implementa seeding WebTorrent, descoberta de nós na LAN nem cache compartilhado; o pacote não deve ser apresentado como seeder P2P.

## 1. Características Técnicas

- **Tamanho do APK:** **16.870 bytes (~16.47 KiB)** (6 vezes menor que o teto de 100 KiB do Turbo Arweave);
- **Hospedagem Permaweb:** Hospedado e distribuído de forma perpétua e gratuita na rede Arweave/Turbo:
  - Link permanente: [`https://turbo-gateway.com/raw/FHDkOo2ZSac_u5gMu-kBiQikU836ux6q_vDOaSLgPpE`](https://turbo-gateway.com/raw/FHDkOo2ZSac_u5gMu-kBiQikU836ux6q_vDOaSLgPpE)
- **Foreground Service:** mantém o processo do wrapper ativo conforme as regras do Android; isso não significa que há tráfego P2P ou seeding;
- **NetworkGuard:** consulta conexão Wi-Fi e estado de carregamento para compor o estado exibido pelo app;
- **Compatibilidade:** Android 7.0 (API 24) até Android 15 (API 35), arquitetura agnóstica (`classes.dex` universal).

## 2. Compilação Local

Requisitos:
- JDK 21+ (`javac`, `jar`, `keytool`)
- Android SDK Build-Tools 34+ (`aapt2`, `d8`, `zipalign`, `apksigner`) e `android.jar` (API 35).

Para compilar e assinar em 1 comando no PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

## 3. Instalação

### Via ADB (computador):
```bash
adb install vox-populi.apk
```

### Via Sideload (celular / TV Box):
Baixe diretamente no navegador pelo link da Permaweb ou envie o arquivo `.apk` no WhatsApp/Telegram.
