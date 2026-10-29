# Build VoxSeeder.exe (Desktop App + P2P Seeder com WebView2)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "Compilando VoxSeeder.exe com PyInstaller..."
pyinstaller --clean tools/desktop-seeder-windows/VoxSeeder.spec

if (Test-Path "$Root/dist/VoxSeeder.exe") {
    Write-Host "[SUCESSO] Gerado: dist/VoxSeeder.exe"
} else {
    Write-Error "[FALHA] VoxSeeder.exe nao encontrado em dist/"
}
