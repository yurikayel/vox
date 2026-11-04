# Build Vox.exe / VoxPopuliDesktop.exe (app desktop nativo ultraleve)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "Iniciando compilação do executável nativo ultraleve Vox..." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File "$Root/tools/desktop-windows-native/build.ps1"
