# Build script para o executável nativo ultraleve do Vox Desktop (Windows)
# Compilado via compilador oficial do .NET Framework 4.8 (csc.exe embutido no Windows)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $Root

$CSC = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $CSC)) {
    throw "Compilador C# (csc.exe) não encontrado em: $CSC"
}

$SRC = "$ScriptDir\src\VoxClient.cs"
$LIB_DIR = "$ScriptDir\lib"
$ICO = "$Root\packaging\desktop-seeder-windows\vox.ico"
$DIST = "$Root\dist"
if (-not (Test-Path $DIST)) { New-Item -ItemType Directory -Force -Path $DIST | Out-Null }
$OUT_EXE = "$DIST\Vox.exe"

Write-Host "1. Compilando Vox.exe nativo ultraleve (.NET 4.8 + WebView2)..." -ForegroundColor Cyan

$CSC_ARGS = @(
    "/nologo",
    "/optimize+",
    "/target:winexe",
    "/platform:anycpu",
    "/win32icon:$ICO",
    "/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll",
    "/r:$LIB_DIR\Microsoft.Web.WebView2.Core.dll",
    "/r:$LIB_DIR\Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$LIB_DIR\Microsoft.Web.WebView2.Core.dll,Microsoft.Web.WebView2.Core.dll",
    "/resource:$LIB_DIR\Microsoft.Web.WebView2.WinForms.dll,Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$LIB_DIR\WebView2Loader.dll,WebView2Loader.dll",
    "/resource:$ICO,vox.ico",
    "/out:$OUT_EXE",
    "$SRC"
)

& $CSC $CSC_ARGS

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar Vox.exe nativo com csc.exe (ExitCode: $LASTEXITCODE)"
}

$BYTES = (Get-Item $OUT_EXE).Length
$KB = [math]::Round($BYTES / 1024, 2)
$MB = [math]::Round($BYTES / (1024 * 1024), 2)

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  EXECUTÁVEL NATIVO GERADO COM SUCESSO!" -ForegroundColor Green
Write-Host "  Arquivo: $OUT_EXE" -ForegroundColor Green
Write-Host "  Tamanho: $BYTES bytes ($KB KiB / $MB MB)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green

# 2. Copiar para Downloads e sincronizar VoxPopuliDesktop.exe
if (Test-Path "D:\Downloads") {
    Copy-Item $OUT_EXE "D:\Downloads\Vox.exe" -Force
    Write-Host "[OK] Copiado para D:\Downloads\Vox.exe" -ForegroundColor Green
}
Copy-Item $OUT_EXE "$DIST\VoxPopuliDesktop.exe" -Force

# 3. Rodar autoteste --check
Write-Host "`nExecutando autoteste (--check)..." -ForegroundColor Cyan
& $OUT_EXE --check
if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCESSO] Autoteste do executável nativo aprovado!" -ForegroundColor Green
} else {
    throw "Autoteste falhou com exit code: $LASTEXITCODE"
}
