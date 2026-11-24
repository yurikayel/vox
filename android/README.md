# Vox — Aplicativo Android do Cliente (Micro-APK)

Wrapper Android nativo em Java puro (sem AndroidX / sem dependências pesadas) que abre a interface do **Vox** e mantém o processo em primeiro plano. O cliente é a interface de uso do cidadão, conectando-se diretamente ao nó comunitário dedicado (**Vox Populi**) ou aos gateways públicos.

## 1. Características Técnicas & Integridade

- **Arquivo do APK:** `vox.apk`, compilado pelo CI ([`release-binarios.yml`](../.github/workflows/release-binarios.yml)) e baixado da [Release mais recente](https://github.com/yurikayel/vox/releases/latest/download/vox.apk). Não fica mais no git (PM-45)
- **Tamanho do APK:** cerca de 74 KiB (abaixo do teto de 100 KiB do Turbo Arweave Free Tier);
- **Identificador de Pacote (Application ID):** `org.vox.client`
- **Nome da Aplicação:** `Vox`
- **Assinatura Tríplice:** Scheme v1 (JAR signing), Scheme v2 e Scheme v3 com chave RSA-2048 de debug criada a cada build (`CN=Vox Populi, O=Democracia, C=BR`): atualizar exige desinstalar antes;
- **Ícones do Sistema:** Suporte completo a ícones raster em múltiplos densidades (`mipmap-mdpi` até `mipmap-xxxhdpi`), eliminando falhas de renderização em instaladores como WSA-PacMan;
- **Hash de Integridade (SHA-256):** no arquivo `SHA256SUMS` de cada Release, com atestação de origem (`gh attestation verify vox.apk --repo yurikayel/vox`). Ver [DEPENDENCIAS.md §6](../docs/DEPENDENCIAS.md#6-binários-no-repositório)
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

## 4. Biblioteca Nativa `libvox_node.so` no Vox Populi (ADR-039 PR4.4)

Somente a variante de infraestrutura dedicada **`vox-populi.apk`** (`org.vox.populi`, [`VoxPopuliNodeService.java`](src/org/vox/populi/VoxPopuliNodeService.java)) carrega opcionalmente a biblioteca compartilhada `libvox_node.so` (gerada por [`rust/vox-node`](../rust/vox-node/README.md) com `crate-type = ["lib", "cdylib"]`). O micro-APK cidadão **`vox.apk`** (`org.vox.client`) permanece 100% Java puro sem nenhuma `.so`, preservando o limite abaixo de 100 KiB.

Caso `libvox_node.so` não esteja empacotada no ambiente local, `VoxPopuliNodeService` captura `UnsatisfiedLinkError` e opera em modo fallback gracioso (Foreground Service + monitoramento Wi-Fi sem crash).

### Cross-compile local com `cargo` + Android NDK (opcional, fora do CI padrão)

Requisitos opcionais:
- Rust toolchain com alvos Android (`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`);
- Android NDK r26+ (`ANDROID_NDK_HOME` definido).

```bash
# Exemplo para arm64-v8a (API 24+) usando o linker do Android NDK
export NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_BIN/aarch64-linux-android24-clang"

cargo build --manifest-path rust/Cargo.toml -p vox-node --release \
  --lib --target aarch64-linux-android

# Artefato gerado:
# rust/target/aarch64-linux-android/release/libvox_node.so
# Empacotar em lib/arm64-v8a/libvox_node.so apenas no APK vox-populi.
```

Para alvos adicionais (`armeabi-v7a` / `x86_64`), repita com `--target armv7-linux-androideabi` (`armv7a-linux-androideabi24-clang`) ou `--target x86_64-linux-android` (`x86_64-linux-android24-clang`). O CI padrão não exige o Android NDK instalado.
