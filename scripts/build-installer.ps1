param(
    [string]$RepositoryUrl = 'https://github.com/fevegit/chatduck',
    [switch]$MsiOnly
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
$upgradeFilterDll = Join-Path $work 'ChatDuck.InstallerActions.CA.dll'
$upgradeFilterBuild = Join-Path $work 'upgrade-filter-build'
$upgradeFilterTestsBuild = Join-Path $work 'upgrade-filter-tests-build'
$productVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
$outputMsi = Join-Path $out "ChatDuck-Windows-Agent-$Version-x64.msi"
$stagedMsi = Join-Path $work "ChatDuck-Windows-Agent-$Version-x64.staged.msi"
$outputScript = Join-Path $out 'ChatGPT-Audio-Ducking.user.js'
$dotnet = Join-Path $root '.tools\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = Join-Path $env:USERPROFILE '.dotnet\dotnet.exe' }
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = 'dotnet' }
$wix = (Get-Command wix -ErrorAction Stop).Source
$sourceRevision = (& git -C $root rev-parse --verify HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceRevision -notmatch '^[0-9a-f]{40}$') { throw 'A Git commit hash is required for build metadata.' }

if ($MsiOnly) {
    if (-not (Test-Path -LiteralPath (Join-Path $publish 'ChatGPTAudioDuckingAgent.exe'))) { throw 'MSI-only build requires the verified existing 2.8.9 agent publish in out/.work.' }
    if (-not (Test-Path -LiteralPath $outputScript)) { throw 'MSI-only build requires the existing 2.8.9 userscript in out/.' }
} else {
    & (Join-Path $PSScriptRoot 'build-public.ps1') -RepositoryUrl $RepositoryUrl -Version $Version -OutputPath $outputScript
    if (-not (Test-Path -LiteralPath $outputScript)) { throw 'Userscript build failed.' }

    & $dotnet publish (Join-Path $root 'agent\AudioDuckingAgent.csproj') --artifacts-path (Join-Path $work 'dotnet-artifacts') `
        -c Release -r win-x64 --self-contained false -o $publish -p:PublishSingleFile=true `
        -p:SourceRevisionId=$sourceRevision -p:IncludeSourceRevisionInInformationalVersion=false
    if ($LASTEXITCODE -ne 0) { throw 'Framework-dependent agent publish failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $publish 'ChatGPTAudioDuckingAgent.exe'))) { throw 'Agent apphost was not published.' }
}

& $dotnet build (Join-Path $root 'installer\UpgradeFilter\UpgradeFilter.csproj') --artifacts-path $upgradeFilterBuild -c Release -p:Platform=x64
if ($LASTEXITCODE -ne 0) { throw 'Installer upgrade-filter build failed.' }
$upgradeFilterAssembly = Get-ChildItem -LiteralPath $upgradeFilterBuild -Recurse -File -Filter 'ChatDuck.InstallerActions.CA.dll' |
    Where-Object { $_.FullName -match '[\\/]bin[\\/]UpgradeFilter[\\/]release[\\/]' } | Select-Object -First 1
if (-not $upgradeFilterAssembly) { throw 'Installer upgrade-filter assembly was not found in its build output.' }

& $dotnet build (Join-Path $root 'tests\installer-upgrade-filter\InstallerUpgradeFilter.Tests.csproj') --artifacts-path $upgradeFilterTestsBuild -c Release
if ($LASTEXITCODE -ne 0) { throw 'Installer upgrade-filter regression tests failed to build.' }
$filterTests = Get-ChildItem -LiteralPath $upgradeFilterTestsBuild -Recurse -File -Filter 'ChatDuck.InstallerUpgradeFilter.Tests.exe' |
    Where-Object { $_.FullName -match '[\\/]bin[\\/]InstallerUpgradeFilter.Tests[\\/]release[\\/]' } | Select-Object -First 1
if (-not $filterTests) { throw 'Installer upgrade-filter regression test executable was not found.' }
& $filterTests.FullName
if ($LASTEXITCODE -ne 0) { throw 'Installer upgrade-filter regression tests failed.' }

$upgradeFilterDll = $upgradeFilterAssembly.FullName
$upgradeFilterPackageHash = (Get-FileHash -LiteralPath $upgradeFilterDll -Algorithm SHA256).Hash
$customActionConfig = Join-Path $root 'installer\UpgradeFilter\CustomAction.config'
[xml]$customActionConfigXml = Get-Content -LiteralPath $customActionConfig -Raw
$startupElement = $customActionConfigXml.configuration.startup
if ($startupElement.useLegacyV2RuntimeActivationPolicy -ne 'true' -or
    $startupElement.supportedRuntime.version -ne 'v4.0' -or
    $startupElement.supportedRuntime.sku -ne '.NETFramework,Version=v4.8') {
    throw 'The DTF SfxCA runtime configuration must select CLR v4/.NET Framework 4.8 with legacy activation policy enabled.'
}
$frameworkRelease = [int](Get-ItemPropertyValue -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release -ErrorAction Stop)
if ($frameworkRelease -lt 528040) { throw 'The .NET Framework 4.8 runtime required by the DTF SfxCA action is not available.' }
$probeResponse = Get-ChildItem -LiteralPath $upgradeFilterBuild -Recurse -File -Filter 'ChatDuck.InstallerActions.CA.rsp' | Select-Object -First 1
if (-not $probeResponse) { throw 'DTF packaging response file was not produced.' }
$probeResponseText = Get-Content -LiteralPath $probeResponse.FullName -Raw
if ($probeResponseText -notmatch 'CustomAction\.config' -or $probeResponseText -notmatch 'WixToolset\.Dtf\.WindowsInstaller\.dll') {
    throw 'DTF SfxCA package input is missing CustomAction.config or WixToolset.Dtf.WindowsInstaller.dll.'
}
$peStream = [IO.File]::OpenRead($upgradeFilterDll)
$peReader = $null
try {
    $peReader = [IO.BinaryReader]::new($peStream)
    if ($peReader.ReadUInt16() -ne 0x5A4D) { throw 'The SfxCA package has no valid PE header.' }
    $peStream.Position = 0x3C
    $peOffset = $peReader.ReadInt32()
    $peStream.Position = $peOffset
    if ($peReader.ReadUInt32() -ne 0x00004550 -or $peReader.ReadUInt16() -ne 0x8664) {
        throw 'The DTF SfxCA package is not x64.'
    }
} finally {
    if ($peReader) { $peReader.Dispose() } else { $peStream.Dispose() }
}
$probeMsi = Join-Path $work 'UpgradeFilterProbe.msi'
$probeLog = Join-Path $work 'UpgradeFilterProbe.log'
& $wix build (Join-Path $root 'tests\installer-upgrade-filter\Probe.wxs') -arch x64 `
    -d "UpgradeFilterDll=$upgradeFilterDll" -intermediateFolder (Join-Path $work 'upgrade-filter-probe-wix') -pdbtype none -o $probeMsi
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $probeMsi)) { throw 'Non-destructive SfxCA probe MSI build failed.' }
$probeArguments = "/i `"$probeMsi`" /qn /norestart /L*v `"$probeLog`" WIX_UPGRADE_DETECTED={3191BE8A-141E-4A9A-B46B-8645CEE48E6C}"
$probeProcess = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\msiexec.exe') -ArgumentList $probeArguments -Wait -PassThru
$probeExitCode = $probeProcess.ExitCode
$probeText = Get-Content -LiteralPath $probeLog -Raw
$probeSucceeded = $probeExitCode -eq 1603 -and
    $probeText.Contains('SFXCA: Binding to CLR version v4.0.30319') -and
    $probeText.Contains('ChatDuck upgrade filter: ProductCode {3191BE8A-141E-4A9A-B46B-8645CEE48E6C} is registered') -and
    $probeText.Contains('ChatDuck upgrade filter: validated WIX_UPGRADE_DETECTED') -and
    $probeText.Contains('Doing action: AbortAfterFilter') -and
    -not $probeText.Contains('Doing action: InstallInitialize') -and
    -not $probeText.Contains('Failed to get requested CLR info')
$probeInstaller = New-Object -ComObject WindowsInstaller.Installer
$probeSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$probeProducts = @($probeInstaller.ProductsEx('{AC54222E-90BF-4DD9-96DF-146B92273C94}', $probeSid, 7))
[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($probeInstaller)
if (-not $probeSucceeded -or $probeProducts.Count -ne 0) {
    throw "Real Windows Installer SfxCA probe failed or left its test ProductCode registered (exit $probeExitCode); inspect $probeLog."
}
$probeSummary = "Real non-destructive Windows Installer SfxCA probe passed: CLR v4.0.30319 loaded; x64 package; .NET Framework release $frameworkRelease; CustomAction.config and WixToolset.Dtf.WindowsInstaller.dll were included; filter action succeeded; intentional abort occurred before InstallInitialize; process exit 1603 captured; probe ProductCode not registered. Log: $probeLog."

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
    -d "ProjectDir=$root" -d "PublishDir=$publish" -d "UpgradeFilterDll=$upgradeFilterDll" -d "ProductVersion=$productVersion" -d "ProductVersionString=$Version" `
    -d 'UpgradeCode={3D7AE35B-6377-42AB-A8F4-FA26D7DC7F8A}' `
    -intermediateFolder (Join-Path $work 'wix-intermediate') -pdbtype none -o $stagedMsi
if ($LASTEXITCODE -ne 0) { throw 'WiX MSI build failed.' }
if (-not (Test-Path -LiteralPath $stagedMsi)) { throw 'Staged MSI was not produced.' }
if ((Get-FileHash -LiteralPath $upgradeFilterDll -Algorithm SHA256).Hash -ne $upgradeFilterPackageHash) {
    throw 'The SfxCA package changed after its real Windows Installer probe.'
}

$validationReport = Join-Path $out 'validation-report.md'
$validation = & $wix msi validate -intermediateFolder (Join-Path $work 'ice-validation') $stagedMsi 2>&1
$validationExit = $LASTEXITCODE
$validationText = ($validation | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
$database = (New-Object -ComObject WindowsInstaller.Installer).OpenDatabase((Resolve-Path $stagedMsi).Path, 0)
$view = $database.OpenView('SELECT `Action`, `Condition`, `Sequence` FROM `InstallExecuteSequence`')
$view.Execute()
$sequence = @{}
while ($record = $view.Fetch()) {
    $sequence[$record.StringData(1)] = [pscustomobject]@{ Condition = $record.StringData(2); Number = $record.IntegerData(3) }
}
$uiView = $database.OpenView('SELECT `Action`, `Condition`, `Sequence` FROM `InstallUISequence`')
$uiView.Execute()
$uiSequence = @{}
while ($record = $uiView.Fetch()) {
    $uiSequence[$record.StringData(1)] = [pscustomobject]@{ Condition = $record.StringData(2); Number = $record.IntegerData(3) }
}
$customActionView = $database.OpenView('SELECT `Type`, `Source`, `Target` FROM `CustomAction` WHERE `Action` = ''FilterDetectedUpgradeProducts''')
$customActionView.Execute()
$filterActionRecord = $customActionView.Fetch()
$upgradeView = $database.OpenView('SELECT `ActionProperty` FROM `Upgrade`')
$upgradeView.Execute()
$upgradeProperties = @()
while ($record = $upgradeView.Fetch()) { $upgradeProperties += $record.StringData(1) }
$requiredActions = @('FindRelatedProducts', 'FilterDetectedUpgradeProducts', 'MigrateFeatureStates', 'StopPreviousAgent', 'RestorePreviousAgentOnRollback', 'InstallInitialize', 'InstallFiles', 'StopNewAgentOnRollback', 'StartAndVerifyAgent', 'InstallExecute', 'RemoveExistingProducts', 'InstallFinalize', 'StopAgentBeforeUninstall', 'RemoveFiles')
foreach ($action in $requiredActions) { if (-not $sequence.ContainsKey($action)) { throw "MSI is missing required transaction action '$action'." } }
if (-not ($sequence.StopPreviousAgent.Number -lt $sequence.InstallInitialize.Number -and
          $sequence.FindRelatedProducts.Number -lt $sequence.FilterDetectedUpgradeProducts.Number -and
          $sequence.FilterDetectedUpgradeProducts.Number -lt $sequence.MigrateFeatureStates.Number -and
          $sequence.FilterDetectedUpgradeProducts.Number -lt $sequence.RemoveExistingProducts.Number -and
          $sequence.RestorePreviousAgentOnRollback.Number -lt $sequence.InstallFiles.Number -and
          $sequence.InstallFiles.Number -lt $sequence.StopNewAgentOnRollback.Number -and
          $sequence.StopNewAgentOnRollback.Number -lt $sequence.StartAndVerifyAgent.Number -and
          $sequence.StartAndVerifyAgent.Number -lt $sequence.InstallFinalize.Number -and
          $sequence.InstallExecute.Number -lt $sequence.RemoveExistingProducts.Number -and
          $sequence.RemoveExistingProducts.Number -lt $sequence.InstallFinalize.Number -and
          $sequence.StopAgentBeforeUninstall.Number -lt $sequence.RemoveFiles.Number)) {
    throw 'MSI install/upgrade/rollback action sequence is not transaction-safe.'
}
if (-not ($uiSequence.ContainsKey('FindRelatedProducts') -and $uiSequence.ContainsKey('FilterDetectedUpgradeProducts') -and
          $uiSequence.ContainsKey('MigrateFeatureStates') -and
          $uiSequence.FindRelatedProducts.Number -lt $uiSequence.FilterDetectedUpgradeProducts.Number -and
          $uiSequence.FilterDetectedUpgradeProducts.Number -lt $uiSequence.MigrateFeatureStates.Number)) {
    throw 'Interactive MSI upgrade sequence does not validate ActionProperty between FindRelatedProducts and MigrateFeatureStates.'
}
if (-not $filterActionRecord -or $filterActionRecord.StringData(2) -ne 'UpgradeRegistrationFilter' -or
    $filterActionRecord.StringData(3) -ne 'FilterDetectedUpgradeProducts') {
    throw 'MSI CustomAction table does not point the filter action at the expected embedded CA entry point.'
}
if (-not ($upgradeProperties -contains 'WIX_UPGRADE_DETECTED' -and $upgradeProperties -contains 'WIX_DOWNGRADE_DETECTED')) {
    throw 'MSI Upgrade table lost the upgrade or downgrade ActionProperty.'
}
$allowedWarnings = @($validationText -split "`r?`n" | Where-Object { $_ -match '(?i)warning' -and $_ -notmatch '(?i)ICE91' })
$validationErrors = @($validationText -split "`r?`n" | Where-Object { $_ -match '(?i)error|ICE\d{2,}' -and $_ -notmatch '(?i)ICE91' })
if ($allowedWarnings.Count -gt 0 -or $validationErrors.Count -gt 0) {
    throw 'MSI validation produced an unexpected warning or ICE result; inspect validation-report.md.'
}
$comObjects = @($record, $filterActionRecord, $view, $uiView, $customActionView, $upgradeView, $database)
foreach ($comObject in $comObjects) {
    if ($null -ne $comObject -and [Runtime.InteropServices.Marshal]::IsComObject($comObject)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($comObject)
    }
}
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
$transactionLines = $requiredActions | ForEach-Object { "$_=$($sequence[$_].Number) $($sequence[$_].Condition)" }
$transactionLines += 'InstallUISequence: FindRelatedProducts -> FilterDetectedUpgradeProducts -> MigrateFeatureStates (interactive/reduced UI).'
$transactionLines += 'CustomAction row: source=UpgradeRegistrationFilter, entry point=FilterDetectedUpgradeProducts; Upgrade table retains WIX_UPGRADE_DETECTED and WIX_DOWNGRADE_DETECTED.'
$transactionLines += @(
    'Interactive/reduced-UI installs filter in InstallUISequence before MigrateFeatureStates; quiet installs skip that table and filter in InstallExecuteSequence. Both paths filter after FindRelatedProducts and before MigrateFeatureStates/RemoveExistingProducts.',
    'The filter validates each WIX_UPGRADE_DETECTED ProductCode with MsiEnumProductsEx and MsiGetProductInfoEx in the current-user scope. It excludes only the globally audited orphan {7418F7B0-E537-417D-97CC-C47AF92904B2}, after confirming no current-user product instance or component client; all errors and unknown ProductCodes fail closed.',
    'The valid {3191BE8A-141E-4A9A-B46B-8645CEE48E6C} registration is preserved in WIX_UPGRADE_DETECTED and remains subject to normal MigrateFeatureStates and RemoveExistingProducts processing. WIX_DOWNGRADE_DETECTED is not modified.',
    'Static case: clean install runs runtime LaunchConditions before InstallInitialize and verifies the spawned agent before InstallFinalize.',
    'Static case: update removes the related MSI at sequence 6501, after InstallExecute 6500 and before InstallFinalize 6600; it is in the rollback transaction.',
    'Static case: repair follows the same launch/health check; the agent action is conditioned only on NOT REMOVE=ALL.',
    'Static case: uninstall stops the agent before RemoveFiles and does not remove the separate LocalAppData\ChatDuck data directory.',
    'Static case: cancellation before execute-phase changes invokes no agent/file mutation actions; cancellation during execute relies on MSI rollback actions.',
    'Static case: rollback order is stop-new, restore MSI files/registry, then launch and authenticate the restored process.'
)
$reportParts = [System.Collections.Generic.List[string]]::new()
$reportParts.Add("ChatDuck $Version MSI validation")
$reportParts.Add("MSI: $outputMsi (staged and validated before promotion)")
$reportParts.Add('Validation command: wix msi validate (all standard ICEs)')
$reportParts.Add("Exit code: $validationExit")
$reportParts.Add('Expected warning: ICE91 for per-user files under LocalAppData; see docs/installer-peruser.md.')
$reportParts.Add($probeSummary)
$reportParts.Add('')
$reportParts.Add('InstallExecuteSequence inspection (MSI database read-only):')
foreach ($line in $transactionLines) { $reportParts.Add($line) }
$reportParts.Add('')
foreach ($line in ($validationText -split "`r?`n")) { $reportParts.Add($line) }
$reportText = [string]::Join([Environment]::NewLine, $reportParts)
[IO.File]::WriteAllText($validationReport, $reportText + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
if ($validationExit -ne 0) { throw "MSI ICE validation failed; inspect $validationReport." }

$agentVerification = & (Join-Path $root 'tests\verify-msi-agent-version.ps1') -MsiPath $stagedMsi -ExpectedVersion $Version `
    -ExpectedMsiVersion $productVersion -ExpectedSourceRevision $sourceRevision -UserscriptPath $outputScript `
    -PublishAgentPath (Join-Path $publish 'ChatGPTAudioDuckingAgent.exe')
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
$validationText += [Environment]::NewLine + [Environment]::NewLine + 'Extracted MSI binary/protocol/userscript consistency test:' + [Environment]::NewLine + [string]$agentVerification
$reportParts.Add('')
$reportParts.Add('Extracted MSI binary/protocol/userscript consistency test:')
$reportParts.Add([string]$agentVerification)
[IO.File]::WriteAllText($validationReport, [string]::Join([Environment]::NewLine, $reportParts) + [Environment]::NewLine + [Environment]::NewLine + $validationText + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $outputMsi) {
    $promotionBackup = Join-Path $work 'previous-msi-promotion.tmp'
    if (Test-Path -LiteralPath $promotionBackup) { throw "Temporary MSI promotion backup already exists; inspect it before continuing: $promotionBackup" }
    $expectedPromotedHash = (Get-FileHash -LiteralPath $stagedMsi -Algorithm SHA256).Hash
    [IO.File]::Replace($stagedMsi, $outputMsi, $promotionBackup)
    $actualPromotedHash = (Get-FileHash -LiteralPath $outputMsi -Algorithm SHA256).Hash
    if ($actualPromotedHash -ne $expectedPromotedHash) {
        [IO.File]::Replace($promotionBackup, $outputMsi, $stagedMsi)
        throw 'MSI promotion hash mismatch; previous package was restored.'
    }
    [IO.File]::Delete($promotionBackup)
} else {
    [IO.File]::Move($stagedMsi, $outputMsi)
}

$manifest = Join-Path $out 'SHA256SUMS.txt'
$hashLines = @($outputMsi, $outputScript) | ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllLines($manifest, $hashLines, [Text.UTF8Encoding]::new($false))

Write-Output "Built $outputMsi and $outputScript ($Version); ICE results: $validationReport."
