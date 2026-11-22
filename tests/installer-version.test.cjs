const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Windows Agent beta MSI advances version without changing upgrade identity", () => {
  const root = path.join(__dirname, "..");
  const build = fs.readFileSync(path.join(root, "scripts", "build-release.ps1"), "utf8");
  const project = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.csproj"), "utf8");
  const wix = fs.readFileSync(path.join(root, "agent", "AudioDuckingAgent.wxs"), "utf8");
  const version = "2.7.6";
  const previousVersion = "2.7.5";

  assert.match(build, /\$version\s*=\s*'2\.7\.6-beta\.1'/);
  assert.match(build, /\$msiVersion\s*=\s*'2\.7\.6'/);
  assert.ok(version.localeCompare(previousVersion, undefined, { numeric: true }) > 0);
  assert.match(project, /<Version>2\.7\.6-beta\.1<\/Version>/);
  assert.match(project, /<AssemblyVersion>2\.7\.6\.0<\/AssemblyVersion>/);
  assert.match(project, /<FileVersion>2\.7\.6\.0<\/FileVersion>/);
  assert.match(wix, /Name="ChatDuck Windows Agent"/);
  assert.match(wix, /Version="\$\(var\.Version\)"/);
  assert.match(wix, /UpgradeCode="\{75A2EB87-3A7D-4A1C-A128-6BD4A88DB93F\}"/);
  assert.match(wix, /Scope="perUser"/);
  assert.match(wix, /<MajorUpgrade\b/);
  assert.match(wix, /Name="ChatGPTAudioDuckingTM"/);
  assert.match(wix, /ChatGPTAudioDuckingAgent\.exe/);
  assert.match(wix, /Name="ChatDuck"/);
});
