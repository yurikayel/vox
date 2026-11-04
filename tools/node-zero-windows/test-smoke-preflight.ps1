$ErrorActionPreference = "Stop"
$smokeScript = Join-Path $PSScriptRoot "smoke-test.ps1"
$listeners = [System.Collections.Generic.List[System.Net.Sockets.TcpListener]]::new()

function Start-TestListener {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $listeners.Add($listener)
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
}

function Invoke-Preflight {
    param([int[]] $Ports)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = @(& powershell.exe -NoProfile -File $smokeScript `
        -Ports ($Ports -join ",") -PreflightOnly 2>&1)
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    return [pscustomobject]@{ ExitCode = $code; Output = $output -join "`n" }
}

function Assert-ListenerReachable {
    param([int] $Port)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect([System.Net.IPAddress]::Loopback, $Port)
        if (!$client.Connected) { throw "Listener da porta $Port deixou de aceitar conexões." }
    } finally {
        $client.Dispose()
    }
}

try {
    $httpPort = Start-TestListener
    $httpCollision = Invoke-Preflight -Ports @($httpPort)
    if ($httpCollision.ExitCode -eq 0 -or $httpCollision.Output -notmatch "$httpPort") {
        throw "A colisão da porta HTTP não foi detectada com diagnóstico útil."
    }
    Assert-ListenerReachable -Port $httpPort

    $listeners[0].Stop()
    $listeners.RemoveAt(0)
    $controlPort = Start-TestListener
    $controlCollision = Invoke-Preflight -Ports @($controlPort)
    if ($controlCollision.ExitCode -eq 0 -or $controlCollision.Output -notmatch "$controlPort") {
        throw "A colisão da porta de controle não foi detectada com diagnóstico útil."
    }
    Assert-ListenerReachable -Port $controlPort

    $bothPort = Start-TestListener
    $bothCollision = Invoke-Preflight -Ports @($controlPort, $bothPort)
    if ($bothCollision.ExitCode -eq 0 -or
        $bothCollision.Output -notmatch "$controlPort" -or
        $bothCollision.Output -notmatch "$bothPort") {
        throw "A colisão simultânea não informou todas as portas ocupadas."
    }
    Assert-ListenerReachable -Port $controlPort
    Assert-ListenerReachable -Port $bothPort

    $listeners | ForEach-Object { $_.Stop() }
    $listeners.Clear()
    $retry = Invoke-Preflight -Ports @($controlPort, $bothPort)
    if ($retry.ExitCode -ne 0 -or $retry.Output -notmatch "Preflight aprovado") {
        throw "O preflight não conseguiu repetir após a liberação das portas: $($retry.Output)"
    }

    Write-Host "N0-H04 aprovado: colisões HTTP/controle, conflito duplo, preservação do listener e retry após liberação."
} finally {
    $listeners | ForEach-Object { $_.Stop() }
}
