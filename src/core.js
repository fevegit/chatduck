(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    webIntegration: true,
    webPlatforms: Object.freeze({ youtube: true, youtubeMusic: true, spotifyWeb: true, twitch: true, plexWeb: true, otherCompatible: false }),
    customSites: Object.freeze([]),
    plexOrigins: Object.freeze([]),
    playerRules: Object.freeze({}),
    mode: "pause",
    targetVolumePercent: 10,
    fadeOutMs: 200,
    fadeInMs: 350,
    fallbackDucking: true,
    fallbackToPause: true,
    excludedDomains: "",
    spotifyDesktop: true,
    windowsApps: Object.freeze([]),
    voiceMode: false,
    language: "en",
    modalSize: "auto"
  });

  const WEB_KEYS = Object.keys(DEFAULTS.webPlatforms);
  const PLAYER_KEYS = new Set(["youtube", "youtubeMusic", "spotifyWeb", "twitch", "plexWeb", "spotifyDesktop"]);
  const BLOCKED_CUSTOM_DOMAINS = new Set([
    "chatgpt.com", "youtube.com", "youtu.be", "ytimg.com", "youtube-nocookie.com",
    "spotify.com", "twitch.tv", "127.0.0.1", "localhost"
  ]);

  function normalizeCustomDomain(input) {
    const raw = String(input ?? "").trim();
    if (!raw || raw.length > 2048 || /[\s\u0000-\u001f\\]/.test(raw)) return null;
    let url;
    try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
    catch (_) { return null; }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const domain = url.hostname.toLowerCase().replace(/\.$/, "");
    if (domain.length > 253 || !domain.includes(".") || domain === "localhost" || domain.endsWith(".local") || domain.endsWith(".internal")) return null;
    if (BLOCKED_CUSTOM_DOMAINS.has(domain) || [...BLOCKED_CUSTOM_DOMAINS].some((blocked) => domain.endsWith(`.${blocked}`))) return null;
    if (/^\d+(?:\.\d+){3}$/.test(domain) || domain.includes(":")) return null;
    const labels = domain.split(".");
    if (labels.some((label) => !label || label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label)) || !/[a-z]{2,63}$/.test(labels.at(-1))) return null;
    return domain;
  }

  function normalizeCustomSites(input) {
    const result = new Map();
    for (const item of Array.isArray(input) ? input.slice(0, 80) : []) {
      const domain = normalizeCustomDomain(typeof item === "string" ? item : item?.domain);
      if (domain && !result.has(domain)) result.set(domain, { domain, enabled: typeof item === "object" && item !== null ? item.enabled !== false : true });
    }
    return [...result.values()];
  }

  function normalizePlexOrigin(input) {
    const raw = String(input ?? "").trim();
    if (!raw || raw.length > 512 || /[\s\u0000-\u001f\\]/.test(raw)) return null;
    let url;
    try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`); }
    catch (_) { return null; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "/web" && url.pathname !== "/web/") return null;
    const host = url.hostname.toLowerCase();
    const octets = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ? host.split(".").map(Number) : null;
    if (octets?.some((part) => part > 255)) return null;
    const localIPv4 = Boolean(octets && (octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254)));
    if (!host || host === "app.plex.tv" || host === "chatgpt.com" || hostMatches(host, "youtube.com") || hostMatches(host, "spotify.com")) return null;
    if (url.protocol === "http:" && !localIPv4 && !["localhost", "[::1]", "::1"].includes(host) && !host.endsWith(".local")) return null;
    return url.origin;
  }

  function normalizePlexOrigins(input) {
    return [...new Set((Array.isArray(input) ? input.slice(0, 32) : []).map(normalizePlexOrigin).filter(Boolean))];
  }

  function normalizePlayerRules(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const rules = {};
    for (const [rawKey, raw] of Object.entries(input).slice(0, 128)) {
      const key = String(rawKey).slice(0, 520);
      if (!(PLAYER_KEYS.has(key) || /^(?:custom|app|appId):[^\u0000-\u001f]{1,500}$/i.test(key))) continue;
      const rule = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const target = rule.targetVolumePercent == null || rule.targetVolumePercent === "" ? null : Number(rule.targetVolumePercent);
      const targetVolumeSource = rule.targetVolumeSource === "custom" || rule.targetVolumeSource === "global"
        ? rule.targetVolumeSource
        : Number.isFinite(target) ? "custom" : "global";
      rules[key] = {
        mode: ["general", "pause", "duck"].includes(rule.mode) ? rule.mode : "general",
        targetVolumePercent: Number.isFinite(target) ? Math.min(100, Math.max(0, Math.round(target))) : null,
        targetVolumeSource
      };
    }
    return rules;
  }

  function normalizeExecutablePath(input) {
    const path = String(input ?? "").trim().replaceAll("/", "\\");
    if (!/^[a-z]:\\/i.test(path) || path.startsWith("\\\\") || !/\.exe$/i.test(path) || /[\u0000-\u001f]/.test(path)) return "";
    const parts = path.split("\\");
    if (parts.some((part, index) => index > 0 && (!part || part === "." || part === ".."))) return "";
    return `${parts[0].toUpperCase()}\\${parts.slice(1).join("\\")}`;
  }

  function normalizeWindowsApps(input) {
    const result = new Map();
    for (const item of Array.isArray(input) ? input.slice(0, 64) : []) {
      const path = normalizeExecutablePath(typeof item === "string" ? item : item?.path);
      const ids = typeof item === "object" && item !== null && Array.isArray(item.appUserModelIds) ? item.appUserModelIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim().slice(0, 240)) : [];
      if (!path && !ids.length) continue;
      const key = path.toLowerCase() || `aumid:${ids[0].toLowerCase()}`;
      const appUserModelId = typeof item === "object" && typeof item.appUserModelId === "string" ? item.appUserModelId.trim().slice(0, 240) : "";
      const prior = result.get(key);
      result.set(key, { path, enabled: typeof item === "object" && item !== null ? item.enabled !== false : true, appUserModelIds: [...new Set([...(prior?.appUserModelIds || []), ...ids, ...(appUserModelId ? [appUserModelId] : [])])] });
    }
    return [...result.values()];
  }

  function normalizeSettings(input = {}) {
    const target = Number(input.targetVolumePercent);
    const fadeOut = Number(input.fadeOutMs);
    const fadeIn = Number(input.fadeInMs);
    const excludedDomains = String(input.excludedDomains ?? DEFAULTS.excludedDomains)
      .split(/[\n,;]+/).map((domain) => domain.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
      .filter((domain) => /^[a-z0-9.-]+$/.test(domain)).slice(0, 80).join("\n");
    const platforms = input.webPlatforms && typeof input.webPlatforms === "object" ? input.webPlatforms : {};
    return {
      enabled: input.enabled !== false,
      webIntegration: input.webIntegration !== false,
      webPlatforms: Object.fromEntries(WEB_KEYS.map((key) => [key, typeof platforms[key] === "boolean" ? platforms[key] : DEFAULTS.webPlatforms[key]])),
      customSites: normalizeCustomSites(input.customSites),
      plexOrigins: normalizePlexOrigins(input.plexOrigins),
      playerRules: normalizePlayerRules(input.playerRules),
      mode: input.mode === "duck" ? "duck" : "pause",
      targetVolumePercent: Number.isFinite(target) ? Math.min(100, Math.max(0, Math.round(target))) : DEFAULTS.targetVolumePercent,
      fadeOutMs: Number.isFinite(fadeOut) ? Math.min(1000, Math.max(0, Math.round(fadeOut))) : DEFAULTS.fadeOutMs,
      fadeInMs: Number.isFinite(fadeIn) ? Math.min(1500, Math.max(0, Math.round(fadeIn))) : DEFAULTS.fadeInMs,
      fallbackDucking: input.fallbackDucking !== false,
      fallbackToPause: input.fallbackToPause !== false,
      excludedDomains,
      spotifyDesktop: input.spotifyDesktop !== false,
      windowsApps: normalizeWindowsApps(input.windowsApps),
      voiceMode: input.voiceMode === true,
      language: input.language === "es" ? "es" : "en",
      modalSize: ["compact", "normal", "large"].includes(input.modalSize) ? input.modalSize : "auto"
    };
  }

  function hostFor(href) {
    try { return new URL(href).hostname.toLowerCase(); } catch (_) { return ""; }
  }

  function isChatGPT(href) { return hostFor(href) === "chatgpt.com"; }

  function isSettingsPage(href) {
    try {
      const url = new URL(href);
      return (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "48731" && url.pathname === "/settings") ||
        (url.protocol === "https:" && url.hostname === "chatgpt.com" && url.hash === "#audio-ducking-settings");
    } catch (_) { return false; }
  }

  function isExcluded(host, excludedDomains) {
    return String(excludedDomains || "").split(/[\n,;]+/).some((raw) => {
      const domain = raw.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
      return domain && (host === domain || host.endsWith(`.${domain}`));
    });
  }

  function hostMatches(host, domain) { return host === domain || host.endsWith(`.${domain}`); }

  function webPlatformForHost(host) {
    if (host === "music.youtube.com") return "youtubeMusic";
    if (host === "youtube.com" || hostMatches(host, "youtube.com") || host === "youtu.be") return "youtube";
    if (host === "open.spotify.com") return "spotifyWeb";
    if (host === "twitch.tv" || hostMatches(host, "twitch.tv")) return "twitch";
    if (host === "app.plex.tv") return "plexWeb";
    return null;
  }

  function playerRuleKeyForWindowsApp(app) {
    const path = normalizeExecutablePath(app?.path).toLowerCase();
    if (path) return `app:${path}`;
    const id = app?.appUserModelIds?.[0];
    return id ? `appId:${String(id).toLowerCase()}` : "";
  }

  function resolvePlayerRule(settings, key) {
    const rule = settings?.playerRules?.[key] || {};
    return {
      mode: rule.mode === "pause" || rule.mode === "duck" ? rule.mode : settings?.mode === "duck" ? "duck" : "pause",
      targetVolumePercent: rule.targetVolumeSource === "custom" && Number.isFinite(rule.targetVolumePercent)
        ? rule.targetVolumePercent : settings?.targetVolumePercent ?? DEFAULTS.targetVolumePercent,
      fadeOutMs: settings?.fadeOutMs ?? DEFAULTS.fadeOutMs,
      fadeInMs: settings?.fadeInMs ?? DEFAULTS.fadeInMs,
      fallbackDucking: settings?.fallbackDucking !== false,
      fallbackToPause: settings?.fallbackToPause !== false
    };
  }

  function plexOriginFor(href) {
    try {
      const url = new URL(href);
      if (url.hostname.toLowerCase() === "app.plex.tv") return "https://app.plex.tv";
      return normalizePlexOrigin(url.origin);
    } catch (_) { return null; }
  }

  function webPlayerKeyFor(href, settings) {
    const host = hostFor(href);
    const platform = webPlatformForHost(host);
    if (platform) return platform;
    if (settings?.plexOrigins?.includes(plexOriginFor(href))) return "plexWeb";
    const site = (settings?.customSites || []).filter((item) => item.enabled && hostMatches(host, item.domain))
      .sort((a, b) => b.domain.length - a.domain.length)[0];
    return site ? `custom:${site.domain}` : "";
  }

  function shouldManageWeb(href, settings) {
    const host = hostFor(href);
    if (!settings.enabled || settings.webIntegration === false || !host || isChatGPT(href) || isSettingsPage(href) || isExcluded(host, settings.excludedDomains)) return false;
    const platform = webPlatformForHost(host);
    if (platform) return settings.webPlatforms?.[platform] !== false;
    const plexOrigin = plexOriginFor(href);
    if (plexOrigin && settings.webPlatforms?.plexWeb !== false && settings.plexOrigins?.includes(plexOrigin)) return true;
    return settings.webPlatforms?.otherCompatible === true && settings.customSites?.some((site) => site.enabled && hostMatches(host, site.domain)) === true;
  }

  function labelsForChatGPT(doc) {
    return [...doc.querySelectorAll("button,[role='button'],[aria-label],[title]")]
      .filter((node) => {
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width === 0 || rect.height === 0) return false;
        return node.getAttribute("aria-hidden") !== "true";
      })
      .map((node) => [node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("data-testid")]
        .filter(Boolean).join(" ").trim().slice(0, 160))
      .filter(Boolean);
  }

  const api = { DEFAULTS, normalizeSettings, normalizeCustomDomain, normalizeCustomSites, normalizePlexOrigin, normalizePlexOrigins, normalizePlayerRules, normalizeExecutablePath, normalizeWindowsApps, playerRuleKeyForWindowsApp, resolvePlayerRule, plexOriginFor, webPlayerKeyFor, hostFor, isChatGPT, isSettingsPage, isExcluded, hostMatches, webPlatformForHost, shouldManageWeb, labelsForChatGPT };
  root.AudioDuckCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
