# Build script do Micro-APK Vox Seeder
$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.9.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$SDK = "C:\Users\yurik\AppData\Local\Android\Sdk"
$BUILD_TOOLS = "$SDK\build-tools\35.0.0"
$PLATFORM = "$SDK\platforms\android-35\android.jar"
$JAVAC = "$env:JAVA_HOME\bin\javac.exe"
$JAR = "$env:JAVA_HOME\bin\jar.exe"
$KEYTOOL = "$env:JAVA_HOME\bin\keytool.exe"

$AAPT2 = "$BUILD_TOOLS\aapt2.exe"
$D8 = "$BUILD_TOOLS\d8.bat"
$ZIPALIGN = "$BUILD_TOOLS\zipalign.exe"
$APKSIGNER = "$BUILD_TOOLS\apksigner.bat"

$BUILD_DIR = "$ROOT\build"
if (Test-Path $BUILD_DIR) { Remove-Item -Recurse -Force $BUILD_DIR }
New-Item -ItemType Directory -Force -Path "$BUILD_DIR\compiled_res", "$BUILD_DIR\gen", "$BUILD_DIR\classes", "$BUILD_DIR\dex" | Out-Null

Write-Host "1. Compilando recursos com AAPT2..."
& $AAPT2 compile --dir res -o "$BUILD_DIR\compiled_res\res.zip"

Write-Host "2. Linkando recursos e gerando R.java..."
& $AAPT2 link -I $PLATFORM `
    --manifest AndroidManifest.xml `
    -o "$BUILD_DIR\base.apk" `
    --java "$BUILD_DIR\gen" `
    "$BUILD_DIR\compiled_res\res.zip"

Write-Host "3. Compilando código Java..."
$JAVA_FILES = Get-ChildItem -Recurse "$BUILD_DIR\gen\*.java", "$ROOT\src\*.java" | Select-Object -ExpandProperty FullName
& $JAVAC -encoding UTF-8 -source 11 -target 11 -cp $PLATFORM -d "$BUILD_DIR\classes" $JAVA_FILES

Write-Host "4. Gerando classes.dex com D8..."
$CLASS_FILES = Get-ChildItem -Recurse "$BUILD_DIR\classes\*.class" | Select-Object -ExpandProperty FullName
& cmd.exe /c "$D8 --min-api 24 --lib $PLATFORM --output $BUILD_DIR\dex $CLASS_FILES"

Write-Host "5. Adicionando classes.dex ao APK..."
Copy-Item "$BUILD_DIR\base.apk" "$BUILD_DIR\unaligned.apk"
Push-Location "$BUILD_DIR\dex"
& $JAR uf "$BUILD_DIR\unaligned.apk" classes.dex
Pop-Location

Write-Host "6. Alinhando APK (zipalign 4)..."
& $ZIPALIGN -p -f 4 "$BUILD_DIR\unaligned.apk" "$BUILD_DIR\vox-seeder-aligned.apk"

Write-Host "7. Gerando keystore de debug e assinando..."
$KEYSTORE = "$BUILD_DIR\debug.keystore"
if (-not (Test-Path $KEYSTORE)) {
    cmd.exe /c "`"$KEYTOOL`" -genkeypair -keystore `"$KEYSTORE`" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname CN=Vox,O=Democracia,C=BR 2>nul"
}

$FINAL_APK = "$ROOT\vox-seeder.apk"
& cmd.exe /c "`"$APKSIGNER`" sign --ks `"$KEYSTORE`" --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out `"$FINAL_APK`" `"$BUILD_DIR\vox-seeder-aligned.apk`""

$BYTES = (Get-Item $FINAL_APK).Length
$KB = [math]::Round($BYTES / 1024, 2)
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  APK GERADO COM SUCESSO: $FINAL_APK" -ForegroundColor Green
Write-Host "  TAMANHO FINAL: $BYTES bytes ($KB KiB)" -ForegroundColor Yellow
if ($BYTES -le 101376) {
    Write-Host "  STATUS: CABE NO FREE TIER DO TURBO ARWEAVE (<= 100 KiB)! ⚡" -ForegroundColor Cyan
} else {
    Write-Host "  STATUS: EXCEDEU 100 KiB" -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Green
