param(
    [string]$RepositoryUrl = 'https://github.com/fevegit/chatduck'
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-installer.ps1') -RepositoryUrl $RepositoryUrl
if ($LASTEXITCODE -ne 0) { throw 'The consolidated ChatDuck build failed.' }
