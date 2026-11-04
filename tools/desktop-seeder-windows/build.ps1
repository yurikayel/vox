# Build VoxPopuliDesktop.exe (app desktop WebView2)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "Compilando VoxPopuliDesktop.exe com PyInstaller..."
pyinstaller --clean tools/desktop-seeder-windows/VoxPopuliDesktop.spec

if (Test-Path "$Root/dist/VoxPopuliDesktop.exe") {
    Copy-Item "$Root/dist/VoxPopuliDesktop.exe" "$Root/dist/Vox.exe" -Force
    Write-Host "[SUCESSO] Gerado: dist/VoxPopuliDesktop.exe e dist/Vox.exe"
} else {
    Write-Error "[FALHA] VoxPopuliDesktop.exe nao encontrado em dist/"
}
