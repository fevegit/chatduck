const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
require("../src/i18n.js");
const i18n = globalThis.AudioDuckI18n;

test("language defaults to English independent of browser or Windows locale", () => {
  assert.equal(core.DEFAULTS.language, "en");
  assert.equal(core.normalizeSettings({}).language, "en");
  assert.equal(core.normalizeSettings({ language: "es" }).language, "es");
  assert.equal(core.normalizeSettings({ language: "es-ES" }).language, "en");
});

test("English and Spanish catalogs have the same stable key set", () => {
  assert.deepEqual(Object.keys(i18n.CATALOGS.es).sort(), Object.keys(i18n.CATALOGS.en).sort());
  assert.deepEqual(i18n.LANGUAGE_OPTIONS.map(({ code }) => code), ["en", "es"]);
  assert.equal(i18n.CATALOGS.es.fadeOut, "Reducción gradual");
  assert.doesNotMatch(i18n.CATALOGS.es.transitionHint, /\bfades\b/i);
});

test("translations preserve interpolation placeholders and flag unapproved English carryovers", () => {
  const identicalCopyAllowlist = ["brand", "general", "sizeNormal", "duck", "youtube", "youtubeMusic", "spotifyWeb", "twitch", "plexWeb", "inherit", "pathPlaceholder", "plexOriginPlaceholder"];
  const identical = [];
  for (const [key, english] of Object.entries(i18n.CATALOGS.en)) {
    const spanish = i18n.CATALOGS.es[key];
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(spanish), placeholders(english), `Placeholder mismatch: ${key}`);
    if (english === spanish) identical.push(key);
  }
  assert.deepEqual(identical.sort(), identicalCopyAllowlist.sort());
});

test("translation falls back to English and interpolates stable values", () => {
  const key = "menuSettings";
  const english = i18n.CATALOGS.en[key];
  const saved = i18n.CATALOGS.es[key];
  assert.equal(i18n.translate("es", key), saved);
  assert.equal(i18n.translate("es", "siteInvalid"), i18n.CATALOGS.es.siteInvalid);
  assert.equal(i18n.translate("en", "removeSite", { value: "example.org" }), "Remove example.org");
  assert.equal(i18n.translate("fr", key), english);
  assert.equal(i18n.translate("es", "missing.translation.key"), "missing.translation.key");
});

test("language preference survives normalization and legacy settings migrate to English", () => {
  const legacy = core.normalizeSettings({ mode: "duck", targetVolumePercent: 17, spotifyDesktop: false, customSites: [{ domain: "example.org" }] });
  assert.equal(legacy.language, "en");
  assert.equal(legacy.targetVolumePercent, 17);
  assert.equal(legacy.spotifyDesktop, false);
  assert.equal(legacy.customSites[0].domain, "example.org");
  assert.equal(core.normalizeSettings({ ...legacy, language: "es" }).language, "es");
});

test("modal size and independent target controls have complete English and Spanish labels", () => {
  for (const key of ["modalSize", "sizeAuto", "sizeCompact", "sizeNormal", "sizeLarge", "dictationVolume", "useGlobalTarget", "useCustomTarget", "customTarget", "effectiveGlobalTarget", "permissionDetails", "agentDetailsTitle", "technicalDetails"]) {
    assert.ok(i18n.CATALOGS.en[key], `English: ${key}`);
    assert.ok(i18n.CATALOGS.es[key], `Spanish: ${key}`);
  }
  assert.equal(i18n.translate("en", "useGlobalTarget", { value: 10 }), "Use global volume (10%)");
  assert.equal(i18n.translate("es", "useGlobalTarget", { value: 10 }), "Usar volumen global (10 %)");
});

test("removal tooltips and application-path labels are localized", () => {
  assert.equal(i18n.translate("en", "removeApplication"), "Remove application");
  assert.equal(i18n.translate("es", "removeApplication"), "Eliminar aplicación");
  assert.equal(i18n.translate("en", "pathTooltip", { value: "C:\\Plex.exe" }), "Executable path: C:\\Plex.exe");
  assert.equal(i18n.translate("es", "pathTooltip", { value: "C:\\Plex.exe" }), "Ruta del ejecutable: C:\\Plex.exe");
  for (const key of ["removeApplication", "removeSiteAction", "removeServer", "appEnabled", "pathTooltip", "appIdentifierTooltip"]) {
    assert.ok(i18n.CATALOGS.en[key], `English: ${key}`);
    assert.ok(i18n.CATALOGS.es[key], `Spanish: ${key}`);
  }
});
