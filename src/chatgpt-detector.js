(function (root) {
  "use strict";

  const VOICE_ACTIVE = /(?:mute\s+microphone|unmute\s+microphone|end\s+(?:voice|call)|exit\s+voice|leave\s+voice|silenciar\s+micr[oó]fono|finalizar\s+voz|salir\s+de\s+voz|voice\s+conversation\s+active|modo\s+de\s+voz\s+activo)/i;
  const RECORDING_ACTIVE = /(?:stop|pause|finish|cancel|send|end|submit|done)\s+(?:(?:audio|voice)\s+)?(?:record(?:ing)?|dictat(?:e|ion|ing)?|voice\s+input)|(?:record(?:ing)?|dictat(?:ion|ing)?|voice\s+input)\s+(?:is\s+)?(?:active|started|recording)|(?:detener|finalizar|cancelar|parar|enviar|terminar)\s+(?:la\s+)?(?:grabaci[oó]n|dictado|entrada\s+de\s+voz)|(?:grabaci[oó]n|dictado)\s+(?:activa|iniciada|grabando)/i;
  const DICTATION_CONTROL = /(?:dictat(?:e|ion|ing)?|dictar|dictado|microphone|\bmic\b|record(?:ing)?\s+audio|grabar\s+audio|grabar\s+mensaje|micr[oó]fono|voice\s+input|entrada\s+de\s+voz)/i;
  // React briefly replaces ChatGPT's recording controls while the recorder is
  // still active. Require a stable inactive observation before restoring apps.
  const STOP_CONFIRMATION_MS = 250;

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
      this.on(this.doc, "click", (event) => this.detectNativeMicClick(event), true);
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

    detectNativeMicClick(event) {
      if (!event || !(Number(event.detail) > 0)) return;
      const origin = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
      const button = origin?.closest?.("button,[role='button']");
      if (!button) return;
      const label = this.buttonLabel(button);
      if (!DICTATION_CONTROL.test(label) || VOICE_ACTIVE.test(label) || this.isRecordingButton(button, label)) return;
      setTimeout(() => this.safeEvaluate("native-mic-click"), 0);
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
