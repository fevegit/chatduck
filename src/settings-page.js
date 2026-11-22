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
        if (candidate.protocol === "https:" && candidate.hostname === "github.com" && /\/releases\/download\/v[A-Za-z0-9.-]+\/ChatDuck-Windows-Agent-[A-Za-z0-9.-]+-x64\.msi$/.test(candidate.pathname)) installUrl = candidate.href;
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
        <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></span><div><h1 id="settings-title">${this.e("brand")} <span class="version">2.7.5-alpha.1</span></h1><p id="settings-tagline">${this.e("tagline")}</p></div></div><button class="quiet icon-button" data-close aria-label="${this.e("close")}" title="${this.e("close")}" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <main>${state.sessionActive ? `<p class="lock-note" role="status">${this.e("activeLock")}</p>` : ""}
          <section class="section"><h2 class="section-title">${this.e("general")}</h2>${row("enabled", "enabled", "enabledHint")}<p class="section-title">${this.e("whenDictating")}</p><div class="segments" role="group" aria-label="${this.e("whenDictating")}"><button class="segment" data-focus="mode:pause" data-mode="pause" aria-pressed="${settings.mode === "pause"}" ${disabled}>${this.e("pause")}</button><button class="segment" data-focus="mode:duck" data-mode="duck" aria-pressed="${settings.mode === "duck"}" ${disabled}>${this.e("duck")}</button></div>${settings.mode === "duck" ? `<label class="volume"><span class="volume-head"><span>${this.e("targetVolume")}</span><output for="target-volume">${settings.targetVolumePercent}%</output></span><input id="target-volume" data-focus="setting:targetVolumePercent" aria-label="${this.e("targetVolume")}" type="range" min="0" max="100" step="1" data-setting="targetVolumePercent" value="${settings.targetVolumePercent}" ${disabled}><span class="range-labels"><span>${this.e("minimum")}</span><span>${this.e("maximum")}</span></span></label>` : ""}</section>
          <section class="section"><h2 class="section-title">${this.e("webIntegrations")}</h2>${row("webIntegration", "webPlayers", "webPlayersHint")}<details data-section="web" open><summary>${this.e("supportedSites")}</summary><div class="details-body">${webRow("youtube", "youtube", settings.webPlatforms.youtube)}${webRow("youtubeMusic", "youtubeMusic", settings.webPlatforms.youtubeMusic)}${webRow("spotifyWeb", "spotifyWeb", settings.webPlatforms.spotifyWeb)}${webRow("twitch", "twitch", settings.webPlatforms.twitch)}${webRow("plexWeb", "plexWeb", settings.webPlatforms.plexWeb)}
            <details data-section="plex-origins"><summary>${this.e("plexServers")}</summary><div class="details-body">${plexOrigins}<div class="section-actions"><button class="quiet" data-action="add-plex-origin" ${disabled}>${this.e("addPlexOrigin")}</button></div><details data-section="plex-help"><summary>${this.e("permissionDetails")}</summary><p class="subhint">${this.e("plexHostHelp")}</p></details></div></details>
            ${webRow("otherCompatible", "otherSites", settings.webPlatforms.otherCompatible)}<p class="subhint">${this.e("customShortHelp")}</p><details data-section="custom-help"><summary>${this.e("permissionDetails")}</summary><p class="subhint">${this.e("customPermissionHelp")}</p></details><div class="section-actions"><button class="quiet" data-action="add-site" ${disabled}>${this.e("addSite")}</button>${settings.customSites.length ? `<button class="quiet" data-agent-control data-action="prepare-sites" ${disabled} ${state.agent?.ok ? "" : "disabled"}>${this.e("authorizeSites")}</button>` : ""}</div>${customSites}
          </div></details></section>
          <section class="section"><h2 class="section-title">${this.e("windowsApps")}</h2><div class="managed-row"><div class="player-row">${row("spotifyDesktop", "spotifyDesktop", "windowsMedia")}${this.policyControls("spotifyDesktop", settings, disabled)}</div></div><details data-section="apps" open><summary>${this.e("windowsApps")}</summary><div class="details-body"><p class="agent-status" role="status"><span class="status-dot" data-status-dot data-ok="${Boolean(state.agent?.ok)}" aria-hidden="true"></span><span data-agent-status>${agentStatus}</span></p>${windowsApps || `<p class="empty">${this.e("noOtherApps")}</p>`}<div class="section-actions"><button class="quiet" data-agent-control data-action="add-app" ${disabled} ${state.agent?.ok ? "" : "disabled"}>${this.e("addApp")}</button><button class="quiet" data-agent-control data-action="refresh-apps" ${state.agent?.ok ? "" : "disabled"}>${this.e("refreshApps")}</button></div>${showInstallAgent ? `<p class="agent-note">${this.e("agentInstallHint")}</p><div class="section-actions"><a class="quiet install-agent" href="${this.escape(installUrl)}" target="_blank" rel="noopener noreferrer">${this.e("installWindowsAgent")}</a></div>` : ""}${state.agent?.ok ? `<label class="row"><span class="row-copy"><strong>${this.e("agentStartup")}</strong><small>${this.e("agentStartupHint")}</small></span><input type="checkbox" role="switch" data-agent-control data-agent-autostart ${state.agent.autostartEnabled ? "checked" : ""} ${state.sessionActive ? "disabled" : ""}><span class="switch-ui" aria-hidden="true"></span></label>` : ""}</div></details></section>
          <details class="section advanced" data-section="advanced"><summary>${this.e("advanced")}</summary><div class="details-body">${row("voiceMode", "voiceMode", "voiceModeHint")}<label class="field">${this.e("excludedDomains")}<textarea data-focus="setting:excludedDomains" data-setting="excludedDomains" placeholder="${this.e("excludedPlaceholder")}" ${disabled}>${this.escape(settings.excludedDomains)}</textarea></label><h2 class="section-title">${this.e("transitions")}</h2><p class="subhint">${this.e("transitionHint")}</p><div class="advanced-fields"><label>${this.e("fadeOut")}<input data-focus="setting:fadeOutMs" type="range" min="0" max="1000" step="25" data-setting="fadeOutMs" value="${settings.fadeOutMs}" ${disabled}><output data-fade-label="fadeOutMs">${settings.fadeOutMs} ms</output></label><label>${this.e("fadeIn")}<input data-focus="setting:fadeInMs" type="range" min="0" max="1500" step="25" data-setting="fadeInMs" value="${settings.fadeInMs}" ${disabled}><output data-fade-label="fadeInMs">${settings.fadeInMs} ms</output></label></div></div></details>
          <details class="section" data-section="about"><summary>${this.e("about")}</summary><div class="details-body"><p class="about-copy"><strong>ChatDuck 2.7.5-alpha.1</strong> · ${this.e("aboutText")}</p><details data-section="technical-info"><summary>${this.e("technicalDetails")}</summary><p class="subhint">${this.e("agentOptional")}</p></details></div></details>
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
