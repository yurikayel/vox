# Build script para VoxPopuli-ZeroMemory.exe / ZeroCentralMemory.exe — System Tray Dev Edition (Alpha/Beta)
# Compilado com o csc.exe nativo do .NET Framework 4.8 do Windows (zero dependências externas)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

$CSC = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $CSC)) {
    throw "Compilador C# (csc.exe) não encontrado em: $CSC"
}

$SRC = "$ScriptDir\src\ZeroCentralMemory.cs"
$SRC_GUARD = "$ScriptDir\src\VaultOwnerGuard.cs"
$SRC_GENESIS = "$ScriptDir\src\GenesisGuard.cs"
$SRC_GENESIS_DATA = "$ScriptDir\src\GenesisData.cs"
$ICO = "$Root\packaging\desktop-seeder-windows\vox.ico"
$DIST = "$Root\dist"
if (-not (Test-Path $DIST)) { New-Item -ItemType Directory -Force -Path $DIST | Out-Null }
$OUT_EXE = "$DIST\ZeroCentralMemory.exe"
$VOXPOPULI_DEV_EXE = "$DIST\VoxPopuli-ZeroMemory.exe"

Write-Host "1. Compilando Vox Populi Zero-Central-Memory (System Tray • Dev Alpha/Beta)..." -ForegroundColor Cyan

$CSC_ARGS = @(
    "/nologo",
    "/optimize+",
    "/target:winexe",
    "/platform:anycpu",
    "/win32icon:$ICO",
    "/r:System.dll,System.Core.dll,System.Web.Extensions.dll,System.Windows.Forms.dll,System.Drawing.dll",
    "/resource:$ICO,vox.ico",
    "/out:$OUT_EXE",
    "$SRC",
    "$SRC_GUARD",
    "$SRC_GENESIS",
    "$SRC_GENESIS_DATA"
)

& $CSC $CSC_ARGS
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar ZeroCentralMemory.exe com csc.exe (ExitCode: $LASTEXITCODE)"
}

Copy-Item $OUT_EXE $VOXPOPULI_DEV_EXE -Force

$BYTES = (Get-Item $OUT_EXE).Length
$KB = [math]::Round($BYTES / 1024, 1)

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  VOX POPULI ZERO-CENTRAL-MEMORY (TRAY) GERADO!" -ForegroundColor Green
Write-Host "  Arquivo 1: $OUT_EXE" -ForegroundColor Green
Write-Host "  Arquivo 2: $VOXPOPULI_DEV_EXE" -ForegroundColor Green
Write-Host "  Tamanho  : $BYTES bytes ($KB KB)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green

if (Test-Path "D:\Downloads") {
    Copy-Item $OUT_EXE "D:\Downloads\ZeroCentralMemory.exe" -Force
    Copy-Item $OUT_EXE "D:\Downloads\VoxPopuli-ZeroMemory.exe" -Force
    Write-Host "[OK] Copiado para D:\Downloads\VoxPopuli-ZeroMemory.exe e ZeroCentralMemory.exe" -ForegroundColor Green
}

Write-Host "`nExecutando autoteste (--check)..." -ForegroundColor Cyan
& $OUT_EXE --check
if ($LASTEXITCODE -ne 0) {
    throw "Autoteste falhou com exit code: $LASTEXITCODE"
}
