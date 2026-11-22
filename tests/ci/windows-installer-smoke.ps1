param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:ImageOS -notmatch '^win') {
    throw 'This destructive MSI smoke test is restricted to an ephemeral GitHub-hosted Windows runner.'
}

$msi = (Resolve-Path -LiteralPath $MsiPath).Path
$runnerTemp = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$artifactDir = (Resolve-Path -LiteralPath 'release-artifacts').Path.TrimEnd('\') + '\'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\ChatGPTAudioDuckingTM'
$configPath = Join-Path $installDir 'agent.json'
$startupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$startupValue = 'ChatGPTAudioDuckingAgent'
$menuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ChatDuck'
$logInstall = Join-Path $runnerTemp 'chatduck-msi-install.log'
$logUninstall = Join-Path $runnerTemp 'chatduck-msi-uninstall.log'
$agentPath = Join-Path $installDir 'ChatGPTAudioDuckingAgent.exe'
$baseUri = [Uri]'http://127.0.0.1:48731/'
$client = [Net.Http.HttpClient]::new([Net.Http.HttpClientHandler]@{ UseProxy = $false })
$agentProcess = $null
$installAttempted = $false

if (-not $msi.StartsWith($artifactDir, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'MSI input must come from this workflow run release-artifacts directory.'
}
if (Test-Path -LiteralPath $installDir) { throw 'The isolated runner already contains the agent install directory.' }
if (Get-Process -Name ChatGPTAudioDuckingAgent -ErrorAction SilentlyContinue) { throw 'An agent process already exists in this runner profile.' }

function Invoke-Msi {
    param([string[]]$MsiArguments)
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $env:SystemRoot 'System32\msiexec.exe'
    $start.UseShellExecute = $false
    foreach ($argument in $MsiArguments) { [void]$start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    $process.WaitForExit()
    if ($process.ExitCode -notin @(0, 3010)) { throw "msiexec failed with exit code $($process.ExitCode)." }
}

function Start-Agent {
    $script:agentProcess = Start-Process -FilePath $script:agentPath -PassThru -WindowStyle Hidden
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 250
        if ($script:agentProcess.HasExited) { throw "Agent exited during startup with code $($script:agentProcess.ExitCode)." }
        try {
            $response = $script:client.GetAsync([Uri]::new($script:baseUri, 'settings')).GetAwaiter().GetResult()
            if ($response.StatusCode -eq [Net.HttpStatusCode]::OK) { $response.Dispose(); return }
            $response.Dispose()
        } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Agent did not accept a local HTTP connection within 30 seconds.'
}

function New-Nonce {
    $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
    [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-Hmac {
    param([string]$Key, [string]$Message)
    $hmac = [Security.Cryptography.HMACSHA256]::new([Convert]::FromHexString($Key))
    try { [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Message))).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    finally { $hmac.Dispose() }
}

function Send-StatusRequest {
    param([string]$Key, [string]$Nonce = (New-Nonce))
    $body = '{"command":"status"}'
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString([Globalization.CultureInfo]::InvariantCulture)
    $signature = Get-Hmac $Key "req`nPOST`n/v1/command`n$timestamp`n$Nonce`n$body"
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [Uri]::new($script:baseUri, 'v1/command'))
    $request.Content = [Net.Http.StringContent]::new($body, [Text.Encoding]::UTF8, 'application/json')
    [void]$request.Headers.TryAddWithoutValidation('X-Audio-Ducking-Timestamp', $timestamp)
    [void]$request.Headers.TryAddWithoutValidation('X-Audio-Ducking-Nonce', $Nonce)
    [void]$request.Headers.TryAddWithoutValidation('X-Audio-Ducking-Signature', $signature)
    $response = $null
    try {
        $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $result = [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $text; Nonce = $Nonce; ResponseNonce = $null; ResponseSignature = $null }
        if ($response.Headers.Contains('X-Audio-Ducking-Response-Nonce')) {
            $result.ResponseNonce = $response.Headers.GetValues('X-Audio-Ducking-Response-Nonce') | Select-Object -First 1
        }
        if ($response.Headers.Contains('X-Audio-Ducking-Response-Signature')) {
            $result.ResponseSignature = $response.Headers.GetValues('X-Audio-Ducking-Response-Signature') | Select-Object -First 1
        }
        return $result
    } finally { $request.Dispose(); if ($response) { $response.Dispose() } }
}

try {
    $installAttempted = $true
    Invoke-Msi @('/i', $msi, '/qn', '/norestart', '/l*v', $logInstall)
    if (-not (Test-Path -LiteralPath $agentPath -PathType Leaf)) { throw 'Per-user agent executable was not installed.' }
    foreach ($file in @('settings.html', 'ChatGPT-Audio-Ducking.template.user.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $installDir $file) -PathType Leaf)) { throw "Installed file missing: $file" }
    }
    if (-not (Test-Path -LiteralPath $menuDir -PathType Container)) { throw 'Per-user Start Menu shortcut folder was not installed.' }
    $uninstallEntries = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).DisplayName -eq 'ChatDuck Windows Agent' }
    if (@($uninstallEntries).Count -ne 1) { throw 'Expected exactly one per-user uninstall registry entry.' }
    $machineEntries = Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).DisplayName -eq 'ChatDuck Windows Agent' }
    if (@($machineEntries).Count -ne 0) { throw 'The MSI unexpectedly registered a machine-wide install.' }

    Start-Agent
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'First agent run did not create its per-install config.' }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.Token -notmatch '^[a-fA-F0-9]{64}$') { throw 'First agent run did not generate a fresh 256-bit token.' }
    $token = $config.Token

    $unauth = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [Uri]::new($baseUri, 'v1/command'))
    $unauth.Content = [Net.Http.StringContent]::new('{"command":"status"}', [Text.Encoding]::UTF8, 'application/json')
    try {
        $unauthResponse = $client.SendAsync($unauth).GetAwaiter().GetResult()
        if ([int]$unauthResponse.StatusCode -ne 401) { throw 'Agent accepted a command without authentication.' }
        $unauthResponse.Dispose()
    } finally { $unauth.Dispose() }

    $invalidPair = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [Uri]::new($baseUri, 'v1/pair'))
    $invalidPair.Content = [Net.Http.StringContent]::new('{"code":"invalid-test-code"}', [Text.Encoding]::UTF8, 'application/json')
    try {
        $pairResponse = $client.SendAsync($invalidPair).GetAwaiter().GetResult()
        if ([int]$pairResponse.StatusCode -ne 401) { throw 'Agent accepted an invalid pairing code.' }
        $pairResponse.Dispose()
    } finally { $invalidPair.Dispose() }

    $nonce = New-Nonce
    $authenticated = Send-StatusRequest -Key $token -Nonce $nonce
    if ($authenticated.Status -ne 200 -or $authenticated.ResponseNonce -ne $nonce -or -not $authenticated.ResponseSignature) {
        throw 'Agent rejected an authenticated HMAC status command or did not sign its response.'
    }
    $expectedResponseSignature = Get-Hmac $token "resp`n200`n$nonce`n$($authenticated.Body)"
    if ($authenticated.ResponseSignature -cne $expectedResponseSignature) { throw 'Agent response HMAC validation failed.' }
    $replay = Send-StatusRequest -Key $token -Nonce $nonce
    if ($replay.Status -ne 401) { throw 'Agent accepted a replayed nonce.' }
    Write-Output 'PASS real MSI install; fresh token; unauthenticated and invalid-pair requests rejected; HMAC and replay checks passed.'

    $autostartBody = '{"command":"set-autostart","enabled":true}'
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString([Globalization.CultureInfo]::InvariantCulture)
    $autoNonce = New-Nonce
    $autoSignature = Get-Hmac $token "req`nPOST`n/v1/command`n$stamp`n$autoNonce`n$autostartBody"
    $autoRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [Uri]::new($baseUri, 'v1/command'))
    $autoRequest.Content = [Net.Http.StringContent]::new($autostartBody, [Text.Encoding]::UTF8, 'application/json')
    [void]$autoRequest.Headers.TryAddWithoutValidation('X-Audio-Ducking-Timestamp', $stamp)
    [void]$autoRequest.Headers.TryAddWithoutValidation('X-Audio-Ducking-Nonce', $autoNonce)
    [void]$autoRequest.Headers.TryAddWithoutValidation('X-Audio-Ducking-Signature', $autoSignature)
    try {
        $autoResponse = $client.SendAsync($autoRequest).GetAwaiter().GetResult()
        if ([int]$autoResponse.StatusCode -ne 200) { throw 'Could not create the isolated test startup entry.' }
        $autoResponse.Dispose()
    } finally { $autoRequest.Dispose() }
    $registeredStartup = (Get-ItemProperty -LiteralPath $startupKey).$startupValue
    if ($registeredStartup -notmatch [regex]::Escape($agentPath)) { throw 'The test startup value does not point to this agent.' }

    $shutdown = Start-Process -FilePath $agentPath -ArgumentList '--shutdown' -PassThru -Wait -WindowStyle Hidden
    if ($shutdown.ExitCode -ne 0) { throw 'The agent did not shut down cleanly.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $disconnected = $false
    do {
        Start-Sleep -Milliseconds 250
        $probe = $null
        try { $probe = $client.GetAsync([Uri]::new($baseUri, 'settings')).GetAwaiter().GetResult() }
        catch { $disconnected = $true }
        finally { if ($probe) { $probe.Dispose() } }
    } while (-not $disconnected -and [DateTime]::UtcNow -lt $deadline)
    if (-not $disconnected) { throw 'The agent did not disconnect after shutdown.' }
    Write-Output 'PASS agent shutdown and loopback disconnection.'

    Start-Agent
    $reconnected = Send-StatusRequest -Key $token
    if ($reconnected.Status -ne 200 -or $reconnected.ResponseNonce -ne $reconnected.Nonce) { throw 'Agent did not reconnect after restart.' }
    Write-Output 'PASS agent restart and authenticated reconnection.'

    $shutdown = Start-Process -FilePath $agentPath -ArgumentList '--shutdown' -PassThru -Wait -WindowStyle Hidden
    if ($shutdown.ExitCode -ne 0) { throw 'The agent did not stop before uninstall.' }
    $agentProcess = $null

    Invoke-Msi @('/x', $msi, '/qn', '/norestart', '/l*v', $logUninstall)
    $installAttempted = $false
    if (Test-Path -LiteralPath $agentPath) { throw 'Uninstaller left the agent executable behind.' }
    if (Test-Path -LiteralPath $configPath) { throw 'Uninstaller left the per-install token/config behind.' }
    if (Test-Path -LiteralPath $menuDir) { throw 'Uninstaller left its Start Menu directory behind.' }
    if (Test-Path -LiteralPath $startupKey) {
        $remainingStartup = (Get-ItemProperty -LiteralPath $startupKey -ErrorAction SilentlyContinue).$startupValue
        if ($remainingStartup) { throw 'Uninstaller left the agent-owned startup value behind.' }
    }
    $remainingEntries = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).DisplayName -eq 'ChatDuck Windows Agent' }
    if (@($remainingEntries).Count -ne 0) { throw 'Uninstaller left its per-user uninstall entry behind.' }
    Write-Output 'PASS clean MSI uninstall, owned startup cleanup, and per-user registry cleanup.'
    'Passed: hosted Windows MSI install/uninstall and live local-agent protocol checks. Tampermonkey/browser integration is not exercised by this smoke test.' |
        Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
}
finally {
    if ($agentProcess -and -not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force -ErrorAction SilentlyContinue }
    $client.Dispose()
    if ($installAttempted -and (Test-Path -LiteralPath $msi)) {
        try { Invoke-Msi @('/x', $msi, '/qn', '/norestart', '/l*v', $logUninstall) } catch { Write-Warning 'Emergency MSI cleanup failed; the runner is ephemeral.' }
    }
}
