param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$')]
    [string]$RepositoryUrl
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = '2.7.6-beta.1'
$msiVersion = '2.7.6'
$tools = Join-Path $root '.tools'
$localDotnet = Join-Path $tools 'dotnet\dotnet.exe'
$dotnet = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { (Get-Command dotnet -ErrorAction Stop).Source }
$wix = (Get-Command wix -ErrorAction Stop).Source
$publish = Join-Path $tools 'publish-win-x64'
$artifacts = Join-Path $root 'release-artifacts'
$msi = Join-Path $artifacts "ChatDuck-Windows-Agent-$version-x64.msi"
$wixPdb = [IO.Path]::ChangeExtension($msi, '.wixpdb')
$hashFile = Join-Path $artifacts 'SHA256SUMS.txt'

& (Join-Path $PSScriptRoot 'build-public.ps1') -RepositoryUrl $RepositoryUrl
New-Item -ItemType Directory -Force -Path $publish, $artifacts | Out-Null
Remove-Item -LiteralPath $msi, $wixPdb, $hashFile -Force -ErrorAction SilentlyContinue
$staleAssets = @(
    (Join-Path $artifacts 'ChatGPT-Audio-Ducking.user.js'),
    (Join-Path $artifacts 'Audio-Ducking-Windows-Agent-2.7.5-x64.msi'),
    (Join-Path $artifacts 'ChatDuck-Windows-Agent-2.7.5-x64.msi'),
    (Join-Path $artifacts 'ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi')
)
Remove-Item -LiteralPath $staleAssets -Force -ErrorAction SilentlyContinue
& $dotnet publish (Join-Path $root 'agent\AudioDuckingAgent.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeAllContentForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o $publish -v minimal
if ($LASTEXITCODE -ne 0) { throw 'Windows agent publish failed.' }
& $wix build -arch x64 -d "Version=$msiVersion" -d "PublishDir=$publish" -d "ProjectDir=$root" -ext WixToolset.UI.wixext (Join-Path $root 'agent\AudioDuckingAgent.wxs') -o $msi
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
Remove-Item -LiteralPath $wixPdb -Force -ErrorAction SilentlyContinue

$assets = @(
    (Join-Path $artifacts 'ChatDuck.user.js'),
    $msi
)
$hashes = $assets | ForEach-Object { $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_; "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))" }
[IO.File]::WriteAllLines($hashFile, $hashes, [Text.UTF8Encoding]::new($false))
Write-Output "Prepared local v$version assets (MSI ProductVersion $msiVersion) and SHA-256 hashes; nothing was published."
