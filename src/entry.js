(function (root) {
  "use strict";

  const core = root.AudioDuckCore;
  const { MediaController } = root.AudioDuckMedia;
  const { TabAudioFallback } = root.AudioDuckTabAudio;
  const MAX_HEARTBEAT_AGE = 150_000;
  const SESSION_MAX_AGE = 3 * 60 * 60 * 1000;
  const monotonicNow = () => window.performance?.now?.() ?? Date.now();
  const host = core.hostFor(location.href);
  const isSettingsPage = core.isSettingsPage(location.href);
  const isChatGPT = core.isChatGPT(location.href) && !isSettingsPage;
  let settings = core.normalizeSettings(GM_getValue("settings", core.DEFAULTS));
  let tabObject = null;
  let tabId = "";
  let frameId = "";
  let chatState = { recognized: isChatGPT, active: false, kind: null };
  let agentState = { ok: false, error: "Conectando…" };
  let agentStatusUpdatedAt = 0;
  let lastAgentStatusRoundTripMs = null;
  let pendingNativeBegin = Promise.resolve();
  let currentSession = null;
  let detector = null;
  let settingsPage = null;
  let mediaController = null;
  let tabAudioFallback = null;
  let mediaObserver = null;
  let heartbeatTimer = 0;
  let staleCheckTimer = 0;
  let lastUrl = location.href;
  let agentStatusTimer = 0;
  let restoringPending = false;
  let lastRestoreTrace = null;
  let lastError = "";
  let menuCommandId = null;
  let menuLanguage = "";
  const detectorSessions = new Map();

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

  function frameState() { return tabObject?.audioDucking?.frames?.[frameId] || tabObject?.audioDucking || {}; }

  async function refreshTabObject() {
    return new Promise((resolve) => GM_getTab((latest) => { tabObject = latest || tabObject || {}; resolve(tabObject); }));
  }

  function webParentHosts() {
    if (window.top === window) return [];
    const frames = tabObject?.audioDucking?.frames || {};
    const topFrame = Object.values(frames).find((frame) => frame?.isTop && frame.running !== false);
    return topFrame?.host ? [topFrame.host] : null;
  }

  function shouldManageCurrentWeb() {
    const parents = webParentHosts();
    return parents !== null && core.shouldManageWeb(location.href, settings, parents);
  }

  function saveTabData(patch = {}) {
    if (!tabObject || !tabId) return;
    GM_getTab((latest) => {
      tabObject = latest || tabObject;
      const current = tabObject.audioDucking || {};
      const frame = { ...(current.frames?.[frameId] || {}), ...patch };
      tabObject.audioDucking = { ...current, ...patch, frames: { ...(current.frames || {}), [frameId]: frame } };
      GM_saveTab(tabObject);
    });
  }

  function addError(error) {
    const message = String(error?.message || error || "Error desconocido").replace(/[\r\n]+/g, " ").slice(0, 220);
    lastError = message;
    const entry = `${host || "página"}: ${message}`;
    const errors = [...(Array.isArray(GM_getValue("errors", [])) ? GM_getValue("errors", []) : []), entry].slice(-12);
    GM_setValue("errors", errors);
    saveTabData({ error: message, lastSeen: Date.now() });
  }

  function currentStatus() {
    const media = mediaController?.status() || { playingCount: 0, touchedCount: 0, pausedCount: 0, duckedCount: 0 };
    return {
      tabId: `${tabId}:${frameId}`,
      host,
      isTop: window.top === window,
      excluded: core.isExcluded(host, settings.excludedDomains),
      isChatGPT,
      running: true,
      lastSeen: Date.now(),
      recognized: chatState.recognized,
      dictationActive: chatState.active,
      kind: chatState.kind,
      htmlMediaCount: mediaController?.records?.size || 0,
      playingCount: media.playingCount,
      touchedCount: media.touchedCount,
      pausedCount: media.pausedCount,
      duckedCount: media.duckedCount,
      unchangedCount: media.unchangedCount,
      fallbackPausedCount: media.fallbackPausedCount,
      unsupportedCount: media.unsupportedCount,
      appliedVolumePercentRange: media.appliedVolumePercentRange,
      tabAudioFallback: tabAudioFallback?.status() || null,
      lastRestore: frameState().lastRestore || null,
      error: lastError
    };
  }

  function publishStatus() { saveTabData(currentStatus()); }

  function beginWebSession(state, pendingActions = []) {
    if (!mediaController) return Promise.resolve(null);
    const playerSettings = core.resolveWebsiteOverride(settings, location.href);
    if (!playerSettings.enabled) return mediaController.sessionId ? mediaController.restore(mediaController.sessionId) : Promise.resolve(null);
    return mediaController.begin({ ...state, settings: { ...state.settings, ...playerSettings } }, pendingActions);
  }

  function allTabStates() {
    return new Promise((resolve) => {
      GM_getTabs((tabs) => resolve(Object.values(tabs || {}).flatMap((tab) => {
        const state = tab?.audioDucking;
        return state?.frames ? Object.values(state.frames) : state ? [state] : [];
      })));
    });
  }

  async function diagnosticReport(requestId) {
    const session = getSession();
    const effective = core.resolveWebsiteOverride(settings, location.href);
    const elements = root.AudioDuckMedia.collectMediaElements(document);
    let iframeCount = 0, tabAudioState = null;
    try { iframeCount = document.querySelectorAll("iframe").length; } catch (_) {}
    try {
      if (typeof GM_audio !== "undefined" && GM_audio?.getState) {
        const audioState = tabAudioFallback?.getState ? await tabAudioFallback.getState() : await new Promise((resolve, reject) => GM_audio.getState((value) => value ? resolve(value) : reject(new Error("unavailable"))));
        tabAudioState = {
          available: true, isAudible: audioState.isAudible === true, isMuted: audioState.isMuted === true,
          muteReason: ["user", "capture", "extension"].includes(audioState.muteReason) ? audioState.muteReason : audioState.muteReason ? "other" : ""
        };
      }
    } catch (_) { tabAudioState = { available: false, isAudible: null, isMuted: null, muteReason: "" }; }
    const excluded = core.isExcluded(host, settings.excludedDomains) || (webParentHosts() || []).some((parent) => core.isExcluded(parent, settings.excludedDomains));
    const eligible = shouldManageCurrentWeb();
    const activeSession = sessionFresh(session);
    const players = mediaController?.diagnostics(elements) || elements.map((element) => ({
      id: null,
      mediaType: element.tagName?.toLowerCase() || "media",
      origin: (() => { try { return new URL(element.currentSrc || element.src || location.href).origin; } catch (_) { return ""; } })(),
      action: "detected",
      playing: !element.paused && !element.ended,
      paused: Boolean(element.paused),
      ended: Boolean(element.ended),
      readyState: Number(element.readyState) || 0,
      originalVolumePercent: null,
      targetVolumePercent: null,
      appliedVolumePercent: null,
      currentVolumePercent: Number.isFinite(Number(element.volume)) ? Math.round(Number(element.volume) * 100) : null,
      transitionState: "idle",
      manualOverride: false,
      fallbackUsed: false,
      reason: element.paused ? "not-playing" : "not-controlled"
    }));
    const playing = players.filter((player) => player.playing).length;
    const controlled = players.filter((player) => ["duck", "pause"].includes(player.action)).length;
    let status = "ready";
    if (excluded) status = "excluded";
    else if (!settings.enabled || !settings.webIntegration || !settings.universalWebControl || !eligible) status = "disabled-or-protected";
    else if (!activeSession) status = "waiting-for-dictation-session";
    else if (mediaController?.sessionId !== session.id) status = "session-not-received";
    else if (!players.length && tabAudioState?.isAudible) status = "audio-detected-not-controllable";
    else if (!players.length) status = "no-html-media-detected";
    else if (!playing) status = "no-playing-media";
    else if (!controlled) status = "media-not-controllable";
    else if (players.some((player) => player.action === "unsupported")) status = "partial-control";
    return {
      requestId,
      version: String(root.GM_info?.script?.version || "unknown").slice(0, 32),
      host,
      isTop: window.top === window,
      isChatGPT,
      registered: true,
      eligible,
      excluded,
      status,
      dictationActive: isChatGPT ? chatState.active : null,
      sessionActive: activeSession,
      sessionReceived: Boolean(activeSession && mediaController?.sessionId === session.id),
      globalMode: settings.mode,
      effectiveMode: effective.mode,
      targetVolumePercent: effective.targetVolumePercent,
      htmlMediaCount: elements.length,
      iframeCount,
      audioDetected: Boolean(playing || tabAudioState?.isAudible),
      playingCount: playing,
      controlledCount: controlled,
      players,
      fallbackToPause: settings.fallbackToPause,
      webAudioMuteFallback: settings.webAudioMuteFallback,
      fallbackDisabled: settings.mode === "duck" && !settings.fallbackToPause && !settings.webAudioMuteFallback,
      tabAudioState,
      tabAudioFallback: tabAudioFallback?.status() || null,
      lastRestore: frameState().lastRestore || null,
      error: lastError
    };
  }

  function requestDiagnostics() {
    const requestId = randomId();
    GM_setValue("diagnosticRequest", { id: requestId, requestedAt: Date.now() });
    return new Promise((resolve) => setTimeout(async () => {
      const frames = await allTabStates();
      resolve(frames.map((frame) => frame.diagnosticRequestId === requestId && frame.diagnosticReport
        ? frame.diagnosticReport
        : { host: frame.host || "", isChatGPT: Boolean(frame.isChatGPT), registered: Boolean(frame.running), status: "no-diagnostic-response", error: frame.error || "" }));
    }, 700));
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
    if (mediaController || (!force && !shouldManageCurrentWeb()) || isChatGPT) return;
    mediaController = new MediaController({
      getElements: () => root.AudioDuckMedia.collectMediaElements(document),
      locationHref: () => location.href,
      tabId,
      getSettings: () => settings,
      onChange: publishStatus,
      onError: addError,
      persist: (actions) => saveTabData({
        pendingActions: actions,
        pendingPageKey: actions.length ? pageKey() : "",
        pendingAt: actions.length ? Date.now() : 0
      })
    });
    let listenerScheduled = false;
    const listener = () => {
      if (!shouldManageCurrentWeb()) return;
      if (listenerScheduled) return;
      listenerScheduled = true;
      queueMicrotask(() => {
        listenerScheduled = false;
        const active = getSession();
        if (active?.phase === "active" && sessionFresh(active)) beginWebSession(active).catch(addError);
      });
    };
    const observedRoots = new WeakSet();
    const observeRoot = (target) => {
      if (!target || observedRoots.has(target)) return;
      observedRoots.add(target);
      target.addEventListener("play", listener, true);
      try { mediaObserver.observe(target, { subtree: true, childList: true }); } catch (_) {}
      const pending = target.nodeType === 1 ? [target] : [...(target.children || [])];
      while (pending.length) {
        const hostNode = pending.pop();
        if (hostNode.shadowRoot) observeRoot(hostNode.shadowRoot);
        for (let child = hostNode.lastElementChild; child; child = child.previousElementSibling) pending.push(child);
      }
    };
    mediaObserver = new MutationObserver((mutations) => {
      if (location.href !== lastUrl) checkUrl();
      const inspected = new WeakSet();
      let mediaAdded = false;
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (!node || node.nodeType !== 1 || inspected.has(node)) continue;
        const pending = [node];
        while (pending.length) {
          const candidate = pending.pop();
          if (inspected.has(candidate)) continue;
          inspected.add(candidate);
          if (candidate.matches?.("audio,video")) mediaAdded = true;
          if (candidate.shadowRoot) observeRoot(candidate.shadowRoot);
          for (let child = candidate.lastElementChild; child; child = child.previousElementSibling) pending.push(child);
        }
      }
      if (mediaAdded) listener();
    });
    observeRoot(document);
    if (root.AudioDuckMedia.collectMediaElements(document).some((element) => !element.paused && !element.ended)) listener();
  }

  async function reconcileMediaController() {
    if (isChatGPT) return;
    await refreshTabObject();
    const eligible = shouldManageCurrentWeb();
    const pendingActions = frameState().pendingActions || [];
    const pending = pendingActions.length > 0;
    if (!mediaController && (eligible || pending)) createMediaController(Boolean(pending));
    if (!mediaController) return;

    const session = getSession();
    if (eligible && sessionFresh(session)) {
      await beginWebSession(session, pendingActions.filter((action) => action.mode === "duck"));
      if (tabAudioFallback) await tabAudioFallback.begin(session.id);
    }
    else if (mediaController.sessionId) await mediaController.restore(mediaController.sessionId);
    if (tabAudioFallback?.sessionId && (!eligible || !sessionFresh(session) || !settings.webAudioMuteFallback))
      await tabAudioFallback.restore(tabAudioFallback.sessionId);
    if (pending && !(eligible && sessionFresh(session))) await tryRestorePending(pendingActions);
    publishStatus();
  }

  function sessionFresh(session) {
    if (!session || session.phase !== "active") return false;
    const heartbeat = Number(session.heartbeatAt || session.startedAt || 0);
    return Date.now() - heartbeat <= MAX_HEARTBEAT_AGE && Date.now() - Number(session.startedAt || 0) <= SESSION_MAX_AGE;
  }

  async function restoreSavedActions(actions) {
    if (!mediaController || !Array.isArray(actions) || !actions.length || restoringPending) return [];
    const saved = frameState();
    if (saved.pendingPageKey && saved.pendingPageKey !== pageKey()) return [];
    restoringPending = true;
    try {
      return await mediaController.restorePending(actions);
    } finally { restoringPending = false; }
  }

  async function tryRestorePending(actions = frameState().pendingActions) {
    const saved = frameState();
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
      await refreshTabObject();
      if (!shouldManageCurrentWeb()) {
        if (mediaController?.sessionId) await mediaController.restore(mediaController.sessionId);
        if (tabAudioFallback?.sessionId) await tabAudioFallback.restore(tabAudioFallback.sessionId);
        publishStatus();
        return;
      }
      if (!mediaController) createMediaController();
      if (!mediaController) return;
      const pendingActions = frameState().pendingActions || [];
      const staleActions = pendingActions.filter((action) => action.sessionId !== state.id && action.mode !== "duck");
      if (staleActions.length) await tryRestorePending(staleActions);
      await beginWebSession(state, pendingActions.filter((action) => action.mode === "duck"));
      if (tabAudioFallback) await tabAudioFallback.begin(state.id);
      publishStatus();
    } else if (state.phase === "restore") {
      const startedAt = monotonicNow();
      let restoredCount = 0;
      let applied = false;
      if (tabAudioFallback) await tabAudioFallback.restore(state.sessionId || null);
      const saved = frameState();
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
        const outcome = mediaController?.lastRestore || null;
        saveTabData({ lastRestore: {
          sessionId: state.sessionId || "", eventId: state.eventId || null, durationMs: monotonicNow() - startedAt,
          restoredCount, verified: outcome?.verified === true, errorCount: outcome?.errorCount || 0
        } });
      }
      publishStatus();
    }
  }

  async function nativeCommand(command, values = {}) {
    if (!root.AudioDuckAgent?.configured) return null;
    const startedAt = monotonicNow();
    try {
      const result = await root.AudioDuckAgent.request({ command, ...values }, command === "status" ? 600 : command === "heartbeat" ? 400 : 1800);
      const roundTripMs = monotonicNow() - startedAt;
      if (command === "status") {
        agentStatusUpdatedAt = monotonicNow();
        lastAgentStatusRoundTripMs = roundTripMs;
      }
      const lastControl = ["begin", "restore", "restore-all"].includes(command)
        ? { command, sessionId: values.sessionId || result.correlationId || "", roundTripMs, elapsedMs: result.durationMs ?? null, timing: result.timing || null, discordTiming: result.discordTiming || null }
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

  async function startGlobalSession(kind = "dictation", detectorEventId = null, includeNative = false, discordCtrlClick = false, clickToDetectionMs = null) {
    if (!settings.enabled) return null;
    const previous = getSession();
    if (sessionFresh(previous)) {
      if (detectorEventId) detectorSessions.set(detectorEventId, previous.id);
      return previous;
    }
    const now = Date.now();
    const session = {
      id: randomId(), phase: "active", kind, includeNative, ownerTabId: tabId, discordCtrlClick: discordCtrlClick === true,
      clickToDetectionMs: Number.isFinite(clickToDetectionMs) ? clickToDetectionMs : null,
      startedAt: now, heartbeatAt: now, settings: { ...settings }
    };
    currentSession = session;
    if (detectorEventId) detectorSessions.set(detectorEventId, session.id);
    GM_setValue("session", session);
    if (isChatGPT || includeNative) {
      const requested = { ...settings };
      const discordActivated = (requested.discordActivationMode !== "ctrl-click" || session.discordCtrlClick) && (requested.discordMuteDuringDictation || requested.discordDeafenDuringDictation);
      const cachedStatusFresh = agentState.ok && Array.isArray(agentState.capabilities) && monotonicNow() - agentStatusUpdatedAt < 10_000;
      const requestedStatusRoundTripMs = discordActivated && !cachedStatusFresh;
      if (requestedStatusRoundTripMs) lastAgentStatusRoundTripMs = null;
      const statusRequest = requestedStatusRoundTripMs ? nativeCommand("status") : Promise.resolve(agentState);
      pendingNativeBegin = statusRequest.then((status) => {
        if (getSession()?.id !== session.id || !sessionFresh(getSession())) return null;
        const discord = root.AudioDuckAgent.discordPreferences(requested, status, { discordCtrlClick: session.discordCtrlClick });
        if (discord.unsupported) {
          agentState = { ...agentState, ok: true, discordUnsupported: true };
          publishStatus();
        }
        return nativeCommand("begin", { sessionId: session.id, settings: { ...requested, discordMuteDuringDictation: discord.discordMuteDuringDictation, discordDeafenDuringDictation: discord.discordDeafenDuringDictation, discord: { enabled: false, mode: "mute" } } }).then((result) => {
          if (getSession()?.id === session.id && result) {
            const activationTiming = {
              clickToDetectionMs: session.clickToDetectionMs,
              statusRoundTripMs: requestedStatusRoundTripMs ? lastAgentStatusRoundTripMs : null,
              beginRoundTripMs: agentState.lastControl?.roundTripMs ?? null,
              beginAgentMs: agentState.lastControl?.elapsedMs ?? null,
              discord: result.discordTiming || null
            };
            agentState = { ...agentState, lastControl: { ...agentState.lastControl, activationTiming } };
            console.debug("[ChatDuck] Discord activation timings", activationTiming);
            publishStatus();
          }
          return result;
        });
      }).catch(() => null);
    }
    publishStatus();
    return session;
  }

  async function restoreGlobal(sessionId = null, reason = "manual", endEvent = null) {
    const current = getSession();
    if (sessionId && current?.phase === "active" && current.id !== sessionId) return;
    if (sessionId && current?.phase === "restore" && current.sessionId === sessionId) return;
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
    if (isChatGPT || current?.includeNative) {
    await pendingNativeBegin;
    await nativeCommand(activeId ? "restore" : "restore-all", { sessionId: id, reason });
    }
    publishStatus();
  }

  async function saveSettings(next) {
    settings = core.normalizeSettings(next);
    GM_setValue("settings", settings);
    registerSettingsMenu();
    await renderSettingsPage();
    if (!isChatGPT) await reconcileMediaController();
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
        startGlobalSession(event.kind, event.id, false, event.discordCtrlClick === true, event.clickToDetectionMs).catch(addError);
        publishStatus();
      },
      onStop: (event) => {
        chatState = { recognized: true, active: false, kind: null };
        const sessionId = detectorSessions.get(event.id);
        detectorSessions.delete(event.id);
        if (!sessionId) {
          console.warn("[ChatDuck] ignored unmatched dictation stop", { eventId: event.id, reason: event.reason });
          publishStatus();
          return;
        }
        restoreGlobal(sessionId, event.reason, event).catch(addError);
        publishStatus();
      },
      onState: (state) => {
        chatState = { ...state, recognized: true };
        publishStatus();
      },
      onError: addError
    }).start();

    if (isChatGPT) {
      nativeCommand("status").catch(addError);
      agentStatusTimer = setInterval(() => nativeCommand("status"), 5000);
    }
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
      getDiagnostics: requestDiagnostics,
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
    frameId = randomId();
    const saved = frameState();

    if (!isChatGPT && !isSettingsPage && window.top === window && typeof GM_audio !== "undefined") {
      tabAudioFallback = new TabAudioFallback({
        audio: GM_audio,
        enabled: () => settings.enabled && settings.webIntegration && settings.universalWebControl && settings.webAudioMuteFallback && shouldManageCurrentWeb(),
        hasMediaOrFrame: () => Boolean(document.querySelector("iframe") || root.AudioDuckMedia.collectMediaElements(document).length),
        getPending: () => tabObject?.audioDucking?.tabAudioPending || null,
        persist: (snapshot) => new Promise((resolve) => {
          GM_getTab((latest) => {
            const tab = latest || tabObject || {};
            const current = tab.audioDucking || {};
            tab.audioDucking = { ...current, tabAudioPending: snapshot };
            GM_saveTab(tab, () => { tabObject = tab; resolve(); });
          });
        }),
        onChange: publishStatus
      });
      document.addEventListener("play", () => {
        if (tabAudioFallback?.snapshot) tabAudioFallback.restore(tabAudioFallback.sessionId).catch(addError);
      }, true);
      const safetyObserver = new MutationObserver((mutations) => {
        if (!tabAudioFallback?.snapshot) return;
        const unsafeAddition = mutations.some(({ addedNodes }) => [...addedNodes].some((node) => node.nodeType === 1 &&
          (node.matches?.("iframe,audio,video") || node.querySelector?.("iframe,audio,video") || root.AudioDuckMedia.collectMediaElements(node).length)));
        if (unsafeAddition) tabAudioFallback.restore(tabAudioFallback.sessionId).catch(addError);
      });
      safetyObserver.observe(document, { childList: true, subtree: true });
    }

    if (isSettingsPage) initSettingsPage();
    else if (isChatGPT) initChatGPT();
    else createMediaController(Boolean(saved.pendingActions?.length));
    registerSettingsMenu();
    publishStatus();

    GM_addValueChangeListener("session", (_key, _oldValue, newValue) => {
      applySessionState(newValue).catch(addError);
      renderSettingsPage().catch(addError);
    });
    GM_addValueChangeListener("diagnosticRequest", (_key, _oldValue, request) => {
      if (!request?.id || Date.now() - Number(request.requestedAt || 0) > 5000) return;
      diagnosticReport(request.id).then((report) => saveTabData({ diagnosticRequestId: request.id, diagnosticReport: report })).catch(addError);
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
    } else {
      if (tabAudioFallback?.snapshot) await tabAudioFallback.restore();
      if (saved.pendingActions?.length) tryRestorePending().catch(addError);
    }

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

    window.addEventListener("pagehide", () => {
      saveTabData({ running: false, lastSeen: Date.now(), pendingActions: mediaController?.snapshot() || saved.pendingActions || [] });
      detector?.dispose();
      settingsPage?.dispose();
      tabAudioFallback?.dispose();
    }, { once: true });
    window.addEventListener("popstate", checkUrl);
    window.addEventListener("hashchange", checkUrl);
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
