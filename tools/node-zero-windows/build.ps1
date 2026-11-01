$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "Compilando VoxPopuli.exe (launcher de bandeja + Nó Zero)..."
python -m PyInstaller --clean --noconfirm `
    --workpath build/node-zero `
    --distpath dist `
    tools/node-zero-windows/VoxPopuli.spec
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller falhou com exit code $LASTEXITCODE"
}

if (Test-Path "$Root/dist/VoxPopuli.exe") {
    Write-Host "[SUCESSO] Gerado: dist/VoxPopuli.exe"
} else {
    throw "VoxPopuli.exe não foi gerado em dist/"
}
