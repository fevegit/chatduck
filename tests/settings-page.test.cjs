const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
require("../src/i18n.js");
require("../src/settings-page.js");

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
    this.details = [...value.matchAll(/<details\b[^>]*data-section="([^"]+)"/g)]
      .map((match) => ({ dataset: { section: match[1] }, open: false }));
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
  shadow.querySelector('details[data-section="web"]').open = true;
  shadow.main.scrollTop = 120;
  agentStatus = { ok: false, error: "reconexión" };
  await page.render();
  assert.equal(shadow.querySelector('details[data-section="advanced"]').open, true);
  assert.equal(shadow.querySelector('details[data-section="web"]').open, true);
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

test("ChatDuck alpha settings render the resizable modal and show one global Ducking target", async () => {
  const settings = core.normalizeSettings({ mode: "duck" });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}),
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  const markup = shadow.html.slice(shadow.html.indexOf("</style>"));
  assert.match(markup, /ChatDuck 2\.7\.5-alpha\.1/);
  assert.match(markup, /data-size="auto"/);
  assert.match(markup, /data-setting="modalSize"/);
  assert.match(shadow.html, /role="dialog" aria-modal="true"/);
  assert.match(markup, /data-setting="targetVolumePercent"/);
  assert.equal((markup.match(/data-setting="targetVolumePercent"/g) || []).length, 1);
  assert.match(markup, /<p class="agent-status" role="status">/);
  assert.doesNotMatch(markup, /Prueba de pausa|Restaurar reproducción|HTML5 detectado|class="errors"/);
  assert.doesNotMatch(markup, /data-action="manual-(pause|restore)"/);
  assert.equal(shadow.querySelector('details[data-section="advanced"]').open, false);
});

test("Windows application rows expose a compact, keyboard-accessible trash action and full path", async () => {
  const path = "C:\\Program Files\\Plex\\Plex\\Plex.exe";
  const settings = core.normalizeSettings({ language: "en" });
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}) });
  const row = page.windowAppRow({ path, enabled: true, appUserModelIds: [] }, settings, "");
  assert.match(row, /class="managed-row windows-app-row"/);
  assert.match(row, /class="app-controls"/);
  assert.match(row, /class="app-path" title="C:\\Program Files\\Plex\\Plex\\Plex\.exe" aria-label="Executable path: C:\\Program Files\\Plex\\Plex\\Plex\.exe" tabindex="0"/);
  assert.match(row, /data-action="remove-app" data-remove-app=/);
  assert.match(row, /aria-label="Remove Plex\.exe" title="Remove application" type="button"/);
  assert.match(row, /<svg[\s\S]*?aria-hidden="true"><path d="M4 7h16/);
  assert.doesNotMatch(row, />Remove<\/button>/);
  const shadow = new ShadowHarness(); page.shadow = shadow; page.opened = true; await page.render();
  assert.match(shadow.html, /\.app-path:focus-visible\{[^}]*outline:2px solid #c1afff/);
  assert.match(shadow.html, /\.app-switch input:checked\+\.switch-ui:after\{transform:translateX\(16px\)/);
  assert.match(shadow.html, /\.autosave\{display:block;white-space:normal\}/);

  const spanish = core.normalizeSettings({ language: "es" });
  const esPage = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => spanish, saveSettings: async () => {}, getState: async () => ({}) });
  assert.match(esPage.windowAppRow({ path, enabled: true, appUserModelIds: [] }, spanish, ""), /title="Eliminar aplicación"/);
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

test("settings expose custom player volume, compact agent state, and one fixed Ko-fi link", async () => {
  const settings = core.normalizeSettings({ mode: "duck", playerRules: { youtube: { mode: "duck", targetVolumePercent: 15 } }, customSites: [{ domain: "example.org", enabled: true }], plexOrigins: ["http://192.168.1.25:32400"] });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({
    doc: {}, getSettings: () => settings, saveSettings: async () => {},
    getState: async () => ({ agent: { ok: false }, apps: [] })
  });
  page.shadow = shadow;
  page.opened = true;
  await page.render();
  const markup = shadow.html.slice(shadow.html.indexOf("</style>"));
  assert.match(markup, /data-web-platform="plexWeb"/);
  assert.match(markup, /data-rule-mode="youtube"/);
  assert.match(markup, /value="duck" selected/);
  assert.match(markup, /data-rule-target="youtube" value="15"/);
  assert.match(markup, /data-rule-target-source="youtube"/);
  assert.match(markup, /value="custom" selected>Custom/);
  assert.match(markup, /Windows agent disconnected/);
  assert.match(markup, /https:\/\/ko-fi\.com\/fevee/);
  assert.match(markup, /data-action="remove-site"[^>]*title="Remove site"/);
  assert.match(markup, /data-action="remove-plex-origin"[^>]*title="Remove server"/);
  assert.equal((markup.match(/class="quiet icon-button remove-button"/g) || []).length, 2);
  assert.equal((markup.match(/https:\/\/ko-fi\.com\/fevee/g) || []).length, 1);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /data-section="technical-info"/);
  assert.match(markup, /Tampermonkey/);
  assert.doesNotMatch(markup, /Control del reproductor HTML5/);
});

test("per-player volume is hidden for effective Pause and inherited global Ducking is explicit", async () => {
  async function markupFor(input, key) {
    const shadow = new ShadowHarness();
    const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => core.normalizeSettings(input), saveSettings: async () => {}, getState: async () => ({}) });
    page.shadow = shadow; page.opened = true; await page.render();
    const start = shadow.html.indexOf(`data-section="policy-${encodeURIComponent(key)}"`);
    const end = shadow.html.indexOf("</details>", start);
    return shadow.html.slice(start, end);
  }
  const paused = await markupFor({ mode: "pause", playerRules: { youtube: { mode: "general", targetVolumePercent: 27 } } }, "youtube");
  assert.doesNotMatch(paused, /data-rule-target-source|data-rule-target=/);
  const ducking = await markupFor({ mode: "duck", targetVolumePercent: 10, playerRules: { youtube: { mode: "general", targetVolumePercent: null } } }, "youtube");
  assert.match(ducking, /Use global volume \(10%\)/);
  assert.match(ducking, /Using global volume: 10%/);
  assert.doesNotMatch(ducking, /data-rule-target=/);
  const explicitPause = await markupFor({ mode: "duck", playerRules: { youtube: { mode: "pause", targetVolumePercent: 27 } } }, "youtube");
  assert.doesNotMatch(explicitPause, /data-rule-target-source|data-rule-target=/);
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
  const settings = core.normalizeSettings({ language: "es", mode: "duck", targetVolumePercent: 21, spotifyDesktop: false, playerRules: { plexWeb: { mode: "pause" } }, customSites: [{ domain: "example.org", enabled: true }] });
  const shadow = new ShadowHarness();
  const page = new globalThis.AudioDuckSettingsPage.SettingsPage({ doc: {}, getSettings: () => settings, saveSettings: async () => {}, getState: async () => ({}) });
  page.shadow = shadow; page.opened = true;
  await page.render();
  assert.match(shadow.html, /value="es" selected>Español/);
  assert.match(shadow.html, /class="panel" data-focus="panel" data-size="auto" lang="es"/);
  assert.match(shadow.html, />Integraciones web</);
  assert.match(shadow.html, />Pausar</);
  assert.match(shadow.html, />Avanzado</);
  assert.match(shadow.html, /Spotify Web/);
  assert.match(shadow.html, /example\.org/);
  assert.match(shadow.html, /data-web-platform="spotifyWeb"/);
  assert.match(shadow.html, /data-rule-mode="plexWeb"/);
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
            querySelector(selector) { return selector === ".panel" ? panel : selector === "[data-backdrop]" ? backdrop : null; }
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
