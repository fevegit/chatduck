param(
    [string]$RepositoryUrl = 'https://github.com/fevegit/chatduck'
)

$ErrorActionPreference = 'Stop'
$projectPath = Join-Path $PSScriptRoot '..\agent\AudioDuckingAgent.csproj'
[xml]$project = Get-Content -LiteralPath $projectPath -Raw
$Version = [string]$project.Project.PropertyGroup.Version
if ([string]::IsNullOrWhiteSpace($Version)) { throw 'The product version must be defined once in agent/AudioDuckingAgent.csproj.' }
if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:-(alpha|rc)\.(\d+))?$') { throw 'Version must be numeric major.minor.patch with an optional alpha|rc suffix.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = Join-Path $root 'out'
$work = Join-Path $out '.work'
$publish = Join-Path $work 'agent-publish'
$generatedWxs = Join-Path $work 'AgentFiles.generated.wxs'
$productVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
$outputMsi = Join-Path $out "ChatDuck-Windows-Agent-$Version-x64.msi"
$outputScript = Join-Path $out 'ChatGPT-Audio-Ducking.user.js'
$dotnet = Join-Path $root '.tools\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = Join-Path $env:USERPROFILE '.dotnet\dotnet.exe' }
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = 'dotnet' }
$wix = (Get-Command wix -ErrorAction Stop).Source
$sourceRevision = (& git -C $root rev-parse --verify HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceRevision -notmatch '^[0-9a-f]{40}$') { throw 'A Git commit hash is required for build metadata.' }

& (Join-Path $PSScriptRoot 'build-public.ps1') -RepositoryUrl $RepositoryUrl -Version $Version -OutputPath $outputScript
if (-not (Test-Path -LiteralPath $outputScript)) { throw 'Userscript build failed.' }

& $dotnet publish (Join-Path $root 'agent\AudioDuckingAgent.csproj') --artifacts-path (Join-Path $work 'dotnet-artifacts') `
    -c Release -r win-x64 --self-contained false -o $publish -p:PublishSingleFile=true `
    -p:SourceRevisionId=$sourceRevision -p:IncludeSourceRevisionInInformationalVersion=false
if ($LASTEXITCODE -ne 0) { throw 'Framework-dependent agent publish failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $publish 'ChatGPTAudioDuckingAgent.exe'))) { throw 'Agent apphost was not published.' }

$files = @(
    Get-ChildItem -LiteralPath $publish -File | Where-Object { $_.Extension -notin @('.pdb', '.xml') } | Sort-Object Name
    Get-Item -LiteralPath (Join-Path $root 'settings.html')
)
$files += [pscustomobject]@{ FullName = $outputScript; Name = 'ChatGPT-Audio-Ducking.template.user.js' }
$fileIndex = 0
$escapedFiles = foreach ($file in $files) {
    $fileIndex++
    $id = if ($file.Name -eq 'ChatGPTAudioDuckingAgent.exe') { 'AgentExeFile' } else { "AgentFile_$fileIndex" }
    $name = [Security.SecurityElement]::Escape($file.Name)
    $source = [Security.SecurityElement]::Escape($file.FullName)
    "      <File Id=`"$id`" Name=`"$name`" Source=`"$source`" />"
}
$componentGuid = '{A61D604D-606A-48EC-8C80-A0D641322508}'
$fragment = @"
<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Fragment>
    <ComponentGroup Id="AgentFiles">
      <Component Id="AgentFilesPerUser" Directory="INSTALLFOLDER" Guid="$componentGuid">
$(($escapedFiles -join "`r`n"))
        <RegistryValue Root="HKCU" Key="Software\Microsoft\Windows\CurrentVersion\Run" Name="ChatGPTAudioDuckingAgent" Type="string" Value="&quot;[INSTALLFOLDER]ChatGPTAudioDuckingAgent.exe&quot;" KeyPath="yes" />
        <RemoveFolder Id="RemoveAgentInstallFolder" Directory="INSTALLFOLDER" On="uninstall" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
"@
[IO.Directory]::CreateDirectory($work) | Out-Null
[IO.File]::WriteAllText($generatedWxs, $fragment, [Text.UTF8Encoding]::new($false))

& $wix build (Join-Path $root 'agent\AudioDuckingAgent.wxs') $generatedWxs `
    -arch x64 `
    -d "ProjectDir=$root" -d "PublishDir=$publish" -d "ProductVersion=$productVersion" -d "ProductVersionString=$Version" `
    -d 'UpgradeCode={3D7AE35B-6377-42AB-A8F4-FA26D7DC7F8A}' `
    -intermediateFolder (Join-Path $work 'wix-intermediate') -pdbtype none -o $outputMsi
if ($LASTEXITCODE -ne 0) { throw 'WiX MSI build failed.' }
if (-not (Test-Path -LiteralPath $outputMsi)) { throw 'MSI was not produced.' }

$validationReport = Join-Path $out 'validation-report.md'
$validation = & $wix msi validate -intermediateFolder (Join-Path $work 'ice-validation') $outputMsi 2>&1
$validationExit = $LASTEXITCODE
$validationText = ($validation | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
$database = (New-Object -ComObject WindowsInstaller.Installer).OpenDatabase((Resolve-Path $outputMsi).Path, 0)
$view = $database.OpenView('SELECT `Action`, `Condition`, `Sequence` FROM `InstallExecuteSequence`')
$view.Execute()
$sequence = @{}
while ($record = $view.Fetch()) {
    $sequence[$record.StringData(1)] = [pscustomobject]@{ Condition = $record.StringData(2); Number = $record.IntegerData(3) }
}
$requiredActions = @('StopPreviousAgent', 'RestorePreviousAgentOnRollback', 'InstallInitialize', 'InstallFiles', 'StopNewAgentOnRollback', 'StartAndVerifyAgent', 'InstallExecute', 'RemoveExistingProducts', 'InstallFinalize', 'StopAgentBeforeUninstall', 'RemoveFiles')
foreach ($action in $requiredActions) { if (-not $sequence.ContainsKey($action)) { throw "MSI is missing required transaction action '$action'." } }
if (-not ($sequence.StopPreviousAgent.Number -lt $sequence.InstallInitialize.Number -and
          $sequence.RestorePreviousAgentOnRollback.Number -lt $sequence.InstallFiles.Number -and
          $sequence.InstallFiles.Number -lt $sequence.StopNewAgentOnRollback.Number -and
          $sequence.StopNewAgentOnRollback.Number -lt $sequence.StartAndVerifyAgent.Number -and
          $sequence.StartAndVerifyAgent.Number -lt $sequence.InstallFinalize.Number -and
          $sequence.InstallExecute.Number -lt $sequence.RemoveExistingProducts.Number -and
          $sequence.RemoveExistingProducts.Number -lt $sequence.InstallFinalize.Number -and
          $sequence.StopAgentBeforeUninstall.Number -lt $sequence.RemoveFiles.Number)) {
    throw 'MSI install/upgrade/rollback action sequence is not transaction-safe.'
}
$transactionLines = $requiredActions | ForEach-Object { "$_=$($sequence[$_].Number) $($sequence[$_].Condition)" }
$transactionLines += @(
    'Static case: clean install runs runtime LaunchConditions before InstallInitialize and verifies the spawned agent before InstallFinalize.',
    'Static case: update removes the related MSI at sequence 6501, after InstallExecute 6500 and before InstallFinalize 6600; it is in the rollback transaction.',
    'Static case: repair follows the same launch/health check; the agent action is conditioned only on NOT REMOVE=ALL.',
    'Static case: uninstall stops the agent before RemoveFiles and does not remove the separate LocalAppData\ChatDuck data directory.',
    'Static case: cancellation before execute-phase changes invokes no agent/file mutation actions; cancellation during execute relies on MSI rollback actions.',
    'Static case: rollback order is stop-new, restore MSI files/registry, then launch and authenticate the restored process.'
)
$reportParts = [System.Collections.Generic.List[string]]::new()
$reportParts.Add("ChatDuck $Version MSI validation")
$reportParts.Add("MSI: $outputMsi")
$reportParts.Add('Validation command: wix msi validate (all standard ICEs)')
$reportParts.Add("Exit code: $validationExit")
$reportParts.Add('Expected warning: ICE91 for per-user files under LocalAppData; see docs/installer-peruser.md.')
$reportParts.Add('')
$reportParts.Add('InstallExecuteSequence inspection (MSI database read-only):')
foreach ($line in $transactionLines) { $reportParts.Add($line) }
$reportParts.Add('')
foreach ($line in ($validationText -split "`r?`n")) { $reportParts.Add($line) }
$reportText = [string]::Join([Environment]::NewLine, $reportParts)
[IO.File]::WriteAllText($validationReport, $reportText + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
if ($validationExit -ne 0) { throw "MSI ICE validation failed; inspect $validationReport." }

$agentVerification = & (Join-Path $root 'tests\verify-msi-agent-version.ps1') -MsiPath $outputMsi -ExpectedVersion $Version `
    -ExpectedMsiVersion $productVersion -ExpectedSourceRevision $sourceRevision -UserscriptPath $outputScript `
    -PublishAgentPath (Join-Path $publish 'ChatGPTAudioDuckingAgent.exe')
$validationText += [Environment]::NewLine + [Environment]::NewLine + 'Extracted MSI binary/protocol/userscript consistency test:' + [Environment]::NewLine + [string]$agentVerification
[IO.File]::WriteAllText($validationReport, $validationText + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$manifest = Join-Path $out 'SHA256SUMS.txt'
$hashLines = @($outputMsi, $outputScript) | ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllLines($manifest, $hashLines, [Text.UTF8Encoding]::new($false))

Write-Output "Built $outputMsi and $outputScript ($Version); ICE results: $validationReport."
