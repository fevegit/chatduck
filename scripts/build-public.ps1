param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$')]
    [string]$RepositoryUrl
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = '2.7.5'
$repository = ([Uri]$RepositoryUrl.TrimEnd('/')).AbsolutePath.Trim('/').Split('/')
if ($repository.Length -ne 2) { throw 'Indica la URL exacta del repositorio GitHub.' }
$owner, $name = $repository
$raw = "https://raw.githubusercontent.com/$owner/$name/main/ChatGPT-Audio-Ducking.user.js"
$installer = "https://github.com/$owner/$name/releases/download/v$version/Audio-Ducking-Windows-Agent-$version-x64.msi"

$header = @"
// ==UserScript==
// @name         ChatGPT Audio Ducking
// @name:en      ChatGPT Audio Ducking
// @name:es      Audio Ducking para ChatGPT
// @namespace    https://local.chatgpt-audio-ducking/
// @version      $version
// @description  Pause or lower selected players while dictating in ChatGPT.
// @description:en Pause or lower selected players while dictating in ChatGPT.
// @description:es Pausa o atenúa los reproductores seleccionados mientras dictas en ChatGPT.
// @homepageURL  https://github.com/$owner/$name
// @supportURL   https://github.com/$owner/$name/issues
// @updateURL    $raw
// @downloadURL  $raw
// @match        https://chatgpt.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://youtu.be/*
// @match        https://open.spotify.com/*
// @match        https://twitch.tv/*
// @match        https://www.twitch.tv/*
// @match        https://app.plex.tv/*
// @match        http://127.0.0.1/*
// @CUSTOM_SITE_MATCHES@
// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @sandbox      DOM
// @run-at       document-start
// @noframes
// ==/UserScript==

"@

$orderedSources = @('i18n.js', 'core.js', 'media-controller.js', 'chatgpt-detector.js', 'agent-client.js', 'settings-page.js', 'entry.js')
$builder = [System.Text.StringBuilder]::new($header)
foreach ($file in $orderedSources) {
    $path = Join-Path $root "src\$file"
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing source module: $file" }
    [void]$builder.AppendLine((Get-Content -LiteralPath $path -Raw -Encoding UTF8))
}

$script = $builder.ToString()
$agentMarker = '"__WINDOWS_AGENT_DOWNLOAD_URL__"'
if ([regex]::Matches($script, [regex]::Escape($agentMarker)).Count -ne 1) { throw 'The Windows agent download marker must appear exactly once.' }
$script = $script.Replace($agentMarker, ('"' + $installer + '"'))
if ([regex]::Matches($script, [regex]::Escape('// @CUSTOM_SITE_MATCHES@')).Count -ne 1) { throw 'Custom-site marker must appear exactly once.' }
$script = $script.Replace('// @CUSTOM_SITE_MATCHES@', '')

$output = Join-Path $root 'ChatGPT-Audio-Ducking.user.js'
[IO.File]::WriteAllText($output, $script, [Text.UTF8Encoding]::new($false))
New-Item -ItemType Directory -Force -Path (Join-Path $root 'release-artifacts') | Out-Null
Copy-Item -LiteralPath $output -Destination (Join-Path $root 'release-artifacts\ChatGPT-Audio-Ducking.user.js') -Force
Write-Output "Built generic userscript v$version for $RepositoryUrl"
