# Compila o ZeroCentralMemory.exe numa pasta temporária e roda GenesisGuardCheck.cs contra ele.
# Não toca em dist/ nem copia para Downloads (isso é o build.ps1).
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src = Join-Path (Split-Path -Parent $Here) "src"
$CSC = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$Out = Join-Path ([IO.Path]::GetTempPath()) ("nz-genesis-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Exe = Join-Path $Out "ZeroCentralMemory.exe"
& $CSC /nologo /target:winexe "/r:System.dll,System.Core.dll,System.Web.Extensions.dll,System.Windows.Forms.dll,System.Drawing.dll" "/out:$Exe" `
  (Join-Path $Src "ZeroCentralMemory.cs") (Join-Path $Src "VaultOwnerGuard.cs") (Join-Path $Src "GenesisGuard.cs") (Join-Path $Src "GenesisData.cs")
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o nó (ExitCode: $LASTEXITCODE)" }
$Check = Join-Path $Out "GenesisGuardCheck.exe"
& $CSC /nologo "/r:$Exe" /r:System.Web.Extensions.dll "/out:$Check" (Join-Path $Here "GenesisGuardCheck.cs")
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar a conferência (ExitCode: $LASTEXITCODE)" }
& $Check
if ($LASTEXITCODE -ne 0) { throw "Corte da gênese no nó: $LASTEXITCODE caso(s) falharam" }
