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
