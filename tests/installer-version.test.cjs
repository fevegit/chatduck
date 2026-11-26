const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("consolidated framework-dependent release has one coherent version and stable MSI identity", () => {
  const root = path.join(__dirname, "..");
  const build = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");
  const project = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.csproj"), "utf8");
  const wix = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.wxs"), "utf8");
  const userScriptBuilder = fs.readFileSync(path.join(root, "scripts", "build-public.ps1"), "utf8");

  assert.match(build, /\[xml\]\$project = Get-Content/);
  assert.match(build, /\$Version = \[string\]\$project\.Project\.PropertyGroup\.Version/);
  assert.match(build, /UpgradeCode=\{3D7AE35B-6377-42AB-A8F4-FA26D7DC7F8A\}/);
  assert.match(build, /ChatDuck-Windows-Agent-\$Version-x64\.msi/);
  assert.match(build, /ChatGPT-Audio-Ducking\.user\.js/);
  assert.match(project, /<Version>2\.8\.8-rc\.1<\/Version>/);
  assert.match(project, /<InformationalVersion>\$\(Version\)<\/InformationalVersion>/);
  assert.match(project, /<IncludeSourceRevisionInInformationalVersion>false<\/IncludeSourceRevisionInInformationalVersion>/);
  assert.match(project, /<AssemblyMetadata Include="SourceRevisionId" Value="\$\(SourceRevisionId\)"/);
  assert.match(project, /<AssemblyVersion>2\.8\.8\.0<\/AssemblyVersion>/);
  assert.match(project, /<FileVersion>2\.8\.8\.0<\/FileVersion>/);
  assert.match(wix, /Version="\$\(var\.ProductVersion\)"/);
  assert.match(wix, /UpgradeCode="\$\(var\.UpgradeCode\)"/);
  assert.match(wix, /Scope="perUser"/);
  assert.match(wix, /Name="ChatGPTAudioDuckingTM"/);
  assert.match(wix, /ChatGPTAudioDuckingAgent\.exe/);
  assert.match(userScriptBuilder, /@version      \$version/);
  assert.doesNotMatch(build, /prepare-final-candidate|build-installer-candidate|installer-bootstrapper/i);
});
