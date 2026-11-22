param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$')]
    [string]$RepositoryUrl
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = '2.7.5'
$tools = Join-Path $root '.tools'
$localDotnet = Join-Path $tools 'dotnet\dotnet.exe'
$dotnet = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { (Get-Command dotnet -ErrorAction Stop).Source }
$wix = (Get-Command wix -ErrorAction Stop).Source
$publish = Join-Path $tools 'publish-win-x64'
$artifacts = Join-Path $root 'release-artifacts'

& (Join-Path $PSScriptRoot 'build-public.ps1') -RepositoryUrl $RepositoryUrl
New-Item -ItemType Directory -Force -Path $publish, $artifacts | Out-Null
& $dotnet publish (Join-Path $root 'agent\AudioDuckingAgent.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeAllContentForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o $publish -v minimal
if ($LASTEXITCODE -ne 0) { throw 'Windows agent publish failed.' }
& $wix build -arch x64 -d "Version=$version" -d "PublishDir=$publish" -d "ProjectDir=$root" -ext WixToolset.UI.wixext (Join-Path $root 'agent\AudioDuckingAgent.wxs') -o (Join-Path $artifacts "Audio-Ducking-Windows-Agent-$version-x64.msi")
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }

$assets = @(
    (Join-Path $artifacts 'ChatGPT-Audio-Ducking.user.js'),
    (Join-Path $artifacts "Audio-Ducking-Windows-Agent-$version-x64.msi")
)
$hashes = $assets | ForEach-Object { $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_; "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))" }
[IO.File]::WriteAllLines((Join-Path $artifacts 'SHA256SUMS.txt'), $hashes, [Text.UTF8Encoding]::new($false))
Write-Output "Prepared local v$version assets and SHA-256 hashes; nothing was published."
