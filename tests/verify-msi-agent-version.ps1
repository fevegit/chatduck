param(
    [Parameter(Mandatory = $true)][string]$MsiPath,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedMsiVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceRevision,
    [Parameter(Mandatory = $true)][string]$UserscriptPath,
    [Parameter(Mandatory = $true)][string]$PublishAgentPath
)

$ErrorActionPreference = 'Stop'
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$UserscriptPath = (Resolve-Path -LiteralPath $UserscriptPath).Path
$PublishAgentPath = (Resolve-Path -LiteralPath $PublishAgentPath).Path
$hash = (Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant()
$root = Join-Path (Split-Path $MsiPath) ".work\msi-agent-verification-$hash"
$export = Join-Path $root 'embedded'
$decompiled = Join-Path $root 'package.wxs'
$wix = (Get-Command wix -ErrorAction Stop).Source
[IO.Directory]::CreateDirectory($root) | Out-Null
$agent = Join-Path $export 'File\AgentExeFile'
$publishedHash = (Get-FileHash -LiteralPath $PublishAgentPath -Algorithm SHA256).Hash
if (Test-Path -LiteralPath $agent) {
    if ((Get-FileHash -LiteralPath $agent -Algorithm SHA256).Hash -ne $publishedHash) {
        throw 'The cached MSI extraction does not match this package; refusing stale verification.'
    }
} else {
    & $wix msi decompile $MsiPath -x $export -intermediateFolder (Join-Path $root 'intermediate') -o $decompiled
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract the MSI contents for verification.' }
    if (-not (Test-Path -LiteralPath $agent)) { throw 'The MSI does not contain the expected agent executable.' }
}
$packagedHash = (Get-FileHash -LiteralPath $agent -Algorithm SHA256).Hash
if ($packagedHash -ne $publishedHash) { throw 'The executable extracted from the MSI differs from the published build.' }

$fileInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($agent)
if ($fileInfo.FileVersion -ne "$ExpectedMsiVersion.0" -or $fileInfo.ProductVersion -ne $ExpectedVersion) {
    throw "Extracted agent metadata mismatch: file=$($fileInfo.FileVersion), product=$($fileInfo.ProductVersion)."
}
function Invoke-AgentVersionCheck([string[]]$arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $agent
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WorkingDirectory = Split-Path $agent
    foreach ($argument in $arguments) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    if (-not $process.WaitForExit(15000)) { throw 'The isolated extracted-binary version verifier did not exit within 15 seconds.' }
    return $process.ExitCode
}
$matchingExitCode = Invoke-AgentVersionCheck @('--installer-check-version', $ExpectedVersion, '--source-revision', $ExpectedSourceRevision)
if ($matchingExitCode -ne 0) { throw "The extracted agent rejected its own expected product version (exit $matchingExitCode)." }
$mismatchingExitCode = Invoke-AgentVersionCheck @('--installer-check-version', "$ExpectedVersion-mismatch")
if ($mismatchingExitCode -ne 20) { throw "Strict version mismatch guard returned $mismatchingExitCode instead of 20." }

$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($MsiPath, 0)
function Get-MsiProperty([string]$name) {
    $sql = 'SELECT `Value` FROM `Property` WHERE `Property`=''' + $name.Replace("'", "''") + ''''
    $view = $database.OpenView($sql)
    $view.Execute() | Out-Null
    $record = $view.Fetch()
    if (-not $record) { throw "MSI property '$name' is missing." }
    $value = [string]$record.StringData(1)
    return $value
}
$msiVersion = Get-MsiProperty 'ProductVersion'
$upgradeCode = Get-MsiProperty 'UpgradeCode'
if ($msiVersion -ne $ExpectedMsiVersion) { throw "MSI ProductVersion '$msiVersion' does not match '$ExpectedMsiVersion'." }
if ($upgradeCode -ne '{3D7AE35B-6377-42AB-A8F4-FA26D7DC7F8A}') { throw 'The MSI UpgradeCode changed unexpectedly.' }

$scriptVersion = [regex]::Match((Get-Content -LiteralPath $UserscriptPath -Raw), '(?m)^// @version\s+([^\r\n]+)').Groups[1].Value
if ($scriptVersion -ne $ExpectedVersion) { throw "Userscript @version '$scriptVersion' does not match '$ExpectedVersion'." }
$source = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot) 'agent\Program.cs') -Raw
if ($source -notmatch '\["agentVersion"\]\s*=\s*typeof\(Program\)\.Assembly\.GetCustomAttribute<System\.Reflection\.AssemblyInformationalVersionAttribute>\(\)') {
    throw 'The authenticated status protocol no longer reports the compiled informational product version.'
}
if ($source -notmatch '\["agentSourceRevision"\]\s*=\s*Program\.GetSourceRevision\(\)') {
    throw 'The authenticated status protocol no longer reports the separate compiled source revision.'
}
$project = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot) 'agent\AudioDuckingAgent.csproj') -Raw
if ($project -notmatch '<IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>' -or
    $project -notmatch '<AssemblyMetadata Include="SourceRevisionId" Value="\$\(SourceRevisionId\)"') {
    throw 'Git source revision must remain separate from the product version.'
}
if ($ExpectedSourceRevision -notmatch '^[0-9a-f]{40}$') { throw 'Build source revision is not a full Git commit hash.' }

[pscustomobject]@{
    ExecutableExtractedFromMsi = $true
    MsiProductVersion = $msiVersion
    AgentFileVersion = $fileInfo.FileVersion
    AgentProductVersion = $fileInfo.ProductVersion
    UserscriptVersion = $scriptVersion
    ExtractedAgentSha256 = $packagedHash
    PublishedAgentSha256 = $publishedHash
    StrictVersionMatchExitCode = $matchingExitCode
    StrictVersionMismatchExitCode = $mismatchingExitCode
    SourceRevision = $ExpectedSourceRevision
    ProtocolVersionSourceChecked = $true
} | ConvertTo-Json -Compress
