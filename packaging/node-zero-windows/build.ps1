$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "1. Compilando VoxPopuli.exe (Nó Dedicado Vox Populi em bandeja)..."
python -m PyInstaller --clean --noconfirm `
    --workpath build/node-zero `
    --distpath dist `
    packaging/node-zero-windows/VoxPopuli.spec
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller falhou com exit code $LASTEXITCODE ao compilar VoxPopuli.exe"
}

if (Test-Path "$Root/dist/VoxPopuli.exe") {
    Write-Host "[SUCESSO] Gerado com sucesso em dist/: VoxPopuli.exe"
} else {
    throw "Executável VoxPopuli.exe não encontrado em dist/"
}
