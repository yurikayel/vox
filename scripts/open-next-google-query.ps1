# Abre uma URL Google Images por vez no navegador padrão (Chrome do usuário).
# Uso: .\scripts\open-next-google-query.ps1
#       .\scripts\open-next-google-query.ps1 -Reset

param(
    [switch]$Reset,
    [string]$TsvPath = "docs\design\stitch-captures\google-images-harvest\queries-all.tsv",
    [string]$StatePath = "docs\design\stitch-captures\google-images-harvest\.manual-progress.txt"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if ($Reset -and (Test-Path $StatePath)) {
    Remove-Item $StatePath -Force
    Write-Host "Progresso zerado."
}

if (-not (Test-Path $TsvPath)) {
    Write-Error "TSV ausente. Rode: python e2e/parse_transcript_google_queries.py"
    exit 1
}

$lines = Get-Content $TsvPath | Where-Object { $_ -and ($_ -notmatch '^platform\t') }
$index = 0
if (Test-Path $StatePath) {
    $index = [int](Get-Content $StatePath -TotalCount 1)
}

if ($index -ge $lines.Count) {
    Write-Host "Fim da fila ($($lines.Count) queries)."
    exit 0
}

$parts = $lines[$index] -split "`t", 4
if ($parts.Count -lt 4) {
    Write-Error "Linha TSV inválida na posição $index"
    exit 1
}

$platform, $slug, $url, $q = $parts
$dest = Join-Path $root "docs\design\stitch-captures\google-images-harvest\$platform\$slug"

Write-Host ""
Write-Host "[$($index + 1)/$($lines.Count)] $platform / $slug"
Write-Host "q: $q"
Write-Host "Salvar em: $dest"
Write-Host "URL: $url"
Write-Host ""

Start-Process $url
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Read-Host "Quando terminar esta query (12–20 imagens), Enter para a próxima"

($index + 1) | Set-Content -Path $StatePath -NoNewline
Write-Host "Próxima execução abrirá a query $($index + 2)."