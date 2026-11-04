# Vox Populi — aplicativo Android leve

Wrapper Android nativo em Java puro (sem AndroidX / sem Jetpack) que abre o PWA Vox Populi e inicia um foreground service com uma WebView. O serviço não implementa seeding WebTorrent, descoberta de nós na LAN nem cache compartilhado; o pacote não deve ser apresentado como seeder P2P.

## 1. Características Técnicas & Integridade

- **Tamanho do APK:** **16.868 bytes (~16.47 KiB)** (compatível com o teto de 100 KiB para micro-bundles do Turbo Arweave; a elegibilidade e publicação definitiva dependem de pipeline operacional e teste de upload);
- **Identificador de Pacote (Application ID):** `org.vox.populi`
- **Assinatura:** APK Signature Scheme v2 e v3 com chave RSA-2048 (`CN=Vox, O=Democracia, C=BR`);
- **Hash de Integridade (SHA-256):** `B6D8C9DC5117092C7258875B5232C2C5AE62E89F861770146930B1210F7642C6`
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

## 3. Instalação & Guia de Migração

### Transição do Pacote Legado (`org.vox.seeder` -> `org.vox.populi`)
A alteração do pacote de `org.vox.seeder` para `org.vox.populi` estabelece uma nova identidade canônica para o aplicativo.
- Um upgrade tradicional no Android não substitui pacotes com identificadores diferentes;
- Para ambientes de desenvolvimento, emuladores ou dispositivos com a versão preliminar instalada, desinstale o pacote legado antes ou após a instalação:
  ```bash
  adb uninstall org.vox.seeder
  adb install -r vox-populi.apk
  ```
- No dispositivo físico: Desinstale o aplicativo "Vox Seeder" anterior através das Configurações do Android antes de abrir o novo "Vox Populi".

### Instalação via Sideload:
Envie o arquivo `vox-populi.apk` ao dispositivo e confirme a instalação concedendo permissão para fontes desconhecidas se solicitado.
