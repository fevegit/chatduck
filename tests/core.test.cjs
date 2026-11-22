const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

test("defaults to supported players with individual toggles and safe Windows selection", () => {
  const settings = core.normalizeSettings();
  assert.equal(settings.mode, "pause");
  assert.equal(settings.webIntegration, true);
  assert.deepEqual(settings.webPlatforms, { youtube: true, youtubeMusic: true, spotifyWeb: true, twitch: true, plexWeb: true, otherCompatible: false });
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
});

test("normalizes percentages, fade bounds, and excluded domains", () => {
  const settings = core.normalizeSettings({ mode: "duck", targetVolumePercent: 140, fadeOutMs: -10, fadeInMs: 5000, excludedDomains: " .Example.com ; bad_domain " });
  assert.equal(settings.mode, "duck");
  assert.equal(settings.targetVolumePercent, 100);
  assert.equal(settings.fadeOutMs, 0);
  assert.equal(settings.fadeInMs, 1500);
  assert.equal(settings.excludedDomains, "example.com");
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
  assert.equal(core.shouldManageWeb("https://example.com.attacker.net/", settings), false);
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
  assert.equal(core.shouldManageWeb("http://192.168.1.25:32401/web", settings), false);
  assert.equal(core.webPlayerKeyFor("http://192.168.1.25:32400/web", settings), "plexWeb");
});

test("player mode and target independently override or inherit global settings", () => {
  const settings = core.normalizeSettings({ mode: "pause", targetVolumePercent: 10, playerRules: {
    youtube: { mode: "duck", targetVolumePercent: 15 }, spotifyWeb: { mode: "general" }, twitch: { mode: "pause", targetVolumePercent: 22 }
  } });
  assert.deepEqual(core.resolvePlayerRule(settings, "youtube"), { mode: "duck", targetVolumePercent: 15, fadeOutMs: 200, fadeInMs: 350, fallbackDucking: true, fallbackToPause: true });
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

test("manages only selected web platforms, custom sites, or the main web switch", () => {
  const settings = core.normalizeSettings({ customSites: [{ domain: "example.com" }] });
  assert.equal(core.shouldManageWeb("https://www.youtube.com/watch?v=x", settings), true);
  assert.equal(core.shouldManageWeb("https://music.example.com/", settings), false);
  assert.equal(core.shouldManageWeb("https://music.example.com/", { ...settings, webPlatforms: { ...settings.webPlatforms, otherCompatible: true } }), true);
  assert.equal(core.shouldManageWeb("https://open.spotify.com/track/1", { ...settings, webIntegration: false }), false);
});

test("opens the standalone settings route on an already authorized HTTPS host", () => {
  assert.equal(core.isSettingsPage("https://chatgpt.com/#audio-ducking-settings"), true);
  assert.equal(core.isSettingsPage("https://chatgpt.com/"), false);
  assert.equal(core.shouldManageWeb("https://chatgpt.com/#audio-ducking-settings", core.normalizeSettings()), false);
});
