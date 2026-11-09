# Build script para os Micro-APKs do Ecossistema Vox:
# 1. vox.apk         -> Cliente Vox (org.vox.client)
# 2. vox-populi.apk  -> Nó Dedicado Vox Populi (org.vox.populi)

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

# PM-45: no CI o JDK e o SDK vêm do runner (VOX_JAVA_HOME, ANDROID_HOME); na máquina local, os caminhos de sempre.
$env:JAVA_HOME = if ($env:VOX_JAVA_HOME) { $env:VOX_JAVA_HOME } else { "C:\Program Files\Eclipse Adoptium\jdk-21.0.9.10-hotspot" }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$SDK = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "C:\Users\yurik\AppData\Local\Android\Sdk" }
$BUILD_TOOLS_VERSION = if ($env:VOX_BUILD_TOOLS) { $env:VOX_BUILD_TOOLS } else { "35.0.0" }
$BUILD_TOOLS = "$SDK\build-tools\$BUILD_TOOLS_VERSION"
$PLATFORM = "$SDK\platforms\android-35\android.jar"
foreach ($required in @($BUILD_TOOLS, $PLATFORM, "$env:JAVA_HOME\bin\javac.exe")) {
    if (-not (Test-Path $required)) { throw "Nao encontrado: $required" }
}
$JAVAC = "$env:JAVA_HOME\bin\javac.exe"
$JAR = "$env:JAVA_HOME\bin\jar.exe"
$KEYTOOL = "$env:JAVA_HOME\bin\keytool.exe"
$JARSIGNER = "$env:JAVA_HOME\bin\jarsigner.exe"

$AAPT2 = "$BUILD_TOOLS\aapt2.exe"
$D8 = "$BUILD_TOOLS\d8.bat"
$ZIPALIGN = "$BUILD_TOOLS\zipalign.exe"
$APKSIGNER = "$BUILD_TOOLS\apksigner.bat"

$BUILD_DIR = "$ROOT\build"
if (Test-Path $BUILD_DIR) { Remove-Item -Recurse -Force $BUILD_DIR }
New-Item -ItemType Directory -Force -Path "$BUILD_DIR\compiled_res" | Out-Null

$KEYSTORE = "$BUILD_DIR\debug.keystore"
Write-Host "Criando keystore de debug compartilhada..."
cmd.exe /c "`"$KEYTOOL`" -genkeypair -keystore `"$KEYSTORE`" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname `"CN=Vox Populi,O=Democracia,C=BR`" 2>nul"

Write-Host "Compilando recursos comuns com AAPT2..."
& $AAPT2 compile --dir res -o "$BUILD_DIR\compiled_res\res.zip"

function Build-AppVariant {
    param(
        [string]$Name,          # "vox" ou "vox-populi"
        [string]$Package,       # "org.vox.client" ou "org.vox.populi"
        [string]$ManifestFile,  # "AndroidManifest-client.xml" ou "AndroidManifest-node.xml"
        [string]$SourceSubDir   # "client" ou "populi"
    )

    Write-Host "`n>>> [BUILD] Compilando variante: $Name ($Package) <<<" -ForegroundColor Cyan
    $VAR_DIR = "$BUILD_DIR\$Name"
    New-Item -ItemType Directory -Force -Path "$VAR_DIR\gen", "$VAR_DIR\classes", "$VAR_DIR\dex" | Out-Null

    # 1. Linkar recursos e gerar R.java
    Write-Host "1. Linkando recursos com AAPT2..."
    & $AAPT2 link -I $PLATFORM `
        --manifest $ManifestFile `
        -o "$VAR_DIR\base.apk" `
        --java "$VAR_DIR\gen" `
        "$BUILD_DIR\compiled_res\res.zip"

    # 2. Compilar Java
    Write-Host "2. Compilando codigo Java ($SourceSubDir)..."
    $JAVA_FILES = Get-ChildItem -Recurse "$VAR_DIR\gen\*.java", "$ROOT\src\org\vox\$SourceSubDir\*.java" | Select-Object -ExpandProperty FullName
    & $JAVAC -encoding UTF-8 -source 11 -target 11 -cp $PLATFORM -d "$VAR_DIR\classes" $JAVA_FILES

    # 3. Converter para DEX com D8
    Write-Host "3. Gerando classes.dex com D8..."
    $CLASS_FILES = Get-ChildItem -Recurse "$VAR_DIR\classes\*.class" | Select-Object -ExpandProperty FullName
    & cmd.exe /c "$D8 --min-api 24 --lib $PLATFORM --output $VAR_DIR\dex $CLASS_FILES"

    # 4. Inserir classes.dex no APK
    Write-Host "4. Empacotando classes.dex..."
    Copy-Item "$VAR_DIR\base.apk" "$VAR_DIR\unaligned.apk"
    Push-Location "$VAR_DIR\dex"
    & $JAR uf "$VAR_DIR\unaligned.apk" classes.dex
    Pop-Location

    # 5. Alinhar APK antes da assinatura com apksigner (zipalign 4)
    Write-Host "5. Alinhando APK (zipalign 4)..."
    & $ZIPALIGN -p -f 4 "$VAR_DIR\unaligned.apk" "$VAR_DIR\aligned.apk"

    # 6. Assinar com v1 (JAR) + v2 + v3 via apksigner (forçando min-sdk-version 1 para incluir JAR signature v1)
    Write-Host "6. Assinando com v1, v2 e v3 (apksigner)..."
    $FINAL_APK = "$ROOT\$Name.apk"
    & cmd.exe /c "`"$APKSIGNER`" sign --ks `"$KEYSTORE`" --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --min-sdk-version 1 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out `"$FINAL_APK`" `"$VAR_DIR\aligned.apk`""

    # 8. Copiar para dist/ e Downloads
    $DIST_DIR = "$ROOT\..\dist"
    if (Test-Path $DIST_DIR) {
        Copy-Item $FINAL_APK "$DIST_DIR\$Name.apk" -Force
    }
    if (Test-Path "D:\Downloads") {
        Copy-Item $FINAL_APK "D:\Downloads\$Name.apk" -Force
    }

    $BYTES = (Get-Item $FINAL_APK).Length
    $KB = [math]::Round($BYTES / 1024, 2)
    Write-Host "  -> APK GERADO: $FINAL_APK" -ForegroundColor Green
    Write-Host "  -> TAMANHO: $BYTES bytes ($KB KiB)" -ForegroundColor Yellow
    if ($BYTES -le 101376) {
        Write-Host "  -> STATUS: CABE NO FREE TIER DO TURBO ARWEAVE (<= 100 KiB)!" -ForegroundColor Green
    } else {
        Write-Host "  -> ALERTA: Excedeu 100 KiB ($KB KiB)" -ForegroundColor Red
    }
}

# Compilar ambos os produtos do ecossistema:
Build-AppVariant -Name "vox" -Package "org.vox.client" -ManifestFile "AndroidManifest-client.xml" -SourceSubDir "client"
Build-AppVariant -Name "vox-populi" -Package "org.vox.populi" -ManifestFile "AndroidManifest-node.xml" -SourceSubDir "populi"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  AMBOS OS APKS GERADOS E ASSINADOS COM SUCESSO!" -ForegroundColor Green
Write-Host "  1. vox.apk        -> Cliente Vox (org.vox.client)" -ForegroundColor Cyan
Write-Host "  2. vox-populi.apk -> Nó Dedicado (org.vox.populi)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
