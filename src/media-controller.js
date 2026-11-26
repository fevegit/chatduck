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

  function collectMediaElements(rootDocument) {
    const result = new Set(), visited = new Set();
    const visit = (rootNode) => {
      if (!rootNode || visited.has(rootNode)) return;
      visited.add(rootNode);
      const pending = rootNode.nodeType === 1 ? [rootNode] : [...(rootNode.children || [])];
      while (pending.length) {
        const element = pending.pop();
        if (element.matches?.("audio,video")) result.add(element);
        if (element.shadowRoot) visit(element.shadowRoot);
        for (let child = element.lastElementChild; child; child = child.previousElementSibling) pending.push(child);
      }
    };
    visit(rootDocument);
    return [...result];
  }

  async function fingerprint(pageHref, mediaSrc) {
    const value = mediaFingerprint(pageHref, mediaSrc);
    if (!value || !root.crypto?.subtle) return "";
    const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  class MediaController {
    constructor({ getElements, locationHref, tabId, getSettings, onChange = () => {}, onError = () => {}, persist = () => {}, trace = () => {} }) {
      this.getElements = getElements;
      this.locationHref = locationHref;
      this.tabId = tabId;
      this.getSettings = getSettings;
      this.onChange = onChange;
      this.onError = onError;
      this.persist = persist;
      this.trace = trace;
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
      this.trace("volume-write-attempt", record, { writer: player ? "youtube-player-api" : "html-media-element", requested: volume, before: this.readVolume(record.element) });
      try {
        if (player) player.setVolume(Math.round(volume * 100));
        else record.element.volume = volume;
        const actual = this.readVolume(record.element);
        if (!Number.isFinite(actual) || Math.abs(actual - volume) > (player ? 0.011 : 0.001)) throw new Error("el reproductor no aceptó el volumen solicitado");
        record.appliedVolume = actual;
        record.attenuated = actual < record.originalVolume - 0.00001;
        record.error = "";
        this.trace("volume-write", record, { writer: player ? "youtube-player-api" : "html-media-element", requested: volume, actual });
        return actual;
      } finally { record.applyingVolume = false; }
    }

    cancelTransition(record) {
      if (record.fadeTimer) this.trace("transition-cancel", record, { transitionId: record.transitionId, state: record.transitionState });
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
      this.trace("transition-start", record, { transitionId, from: start, target, durationMs: duration });
      const writeThreshold = this.youtubePlayer(record.element) ? 0.0051 : 0.0005;
      if (duration === 0) {
        try { if (Math.abs(start - target) >= 0.000001) this.writeVolume(record, target); return Promise.resolve(true); }
        catch (error) { return Promise.reject(error); }
      }
      if (Math.abs(start - target) < writeThreshold) return Promise.resolve(true);
      const now = () => globalThis.performance?.now?.() ?? Date.now();
      const startedAt = now();
      let lastPersist = 0;
      return new Promise((resolve, reject) => {
        record.fadeResolve = resolve;
        let timerId = 0;
        const ownsTimer = () => record.transitionId === transitionId && record.fadeTimer === timerId;
        const finish = (completed) => {
          clearInterval(timerId);
          if (!ownsTimer()) { resolve(false); return; }
          this.trace("transition-finish", record, { transitionId, completed });
          record.fadeTimer = 0;
          record.fadeResolve = null;
          if (completed) this.changed();
          resolve(completed);
        };
        timerId = setInterval(() => {
          if (record.transitionId !== transitionId) { finish(false); return; }
          const progress = Math.min(1, Math.max(0, (now() - startedAt) / duration));
          const value = start + (target - start) * progress;
          const next = progress === 1 ? target : value;
          try {
            if (progress === 1 || Math.abs(next - record.appliedVolume) >= writeThreshold) this.writeVolume(record, next);
          } catch (error) {
            clearInterval(timerId);
            if (ownsTimer()) { record.fadeTimer = 0; record.fadeResolve = null; }
            reject(error);
            return;
          }
          if (now() - lastPersist >= 64) { lastPersist = now(); this.changed(); }
          if (progress === 1) finish(true);
        }, 16);
        record.fadeTimer = timerId;
      });
    }

    activeElements() {
      return [...this.getElements()].filter((element) => element && !element.paused && !element.ended);
    }

    async begin(session, pendingActions = []) {
      const sessionId = session.id || session.sessionId;
      if (!sessionId) return this.status();
      const newSession = this.sessionId && this.sessionId !== sessionId;
      if (newSession) {
        this.generation++;
        this.restoring = false;
        for (const record of this.records.values()) this.cancelTransition(record);
      }
      this.sessionId = sessionId;
      this.trace("controller-begin", null, { sessionId, newSession, pendingCount: pendingActions.length, recordCount: this.records.size });
      const generation = ++this.generation;
      const settings = session.settings || this.getSettings();
      const duckJobs = [];
      const pauseJobs = [];
      const pendingByElement = new Map();
      const available = new Set(this.getElements());
      for (const action of Array.isArray(pendingActions) ? pendingActions : []) {
        if (action?.mode !== "duck" || action.manualOverride || !action.sourceFingerprint ||
            !Number.isFinite(action.originalVolume) || action.originalVolume < 0 || action.originalVolume > 1 ||
            !Number.isFinite(action.appliedVolume) || action.appliedVolume < 0 || action.appliedVolume > 1) continue;
        for (const element of available) {
          if ((element.tagName?.toLowerCase() || "media") !== action.mediaType) continue;
          const pageHref = this.locationHref();
          const source = element.currentSrc || element.src || "";
          const mediaId = mediaFingerprint(pageHref, source);
          let matches = action.sourceFingerprint === mediaId;
          if (!matches) {
            try { matches = await fingerprint(pageHref, source) === action.sourceFingerprint; }
            catch (_) { matches = false; }
          }
          if (!matches) continue;
          try {
            const current = this.readVolume(element);
            const tolerance = this.youtubePlayer(element) ? 0.012 : 0.00001;
            if (Number.isFinite(current) && Math.abs(current - action.appliedVolume) < tolerance) {
              pendingByElement.set(element, action);
              break;
            }
          } catch (_) { /* Ignore a pending record for a media element that is no longer readable. */ }
        }
      }

      const candidates = new Set(this.activeElements());
      for (const element of pendingByElement.keys()) candidates.add(element);
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
        const pending = pendingByElement.get(element);
        const currentVolume = this.readVolume(element);
        const record = {
          id: `${this.tabId}:${this.nextId++}`,
          element,
          mediaType: element.tagName?.toLowerCase() || "media",
          pageHrefAtPause: pageHref,
          sourceFingerprint,
          sourceAtPause: source,
          mediaIdentity: mediaFingerprint(pageHref, source),
          mode: settings.mode,
          wasPlaying: !element.paused && !element.ended,
          originalVolume: pending ? pending.originalVolume : currentVolume,
          appliedVolume: pending ? currentVolume : null,
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
          error: "",
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
      const listener = (event) => {
        this.trace("media-event", record, { name, volume: this.readVolume(record.element), muted: Boolean(record.element.muted), paused: Boolean(record.element.paused), applyingVolume: Boolean(record.applyingVolume) });
        handler(event);
      };
      record.element.addEventListener(name, listener);
      record.listeners.push([name, listener]);
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
        const completed = await this.transition(record, target, durationMs);
        if (completed && record.mode === "duck") record.transitionState = "ducked";
      } catch (error) {
        record.appliedVolume = null;
        record.error = String(error?.message || error).slice(0, 180);
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
        playingCount: [...this.records.values()].filter((record) => !record.element.paused && !record.element.ended).length,
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
        errors: [...this.records.values()].filter((record) => record.error).map((record) => ({ id: record.id, message: record.error }))
      };
    }

    diagnostics(elements = null) {
      const candidates = elements ? [...new Set(elements)] : [...this.records.values()].map((record) => record.element);
      return candidates.map((element) => {
        const record = this.elements.get(element) || null;
        let origin = "";
        try { origin = new URL(element.currentSrc || element.src || this.locationHref()).origin; } catch (_) {}
        let currentVolumePercent = null;
        try {
          const volume = this.readVolume(element);
          if (Number.isFinite(volume)) currentVolumePercent = Math.round(volume * 100);
        } catch (_) {}
        return {
          id: record?.id || null,
          mediaType: element.tagName?.toLowerCase() || "media",
          origin,
          action: !record ? "detected" : record.unsupported ? "unsupported" : record.mode === "pause" ? "pause" : record.attenuated ? "duck" : "unchanged",
          playing: !element.paused && !element.ended,
          paused: Boolean(element.paused),
          ended: Boolean(element.ended),
          readyState: Number(element.readyState) || 0,
          originalVolumePercent: Number.isFinite(record?.originalVolume) ? Math.round(record.originalVolume * 100) : null,
          targetVolumePercent: Number.isFinite(record?.targetVolumePercent) ? Math.round(record.targetVolumePercent) : null,
          appliedVolumePercent: Number.isFinite(record?.appliedVolume) ? Math.round(record.appliedVolume * 100) : null,
          currentVolumePercent,
          transitionState: record?.transitionState || "idle",
          manualOverride: Boolean(record?.manualOverride),
          fallbackUsed: Boolean(record?.fallbackUsed),
          reason: record?.error || (record?.unsupported ? "volume-control-rejected" : !record ? (element.paused ? "not-playing" : "not-controlled") : "")
        };
      });
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
        // A live controller owns this element and will reconcile its current
        // transition. Restoring a saved snapshot here would briefly expose the
        // original volume before the next session ducks it again.
        if (this.elements.has(element)) continue;
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
      const records = [...this.records.values()];
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
        let manualPreservedCount = 0;
        let errorCount = 0;
        for (const record of records) {
          let verified = false;
          if (record.manualOverride || record.element.ended) {
            verified = true;
            if (record.manualOverride) manualPreservedCount++;
          } else {
            try {
              const current = this.readVolume(record.element);
              const tolerance = this.youtubePlayer(record.element) ? 0.012 : 0.00001;
              const volumeRestored = Number.isFinite(current) && Number.isFinite(record.originalVolume) && Math.abs(current - record.originalVolume) <= tolerance;
              const playbackRestored = record.mode !== "pause" || !record.wasPlaying || !record.ownsPause || !record.element.paused;
              verified = volumeRestored && playbackRestored;
            } catch (_) { verified = false; }
          }
          if (!verified) errorCount++;
        }
        this.lastRestore = {
          totalCount: records.length,
          restoredCount: restored.length,
          manualPreservedCount,
          errorCount,
          verified: records.length > 0 && errorCount === 0
        };
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

  const api = { MediaController, mediaFingerprint, fingerprint, collectMediaElements };
  root.AudioDuckMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
