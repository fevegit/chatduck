const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("authoritative installer is per-user, transactional, and verifies the active agent", () => {
  const root = path.join(__dirname, "..");
  const wix = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.wxs"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");
  const program = fs.readFileSync(path.join(root, "agent", "Program.cs"), "utf8");
  const protocol = fs.readFileSync(path.join(root, "agent", "AgentProtocol.cs"), "utf8");
  const project = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.csproj"), "utf8");
  const report = fs.readFileSync(path.join(root, "docs", "installer-peruser.md"), "utf8");

  assert.match(wix, /Scope="perUser"/);
  assert.doesNotMatch(wix, /Scope="perMachine"|HKLM|asyncNoWait/i);
  assert.match(wix, /MajorUpgrade Schedule="afterInstallExecute"/);
  assert.match(wix, /Microsoft\.WindowsDesktop\.App/);
  assert.match(wix, /<Launch Condition="DOTNET_DESKTOP_USER OR DOTNET_DESKTOP_USER_PROGRAMS OR DOTNET_DESKTOP_MACHINE"/);
  assert.match(wix, /StopPreviousAgent" Before="InstallInitialize"/);
  assert.match(wix, /StopNewAgentOnRollback" Before="StartAndVerifyAgent"/);
  assert.match(wix, /StartAndVerifyAgent" Before="InstallFinalize"/);
  assert.match(wix, /Execute="deferred" Impersonate="yes" Return="check"/);
  assert.match(wix, /RestorePreviousAgentOnRollback" Before="InstallFiles"/);
  assert.match(wix, /PREVIOUS_AGENT_EXE/);
  assert.match(wix, /Binary Id="AgentRollbackHelper"/);
  assert.match(wix, /--installer-restore/);
  assert.match(wix, /--installer-stop-owned/);
  assert.match(wix, /StopAgentBeforeUninstall" Before="RemoveFiles"/);
  assert.match(build, /RegistryValue Root="HKCU" Key="Software\\Microsoft\\Windows\\CurrentVersion\\Run"[^\n]+KeyPath="yes"/);
  assert.match(build, /Component Id="AgentFilesPerUser" Directory="INSTALLFOLDER"/);
  assert.match(build, /out/);
  assert.match(build, /--self-contained false/);
  assert.match(build, /PublishSingleFile=true/);
  assert.match(build, /-arch x64/);
  assert.match(build, /SHA256SUMS\.txt/);
  assert.match(build, /validation-report\.md/);
  assert.doesNotMatch(build, /setup\.exe|bootstrapper|asyncNoWait/i);

  assert.match(program, /Path\.Combine\(Environment\.GetFolderPath\(Environment\.SpecialFolder\.LocalApplicationData\), "ChatDuck"\)/);
  assert.match(program, /AgentDataMigration\.MigrateLegacyDataIfNeeded/);
  const migration = fs.readFileSync(path.join(root, "agent", "Program.cs"), "utf8");
  assert.match(migration, /File\.Move\(temporary, destination, overwrite: false\)/);
  assert.match(program, /--installer-start/);
  assert.match(program, /--installer-check-version/);
  assert.match(program, /MatchesInstallerVersion\(expectedVersion\)/);
  assert.match(program, /agentVersion/);
  assert.match(program, /agentSourceRevision/);
  assert.match(program, /fileVersion == expectedFileVersion/);
  assert.match(program, /process\.Id/);
  assert.match(program, /pid == expectedPid/);
  assert.match(program, /agentExecutablePath/);
  assert.match(program, /agentSessionId/);
  assert.match(program, /agentIsElevated/);
  assert.match(program, /StartAndVerifyRestoredAgentAsync/);
  assert.match(program, /StopOwnedAgentForRollbackAsync/);
  assert.match(protocol, /RequestStatusAsync/);
  assert.match(protocol, /X-Audio-Ducking-Response-Signature/);
  assert.match(project, /<Version>2\.8\.9<\/Version>/);
  assert.doesNotMatch(program, /DiscordMuteDuringDictation|DiscordDeafenDuringDictation|discordMute|discordDeafen/i);
  assert.equal(fs.existsSync(path.join(root, "agent", "DiscordVoiceAutomation.cs")), false);
  assert.match(report, /ICE38/);
  assert.match(report, /ICE91/);
  assert.match(report, /Registry table key path rooted at `HKCU`/);
  assert.match(report, /warnings are not suppressed/i);
  assert.match(report, /rollback induced by a real failed MSI transaction has not been exercised/i);
});

test("MSI binary verification executes the extracted compiled executable with a strict version guard", () => {
  const root = path.join(__dirname, "..");
  const verifier = fs.readFileSync(path.join(root, "tests", "verify-msi-agent-version.ps1"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");

  assert.match(verifier, /wix msi decompile \$MsiPath -x \$export/);
  assert.match(verifier, /Get-FileHash -LiteralPath \$agent/);
  assert.match(verifier, /Diagnostics\.ProcessStartInfo/);
  assert.match(verifier, /\$mismatchingExitCode -ne 20/);
  assert.match(build, /tests\\verify-msi-agent-version\.ps1/);
});

test("consolidated package contains one MSI and userscript when built", (t) => {
  const out = path.join(__dirname, "..", "out");
  const msi = path.join(out, "ChatDuck-Windows-Agent-2.8.9-x64.msi");
  const script = path.join(out, "ChatGPT-Audio-Ducking.user.js");
  if (!fs.existsSync(msi) || !fs.existsSync(script)) return t.skip("Package build not run in this checkout.");
  const artifacts = fs.readdirSync(out).filter((name) => /\.msi$|\.user\.js$/.test(name));
  assert.deepEqual(artifacts.sort(), ["ChatDuck-Windows-Agent-2.8.9-x64.msi", "ChatGPT-Audio-Ducking.user.js"].sort());
  const header = fs.readFileSync(script, "utf8").slice(0, 500);
  assert.match(header, /@version\s+2\.8\.9/);
  const database = fs.readFileSync(msi);
  assert.ok(database.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])));
  assert.ok(database.length > 1024 * 1024);
});
