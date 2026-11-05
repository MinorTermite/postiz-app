# Builds the Windows installer folder dist\PostizRU-Setup:
#   Setup.exe, payload\ (compose with inline Temporal config, env template, PostizRU.exe, icon,
#   postiz-ru-image.tar.gz). Uses only csc.exe from .NET Framework 4.x.
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1 [-SkipImage]
param([switch]$SkipImage)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }

$dist = Join-Path $PSScriptRoot 'dist\PostizRU-Setup'
$payload = Join-Path $dist 'payload'
New-Item -ItemType Directory -Force $payload | Out-Null

$icon = Join-Path $PSScriptRoot 'assets\postiz-ru.ico'
$refs = '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:Microsoft.CSharp.dll', '/r:System.Core.dll'

& $csc /nologo /codepage:65001 /target:winexe /optimize+ "/win32icon:$icon" "/out:$payload\PostizRU.exe" `
    /main:PostizRu.LauncherProgram $refs src\Common.cs src\Launcher.cs
if ($LASTEXITCODE -ne 0) { throw 'csc PostizRU.exe failed' }

& $csc /nologo /codepage:65001 /target:winexe /optimize+ "/win32icon:$icon" "/win32manifest:assets\setup.manifest" `
    "/out:$dist\Setup.exe" /main:PostizRu.SetupProgram $refs src\Common.cs src\Setup.cs
if ($LASTEXITCODE -ne 0) { throw 'csc Setup.exe failed' }

$deploy = Resolve-Path (Join-Path $PSScriptRoot '..\..\deploy\gravmix')
Copy-Item (Join-Path $deploy 'docker-compose.yml') $payload -Force
Copy-Item (Join-Path $deploy '.env.example') $payload -Force
Copy-Item $icon $payload -Force
Copy-Item (Join-Path $PSScriptRoot 'assets\README.txt') $dist -Force

if (-not $SkipImage) {
    $tar = Join-Path $env:TEMP 'postiz-ru-image.tar'
    $gz = Join-Path $payload 'postiz-ru-image.tar.gz'
    docker image inspect postiz-ru:latest | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'image postiz-ru:latest not found, build it first' }
    Write-Host 'docker save postiz-ru:latest ...'
    docker save -o $tar postiz-ru:latest
    if ($LASTEXITCODE -ne 0) { throw 'docker save failed' }
    Write-Host 'gzip ...'
    $in = [System.IO.File]::OpenRead($tar)
    $out = [System.IO.File]::Create($gz)
    $zip = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionLevel]::Optimal)
    $in.CopyTo($zip, 4MB)
    $zip.Dispose(); $out.Dispose(); $in.Dispose()
    Remove-Item $tar -Force
}

Get-ChildItem $dist -Recurse -File | Select-Object FullName, @{n='MB';e={[math]::Round($_.Length / 1MB, 1)}}
