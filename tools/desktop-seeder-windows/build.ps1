# Build VoxPopuliDesktop.exe (Desktop App + P2P Seeder com WebView2)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "Compilando VoxPopuliDesktop.exe com PyInstaller..."
pyinstaller --clean tools/desktop-seeder-windows/VoxPopuliDesktop.spec

if (Test-Path "$Root/dist/VoxPopuliDesktop.exe") {
    Write-Host "[SUCESSO] Gerado: dist/VoxPopuliDesktop.exe"
} else {
    Write-Error "[FALHA] VoxPopuliDesktop.exe nao encontrado em dist/"
}
