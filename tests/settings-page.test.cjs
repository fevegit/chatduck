const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../src/core.js");
require("../src/i18n.js");
require("../src/settings-page.js");

test("native interface keeps six short tabs, a fixed shell, one universal web switch, and Ko-fi in the footer", async () => {
  const previousTheme = globalThis.AudioDuckNativeTheme;
  globalThis.AudioDuckNativeTheme = fs.readFileSync(path.join(__dirname, "../src/native-preferences.css"), "utf8");
  const shadow = new ShadowHarness();
  const settings = core.normalizeSettings({ windowsApps: [{ path: "C:\\Apps\\plezy.exe", enabled: true, appUserModelIds: [] }] });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({ agent: { ok: false, installed: false } }) });
  page.shadow = shadow; page.opened = true;
  try {
    await page.render();
    assert.match(shadow.html, /data-nav="general"[^>]*>General<\/button>/);
    assert.match(shadow.html, /data-nav="browser"[^>]*>Web<\/button>/);
    assert.match(shadow.html, /data-nav="desktop"[^>]*>Windows<\/button>/);
    assert.match(shadow.html, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
    assert.match(shadow.html, /height:min\(480px/);
    assert.match(shadow.html, /overflow-y:auto;overflow-x:hidden/);
    assert.equal((shadow.html.match(/role="tab" data-nav=/g) || []).length, 6);
    assert.equal((shadow.html.match(/data-web-control/g) || []).length, 1);
    assert.doesNotMatch(shadow.html, /data-setting="(?:webIntegration|universalWebControl)"/);
    assert.match(shadow.html, /href="https:\/\/ko-fi\.com\/fevee"[^>]*rel="noopener noreferrer"/);
    assert.match(shadow.html, /<label class="language-label"[^>]*><span class="language-text">Language<\/span><select/);
    assert.match(shadow.html, /aria-label="Remove plezy" title="Remove application"/);
    assert.match(shadow.html, /remove-button[^>]*><svg viewBox="0 0 24 24"[^>]*aria-hidden="true"/);
    const nativeCss = fs.readFileSync(path.join(__dirname, "../src/native-preferences.css"), "utf8");
    assert.match(nativeCss, /\.native-footer \.language-label\{display:inline-flex;align-items:center/);
    assert.match(nativeCss, /\.native-footer \.language-label \.language-text\{display:inline-flex;align-items:center;min-height:30px/);
    assert.match(nativeCss, /\.native-footer \.language-label select\{display:block;box-sizing:border-box;min-width:82px;height:30px;min-height:30px;[^}]*appearance:none;[^}]*background-position:right 3px center/);
    assert.match(nativeCss, /\.remove-button svg\{display:block;width:17px;height:17px/);
    assert.match(shadow.html, /data-agent-status>Windows agent not installed/);
    assert.doesNotMatch(shadow.html, /Browser mode — Ready/);
    assert.match(shadow.html, /data-setting="fallbackDucking"/);
    assert.match(shadow.html, /data-setting="fallbackToPause"/);
    assert.match(shadow.html, /data-setting="webAudioMuteFallback"/);
  } finally {
    if (previousTheme === undefined) delete globalThis.AudioDuckNativeTheme;
    else globalThis.AudioDuckNativeTheme = previousTheme;
  }
});

test("one web toggle synchronizes legacy fields, while active-session controls stay unchanged", async () => {
  let settings = core.normalizeSettings({ webIntegration: false, universalWebControl: true, fallbackToPause: true });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async (value) => { settings = core.normalizeSettings(value); }, getState: async () => ({}) });
  const toggle = { checked: true, closest: (selector) => selector === "[data-web-control]" ? toggle : null };
  await page.change({ target: toggle });
  assert.equal(settings.webIntegration, true);
  assert.equal(settings.universalWebControl, true);
  assert.equal(settings.fallbackToPause, true);
  const locked = { disabled: true, checked: false, dataset: { setting: "voiceMode" }, closest: (selector) => selector === "[data-web-control]" ? null : selector === "[data-setting]" ? locked : null };
  await page.change({ target: locked });
  assert.equal(settings.voiceMode, false);
});

class ShadowHarness {
  constructor() { this.details = []; this.main = { scrollTop: 0 }; this.activeElement = null; this.dialogOpen = false; this.renderCount = 0; }
  querySelector(selector) {
    if (selector === "dialog[open]") return this.dialogOpen ? {} : null;
    if (selector === "main") return this.main;
    const section = selector.match(/^details\[data-section="([^"]+)"\]$/)?.[1];
    return section ? this.details.find((item) => item.dataset.section === section) || null : null;
  }
  querySelectorAll(selector) { return selector === "details[data-section]" ? this.details : []; }
  set innerHTML(value) {
    this.renderCount++;
    this.html = value;
    this.details = [...value.matchAll(/<details\b[^>]*data-section="([^"]+)"[^>]*>/g)]
      .map((match) => ({ dataset: { section: match[1] }, open: /\sopen(?:\s|>)/.test(match[0]) }));
  }
}

test("Advanced and other details stay open across polling and preference updates", async () => {
  let settings = core.normalizeSettings();
  let agentStatus = { ok: true };
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async (next) => { settings = core.normalizeSettings(next); },
    getState: async () => ({ agent: agentStatus, errors: [] })
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  shadow.querySelector('details[data-section="advanced"]').open = true;
  shadow.querySelector('details[data-section="about"]').open = true;
  shadow.main.scrollTop = 120;
  agentStatus = { ok: false, error: "reconexión" };
  await page.render();
  assert.equal(shadow.querySelector('details[data-section="advanced"]').open, true);
  assert.equal(shadow.querySelector('details[data-section="about"]').open, true);
  assert.equal(shadow.main.scrollTop, 120);

  await page.save({ ...settings, fadeInMs: 600 });
  assert.equal(shadow.querySelector('details[data-section="advanced"]').open, true);
  assert.match(shadow.html, /600 ms/);
});

test("polls do not rebuild controls while a field is focused or a dialog is open", async () => {
  const settings = core.normalizeSettings();
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({})
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  const focused = { matches: (selector) => selector.includes("input[type=text]") || selector.includes("textarea"), closest: () => null };
  shadow.activeElement = focused;
  const renderCount = shadow.renderCount;
  await page.render();
  assert.equal(shadow.renderCount, renderCount);
  assert.equal(page.renderQueued, true);
  shadow.activeElement = null;
  shadow.dialogOpen = true;
  await page.render();
  assert.equal(shadow.renderCount, renderCount);
  shadow.dialogOpen = false;
  await page.render();
  assert.equal(shadow.renderCount, renderCount + 1);
});

test("poll results defer rendering if a dialog or text field opens while agent state is loading", async () => {
  const shadow = new ShadowHarness();
  let finishState;
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {},
    getState: () => new Promise((resolve) => { finishState = resolve; })
  });
  page.shadow = shadow; page.opened = true;
  const dialogRender = page.render();
  shadow.dialogOpen = true; finishState({});
  await dialogRender;
  assert.equal(shadow.renderCount, 0);
  assert.equal(page.renderQueued, true);

  shadow.dialogOpen = false;
  page.renderQueued = false;
  const fieldRender = page.render();
  shadow.activeElement = { matches: () => true, closest: () => null };
  finishState({});
  await fieldRender;
  assert.equal(shadow.renderCount, 0);
  assert.equal(page.renderQueued, true);
});

test("ChatDuck 2.8.0 alpha settings render the resizable modal and show one global Ducking target", async () => {
  const settings = core.normalizeSettings({ mode: "duck" });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}),
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  const markup = shadow.html.slice(shadow.html.indexOf("</style>"));
  assert.match(markup, /ChatDuck 2\.8\.0-alpha\.1/);
  assert.match(markup, /data-size="auto"/);
  assert.match(markup, /data-setting="modalSize"/);
  assert.match(shadow.html, /role="dialog" aria-modal="true"/);
  assert.match(markup, /data-setting="targetVolumePercent"/);
  assert.equal((markup.match(/data-setting="targetVolumePercent"/g) || []).length, 1);
  assert.match(shadow.html, /@media\(max-width:620px\)/);
  assert.match(shadow.html, /@media\(max-width:390px\)/);
  assert.match(markup, /data-language/);
  assert.match(markup, /class="browser-status" data-ready="true" role="status"/);
  assert.match(markup, /Browser mode — Ready/);
  assert.doesNotMatch(markup, /Prueba de pausa|Restaurar reproducción|HTML5 detectado|class="errors"/);
  assert.doesNotMatch(markup, /data-action="manual-(pause|restore)"/);
  assert.equal(shadow.querySelector('details[data-section="advanced"]').open, false);
});

test("a clean settings profile starts in Ducking with pause and whole-tab mute fallbacks off", async () => {
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true; await page.render();
  const markup = shadow.html.slice(shadow.html.indexOf("</style>"));
  assert.match(markup, /data-mode="duck" aria-pressed="true"/);
  assert.match(markup, /data-setting="fallbackToPause"[^>]*\s*>/);
  assert.match(markup, /data-setting="webAudioMuteFallback"[^>]*\s*>/);
  assert.doesNotMatch(markup, /data-setting="(?:fallbackToPause|webAudioMuteFallback)"[^>]*checked/);
});

test("browser-first defaults need no Windows agent and keep advanced controls folded", async () => {
  const savedAgent = globalThis.AudioDuckAgent;
  globalThis.AudioDuckAgent = {
    configured: false,
    installUrl: "https://github.com/fevegit/chatduck/releases/download/v2.7.6-beta.1/ChatDuck-Windows-Agent-2.7.6-beta.1-x64.msi"
  };
  const settings = core.normalizeSettings();
  const errors = [];
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {},
    getState: async () => ({ agent: { ok: false, error: "No instalado" } }), onError: (error) => errors.push(error)
  });
  page.shadow = shadow; page.opened = true;
  try {
    await page.render();
    for (const url of ["https://www.youtube.com/watch?v=1", "https://open.spotify.com/track/1", "https://twitch.tv/channel", "https://app.plex.tv/"]) {
      assert.equal(core.shouldManageWeb(url, settings), true);
    }
    assert.equal(shadow.querySelector('details[data-section="advanced"]').open, false);
    assert.match(shadow.html, /Browser mode — Ready/);
    assert.doesNotMatch(shadow.html, /Windows agent disconnected/);
    assert.match(shadow.html, /data-setting="universalWebControl"/);
    assert.match(shadow.html, /data-setting="webAudioMuteFallback"/);
    assert.match(shadow.html, /Mutes the whole tab only when it is audible and no HTML media or iframe is present/);
    assert.match(shadow.html, /data-action="exclude-current"/);
    assert.match(shadow.html, /data-action="add-website-override"/);
    assert.match(shadow.html, /data-setting="webIntegration"/);
    assert.match(shadow.html, /Want to control Spotify Desktop or Plex for Windows\?/);
    assert.doesNotMatch(shadow.html, /<dialog[^>]*open/);
    assert.deepEqual(errors, []);
  } finally {
    if (savedAgent === undefined) delete globalThis.AudioDuckAgent;
    else globalThis.AudioDuckAgent = savedAgent;
  }
});

test("configured Windows agent stays visible and reports its real connection state", async () => {
  const savedAgent = globalThis.AudioDuckAgent;
  globalThis.AudioDuckAgent = { configured: true };
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {},
    getState: async () => ({ agent: { ok: true, autostartEnabled: false }, apps: [] })
  });
  page.shadow = shadow; page.opened = true;
  try {
    await page.render();
    assert.equal(shadow.querySelector('details[data-section="advanced"]').open, true);
    assert.match(shadow.html, /Windows agent connected/);
    assert.match(shadow.html, /data-action="add-app"/);
    assert.doesNotMatch(shadow.html, /Want to control Spotify Desktop or Plex for Windows\?/);
  } finally {
    if (savedAgent === undefined) delete globalThis.AudioDuckAgent;
    else globalThis.AudioDuckAgent = savedAgent;
  }
});

test("configured but offline Windows agent stays visible and shows its actual status", async () => {
  const savedAgent = globalThis.AudioDuckAgent;
  globalThis.AudioDuckAgent = { configured: true };
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {},
    getState: async () => ({ agent: { ok: false, error: "offline" }, apps: [] })
  });
  page.shadow = shadow; page.opened = true;
  try {
    await page.render();
    assert.equal(shadow.querySelector('details[data-section="advanced"]').open, true);
    assert.match(shadow.html, /Windows agent disconnected/);
  } finally {
    if (savedAgent === undefined) delete globalThis.AudioDuckAgent;
    else globalThis.AudioDuckAgent = savedAgent;
  }
});

test("saving browser preferences preserves existing per-player and language settings", async () => {
  let settings = core.normalizeSettings({ mode: "duck", targetVolumePercent: 17, language: "es", spotifyDesktop: false, playerRules: { plexWeb: { mode: "pause" } }, customSites: [{ domain: "media.example.org", enabled: true }] });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async (next) => { settings = core.normalizeSettings(next); }, getState: async () => ({})
  });
  await page.save({ ...settings, webIntegration: false });
  assert.equal(settings.webIntegration, false);
  assert.equal(settings.targetVolumePercent, 17);
  assert.equal(settings.mode, "duck");
  assert.equal(settings.language, "es");
  assert.equal(settings.spotifyDesktop, false);
  assert.deepEqual(settings.playerRules.plexWeb, { mode: "pause", targetVolumePercent: null, targetVolumeSource: "global" });
  assert.deepEqual(settings.customSites, [{ domain: "media.example.org", enabled: true }]);
});

test("Windows application rows show a compact name and keep executable paths in disclosure", async () => {
  const appPath = "C:\\Program Files\\Plex\\Plex\\Plex.exe";
  const settings = core.normalizeSettings({ language: "en" });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}) });
  const row = page.windowAppRow({ path: appPath, enabled: true, appUserModelIds: [] }, settings, "");
  assert.match(row, /class="managed-row windows-app-row"/);
  assert.match(row, /class="app-controls"/);
  assert.match(row, /<strong>Plex<\/strong><details class="path-details"[^>]*><summary>Show path<\/summary><code title="C:\\Program Files\\Plex\\Plex\\Plex\.exe" aria-label="Executable path: C:\\Program Files\\Plex\\Plex\\Plex\.exe">/);
  assert.doesNotMatch(row, /<span class="app-path"/);
  assert.match(row, /data-action="remove-app" data-remove-app=/);
  assert.match(row, /aria-label="Remove Plex" title="Remove application" type="button"/);
  assert.match(row, /<svg[\s\S]*?aria-hidden="true"><path d="M4 7h16/);
  assert.doesNotMatch(row, />Remove<\/button>/);
  const shadow = new ShadowHarness(); page.shadow = shadow; page.opened = true; await page.render();
  assert.match(fs.readFileSync(path.join(__dirname, "../src/native-preferences.css"), "utf8"), /\.path-details summary\{cursor:pointer/);
  assert.match(shadow.html, /\.row input:checked\+\.switch-ui:after\{transform:translateX\(15px\)/);

  const spanish = core.normalizeSettings({ language: "es" });
  const esPage = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => spanish, saveSettings: async () => {}, getState: async () => ({}) });
  assert.match(esPage.windowAppRow({ path: appPath, enabled: true, appUserModelIds: [] }, spanish, ""), /title="Eliminar aplicación"/);
});

test("trash actions still remove Windows apps, custom sites, and Plex origins", async () => {
  const appPath = "C:\\Program Files\\Plex\\Plex\\Plex.exe";
  let settings = core.normalizeSettings({ windowsApps: [{ path: appPath, enabled: true, appUserModelIds: [] }], customSites: [{ domain: "example.org", enabled: true }], plexOrigins: ["http://192.168.1.5:32400"] });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async (next) => { settings = core.normalizeSettings(next); }, getState: async () => ({}) });
  page.shadow = { querySelector: () => null };
  page.render = async () => {};
  const cases = [
    ["remove-app", "[data-remove-app]", { removeApp: appPath }],
    ["remove-site", "[data-remove-site]", { removeSite: "example.org" }],
    ["remove-plex-origin", "[data-remove-plex-origin]", { removePlexOrigin: "http://192.168.1.5:32400" }]
  ];
  for (const [action, selector, dataset] of cases) {
    const button = { dataset };
    await page.click({ target: { closest: (query) => query === "[data-action]" ? { dataset: { action } } : query === selector ? button : null } });
  }
  assert.equal(settings.windowsApps.length, 0);
  assert.equal(settings.customSites.length, 0);
  assert.equal(settings.plexOrigins.length, 0);
});

test("rerenders restore focus to the keyboard-focusable full-path tooltip", async () => {
  let focusCount = 0;
  const path = { getAttribute: () => null, matches: () => false, closest: () => null, focus() { focusCount++; } };
  const shadow = new ShadowHarness();
  shadow.activeElement = path;
  shadow.querySelectorAll = (selector) => selector === "details[data-section]" ? shadow.details
    : selector.includes("[tabindex]") ? [{}, path, {}]
      : selector.includes("button:not") ? [{}, {}] : [];
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true;
  await page.render();
  assert.equal(focusCount, 1);
});

test("rerenders keep focus inside the modal when the active control becomes disabled", async () => {
  const disabledControl = {
    getAttribute: (name) => name === "data-focus" ? "setting:mode" : null,
    matches: (selector) => selector === ":disabled",
    getClientRects: () => [{}],
    focus() {}
  };
  const shadow = new ShadowHarness();
  let focused;
  const panel = { focus() { focused = panel; shadow.activeElement = panel; } };
  const querySelector = shadow.querySelector.bind(shadow);
  shadow.activeElement = disabledControl;
  shadow.querySelector = (selector) => selector === ".panel" ? panel : querySelector(selector);
  shadow.querySelectorAll = (selector) => selector === "details[data-section]" ? shadow.details : selector === "[data-focus]" ? [disabledControl] : [];
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true;
  await page.render();
  assert.equal(focused, panel);
  assert.equal(shadow.activeElement, panel);
});

test("modal entrance animates once and periodic renders do not restart it", async () => {
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true; page.animateNextRender = true;
  await page.render();
  assert.match(shadow.html, /class="backdrop entering"/);
  assert.match(shadow.html, /class="panel entering"/);
  await page.render();
  assert.match(shadow.html, /class="backdrop"/);
  assert.doesNotMatch(shadow.html, /class="(?:backdrop|panel) entering"/);
});

test("settings expose universal overrides, compact agent state, and one fixed Ko-fi link", async () => {
  const settings = core.normalizeSettings({ mode: "duck", websiteOverrides: { "example.org": { mode: "duck", targetVolumePercent: 15 } }, excludedDomains: "blocked.org", plexOrigins: ["http://192.168.1.25:32400"] });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {},
    getState: async () => ({ agent: { ok: false }, apps: [] })
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  const markup = shadow.html.slice(shadow.html.indexOf("</style>"));
  assert.match(markup, /data-website-mode="example\.org"/);
  assert.match(markup, /data-website-target="example\.org"/);
  assert.match(markup, /blocked\.org/);
  assert.match(markup, /Universal Web Control/);
  assert.match(markup, /Browser mode — Ready/);
  assert.doesNotMatch(markup, /Windows agent disconnected/);
  assert.match(markup, /https:\/\/ko-fi\.com\/fevee/);
  assert.match(markup, /data-action="exclude-current"/);
  assert.match(markup, /data-action="add-website-override"/);
  assert.doesNotMatch(markup, /data-setting="(?:discord|discordMute|discordDeafen)/);
  assert.match(markup, /data-nav="diagnostics"/);
  assert.equal((markup.match(/https:\/\/ko-fi\.com\/fevee/g) || []).length, 1);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /data-section="technical-info"/);
  assert.match(markup, /Tampermonkey/);
  assert.doesNotMatch(markup, /Control del reproductor HTML5/);
});

test("per-website overrides inherit mode and support custom Ducking targets", async () => {
  async function markupFor(input) {
    const shadow = new ShadowHarness();
    const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(input), saveSettings: async () => {}, getState: async () => ({}) });
    page.shadow = shadow; page.opened = true; await page.render();
    return shadow.html;
  }
  const inherited = await markupFor({ websiteOverrides: { "example.org": { mode: "inherit", targetVolumePercent: null } } });
  assert.match(inherited, /data-website-mode="example\.org"[\s\S]*?value="inherit" selected/);
  const custom = await markupFor({ mode: "duck", targetVolumePercent: 10, websiteOverrides: { "example.org": { mode: "duck", targetVolumePercent: 27 } } });
  assert.match(custom, /value="27" data-website-target="example\.org"/);
});

test("current-site actions save boundary-safe exclusions and inheriting overrides", async () => {
  const priorLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://media.example.org/watch") });
  let settings = core.normalizeSettings();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async (next) => { settings = core.normalizeSettings(next); }, getState: async () => ({}) });
  page.shadow = { querySelector: () => null };
  page.render = async () => {};
  const clickAction = (action) => page.click({ target: { closest: (selector) => selector === "[data-action]" ? { dataset: { action } } : null } });
  try {
    await clickAction("exclude-current");
    assert.equal(settings.excludedDomains, "media.example.org");
    await clickAction("add-website-override");
    assert.deepEqual(settings.websiteOverrides["media.example.org"], { enabled: true, mode: "inherit", targetVolumePercent: null });
  } finally {
    if (priorLocation === undefined) delete globalThis.location;
    else Object.defineProperty(globalThis, "location", { configurable: true, value: priorLocation });
  }
});

test("changing target source preserves the stored custom percentage for later use", async () => {
  let settings = core.normalizeSettings({ mode: "duck", targetVolumePercent: 10, playerRules: { youtube: { mode: "duck", targetVolumePercent: 27 } } });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async (next) => { settings = core.normalizeSettings(next); }, getState: async () => ({}) });
  page.render = async () => {};
  const dispatch = async (source) => page.change({
    stopPropagation() {},
    target: { closest: (selector) => selector === "[data-rule-target-source]" ? { dataset: { ruleTargetSource: "youtube" }, value: source } : null }
  });
  await dispatch("global");
  assert.equal(settings.playerRules.youtube.targetVolumeSource, "global");
  assert.equal(settings.playerRules.youtube.targetVolumePercent, 27);
  assert.equal(core.resolvePlayerRule(settings, "youtube").targetVolumePercent, 10);
  await dispatch("custom");
  assert.equal(core.resolvePlayerRule(settings, "youtube").targetVolumePercent, 27);
});

test("media diagnostics are gathered only on request and retain detailed control state without URLs", async () => {
  let scans = 0;
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}),
    getDiagnostics: async () => { scans++; return [{ host: "player.example", status: "ready", registered: true, eligible: true, isTop: true, globalMode: "duck", effectiveMode: "duck", targetVolumePercent: 10, htmlMediaCount: 2, playingCount: 1, controlledCount: 1, url: "https://player.example/watch?token=secret", lastRestore: { verified: true, path: "/private" }, players: [{ mediaType: "audio", action: "duck", playing: true, originalVolumePercent: 80, targetVolumePercent: 10, appliedVolumePercent: 10, currentVolumePercent: 10, source: "https://player.example/a.mp3?token=secret" }] }]; }
  });
  page.shadow = new ShadowHarness(); page.render = async () => {};
  assert.equal(scans, 0);
  await page.click({ target: { closest: (selector) => selector === "[data-nav]" ? { dataset: { nav: "diagnostics" } } : null } });
  assert.equal(scans, 1);
  assert.equal(page.diagnosticState[0].host, "player.example");
  assert.equal(page.diagnosticState[0].effectiveMode, "duck");
  assert.equal(page.diagnosticState[0].players[0].currentVolumePercent, 10);
  assert.equal(page.diagnosticState[0].players[0].source, undefined);
  assert.equal(page.diagnosticState[0].lastRestore.verified, true);
  const report = JSON.parse(page.anonymizedDiagnosticReport());
  assert.equal(report.frames[0].site, "site-1");
  assert.equal(JSON.stringify(report).includes("player.example"), false);
  assert.equal(JSON.stringify(report).includes("secret"), false);
  assert.equal(JSON.stringify(report).includes("https://"), false);
});

test("section navigation exposes one selected page and splits desktop from advanced controls", () => {
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  const sections = Array.from({ length: 5 }, () => ({ hidden: false }));
  const groups = [{ hidden: false }, { hidden: false }];
  const advanced = { hidden: false, open: false, querySelectorAll: () => groups };
  const title = { textContent: "" };
  const main = { querySelectorAll: () => sections, querySelector: (selector) => selector === ".advanced" ? advanced : title };
  const navButtons = ["general", "browser", "desktop", "advanced", "diagnostics", "about"].map((nav) => ({ dataset: { nav }, setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; } }));
  page.shadow = { querySelector: (selector) => selector === ".panel" ? { dataset: {} } : selector === "main" ? main : null, querySelectorAll: () => navButtons };
  page.activePage = "advanced";
  page.applyPage();
  assert.equal(title.textContent, "Technical details");
  assert.deepEqual(sections.map((section) => section.hidden), [true, true, true, true, true]);
  assert.deepEqual(groups.map((group) => group.hidden), [true, false]);
  assert.equal(navButtons.find((button) => button.dataset.nav === "advanced")["aria-current"], "page");
  page.activePage = "desktop"; page.applyPage();
  assert.deepEqual(groups.map((group) => group.hidden), [false, true]);
});

test("state polling updates only the status without replacing controls", async () => {
  let agent = { ok: false };
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({ agent }) });
  page.shadow = shadow; page.opened = true; await page.render();
  const renderCount = shadow.renderCount;
  agent = { ok: true };
  await page.refreshState();
  assert.equal(shadow.renderCount, renderCount);
});

test("settings render in Spanish with translated controls and preserve all 2.7.0 preferences", async () => {
  const settings = core.normalizeSettings({ language: "es", mode: "duck", targetVolumePercent: 21, spotifyDesktop: false, playerRules: { plexWeb: { mode: "pause" } }, websiteOverrides: { "example.org": { mode: "pause" } } });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true;
  await page.render();
  assert.match(shadow.html, /value="es" selected>Español/);
  assert.match(shadow.html, /class="panel" data-focus="panel" data-page="general" data-size="auto" lang="es"/);
  assert.match(shadow.html, />Control web universal</);
  assert.match(shadow.html, />Pausar</);
  assert.match(shadow.html, />Avanzado</);
  assert.match(shadow.html, /Control web universal/);
  assert.match(shadow.html, /example\.org/);
  assert.match(shadow.html, /data-website-mode="example\.org"/);
  assert.doesNotMatch(shadow.html, />Web integrations</);
});

test("modal open, Escape, backdrop close, and reopen clean up listeners and restore focus", async () => {
  let hostCount = 0, adds = 0, removes = 0, appended = 0, detached = 0, focuses = 0, panelFocuses = 0;
  const previousFocus = { isConnected: true, focus() { focuses++; } };
  const panel = { focus() { panelFocuses++; } }, backdrop = {};
  const doc = {
    body: { append() { appended++; } }, activeElement: previousFocus,
    createElement() {
      hostCount++;
      return {
        style: {}, dataset: {}, hidden: false,
        attachShadow() {
          return {
            activeElement: null,
            addEventListener() { adds++; }, removeEventListener() { removes++; },
            querySelector(selector) { return [".window,.panel", ".panel"].includes(selector) ? panel : selector === "[data-backdrop]" ? backdrop : null; }
          };
        },
        remove() { detached++; }
      };
    }
  };
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc, getSettings: () => core.normalizeSettings(), saveSettings: async () => {}, getState: async () => ({}) });
  let renders = 0;
  page.render = async () => { renders++; };
  try {
    page.open();
    await Promise.resolve(); await Promise.resolve();
    page.open();
    assert.equal(hostCount, 1);
    assert.equal(appended, 1);
    assert.equal(adds, 8);
    assert.equal(renders, 2);
    assert.equal(panelFocuses, 1);
    assert.ok(page.pollTimer);

    let prevented = false;
    page.keydown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.equal(page.opened, false);
    assert.equal(detached, 1);
    assert.equal(removes, adds);
    assert.equal(focuses, 1);
    assert.equal(page.pollTimer, 0);

    page.open();
    await Promise.resolve(); await Promise.resolve();
    await page.click({ target: backdrop });
    assert.equal(page.opened, false);
    assert.equal(hostCount, 2);
    assert.equal(detached, 2);
    assert.equal(removes, adds);
    assert.equal(focuses, 2);
  } finally {
    page.close({ restoreFocus: false });
  }
});
