# Build VoxStewardKit.exe (requires: pip install pyinstaller)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
pyinstaller --clean tools/steward-kit-windows/VoxStewardKit.spec
Write-Host "Output: dist/VoxStewardKit.exe"
