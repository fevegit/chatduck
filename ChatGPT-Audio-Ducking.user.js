// ==UserScript==
// @name         ChatGPT Audio Ducking
// @name:en      ChatGPT Audio Ducking
// @name:es      Audio Ducking para ChatGPT
// @namespace    https://local.chatgpt-audio-ducking/
// @version      2.7.5
// @description  Pause or lower selected players while dictating in ChatGPT.
// @description:en Pause or lower selected players while dictating in ChatGPT.
// @description:es Pausa o atenúa los reproductores seleccionados mientras dictas en ChatGPT.
// @homepageURL  https://github.com/fevegit/audio-ducking
// @supportURL   https://github.com/fevegit/audio-ducking/issues
// @updateURL    https://raw.githubusercontent.com/fevegit/audio-ducking/main/ChatGPT-Audio-Ducking.user.js
// @downloadURL  https://raw.githubusercontent.com/fevegit/audio-ducking/main/ChatGPT-Audio-Ducking.user.js
// @match        https://chatgpt.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://youtu.be/*
// @match        https://open.spotify.com/*
// @match        https://twitch.tv/*
// @match        https://www.twitch.tv/*
// @match        https://app.plex.tv/*
// @match        http://127.0.0.1/*

// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @sandbox      DOM
// @run-at       document-start
// @noframes
// ==/UserScript==
(function (root) {
  "use strict";

  const EN = Object.freeze({
    brand: "Audio Ducking", settings: "Settings", menuSettings: "Open Audio Ducking settings", close: "Close", language: "Language", english: "English", spanish: "Spanish",
    tagline: "Control playback while you dictate", general: "General", enabled: "Enabled", enabledHint: "Automatically control playback during dictation",
    modalSize: "Panel size", sizeAuto: "Auto", sizeCompact: "Compact", sizeNormal: "Normal", sizeLarge: "Large",
    activeLock: "Settings are locked while dictation is active.", whenDictating: "When dictation starts", pause: "Pause", duck: "Ducking",
    targetVolume: "Volume while dictating", minimum: "0%", maximum: "100%", webIntegrations: "Web integrations", webPlayers: "Web players",
    webPlayersHint: "Control selected supported sites", supportedSites: "Supported sites", html5Control: "HTML5 player control", customHtml5: "Custom HTML5 integration",
    youtube: "YouTube", youtubeMusic: "YouTube Music", spotifyWeb: "Spotify Web", twitch: "Twitch", plexWeb: "Plex Web", behavior: "Behavior", mode: "Mode",
    inherit: "General", target: "Target", ownTarget: "Use custom target", dictationVolume: "Volume while dictating", useGlobalTarget: "Use global volume ({value}%)", useCustomTarget: "Custom", customTarget: "Custom volume", effectiveGlobalTarget: "Using global volume: {value}%", remove: "Remove", add: "Add", added: "Added", updateIdentity: "Update identity",
    plexServers: "Local Plex servers", addPlexOrigin: "+ Add server origin", emptyPlexOrigins: "Add the exact origin of your local server.",
    plexPermission: "Requires exact host permission in Tampermonkey", plexHostHelp: "Audio Ducking only controls local HTML5 playback. For each server, add the shown line in Tampermonkey → Edit. Firefox may ignore ports in match rules; runtime control still checks the exact origin.",
    otherSites: "Custom sites", otherSitesHint: "Only domains you add", addSite: "+ Add website", authorizeSites: "Authorize sites in Tampermonkey",
    customShortHelp: "Add a compatible website and allow its host access in Tampermonkey.", customPermissionHelp: "In Tampermonkey, open the userscript editor and add the exact match line shown for the site to its header. If you use the optional agent, the Authorize sites button can prepare these permissions for you.", permissionDetails: "Permission and setup details",
    emptySites: "No sites added yet.", windowsApps: "Windows apps", spotifyDesktop: "Spotify desktop", windowsMedia: "Windows Media Control · per-app volume",
    agentConnected: "Windows agent connected", agentDisconnected: "Windows agent disconnected", agentDetailsTitle: "Agent details and setup",
    installWindowsAgent: "Install Windows Agent", agentInstallHint: "The optional Windows agent is needed only for desktop players. Downloading starts only when you choose this button.",
    agentStartup: "Start the agent when I sign in", agentStartupHint: "Optional. Off by default; applies only to your Windows account.",
    agentOptional: "The Windows component is optional and only needed for desktop players. It checks selected process names and paths, GSMTC playback state, and per-app WASAPI volume over authenticated localhost. It does not record microphone audio or change master volume.",
    noSessions: "No active sessions right now.", noOtherApps: "No other apps selected.", addApp: "+ Add app", refreshApps: "Refresh list", appEnabled: "Enable {value}", pathTooltip: "Executable path: {value}", appIdentifierTooltip: "Application identifier: {value}",
    appPathHelp: "Select a detected audio session or enter the full path to an installed executable.", detectedSessions: "Detected sessions", path: "Executable path", pathPlaceholder: "C:\\Program Files\\Player\\player.exe",
    capabilityPause: "GSMTC session found · pause not tested", capabilityVolume: "WASAPI session found", capabilityNone: "No active session · control not tested", audioSession: "audio session", audioSessions: "audio sessions",
    advanced: "Advanced", voiceMode: "ChatGPT voice conversations", voiceModeHint: "Off by default", excludedDomains: "Excluded domains", excludedPlaceholder: "example.com", technicalDetails: "Technical details",
    transitions: "Volume transitions", transitionHint: "Windows fades use per-app WASAPI volume. Pause keeps its silence hold; Ducking keeps its 250 ms minimum. Web players use the values you choose.",
    fadeOut: "Fade-out", fadeIn: "Fade-in", about: "About", aboutText: "Pause or lower selected players while you dictate.", support: "Support on Ko-fi", savedAutomatically: "Changes save automatically.",
    dialogSiteTitle: "Add website", dialogSiteDescription: "Enter an HTTPS website or domain. The exact domain and its subdomains will be saved.", siteLabel: "Website or domain", sitePlaceholder: "https://example.com",
    dialogPlexTitle: "Add Plex server", dialogPlexDescription: "Add only the exact origin (for example, http://192.168.1.25:32400). Tampermonkey host access is added separately.", plexOriginLabel: "Server origin", plexOriginPlaceholder: "http://192.168.1.25:32400",
    dialogAppTitle: "Add app", dialogAppDescription: "Select a detected audio session or enter the full path to an installed executable.", cancel: "Cancel", fieldAdd: "Add", dialogClose: "Close dialog",
    siteInvalid: "Enter a valid public HTTPS domain.", siteDuplicate: "That domain has already been added.", plexInvalid: "Enter a valid local HTTP or HTTPS origin without an extra path.", plexDuplicate: "That origin has already been added.",
    appPathRequired: "Enter the full executable path first.", checkingApp: "Checking executable…", appPathInvalid: "The executable could not be validated.", validationError: "Validation failed. Check the path and try again.",
    removeApplication: "Remove application", removeSiteAction: "Remove site", removeServer: "Remove server", removeSite: "Remove {value}", removeApp: "Remove {value}", removeOrigin: "Remove {value}", statusPlaying: "Playing", statusPaused: "Paused", statusStopped: "Stopped", statusUnknown: "Unknown"
  });

  const ES = Object.freeze({
    brand: "Audio Ducking", settings: "Configuración", menuSettings: "Abrir configuración de Audio Ducking", close: "Cerrar", language: "Idioma", english: "Inglés", spanish: "Español",
    tagline: "Controla la reproducción mientras dictas", general: "General", enabled: "Activado", enabledHint: "Controla la reproducción automáticamente durante el dictado",
    modalSize: "Tamaño del panel", sizeAuto: "Automático", sizeCompact: "Compacto", sizeNormal: "Normal", sizeLarge: "Grande",
    activeLock: "La configuración está bloqueada mientras el dictado está activo.", whenDictating: "Al empezar a dictar", pause: "Pausar", duck: "Ducking",
    targetVolume: "Volumen durante el dictado", minimum: "0 %", maximum: "100 %", webIntegrations: "Integraciones web", webPlayers: "Reproductores web",
    webPlayersHint: "Control de sitios compatibles seleccionados", supportedSites: "Sitios compatibles", html5Control: "Control del reproductor HTML5", customHtml5: "Integración HTML5 personalizada",
    youtube: "YouTube", youtubeMusic: "YouTube Music", spotifyWeb: "Spotify Web", twitch: "Twitch", plexWeb: "Plex Web", behavior: "Comportamiento", mode: "Modo",
    inherit: "General", target: "Objetivo", ownTarget: "Usar objetivo propio", dictationVolume: "Volumen durante el dictado", useGlobalTarget: "Usar volumen global ({value} %)", useCustomTarget: "Personalizado", customTarget: "Volumen personalizado", effectiveGlobalTarget: "Volumen global aplicado: {value} %", remove: "Eliminar", add: "Añadir", added: "Añadida", updateIdentity: "Actualizar identidad",
    plexServers: "Servidores Plex locales", addPlexOrigin: "+ Añadir servidor", emptyPlexOrigins: "Añade el origen exacto de tu servidor local.",
    plexPermission: "Requiere autorización del host en Tampermonkey", plexHostHelp: "Audio Ducking solo controla la reproducción HTML5 local. Para cada servidor, añade la línea indicada en Tampermonkey → Editar. Firefox puede ignorar el puerto en la regla; el control comprueba el origen exacto.",
    otherSites: "Sitios personalizados", otherSitesHint: "Solo los dominios que añadas", addSite: "+ Añadir sitio web", authorizeSites: "Autorizar sitios en Tampermonkey",
    customShortHelp: "Añade un sitio compatible y autoriza su acceso de host en Tampermonkey.", customPermissionHelp: "En Tampermonkey, abre el editor del userscript y añade al encabezado la regla exacta que aparece para cada sitio. Si usas el agente opcional, el botón Autorizar sitios puede preparar esos permisos.", permissionDetails: "Detalles de permisos e instalación",
    emptySites: "Aún no hay sitios añadidos.", windowsApps: "Aplicaciones Windows", spotifyDesktop: "Spotify de escritorio", windowsMedia: "Control multimedia de Windows · volumen por aplicación",
    agentConnected: "Agente de Windows conectado", agentDisconnected: "Agente de Windows desconectado", agentDetailsTitle: "Detalles e instalación del agente",
    installWindowsAgent: "Instalar agente de Windows", agentInstallHint: "El agente opcional de Windows solo se necesita para reproductores de escritorio. La descarga empieza únicamente al pulsar este botón.",
    agentStartup: "Iniciar el agente al entrar en Windows", agentStartupHint: "Opcional. Desactivado de forma predeterminada; solo afecta a tu cuenta de Windows.",
    agentOptional: "El componente de Windows es opcional y solo se necesita para reproductores de escritorio. Consulta los nombres y rutas de procesos seleccionados, estados GSMTC y volumen WASAPI por aplicación mediante localhost autenticado. No graba el micrófono ni cambia el volumen maestro.",
    noSessions: "No hay sesiones activas ahora.", noOtherApps: "No hay otras aplicaciones seleccionadas.", addApp: "+ Añadir aplicación", refreshApps: "Actualizar lista", appEnabled: "Activar {value}", pathTooltip: "Ruta del ejecutable: {value}", appIdentifierTooltip: "Identificador de la aplicación: {value}",
    appPathHelp: "Selecciona una sesión de audio detectada o introduce la ruta completa de un ejecutable instalado.", detectedSessions: "Sesiones detectadas", path: "Ruta del ejecutable", pathPlaceholder: "C:\\Program Files\\Player\\player.exe",
    capabilityPause: "Sesión GSMTC detectada · pausa sin probar", capabilityVolume: "Sesión WASAPI detectada", capabilityNone: "Sin sesión activa · control sin probar", audioSession: "sesión de audio", audioSessions: "sesiones de audio",
    advanced: "Avanzado", voiceMode: "Conversaciones por voz de ChatGPT", voiceModeHint: "Desactivada por defecto", excludedDomains: "Dominios excluidos", excludedPlaceholder: "ejemplo.com", technicalDetails: "Detalles técnicos",
    transitions: "Transiciones de volumen", transitionHint: "Windows usa transiciones WASAPI por aplicación. Pausar conserva su espera en silencio; Ducking mantiene su mínimo de 250 ms. Los reproductores web usan los valores elegidos.",
    fadeOut: "Reducción gradual", fadeIn: "Restauración gradual", about: "Acerca de", aboutText: "Pausa o atenúa los reproductores seleccionados mientras dictas.", support: "Apoyar en Ko-fi", savedAutomatically: "Los cambios se guardan automáticamente.",
    dialogSiteTitle: "Añadir sitio web", dialogSiteDescription: "Introduce un sitio o dominio HTTPS. Se guardarán el dominio exacto y sus subdominios.", siteLabel: "Sitio web o dominio", sitePlaceholder: "https://ejemplo.com",
    dialogPlexTitle: "Añadir servidor Plex", dialogPlexDescription: "Añade solo el origen exacto (por ejemplo, http://192.168.1.25:32400). El acceso de host en Tampermonkey se añade por separado.", plexOriginLabel: "Origen del servidor", plexOriginPlaceholder: "http://192.168.1.25:32400",
    dialogAppTitle: "Añadir aplicación", dialogAppDescription: "Selecciona una sesión de audio detectada o introduce la ruta completa de un ejecutable instalado.", cancel: "Cancelar", fieldAdd: "Añadir", dialogClose: "Cerrar diálogo",
    siteInvalid: "Introduce un dominio público válido con HTTPS.", siteDuplicate: "Ese dominio ya está añadido.", plexInvalid: "Introduce un origen HTTP local o HTTPS válido, sin una ruta adicional.", plexDuplicate: "Ese origen ya está añadido.",
    appPathRequired: "Introduce primero la ruta completa del ejecutable.", checkingApp: "Comprobando ejecutable…", appPathInvalid: "No se pudo validar el ejecutable.", validationError: "Falló la validación. Revisa la ruta e inténtalo de nuevo.",
    removeApplication: "Eliminar aplicación", removeSiteAction: "Eliminar sitio", removeServer: "Eliminar servidor", removeSite: "Eliminar {value}", removeApp: "Eliminar {value}", removeOrigin: "Eliminar {value}", statusPlaying: "Reproduciendo", statusPaused: "En pausa", statusStopped: "Detenido", statusUnknown: "Desconocido"
  });

  const CATALOGS = Object.freeze({ en: EN, es: ES });
  const LANGUAGE_OPTIONS = Object.freeze([{ code: "en", labelKey: "english" }, { code: "es", labelKey: "spanish" }]);
  function normalizeLanguage(value) { return value === "es" ? "es" : "en"; }
  function translate(language, key, values = {}) {
    const normalized = normalizeLanguage(language);
    const template = CATALOGS[normalized][key] ?? CATALOGS.en[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) => values[name] == null ? match : String(values[name]));
  }

  root.AudioDuckI18n = Object.freeze({ CATALOGS, LANGUAGE_OPTIONS, normalizeLanguage, translate });
})(globalThis);

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

(function (root) {
  "use strict";

  function mediaFingerprint(pageHref, mediaSrc) {
    let page;
    try { page = new URL(pageHref); } catch (_) { return ""; }
    let pageKey = `${page.origin}${page.pathname}`;
    if ((page.hostname === "youtube.com" || page.hostname.endsWith(".youtube.com")) && page.pathname === "/watch") {
      pageKey += `?v=${page.searchParams.get("v") || ""}`;
    }
    let sourceKey = "";
    try {
      const media = new URL(mediaSrc || "", page.origin);
      if (media.protocol !== "blob:" && media.protocol !== "mediastream:") sourceKey = `${media.origin}${media.pathname}`;
    } catch (_) { /* A blob URL is represented by its page identity. */ }
    return `${pageKey}|${sourceKey}`;
  }

  async function fingerprint(pageHref, mediaSrc) {
    const value = mediaFingerprint(pageHref, mediaSrc);
    if (!value || !root.crypto?.subtle) return "";
    const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  class MediaController {
    constructor({ getElements, locationHref, tabId, getSettings, onChange = () => {}, onError = () => {}, persist = () => {} }) {
      this.getElements = getElements;
      this.locationHref = locationHref;
      this.tabId = tabId;
      this.getSettings = getSettings;
      this.onChange = onChange;
      this.onError = onError;
      this.persist = persist;
      this.sessionId = null;
      this.records = new Map();
      this.elements = new WeakMap();
      this.nextId = 1;
      this.generation = 0;
      this.restoring = false;
    }

    youtubePlayer(element) {
      let host = "";
      try { host = new URL(this.locationHref()).hostname; } catch (_) {}
      if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
      const player = element?.ownerDocument?.getElementById?.("movie_player");
      return typeof player?.getVolume === "function" && typeof player?.setVolume === "function" ? player : null;
    }

    readVolume(element) {
      const player = this.youtubePlayer(element);
      if (player) {
        try {
          const volume = Number(player.getVolume()) / 100;
          if (Number.isFinite(volume)) return Math.min(1, Math.max(0, volume));
        } catch (_) { /* Fall back to the HTML media control. */ }
      }
      return Number(element.volume);
    }

    writeVolume(record, volume) {
      const player = this.youtubePlayer(record.element);
      record.applyingVolume = true;
      try {
        if (player) player.setVolume(Math.round(volume * 100));
        else record.element.volume = volume;
        const actual = this.readVolume(record.element);
        if (!Number.isFinite(actual) || Math.abs(actual - volume) > (player ? 0.011 : 0.001)) throw new Error("el reproductor no aceptó el volumen solicitado");
        record.appliedVolume = actual;
        record.attenuated = actual < record.originalVolume - 0.00001;
        return actual;
      } finally { record.applyingVolume = false; }
    }

    cancelTransition(record) {
      if (record.fadeTimer) clearInterval(record.fadeTimer);
      record.fadeTimer = 0;
      record.fadeResolve?.(false);
      record.fadeResolve = null;
      record.transitionId = (record.transitionId || 0) + 1;
    }

    transition(record, target, durationMs) {
      this.cancelTransition(record);
      const transitionId = record.transitionId;
      const start = this.readVolume(record.element);
      record.appliedVolume = start;
      const duration = Math.max(0, Number(durationMs) || 0);
      if (duration === 0 || Math.abs(start - target) < 0.001) {
        try { this.writeVolume(record, target); return Promise.resolve(true); }
        catch (error) { return Promise.reject(error); }
      }
      const now = () => globalThis.performance?.now?.() ?? Date.now();
      const startedAt = now();
      let lastPersist = 0;
      return new Promise((resolve, reject) => {
        record.fadeResolve = resolve;
        const finish = (completed) => {
          clearInterval(record.fadeTimer);
          record.fadeTimer = 0;
          record.fadeResolve = null;
          if (completed) this.changed();
          resolve(completed);
        };
        record.fadeTimer = setInterval(() => {
          if (record.transitionId !== transitionId) { finish(false); return; }
          const progress = Math.min(1, Math.max(0, (now() - startedAt) / duration));
          const value = start + (target - start) * progress;
          try { this.writeVolume(record, progress === 1 ? target : value); }
          catch (error) { clearInterval(record.fadeTimer); record.fadeTimer = 0; record.fadeResolve = null; reject(error); return; }
          if (now() - lastPersist >= 64) { lastPersist = now(); this.changed(); }
          if (progress === 1) finish(true);
        }, 16);
      });
    }

    activeElements() {
      return [...this.getElements()].filter((element) => element && !element.paused && !element.ended);
    }

    async begin(session) {
      const sessionId = session.id || session.sessionId;
      if (!sessionId) return this.status();
      const newSession = this.sessionId && this.sessionId !== sessionId;
      if (newSession) {
        this.generation++;
        this.restoring = false;
        for (const record of this.records.values()) this.cancelTransition(record);
      }
      this.sessionId = sessionId;
      const generation = ++this.generation;
      const settings = session.settings || this.getSettings();
      const duckJobs = [];
      const pauseJobs = [];

      const candidates = new Set(this.activeElements());
      for (const record of this.records.values()) {
        if (record.ownsPause && !record.manualOverride && !record.element.ended) candidates.add(record.element);
      }
      for (const element of candidates) {
        if (generation !== this.generation || this.sessionId !== sessionId) break;
        const pageHref = this.locationHref();
        const source = element.currentSrc || element.src || "";
        const sourceFingerprint = mediaFingerprint(pageHref, source);
        const prior = this.elements.get(element);
        if (prior && prior.mediaIdentity === sourceFingerprint && prior.sessionId === sessionId) continue;
        if (prior && prior.mediaIdentity === sourceFingerprint) {
          const previousMode = prior.mode;
          prior.sessionId = sessionId;
          prior.manualOverride = false;
          prior.targetVolumePercent = settings.targetVolumePercent;
          prior.fadeOutMs = settings.fadeOutMs ?? 200;
          prior.fadeInMs = settings.fadeInMs ?? 350;
          prior.fallbackToPause = settings.mode === "duck" && settings.fallbackToPause;
          if (settings.mode === "duck") {
            if (prior.ownsPause && element.paused) {
              prior.ownsPause = false;
              try { await element.play(); }
              catch (error) { prior.ownsPause = true; this.onError(`No se pudo reanudar antes del ducking: ${error?.message || error}`); continue; }
            }
            duckJobs.push(this.duck(prior, prior.fadeOutMs));
          } else if (previousMode !== "pause" || !prior.ownsPause) {
            pauseJobs.push(this.pause(element, prior, settings));
          } else {
            prior.mode = "pause";
            prior.transitionState = "paused";
          }
          continue;
        }
        if (prior) this.forget(prior);
        const record = {
          id: `${this.tabId}:${this.nextId++}`,
          element,
          mediaType: element.tagName?.toLowerCase() || "media",
          pageHrefAtPause: pageHref,
          sourceFingerprint,
          sourceAtPause: source,
          mediaIdentity: mediaFingerprint(pageHref, source),
          mode: settings.mode,
          wasPlaying: true,
          originalVolume: this.readVolume(element),
          appliedVolume: null,
          sessionId,
          targetVolumePercent: settings.targetVolumePercent,
          fadeOutMs: settings.fadeOutMs ?? 200,
          fadeInMs: settings.fadeInMs ?? 350,
          fallbackToPause: settings.mode === "duck" && settings.fallbackToPause,
          ownsPause: false,
          manualOverride: false,
          manualVolumeChanged: false,
          pauseFadeSupported: false,
          transitionState: "idle",
          fallbackUsed: false,
          unsupported: false,
          pauseCommandPending: false,
          applyingVolume: false,
          listeners: []
        };
        this.elements.set(element, record);
        this.records.set(record.id, record);
        fingerprint(pageHref, source).then((value) => {
          if (value && this.records.get(record.id) === record) {
            record.sourceFingerprint = value;
            this.changed();
          }
        }).catch((error) => this.onError(`No se pudo identificar el reproductor: ${error?.message || error}`));
        this.listen(record, "play", () => {
          if (record.ownsPause && !this.restoring) {
            record.manualOverride = true;
            record.ownsPause = false;
            record.transitionState = "manual-play";
            this.cancelTransition(record);
            if (record.mode === "pause" && record.pauseFadeSupported) {
              this.transition(record, record.originalVolume, record.fadeInMs ?? 350)
                .catch((error) => this.onError(`No se pudo restaurar gradualmente el volumen: ${error?.message || error}`));
            }
          }
          this.changed();
        });
        this.listen(record, "pause", () => {
          if (record.pauseCommandPending && element.paused) {
            record.pauseCommandPending = false;
            record.ownsPause = true;
            record.transitionState = "paused";
          } else if (record.transitionState === "pause-fade-out" && !this.restoring) {
            record.manualOverride = true;
            record.transitionState = "manual-pause";
            this.cancelTransition(record);
            if (record.pauseFadeSupported) {
              try { this.writeVolume(record, record.originalVolume); } catch (_) {}
            }
          } else if (record.ownsPause && !this.restoring) {
            record.manualOverride = true;
            record.ownsPause = false;
            record.transitionState = "manual-pause";
          }
          this.changed();
        });
        this.listen(record, "ended", () => { record.manualOverride = true; this.changed(); });
        this.listen(record, "volumechange", () => this.volumeChanged(record));

        if (settings.mode === "duck") duckJobs.push(this.duck(record, record.fadeOutMs));
        else pauseJobs.push(this.pause(element, record, settings));
      }
      this.changed();
      await Promise.all([...duckJobs, ...pauseJobs]);
      return this.status();
    }

    async pause(element, record = this.elements.get(element), settings = null) {
      if (!record || element.paused || element.ended) return;
      settings ||= this.getSettings();
      this.cancelTransition(record);
      record.mode = "pause";
      record.transitionState = "pause-fade-out";
      record.pauseFadeSupported = true;
      const operationId = record.pauseOperationId = (record.pauseOperationId || 0) + 1;
      let faded = false;
      try {
        while (!faded) {
          faded = await this.transition(record, 0, record.fadeOutMs ?? 200);
          if (!faded && (record.pauseOperationId !== operationId || record.transitionState !== "pause-fade-out" || record.manualOverride || element.paused || element.ended)) return;
        }
      } catch (error) {
        record.pauseFadeSupported = false;
        record.transitionState = "pause-immediate";
        this.onError(`Fade de pausa no disponible; se pausa inmediatamente (${error?.message || error}).`);
      }
      if (record.pauseOperationId !== operationId || record.manualOverride || element.paused || element.ended) return;
      record.transitionState = "pause-command";
      record.pauseCommandPending = true;
      try { element.pause(); } catch (error) { this.onError(`pause(): ${error?.message || error}`); }
      record.pauseCommandPending = false;
      if (element.paused) {
        record.ownsPause = true;
        record.transitionState = "paused";
        if (!record.pauseFadeSupported) {
          try { this.writeVolume(record, record.originalVolume); } catch (_) {}
        }
      } else if (settings.fallbackDucking) {
        record.pauseCommandPending = false;
        if (!record.pauseFadeSupported) {
          try { this.writeVolume(record, record.originalVolume); } catch (_) {}
        }
        record.transitionState = "idle";
        await this.duck(record, Math.min(100, record.fadeOutMs ?? 200));
      } else {
        record.pauseCommandPending = false;
        if (!record.pauseFadeSupported) {
          try { this.writeVolume(record, record.originalVolume); } catch (_) {}
        }
        record.transitionState = "unsupported";
        record.unsupported = true;
        this.onError(`El reproductor ${record.mediaType} no admite pausa.`);
      }
      this.changed();
    }

    listen(record, name, handler) {
      record.element.addEventListener(name, handler);
      record.listeners.push([name, handler]);
    }

    forget(record) {
      this.cancelTransition(record);
      if (record.mode === "duck" && !record.manualOverride && record.appliedVolume !== null && Math.abs(this.readVolume(record.element) - record.appliedVolume) < 0.012) {
        try { this.writeVolume(record, record.originalVolume); } catch (_) {}
      }
      for (const [name, handler] of record.listeners) record.element.removeEventListener(name, handler);
      this.records.delete(record.id);
      this.elements.delete(record.element);
    }

    async duck(record, durationMs = record.fadeOutMs ?? 200) {
      const target = Math.min(record.originalVolume, record.targetVolumePercent / 100);
      try {
        record.pauseOperationId = (record.pauseOperationId || 0) + 1;
        record.mode = "duck";
        record.transitionState = "ducking";
        await this.transition(record, target, durationMs);
      } catch (error) {
        record.appliedVolume = null;
        try { this.writeVolume(record, record.originalVolume); } catch (_) {}
        if (record.fallbackToPause) {
          try {
            record.pauseCommandPending = true;
            record.element.pause();
            if (record.element.paused) {
              record.pauseCommandPending = false;
              record.ownsPause = true;
              record.fallbackUsed = true;
              record.mode = "pause";
              this.onError(`Ducking no admitido; reproductor pausado como alternativa (${error?.message || error}).`);
              return;
            }
          } catch (_) {}
        }
        record.pauseCommandPending = false;
        record.unsupported = true;
        record.mode = "unsupported";
        this.onError(`No se pudo atenuar ${record.mediaType}${record.fallbackToPause ? " ni pausar" : ""}.`);
      }
    }

    volumeChanged(record) {
      if (record.applyingVolume || record.appliedVolume === null) return;
      const current = this.readVolume(record.element);
      const tolerance = this.youtubePlayer(record.element) ? 0.012 : 0.00001;
      if (!Number.isFinite(current) || Math.abs(current - record.appliedVolume) < tolerance) return;
      if (this.restoring) {
        record.originalVolume = current;
        record.manualVolumeChanged = true;
        record.manualOverride = true;
        this.cancelTransition(record);
        record.appliedVolume = current;
        record.transitionState = "manual-volume";
        this.changed();
        return;
      }
      if (record.mode === "pause" && record.pauseFadeSupported) {
        record.originalVolume = current;
        record.manualVolumeChanged = true;
        if (record.transitionState === "pause-fade-out") this.cancelTransition(record);
        else record.appliedVolume = current;
        this.changed();
        return;
      }
      if (record.mode !== "duck") return;
      record.originalVolume = current;
      record.manualVolumeChanged = true;
      this.duck(record, Math.min(100, record.fadeOutMs)).catch((error) => this.onError(`No se pudo mantener el ducking: ${error?.message || error}`));
      this.changed();
    }

    changed() {
      this.persist(this.snapshot());
      this.onChange(this.status());
    }

    status() {
      return {
        sessionId: this.sessionId,
        playingCount: this.activeElements().length,
        touchedCount: this.records.size,
        pausedCount: [...this.records.values()].filter((record) => record.mode === "pause" && record.ownsPause && !record.manualOverride).length,
        duckedCount: [...this.records.values()].filter((record) => record.mode === "duck" && record.attenuated).length,
        unchangedCount: [...this.records.values()].filter((record) => record.mode === "duck" && !record.attenuated).length,
        fallbackPausedCount: [...this.records.values()].filter((record) => record.fallbackUsed).length,
        unsupportedCount: [...this.records.values()].filter((record) => record.unsupported).length,
        appliedVolumePercentRange: (() => {
          const levels = [...this.records.values()].filter((record) => record.mode === "duck" && record.appliedVolume !== null)
            .map((record) => Math.round(record.appliedVolume * 100));
          return levels.length ? [Math.min(...levels), Math.max(...levels)] : null;
        })(),
        errors: []
      };
    }

    snapshot() {
      return [...this.records.values()].map((record) => ({
        id: record.id,
        mediaType: record.mediaType,
        sourceFingerprint: record.sourceFingerprint,
        mode: record.mode,
        wasPlaying: record.wasPlaying,
        originalVolume: record.originalVolume,
        appliedVolume: record.appliedVolume,
        fadeInMs: record.fadeInMs,
        ownsPause: record.ownsPause,
        manualOverride: record.manualOverride,
        sessionId: this.sessionId,
        savedAt: Date.now()
      }));
    }

    async restorePending(actions = []) {
      const restored = [];
      const elements = [...this.getElements()];
      for (const action of actions) {
        let element = null;
        for (const candidate of elements) {
          if ((candidate.tagName?.toLowerCase() || "media") !== action.mediaType) continue;
          const currentFingerprint = mediaFingerprint(this.locationHref(), candidate.currentSrc || candidate.src || "");
          if (currentFingerprint === action.sourceFingerprint ||
              await fingerprint(this.locationHref(), candidate.currentSrc || candidate.src || "") === action.sourceFingerprint) {
            element = candidate;
            break;
          }
        }
        if (!element) continue;
        const currentVolume = this.readVolume(element);
        if (action.mode === "duck" && action.appliedVolume !== null && Math.abs(currentVolume - action.appliedVolume) < (this.youtubePlayer(element) ? 0.012 : 0.00001)) {
          const record = { element, originalVolume: action.originalVolume, appliedVolume: action.appliedVolume, applyingVolume: false };
          this.writeVolume(record, action.originalVolume);
          restored.push(action.id);
        } else if (action.mode === "pause" && action.wasPlaying && !action.manualOverride && !element.ended &&
            action.appliedVolume !== null && Math.abs(currentVolume - action.appliedVolume) < (this.youtubePlayer(element) ? 0.012 : 0.00001)) {
          const record = { element, originalVolume: action.originalVolume, appliedVolume: currentVolume, applyingVolume: false,
            fadeInMs: action.fadeInMs ?? 350, pauseFadeSupported: true };
          try {
            if (action.ownsPause && element.paused) {
              this.writeVolume(record, 0);
              await element.play();
            }
            await this.transition(record, record.originalVolume, record.fadeInMs);
            restored.push(action.id);
          } catch (error) {
            try { this.writeVolume(record, record.originalVolume); } catch (_) {}
            this.onError(`No se pudo restaurar el reproductor: ${error?.message || error}`);
          }
        } else if (action.mode === "pause" && action.wasPlaying && action.ownsPause && !action.manualOverride && element.paused && !element.ended &&
            action.appliedVolume == null) {
          try { await element.play(); restored.push(action.id); }
          catch (error) { this.onError(`No se pudo restaurar el reproductor: ${error?.message || error}`); }
        }
      }
      return restored;
    }

    async restore(sessionId = null) {
      if (sessionId && this.sessionId && sessionId !== this.sessionId) return [];
      const generation = ++this.generation;
      const restored = [];
      const playJobs = [];
      this.restoring = true;
      try {
        for (const [id, record] of this.records) {
          record.pauseOperationId = (record.pauseOperationId || 0) + 1;
          this.cancelTransition(record);
          const currentSource = record.element.currentSrc || record.element.src || "";
          const sameMedia = !record.mediaIdentity || mediaFingerprint(record.pageHrefAtPause, currentSource) === record.mediaIdentity;
          if (record.manualOverride) {
            if (record.mode === "pause" && record.transitionState === "manual-play" && record.pauseFadeSupported) {
              playJobs.push(this.transition(record, record.originalVolume, record.fadeInMs ?? 350).then((done) => { if (done) restored.push(id); })
                .catch((error) => this.onError(`No se pudo restaurar gradualmente el volumen: ${error?.message || error}`)));
            }
            continue;
          }
          if (record.element.ended) continue;
          if (record.mode === "duck") {
            if (record.appliedVolume !== null && Math.abs(this.readVolume(record.element) - record.appliedVolume) < (this.youtubePlayer(record.element) ? 0.012 : 0.00001)) {
              playJobs.push(this.transition(record, record.originalVolume, record.fadeInMs ?? 350).then((done) => { if (done) restored.push(id); })
                .catch((error) => this.onError(`No se pudo restaurar gradualmente el volumen: ${error?.message || error}`)));
            }
          } else if (sameMedia && record.wasPlaying && record.ownsPause && record.element.paused) {
            playJobs.push((async () => {
              try {
                if (record.pauseFadeSupported) this.writeVolume(record, 0);
                await record.element.play();
                if (record.pauseFadeSupported) await this.transition(record, record.originalVolume, record.fadeInMs ?? 350);
                else this.writeVolume(record, record.originalVolume);
                restored.push(id);
              } catch (error) {
                if (record.pauseFadeSupported) { try { this.writeVolume(record, record.originalVolume); } catch (_) {} }
                this.onError(`No se pudo reanudar ${record.mediaType}: ${error?.message || error}`);
              }
            })());
          } else if (sameMedia && record.mode === "pause" && record.pauseFadeSupported && record.wasPlaying && !record.element.paused &&
              record.appliedVolume !== null && Math.abs(this.readVolume(record.element) - record.appliedVolume) < (this.youtubePlayer(record.element) ? 0.012 : 0.00001)) {
            playJobs.push(this.transition(record, record.originalVolume, record.fadeInMs ?? 350).then((done) => { if (done) restored.push(id); })
              .catch((error) => this.onError(`No se pudo restaurar gradualmente el volumen: ${error?.message || error}`)));
          }
        }
        await Promise.all(playJobs);
      } finally {
        if (generation !== this.generation) return [];
        this.restoring = false;
        this.detach();
      }
      return restored;
    }

    detach() {
      for (const record of this.records.values()) {
        for (const [name, handler] of record.listeners) record.element.removeEventListener(name, handler);
        this.elements.delete(record.element);
      }
      this.records.clear();
      this.sessionId = null;
      this.changed();
    }
  }

  const api = { MediaController, mediaFingerprint, fingerprint };
  root.AudioDuckMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);

(function (root) {
  "use strict";

  const VOICE_ACTIVE = /(?:mute\s+microphone|unmute\s+microphone|end\s+(?:voice|call)|exit\s+voice|leave\s+voice|silenciar\s+micr[oó]fono|finalizar\s+voz|salir\s+de\s+voz|voice\s+conversation\s+active|modo\s+de\s+voz\s+activo)/i;
  const RECORDING_ACTIVE = /(?:stop|pause|finish|cancel|send|end|submit|done)\s+(?:(?:audio|voice)\s+)?(?:record(?:ing)?|dictat(?:e|ion|ing)?|voice\s+input)|(?:record(?:ing)?|dictat(?:ion|ing)?|voice\s+input)\s+(?:is\s+)?(?:active|started|recording)|(?:detener|finalizar|cancelar|parar|enviar|terminar)\s+(?:la\s+)?(?:grabaci[oó]n|dictado|entrada\s+de\s+voz)|(?:grabaci[oó]n|dictado)\s+(?:activa|iniciada|grabando)/i;
  const DICTATION_CONTROL = /(?:dictat(?:e|ion|ing)?|dictar|dictado|microphone|\bmic\b|record(?:ing)?\s+audio|grabar\s+audio|grabar\s+mensaje|micr[oó]fono|voice\s+input|entrada\s+de\s+voz)/i;
  const STOP_CONFIRMATION_MS = 32;

  class ChatGPTDetector {
    constructor({ doc, win, getSettings, onStart, onStop, onState, onError }) {
      this.doc = doc;
      this.win = win;
      this.getSettings = getSettings;
      this.onStart = onStart;
      this.onStop = onStop;
      this.onState = onState;
      this.onError = onError;
      this.current = null;
      this.stopTimer = 0;
      this.stopObservedAt = 0;
      this.observer = null;
      this.removers = [];
      this.suppressed = false;
    }

    start() {
      this.on(this.win, "pagehide", () => this.finish("chatgpt-tab-closed"), { once: true });
      try {
        const Observer = this.win.MutationObserver;
        if (typeof Observer !== "function") throw new Error("MutationObserver no disponible");
        this.observer = new Observer((records) => {
          if (records.some((record) => this.isRelevantMutation(record))) this.safeEvaluate("dom-change");
        });
        this.observer.observe(this.doc.documentElement || this.doc, {
          subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ["aria-label", "aria-pressed", "title", "data-testid", "data-state", "data-status", "disabled"]
        });
      } catch (error) {
        this.observer?.disconnect();
        this.observer = null;
        this.onError(`No se pudo observar el estado del dictado: ${error?.message || error}`);
      }
      this.safeEvaluate("initial");
      return this;
    }

    on(target, name, listener, options) {
      target.addEventListener(name, listener, options);
      this.removers.push(() => target.removeEventListener(name, listener, options));
    }

    isRelevantMutation(record) {
      const isButton = (node) => {
        if (!node) return false;
        const element = node.nodeType === 1 ? node : node.parentElement;
        return Boolean(element?.matches?.("button,[role='button']") || element?.closest?.("button,[role='button']"));
      };
      if (record.type !== "childList") return isButton(record.target);
      if (isButton(record.target)) return true;
      return [...record.addedNodes, ...record.removedNodes].some((node) => {
        if (isButton(node)) return true;
        return Boolean(node?.querySelector?.("button,[role='button']"));
      });
    }

    buttonLabel(button) {
      return [button.getAttribute("aria-label"), button.getAttribute("title"), button.getAttribute("data-testid"), button.textContent]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 160);
    }

    visibleButtons() {
      return [...this.doc.querySelectorAll("button,[role='button']")].filter((button) => {
        if (button.hidden || button.getAttribute("aria-hidden") === "true") return false;
        const rect = button.getBoundingClientRect?.();
        return !rect || (rect.width > 0 && rect.height > 0);
      });
    }

    isRecordingButton(button, label) {
      if (RECORDING_ACTIVE.test(label)) return true;
      if (VOICE_ACTIVE.test(label) || !DICTATION_CONTROL.test(label)) return false;
      const state = `${button.getAttribute("data-state") || ""} ${button.getAttribute("data-status") || ""}`;
      return button.getAttribute("aria-pressed") === "true" || /(?:recording|listening|active)/i.test(state);
    }

    uiState() {
      const buttons = this.visibleButtons().map((button) => ({ button, label: this.buttonLabel(button) }));
      return {
        voiceActive: buttons.some(({ label }) => VOICE_ACTIVE.test(label)),
        recordingActive: buttons.some(({ button, label }) => this.isRecordingButton(button, label))
      };
    }

    safeEvaluate(reason) {
      try { this.evaluate(reason); }
      catch (error) { this.onError(`No se pudo leer el estado del dictado: ${error?.message || error}`); }
    }

    evaluate(reason) {
      const ui = this.uiState();
      const settings = this.getSettings();
      if (this.suppressed) {
        if (!ui.recordingActive && !ui.voiceActive) this.suppressed = false;
        else { this.publish(ui); return; }
      }
      if (ui.voiceActive && settings.voiceMode) {
        if (!this.current) this.begin("voice", `ui:${reason}`);
        this.cancelStopTimer();
        return;
      }
      if (ui.voiceActive && this.current?.kind === "voice") {
        this.finish("voice-mode-disabled");
        return;
      }
      if (ui.recordingActive) {
        if (!this.current) this.begin("dictation", `ui:${reason}`);
        this.cancelStopTimer();
        return;
      }
      if (this.current) this.scheduleStop("recording-control-ended");
      this.publish(ui);
    }

    begin(kind, source) {
      if (this.current || !this.getSettings().enabled) return;
      if (kind === "voice" && !this.getSettings().voiceMode) return;
      const id = `dictation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      this.current = { id, kind, startedAt: Date.now(), source };
      this.cancelStopTimer();
      this.onStart({ ...this.current });
      this.publish();
    }

    scheduleStop(reason) {
      if (this.stopTimer) return;
      this.stopObservedAt = this.win.performance?.now?.() ?? Date.now();
      this.stopTimer = setTimeout(() => {
        this.stopTimer = 0;
        const ui = this.uiState();
        const confirmedAt = this.win.performance?.now?.() ?? Date.now();
        if (this.current && !ui.recordingActive && !(this.current.kind === "voice" && ui.voiceActive)) {
          this.finish(reason, { detectedAt: this.stopObservedAt, confirmationMs: confirmedAt - this.stopObservedAt });
        }
        this.stopObservedAt = 0;
      }, STOP_CONFIRMATION_MS);
    }

    cancelStopTimer() { clearTimeout(this.stopTimer); this.stopTimer = 0; this.stopObservedAt = 0; }

    finish(reason, timing = {}) {
      this.cancelStopTimer();
      const ended = this.current;
      if (!ended) return;
      this.current = null;
      this.onStop({ ...ended, reason, endedAt: Date.now(), detectedAt: timing.detectedAt ?? (this.win.performance?.now?.() ?? Date.now()), confirmationMs: timing.confirmationMs ?? 0 });
      this.publish();
    }

    suppressCurrent() {
      this.suppressed = true;
      this.finish("manual-restore");
    }

    publish(ui = this.uiState()) {
      this.onState({
        recognized: true,
        active: Boolean(this.current),
        kind: this.current?.kind || null,
        source: this.current?.source || null,
        uiRecording: ui.recordingActive,
        voiceUi: ui.voiceActive,
        changedAt: Date.now()
      });
    }

    dispose() {
      this.finish("chatgpt-tab-unloaded");
      this.observer?.disconnect();
      this.removers.forEach((remove) => remove());
      this.cancelStopTimer();
    }
  }

  const api = { ChatGPTDetector, STOP_CONFIRMATION_MS };
  root.AudioDuckChat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);

(function (root) {
  "use strict";

  const BASE_URL = "http://127.0.0.1:48731";
  const COMMAND_URL = `${BASE_URL}/v1/command`;
  const TOKEN_KEY = "agentToken";

  function token() {
    try { return typeof GM_getValue === "function" ? String(GM_getValue(TOKEN_KEY, "") || "") : ""; }
    catch (_) { return ""; }
  }

  function hexBytes(value) {
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Credencial local no válida");
    return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
  }

  function base64url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (char) => char.charCodeAt(0));
  }

  async function signature(secret, message) {
    if (!root.crypto?.subtle) throw new Error("WebCrypto no está disponible para autenticar el agente");
    const key = await root.crypto.subtle.importKey("raw", hexBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return base64url(new Uint8Array(await root.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
  }

  async function verify(secret, message, expected) {
    const actual = fromBase64url(await signature(secret, message));
    const received = fromBase64url(expected);
    if (actual.length !== received.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ received[i];
    return diff === 0;
  }

  function request(payload, timeout = 1800) {
    const secret = token();
    if (!secret) return Promise.reject(new Error("Empareja el agente Windows desde su acceso del menú Inicio"));
    if (typeof GM_xmlhttpRequest !== "function") return Promise.reject(new Error("Tampermonkey no expone GM_xmlhttpRequest"));
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = base64url(root.crypto.getRandomValues(new Uint8Array(16)));
    const message = `req\nPOST\n/v1/command\n${timestamp}\n${nonce}\n${body}`;
    return signature(secret, message).then((signed) => new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: COMMAND_URL,
        headers: {
          "Content-Type": "application/json",
          "X-Audio-Ducking-Timestamp": timestamp,
          "X-Audio-Ducking-Nonce": nonce,
          "X-Audio-Ducking-Signature": signed
        },
        data: body,
        anonymous: true,
        redirect: "error",
        timeout,
        responseType: "text",
        onload(response) {
          const responseNonce = response.responseHeaders?.match(/^x-audio-ducking-response-nonce:\s*([^\r\n]+)/im)?.[1]?.trim();
          const responseSignature = response.responseHeaders?.match(/^x-audio-ducking-response-signature:\s*([^\r\n]+)/im)?.[1]?.trim();
          const text = String(response.responseText || "");
          if (responseNonce !== nonce || !responseSignature) { reject(new Error("Respuesta del agente no autenticada")); return; }
          verify(secret, `resp\n${response.status}\n${nonce}\n${text}`, responseSignature).then((valid) => {
            if (!valid) { reject(new Error("Firma de respuesta del agente no válida")); return; }
            let value;
            try { value = JSON.parse(text); } catch (_) { reject(new Error("Respuesta no válida del agente Windows")); return; }
            if (response.status < 200 || response.status >= 300) { reject(new Error(value?.error || `Agente Windows respondió HTTP ${response.status}`)); return; }
            resolve(value);
          }, reject);
        },
        onerror() { reject(new Error("No se pudo conectar al agente Windows")); },
        ontimeout() { reject(new Error("El agente Windows no respondió a tiempo")); },
        onabort() { reject(new Error("Solicitud al agente cancelada")); }
      });
    }));
  }

  function isPairPage(href = root.location?.href || "") {
    try {
      const url = new URL(href);
      return url.origin === BASE_URL && url.pathname === "/pair" && /^[a-f0-9]{64}$/i.test(url.hash.slice(1));
    } catch (_) { return false; }
  }

  function setPairStatus(doc, message) {
    const update = () => { const status = doc?.querySelector?.("[data-pair-status]"); if (status) status.textContent = message; };
    if (doc?.readyState === "loading") doc.addEventListener("DOMContentLoaded", update, { once: true });
    else update();
  }

  function completePairing(win = root, doc = root.document) {
    if (!isPairPage(win.location.href)) return Promise.resolve(false);
    const code = win.location.hash.slice(1);
    win.history.replaceState(null, "", `${win.location.pathname}${win.location.search}`);
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") { reject(new Error("Tampermonkey no está disponible en este navegador")); return; }
      GM_xmlhttpRequest({
        method: "POST", url: `${BASE_URL}/v1/pair`, headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ code }), anonymous: true, redirect: "error", timeout: 5000, responseType: "text",
        onload(response) {
          let value;
          try { value = JSON.parse(response.responseText || "{}"); } catch (_) { value = null; }
          if (response.status < 200 || response.status >= 300 || !/^[a-f0-9]{64}$/i.test(value?.token || "")) {
            reject(new Error(value?.error || "No se pudo emparejar. Inicia otra vez Audio Ducking Agent para generar un código nuevo."));
            return;
          }
          try { GM_setValue(TOKEN_KEY, value.token); }
          catch (_) { reject(new Error("Tampermonkey no pudo guardar la credencial local")); return; }
          setPairStatus(doc, "Audio Ducking is connected to this browser. You can close this tab.");
          resolve(true);
        },
        onerror() { reject(new Error("No se pudo conectar al agente local")); },
        ontimeout() { reject(new Error("El código de emparejamiento ha caducado. Inicia otra vez el agente.")); },
        onabort() { reject(new Error("Emparejamiento cancelado")); }
      });
    });
  }

  const api = {
    request,
    isPairPage,
    completePairing,
    setPairStatus,
    get configured() { return /^[a-f0-9]{64}$/i.test(token()); },
    installUrl: "https://github.com/fevegit/audio-ducking/releases/download/v2.7.5/Audio-Ducking-Windows-Agent-2.7.5-x64.msi"
  };
  root.AudioDuckAgent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);

(function (root) {
  "use strict";

  class SettingsPage {
    constructor({ doc, getSettings, saveSettings, getState, prepareSites, validateAppPath, setAutostart, onError = () => {} }) {
      Object.assign(this, { doc, getSettings, saveSettings, getState, prepareSites, validateAppPath, setAutostart, onError });
      this.host = null; this.shadow = null; this.renderId = 0; this.renderQueued = false; this.opened = false; this.previousFocus = null; this.pollTimer = 0; this.lastState = null;
      this.onChange = (event) => { event.stopPropagation(); void this.change(event); };
      this.onClick = (event) => { event.stopPropagation(); void this.click(event); };
      this.onInput = (event) => { event.stopPropagation(); this.input(event); };
      this.onSubmit = (event) => { event.stopPropagation(); void this.submit(event); };
      this.onKeyDown = (event) => this.keydown(event);
      this.onWheel = (event) => { const path = event.composedPath(); if (!path.includes(this.shadow?.querySelector("main")) && !path.includes(this.shadow?.querySelector("dialog[open]"))) event.preventDefault(); event.stopPropagation(); };
      this.onFocusOut = (event) => { event.stopPropagation(); if (event.target.matches?.("input,textarea")) setTimeout(() => { if (this.renderQueued) void this.render(); }, 0); };
      this.onDialogClose = () => { if (this.renderQueued) setTimeout(() => void this.render(), 0); };
    }

    t(key, values) { return root.AudioDuckI18n.translate(this.getSettings().language, key, values); }
    e(key, values) { return this.escape(this.t(key, values)); }

    async refreshState() { this.applyState(await this.state()); }

    applyState(state, { updateApps = false } = {}) {
      if (!this.shadow || !this.opened) return;
      const prior = this.lastState;
      this.lastState = state;
      if (!prior || Boolean(prior.sessionActive) !== Boolean(state.sessionActive)) { void this.render(); return; }
      const connected = Boolean(state.agent?.ok);
      const status = this.shadow.querySelector("[data-agent-status]");
      if (status) status.textContent = this.t(connected ? "agentConnected" : "agentDisconnected");
      const dot = this.shadow.querySelector("[data-status-dot]");
      if (dot) dot.dataset.ok = String(connected);
      for (const control of this.shadow.querySelectorAll("[data-agent-control]")) control.disabled = !connected || Boolean(state.sessionActive);
      const startup = this.shadow.querySelector("[data-agent-autostart]");
      if (startup) { startup.checked = Boolean(state.agent?.autostartEnabled); startup.disabled = !connected || Boolean(state.sessionActive); }
      const detected = updateApps && this.shadow.querySelector(".detected");
      if (detected) detected.innerHTML = `<p class="section-title">${this.e("detectedSessions")}</p>${(state.apps || []).map((app) => this.detectedAppRow(app, this.getSettings(), "")).join("") || `<p class="empty">${this.e("noSessions")}</p>`}`;
    }

    open() {
      if (!this.doc.body) {
        this.doc.addEventListener("DOMContentLoaded", () => this.open(), { once: true });
        return;
      }
      if (this.host) { this.opened = true; this.host.hidden = false; void this.render(); return; }
      this.previousFocus = this.doc.activeElement;
      this.opened = true;
      this.animateNextRender = true;
      this.host = this.doc.createElement("div");
      this.host.id = "audio-ducking-settings-modal";
      this.host.dataset.audioDuckingModal = "true";
      this.host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:block;pointer-events:none";
      this.shadow = this.host.attachShadow({ mode: "open" });
      for (const [type, listener] of [["change", this.onChange], ["click", this.onClick], ["input", this.onInput], ["submit", this.onSubmit], ["keydown", this.onKeyDown], ["focusout", this.onFocusOut]]) this.shadow.addEventListener(type, listener);
      this.shadow.addEventListener("close", this.onDialogClose, true);
      this.shadow.addEventListener("wheel", this.onWheel, { passive: false });
      this.doc.body.append(this.host);
      void this.render().then(() => this.shadow?.querySelector(".panel")?.focus());
      this.pollTimer = setInterval(() => { if (this.opened && !this.doc.hidden) void this.refreshState(); }, 5000);
    }

    mount() { this.open(); }

    close({ restoreFocus = true } = {}) {
      if (!this.host) return;
      this.opened = false; this.renderId++; this.renderQueued = false; clearInterval(this.pollTimer); this.pollTimer = 0;
      for (const [type, listener] of [["change", this.onChange], ["click", this.onClick], ["input", this.onInput], ["submit", this.onSubmit], ["keydown", this.onKeyDown], ["focusout", this.onFocusOut]]) this.shadow?.removeEventListener(type, listener);
      this.shadow?.removeEventListener("close", this.onDialogClose, true);
      this.shadow?.removeEventListener("wheel", this.onWheel);
      this.host.remove(); this.host = null; this.shadow = null; this.lastState = null;
      if (restoreFocus && this.previousFocus?.isConnected && typeof this.previousFocus.focus === "function") this.previousFocus.focus();
      this.previousFocus = null;
    }

    async state() { try { return await this.getState(); } catch (error) { this.onError(error); return {}; } }

    async render() {
      if (!this.shadow || !this.opened) return;
      const active = this.shadow.activeElement;
      if (this.shadow.querySelector("dialog[open]") || (active?.matches?.("input[type=text],input[type=url],textarea") && !active.closest("dialog"))) { this.renderQueued = true; return; }
      this.renderQueued = false;
      const renderId = ++this.renderId, settings = this.getSettings(), state = await this.state();
      if (!this.shadow || !this.opened || renderId !== this.renderId) return;
      this.lastState = state;
      const currentActive = this.shadow.activeElement;
      if (this.shadow.querySelector("dialog[open]") || (currentActive?.matches?.("input[type=text],input[type=url],textarea") && !currentActive.closest("dialog"))) { this.renderQueued = true; return; }
      const entrance = this.animateNextRender ? " entering" : "";
      const focusableSelector = "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex]:not([tabindex=\"-1\"])";
      const detailsState = new Map([...this.shadow.querySelectorAll("details[data-section]")].map((item) => [item.dataset.section, item.open]));
      const scrollTop = this.shadow.querySelector("main")?.scrollTop || 0;
      const focusKey = currentActive?.getAttribute?.("data-focus") || "";
      const focusIndex = focusKey ? -1 : [...this.shadow.querySelectorAll(focusableSelector)].indexOf(currentActive);
      const disabled = state.sessionActive ? "disabled" : "";
      const row = (key, title, description, checked = settings[key]) => `<label class="row"><span class="row-copy"><strong>${this.e(title)}</strong><small>${this.e(description)}</small></span><input type="checkbox" role="switch" aria-label="${this.e(title)}" data-focus="setting:${key}" data-setting="${key}" ${checked ? "checked" : ""} ${key === "enabled" ? "" : disabled}><span class="switch-ui" aria-hidden="true"></span></label>`;
      const webRow = (key, titleKey, enabled, descriptionKey = "") => `<div class="player-row"><label class="row platform"><span class="row-copy"><strong>${this.e(titleKey)}</strong>${descriptionKey ? `<small>${this.e(descriptionKey)}</small>` : ""}</span><input type="checkbox" role="switch" aria-label="${this.e(titleKey)}" data-focus="web:${key}" data-web-platform="${key}" ${enabled ? "checked" : ""} ${disabled}><span class="switch-ui" aria-hidden="true"></span></label>${this.policyControls(key, settings, disabled)}</div>`;
      const customSites = settings.customSites.length ? settings.customSites.map((site) => `<div class="managed-row"><div class="player-row"><label class="row"><span class="row-copy"><strong>${this.escape(site.domain)}</strong><code>${this.escape(`// @match        https://${site.domain}/*`)}</code></span><input type="checkbox" role="switch" aria-label="${this.escape(site.domain)}" data-focus="site:${site.domain}" data-site-enabled="${this.escape(site.domain)}" ${site.enabled ? "checked" : ""} ${disabled}><span class="switch-ui" aria-hidden="true"></span></label>${this.policyControls(`custom:${site.domain}`, settings, disabled)}</div>${this.removeButton("site", site.domain, site.domain, "removeSite", "removeSiteAction", disabled)}</div>`).join("") : `<p class="empty">${this.e("emptySites")}</p>`;
      const windowsApps = settings.windowsApps.map((app) => this.windowAppRow(app, settings, disabled)).join("");
      const detectedApps = (state.apps || []).map((app) => this.detectedAppRow(app, settings, disabled)).join("") || `<p class="empty">${this.e("noSessions")}</p>`;
      const plexOrigins = settings.plexOrigins.length ? settings.plexOrigins.map((origin) => `<div class="managed-row"><span class="row-copy"><strong>${this.escape(origin)}</strong><small>${this.e("plexPermission")}</small><code>${this.escape(this.plexMatchLine(origin))}</code></span>${this.removeButton("plex-origin", origin, origin, "removeOrigin", "removeServer", disabled)}</div>`).join("") : `<p class="empty">${this.e("emptyPlexOrigins")}</p>`;
      const agentStatus = this.e(state.agent?.ok ? "agentConnected" : "agentDisconnected");
      const wantsWindows = Boolean(settings.spotifyDesktop || settings.windowsApps.some((app) => app.enabled));
      let installUrl = "";
      try {
        const candidate = new URL(root.AudioDuckAgent?.installUrl || "");
        if (candidate.protocol === "https:" && candidate.hostname === "github.com" && /\/releases\/download\/v\d+\.\d+\.\d+\/Audio-Ducking-Windows-Agent-\d+\.\d+\.\d+-x64\.msi$/.test(candidate.pathname)) installUrl = candidate.href;
      } catch (_) {}
      const showInstallAgent = wantsWindows && !root.AudioDuckAgent?.configured && Boolean(installUrl);

      this.shadow.innerHTML = `<style>
        :host{all:initial;color-scheme:dark;font:14px/1.5 Inter,"Segoe UI",system-ui,sans-serif;color:#e9eaf0}*,*:before,*:after{box-sizing:border-box}
        .backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:rgba(7,8,12,.72);backdrop-filter:blur(3px);pointer-events:auto}.backdrop.entering{animation:fade-in .16s ease-out}
        .panel{width:min(760px,calc(100vw - 28px));height:min(820px,calc(100dvh - 32px));max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border:1px solid #393a44;border-radius:16px;background:linear-gradient(145deg,#1b1c21,#15161a 72%);box-shadow:0 28px 90px #0009,0 2px 10px #0006;color:#e9eaf0;outline:none}.panel.entering{animation:lift-in .2s cubic-bezier(.2,.75,.25,1)}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 20px;border-bottom:1px solid #30313a;background:linear-gradient(110deg,#202027,#191a20)}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:38px;height:38px;display:grid;place-items:center;flex:none;border:1px solid #51476d;border-radius:11px;background:linear-gradient(145deg,#322b45,#211e2c);color:#c0adff}.brand-mark svg{width:20px;height:20px}.brand h1{margin:0;font-size:15px;line-height:1.2;font-weight:650;letter-spacing:-.02em}.version{margin-left:7px;color:#a9aab4;font-size:11px;font-weight:500}.brand p{margin:3px 0 0;color:#aaaab5;font-size:11px}.icon-button{width:32px;height:32px;display:inline-grid;place-items:center;padding:0;flex:none}.quiet,.icon-button{border:1px solid #3c3d47;border-radius:8px;background:#222329;color:#d4d5de;cursor:pointer;transition:background .14s,border-color .14s,color .14s}.quiet:hover,.icon-button:hover{background:#2d2e36;border-color:#62636e;color:#fff}.install-agent{text-decoration:none;display:inline-flex;align-items:center}.icon-button svg{width:15px;height:15px}
        main{overflow:auto;overscroll-behavior:contain;padding:12px 20px 18px;scrollbar-color:#454650 transparent;scrollbar-width:thin}.section{padding:13px 0 14px;border-bottom:1px solid #30313a}.section:first-child{padding-top:2px}.section:last-child{border-bottom:0}.section-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:#c8c9d2;font-size:11px;font-weight:650;letter-spacing:.045em;text-transform:uppercase}.section-title:before{width:3px;height:13px;border-radius:3px;background:#a38bf4;content:""}.row{position:relative;display:flex;align-items:center;gap:12px;min-height:42px;cursor:pointer}.row-copy{display:grid;gap:1px;flex:1;min-width:0}.row strong{font-size:12px;font-weight:550}.row small,.hint{color:#b1b2bc;font-size:10px}.row input[type=checkbox]{position:absolute;width:1px;height:1px;opacity:0}.switch-ui{position:relative;width:34px;height:19px;flex:none;border-radius:12px;background:#484951;transition:background .16s}.switch-ui:after{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#c2c3cc;content:"";transition:transform .16s,background .16s}.row input:checked+.switch-ui{background:#8069cf}.row input:checked+.switch-ui:after{transform:translateX(15px);background:#fff}.row input:disabled+.switch-ui{opacity:.45;cursor:not-allowed}
        :is(button,input,select,textarea,summary):focus-visible,.row input:focus-visible+.switch-ui{outline:2px solid #c1afff;outline-offset:3px}.master{justify-content:space-between;padding:9px 11px;border:1px solid #393a44;border-radius:10px;background:#202127}.master strong{font-size:13px}.segments{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border:1px solid #3a3b44;border-radius:9px;background:#15161a}.segment{min-height:34px;border:0;border-radius:7px;background:transparent;color:#c3c3cd;font:inherit;font-size:12px;cursor:pointer;transition:background .14s,color .14s}.segment[aria-pressed=true]{background:#302941;color:#f1ebff;box-shadow:inset 0 0 0 1px #66558a}.segment:disabled{opacity:.55;cursor:not-allowed}.volume{padding:11px 1px 1px}.volume-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;font-size:11px}.volume-head output,.policy-grid output,.advanced-fields output{color:#c8b9ff;font-variant-numeric:tabular-nums}.volume input,.policy-grid input[type=range],.advanced-fields input[type=range]{width:100%;accent-color:#a38bf4}.range-labels{display:flex;justify-content:space-between;color:#b1b2bc;font-size:10px}
        details{border-top:1px solid #292a32;padding:9px 0}summary{color:#d2d2db;font-size:11px;font-weight:550;cursor:pointer;list-style:none;user-select:none}summary::-webkit-details-marker{display:none}summary:before{display:inline-block;width:18px;color:#ad9cf2;content:"›";font-size:17px;line-height:10px;transition:transform .14s}details[open]>summary:before{transform:rotate(90deg)}summary:hover{color:#fff}.details-body{padding:7px 0 0 18px}.player-row{min-width:0;flex:1}.managed-row{display:flex;align-items:center;gap:9px}.managed-row+.managed-row{border-top:1px solid #292a32}.managed-row .row{flex:1;min-height:40px}.managed-row .row-copy{padding:6px 0}.managed-row code{display:block;margin-top:3px;overflow-wrap:anywhere;color:#b9a9fb;font-size:9px}.player-policy{padding:0 0 8px 12px;border-top:0}.player-policy summary{color:#a8a9b3;font-size:10px}.policy-grid{display:grid;grid-template-columns:minmax(110px,1fr) minmax(130px,1fr) auto;align-items:end;gap:10px;padding:6px 0}.policy-grid label,.advanced-fields label{display:grid;gap:5px;color:#c1c1ca;font-size:10px}.policy-grid select,.advanced-fields input:not([type=range]),.dialog input{width:100%;min-height:32px;padding:6px 9px;border:1px solid #41424d;border-radius:7px;background:#191a20;color:#edecf3;font:inherit;font-size:11px}.policy-grid input[type=checkbox]{accent-color:#a38bf4}.policy-grid label:has(input[type=checkbox]){display:flex;align-items:center;gap:6px;white-space:nowrap}.hint{color:#bcbcc5}.empty,.subhint,.agent-note{margin:7px 0;color:#b2b3be;font-size:10px;line-height:1.55}.subhint code{color:#c4b6ff}.section-actions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.quiet{padding:7px 9px;font:inherit;font-size:10px}.quiet:disabled{opacity:.5;cursor:not-allowed}.app-card{display:flex;align-items:center;gap:10px;padding:8px 9px;border:1px solid #353640;border-radius:9px;background:#1c1d23}.app-card+.app-card{margin-top:7px}.app-card .row-copy{flex:1;min-width:0}.app-card strong{display:block;font-size:11px;font-weight:550}.app-card small{display:block;overflow-wrap:anywhere;color:#b2b3be;font-size:9px}.agent-status{display:flex;align-items:center;gap:8px;margin:3px 0 4px;color:#dddde5;font-size:11px}.status-dot{width:7px;height:7px;border-radius:50%;background:${state.agent?.ok ? "#54ce91" : "#777983"}}.agent-note{padding:8px 10px;border:1px solid #30313a;border-radius:8px;background:#1a1b20}.lock-note{margin:2px 0 9px;padding:8px 10px;border:1px solid #665833;border-radius:8px;background:#302a1d;color:#f2dca4;font-size:11px}
        .advanced-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.advanced-fields label{margin:7px 0}.advanced-fields input[type=range]{padding:0}.field{display:grid;gap:6px;margin:8px 0;color:#c7c8d0;font-size:10px}.field textarea{min-height:58px;resize:vertical;padding:8px 9px;border:1px solid #41424d;border-radius:7px;background:#191a20;color:#edecf3;font:inherit;font-size:11px}.about-copy{color:#bfc0c9;font-size:11px}.about-link{display:inline-flex;margin-top:7px;color:#c5b5ff;text-decoration:none}.about-link:hover{text-decoration:underline}.dialog{width:min(430px,calc(100vw - 36px));max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #41424d;border-radius:12px;background:#1c1d23;color:#edecf3;padding:18px;box-shadow:0 18px 60px #0009}.dialog::backdrop{background:#05060aaa;backdrop-filter:blur(2px)}.dialog h2{margin:0 0 7px;font-size:14px}.dialog p{margin:0 0 14px;color:#b8b9c3;font-size:10px;line-height:1.5}.dialog form{display:grid;gap:10px}.dialog label{display:grid;gap:5px;color:#c9c9d2;font-size:11px}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.dialog-status{min-height:16px;color:#edc28c;font-size:10px}.footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 20px;border-top:1px solid #34353e;background:#191a20}.footer-left{display:flex;align-items:center;gap:12px;min-width:0}.language{display:flex;align-items:center;gap:7px;color:#bebfc9;font-size:10px}.language select{max-width:150px;min-height:30px;padding:4px 24px 4px 8px;border:1px solid #41424d;border-radius:7px;background:#202127;color:#eeeef4;font:inherit}.autosave{color:#b7b8c2;font-size:10px}.primary{min-height:33px;padding:6px 13px;border:1px solid #8f7cdb;border-radius:8px;background:#7964c7;color:#fff;font:inherit;font-size:11px;font-weight:600;cursor:pointer}.primary:hover{background:#8974d8}
        @keyframes fade-in{from{opacity:0}to{opacity:1}}@keyframes lift-in{from{opacity:.3;transform:translateY(9px) scale(.99)}to{opacity:1;transform:none}}@media(max-width:620px){.backdrop{padding:8px}.panel{width:calc(100vw - 16px);height:calc(100dvh - 16px);max-height:calc(100vh - 16px);border-radius:13px}.topbar{padding:13px 14px}.brand-mark{width:34px;height:34px}main{padding:10px 14px 14px}.footer{padding:9px 14px}.autosave{display:none}.policy-grid{grid-template-columns:1fr 1fr}.policy-grid label:has(input[type=checkbox]){grid-column:1/-1}.advanced-fields{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
        .panel{--type-scale:1;--panel-width:900px;--panel-height:900px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;width:min(var(--panel-width),calc(100vw - 32px));height:min(var(--panel-height),calc(100dvh - 32px));grid-template-columns:minmax(0,1fr);font-size:calc(14px * var(--type-scale))}
        .panel[data-size="compact"]{--panel-width:700px;--panel-height:780px;--type-scale:.96}
        .panel[data-size="normal"]{--panel-width:840px;--panel-height:860px;--type-scale:1}
        .panel[data-size="large"]{--panel-width:1120px;--panel-height:1080px;--type-scale:1.18}
        .topbar{padding:var(--space-4) var(--space-5);gap:var(--space-4)}.brand{gap:var(--space-3)}.brand-mark{width:40px;height:40px;border-radius:11px}
        .brand h1{font-size:calc(17px * var(--type-scale))}.version,.brand p{font-size:calc(12px * var(--type-scale))}
        main{padding:var(--space-4) var(--space-5) var(--space-5)}.section{padding:var(--space-4) 0}.section:first-child{padding-top:2px}
        .section-title{gap:var(--space-2);margin:0 0 var(--space-3);color:#d1d1da;font-size:calc(12px * var(--type-scale));letter-spacing:.06em}
        .row{gap:var(--space-3);min-height:48px}.row-copy{gap:3px}.row strong{font-size:calc(14px * var(--type-scale))}
        .row small,.hint,.range-labels{color:#bfc0ca;font-size:calc(12px * var(--type-scale))}
        .switch-ui{width:38px;height:22px}.switch-ui:after{top:3px;left:3px;width:16px;height:16px}
        .row input:checked+.switch-ui:after{transform:translateX(16px)}
        .icon-button{width:36px;height:36px}.icon-button svg{width:16px;height:16px}
        .segments{gap:4px;padding:4px}.segment{min-height:40px;font-size:calc(14px * var(--type-scale))}
        .volume{display:grid;gap:var(--space-2);padding:var(--space-4) 1px 1px}.volume-head{font-size:calc(13px * var(--type-scale))}
        details{padding:var(--space-2) 0;border-color:#30313a}summary{font-size:calc(13px * var(--type-scale))}
        .details-body{padding:var(--space-2) 0 0 var(--space-5)}.managed-row{gap:var(--space-2)}.managed-row .row{min-height:44px}
        .managed-row .row-copy{padding:7px 0}.managed-row code{font-size:calc(11px * var(--type-scale))}
        .player-policy{padding:0 0 10px 12px}.player-policy summary{font-size:calc(12px * var(--type-scale))}
        .policy-grid{display:grid;grid-template-columns:minmax(140px,.85fr) minmax(180px,1.15fr);align-items:start;gap:var(--space-3);padding:9px 0}
        .policy-grid label,.advanced-fields label{gap:6px;font-size:calc(12px * var(--type-scale))}
        .policy-grid select,.advanced-fields input:not([type=range]),.dialog input{min-height:40px;padding:7px 10px;font-size:calc(13px * var(--type-scale))}
        .policy-grid input[type=range]{grid-column:1/-1}.policy-effective{align-self:center;color:#bfc0ca;font-size:calc(12px * var(--type-scale))}
        .empty,.subhint,.agent-note{margin:9px 0;color:#c0c1cb;font-size:calc(12px * var(--type-scale))}
        .section-actions{gap:var(--space-2);margin:var(--space-3) 0}.quiet{min-height:36px;padding:7px 11px;font-size:calc(12px * var(--type-scale))}
        .app-card{gap:var(--space-3);padding:10px 11px}.app-card strong{font-size:calc(13px * var(--type-scale))}
        .app-card small{font-size:calc(11px * var(--type-scale))}.agent-status{gap:8px;margin:4px 0;font-size:calc(13px * var(--type-scale))}
        .status-dot{width:8px;height:8px;flex:none;background:#777983}.status-dot[data-ok="true"]{background:#54ce91}
        .agent-note{padding:9px 11px}.lock-note{padding:10px 12px;font-size:calc(12px * var(--type-scale))}
        .field{gap:8px;font-size:calc(12px * var(--type-scale))}.field textarea{min-height:64px;padding:9px 10px;font-size:calc(13px * var(--type-scale))}
        .about-copy{font-size:calc(13px * var(--type-scale))}
        .dialog{width:min(460px,calc(100vw - 36px));padding:20px}.dialog h2{font-size:calc(17px * var(--type-scale))}
        .dialog p{font-size:calc(12px * var(--type-scale))}.dialog label{font-size:calc(13px * var(--type-scale))}.dialog-status{font-size:calc(12px * var(--type-scale))}
        .windows-app-row{gap:10px;padding:8px 0}.windows-app-main,.windows-app-heading,.app-copy{min-width:0}.windows-app-main{flex:1}.windows-app-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px}.app-copy{display:grid;gap:3px}.app-copy strong{overflow:hidden;color:#f0eff6;font-size:calc(14px * var(--type-scale));font-weight:600;text-overflow:ellipsis;white-space:nowrap}.app-path{display:block;overflow:hidden;color:#bfc0ca;font-size:calc(12px * var(--type-scale));text-overflow:ellipsis;white-space:nowrap}.app-path:focus-visible{border-radius:3px;outline:2px solid #c1afff;outline-offset:2px}
        .app-controls{display:flex;align-items:center;gap:8px;flex:none}.app-switch{position:relative;display:grid;width:38px;height:40px;place-items:center;flex:none;cursor:pointer}.app-switch input{position:absolute;width:1px;height:1px;opacity:0}.app-switch input:checked+.switch-ui{background:#8069cf}.app-switch input:checked+.switch-ui:after{transform:translateX(16px);background:#fff}.app-switch input:focus-visible+.switch-ui{outline:2px solid #c1afff;outline-offset:3px}.remove-button{width:36px;height:36px}.remove-button svg{width:17px;height:17px}
        .footer{gap:var(--space-3);padding:11px 18px}.footer-left{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;min-width:0}.footer-left>*{min-width:0}
        .footer-field{display:grid;align-content:center;gap:4px;min-width:0;color:#d0d0d9;font-size:calc(12px * var(--type-scale))}
        .footer-field select{min-height:36px;max-width:160px;padding:5px 28px 5px 9px}
        .support-link{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 2px;color:#cdbdff;font-size:calc(12px * var(--type-scale));text-decoration:none;white-space:nowrap}
        .support-link svg{width:15px;height:15px;color:#b397ff}.support-link:hover{color:#fff;text-decoration:underline}
        .autosave{font-size:calc(11px * var(--type-scale))}.primary{min-height:38px;padding:7px 15px;font-size:calc(13px * var(--type-scale))}
        @media(max-width:620px){.panel{--space-4:14px;--space-5:14px;width:calc(100vw - 16px);height:calc(100dvh - 16px);max-height:calc(100vh - 16px)}.topbar{padding:var(--space-3) var(--space-4)}main{padding:var(--space-3) var(--space-4) var(--space-4)}.windows-app-row{gap:8px}.windows-app-heading{gap:8px}.footer{align-items:center;padding:10px var(--space-3)}.footer-left{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;flex:1}.footer-field{align-content:start;gap:4px}.footer-field select{width:100%;min-width:0;max-width:100%}.support-link{min-width:0;white-space:normal}.autosave{display:block;white-space:normal}.policy-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.advanced-fields{grid-template-columns:1fr}}
        @media(max-width:390px){.panel{--space-4:12px;--space-5:12px}.footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;grid-template-areas:"language size close" "support autosave autosave";gap:var(--space-2);padding:var(--space-2)}.footer-left{display:contents}.footer-left>.footer-field:first-child{grid-area:language}.footer-left>.footer-field:nth-child(2){grid-area:size}.footer-left>.support-link{grid-area:support;white-space:nowrap}.footer-left>.autosave{grid-area:autosave}.footer>.primary{grid-area:close;align-self:center;justify-self:end}.policy-grid{grid-template-columns:1fr}}
      </style><div class="backdrop${entrance}" data-backdrop><section class="panel${entrance}" data-focus="panel" data-size="${settings.modalSize}" lang="${settings.language}" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-tagline" tabindex="-1">
        <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></span><div><h1 id="settings-title">${this.e("brand")} <span class="version">2.7.4</span></h1><p id="settings-tagline">${this.e("tagline")}</p></div></div><button class="quiet icon-button" data-close aria-label="${this.e("close")}" title="${this.e("close")}" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <main>${state.sessionActive ? `<p class="lock-note" role="status">${this.e("activeLock")}</p>` : ""}
          <section class="section"><h2 class="section-title">${this.e("general")}</h2>${row("enabled", "enabled", "enabledHint")}<p class="section-title">${this.e("whenDictating")}</p><div class="segments" role="group" aria-label="${this.e("whenDictating")}"><button class="segment" data-focus="mode:pause" data-mode="pause" aria-pressed="${settings.mode === "pause"}" ${disabled}>${this.e("pause")}</button><button class="segment" data-focus="mode:duck" data-mode="duck" aria-pressed="${settings.mode === "duck"}" ${disabled}>${this.e("duck")}</button></div>${settings.mode === "duck" ? `<label class="volume"><span class="volume-head"><span>${this.e("targetVolume")}</span><output for="target-volume">${settings.targetVolumePercent}%</output></span><input id="target-volume" data-focus="setting:targetVolumePercent" aria-label="${this.e("targetVolume")}" type="range" min="0" max="100" step="1" data-setting="targetVolumePercent" value="${settings.targetVolumePercent}" ${disabled}><span class="range-labels"><span>${this.e("minimum")}</span><span>${this.e("maximum")}</span></span></label>` : ""}</section>
          <section class="section"><h2 class="section-title">${this.e("webIntegrations")}</h2>${row("webIntegration", "webPlayers", "webPlayersHint")}<details data-section="web" open><summary>${this.e("supportedSites")}</summary><div class="details-body">${webRow("youtube", "youtube", settings.webPlatforms.youtube)}${webRow("youtubeMusic", "youtubeMusic", settings.webPlatforms.youtubeMusic)}${webRow("spotifyWeb", "spotifyWeb", settings.webPlatforms.spotifyWeb)}${webRow("twitch", "twitch", settings.webPlatforms.twitch)}${webRow("plexWeb", "plexWeb", settings.webPlatforms.plexWeb)}
            <details data-section="plex-origins"><summary>${this.e("plexServers")}</summary><div class="details-body">${plexOrigins}<div class="section-actions"><button class="quiet" data-action="add-plex-origin" ${disabled}>${this.e("addPlexOrigin")}</button></div><details data-section="plex-help"><summary>${this.e("permissionDetails")}</summary><p class="subhint">${this.e("plexHostHelp")}</p></details></div></details>
            ${webRow("otherCompatible", "otherSites", settings.webPlatforms.otherCompatible)}<p class="subhint">${this.e("customShortHelp")}</p><details data-section="custom-help"><summary>${this.e("permissionDetails")}</summary><p class="subhint">${this.e("customPermissionHelp")}</p></details><div class="section-actions"><button class="quiet" data-action="add-site" ${disabled}>${this.e("addSite")}</button>${settings.customSites.length ? `<button class="quiet" data-agent-control data-action="prepare-sites" ${disabled} ${state.agent?.ok ? "" : "disabled"}>${this.e("authorizeSites")}</button>` : ""}</div>${customSites}
          </div></details></section>
          <section class="section"><h2 class="section-title">${this.e("windowsApps")}</h2><div class="managed-row"><div class="player-row">${row("spotifyDesktop", "spotifyDesktop", "windowsMedia")}${this.policyControls("spotifyDesktop", settings, disabled)}</div></div><details data-section="apps" open><summary>${this.e("windowsApps")}</summary><div class="details-body"><p class="agent-status" role="status"><span class="status-dot" data-status-dot data-ok="${Boolean(state.agent?.ok)}" aria-hidden="true"></span><span data-agent-status>${agentStatus}</span></p>${windowsApps || `<p class="empty">${this.e("noOtherApps")}</p>`}<div class="section-actions"><button class="quiet" data-agent-control data-action="add-app" ${disabled} ${state.agent?.ok ? "" : "disabled"}>${this.e("addApp")}</button><button class="quiet" data-agent-control data-action="refresh-apps" ${state.agent?.ok ? "" : "disabled"}>${this.e("refreshApps")}</button></div>${showInstallAgent ? `<p class="agent-note">${this.e("agentInstallHint")}</p><div class="section-actions"><a class="quiet install-agent" href="${this.escape(installUrl)}" target="_blank" rel="noopener noreferrer">${this.e("installWindowsAgent")}</a></div>` : ""}${state.agent?.ok ? `<label class="row"><span class="row-copy"><strong>${this.e("agentStartup")}</strong><small>${this.e("agentStartupHint")}</small></span><input type="checkbox" role="switch" data-agent-control data-agent-autostart ${state.agent.autostartEnabled ? "checked" : ""} ${state.sessionActive ? "disabled" : ""}><span class="switch-ui" aria-hidden="true"></span></label>` : ""}</div></details></section>
          <details class="section advanced" data-section="advanced"><summary>${this.e("advanced")}</summary><div class="details-body">${row("voiceMode", "voiceMode", "voiceModeHint")}<label class="field">${this.e("excludedDomains")}<textarea data-focus="setting:excludedDomains" data-setting="excludedDomains" placeholder="${this.e("excludedPlaceholder")}" ${disabled}>${this.escape(settings.excludedDomains)}</textarea></label><h2 class="section-title">${this.e("transitions")}</h2><p class="subhint">${this.e("transitionHint")}</p><div class="advanced-fields"><label>${this.e("fadeOut")}<input data-focus="setting:fadeOutMs" type="range" min="0" max="1000" step="25" data-setting="fadeOutMs" value="${settings.fadeOutMs}" ${disabled}><output data-fade-label="fadeOutMs">${settings.fadeOutMs} ms</output></label><label>${this.e("fadeIn")}<input data-focus="setting:fadeInMs" type="range" min="0" max="1500" step="25" data-setting="fadeInMs" value="${settings.fadeInMs}" ${disabled}><output data-fade-label="fadeInMs">${settings.fadeInMs} ms</output></label></div></div></details>
          <details class="section" data-section="about"><summary>${this.e("about")}</summary><div class="details-body"><p class="about-copy"><strong>Audio Ducking 2.7.5</strong> · ${this.e("aboutText")}</p><details data-section="technical-info"><summary>${this.e("technicalDetails")}</summary><p class="subhint">${this.e("agentOptional")}</p></details></div></details>
        </main><footer class="footer"><div class="footer-left"><label class="footer-field" for="settings-language">${this.e("language")}<select id="settings-language" data-focus="language" data-language aria-label="${this.e("language")}">${root.AudioDuckI18n.LANGUAGE_OPTIONS.map(({ code, labelKey }) => `<option value="${code}" ${settings.language === code ? "selected" : ""}>${this.e(labelKey)}</option>`).join("")}</select></label><label class="footer-field" for="settings-size">${this.e("modalSize")}<select id="settings-size" data-focus="modalSize" data-setting="modalSize" aria-label="${this.e("modalSize")}">${["auto", "compact", "normal", "large"].map((size) => `<option value="${size}" ${settings.modalSize === size ? "selected" : ""}>${this.e(`size${size[0].toUpperCase()}${size.slice(1)}`)}</option>`).join("")}</select></label><a class="support-link" href="https://ko-fi.com/fevee" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8.2-4.8-9.8-9.7C.8 7.5 3.1 4 7 4c2.1 0 3.8 1.1 5 2.8C13.2 5.1 14.9 4 17 4c3.9 0 6.2 3.5 4.8 7.3C20.2 16.2 12 21 12 21Z"/></svg>${this.e("support")}</a><span class="autosave">${this.e("savedAutomatically")}</span></div><button class="primary" data-close type="button">${this.e("close")}</button></footer>
        <dialog class="dialog" data-dialog="site" aria-labelledby="site-title"><h2 id="site-title">${this.e("dialogSiteTitle")}</h2><p>${this.e("dialogSiteDescription")}</p><form data-form="site"><label>${this.e("siteLabel")}<input name="site" placeholder="${this.e("sitePlaceholder")}" required autocomplete="url"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
        <dialog class="dialog" data-dialog="plex-origin" aria-labelledby="plex-title"><h2 id="plex-title">${this.e("dialogPlexTitle")}</h2><p>${this.e("dialogPlexDescription")}</p><form data-form="plex-origin"><label>${this.e("plexOriginLabel")}<input name="origin" placeholder="${this.e("plexOriginPlaceholder")}" required autocomplete="url"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
        <dialog class="dialog" data-dialog="app" aria-labelledby="app-title"><h2 id="app-title">${this.e("dialogAppTitle")}</h2><p>${this.e("appPathHelp")}</p><div class="detected"><p class="section-title">${this.e("detectedSessions")}</p>${detectedApps}</div><form data-form="app"><label>${this.e("path")}<input name="path" placeholder="${this.e("pathPlaceholder")}" autocomplete="off"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
      </section></div>`;
      for (const [key, open] of detailsState) { const item = this.shadow.querySelector(`details[data-section="${key}"]`); if (item) item.open = open; }
      const main = this.shadow.querySelector("main"); if (main) main.scrollTop = scrollTop;
      this.animateNextRender = false;
      const focusTarget = focusKey
        ? [...this.shadow.querySelectorAll("[data-focus]")].find((item) => item.getAttribute("data-focus") === focusKey)
        : focusIndex >= 0 ? this.shadow.querySelectorAll(focusableSelector)[focusIndex] : null;
      const focusableTarget = focusTarget && !focusTarget.matches?.(":disabled") && (!focusTarget.getClientRects || focusTarget.getClientRects().length) ? focusTarget : null;
      (focusableTarget || this.shadow.querySelector(".panel"))?.focus({ preventScroll: true });
    }

    compatibility(domain) { return ["youtube.com", "music.youtube.com", "open.spotify.com", "twitch.tv", "app.plex.tv"].includes(String(domain || "").toLowerCase()) ? "html5Control" : "customHtml5"; }

    policyControls(key, settings, disabled) {
      const domKey = encodeURIComponent(key), rule = settings.playerRules[key] || { mode: "general", targetVolumePercent: null, targetVolumeSource: "global" };
      const mode = ["general", "pause", "duck"].includes(rule.mode) ? rule.mode : "general";
      const effectiveMode = mode === "general" ? settings.mode : mode;
      const source = rule.targetVolumeSource === "custom" ? "custom" : "global";
      const target = source === "custom" && rule.targetVolumePercent != null ? rule.targetVolumePercent : settings.targetVolumePercent;
      const volumeControls = effectiveMode === "duck" ? `<label>${this.e("dictationVolume")}<select data-focus="rule-target-source:${this.escape(key)}" data-rule-target-source="${this.escape(key)}" ${disabled}><option value="global" ${source === "global" ? "selected" : ""}>${this.e("useGlobalTarget", { value: settings.targetVolumePercent })}</option><option value="custom" ${source === "custom" ? "selected" : ""}>${this.e("useCustomTarget")}</option></select></label>${source === "custom" ? `<label class="policy-custom-target">${this.e("customTarget")} <output data-rule-output="${this.escape(domKey)}">${target}%</output><input type="range" min="0" max="100" step="1" data-focus="rule-target:${this.escape(key)}" data-rule-target="${this.escape(key)}" value="${target}" aria-label="${this.e("customTarget")}" ${disabled}></label>` : `<p class="policy-effective">${this.e("effectiveGlobalTarget", { value: settings.targetVolumePercent })}</p>`}` : "";
      return `<details class="player-policy" data-section="policy-${this.escape(domKey)}"><summary>${this.e("behavior")}</summary><div class="policy-grid"><label>${this.e("mode")}<select data-focus="rule-mode:${this.escape(key)}" data-rule-mode="${this.escape(key)}" ${disabled}><option value="general" ${mode === "general" ? "selected" : ""}>${this.e("inherit")}</option><option value="pause" ${mode === "pause" ? "selected" : ""}>${this.e("pause")}</option><option value="duck" ${mode === "duck" ? "selected" : ""}>${this.e("duck")}</option></select></label>${volumeControls}</div></details>`;
    }

    plexMatchLine(origin) { try { const url = new URL(origin); return `// @match        ${url.protocol}//${url.hostname}/*`; } catch (_) { return ""; } }

    windowAppRow(app, settings, disabled) {
      const label = app.path ? app.path.split("\\").pop() : app.appUserModelIds?.[0] || this.t("windowsApps");
      const detail = app.path || app.appUserModelIds?.join(", ") || "";
      const key = root.AudioDuckCore.playerRuleKeyForWindowsApp(app), identity = app.path || app.appUserModelIds?.[0] || "";
      const detailLabel = app.path ? this.e("pathTooltip", { value: detail }) : this.e("appIdentifierTooltip", { value: detail });
      return `<div class="managed-row windows-app-row"><div class="windows-app-main"><div class="windows-app-heading"><span class="app-copy"><strong>${this.escape(label)}</strong>${detail ? `<span class="app-path" title="${this.escape(detail)}" aria-label="${detailLabel}" tabindex="0">${this.escape(detail)}</span>` : ""}</span><div class="app-controls"><label class="app-switch"><input type="checkbox" role="switch" data-focus="app:${this.escape(identity)}" aria-label="${this.e("appEnabled", { value: label })}" data-app-enabled="${this.escape(identity)}" ${app.enabled ? "checked" : ""} ${disabled}><span class="switch-ui" aria-hidden="true"></span></label>${this.removeButton("app", identity, label, "removeApp", "removeApplication", disabled)}</div></div>${key ? this.policyControls(key, settings, disabled) : ""}</div></div>`;
    }

    removeButton(kind, identity, label, ariaKey, titleKey, disabled) {
      const action = kind === "plex-origin" ? "remove-plex-origin" : `remove-${kind}`;
      return `<button class="quiet icon-button remove-button" data-action="${action}" data-remove-${kind}="${this.escape(identity)}" aria-label="${this.e(ariaKey, { value: label })}" title="${this.e(titleKey)}" type="button" ${disabled}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>`;
    }

    detectedAppRow(app, settings, disabled) {
      const selectedApp = settings.windowsApps.find((item) => (app.path && item.path.toLowerCase() === app.path.toLowerCase()) || (app.appUserModelId && item.appUserModelIds.includes(app.appUserModelId)));
      const selected = Boolean(selectedApp), needsIdentityUpdate = selected && ((app.path && !selectedApp.path) || (app.appUserModelId && !selectedApp.appUserModelIds.includes(app.appUserModelId)));
      const display = app.displayName || app.executable || app.appUserModelId || this.t("windowsApps");
      const status = String(app.mediaStatus || "").toLowerCase();
      const media = ({ playing: this.t("statusPlaying"), paused: this.t("statusPaused"), stopped: this.t("statusStopped"), closed: this.t("statusStopped") })[status] || (app.mediaStatus ? this.t("statusUnknown") : "");
      const capability = app.pauseAvailable ? this.t("capabilityPause") : app.volumeSessions ? this.t("capabilityVolume") : this.t("capabilityNone");
      const count = Number(app.volumeSessions) || 0;
      const description = [app.path, media, count ? `${count} ${this.t(count === 1 ? "audioSession" : "audioSessions")}` : "", capability].filter(Boolean).join(" · ");
      const action = selected ? "updateIdentity" : "add";
      return `<div class="app-card"><span class="row-copy"><strong>${this.escape(display)}</strong><small>${this.escape(description)}</small></span>${selected && !needsIdentityUpdate ? `<span class="hint">${this.e("added")}</span>` : `<button class="quiet" data-add-detected="${this.escape(app.path || "")}" data-app-id="${this.escape(app.appUserModelId || "")}" ${disabled}>${this.e(action)}</button>`}</div>`;
    }

    escape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

    async save(next) { await this.saveSettings(next); await this.render(); }

    async change(event) {
      const startup = event.target.closest?.("[data-agent-autostart]");
      if (startup) {
        const enabled = startup.checked;
        startup.disabled = true;
        try { await this.setAutostart(enabled); await this.refreshState(); }
        catch (error) { startup.checked = !enabled; startup.disabled = false; this.onError(error); }
        return;
      }
      const language = event.target.closest?.("[data-language]");
      if (language) { await this.save({ ...this.getSettings(), language: root.AudioDuckI18n.normalizeLanguage(language.value) }); return; }
      const modeRule = event.target.closest?.("[data-rule-mode]");
      if (modeRule) { const settings = this.getSettings(), key = modeRule.dataset.ruleMode; await this.save({ ...settings, playerRules: { ...settings.playerRules, [key]: { ...(settings.playerRules[key] || {}), mode: modeRule.value } } }); return; }
      const targetSource = event.target.closest?.("[data-rule-target-source]");
      if (targetSource) { const settings = this.getSettings(), key = targetSource.dataset.ruleTargetSource; await this.save({ ...settings, playerRules: { ...settings.playerRules, [key]: { ...(settings.playerRules[key] || {}), targetVolumeSource: targetSource.value } } }); return; }
      const targetRule = event.target.closest?.("[data-rule-target]");
      if (targetRule) { const settings = this.getSettings(), key = targetRule.dataset.ruleTarget; await this.save({ ...settings, playerRules: { ...settings.playerRules, [key]: { ...(settings.playerRules[key] || {}), targetVolumeSource: "custom", targetVolumePercent: Number(targetRule.value) } } }); return; }
      const input = event.target.closest?.("[data-setting]");
      if (input) {
        if (input.disabled && input.dataset.setting !== "enabled") return;
        const key = input.dataset.setting, value = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
        if (input.type === "range") { const out = this.shadow.querySelector(`[data-fade-label="${key}"]`) || this.shadow.querySelector(".volume output"); if (out) out.value = key.includes("fade") ? `${value} ms` : `${value}%`; if (event.type === "input") return; }
        await this.save({ ...this.getSettings(), [key]: value }); return;
      }
      const platform = event.target.closest?.("[data-web-platform]");
      if (platform) { const settings = this.getSettings(); await this.save({ ...settings, webPlatforms: { ...settings.webPlatforms, [platform.dataset.webPlatform]: platform.checked } }); return; }
      const site = event.target.closest?.("[data-site-enabled]");
      if (site) { const settings = this.getSettings(); await this.save({ ...settings, customSites: settings.customSites.map((item) => item.domain === site.dataset.siteEnabled ? { ...item, enabled: site.checked } : item) }); return; }
      const app = event.target.closest?.("[data-app-enabled]");
      if (app) { const settings = this.getSettings(); await this.save({ ...settings, windowsApps: settings.windowsApps.map((item) => (item.path || item.appUserModelIds[0]) === app.dataset.appEnabled ? { ...item, enabled: app.checked } : item) }); }
    }

    input(event) {
      const input = event.target.closest?.("input[type=range]"); if (!input) return;
      const playerKey = input.dataset.ruleTarget;
      if (playerKey) { const output = this.shadow.querySelector(`[data-rule-output="${encodeURIComponent(playerKey)}"]`); if (output) output.value = `${input.value}%`; return; }
      const key = input.dataset.setting, output = this.shadow.querySelector(`[data-fade-label="${key}"]`) || this.shadow.querySelector(".volume output");
      if (output) output.value = key?.includes("fade") ? `${input.value} ms` : `${input.value}%`;
    }

    async click(event) {
      if (event.target === this.shadow.querySelector("[data-backdrop]")) { this.close(); return; }
      if (event.target.closest?.("[data-close]")) { this.close(); return; }
      const mode = event.target.closest?.("[data-mode]");
      if (mode) { if (!mode.disabled) await this.save({ ...this.getSettings(), mode: mode.dataset.mode }); return; }
      const action = event.target.closest?.("[data-action]")?.dataset.action;
      if (action === "add-site" || action === "add-app" || action === "add-plex-origin") {
        if (action === "add-app") { this.lastState = await this.state(); await this.render(); }
        this.shadow.querySelector(`dialog[data-dialog="${action === "add-site" ? "site" : action === "add-plex-origin" ? "plex-origin" : "app"}"]`)?.showModal();
      }
      else if (action === "close-dialog") event.target.closest("dialog")?.close();
      else if (action === "remove-site") { const domain = event.target.closest("[data-remove-site]").dataset.removeSite, settings = this.getSettings(); await this.save({ ...settings, customSites: settings.customSites.filter((site) => site.domain !== domain) }); }
      else if (action === "remove-app") { const id = event.target.closest("[data-remove-app]").dataset.removeApp, settings = this.getSettings(); await this.save({ ...settings, windowsApps: settings.windowsApps.filter((app) => (app.path || app.appUserModelIds[0]) !== id) }); }
      else if (event.target.closest?.("[data-remove-plex-origin]")) { const origin = event.target.closest("[data-remove-plex-origin]").dataset.removePlexOrigin, settings = this.getSettings(); await this.save({ ...settings, plexOrigins: settings.plexOrigins.filter((item) => item !== origin) }); }
      else if (action === "refresh-apps") await this.refreshApps();
      else if (action === "prepare-sites") await this.prepareCustomSites();
      const addDetected = event.target.closest?.("[data-add-detected]");
      if (addDetected && !addDetected.disabled) {
        const settings = this.getSettings(), item = { path: addDetected.dataset.addDetected, enabled: true, appUserModelIds: addDetected.dataset.appId ? [addDetected.dataset.appId] : [] };
        this.shadow.querySelector("dialog[data-dialog=app]")?.close();
        const matches = (app) => (item.path && app.path.toLowerCase() === item.path.toLowerCase()) || (item.appUserModelIds.length && item.appUserModelIds.some((id) => app.appUserModelIds.includes(id)));
        if (settings.windowsApps.some(matches)) { const windowsApps = settings.windowsApps.map((app) => matches(app) ? { ...app, path: app.path || item.path, appUserModelIds: [...new Set([...app.appUserModelIds, ...item.appUserModelIds])] } : app); await this.save({ ...settings, windowsApps }); }
        else await this.save({ ...settings, windowsApps: [...settings.windowsApps, item] });
      }
    }

    keydown(event) {
      if (!this.host) return;
      const nested = this.shadow.querySelector("dialog[open]");
      if (event.key === "Escape" && !nested) { event.preventDefault(); event.stopPropagation(); this.close(); return; }
      event.stopPropagation();
      if (event.key !== "Tab" || nested) return;
      const items = [...this.shadow.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex]:not([tabindex=\"-1\"])")].filter((item) => !item.closest("[hidden]") && item.getClientRects().length);
      if (!items.length) { event.preventDefault(); this.shadow.querySelector(".panel")?.focus(); return; }
      const first = items[0], last = items.at(-1), active = this.shadow.activeElement;
      if (event.shiftKey && (active === first || active === this.shadow.querySelector(".panel"))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    async submit(event) {
      const form = event.target.closest?.("form[data-form]"); if (!form) return;
      event.preventDefault(); const status = form.querySelector(".dialog-status"), data = new FormData(form);
      if (form.dataset.form === "site") {
        const domain = root.AudioDuckCore.normalizeCustomDomain(data.get("site"));
        if (!domain) { status.textContent = this.t("siteInvalid"); return; }
        const settings = this.getSettings(); if (settings.customSites.some((item) => item.domain === domain)) { status.textContent = this.t("siteDuplicate"); return; }
        form.closest("dialog").close(); await this.save({ ...settings, webPlatforms: { ...settings.webPlatforms, otherCompatible: true }, customSites: [...settings.customSites, { domain, enabled: true }] });
      } else if (form.dataset.form === "plex-origin") {
        const origin = root.AudioDuckCore.normalizePlexOrigin(data.get("origin"));
        if (!origin) { status.textContent = this.t("plexInvalid"); return; }
        const settings = this.getSettings(); if (settings.plexOrigins.includes(origin)) { status.textContent = this.t("plexDuplicate"); return; }
        form.closest("dialog").close(); await this.save({ ...settings, plexOrigins: [...settings.plexOrigins, origin], webPlatforms: { ...settings.webPlatforms, plexWeb: true } });
      } else if (form.dataset.form === "app") {
        const path = String(data.get("path") || "").trim(); if (!path) { status.textContent = this.t("appPathRequired"); return; }
        status.textContent = this.t("checkingApp");
        try {
          const result = await this.validateAppPath(path);
          if (!result?.ok || !result.path) { status.textContent = this.t("appPathInvalid"); return; }
          form.closest("dialog").close(); const settings = this.getSettings();
          if (!settings.windowsApps.some((app) => app.path.toLowerCase() === result.path.toLowerCase())) await this.save({ ...settings, windowsApps: [...settings.windowsApps, { path: result.path, enabled: true, appUserModelIds: [] }] });
        } catch (_) { status.textContent = this.t("validationError"); }
      }
    }

    async refreshApps() { try { this.applyState(await this.getState(true), { updateApps: true }); } catch (error) { this.onError(error); } }

    async prepareCustomSites() {
      const settings = this.getSettings(), domains = settings.customSites.filter((site) => site.enabled && settings.webIntegration && settings.webPlatforms.otherCompatible).map((site) => site.domain);
      const popup = window.open("about:blank", "_blank");
      if (!popup) { this.onError(this.t("validationError")); return; }
      try { const result = await this.prepareSites(domains); if (!result?.ok || !result.url) throw new Error(result?.error || ""); popup.location.replace(result.url); }
      catch (error) { popup.close(); this.onError(error); }
    }

    dispose() { this.close({ restoreFocus: false }); }
  }

  root.AudioDuckSettingsPage = { SettingsPage };
})(globalThis);

(function (root) {
  "use strict";

  const core = root.AudioDuckCore;
  const { MediaController } = root.AudioDuckMedia;
  const MAX_HEARTBEAT_AGE = 150_000;
  const SESSION_MAX_AGE = 3 * 60 * 60 * 1000;
  const monotonicNow = () => window.performance?.now?.() ?? Date.now();
  const host = core.hostFor(location.href);
  const isSettingsPage = core.isSettingsPage(location.href);
  const isChatGPT = core.isChatGPT(location.href) && !isSettingsPage;
  let settings = core.normalizeSettings(GM_getValue("settings", core.DEFAULTS));
  let tabObject = null;
  let tabId = "";
  let chatState = { recognized: isChatGPT, active: false, kind: null };
  let agentState = { ok: false, error: "Conectando…" };
  let currentSession = null;
  let detector = null;
  let settingsPage = null;
  let mediaController = null;
  let mediaObserver = null;
  let mediaScanTimer = 0;
  let statusTimer = 0;
  let heartbeatTimer = 0;
  let staleCheckTimer = 0;
  let lastUrl = location.href;
  let agentStatusTimer = 0;
  let restoringPending = false;
  let lastRestoreTrace = null;
  let menuCommandId = null;
  let menuLanguage = "";
  const detectorSessions = new Map();
  let testRestoreTimer = 0;

  function randomId() {
    try { return crypto.randomUUID(); } catch (_) { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }

  function registerSettingsMenu() {
    if (typeof GM_registerMenuCommand !== "function" || menuLanguage === settings.language) return;
    if (menuCommandId !== null && typeof GM_unregisterMenuCommand === "function") GM_unregisterMenuCommand(menuCommandId);
    menuLanguage = settings.language;
    menuCommandId = GM_registerMenuCommand(root.AudioDuckI18n.translate(settings.language, "menuSettings"), () => {
      if (!settingsPage) initSettingsPage();
      else { settingsPage.open(); settingsPage.refreshApps().catch(addError); }
    });
  }

  function getSession() { return GM_getValue("session", null); }

  function pageKey() {
    try { const url = new URL(location.href); return `${url.origin}${url.pathname}`; }
    catch (_) { return host; }
  }

  function saveTabData(patch = {}) {
    if (!tabObject || !tabId) return;
    const prior = tabObject.audioDucking || {};
    tabObject.audioDucking = { ...prior, ...patch };
    GM_saveTab(tabObject);
  }

  function addError(error) {
    const message = String(error?.message || error || "Error desconocido").replace(/[\r\n]+/g, " ").slice(0, 220);
    const entry = `${host || "página"}: ${message}`;
    const errors = [...(Array.isArray(GM_getValue("errors", [])) ? GM_getValue("errors", []) : []), entry].slice(-12);
    GM_setValue("errors", errors);
    saveTabData({ error: message, lastSeen: Date.now() });
  }

  function currentStatus() {
    const media = mediaController?.status() || { playingCount: 0, touchedCount: 0, pausedCount: 0, duckedCount: 0 };
    return {
      tabId,
      host,
      isChatGPT,
      running: true,
      lastSeen: Date.now(),
      recognized: chatState.recognized,
      dictationActive: chatState.active,
      kind: chatState.kind,
      htmlMediaCount: document.querySelectorAll("audio,video").length,
      playingCount: media.playingCount,
      touchedCount: media.touchedCount,
      pausedCount: media.pausedCount,
      duckedCount: media.duckedCount,
      unchangedCount: media.unchangedCount,
      fallbackPausedCount: media.fallbackPausedCount,
      unsupportedCount: media.unsupportedCount,
      appliedVolumePercentRange: media.appliedVolumePercentRange,
      lastRestore: tabObject?.audioDucking?.lastRestore || null,
      error: ""
    };
  }

  function publishStatus() { saveTabData(currentStatus()); }

  function beginWebSession(state) {
    if (!mediaController) return Promise.resolve(null);
    const key = core.webPlayerKeyFor(location.href, settings);
    const playerSettings = core.resolvePlayerRule(settings, key);
    return mediaController.begin({ ...state, settings: { ...state.settings, ...playerSettings } });
  }

  function allTabStates() {
    return new Promise((resolve) => {
      GM_getTabs((tabs) => resolve(Object.values(tabs || {}).map((tab) => tab?.audioDucking).filter(Boolean)));
    });
  }

  function watchWebRestore(eventId, detectedAt) {
    const deadline = monotonicNow() + 350;
    const check = async () => {
      try {
        const restoredTabs = (await allTabStates()).filter((tab) => !tab.isChatGPT && tab.lastRestore?.eventId === eventId);
        if (restoredTabs.length) {
          lastRestoreTrace = {
            ...lastRestoreTrace,
            webEndToEndMs: monotonicNow() - detectedAt,
            webAcknowledgedTabs: restoredTabs.length
          };
        } else if (monotonicNow() < deadline) setTimeout(check, 20);
      } catch (error) { addError(error); }
    };
    setTimeout(check, 0);
  }

  function createMediaController(force = false) {
    if (mediaController || (!force && !core.shouldManageWeb(location.href, settings)) || isChatGPT) return;
    mediaController = new MediaController({
      getElements: () => [...document.querySelectorAll("audio,video")],
      locationHref: () => location.href,
      tabId,
      getSettings: () => settings,
      onChange: publishStatus,
      onError: addError,
      persist: (actions) => {
        if (actions.length) saveTabData({ pendingActions: actions, pendingPageKey: pageKey(), pendingAt: Date.now() });
      }
    });
    const listener = () => {
      if (!core.shouldManageWeb(location.href, settings)) return;
      const active = getSession();
      if (active?.phase === "active" && sessionFresh(active)) beginWebSession(active).catch(addError);
    };
    document.addEventListener("play", listener, true);
    mediaObserver = new MutationObserver(() => {
      listener();
      tryRestorePending().catch(addError);
    });
    const observe = () => {
      const target = document.documentElement || document;
      try { mediaObserver.observe(target, { subtree: true, childList: true }); } catch (_) {}
    };
    observe();
    mediaScanTimer = setInterval(() => { listener(); tryRestorePending().catch(addError); }, 1500);
  }

  async function reconcileMediaController() {
    if (isChatGPT) return;
    const eligible = core.shouldManageWeb(location.href, settings);
    const pending = tabObject?.audioDucking?.pendingActions?.length > 0;
    if (!mediaController && (eligible || pending)) createMediaController(Boolean(pending));
    if (!mediaController) return;

    const session = getSession();
    if (eligible && sessionFresh(session)) await beginWebSession(session);
    else if (mediaController.sessionId) await mediaController.restore(mediaController.sessionId);
    if (pending) await tryRestorePending();
    publishStatus();
  }

  function sessionFresh(session) {
    if (!session || session.phase !== "active") return false;
    const heartbeat = Number(session.heartbeatAt || session.startedAt || 0);
    return Date.now() - heartbeat <= MAX_HEARTBEAT_AGE && Date.now() - Number(session.startedAt || 0) <= SESSION_MAX_AGE;
  }

  async function restoreSavedActions(actions) {
    if (!mediaController || !Array.isArray(actions) || !actions.length || restoringPending) return [];
    const saved = tabObject?.audioDucking || {};
    if (saved.pendingPageKey && saved.pendingPageKey !== pageKey()) return [];
    restoringPending = true;
    try {
      return await mediaController.restorePending(actions);
    } finally { restoringPending = false; }
  }

  async function tryRestorePending() {
    const saved = tabObject?.audioDucking || {};
    const actions = saved.pendingActions;
    if (!actions?.length || Date.now() - Number(saved.pendingAt || 0) > 10 * 60 * 1000) return;
    const session = getSession();
    if (sessionFresh(session) && actions.some((action) => action.sessionId === session.id)) return;
    const restored = await restoreSavedActions(actions);
    if (restored.length || actions.every((action) => action.manualOverride)) {
      saveTabData({ pendingActions: [], pendingAt: 0, pendingPageKey: "" });
      publishStatus();
    }
  }

  async function applySessionState(state) {
    if (!state || isChatGPT) return;
    if (state.phase === "active" && sessionFresh(state)) {
      if (!core.shouldManageWeb(location.href, settings)) {
        if (mediaController?.sessionId) await mediaController.restore(mediaController.sessionId);
        publishStatus();
        return;
      }
      if (!mediaController) createMediaController();
      if (!mediaController) return;
      const saved = tabObject?.audioDucking || {};
      if (saved.pendingActions?.length && saved.pendingActions.some((action) => action.sessionId !== state.id)) {
        await tryRestorePending();
      }
      await beginWebSession(state);
      publishStatus();
    } else if (state.phase === "restore") {
      const startedAt = monotonicNow();
      let restoredCount = 0;
      let applied = false;
      const saved = tabObject?.audioDucking || {};
      if (!mediaController && saved.pendingActions?.length) createMediaController(true);
      if (mediaController && (state.force || !state.sessionId || mediaController.sessionId === state.sessionId)) {
        restoredCount += (await mediaController.restore(state.force ? null : state.sessionId || null)).length;
        applied = Boolean(mediaController.sessionId === null || state.force);
      }
      const pendingMatches = saved.pendingActions?.length && (state.force || saved.pendingActions.some((action) => action.sessionId === state.sessionId));
      if (pendingMatches) {
        restoredCount += (await restoreSavedActions(saved.pendingActions)).length;
        saveTabData({ pendingActions: [], pendingAt: 0, pendingPageKey: "" });
        applied = true;
      }
      if (applied) {
        saveTabData({ lastRestore: { sessionId: state.sessionId || "", eventId: state.eventId || null, durationMs: monotonicNow() - startedAt, restoredCount } });
      }
      publishStatus();
    }
  }

  async function nativeCommand(command, values = {}) {
    const startedAt = monotonicNow();
    try {
      const result = await root.AudioDuckAgent.request({ command, ...values }, command === "status" ? 600 : command === "heartbeat" ? 400 : 1800);
      const roundTripMs = monotonicNow() - startedAt;
      const lastControl = ["begin", "restore", "restore-all"].includes(command)
        ? { command, sessionId: values.sessionId || result.correlationId || "", roundTripMs, elapsedMs: result.durationMs ?? null }
        : agentState.lastControl;
      agentState = { ok: result.ok !== false, ...result, lastControl, error: result.error || "" };
      if (command === "restore" && lastRestoreTrace?.sessionId === values.sessionId) {
        lastRestoreTrace = { ...lastRestoreTrace, agentRoundTripMs: roundTripMs, agentElapsedMs: result.durationMs ?? null };
      }
      publishStatus();
      return result;
    } catch (error) {
      agentState = { ...agentState, ok: false, error: String(error?.message || error).slice(0, 180) };
      return null;
    }
  }

  async function startGlobalSession(kind = "dictation", test = false, detectorEventId = null, includeNative = false) {
    if (!settings.enabled) return null;
    const previous = getSession();
    if (sessionFresh(previous)) {
      if (!test && previous.test && previous.kind === "test") await restoreGlobal(previous.id, "recording-started");
      else {
        if (detectorEventId) detectorSessions.set(detectorEventId, previous.id);
        return previous;
      }
    }
    const now = Date.now();
    const session = {
      id: randomId(), phase: "active", kind, test, includeNative, ownerTabId: tabId,
      startedAt: now, heartbeatAt: now, settings: { ...settings }
    };
    currentSession = session;
    if (detectorEventId) detectorSessions.set(detectorEventId, session.id);
    GM_setValue("session", session);
    if (isChatGPT || includeNative) void nativeCommand("begin", { sessionId: session.id, settings });
    if (test) {
      clearTimeout(testRestoreTimer);
      testRestoreTimer = setTimeout(() => {
        const current = getSession();
        if (current?.id === session.id && current.phase === "active") restoreGlobal(session.id, "test-timeout");
      }, 15_000);
    }
    publishStatus();
    return session;
  }

  async function restoreGlobal(sessionId = null, reason = "manual", endEvent = null) {
    const current = getSession();
    const activeId = sessionId || (current?.phase === "active" ? current.id : null);
    const id = activeId || current?.sessionId || randomId();
    if (isChatGPT && detector?.current && reason !== "recording-started") {
      detectorSessions.delete(detector.current.id);
      detector.suppressCurrent();
      return;
    }
    const publishStarted = monotonicNow();
    const traceId = endEvent?.id || null;
    lastRestoreTrace = {
      sessionId: id,
      eventId: traceId,
      reason,
      stopConfirmationMs: endEvent?.confirmationMs ?? null,
      detectedToBroadcastMs: endEvent?.detectedAt != null ? publishStarted - endEvent.detectedAt : null,
      webEndToEndMs: null,
      webAcknowledgedTabs: 0,
      agentRoundTripMs: null,
      agentElapsedMs: null
    };
    const restoring = { id: randomId(), sessionId: id, eventId: traceId, phase: "restore", force: !activeId, reason, updatedAt: Date.now() };
    GM_setValue("session", restoring);
    lastRestoreTrace = { ...lastRestoreTrace, broadcastCallMs: monotonicNow() - publishStarted };
    if (isChatGPT && traceId && endEvent?.detectedAt != null) watchWebRestore(traceId, endEvent.detectedAt);
    currentSession = null;
    clearTimeout(testRestoreTimer);
    if (isChatGPT || current?.includeNative) {
      await nativeCommand(activeId ? "restore" : "restore-all", { sessionId: id, reason });
    }
    publishStatus();
  }

  async function saveSettings(next) {
    settings = core.normalizeSettings(next);
    GM_setValue("settings", settings);
    registerSettingsMenu();
    await renderSettingsPage();
    if (!settings.enabled) {
      detector?.finish("extension-disabled");
      const active = getSession();
      if (active?.phase === "active") await restoreGlobal(active.id, "extension-disabled");
    }
    if (settings.voiceMode === false && chatState.kind === "voice") detector?.finish("voice-mode-disabled");
    publishStatus();
  }

  function initChatGPT() {
    if (!isChatGPT || detector) return;
    detector = new root.AudioDuckChat.ChatGPTDetector({
      doc: document,
      win: window,
      getSettings: () => settings,
      onStart: (event) => {
        chatState = { recognized: true, active: true, kind: event.kind, source: event.source };
        startGlobalSession(event.kind, false, event.id).catch(addError);
        publishStatus();
      },
      onStop: (event) => {
        chatState = { recognized: true, active: false, kind: null };
        const sessionId = detectorSessions.get(event.id);
        detectorSessions.delete(event.id);
        restoreGlobal(sessionId || null, event.reason, event).catch(addError);
        publishStatus();
      },
      onState: (state) => {
        chatState = { ...state, recognized: true };
        publishStatus();
      },
      onError: addError
    }).start();

    nativeCommand("status").catch(addError);
    agentStatusTimer = setInterval(() => nativeCommand("status"), 5000);
  }

  async function renderSettingsPage() {
    if (settingsPage) await settingsPage.render();
  }

  function initSettingsPage() {
    let detectedApps = [];
    settingsPage = new root.AudioDuckSettingsPage.SettingsPage({
      doc: document,
      getSettings: () => settings,
      saveSettings,
      getState: async (refreshApps = false) => {
        if (root.AudioDuckAgent.configured) {
          try {
            const status = await root.AudioDuckAgent.request({ command: "status" }, 600);
            agentState = { ok: status.ok !== false, ...status, error: status.error || "" };
            if (refreshApps) {
              const result = await root.AudioDuckAgent.request({ command: "list-apps" });
              detectedApps = Array.isArray(result.apps) ? result.apps : [];
            }
          } catch (error) { agentState = { ok: false, error: String(error?.message || error).slice(0, 180) }; }
        } else agentState = { ok: false, error: "No instalado" };
        const active = getSession();
        return { sessionActive: sessionFresh(active), apps: detectedApps, agent: agentState };
      },
      prepareSites: (domains) => root.AudioDuckAgent.request({ command: "prepare-sites", domains }),
      validateAppPath: (path) => root.AudioDuckAgent.request({ command: "validate-app", path }),
      setAutostart: (enabled) => root.AudioDuckAgent.request({ command: "set-autostart", enabled }),
      onError: addError
    });
    settingsPage.open();
    settingsPage.refreshApps().catch(addError);
  }

  async function init() {
    const loadedTab = await new Promise((resolve) => {
      GM_getTab((value) => {
        const tab = value || {};
        if (!tab.audioDuckingId) tab.audioDuckingId = randomId();
        GM_saveTab(tab, () => resolve(tab));
      });
    });
    tabObject = loadedTab;
    tabId = tabObject.audioDuckingId;
    const saved = tabObject.audioDucking || {};

    if (isSettingsPage) initSettingsPage();
    else if (isChatGPT) initChatGPT();
    else createMediaController(Boolean(saved.pendingActions?.length));
    registerSettingsMenu();
    publishStatus();

    GM_addValueChangeListener("session", (_key, _oldValue, newValue) => {
      applySessionState(newValue).catch(addError);
      renderSettingsPage().catch(addError);
    });
    GM_addValueChangeListener("settings", (_key, _oldValue, newValue) => {
      settings = core.normalizeSettings(newValue);
      registerSettingsMenu();
      renderSettingsPage().catch(addError);
      if (!settings.enabled && isChatGPT) {
        detector?.finish("extension-disabled");
        const active = getSession();
        if (active?.phase === "active") restoreGlobal(active.id, "extension-disabled").catch(addError);
      }
      if (settings.voiceMode === false && isChatGPT && chatState.kind === "voice") detector?.finish("voice-mode-disabled");
      if (!isChatGPT) reconcileMediaController().catch(addError);
      publishStatus();
    });
    GM_addValueChangeListener("agentToken", () => {
      if (isChatGPT) nativeCommand("status");
      renderSettingsPage().catch(addError);
    });
    const current = getSession();
    if (current?.phase === "active" && !sessionFresh(current)) {
      restoreGlobal(current.id, "stale-session-recovery").catch(addError);
    } else if (current?.phase === "active") {
      await applySessionState(current);
      if (isChatGPT && current.ownerTabId === tabId) currentSession = current;
    } else if (saved.pendingActions?.length) tryRestorePending().catch(addError);

    heartbeatTimer = setInterval(() => {
      const session = getSession();
      if (!isChatGPT || session?.phase !== "active" || session.ownerTabId !== tabId) return;
      const updated = { ...session, heartbeatAt: Date.now() };
      GM_setValue("session", updated);
      nativeCommand("heartbeat", { sessionId: session.id }).catch(() => {});
    }, 10_000);
    staleCheckTimer = setInterval(() => {
      const session = getSession();
      if (session?.phase === "active" && !sessionFresh(session)) restoreGlobal(session.id, "session-heartbeat-expired").catch(addError);
    }, 15_000);
    statusTimer = setInterval(publishStatus, 2000);

    window.addEventListener("pagehide", () => {
      saveTabData({ running: false, lastSeen: Date.now(), pendingActions: mediaController?.snapshot() || saved.pendingActions || [] });
      detector?.dispose();
      settingsPage?.dispose();
    }, { once: true });
    window.addEventListener("popstate", checkUrl);
    window.addEventListener("hashchange", checkUrl);
    setInterval(checkUrl, 800);
  }

  function checkUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (core.isChatGPT(location.href) && core.isSettingsPage(location.href) !== isSettingsPage) { location.reload(); return; }
    if (isChatGPT && !core.isChatGPT(location.href)) detector?.finish("chatgpt-navigated-away");
    if (!isChatGPT) reconcileMediaController().catch(addError);
    saveTabData({ host: core.hostFor(location.href), lastSeen: Date.now() });
  }

  if (root.AudioDuckAgent?.isPairPage(location.href)) {
    root.AudioDuckAgent.completePairing(window, document).catch((error) => {
      root.AudioDuckAgent.setPairStatus(document, String(error?.message || error));
    });
  } else init().catch(addError);
})(globalThis);

