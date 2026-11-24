# Smoke test local para VoxMemoria.exe --mode memoria (porta 3922, control.token, genesis_guard)

param(
    [string]$BinaryPath = "",
    [int]$Port = 13922
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)

if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
    $BinaryPath = Join-Path $Root "dist\VoxMemoria.exe"
}
if (-not (Test-Path $BinaryPath)) {
    throw "Binario nao encontrado em: $BinaryPath. Execute packaging\vox-memoria-windows\build.ps1 primeiro."
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vox-memoria-smoke-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

$BaseUrl = "http://127.0.0.1:$Port"
$Proc = $null

try {
    Write-Host "1. Iniciando VoxMemoria (--mode memoria em $BaseUrl)..." -ForegroundColor Cyan
    $Proc = Start-Process -FilePath $BinaryPath `
        -ArgumentList @("--mode", "memoria", "--host", "127.0.0.1", "--port", "$Port", "--data-dir", $TempDir) `
        -PassThru -NoNewWindow

    $Ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $Health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 2
            if ($Health.status -eq "ok") {
                $Ready = $true
                break
            }
        } catch {
            if ($Proc.HasExited) {
                throw "Processo VoxMemoria encerrou prematuramente com codigo $($Proc.ExitCode)."
            }
        }
    }
    if (-not $Ready) {
        throw "Timeout aguardando $BaseUrl/health responder 200 OK."
    }

    Write-Host "2. Validando dashboard HTML (/), /status e /api/telemetry..." -ForegroundColor Cyan
    $Dash = Invoke-WebRequest -Uri "$BaseUrl/" -Method Get -UseBasicParsing -TimeoutSec 3
    if ($Dash.StatusCode -ne 200 -or $Dash.Content -notmatch "Vox Populi") {
        throw "Dashboard HTML invalido em $BaseUrl/"
    }
    $Status = Invoke-RestMethod -Uri "$BaseUrl/status" -Method Get -TimeoutSec 3
    if ($Status.state -ne "ACTIVE") {
        throw "Estado inesperado em /status: $($Status.state)"
    }
    $Telemetry = Invoke-RestMethod -Uri "$BaseUrl/api/telemetry" -Method Get -TimeoutSec 3
    if ($Telemetry.status -ne "ok") {
        throw "Resposta inesperada em /api/telemetry"
    }

    Write-Host "3. Validando corte genesis_guard em POST /memory/ingest..." -ForegroundColor Cyan
    $RejectedPayload = '{"type":"GOSSIP","item":{"id":"smoke_demo","author":"vx_ana","ts":1776297601000,"text":"demo"}}'
    $RejectedResp = Invoke-RestMethod -Uri "$BaseUrl/memory/ingest" -Method Post -ContentType "application/json" -Body $RejectedPayload -TimeoutSec 3
    if ($RejectedResp.changed -ne $false) {
        throw "genesis_guard deveria rejeitar conta de teste vx_ana"
    }

    Write-Host "4. Validando bloqueio 401 sem control.token e shutdown autenticado..." -ForegroundColor Cyan
    $Got401 = $false
    try {
        Invoke-WebRequest -Uri "$BaseUrl/control/shutdown" -Method Post -UseBasicParsing -TimeoutSec 3 | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 401) {
            $Got401 = $true
        }
    }
    if (-not $Got401) {
        throw "POST /control/shutdown sem token deveria retornar 401"
    }

    $TokenPath = Join-Path $TempDir "control.token"
    if (-not (Test-Path $TokenPath)) {
        throw "Arquivo control.token nao encontrado em $TokenPath"
    }
    $Token = (Get-Content -Path $TokenPath -Raw).Trim()

    $ShutdownResp = Invoke-RestMethod -Uri "$BaseUrl/control/shutdown" -Method Post `
        -Headers @{ "X-Vox-Control-Token" = $Token } -TimeoutSec 3
    if ($ShutdownResp.status -ne "accepted") {
        throw "Resposta inesperada em /control/shutdown autenticado"
    }

    if (-not $Proc.WaitForExit(5000)) {
        throw "Processo VoxMemoria nao encerrou apos /control/shutdown"
    }

    Write-Host "[OK] Smoke test VoxMemoria (--mode memoria) aprovado!" -ForegroundColor Green
} finally {
    if ($null -ne $Proc -and -not $Proc.HasExited) {
        Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
