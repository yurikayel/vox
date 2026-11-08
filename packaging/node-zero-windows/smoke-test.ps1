param(
    [string] $Ports = "3921,3922",
    [switch] $PreflightOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
$smokeRoot = Join-Path $tempRoot "vox-node-zero-smoke-$([guid]::NewGuid().ToString('N'))"
$workRoot = Join-Path $smokeRoot "work"
$distRoot = Join-Path $smokeRoot "dist"
$localAppData = Join-Path $smokeRoot "local-app-data"
$exe = Join-Path $distRoot "VoxPopuli.exe"
$stdout = Join-Path $smokeRoot "node-zero.stdout.log"
$stderr = Join-Path $smokeRoot "node-zero.stderr.log"
$node = $null
$succeeded = $false

$portList = @($Ports -split "," | ForEach-Object { [int]$_.Trim() })
if ($portList.Count -eq 0 -or @($portList | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) {
    throw "Informe uma ou mais portas TCP válidas para o preflight."
}
$occupiedPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $portList })
if ($occupiedPorts) {
    $occupiedPortNumbers = ($occupiedPorts | Select-Object -ExpandProperty LocalPort -Unique) -join ", "
    throw "Smoke cancelado antes da inicialização: portas locais já ocupadas ($occupiedPortNumbers)."
}
if ($PreflightOnly) {
    Write-Host "Preflight aprovado: portas disponíveis ($($portList -join ', '))."
    exit 0
}

New-Item -ItemType Directory -Path $workRoot, $distRoot, $localAppData | Out-Null
Set-Location $repoRoot
$env:LOCALAPPDATA = $localAppData

try {
    python -m PyInstaller --clean --noconfirm `
        --workpath $workRoot `
        --distpath $distRoot `
        packaging/node-zero-windows/VoxPopuli.spec
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller falhou com exit code $LASTEXITCODE"
    }
    if (!(Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw "VoxPopuli.exe não foi gerado no diretório temporário"
    }

    $metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
    if ($metadata.ProductName -ne "VoxPopuli Node Zero - Community Node") {
        throw "ProductName inesperado: $($metadata.ProductName)"
    }

    $node = Start-Process -FilePath $exe -ArgumentList "--node-service" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $node.Refresh()
        if ($node.HasExited) {
            throw "O serviço empacotado encerrou durante a inicialização (exit $($node.ExitCode))"
        }
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:3921/health" -TimeoutSec 2
            if ($health.status -eq "ok") {
                $healthy = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (!$healthy) {
        throw "O relay empacotado não ficou saudável em 30 segundos"
    }

    $ownedProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith(
            ($distRoot.TrimEnd('\') + '\'),
            [System.StringComparison]::OrdinalIgnoreCase
        )
    })
    $ownedIds = @($ownedProcesses | Select-Object -ExpandProperty ProcessId)
    foreach ($port in @(3921, 3922)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -in $ownedIds })
        $allListeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if (!$listeners -or $allListeners.Count -ne $listeners.Count -or
            @($listeners | Where-Object { $_.LocalAddress -ne "127.0.0.1" }).Count -gt 0) {
            throw "A porta $port não está limitada a 127.0.0.1 no executável temporário"
        }
    }

    $dataDir = Join-Path $localAppData "VoxPopuli\NodeZero"
    $token = (Get-Content -LiteralPath (Join-Path $dataDir "control.token") -Raw).Trim()
    Invoke-RestMethod -Uri "http://127.0.0.1:3922/api/stop" -Method Post `
        -Headers @{ "X-Vox-Node-Token" = $token } `
        -ContentType "application/json" -Body "{}" | Out-Null
    $stopped = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        $remaining = @(Get-CimInstance Win32_Process | Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.StartsWith(
                ($distRoot.TrimEnd('\') + '\'),
                [System.StringComparison]::OrdinalIgnoreCase
            )
        })
        if (!$remaining) {
            $stopped = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (!$stopped) {
        throw "O processo empacotado não encerrou após o comando autenticado"
    }

    $succeeded = $true
    Write-Host "VoxPopuli Windows smoke aprovado: build, metadados, health, bind loopback e stop autenticado."
} catch {
    if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout }
    if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr }
    throw
} finally {
    if ($node -and !$succeeded) {
        try {
            $dataDir = Join-Path $localAppData "VoxPopuli\NodeZero"
            $tokenPath = Join-Path $dataDir "control.token"
            if (Test-Path -LiteralPath $tokenPath) {
                $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
                Invoke-RestMethod -Uri "http://127.0.0.1:3922/api/stop" -Method Post `
                    -Headers @{ "X-Vox-Node-Token" = $token } `
                    -ContentType "application/json" -Body "{}" | Out-Null
            }
        } catch {
            Write-Host "Encerramento autenticado de limpeza não respondeu; verificando processos do smoke."
        }
        $remaining = @(Get-CimInstance Win32_Process | Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.StartsWith(
                ($distRoot.TrimEnd('\') + '\'),
                [System.StringComparison]::OrdinalIgnoreCase
            )
        })
        $remaining | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }

    if ($succeeded -and !$env:VOX_KEEP_SMOKE_ARTIFACTS) {
        $resolvedSmokeRoot = [System.IO.Path]::GetFullPath($smokeRoot)
        $tempPrefix = $tempRoot.TrimEnd('\') + '\'
        if (!$resolvedSmokeRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Diretório temporário fora da raiz permitida: $resolvedSmokeRoot"
        }
        Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force
    }
}
