const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { STOP_CONFIRMATION_MS } = require("../src/chatgpt-detector.js");

const root = path.join(__dirname, "..");
const modules = ["i18n.js", "core.js", "media-controller.js", "tab-audio-controller.js", "chatgpt-detector.js", "agent-client.js", "settings-page.js", "entry.js"];

test("integrated ChatGPT dictation event ducks unknown-site HTML media and restores it across tabs", async () => {
  const values = new Map([["settings", {
    enabled: true, webIntegration: true, universalWebControl: true, mode: "duck", targetVolumePercent: 10,
    fadeOutMs: 0, fadeInMs: 0, fallbackToPause: false, webAudioMuteFallback: false
  }]]);
  const tabs = new Map();
  const listeners = [];
  let listenerId = 0;
  const observers = new Map();
  const media = new EventTarget();
  Object.assign(media, {
    tagName: "AUDIO", paused: false, ended: false, readyState: 4,
    src: "https://cdn.unknown.invalid/audio.mp3", currentSrc: "https://cdn.unknown.invalid/audio.mp3",
    matches(selector) { return selector === "audio,video"; }
  });
  let volume = 0.8;
  Object.defineProperty(media, "volume", {
    get: () => volume,
    set(value) { volume = Math.max(0, Math.min(1, value)); media.dispatchEvent(new Event("volumechange")); }
  });
  media.pause = () => { media.paused = true; media.dispatchEvent(new Event("pause")); };
  media.play = async () => { media.paused = false; media.dispatchEvent(new Event("play")); };

  const microphone = {
    nodeType: 1, label: "Dictate", pressed: "false", textContent: "",
    hidden: false,
    getAttribute(name) { return name === "aria-label" ? this.label : name === "aria-pressed" ? this.pressed : null; },
    setAttribute(name, value) { if (name === "aria-label") this.label = value; if (name === "aria-pressed") this.pressed = value; },
    matches(selector) { return selector === "button,[role='button']"; },
    getBoundingClientRect() { return { width: 22, height: 22 }; }
  };

  const makeContext = (id, href, chat = false) => {
    const window = new EventTarget();
    window.top = window;
    window.performance = performance;
    const document = new EventTarget();
    const documentElement = { nodeType: 1, children: [], addEventListener() {}, querySelectorAll() { return []; } };
    Object.assign(document, {
      nodeType: 9, documentElement, hidden: false,
      children: chat ? [] : [media],
      querySelectorAll(selector) { return chat && selector === "button,[role='button']" ? [microphone] : []; }
    });
    const tabStore = { audioDuckingId: id };
    tabs.set(id, tabStore);
    const gm = {
      GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
      GM_setValue(key, value) {
        const oldValue = values.get(key);
        values.set(key, value);
        for (const item of listeners) if (item.key === key) queueMicrotask(() => item.callback(key, oldValue, value, item.contextId !== id));
      },
      GM_addValueChangeListener(key, callback) { const entry = { id: ++listenerId, key, callback, contextId: id }; listeners.push(entry); return entry.id; },
      GM_removeValueChangeListener(target) { const index = listeners.findIndex((entry) => entry.id === target); if (index >= 0) listeners.splice(index, 1); },
      GM_getTab(callback) { callback(JSON.parse(JSON.stringify(tabs.get(id) || tabStore))); },
      GM_saveTab(tab, callback) { tabs.set(id, JSON.parse(JSON.stringify(tab))); callback?.(); },
      GM_getTabs(callback) { callback(Object.fromEntries([...tabs].map(([tabId, tab]) => [tabId, JSON.parse(JSON.stringify(tab))]))); },
      GM_registerMenuCommand() { return 1; }, GM_unregisterMenuCommand() {},
      GM_info: { script: { version: "2.8.0-alpha.3" } },
      setTimeout, clearTimeout,
      setInterval: () => 0, clearInterval() {},
      URL, URLSearchParams, TextEncoder, Uint8Array, crypto: webcrypto, performance,
      MutationObserver: class {
        constructor(callback) { this.callback = callback; (observers.get(id) || observers.set(id, []).get(id)).push(this); }
        observe() {}
        disconnect() {}
      },
      window, document, location: new URL(href),
      console, Event, EventTarget, queueMicrotask,
      GM_audio: undefined
    };
    window.MutationObserver = gm.MutationObserver;
    window.location = gm.location;
    window.document = document;
    const context = vm.createContext(gm);
    context.globalThis = context;
    for (const file of modules) vm.runInContext(fs.readFileSync(path.join(root, "src", file), "utf8"), context, { filename: file });
    return { context, document, window };
  };

  const site = makeContext("site-tab", "https://arbitrary-player.invalid/watch/7");
  const chat = makeContext("chat-tab", "https://chatgpt.com/", true);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(observers.get("chat-tab"), JSON.stringify({ errors: values.get("errors"), tabs: [...tabs] }));
  const chatObserver = observers.get("chat-tab")[0];
  microphone.setAttribute("aria-label", "Stop dictation");
  chatObserver.callback([{ type: "attributes", target: microphone, addedNodes: [], removedNodes: [] }]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(media.paused, false);
  assert.equal(volume, 0.1, JSON.stringify({ session: values.get("session"), errors: values.get("errors"), tabs: [...tabs] }));
  const siteFrame = Object.values(tabs.get("site-tab").audioDucking.frames)[0];
  assert.equal(values.get("session").phase, "active");
  assert.equal(siteFrame.duckedCount, 1);

  microphone.setAttribute("aria-label", "Dictate");
  chatObserver.callback([{ type: "attributes", target: microphone, addedNodes: [], removedNodes: [] }]);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 40));
  assert.equal(media.paused, false);
  assert.equal(volume, 0.8);
  const restored = Object.values(tabs.get("site-tab").audioDucking.frames).find((frame) => frame.isTop);
  assert.equal(restored.lastRestore.verified, true);
  assert.equal(restored.lastRestore.restoredCount, 1);
  assert.deepEqual(restored.pendingActions, []);
});
