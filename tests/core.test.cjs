const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

test("defaults to universal web media and safe Windows selection", () => {
  const settings = core.normalizeSettings();
  assert.equal(settings.mode, "duck");
  assert.equal(settings.webIntegration, true);
  assert.equal(settings.universalWebControl, true);
  assert.equal(settings.webAudioMuteFallback, false);
  assert.equal(settings.fallbackToPause, false);
  assert.equal(settings.fallbackDucking, false);
  assert.deepEqual(settings.plexOrigins, []);
  assert.deepEqual(settings.playerRules, {});
  assert.equal(settings.targetVolumePercent, 10);
  assert.equal(settings.fadeOutMs, 200);
  assert.equal(settings.fadeInMs, 350);
  assert.deepEqual(settings.windowsApps, []);
  assert.equal(settings.spotifyDesktop, true);
  assert.equal(settings.voiceMode, false);
  assert.equal(settings.modalSize, "auto");
  for (const url of ["https://www.youtube.com/watch?v=1", "https://music.youtube.com/watch?v=1", "https://open.spotify.com/track/1", "https://twitch.tv/channel", "https://app.plex.tv/"]) {
    assert.equal(core.shouldManageWeb(url, settings), true);
  }
  assert.equal(core.shouldManageWeb("https://unknown-player.example/", settings), true);
  assert.equal(core.shouldManageWeb("https://discord.com/channels/1/2", settings), false);
});

test("legacy removed settings are ignored without resetting user audio preferences", () => {
  const settings = core.normalizeSettings({
    mode: "duck", targetVolumePercent: 23, excludedDomains: "example.org",
    windowsApps: [{ path: "C:\\Apps\\Player.exe", enabled: true }],
    discord: { enabled: true }, discordActivationMode: "ctrl-click",
    discordMuteDuringDictation: true, discordDeafenDuringDictation: true
  });
  assert.equal(settings.targetVolumePercent, 23);
  assert.equal(settings.excludedDomains, "example.org");
  assert.equal(settings.windowsApps[0].path, "C:\\Apps\\Player.exe");
  assert.equal(Object.hasOwn(settings, "discordMuteDuringDictation"), false);
  assert.equal(Object.hasOwn(settings, "discordDeafenDuringDictation"), false);
  assert.equal(Object.hasOwn(settings, "discordActivationMode"), false);
  assert.equal(Object.hasOwn(settings, "discord"), false);
});

test("new installs default to Ducking while an existing explicit Pause preference is preserved", () => {
  assert.equal(core.normalizeSettings({}).mode, "duck");
  assert.equal(core.normalizeSettings({ mode: "pause" }).mode, "pause");
  assert.equal(core.normalizeSettings({ mode: "duck" }).mode, "duck");
});

test("media fallbacks are opt-in, retain explicit preferences, and survive web-control toggles", () => {
  assert.equal(core.normalizeSettings({}).fallbackDucking, false);
  assert.equal(core.normalizeSettings({}).fallbackToPause, false);
  assert.equal(core.normalizeSettings({ fallbackDucking: true, fallbackToPause: true, universalWebControl: false }).fallbackDucking, true);
  assert.equal(core.normalizeSettings({ fallbackDucking: true, fallbackToPause: true, universalWebControl: false }).fallbackToPause, true);
});

test("normalizes percentages, fade bounds, and excluded domains", () => {
  const settings = core.normalizeSettings({ mode: "duck", targetVolumePercent: 140, fadeOutMs: -10, fadeInMs: 5000, excludedDomains: " .Example.com ; bad_domain " });
  assert.equal(settings.mode, "duck");
  assert.equal(settings.targetVolumePercent, 100);
  assert.equal(settings.fadeOutMs, 0);
  assert.equal(settings.fadeInMs, 1500);
  assert.equal(settings.excludedDomains, "example.com");
  assert.equal(core.normalizeSettings({ excludedDomains: "http://Media.Example.com/watch" }).excludedDomains, "media.example.com");
});

test("Web Audio tab-mute fallback is opt-in and normalized strictly", () => {
  assert.equal(core.normalizeSettings({ webAudioMuteFallback: true }).webAudioMuteFallback, true);
  assert.equal(core.normalizeSettings({ webAudioMuteFallback: "true" }).webAudioMuteFallback, false);
});

test("YouTube and Spotify Web can be enabled independently", () => {
  const settings = core.normalizeSettings({ webPlatforms: { youtube: false, spotifyWeb: false } });
  assert.equal(core.shouldManageWeb("https://www.youtube.com/watch?v=x", settings), false);
  assert.equal(core.shouldManageWeb("https://music.youtube.com/watch?v=x", settings), true);
  assert.equal(core.shouldManageWeb("https://open.spotify.com/track/1", settings), false);
  assert.equal(core.shouldManageWeb("https://twitch.tv/channel", settings), true);
  assert.equal(core.shouldManageWeb("https://chatgpt.com/", settings), false);
  assert.equal(core.shouldManageWeb("http://127.0.0.1:48731/settings", settings), false);
});

test("validates custom sites and uses boundary-safe domain matches", () => {
  assert.equal(core.normalizeCustomDomain("https://Media.Example.com/player?id=1"), "media.example.com");
  assert.equal(core.normalizeCustomDomain("example.com"), "example.com");
  for (const value of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "localhost", "192.168.1.2", "https://example.local", "https://chatgpt.com", "not a domain"]) {
    assert.equal(core.normalizeCustomDomain(value), null, value);
  }
  const settings = core.normalizeSettings({
    webPlatforms: { otherCompatible: true },
    customSites: [{ domain: "example.com", enabled: true }]
  });
  assert.equal(core.shouldManageWeb("https://media.example.com/player", settings), true);
  assert.equal(core.shouldManageWeb("https://example.com.attacker.net/", settings), true);
  assert.equal(core.isExcluded("example.com.attacker.net", "example.com"), false);
});

test("custom-site add, disable, and remove are normalized", () => {
  const added = core.normalizeSettings({ customSites: [{ domain: "https://example.com/path" }, { domain: "EXAMPLE.COM", enabled: false }, { domain: "bad_domain" }] });
  assert.deepEqual(added.customSites, [{ domain: "example.com", enabled: true }]);
  const disabled = core.normalizeSettings({ customSites: added.customSites.map((site) => ({ ...site, enabled: false })) });
  assert.equal(disabled.customSites[0].enabled, false);
  assert.deepEqual(core.normalizeSettings({ customSites: disabled.customSites.filter((site) => site.domain !== "example.com") }).customSites, []);
});

test("Plex Web accepts only explicit exact server origins and app.plex.tv", () => {
  assert.equal(core.normalizePlexOrigin("http://192.168.1.25:32400/web"), "http://192.168.1.25:32400");
  assert.equal(core.normalizePlexOrigin("https://plex.example.com:32400"), "https://plex.example.com:32400");
  assert.equal(core.normalizePlexOrigin("http://plex.example.com:32400"), null);
  assert.equal(core.normalizePlexOrigin("http://8.8.8.8:32400"), null);
  assert.equal(core.normalizePlexOrigin("http://192.168.1.25:32400/other"), null);
  assert.equal(core.normalizePlexOrigin("https://user@plex.example.com"), null);
  const settings = core.normalizeSettings({ plexOrigins: ["http://192.168.1.25:32400"] });
  assert.equal(core.shouldManageWeb("https://app.plex.tv/desktop", settings), true);
  assert.equal(core.shouldManageWeb("http://192.168.1.25:32400/web", settings), true);
  assert.equal(core.shouldManageWeb("http://192.168.1.25:32401/web", settings), true);
  assert.equal(core.webPlayerKeyFor("http://192.168.1.25:32400/web", settings), "plexWeb");
});

test("player mode and target independently override or inherit global settings", () => {
  const settings = core.normalizeSettings({ mode: "pause", targetVolumePercent: 10, playerRules: {
    youtube: { mode: "duck", targetVolumePercent: 15 }, spotifyWeb: { mode: "general" }, twitch: { mode: "pause", targetVolumePercent: 22 }
  } });
  assert.deepEqual(core.resolvePlayerRule(settings, "youtube"), { mode: "duck", targetVolumePercent: 15, fadeOutMs: 200, fadeInMs: 350, fallbackDucking: false, fallbackToPause: false });
  assert.equal(core.resolvePlayerRule(settings, "spotifyWeb").mode, "pause");
  assert.equal(core.resolvePlayerRule(settings, "spotifyWeb").targetVolumePercent, 10);
  assert.equal(core.resolvePlayerRule(settings, "twitch").mode, "pause");
  assert.equal(core.resolvePlayerRule(settings, "twitch").targetVolumePercent, 22);
  assert.equal(core.resolvePlayerRule(settings, "unknown").mode, "pause");
});

test("legacy custom targets migrate unchanged and can inherit without losing their saved value", () => {
  const settings = core.normalizeSettings({ mode: "duck", targetVolumePercent: 10, playerRules: {
    youtube: { mode: "duck", targetVolumePercent: 24 }, spotifyWeb: { mode: "duck", targetVolumePercent: null }
  } });
  assert.equal(settings.playerRules.youtube.targetVolumeSource, "custom");
  assert.equal(core.resolvePlayerRule(settings, "youtube").targetVolumePercent, 24);
  assert.equal(settings.playerRules.spotifyWeb.targetVolumeSource, "global");
  assert.equal(core.resolvePlayerRule(settings, "spotifyWeb").targetVolumePercent, 10);

  const inherited = core.normalizeSettings({ ...settings, playerRules: {
    ...settings.playerRules, youtube: { ...settings.playerRules.youtube, targetVolumeSource: "global" }
  } });
  assert.equal(inherited.playerRules.youtube.targetVolumePercent, 24);
  assert.equal(core.resolvePlayerRule(inherited, "youtube").targetVolumePercent, 10);
  const restored = core.normalizeSettings({ ...inherited, playerRules: {
    ...inherited.playerRules, youtube: { ...inherited.playerRules.youtube, targetVolumeSource: "custom" }
  } });
  assert.equal(core.resolvePlayerRule(restored, "youtube").targetVolumePercent, 24);
});

test("modal size preference is persistent and normalizes invalid values to Auto", () => {
  assert.equal(core.normalizeSettings({ modalSize: "large" }).modalSize, "large");
  assert.equal(core.normalizeSettings({ modalSize: "unexpected" }).modalSize, "auto");
});

test("normalizes selected Windows executables by stable exact path", () => {
  const settings = core.normalizeSettings({ windowsApps: [
    { path: "c:/Program Files/Player/player.exe", appUserModelIds: ["Player.Package_abcd"] },
    { path: "C:\\Program Files\\Player\\player.exe" },
    { path: "player.exe" },
    { path: "\\\\server\\share\\player.exe" },
    { path: "C:\\Windows\\System32\\svchost.dll" }
  ] });
  assert.deepEqual(settings.windowsApps, [{ path: "C:\\Program Files\\Player\\player.exe", enabled: true, appUserModelIds: ["Player.Package_abcd"] }]);
});

test("universal web control honors exclusions, legacy platform disables, and overrides", () => {
  const settings = core.normalizeSettings({ customSites: [{ domain: "example.com" }] });
  assert.equal(core.shouldManageWeb("https://www.youtube.com/watch?v=x", settings), true);
  assert.equal(core.shouldManageWeb("https://music.example.com/", settings), true);
  assert.equal(core.shouldManageWeb("https://music.example.com/", { ...settings, excludedDomains: "example.com" }), false);
  assert.equal(core.shouldManageWeb("https://youtube.com/", { ...settings, webPlatforms: { ...settings.webPlatforms, youtube: false } }), false);
  assert.equal(core.shouldManageWeb("https://open.spotify.com/track/1", { ...settings, webIntegration: false }), false);
  assert.equal(core.shouldManageWeb("https://music.example.com/", { ...settings, websiteOverrides: { ...settings.websiteOverrides, "example.com": { enabled: false } } }), false);
});

test("excluded top-level domains also block media in cross-origin child frames", () => {
  const settings = core.normalizeSettings({ excludedDomains: "stream.example" });
  assert.equal(core.shouldManageWeb("https://cdn.player.test/embed", settings, ["stream.example"]), false);
  assert.equal(core.shouldManageWeb("https://cdn.player.test/embed", settings, ["other.example"]), true);
  assert.equal(core.shouldManageWeb("https://discord.com/widget", settings, ["other.example"]), false);
});

test("migrates disabled legacy sites and custom per-site behavior", () => {
  const settings = core.normalizeSettings({ mode: "pause", targetVolumePercent: 10, customSites: [{ domain: "example.com" }, { domain: "blocked.example", enabled: false }], playerRules: {
    "custom:example.com": { mode: "duck", targetVolumePercent: 22, targetVolumeSource: "custom" }
  } });
  assert.equal(settings.excludedDomains, "blocked.example");
  assert.deepEqual(core.resolveWebsiteOverride(settings, "https://video.example.com/watch").mode, "duck");
  assert.equal(core.resolveWebsiteOverride(settings, "https://video.example.com/watch").targetVolumePercent, 22);
});

test("opens the standalone settings route on an already authorized HTTPS host", () => {
  assert.equal(core.isSettingsPage("https://chatgpt.com/#audio-ducking-settings"), true);
  assert.equal(core.isSettingsPage("https://chatgpt.com/"), false);
  assert.equal(core.shouldManageWeb("https://chatgpt.com/#audio-ducking-settings", core.normalizeSettings()), false);
});
