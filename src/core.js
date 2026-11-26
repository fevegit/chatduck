(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    webIntegration: true,
    universalWebControl: true,
    webAudioMuteFallback: false,
    webPlatforms: Object.freeze({ youtube: true, youtubeMusic: true, spotifyWeb: true, twitch: true, plexWeb: true, otherCompatible: true }),
    customSites: Object.freeze([]),
    plexOrigins: Object.freeze([]),
    playerRules: Object.freeze({}),
    mode: "duck",
    targetVolumePercent: 10,
    fadeOutMs: 200,
    fadeInMs: 350,
    fallbackDucking: false,
    fallbackToPause: false,
    excludedDomains: "",
    websiteOverrides: Object.freeze({}),
    discord: Object.freeze({ enabled: false, mode: "mute" }),
    discordActivationMode: "automatic",
    discordMuteDuringDictation: false,
    discordDeafenDuringDictation: false,
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
  const PROTECTED_COMMUNICATION_DOMAINS = Object.freeze([
    "chatgpt.com", "openai.com", "discord.com", "slack.com", "teams.microsoft.com",
    "meet.google.com", "zoom.us", "webex.com", "whatsapp.com", "messenger.com",
    "signal.org", "telegram.org", "whereby.com", "around.co", "gotomeeting.com"
  ]);

  function normalizeCustomDomain(input) {
    const raw = String(input ?? "").trim().replace(/^\.+/, "").replace(/\.+$/, "");
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

  function normalizePolicyDomain(input) {
    const raw = String(input ?? "").trim().replace(/^\.+/, "").replace(/\.+$/, "");
    if (!raw || raw.length > 512 || /[\s\u0000-\u001f\\]/.test(raw)) return null;
    let url;
    try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch (_) { return null; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const domain = url.hostname.toLowerCase().replace(/\.$/, "");
    if (domain.length > 253 || !domain.includes(".") || domain === "localhost" || domain.endsWith(".local") || domain.endsWith(".internal") || domain.includes(":")) return null;
    const labels = domain.split(".");
    const octets = /^\d+(?:\.\d+){3}$/.test(domain) ? labels.map(Number) : null;
    if (octets) return octets.every((part) => part <= 255) ? domain : null;
    return labels.every((label) => label && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label)) && /[a-z]{2,63}$/.test(labels.at(-1)) ? domain : null;
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

  function normalizeWebsiteOverrides(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const overrides = {};
    for (const [rawDomain, raw] of Object.entries(input).slice(0, 80)) {
      const domain = normalizePolicyDomain(rawDomain);
      if (!domain || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const target = raw.targetVolumePercent == null || raw.targetVolumePercent === "" ? null : Number(raw.targetVolumePercent);
      overrides[domain] = {
        enabled: raw.enabled !== false,
        mode: ["inherit", "pause", "duck"].includes(raw.mode) ? raw.mode : "inherit",
        targetVolumePercent: Number.isFinite(target) ? Math.min(100, Math.max(0, Math.round(target))) : null
      };
    }
    return overrides;
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
    const platforms = input.webPlatforms && typeof input.webPlatforms === "object" ? input.webPlatforms : {};
    const legacyOverrides = {};
    if (platforms.youtube === false) {
      legacyOverrides["youtube.com"] = { enabled: false, mode: "inherit", targetVolumePercent: null };
      legacyOverrides["youtu.be"] = { enabled: false, mode: "inherit", targetVolumePercent: null };
      if (platforms.youtubeMusic !== false) legacyOverrides["music.youtube.com"] = { enabled: true, mode: "inherit", targetVolumePercent: null };
    }
    if (platforms.youtubeMusic === false) legacyOverrides["music.youtube.com"] = { enabled: false, mode: "inherit", targetVolumePercent: null };
    for (const [key, domain] of [["spotifyWeb", "spotify.com"], ["twitch", "twitch.tv"], ["plexWeb", "app.plex.tv"]])
      if (platforms[key] === false) legacyOverrides[domain] = { enabled: false, mode: "inherit", targetVolumePercent: null };
    if (platforms.plexWeb === false) for (const origin of normalizePlexOrigins(input.plexOrigins)) {
      const domain = new URL(origin).hostname;
      legacyOverrides[domain] = { enabled: false, mode: "inherit", targetVolumePercent: null };
    }
    const excludedDomains = [...new Set([
      ...String(input.excludedDomains ?? DEFAULTS.excludedDomains).split(/[\n,;]+/).map(normalizePolicyDomain).filter(Boolean),
      ...normalizeCustomSites(input.customSites).filter((site) => !site.enabled).map((site) => site.domain)
    ])].slice(0, 80).join("\n");
    const websiteOverrides = { ...legacyOverrides, ...normalizeWebsiteOverrides(input.websiteOverrides) };
    for (const site of normalizeCustomSites(input.customSites)) {
      const rule = input.playerRules?.[`custom:${site.domain}`];
      if (site.enabled && rule && !websiteOverrides[site.domain]) websiteOverrides[site.domain] = {
        enabled: true,
        mode: ["pause", "duck"].includes(rule.mode) ? rule.mode : "inherit",
        targetVolumePercent: rule.targetVolumeSource === "custom" && Number.isFinite(Number(rule.targetVolumePercent)) ? Math.min(100, Math.max(0, Math.round(Number(rule.targetVolumePercent)))) : null
      };
    }
    return {
      enabled: input.enabled !== false,
      webIntegration: input.webIntegration !== false,
      universalWebControl: input.universalWebControl !== false,
      webAudioMuteFallback: input.webAudioMuteFallback === true,
      webPlatforms: Object.fromEntries(WEB_KEYS.map((key) => [key, true])),
      customSites: normalizeCustomSites(input.customSites),
      plexOrigins: normalizePlexOrigins(input.plexOrigins),
      playerRules: normalizePlayerRules(input.playerRules),
      mode: input.mode === "pause" ? "pause" : input.mode === "duck" ? "duck" : DEFAULTS.mode,
      targetVolumePercent: Number.isFinite(target) ? Math.min(100, Math.max(0, Math.round(target))) : DEFAULTS.targetVolumePercent,
      fadeOutMs: Number.isFinite(fadeOut) ? Math.min(1000, Math.max(0, Math.round(fadeOut))) : DEFAULTS.fadeOutMs,
      fadeInMs: Number.isFinite(fadeIn) ? Math.min(1500, Math.max(0, Math.round(fadeIn))) : DEFAULTS.fadeInMs,
      fallbackDucking: input.fallbackDucking === true,
      fallbackToPause: input.fallbackToPause === true,
      excludedDomains,
      websiteOverrides,
      discord: {
        enabled: input.discord?.enabled === true,
        mode: input.discord?.mode === "deafen" ? "deafen" : "mute"
      },
      discordActivationMode: input.discordActivationMode === "ctrl-click" ? "ctrl-click" : "automatic",
      discordMuteDuringDictation: input.discordMuteDuringDictation === true,
      discordDeafenDuringDictation: input.discordDeafenDuringDictation === true,
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
    return PROTECTED_COMMUNICATION_DOMAINS.some((domain) => hostMatches(host, domain)) || String(excludedDomains || "").split(/[\n,;]+/).some((raw) => {
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

  function shouldManageWeb(href, settings, parentHosts = []) {
    const host = hostFor(href);
    if (!settings.enabled || settings.webIntegration === false || settings.universalWebControl === false || !host || host === "localhost" || host === "127.0.0.1" || isChatGPT(href) || isSettingsPage(href) || isExcluded(host, settings.excludedDomains) || parentHosts.some((parent) => isExcluded(parent, settings.excludedDomains))) return false;
    const platform = webPlatformForHost(host);
    if (platform && settings.webPlatforms?.[platform] === false) return false;
    const overrideDomain = Object.keys(settings.websiteOverrides || {}).filter((domain) => hostMatches(host, domain)).sort((a, b) => b.length - a.length)[0];
    return !overrideDomain || settings.websiteOverrides[overrideDomain].enabled;
  }

  function resolveWebsiteOverride(settings, href) {
    const host = hostFor(href);
    const domain = Object.keys(settings?.websiteOverrides || {}).filter((item) => hostMatches(host, item)).sort((a, b) => b.length - a.length)[0];
    const rule = domain ? settings.websiteOverrides[domain] : null;
    const base = resolvePlayerRule(settings, webPlayerKeyFor(href, settings));
    return rule ? { ...base, enabled: rule.enabled, mode: rule.mode === "inherit" ? base.mode : rule.mode,
      targetVolumePercent: rule.targetVolumePercent == null ? base.targetVolumePercent : rule.targetVolumePercent } : { ...base, enabled: true };
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

  const api = { DEFAULTS, normalizeSettings, normalizeCustomDomain, normalizePolicyDomain, normalizeCustomSites, normalizePlexOrigin, normalizePlexOrigins, normalizePlayerRules, normalizeWebsiteOverrides, normalizeExecutablePath, normalizeWindowsApps, playerRuleKeyForWindowsApp, resolvePlayerRule, resolveWebsiteOverride, plexOriginFor, webPlayerKeyFor, hostFor, isChatGPT, isSettingsPage, isExcluded, hostMatches, webPlatformForHost, shouldManageWeb, labelsForChatGPT };
  root.AudioDuckCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
