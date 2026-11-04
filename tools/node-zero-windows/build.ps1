$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

Write-Host "1. Compilando VoxPopuli.exe (launcher de bandeja + Nó Zero)..."
python -m PyInstaller --clean --noconfirm `
    --workpath build/node-zero `
    --distpath dist `
    tools/node-zero-windows/VoxPopuli.spec
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller falhou com exit code $LASTEXITCODE ao compilar VoxPopuli.exe"
}

Write-Host "2. Compilando VoxFarol.exe (executável dedicado Nó Farol)..."
python -m PyInstaller --clean --noconfirm `
    --workpath build/node-zero-farol `
    --distpath dist `
    tools/node-zero-windows/VoxFarol.spec
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller falhou com exit code $LASTEXITCODE ao compilar VoxFarol.exe"
}

if ((Test-Path "$Root/dist/VoxPopuli.exe") -and (Test-Path "$Root/dist/VoxFarol.exe")) {
    Write-Host "[SUCESSO] Gerados com sucesso em dist/: VoxPopuli.exe e VoxFarol.exe"
} else {
    throw "Executáveis não encontrados em dist/"
}
