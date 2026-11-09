# Vox — Aplicativo Android do Cliente (Micro-APK)

Wrapper Android nativo em Java puro (sem AndroidX / sem dependências pesadas) que abre a interface do **Vox** e mantém o processo em primeiro plano. O cliente é a interface de uso do cidadão, conectando-se diretamente ao nó comunitário dedicado (**Vox Populi**) ou aos gateways públicos.

## 1. Características Técnicas & Integridade

- **Arquivo do APK:** `vox.apk` (disponível em `vox/android/vox.apk`, `vox/dist/vox.apk` e `client/downloads/vox.apk`)
- **Tamanho do APK:** **74.620 bytes (~73 KiB)** em 09/11/2026 (abaixo do teto de 100 KiB do Turbo Arweave Free Tier);
- **Identificador de Pacote (Application ID):** `org.vox.client`
- **Nome da Aplicação:** `Vox`
- **Assinatura Tríplice:** Scheme v1 (JAR signing), Scheme v2 e Scheme v3 com chave RSA-2048 (`CN=Vox, O=Democracia, C=BR`);
- **Ícones do Sistema:** Suporte completo a ícones raster em múltiplos densidades (`mipmap-mdpi` até `mipmap-xxxhdpi`), eliminando falhas de renderização em instaladores como WSA-PacMan;
- **Hash de Integridade (SHA-256):** `CAB0E7E440B450CB4D74EA16F6B01A413061C480D5BA9DB5AA09870C00668A30` (o anterior, `EAC445D1…`, era de outro build). Fonte de verdade dos hashes: [DEPENDENCIAS.md §6](../docs/DEPENDENCIAS.md#6-binários-no-repositório)
- **Foreground Service:** [`VoxClientService`](src/org/vox/client/VoxClientService.java) mantém conectividade de dados e cache local no Wi-Fi;
- **NetworkGuard:** consulta conexão Wi-Fi e estado de bateria para proteção do usuário;
- **Compatibilidade:** Android 7.0 (API 24) até Android 15 (API 35), universal.

## 2. Compilação Local

Requisitos:
- JDK 21+ (`javac`, `jar`, `keytool`, `jarsigner`)
- Android SDK Build-Tools 35 (`aapt2`, `d8`, `zipalign`, `apksigner`) e `android.jar` (API 35).

Para compilar e assinar em 1 comando no PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

## 3. Instalação & Sideload

```powershell
# Instalar no dispositivo conectado ou no WSA
adb install -r "android/vox.apk"

# Iniciar o cliente Vox
adb shell am start -n org.vox.client/.MainActivity
```
