param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$')]
    [string]$RepositoryUrl,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+-(?:alpha|rc)\.\d+$')]
    [string]$Version,
    [string]$AgentDownloadUrl = '',
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = $Version
$repository = ([Uri]$RepositoryUrl.TrimEnd('/')).AbsolutePath.Trim('/').Split('/')
if ($repository.Length -ne 2) { throw 'Indica la URL exacta del repositorio GitHub.' }
$owner, $name = $repository
$raw = "https://raw.githubusercontent.com/$owner/$name/main/ChatGPT-Audio-Ducking.user.js"
$installer = if ([string]::IsNullOrWhiteSpace($AgentDownloadUrl)) { "https://github.com/$owner/$name/releases/download/v$version/ChatDuck-Windows-Agent-$version-x64.msi" } else { $AgentDownloadUrl }
$emDash = [char]0x2014
$oAcute = [char]0x00F3

$header = @"
// ==UserScript==
// @name         ChatGPT Audio Ducking
// @name:en      ChatGPT Audio Ducking
// @name:es      Audio Ducking para ChatGPT
// @namespace    https://local.chatgpt-audio-ducking/
// @version      $version
// @author       ChatDuck contributors
// @description  ChatDuck $emDash audio ducking for ChatGPT voice input.
// @description:en ChatDuck $emDash audio ducking for ChatGPT voice input.
// @description:es ChatDuck $emDash atenuaci$($oAcute)n de audio para la entrada de voz de ChatGPT.
// @homepageURL  https://github.com/$owner/$name
// @supportURL   https://github.com/$owner/$name/issues
// @updateURL    $raw
// @downloadURL  $raw
// @match        http://*/*
// @match        https://*/*
// @match        http://127.0.0.1/*
// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_info
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_audio
// @grant        GM_setClipboard
// @sandbox      DOM
// @run-at       document-start
// ==/UserScript==

"@

$orderedSources = @('i18n.js', 'core.js', 'media-controller.js', 'tab-audio-controller.js', 'chatgpt-detector.js', 'agent-client.js', 'settings-page.js', 'entry.js')
$builder = [System.Text.StringBuilder]::new($header)
$nativeCss = [IO.File]::ReadAllText((Join-Path $root 'src\native-preferences.css'), [Text.Encoding]::UTF8)
[void]$builder.AppendLine("globalThis.AudioDuckNativeTheme = $(ConvertTo-Json -InputObject $nativeCss -Compress);")
[void]$builder.AppendLine("globalThis.AudioDuckVersion = '$version';")
foreach ($file in $orderedSources) {
    $path = Join-Path $root "src\$file"
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing source module: $file" }
    [void]$builder.AppendLine((Get-Content -LiteralPath $path -Raw -Encoding UTF8))
}

$script = $builder.ToString()
$agentMarker = '"__WINDOWS_AGENT_DOWNLOAD_URL__"'
if ([regex]::Matches($script, [regex]::Escape($agentMarker)).Count -ne 1) { throw 'The Windows agent download marker must appear exactly once.' }
$script = $script.Replace($agentMarker, ('"' + $installer + '"'))

$output = if ([string]::IsNullOrWhiteSpace($OutputPath)) { Join-Path $root 'out\ChatGPT-Audio-Ducking.user.js' } else { [IO.Path]::GetFullPath($OutputPath) }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output)) | Out-Null
[IO.File]::WriteAllText($output, $script, [Text.UTF8Encoding]::new($false))
Write-Output "Built generic userscript v$version for $RepositoryUrl"
