# Vox Steward Kit — 1-clique (dev / operador)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Launcher = Join-Path $PSScriptRoot "steward_launcher.py"
if (-not (Test-Path $Launcher)) { throw "Missing steward_launcher.py" }
Set-Location $Root
python $Launcher
