# Vox Seeder — Micro-APK Android (Foreground Node)

Micro-aplicativo Android nativo em Java puro (sem AndroidX / sem Jetpack) projetado para rodar como **Nó Seeder permanente** em segundo plano, mesmo com a tela apagada ou no bolso.

## 1. Características Técnicas

- **Tamanho do APK:** **16.870 bytes (~16.47 KiB)** (6 vezes menor que o teto de 100 KiB do Turbo Arweave);
- **Hospedagem Permaweb:** Hospedado e distribuído de forma perpétua e gratuita na rede Arweave/Turbo:
  - Link permanente: [`https://turbo-gateway.com/raw/FHDkOo2ZSac_u5gMu-kBiQikU836ux6q_vDOaSLgPpE`](https://turbo-gateway.com/raw/FHDkOo2ZSac_u5gMu-kBiQikU836ux6q_vDOaSLgPpE)
- **Foreground Service:** Mantém o socket de rede e processo vivos no Android sem sofrer suspensão pelo *Doze Mode*;
- **Cidadania de Dados (NetworkGuard):** Monitora ativamente conexão Wi-Fi e carregador, evitando queima de franquia 4G/5G;
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
adb install vox-seeder.apk
```

### Via Sideload (celular / TV Box):
Baixe diretamente no navegador pelo link da Permaweb ou envie o arquivo `.apk` no WhatsApp/Telegram.
