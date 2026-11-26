(function (root) {
  "use strict";

  const version = root.AudioDuckVersion || "2.8.0-alpha.1";

  class SettingsPage {
    constructor({ doc, getSettings, saveSettings, getState, getDiagnostics = async () => [], prepareSites, validateAppPath, setAutostart, onError = () => {} }) {
      Object.assign(this, { doc, getSettings, saveSettings, getState, getDiagnostics, prepareSites, validateAppPath, setAutostart, onError });
      this.host = null; this.shadow = null; this.renderId = 0; this.renderQueued = false; this.opened = false; this.previousFocus = null; this.pollTimer = 0; this.lastState = null; this.activePage = "general"; this.diagnosticState = null;
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
    normalizeDiagnostics(frames) {
      const percent = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
      return (Array.isArray(frames) ? frames : []).map((frame) => ({
        host: String(frame.host || "").slice(0, 253), status: String(frame.status || "unknown").slice(0, 80),
        registered: frame.registered === true, eligible: frame.eligible === true, excluded: frame.excluded === true,
        isChatGPT: frame.isChatGPT === true, isTop: frame.isTop === true, version: String(frame.version || "unknown").slice(0, 32),
        dictationActive: typeof frame.dictationActive === "boolean" ? frame.dictationActive : null, sessionActive: frame.sessionActive === true,
        sessionReceived: frame.sessionReceived === true, globalMode: String(frame.globalMode || "unknown"),
        effectiveMode: String(frame.effectiveMode || "unknown"), targetVolumePercent: percent(frame.targetVolumePercent),
        htmlMediaCount: Number(frame.htmlMediaCount) || 0, iframeCount: Number(frame.iframeCount) || 0,
        audioDetected: frame.audioDetected === true, fallbackDisabled: frame.fallbackDisabled === true,
        tabAudioState: frame.tabAudioState && typeof frame.tabAudioState === "object" ? {
          available: frame.tabAudioState.available === true,
          isAudible: frame.tabAudioState.isAudible === true,
          isMuted: frame.tabAudioState.isMuted === true,
          muteReason: ["user", "capture", "extension", "other"].includes(frame.tabAudioState.muteReason) ? frame.tabAudioState.muteReason : ""
        } : null,
        playingCount: Number(frame.playingCount) || 0,
        controlledCount: Number(frame.controlledCount) || 0, fallbackToPause: frame.fallbackToPause === true,
        webAudioMuteFallback: frame.webAudioMuteFallback === true,
        lastRestore: frame.lastRestore && typeof frame.lastRestore === "object" ? {
          restoredCount: Number(frame.lastRestore.restoredCount) || 0,
          verified: frame.lastRestore.verified === true,
          errorCount: Number(frame.lastRestore.errorCount) || 0
        } : null,
        error: String(frame.error || "").replace(/https?:\/\/\S+/g, "[URL]").slice(0, 160),
        players: (Array.isArray(frame.players) ? frame.players : []).slice(0, 40).map((player) => ({
          mediaType: String(player.mediaType || "media").slice(0, 16), action: String(player.action || "unknown").slice(0, 24),
          playing: player.playing === true, originalVolumePercent: percent(player.originalVolumePercent),
          targetVolumePercent: percent(player.targetVolumePercent), appliedVolumePercent: percent(player.appliedVolumePercent),
          currentVolumePercent: percent(player.currentVolumePercent),
          transitionState: String(player.transitionState || "").slice(0, 32), reason: String(player.reason || "").slice(0, 120),
          manualOverride: player.manualOverride === true, fallbackUsed: player.fallbackUsed === true
        }))
      }));
    }
    anonymizedDiagnosticReport() {
      const sites = new Map();
      const siteFor = (host) => {
        if (!sites.has(host)) sites.set(host, `site-${sites.size + 1}`);
        return sites.get(host);
      };
      return JSON.stringify({
        product: "ChatDuck",
        frames: (this.diagnosticState || []).map((frame) => ({
          site: siteFor(frame.host), frame: frame.isChatGPT ? "chatgpt" : frame.isTop ? "top" : "iframe",
          status: frame.status, registered: frame.registered, eligible: frame.eligible, excluded: frame.excluded,
          dictationActive: frame.dictationActive, sessionActive: frame.sessionActive, sessionReceived: frame.sessionReceived,
          globalMode: frame.globalMode, effectiveMode: frame.effectiveMode, targetVolumePercent: frame.targetVolumePercent,
          htmlMediaCount: frame.htmlMediaCount, iframeCount: frame.iframeCount, audioDetected: frame.audioDetected,
          tabAudioState: frame.tabAudioState, fallbackDisabled: frame.fallbackDisabled,
          playingCount: frame.playingCount, controlledCount: frame.controlledCount,
          fallbackToPause: frame.fallbackToPause, webAudioMuteFallback: frame.webAudioMuteFallback,
          lastRestore: frame.lastRestore, error: frame.error,
          players: frame.players.map(({ mediaType, action, playing, originalVolumePercent, targetVolumePercent, appliedVolumePercent, currentVolumePercent, transitionState, reason, manualOverride, fallbackUsed }) => ({ mediaType, action, playing, originalVolumePercent, targetVolumePercent, appliedVolumePercent, currentVolumePercent, transitionState, reason, manualOverride, fallbackUsed }))
        }))
      }, null, 2);
    }
    browserReady(settings = this.getSettings()) {
      return settings.enabled && settings.webIntegration && settings.universalWebControl;
    }
    agentStatusKey(state, settings = this.getSettings()) {
      if (state.agent?.ok && (settings.discordMuteDuringDictation || settings.discordDeafenDuringDictation) && state.agent.discordUnsupported) return "agentDiscordUpdateRequired";
      if (state.agent?.ok && (settings.discordMuteDuringDictation || settings.discordDeafenDuringDictation) && !Array.isArray(state.agent.capabilities)) return "agentDiscordUpdateRequired";
      if (state.agent?.ok) return "agentConnected";
      if (root.AudioDuckAgent?.configured) return "agentDisconnected";
      return state.agent?.installed === false ? "agentNotInstalled" : "agentNotPaired";
    }

    async refreshState() { this.applyState(await this.state()); }

    applyState(state, { updateApps = false } = {}) {
      if (!this.shadow || !this.opened) return;
      const prior = this.lastState;
      this.lastState = state;
      if (!prior || Boolean(prior.sessionActive) !== Boolean(state.sessionActive)) { void this.render(); return; }
      const connected = Boolean(state.agent?.ok);
      const settings = this.getSettings();
      const status = this.shadow.querySelector("[data-agent-status]");
      if (status) status.textContent = this.t(this.agentStatusKey(state, settings));
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
      void this.render().then(() => this.shadow?.querySelector(".window,.panel")?.focus());
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
      const websiteOverrides = Object.entries(settings.websiteOverrides).map(([domain, rule]) => `<div class="managed-row"><div class="player-row"><label class="row"><span class="row-copy"><strong>${this.escape(domain)}</strong><small>${this.e("enabledOverride")}</small></span><input type="checkbox" role="switch" data-website-enabled="${this.escape(domain)}" ${rule.enabled ? "checked" : ""} ${disabled}><span class="switch-ui" aria-hidden="true"></span></label><label class="field">${this.e("whenDictating")}<select data-website-mode="${this.escape(domain)}" ${disabled}><option value="inherit" ${rule.mode === "inherit" ? "selected" : ""}>${this.e("inherit")}</option><option value="pause" ${rule.mode === "pause" ? "selected" : ""}>${this.e("pause")}</option><option value="duck" ${rule.mode === "duck" ? "selected" : ""}>${this.e("duck")}</option></select></label><label class="volume">${this.e("targetVolume")} <output>${rule.targetVolumePercent ?? settings.targetVolumePercent}%</output><input type="range" min="0" max="100" step="1" value="${rule.targetVolumePercent ?? settings.targetVolumePercent}" data-website-target="${this.escape(domain)}" ${disabled}></label></div><button class="quiet" data-action="remove-website-override" data-domain="${this.escape(domain)}" ${disabled}>${this.e("removeSiteAction")}</button></div>`).join("") || `<p class="empty">${this.e("noWebsiteOverrides")}</p>`;
      const windowsApps = settings.windowsApps.map((app) => this.windowAppRow(app, settings, disabled)).join("");
      const detectedApps = (state.apps || []).map((app) => this.detectedAppRow(app, settings, disabled)).join("") || `<p class="empty">${this.e("noSessions")}</p>`;
      const plexOrigins = settings.plexOrigins.length ? settings.plexOrigins.map((origin) => `<div class="managed-row"><span class="row-copy"><strong>${this.escape(origin)}</strong><small>${this.e("plexPermission")}</small><code>${this.escape(this.plexMatchLine(origin))}</code></span>${this.removeButton("plex-origin", origin, origin, "removeOrigin", "removeServer", disabled)}</div>`).join("") : `<p class="empty">${this.e("emptyPlexOrigins")}</p>`;
      const browserReady = this.browserReady(settings);
      const agentConfigured = Boolean(root.AudioDuckAgent?.configured);
      const agentConnected = Boolean(state.agent?.ok);
      const agentStatus = this.e(this.agentStatusKey(state, settings));
      let installUrl = "";
      try {
        const candidate = new URL(root.AudioDuckAgent?.installUrl || "");
        if (candidate.protocol === "https:" && candidate.hostname === "github.com" && /\/releases\/download\/v[A-Za-z0-9.-]+\/ChatDuck-Windows-Agent-[A-Za-z0-9.-]+-x64\.msi$/.test(candidate.pathname)) installUrl = candidate.href;
      } catch (_) {}

      if (typeof root.AudioDuckNativeTheme === "string") {
        this.renderNative({ settings, state, disabled, focusableSelector, focusKey, focusIndex, scrollTop, detailsState, installUrl, entrance });
        this.animateNextRender = false;
        return;
      }

      this.shadow.innerHTML = `<style>
        :host{all:initial;color-scheme:dark;font:14px/1.5 Inter,"Segoe UI",system-ui,sans-serif;color:#e9eaf0}*,*:before,*:after{box-sizing:border-box}
        .backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:rgba(7,8,12,.72);backdrop-filter:blur(3px);pointer-events:auto}.backdrop.entering{animation:fade-in .16s ease-out}
        .panel{width:min(760px,calc(100vw - 28px));height:min(820px,calc(100dvh - 32px));max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border:1px solid #393a44;border-radius:16px;background:linear-gradient(145deg,#1b1c21,#15161a 72%);box-shadow:0 28px 90px #0009,0 2px 10px #0006;color:#e9eaf0;outline:none}.panel.entering{animation:lift-in .2s cubic-bezier(.2,.75,.25,1)}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 20px;border-bottom:1px solid #30313a;background:linear-gradient(110deg,#202027,#191a20)}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:38px;height:38px;display:grid;place-items:center;flex:none;border:1px solid #51476d;border-radius:11px;background:linear-gradient(145deg,#322b45,#211e2c);color:#c0adff}.brand-mark svg{width:20px;height:20px}.brand h1{margin:0;font-size:15px;line-height:1.2;font-weight:650;letter-spacing:-.02em}.version{margin-left:7px;color:#a9aab4;font-size:11px;font-weight:500}.brand p{margin:3px 0 0;color:#aaaab5;font-size:11px}.icon-button{width:32px;height:32px;display:inline-grid;place-items:center;padding:0;flex:none}.quiet,.icon-button{border:1px solid #3c3d47;border-radius:8px;background:#222329;color:#d4d5de;cursor:pointer;transition:background .14s,border-color .14s,color .14s}.quiet:hover,.icon-button:hover{background:#2d2e36;border-color:#62636e;color:#fff}.install-agent{text-decoration:none;display:inline-flex;align-items:center}.icon-button svg{width:15px;height:15px}
        main{overflow:auto;overscroll-behavior:contain;padding:12px 20px 18px;scrollbar-color:#454650 transparent;scrollbar-width:thin}.section{padding:13px 0 14px;border-bottom:1px solid #30313a}.section:first-child{padding-top:2px}.section:last-child{border-bottom:0}.section-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:#c8c9d2;font-size:11px;font-weight:650;letter-spacing:.045em;text-transform:uppercase}.section-title:before{width:3px;height:13px;border-radius:3px;background:#a38bf4;content:""}.row{position:relative;display:flex;align-items:center;gap:12px;min-height:42px;cursor:pointer}.row-copy{display:grid;gap:1px;flex:1;min-width:0}.row strong{font-size:12px;font-weight:550}.row small,.hint{color:#b1b2bc;font-size:10px}.row input[type=checkbox]{position:absolute;width:1px;height:1px;opacity:0}.switch-ui{position:relative;width:34px;height:19px;flex:none;border-radius:12px;background:#484951;transition:background .16s}.switch-ui:after{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#c2c3cc;content:"";transition:transform .16s,background .16s}.row input:checked+.switch-ui{background:#8069cf}.row input:checked+.switch-ui:after{transform:translateX(15px);background:#fff}.row input:disabled+.switch-ui{opacity:.45;cursor:not-allowed}
        :is(button,input,select,textarea,summary):focus-visible,.row input:focus-visible+.switch-ui{outline:2px solid #c1afff;outline-offset:3px}.master{justify-content:space-between;padding:9px 11px;border:1px solid #393a44;border-radius:10px;background:#202127}.master strong{font-size:13px}.segments{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border:1px solid #3a3b44;border-radius:9px;background:#15161a}.segment{min-height:34px;border:0;border-radius:7px;background:transparent;color:#c3c3cd;font:inherit;font-size:12px;cursor:pointer;transition:background .14s,color .14s}.segment[aria-pressed=true]{background:#302941;color:#f1ebff;box-shadow:inset 0 0 0 1px #66558a}.segment:disabled{opacity:.55;cursor:not-allowed}.volume{padding:11px 1px 1px}.volume-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;font-size:11px}.volume-head output,.policy-grid output,.advanced-fields output{color:#c8b9ff;font-variant-numeric:tabular-nums}.volume input,.policy-grid input[type=range],.advanced-fields input[type=range]{width:100%;accent-color:#a38bf4}.range-labels{display:flex;justify-content:space-between;color:#b1b2bc;font-size:10px}
        details{border-top:1px solid #292a32;padding:9px 0}summary{color:#d2d2db;font-size:11px;font-weight:550;cursor:pointer;list-style:none;user-select:none}summary::-webkit-details-marker{display:none}summary:before{display:inline-block;width:18px;color:#ad9cf2;content:"›";font-size:17px;line-height:10px;transition:transform .14s}details[open]>summary:before{transform:rotate(90deg)}summary:hover{color:#fff}.details-body{padding:7px 0 0 18px}.player-row{min-width:0;flex:1}.managed-row{display:flex;align-items:center;gap:9px}.managed-row+.managed-row{border-top:1px solid #292a32}.managed-row .row{flex:1;min-height:40px}.managed-row .row-copy{padding:6px 0}.managed-row code{display:block;margin-top:3px;overflow-wrap:anywhere;color:#b9a9fb;font-size:9px}.player-policy{padding:0 0 8px 12px;border-top:0}.player-policy summary{color:#a8a9b3;font-size:10px}.policy-grid{display:grid;grid-template-columns:minmax(110px,1fr) minmax(130px,1fr) auto;align-items:end;gap:10px;padding:6px 0}.policy-grid label,.advanced-fields label{display:grid;gap:5px;color:#c1c1ca;font-size:10px}.policy-grid select,.advanced-fields input:not([type=range]),.dialog input{width:100%;min-height:32px;padding:6px 9px;border:1px solid #41424d;border-radius:7px;background:#191a20;color:#edecf3;font:inherit;font-size:11px}.policy-grid input[type=checkbox]{accent-color:#a38bf4}.policy-grid label:has(input[type=checkbox]){display:flex;align-items:center;gap:6px;white-space:nowrap}.hint{color:#bcbcc5}.empty,.subhint,.agent-note{margin:7px 0;color:#b2b3be;font-size:10px;line-height:1.55}.subhint code{color:#c4b6ff}.section-actions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.quiet{padding:7px 9px;font:inherit;font-size:10px}.quiet:disabled{opacity:.5;cursor:not-allowed}.app-card{display:flex;align-items:center;gap:10px;padding:8px 9px;border:1px solid #353640;border-radius:9px;background:#1c1d23}.app-card+.app-card{margin-top:7px}.app-card .row-copy{flex:1;min-width:0}.app-card strong{display:block;font-size:11px;font-weight:550}.app-card small{display:block;overflow-wrap:anywhere;color:#b2b3be;font-size:9px}.agent-status{display:flex;align-items:center;gap:8px;margin:3px 0 4px;color:#dddde5;font-size:11px}.status-dot{width:7px;height:7px;flex:none;background:#777983}.status-dot[data-ok="true"]{background:#54ce91}.browser-status{display:flex;align-items:center;gap:8px;margin:8px 0 4px;color:#a8e7c5;font-size:11px}.browser-status[data-ready="false"]{color:#b2b3be}.browser-status-dot{width:7px;height:7px;border-radius:50%;background:#54ce91}.browser-status[data-ready="false"] .browser-status-dot{background:#777983}.advanced-group{padding:4px 0 8px}.advanced-group+.advanced-group{border-top:1px solid #292a32;padding-top:12px}.agent-prompt{color:#edecf3;font-weight:600}.agent-steps{margin:6px 0 8px;padding-left:22px;color:#bfc0ca}.agent-note{padding:8px 10px;border:1px solid #30313a;border-radius:8px;background:#1a1b20}.lock-note{margin:2px 0 9px;padding:8px 10px;border:1px solid #665833;border-radius:8px;background:#302a1d;color:#f2dca4;font-size:11px}
        .advanced-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.advanced-fields label{margin:7px 0}.advanced-fields input[type=range]{padding:0}.field{display:grid;gap:6px;margin:8px 0;color:#c7c8d0;font-size:10px}.field textarea{min-height:58px;resize:vertical;padding:8px 9px;border:1px solid #41424d;border-radius:7px;background:#191a20;color:#edecf3;font:inherit;font-size:11px}.about-copy{color:#bfc0c9;font-size:11px}.about-link{display:inline-flex;margin-top:7px;color:#c5b5ff;text-decoration:none}.about-link:hover{text-decoration:underline}.dialog{width:min(430px,calc(100vw - 36px));max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #41424d;border-radius:12px;background:#1c1d23;color:#edecf3;padding:18px;box-shadow:0 18px 60px #0009}.dialog::backdrop{background:#05060aaa;backdrop-filter:blur(2px)}.dialog h2{margin:0 0 7px;font-size:14px}.dialog p{margin:0 0 14px;color:#b8b9c3;font-size:10px;line-height:1.5}.dialog form{display:grid;gap:10px}.dialog label{display:grid;gap:5px;color:#c9c9d2;font-size:11px}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.dialog-status{min-height:16px;color:#edc28c;font-size:10px}.footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 20px;border-top:1px solid #34353e;background:#191a20}.footer-left{display:flex;align-items:center;gap:12px;min-width:0}.language{display:flex;align-items:center;gap:7px;color:#bebfc9;font-size:10px}.language select{max-width:150px;min-height:30px;padding:4px 24px 4px 8px;border:1px solid #41424d;border-radius:7px;background:#202127;color:#eeeef4;font:inherit}.autosave{color:#b7b8c2;font-size:10px}.primary{min-height:33px;padding:6px 13px;border:1px solid #8f7cdb;border-radius:8px;background:#7964c7;color:#fff;font:inherit;font-size:11px;font-weight:600;cursor:pointer}.primary:hover{background:#8974d8}
        @keyframes fade-in{from{opacity:0}to{opacity:1}}@keyframes lift-in{from{opacity:.3;transform:translateY(9px) scale(.99)}to{opacity:1;transform:none}}@media(max-width:620px){.backdrop{padding:8px}.panel{width:calc(100vw - 16px);height:calc(100dvh - 16px);max-height:calc(100vh - 16px);border-radius:13px}.topbar{padding:13px 14px}.brand-mark{width:34px;height:34px}main{padding:10px 14px 14px}.footer{padding:9px 14px}.autosave{display:none}.policy-grid{grid-template-columns:1fr 1fr}.policy-grid label:has(input[type=checkbox]){grid-column:1/-1}.advanced-fields{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
        .panel{--type-scale:1;--panel-width:1060px;--panel-height:900px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;width:min(var(--panel-width),calc(100vw - 32px));height:min(var(--panel-height),calc(100dvh - 32px));grid-template-columns:minmax(0,1fr);font-size:calc(14px * var(--type-scale))}
        .panel[data-size="compact"]{--panel-width:700px;--panel-height:780px;--type-scale:.96}
        .panel[data-size="normal"]{--panel-width:840px;--panel-height:860px;--type-scale:1}
        .panel[data-size="large"]{--panel-width:1120px;--panel-height:1080px;--type-scale:1.18}
        .workspace{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:0;overflow:hidden}.side-nav{display:flex;flex-direction:column;gap:4px;padding:18px 10px;border-right:1px solid #30313a;background:#17181d}.side-nav button{display:flex;align-items:center;gap:10px;min-height:40px;padding:8px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:#bfc0ca;text-align:left;font:inherit;font-size:12px;cursor:pointer}.side-nav button:hover{background:#222329;color:#fff}.side-nav button[aria-current="page"]{border-color:#365b50;background:#17221f;color:#8ad8c0}.side-nav .nav-spacer{flex:1}.page-heading{padding:4px 0 15px;margin:0 0 13px;border-bottom:1px solid #30313a}.page-heading h2{margin:0 0 3px;font-size:20px}.page-heading p{margin:0;color:#bfc0ca;font-size:12px}.panel[data-page="desktop"] .advanced>summary,.panel[data-page="advanced"] .advanced>summary{display:none}.panel[data-page="desktop"] .advanced,.panel[data-page="advanced"] .advanced{border:0;padding:0}.panel[data-page="desktop"] .advanced .advanced-group:nth-of-type(2){display:none}.panel[data-page="advanced"] .advanced .advanced-group:nth-of-type(1){display:none}.diagnostic-summary{display:grid;gap:8px;margin:14px 0}.diagnostic-row{display:grid;grid-template-columns:minmax(120px,1fr) repeat(4,minmax(40px,auto));gap:12px;padding:10px;border:1px solid #30313a;border-radius:7px;background:#191a20;color:#d6d7df;font-size:11px}.diagnostic-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.diagnostic-row span{color:#bfc0ca;text-align:right;font-variant-numeric:tabular-nums}.topbar{padding:var(--space-4) var(--space-5);gap:var(--space-4)}.brand{gap:var(--space-3)}.brand-mark{width:40px;height:40px;border-radius:11px}
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
        @media(max-width:700px){.workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.side-nav{flex-direction:row;overflow-x:auto;padding:6px;border-right:0;border-bottom:1px solid #30313a}.side-nav button{flex:none;min-height:34px;padding:6px 9px;white-space:nowrap}.side-nav .nav-spacer{display:none}.diagnostic-row{grid-template-columns:minmax(80px,1fr) repeat(2,minmax(40px,auto))}.diagnostic-row span:nth-of-type(n+3){display:none}}
        @media(max-width:620px){.panel{--space-4:14px;--space-5:14px;width:calc(100vw - 16px);height:calc(100dvh - 16px);max-height:calc(100vh - 16px)}.topbar{padding:var(--space-3) var(--space-4)}main{padding:var(--space-3) var(--space-4) var(--space-4)}.windows-app-row{gap:8px}.windows-app-heading{gap:8px}.footer{align-items:center;padding:10px var(--space-3)}.footer-left{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;flex:1}.footer-field{align-content:start;gap:4px}.footer-field select{width:100%;min-width:0;max-width:100%}.support-link{min-width:0;white-space:normal}.autosave{display:block;white-space:normal}.policy-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.advanced-fields{grid-template-columns:1fr}}
        @media(max-width:390px){.panel{--space-4:12px;--space-5:12px}.footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;grid-template-areas:"language size close" "support autosave autosave";gap:var(--space-2);padding:var(--space-2)}.footer-left{display:contents}.footer-left>.footer-field:first-child{grid-area:language}.footer-left>.footer-field:nth-child(2){grid-area:size}.footer-left>.support-link{grid-area:support;white-space:nowrap}.footer-left>.autosave{grid-area:autosave}.footer>.primary{grid-area:close;align-self:center;justify-self:end}.policy-grid{grid-template-columns:1fr}}
      </style><div class="backdrop${entrance}" data-backdrop><section class="panel${entrance}" data-focus="panel" data-page="${this.activePage}" data-size="${settings.modalSize}" lang="${settings.language}" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-tagline" tabindex="-1">
        <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></span><div><h1 id="settings-title">${this.e("brand")} <span class="version">${this.escape(version)}</span></h1><p id="settings-tagline">${this.e("tagline")}</p></div></div><button class="quiet icon-button" data-close aria-label="${this.e("close")}" title="${this.e("close")}" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <div class="workspace"><nav class="side-nav" aria-label="${this.e("settingsSections")}"><button type="button" data-nav="general">◉ ${this.e("general")}</button><button type="button" data-nav="browser">◌ ${this.e("webIntegrations")}</button><button type="button" data-nav="desktop">▤ ${this.e("windowsApps")}</button><button type="button" data-nav="advanced">⌘ ${this.e("technicalDetails")}</button><span class="nav-spacer"></span><button type="button" data-nav="diagnostics">⌁ ${this.e("diagnostics")}</button><button type="button" data-nav="about">ⓘ ${this.e("about")}</button></nav><main>${state.sessionActive ? `<p class="lock-note" role="status">${this.e("activeLock")}</p>` : ""}
          <div class="page-heading"><h2 data-page-title></h2><p>${this.e("tagline")}</p></div>
          <section class="section"><h2 class="section-title">${this.e("general")}</h2>${row("enabled", "enabled", "enabledHint")}<p class="section-title">${this.e("whenDictating")}</p><div class="segments" role="group" aria-label="${this.e("whenDictating")}"><button class="segment" data-focus="mode:pause" data-mode="pause" aria-pressed="${settings.mode === "pause"}" ${disabled}>${this.e("pause")}</button><button class="segment" data-focus="mode:duck" data-mode="duck" aria-pressed="${settings.mode === "duck"}" ${disabled}>${this.e("duck")}</button></div>${settings.mode === "duck" ? `<label class="volume"><span class="volume-head"><span>${this.e("targetVolume")}</span><output for="target-volume">${settings.targetVolumePercent}%</output></span><input id="target-volume" data-focus="setting:targetVolumePercent" aria-label="${this.e("targetVolume")}" type="range" min="0" max="100" step="1" data-setting="targetVolumePercent" value="${settings.targetVolumePercent}" ${disabled}><span class="range-labels"><span>${this.e("minimum")}</span><span>${this.e("maximum")}</span></span></label>${row("fallbackToPause", "duckingFallback", "duckingFallbackHint")}` : ""}<p class="browser-status" data-ready="${browserReady}" role="status"><span class="browser-status-dot" aria-hidden="true"></span><span>${this.e(browserReady ? "browserModeReady" : "browserModeOff")}</span></p></section>
          <section class="section"><h2 class="section-title">${this.e("webIntegrations")}</h2>${row("webIntegration", "webPlayers", "webPlayersHint")}${row("universalWebControl", "universalControl", "universalHint")}${row("webAudioMuteFallback", "webAudioMuteFallback", "webAudioMuteFallbackHint")}<div class="section-actions"><button class="quiet" data-action="exclude-current" ${disabled}>${this.e("excludeCurrent")}</button><button class="quiet" data-action="add-website-override" ${disabled}>${this.e("addWebsiteOverride")}</button></div><h3 class="section-title">${this.e("websiteOverrides")}</h3>${websiteOverrides}<label class="field">${this.e("excludedWebsites")}<textarea data-focus="setting:excludedDomains" data-setting="excludedDomains" placeholder="${this.e("excludedPlaceholder")}" ${disabled}>${this.escape(settings.excludedDomains)}</textarea></label></section>
          <section class="section"><h2 class="section-title">${this.e("diagnostics")}</h2><p class="subhint">${this.e("diagnosticsPrivacy")}</p><button class="quiet" type="button" data-action="refresh-diagnostics">${this.e("refreshDiagnostics")}</button><div class="diagnostic-summary" aria-live="polite">${this.diagnosticState === null ? `<p class="empty">${this.e("diagnosticsNotLoaded")}</p>` : this.diagnosticState.map((frame) => `<div class="diagnostic-row"><strong>${this.escape(frame.host || "unknown")}</strong><span>${this.e("players")}: ${Number(frame.htmlMediaCount) || 0}</span><span>${this.e("playing")}: ${Number(frame.playingCount) || 0}</span><span>${this.e("ducked")}: ${Number(frame.duckedCount) || 0}</span><span>${this.escape(frame.lastRestore?.verified ? this.t("restoreVerified") : "—")}</span></div>`).join("") || `<p class="empty">${this.e("noDiagnostics")}</p>`}</div></section>
          <details class="section advanced" data-section="advanced" ${agentConfigured ? "open" : ""}><summary>${this.e("advanced")}</summary><div class="details-body">
            <section class="advanced-group"><h2 class="section-title">${this.e("windowsApps")}</h2><p class="agent-status" role="status"><span class="status-dot" data-status-dot data-ok="${agentConnected || (!agentConfigured && browserReady)}" aria-hidden="true"></span><span data-agent-status>${agentStatus}</span></p><div class="managed-row"><div class="player-row">${row("spotifyDesktop", "spotifyDesktop", "windowsMedia")}${this.policyControls("spotifyDesktop", settings, disabled)}</div></div><details data-section="apps" open><summary>${this.e("windowsApps")}</summary><div class="details-body">${windowsApps || `<p class="empty">${this.e("noOtherApps")}</p>`}<div class="section-actions"><button class="quiet" data-agent-control data-action="add-app" ${disabled} ${agentConnected ? "" : "disabled"}>${this.e("addApp")}</button><button class="quiet" data-agent-control data-action="refresh-apps" ${agentConnected ? "" : "disabled"}>${this.e("refreshApps")}</button></div>${agentConnected ? `<label class="row"><span class="row-copy"><strong>${this.e("agentStartup")}</strong><small>${this.e("agentStartupHint")}</small></span><input type="checkbox" role="switch" data-agent-control data-agent-autostart ${state.agent.autostartEnabled ? "checked" : ""} ${state.sessionActive ? "disabled" : ""}><span class="switch-ui" aria-hidden="true"></span></label>` : ""}</div></details>${!agentConfigured && installUrl ? `<div class="agent-note"><strong class="agent-prompt">${this.e("desktopAgentPrompt")}</strong><ol class="agent-steps"><li>${this.e("agentStepDownload")}</li><li>${this.e("agentStepInstall")}</li><li>${this.e("agentStepPair")}</li></ol><div class="section-actions"><a class="quiet install-agent" href="${this.escape(installUrl)}" target="_blank" rel="noopener noreferrer">${this.e("installWindowsAgent")}</a></div></div>` : ""}</section>
            <section class="advanced-group"><h2 class="section-title">${this.e("technicalDetails")}</h2>${row("voiceMode", "voiceMode", "voiceModeHint")}<h2 class="section-title">${this.e("transitions")}</h2><p class="subhint">${this.e("transitionHint")}</p><div class="advanced-fields"><label>${this.e("fadeOut")}<input data-focus="setting:fadeOutMs" type="range" min="0" max="1000" step="25" data-setting="fadeOutMs" value="${settings.fadeOutMs}" ${disabled}><output data-fade-label="fadeOutMs">${settings.fadeOutMs} ms</output></label><label>${this.e("fadeIn")}<input data-focus="setting:fadeInMs" type="range" min="0" max="1500" step="25" data-setting="fadeInMs" value="${settings.fadeInMs}" ${disabled}><output data-fade-label="fadeInMs">${settings.fadeInMs} ms</output></label></div><details data-section="technical-info"><summary>${this.e("technicalDetails")}</summary><p class="subhint">${this.e("agentOptional")}</p></details></section>
          </div></details>
          <details class="section" data-section="about"><summary>${this.e("about")}</summary><div class="details-body"><p class="about-copy"><strong>ChatDuck ${this.escape(version)}</strong> · ${this.e("aboutText")}</p></div></details>
        </main></div><footer class="footer"><div class="footer-left"><label class="footer-field" for="settings-language">${this.e("language")}<select id="settings-language" data-focus="language" data-language aria-label="${this.e("language")}">${root.AudioDuckI18n.LANGUAGE_OPTIONS.map(({ code, labelKey }) => `<option value="${code}" ${settings.language === code ? "selected" : ""}>${this.e(labelKey)}</option>`).join("")}</select></label><label class="footer-field" for="settings-size">${this.e("modalSize")}<select id="settings-size" data-focus="modalSize" data-setting="modalSize" aria-label="${this.e("modalSize")}">${["auto", "compact", "normal", "large"].map((size) => `<option value="${size}" ${settings.modalSize === size ? "selected" : ""}>${this.e(`size${size[0].toUpperCase()}${size.slice(1)}`)}</option>`).join("")}</select></label><a class="support-link" href="https://ko-fi.com/fevee" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8.2-4.8-9.8-9.7C.8 7.5 3.1 4 7 4c2.1 0 3.8 1.1 5 2.8C13.2 5.1 14.9 4 17 4c3.9 0 6.2 3.5 4.8 7.3C20.2 16.2 12 21 12 21Z"/></svg>${this.e("support")}</a><span class="autosave">${this.e("savedAutomatically")}</span></div><button class="primary" data-close type="button">${this.e("close")}</button></footer>
        <dialog class="dialog" data-dialog="site" aria-labelledby="site-title"><h2 id="site-title">${this.e("dialogSiteTitle")}</h2><p>${this.e("dialogSiteDescription")}</p><form data-form="site"><label>${this.e("siteLabel")}<input name="site" placeholder="${this.e("sitePlaceholder")}" required autocomplete="url"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
        <dialog class="dialog" data-dialog="plex-origin" aria-labelledby="plex-title"><h2 id="plex-title">${this.e("dialogPlexTitle")}</h2><p>${this.e("dialogPlexDescription")}</p><form data-form="plex-origin"><label>${this.e("plexOriginLabel")}<input name="origin" placeholder="${this.e("plexOriginPlaceholder")}" required autocomplete="url"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
        <dialog class="dialog" data-dialog="app" aria-labelledby="app-title"><h2 id="app-title">${this.e("dialogAppTitle")}</h2><p>${this.e("appPathHelp")}</p><div class="detected"><p class="section-title">${this.e("detectedSessions")}</p>${detectedApps}</div><form data-form="app"><label>${this.e("path")}<input name="path" placeholder="${this.e("pathPlaceholder")}" autocomplete="off"></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="quiet" data-action="close-dialog">${this.e("cancel")}</button><button class="primary" type="submit">${this.e("fieldAdd")}</button></div></form></dialog>
      </section></div>`;
      for (const [key, open] of detailsState) { const item = this.shadow.querySelector(`details[data-section="${key}"]`); if (item) item.open = open; }
      this.applyPage();
      this.renderDiagnosticView();
      const main = this.shadow.querySelector("main"); if (main) main.scrollTop = scrollTop;
      this.animateNextRender = false;
      const focusTarget = focusKey
        ? [...this.shadow.querySelectorAll("[data-focus]")].find((item) => item.getAttribute("data-focus") === focusKey)
        : focusIndex >= 0 ? this.shadow.querySelectorAll(focusableSelector)[focusIndex] : null;
      const focusableTarget = focusTarget && !focusTarget.matches?.(":disabled") && (!focusTarget.getClientRects || focusTarget.getClientRects().length) ? focusTarget : null;
      (focusableTarget || this.shadow.querySelector(".panel"))?.focus({ preventScroll: true });
    }

    renderNative({ settings, state, disabled, focusableSelector, focusKey, focusIndex, scrollTop, detailsState, installUrl, entrance }) {
      const e = (key) => this.e(key);
      const row = (key, title, description = "", checked = settings[key], locked = disabled) => `<div class="row"><div class="label">${e(title)}${description ? `<div class="hint">${e(description)}</div>` : ""}</div><label class="switch"><input type="checkbox" data-focus="setting:${key}" data-setting="${key}" aria-label="${e(title)}" ${checked ? "checked" : ""} ${key === "enabled" ? "" : locked}><span>${e(checked ? "nativeOn" : "nativeOff")}</span></label></div>`;
      const tabs = [["general", "general"], ["browser", "webTab"], ["desktop", "windowsTab"], ["advanced", "advanced"], ["diagnostics", "diagnostics"], ["about", "about"]];
      const tabMarkup = tabs.map(([key, label]) => `<button type="button" id="native-tab-${key}" role="tab" data-nav="${key}" aria-selected="${this.activePage === key}" aria-controls="native-page-${key}" tabindex="${this.activePage === key ? "0" : "-1"}">${e(label)}</button>`).join("");
      const domainList = [...new Set(settings.excludedDomains.split(/[\n,;]+/).map((item) => root.AudioDuckCore.normalizePolicyDomain(item)).filter(Boolean))];
      const excludes = domainList.length ? `<table class="table"><tbody>${domainList.map((domain) => `<tr><td>${this.escape(domain)}</td><td><button type="button" data-action="remove-excluded" data-domain="${this.escape(domain)}" ${disabled}>${e("remove")}</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty">${e("nativeNone")}</div>`;
      const overrides = Object.entries(settings.websiteOverrides).map(([domain, rule]) => `<tr><td>${this.escape(domain)}</td><td><label class="check"><input type="checkbox" data-website-enabled="${this.escape(domain)}" aria-label="${e("enabledOverride")} ${this.escape(domain)}" ${rule.enabled ? "checked" : ""} ${disabled}>${e("enabledOverride")}</label></td><td><select data-website-mode="${this.escape(domain)}" aria-label="${e("mode")} ${this.escape(domain)}" ${disabled}><option value="inherit" ${rule.mode === "inherit" ? "selected" : ""}>${e("inherit")}</option><option value="duck" ${rule.mode === "duck" ? "selected" : ""}>${e("duck")}</option><option value="pause" ${rule.mode === "pause" ? "selected" : ""}>${e("pause")}</option></select></td><td><label class="sr-only" for="target-${encodeURIComponent(domain)}">${e("target")} ${this.escape(domain)}</label><input id="target-${encodeURIComponent(domain)}" class="num" type="number" min="0" max="100" value="${rule.targetVolumePercent ?? settings.targetVolumePercent}" data-website-target="${this.escape(domain)}" ${disabled}>%</td><td><button type="button" data-action="remove-website-override" data-domain="${this.escape(domain)}" aria-label="${e("remove")} ${this.escape(domain)}" ${disabled}>${e("remove")}</button></td></tr>`).join("");
      const agentConfigured = Boolean(root.AudioDuckAgent?.configured), agentConnected = Boolean(state.agent?.ok);
      const apps = settings.windowsApps.map((app) => this.windowAppRow(app, settings, disabled)).join("") || `<div class="empty">${e("noOtherApps")}</div>`;
      const detected = (state.apps || []).map((app) => this.detectedAppRow(app, settings, agentConnected && !state.sessionActive ? "" : "disabled")).join("") || `<div class="empty">${e("noSessions")}</div>`;
      const webEnabled = settings.webIntegration && settings.universalWebControl;
      const general = `${row("enabled", "enabled", "", settings.enabled, "")}<div class="row"><div class="label">${e("whenDictating")}</div><div class="choice">${["duck", "pause"].map((mode) => `<label><input type="radio" name="mode" data-mode="${mode}" data-focus="mode:${mode}" aria-label="${e(mode)}" ${settings.mode === mode ? "checked" : ""} ${disabled}>${e(mode)}</label>`).join("")}</div></div>${settings.mode === "duck" ? `<div class="row"><label class="label" for="native-target">${e("targetVolume")}</label><span class="target-control"><input id="native-target" type="range" min="0" max="100" step="1" value="${settings.targetVolumePercent}" data-setting="targetVolumePercent" data-focus="setting:targetVolumePercent" aria-label="${e("targetVolume")}" ${disabled}><output data-target-volume-output>${settings.targetVolumePercent}%</output></span></div>` : ""}`;
      const browser = `<div class="row"><div class="label">${e("universalControl")}<div class="hint">${e("universalHint")}</div></div><label class="switch"><input type="checkbox" data-web-control aria-label="${e("universalControl")}" ${webEnabled ? "checked" : ""} ${disabled}><span>${e(webEnabled ? "nativeOn" : "nativeOff")}</span></label></div><div class="group"><h2 class="section">${e("excludedWebsites")}</h2>${excludes}<form class="entry" data-form="exclude-domain"><input name="domain" placeholder="${e("excludedPlaceholder")}" aria-label="${e("excludedWebsites")}" required ${disabled}><button ${disabled}>${e("add")}</button></form><div class="notice" role="status" data-form-status="exclude-domain"></div></div><div class="group"><h2 class="section">${e("websiteOverrides")}</h2>${overrides ? `<table class="table"><thead><tr><th>${e("nativeHost")}</th><th>${e("enabled")}</th><th>${e("mode")}</th><th>${e("target")}</th><th></th></tr></thead><tbody>${overrides}</tbody></table>` : `<div class="empty">${e("noWebsiteOverrides")}</div>`}<form class="entry" data-form="website-override"><input name="domain" placeholder="${e("excludedPlaceholder")}" aria-label="${e("nativeHost")}" required ${disabled}><button ${disabled}>${e("add")}</button></form><div class="notice" role="status" data-form-status="website-override"></div></div>`;
      const agentStatusKey = this.agentStatusKey(state, settings);
      const discordMode = `<div class="group"><h2 class="section">${e("discordIntegration")}</h2><div class="row"><div class="label">${e("discordActivationMode")}</div><div class="choice" role="radiogroup" aria-label="${e("discordActivationMode")}">${[["automatic", "discordActivationAutomatic"], ["ctrl-click", "discordActivationCtrlClick"]].map(([value, label]) => `<label><input type="radio" name="discordActivationMode" value="${value}" data-setting="discordActivationMode" data-focus="setting:discordActivationMode" aria-label="${e(label)}" ${settings.discordActivationMode === value ? "checked" : ""} ${disabled}>${e(label)}</label>`).join("")}</div></div>${row("discordMuteDuringDictation", "discordMuteDuringDictation")}${row("discordDeafenDuringDictation", "discordDeafenDuringDictation")}</div>`;
      const desktop = `<div class="agent-status-row" data-connected="${agentConnected}" role="status"><span class="status-dot" data-status-dot data-ok="${agentConnected}" aria-hidden="true"></span><span data-agent-status>${e(agentStatusKey)}</span></div>${!agentConfigured ? `<p class="subtle">${e("agentPairHint")}</p>${installUrl ? `<a class="link" href="${this.escape(installUrl)}" target="_blank" rel="noopener noreferrer">${e("installWindowsAgent")}</a>` : ""}` : ""}${discordMode}<div class="group"><h2 class="section">${e("windowsApps")}</h2>${apps}<div class="entry"><button type="button" data-agent-control data-action="add-app" ${agentConnected && !state.sessionActive ? "" : "disabled"}>${e("addApp")}</button><button type="button" data-agent-control data-action="refresh-apps" ${agentConnected ? "" : "disabled"}>${e("refreshApps")}</button></div>${agentConnected ? `<label class="check"><input type="checkbox" data-agent-autostart aria-label="${e("agentStartup")}" ${state.agent.autostartEnabled ? "checked" : ""} ${state.sessionActive ? "disabled" : ""}>${e("agentStartup")}</label>` : ""}<details class="detected-details" data-section="detected-sessions"><summary>${e("detectedSessions")}</summary><div class="detected">${detected}</div></details></div>`;
      const advanced = `<div class="group"><h2 class="section">${e("transitions")}</h2>${[["fadeOutMs", "fadeOut", 1000], ["fadeInMs", "fadeIn", 1500]].map(([key, label, max]) => `<label class="row"><span class="label">${e(label)}</span><span class="target-control"><input type="range" min="0" max="${max}" step="25" value="${settings[key]}" data-setting="${key}" data-focus="setting:${key}" aria-label="${e(label)}" ${disabled}><output data-fade-label="${key}">${settings[key]} ms</output></span></label>`).join("")}</div><details class="group" data-section="fallbacks"><summary>${e("nativeFallback")}</summary><div class="details-body"><label class="check"><input type="checkbox" data-setting="fallbackDucking" aria-describedby="fallback-duck-hint" ${settings.fallbackDucking ? "checked" : ""} ${disabled}>${e("pauseFallbackToDucking")}</label><div class="hint" id="fallback-duck-hint">${e("pauseFallbackToDuckingHint")}</div><label class="check"><input type="checkbox" data-setting="fallbackToPause" aria-describedby="fallback-pause-hint" ${settings.fallbackToPause ? "checked" : ""} ${disabled}>${e("duckingFallback")}</label><div class="hint" id="fallback-pause-hint">${e("duckingFallbackHint")}</div><label class="check"><input type="checkbox" data-setting="webAudioMuteFallback" aria-describedby="web-audio-hint" ${settings.webAudioMuteFallback ? "checked" : ""} ${disabled}>${e("webAudioMuteFallback")}</label><div class="hint" id="web-audio-hint">${e("webAudioMuteFallbackHint")}</div><label class="check"><input type="checkbox" data-setting="voiceMode" aria-describedby="voice-mode-hint" ${settings.voiceMode ? "checked" : ""} ${disabled}>${e("voiceMode")}</label><div class="hint" id="voice-mode-hint">${e("voiceModeHint")}</div></div></details>`;
      const diagnostics = `<p class="subtle">${e("diagnosticsPrivacy")}</p><div class="entry"><button type="button" data-action="refresh-diagnostics">${e("refreshDiagnostics")}</button><button type="button" data-action="copy-diagnostics" ${this.diagnosticState === null ? "disabled" : ""}>${e("copyDiagnosticReport")}</button></div><div class="diagnostic-summary" aria-live="polite">${this.diagnosticState === null ? `<div class="empty">${e("diagnosticsNotLoaded")}</div>` : this.diagnosticState.map((frame) => `<article class="diagnostic-row"><strong>${this.escape(frame.host || e("noDiagnosticResponse"))}</strong><span>${e("players")}: ${frame.htmlMediaCount} · ${e("playing")}: ${frame.playingCount}</span><span>${e("ducked")}: ${frame.controlledCount}</span><details class="diagnostic-players"><summary>${e("diagnosticStatus")}: ${this.escape(frame.status)} · ${e("restore")}: ${frame.lastRestore?.verified ? e("restoreVerified") : e("diagnosticUnverified")}</summary>${frame.players.map((player) => `<div class="diagnostic-player"><strong>${this.escape(player.mediaType)} · ${this.escape(player.action)}</strong><span>${e("originalVolumeLabel")}: ${player.originalVolumePercent ?? "—"}%</span><span>${e("appliedVolume")}: ${player.appliedVolumePercent ?? "—"}%</span><span>${e("currentVolumeLabel")}: ${player.currentVolumePercent ?? "—"}%</span></div>`).join("")}${frame.error ? `<p class="diagnostic-error">${e("error")}: ${this.escape(frame.error)}</p>` : ""}</details></article>`).join("") || `<div class="empty">${e("noDiagnostics")}</div>`}</div>`;
      const about = `<h2 class="section">ChatDuck ${this.escape(version)}</h2><p><a class="link" href="https://github.com/fevegit/chatduck" target="_blank" rel="noopener noreferrer">${e("repository")}</a> · <a class="link" href="https://github.com/fevegit/chatduck/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${e("license")}</a></p>`;
      const pages = { general, browser, desktop, advanced, diagnostics, about };
      const pageMarkup = Object.entries(pages).map(([key, html]) => `<section class="native-page" id="native-page-${key}" data-page="${key}" role="tabpanel" aria-labelledby="native-tab-${key}" ${key === this.activePage ? "" : "hidden"}>${state.sessionActive ? `<p class="notice" role="status">${e("activeLock")}</p>` : ""}${html}</section>`).join("");
      const appDialog = `<dialog class="dialog" data-dialog="app"><h2>${e("dialogAppTitle")}</h2><p>${e("appPathHelp")}</p><div class="detected">${detected}</div><form data-form="app"><label>${e("path")}<input name="path" placeholder="${e("pathPlaceholder")}" required></label><div class="dialog-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" data-action="close-dialog">${e("cancel")}</button><button>${e("fieldAdd")}</button></div></form></dialog>`;
      const language = root.AudioDuckI18n.LANGUAGE_OPTIONS.map(({ code, labelKey }) => `<option value="${code}" ${settings.language === code ? "selected" : ""}>${e(labelKey)}</option>`).join("");
      this.shadow.innerHTML = `<style>${root.AudioDuckNativeTheme}.dialog{max-width:min(480px,calc(100vw - 32px));padding:22px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--fg)}.dialog::backdrop{background:#0009}.dialog h2{margin:0 0 8px;font-size:16px}.dialog p{color:var(--muted);font-size:13px}.dialog label{display:grid;gap:6px;margin:10px 0}.dialog input{width:100%;background:var(--surface);border:1px solid #555;border-radius:4px;padding:7px 9px;color:var(--fg);font:inherit}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style><div class="backdrop${entrance}"><main class="window" data-focus="panel" aria-label="ChatDuck preferences" tabindex="-1"><header class="titlebar"><strong>ChatDuck</strong><span class="sep">/</span><span>${e("nativePrefs")}</span><small>${this.escape(version)}</small><button class="close" data-close type="button" aria-label="${e("close")}">×</button></header><nav class="tabs" role="tablist" aria-label="${e("settingsSections")}">${tabMarkup}</nav><section class="pane">${pageMarkup}</section><footer class="foot native-footer"><a class="support-link" href="https://ko-fi.com/fevee" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8.2-4.8-9.8-9.7C.8 7.5 3.1 4 7 4c2.1 0 3.8 1.1 5 2.8C13.2 5.1 14.9 4 17 4c3.9 0 6.2 3.5 4.8 7.3C20.2 16.2 12 21 12 21Z"/></svg>${e("support")}</a><label class="language-label" for="native-language"><span class="language-text">${e("language")}</span><select id="native-language" data-language aria-label="${e("language")}">${language}</select></label><button class="done" data-close type="button">${e("close")}</button></footer>${appDialog}</main></div>`;
      for (const [key, open] of detailsState) { const item = this.shadow.querySelector(`details[data-section="${key}"]`); if (item) item.open = open; }
      const pane = this.shadow.querySelector(".pane"); if (pane) pane.scrollTop = scrollTop;
      this.animateNextRender = false;
      const target = focusKey ? [...this.shadow.querySelectorAll("[data-focus]")].find((item) => item.getAttribute("data-focus") === focusKey) : focusIndex >= 0 ? this.shadow.querySelectorAll(focusableSelector)[focusIndex] : null;
      (target && !target.matches?.(":disabled") ? target : this.shadow.querySelector(`.tabs [data-nav="${this.activePage}"]`))?.focus({ preventScroll: true });
    }
    showNativePage(key) {
      const page = this.shadow?.querySelector(`[data-page="${key}"]`);
      if (!page) return false;
      for (const tab of this.shadow.querySelectorAll('[role="tab"][data-nav]')) {
        const selected = tab.dataset.nav === key;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
      for (const item of this.shadow.querySelectorAll(".native-page[data-page]")) item.hidden = item !== page;
      const pane = this.shadow.querySelector(".pane");
      if (pane) pane.scrollTop = 0;
      this.shadow.querySelector(`.tabs [data-nav="${key}"]`)?.focus({ preventScroll: true });
      return true;
    }

    applyPage() {
      if (!this.shadow) return;
      const panel = this.shadow.querySelector(".panel"), main = this.shadow.querySelector("main");
      if (!main || typeof main.querySelectorAll !== "function") return;
      if (panel) panel.dataset.page = this.activePage;
      for (const button of this.shadow.querySelectorAll("[data-nav]")) {
        const selected = button.dataset.nav === this.activePage;
        if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      }
      const sections = [...main.querySelectorAll(":scope > .section")];
      const pageByIndex = ["general", "browser", "diagnostics", "desktop", "about"];
      sections.forEach((section, index) => { section.hidden = pageByIndex[index] !== this.activePage; });
      const advanced = main.querySelector(".advanced");
      if (advanced) {
        advanced.hidden = !["desktop", "advanced"].includes(this.activePage);
        advanced.open = true;
        const groups = advanced.querySelectorAll(":scope .advanced-group");
        if (groups[0]) groups[0].hidden = this.activePage !== "desktop";
        if (groups[1]) groups[1].hidden = this.activePage !== "advanced";
      }
      const title = main.querySelector("[data-page-title]");
      const titleKeys = { general: "general", browser: "webIntegrations", desktop: "windowsApps", advanced: "technicalDetails", diagnostics: "diagnostics", about: "about" };
      if (title) title.textContent = this.t(titleKeys[this.activePage] || "general");
    }

    renderDiagnosticView() {
      if (!this.shadow) return;
      const heading = [...this.shadow.querySelectorAll("main > section.section > h2")].find((item) => item.textContent.trim() === this.t("diagnostics"));
      const section = heading?.parentElement;
      if (!section) return;
      const frameRows = (this.diagnosticState || []).map((frame) => {
        const label = frame.host || this.t("noDiagnosticResponse");
        const players = frame.players.length ? `<details class="diagnostic-players"><summary>${this.e("players")}: ${frame.players.length}</summary>${frame.players.map((player) => {
          const percent = (value) => value == null ? "—" : `${value}%`;
          return `<div class="diagnostic-player"><strong>${this.escape(player.mediaType)} · ${this.escape(player.action)}</strong><span>${this.e("playing")}: ${player.playing ? this.e("diagnosticYes") : this.e("diagnosticNo")}</span><span>${this.e("originalVolumeLabel")}: ${percent(player.originalVolumePercent)}</span><span>${this.e("diagnosticTarget")}: ${percent(player.targetVolumePercent)}</span><span>${this.e("appliedVolume")}: ${percent(player.appliedVolumePercent)}</span><span>${this.e("currentVolumeLabel")}: ${percent(player.currentVolumePercent)}</span><span>${this.escape(player.transitionState || "—")}${player.reason ? ` · ${this.escape(player.reason)}` : ""}</span></div>`;
        }).join("")}</details>` : "";
        const restored = frame.lastRestore ? `${Number(frame.lastRestore.restoredCount) || 0} ${this.e("restoreVerified")}${frame.lastRestore.verified ? "" : ` · ${this.e("diagnosticUnverified")}`}` : "—";
        return `<article class="diagnostic-row"><strong>${this.escape(label)}</strong><span>${this.e("diagnosticStatus")}: ${this.escape(frame.status === "audio-detected-not-controllable" ? this.t("diagnosticAudioUncontrolled") : frame.status)}</span><span>${this.e("mode")}: ${this.escape(frame.effectiveMode)}${frame.targetVolumePercent == null ? "" : ` · ${frame.targetVolumePercent}%`}</span><span>${this.e("dictation")}: ${frame.dictationActive == null ? this.e("diagnosticNA") : frame.dictationActive ? this.e("diagnosticActive") : this.e("diagnosticInactive")}</span><span>${this.e("session")}: ${frame.sessionActive ? frame.sessionReceived ? this.e("diagnosticReceived") : this.e("diagnosticNotReceived") : this.e("diagnosticInactive")}</span><span>${this.e("players")}: ${frame.htmlMediaCount} · ${this.e("playing")}: ${frame.playingCount} · ${this.e("ducked")}: ${frame.controlledCount}</span><span>${this.e("restore")}: ${restored}${frame.excluded ? ` · ${this.e("excluded")}` : ""}</span>${frame.error ? `<span class="diagnostic-error">${this.e("error")}: ${this.escape(frame.error)}</span>` : ""}${players}</article>`;
      }).join("");
      section.innerHTML = `<h2 class="section-title">${this.e("diagnostics")}</h2><p class="subhint">${this.e("diagnosticsPrivacy")}</p><div class="section-actions"><button class="quiet" type="button" data-action="refresh-diagnostics">${this.e("refreshDiagnostics")}</button><button class="quiet" type="button" data-action="copy-diagnostics" ${this.diagnosticState === null ? "disabled" : ""}>${this.e("copyDiagnosticReport")}</button></div><div class="diagnostic-summary" aria-live="polite">${this.diagnosticState === null ? `<p class="empty">${this.e("diagnosticsNotLoaded")}</p>` : frameRows || `<p class="empty">${this.e("noDiagnostics")}</p>`}</div>`;
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
      const filename = app.path ? app.path.split("\\").pop() : "";
      const label = filename ? filename.replace(/\.exe$/i, "") : app.appUserModelIds?.[0] || this.t("windowsApps");
      const detail = app.path || app.appUserModelIds?.join(", ") || "";
      const key = root.AudioDuckCore.playerRuleKeyForWindowsApp(app), identity = app.path || app.appUserModelIds?.[0] || "";
      const detailLabel = app.path ? this.e("pathTooltip", { value: detail }) : this.e("appIdentifierTooltip", { value: detail });
      return `<div class="managed-row windows-app-row"><div class="windows-app-main"><div class="windows-app-heading"><span class="app-copy"><strong>${this.escape(label)}</strong>${detail ? `<details class="path-details" data-section="path-${encodeURIComponent(identity)}"><summary>${this.e("showPath")}</summary><code title="${this.escape(detail)}" aria-label="${detailLabel}">${this.escape(detail)}</code></details>` : ""}</span><div class="app-controls"><label class="switch app-switch"><input type="checkbox" role="switch" data-focus="app:${this.escape(identity)}" aria-label="${this.e("appEnabled", { value: label })}" data-app-enabled="${this.escape(identity)}" ${app.enabled ? "checked" : ""} ${disabled}><span>${this.e(app.enabled ? "nativeOn" : "nativeOff")}</span></label>${this.removeButton("app", identity, label, "removeApp", "removeApplication", disabled)}</div></div>${key ? this.policyControls(key, settings, disabled) : ""}</div></div>`;
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
      const description = [media, count ? `${count} ${this.t(count === 1 ? "audioSession" : "audioSessions")}` : "", capability].filter(Boolean).join(" · ");
      const pathDetails = app.path ? `<details class="path-details"><summary>${this.e("showPath")}</summary><code>${this.escape(app.path)}</code></details>` : "";
      const action = selected ? "updateIdentity" : "add";
      return `<div class="app-card"><span class="row-copy"><strong>${this.escape(display)}</strong><small>${this.escape(description)}</small>${pathDetails}</span>${selected && !needsIdentityUpdate ? `<span class="hint">${this.e("added")}</span>` : `<button class="quiet" data-add-detected="${this.escape(app.path || "")}" data-app-id="${this.escape(app.appUserModelId || "")}" ${disabled}>${this.e(action)}</button>`}</div>`;
    }

    escape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

    async save(next) { await this.saveSettings(next); await this.render(); }

    async change(event) {
      const webControl = event.target.closest?.("[data-web-control]");
      if (webControl) {
        const settings = this.getSettings();
        await this.save({ ...settings, webIntegration: webControl.checked, universalWebControl: webControl.checked });
        return;
      }
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
      const websiteMode = event.target.closest?.("[data-website-mode]");
      if (websiteMode) { const settings = this.getSettings(), domain = websiteMode.dataset.websiteMode; await this.save({ ...settings, websiteOverrides: { ...settings.websiteOverrides, [domain]: { ...settings.websiteOverrides[domain], mode: websiteMode.value } } }); return; }
      const websiteEnabled = event.target.closest?.("[data-website-enabled]");
      if (websiteEnabled) { const settings = this.getSettings(), domain = websiteEnabled.dataset.websiteEnabled; await this.save({ ...settings, websiteOverrides: { ...settings.websiteOverrides, [domain]: { ...settings.websiteOverrides[domain], enabled: websiteEnabled.checked } } }); return; }
      const websiteTarget = event.target.closest?.("[data-website-target]");
      if (websiteTarget) { const settings = this.getSettings(), domain = websiteTarget.dataset.websiteTarget; await this.save({ ...settings, websiteOverrides: { ...settings.websiteOverrides, [domain]: { ...settings.websiteOverrides[domain], targetVolumePercent: Number(websiteTarget.value) } } }); return; }
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
      if (input.dataset.websiteTarget) { const output = input.parentElement.querySelector("output"); if (output) output.value = `${input.value}%`; return; }
      const key = input.dataset.setting, output = this.shadow.querySelector(`[data-fade-label="${key}"]`) || this.shadow.querySelector(".volume output");
      const valueOutput = key === "targetVolumePercent" ? this.shadow.querySelector("[data-target-volume-output]") : null;
      if (valueOutput) valueOutput.value = `${input.value}%`;
      if (output) output.value = key?.includes("fade") ? `${input.value} ms` : `${input.value}%`;
    }

    async click(event) {
      if (event.target === this.shadow.querySelector("[data-backdrop]")) { this.close(); return; }
      if (event.target.closest?.("[data-close]")) { this.close(); return; }
      const nav = event.target.closest?.("[data-nav]");
      if (nav) {
        this.activePage = nav.dataset.nav;
        if (this.activePage === "diagnostics") {
          try { this.diagnosticState = this.normalizeDiagnostics(await this.getDiagnostics()); }
          catch (error) { this.diagnosticState = []; this.onError(error); }
          await this.render();
        } else if (!this.showNativePage(this.activePage)) {
          await this.render();
        }
        return;
      }
      const mode = event.target.closest?.("[data-mode]");
      if (mode) { if (!mode.disabled) await this.save({ ...this.getSettings(), mode: mode.dataset.mode }); return; }
      const action = event.target.closest?.("[data-action]")?.dataset.action;
      if (action === "refresh-diagnostics") {
        try { this.diagnosticState = this.normalizeDiagnostics(await this.getDiagnostics()); }
        catch (error) { this.diagnosticState = []; this.onError(error); }
        await this.render(); return;
      }
      if (action === "copy-diagnostics") {
        if (!Array.isArray(this.diagnosticState)) return;
        const report = this.anonymizedDiagnosticReport();
        try {
          if (typeof GM_setClipboard === "function") GM_setClipboard(report, "text");
          else if (root.navigator?.clipboard?.writeText) await root.navigator.clipboard.writeText(report);
          else throw new Error("Clipboard API unavailable");
          this.lastActionMessage = this.t("copiedReport");
        } catch (error) { this.lastActionMessage = String(error?.message || error).slice(0, 120); this.onError(error); }
        await this.render(); return;
      }
      if (action === "remove-excluded") {
        const domain = event.target.closest?.("[data-domain]")?.dataset.domain;
        if (!domain) return;
        const excludedDomains = [...new Set(this.getSettings().excludedDomains.split(/[\n,;]+/).map((item) => root.AudioDuckCore.normalizePolicyDomain(item)).filter(Boolean))].filter((item) => item !== domain).join("\n");
        await this.save({ ...this.getSettings(), excludedDomains }); return;
      }
      if (action === "exclude-current" || action === "add-website-override") {
        const settings = this.getSettings(), domain = root.AudioDuckCore.normalizePolicyDomain(root.location?.hostname);
        if (!domain || root.AudioDuckCore.isChatGPT(root.location?.href)) return;
        if (action === "exclude-current") {
          const excludedDomains = [...new Set([...settings.excludedDomains.split("\n"), domain])].filter(Boolean).join("\n");
          await this.save({ ...settings, excludedDomains });
        } else if (!settings.websiteOverrides[domain]) {
          await this.save({ ...settings, websiteOverrides: { ...settings.websiteOverrides, [domain]: { enabled: true, mode: "inherit", targetVolumePercent: null } } });
        }
        return;
      }
      if (action === "remove-website-override") {
        const domain = event.target.closest("[data-domain]").dataset.domain, websiteOverrides = { ...this.getSettings().websiteOverrides };
        delete websiteOverrides[domain]; await this.save({ ...this.getSettings(), websiteOverrides }); return;
      }
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
      const tab = event.target.closest?.('[role="tab"][data-nav]');
      if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...this.shadow.querySelectorAll('[role="tab"][data-nav]')];
        const index = tabs.indexOf(tab), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault(); tabs[next]?.click(); return;
      }
      if (event.key !== "Tab" || nested) return;
      const items = [...this.shadow.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex]:not([tabindex=\"-1\"])")].filter((item) => !item.closest("[hidden]") && item.getClientRects().length);
      if (!items.length) { event.preventDefault(); this.shadow.querySelector(".window,.panel")?.focus(); return; }
      const first = items[0], last = items.at(-1), active = this.shadow.activeElement;
      if (event.shiftKey && (active === first || active === this.shadow.querySelector(".window,.panel"))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    async submit(event) {
      const form = event.target.closest?.("form[data-form]"); if (!form) return;
      event.preventDefault(); const status = form.querySelector(".dialog-status,[role=status]"), data = new FormData(form);
      if (form.dataset.form === "exclude-domain") {
        const domain = root.AudioDuckCore.normalizePolicyDomain(data.get("domain"));
        if (!domain) { if (status) status.textContent = this.t("siteInvalid"); return; }
        const settings = this.getSettings(), domains = [...new Set(settings.excludedDomains.split(/[\n,;]+/).map((item) => root.AudioDuckCore.normalizePolicyDomain(item)).filter(Boolean))];
        if (domains.includes(domain)) { if (status) status.textContent = this.t("siteDuplicate"); return; }
        await this.save({ ...settings, excludedDomains: [...domains, domain].join("\n") }); return;
      }
      if (form.dataset.form === "website-override") {
        const domain = root.AudioDuckCore.normalizePolicyDomain(data.get("domain"));
        if (!domain) { if (status) status.textContent = this.t("siteInvalid"); return; }
        const settings = this.getSettings();
        if (settings.websiteOverrides[domain]) { if (status) status.textContent = this.t("siteDuplicate"); return; }
        await this.save({ ...settings, websiteOverrides: { ...settings.websiteOverrides, [domain]: { enabled: true, mode: "inherit", targetVolumePercent: null } } }); return;
      }
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
