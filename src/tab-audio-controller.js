(function (root) {
  "use strict";

  class TabAudioFallback {
    constructor({ audio, enabled, hasMediaOrFrame, getPending, persist, onChange = () => {} }) {
      this.audio = audio;
      this.enabled = enabled;
      this.hasMediaOrFrame = hasMediaOrFrame;
      this.getPending = getPending;
      this.persist = persist;
      this.onChange = onChange;
      this.sessionId = null;
      this.snapshot = getPending?.() || null;
      this.manualOverride = false;
      this.state = "idle";
      this.listener = (event) => this.onAudioState(event);
      this.listenerRegistered = false;
      this.checkTimer = 0;
    }

    status() { return { state: this.state, sessionId: this.sessionId || this.snapshot?.sessionId || null }; }

    async begin(sessionId) {
      if (!this.audio || !sessionId) { this.state = "unsupported"; this.onChange(); return false; }
      if (!this.enabled()) return this.restore(sessionId);
      if (this.snapshot && this.snapshot.sessionId !== sessionId) await this.restore(null);
      this.sessionId = sessionId;
      this.state = this.snapshot ? "muted-tab-web-audio" : "watching";
      await this.registerListener();
      await this.checkAndMute();
      this.onChange();
      return true;
    }

    async registerListener() {
      if (this.listenerRegistered || typeof this.audio.addStateChangeListener !== "function") return;
      try {
        const result = this.audio.addStateChangeListener(this.listener);
        if (result?.then) await result;
        this.listenerRegistered = true;
      } catch (_) { this.state = "unsupported"; }
    }

    onAudioState(event) {
      if (this.snapshot && (event?.muted === false || (typeof event?.muted === "string" && event.muted !== "extension"))) {
        this.manualOverride = true;
        this.state = "manual-change";
      }
      if (this.sessionId && event?.audible === true) {
        clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => this.checkAndMute().catch(() => {}), 120);
      }
      this.onChange();
    }

    async getState() {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (value) => { if (settled) return; settled = true; value ? resolve(value) : reject(new Error("El estado de audio de la pestaña no está disponible")); };
        try {
          const result = this.audio.getState(done);
          if (result?.then) result.then(done, reject);
        } catch (error) { reject(error); }
      });
    }

    async setMuted(isMuted) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (error) => { if (settled) return; settled = true; error ? reject(new Error(String(error))) : resolve(); };
        try {
          const result = this.audio.setMute({ isMuted }, done);
          if (result?.then) result.then(() => done(), done);
        } catch (error) { reject(error); }
      });
    }

    async checkAndMute() {
      if (!this.sessionId || !this.enabled() || this.manualOverride || this.snapshot) return false;
      let state;
      try { state = await this.getState(); }
      catch (_) { this.state = "unsupported"; this.onChange(); return false; }
      if (state.isMuted !== false || state.isAudible !== true || this.hasMediaOrFrame()) return false;
      const snapshot = { sessionId: this.sessionId, originalMuted: false, appliedMuted: true, startedAt: Date.now() };
      await this.persist(snapshot);
      this.snapshot = snapshot;
      try {
        await this.setMuted(true);
        const after = await this.getState();
        if (after.isMuted !== true) throw new Error("Tampermonkey no confirmó el silencio de la pestaña");
        this.state = "muted-tab-web-audio";
        this.onChange();
        return true;
      } catch (error) {
        this.state = "error";
        this.onChange();
        throw error;
      }
    }

    async restore(sessionId = null) {
      clearTimeout(this.checkTimer);
      const snapshot = this.snapshot || this.getPending?.() || null;
      if (snapshot && sessionId && snapshot.sessionId !== sessionId) return false;
      let restored = true;
      if (snapshot && !this.manualOverride) {
        try {
          const state = await this.getState();
          if (state.isMuted === true && state.muteReason !== "user" && state.muteReason !== "capture") {
            await this.setMuted(false);
            const after = await this.getState();
            restored = after.isMuted === false;
          }
        } catch (_) { restored = false; }
      }
      if (!restored) { this.state = "restore-pending"; this.onChange(); return false; }
      if (snapshot) await this.persist(null);
      this.snapshot = null;
      this.sessionId = null;
      this.manualOverride = false;
      this.state = "idle";
      if (this.listenerRegistered && typeof this.audio.removeStateChangeListener === "function") {
        try { await this.audio.removeStateChangeListener(this.listener); } catch (_) {}
      }
      this.listenerRegistered = false;
      this.onChange();
      return true;
    }

    dispose() {
      clearTimeout(this.checkTimer);
      if (this.listenerRegistered && typeof this.audio?.removeStateChangeListener === "function") {
        try { this.audio.removeStateChangeListener(this.listener); } catch (_) {}
      }
      this.listenerRegistered = false;
    }
  }

  const api = { TabAudioFallback };
  root.AudioDuckTabAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
