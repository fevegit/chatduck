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
