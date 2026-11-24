# Build script para VoxMemoria.exe e VoxPopuli.exe (ADR-039 PR4.3 — Rust std puro)
# Compila rust/vox-node em modo release e valida --version / --health-json.

param(
    [switch]$SkipSelfCheck
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Toolchain Rust (cargo) nao encontrada no PATH. Instale via rustup antes de compilar."
}

$ManifestPath = Join-Path $Root "rust\Cargo.toml"
$DistDir = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

Write-Host "1. Compilando vox-node (release) via Cargo..." -ForegroundColor Cyan
& cargo build --release --manifest-path $ManifestPath --bin vox-node
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar vox-node (ExitCode: $LASTEXITCODE). No Windows MSVC, verifique se o Visual Studio C++ Build Tools (link.exe) esta instalado."
}

$BuiltExe = Join-Path $Root "rust\target\release\vox-node.exe"
if (-not (Test-Path $BuiltExe)) {
    throw "Binario esperado nao encontrado em: $BuiltExe"
}

$VoxMemoriaExe = Join-Path $DistDir "VoxMemoria.exe"
$VoxPopuliExe = Join-Path $DistDir "VoxPopuli.exe"
Copy-Item $BuiltExe $VoxMemoriaExe -Force
Copy-Item $BuiltExe $VoxPopuliExe -Force

$HashMemoria = (Get-FileHash -Algorithm SHA256 -Path $VoxMemoriaExe).Hash.ToLowerInvariant()
$HashPopuli = (Get-FileHash -Algorithm SHA256 -Path $VoxPopuliExe).Hash.ToLowerInvariant()
$ChecksumsPath = Join-Path $DistDir "SHA256SUMS-vox-memoria.txt"
@(
    "$HashMemoria  VoxMemoria.exe"
    "$HashPopuli  VoxPopuli.exe"
) | Set-Content -Path $ChecksumsPath -Encoding UTF8

$Bytes = (Get-Item $VoxMemoriaExe).Length
$Kb = [math]::Round($Bytes / 1024, 1)

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  VOX MEMORIA / VOX POPULI (RUST) GERADO COM SUCESSO!" -ForegroundColor Green
Write-Host "  Binario 1 : $VoxMemoriaExe" -ForegroundColor Green
Write-Host "  Binario 2 : $VoxPopuliExe" -ForegroundColor Green
Write-Host "  Checksums : $ChecksumsPath" -ForegroundColor Green
Write-Host "  Tamanho   : $Bytes bytes ($Kb KB)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green

if (-not $SkipSelfCheck) {
    Write-Host "`n2. Executando autoteste (--version e --health-json)..." -ForegroundColor Cyan
    & $VoxMemoriaExe --version
    if ($LASTEXITCODE -ne 0) {
        throw "Autoteste --version falhou (ExitCode: $LASTEXITCODE)"
    }
    $HealthRaw = & $VoxMemoriaExe --health-json
    if ($LASTEXITCODE -ne 0) {
        throw "Autoteste --health-json falhou (ExitCode: $LASTEXITCODE)"
    }
    Write-Host $HealthRaw
}
