# Creates deploy/gravmix/.env from .env.example with random secrets (only if .env is missing),
# then pulls public images and starts the stack. postiz-ru:latest must already
# exist locally (docker build -f Dockerfile.dev -t postiz-ru:latest . in the repo root).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function New-Secret([int]$bytes) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return ([System.BitConverter]::ToString($b) -replace '-', '').ToLower()
}

if (-not (Test-Path .env)) {
    $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env.example'))
    $text = $text -replace '(?m)^JWT_SECRET=$', ('JWT_SECRET=' + (New-Secret 48))
    $text = $text -replace '(?m)^POSTGRES_PASSWORD=$', ('POSTGRES_PASSWORD=' + (New-Secret 24))
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host '.env created with fresh secrets'
} else {
    Write-Host '.env exists, secrets kept'
}

docker compose pull postiz-postgres postiz-redis temporal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose ps
