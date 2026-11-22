const test = require("node:test");
const assert = require("node:assert/strict");
const { ChatGPTDetector, STOP_CONFIRMATION_MS } = require("../src/chatgpt-detector.js");

function fixture(buttons = [], voiceMode = false) {
  const observers = [];
  const states = buttons.map((label) => ({ label, pressed: false }));
  const doc = Object.assign(new EventTarget(), {
    documentElement: {},
    querySelectorAll: () => states.map((state) => ({
      nodeType: 1,
      hidden: false,
      matches: () => true,
      closest(selector) { return selector === "#chatgpt-audio-ducking-panel" ? null : this; },
      querySelector: () => null,
      getAttribute: (name) => name === "aria-label" ? state.label : name === "aria-pressed" ? String(state.pressed) : null,
      textContent: "",
      getBoundingClientRect: () => ({ width: 30, height: 30 })
    }))
  });
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
    trigger() {
      const button = doc.querySelectorAll("button")[0];
      if (button) this.callback([{ type: "attributes", target: button, addedNodes: [], removedNodes: [] }]);
      else this.callback([{ type: "childList", target: doc.documentElement, addedNodes: [], removedNodes: [{ nodeType: 1, matches: () => true, closest(selector) { return selector === "#chatgpt-audio-ducking-panel" ? null : this; } }] }]);
    }
  }
  const devices = { getUserMedia: async () => { throw new Error("getUserMedia must remain untouched"); } };
  class Recorder extends EventTarget { start() {} }
  const originalGetUserMedia = devices.getUserMedia;
  const originalRecorderStart = Recorder.prototype.start;
  let permissionQueries = 0;
  const win = Object.assign(new EventTarget(), {
    navigator: { mediaDevices: devices, permissions: { query: () => { permissionQueries++; } } },
    MediaRecorder: Recorder,
    AudioContext: class AudioContext {},
    MutationObserver: Observer
  });
  const originalAudioContext = win.AudioContext;
  const events = { started: [], stopped: [], state: [], errors: [] };
  const detector = new ChatGPTDetector({
    doc, win, getSettings: () => ({ enabled: true, voiceMode }),
    onStart: (value) => events.started.push(value), onStop: (value) => events.stopped.push(value),
    onState: (value) => events.state.push(value), onError: (value) => events.errors.push(value)
  });
  return {
    detector, doc, win, devices, events, observers,
    setButtons(next) {
      states.splice(0, states.length, ...next.map((label) => ({ label, pressed: false })));
      observers.forEach((observer) => observer.trigger());
    },
    setPressed(pressed) { states[0].pressed = pressed; observers.forEach((observer) => observer.trigger()); },
    triggerMutationOnControls() { observers.forEach((observer) => observer.trigger()); },
    assertCaptureApisUnchanged() {
      assert.equal(devices.getUserMedia, originalGetUserMedia);
      assert.equal(Recorder.prototype.start, originalRecorderStart);
      assert.equal(win.AudioContext, originalAudioContext);
      assert.equal(permissionQueries, 0);
    }
  };
}

test("observes dictation start and stop without touching media or permission APIs", async (t) => {
  const f = fixture(["Dictate"]);
  f.detector.start();
  f.assertCaptureApisUnchanged();
  f.setButtons(["Stop dictation"]);
  assert.equal(f.events.started.length, 1);
  assert.equal(f.events.started[0].kind, "dictation");
  f.setButtons(["Dictate"]);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 30));
  assert.equal(f.events.stopped.length, 1);
  assert.equal(f.events.stopped[0].reason, "recording-control-ended");
  assert.ok(f.events.stopped[0].confirmationMs < 200, `stop confirmation took ${f.events.stopped[0].confirmationMs}ms`);
  t.diagnostic(`DOM stop confirmation: ${f.events.stopped[0].confirmationMs.toFixed(1)} ms`);
  f.assertCaptureApisUnchanged();
  f.detector.dispose();
});

test("uses a pressed microphone control as a passive active-state signal", async () => {
  const f = fixture(["Dictate"]);
  f.detector.start();
  f.setPressed(true);
  assert.equal(f.events.started.length, 1);
  f.setPressed(false);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 30));
  assert.equal(f.events.stopped.length, 1);
  f.detector.dispose();
});

test("does not treat voice controls or playback controls as dictation by default", () => {
  const f = fixture(["Mute microphone", "End voice conversation", "Stop playback"]);
  f.detector.start();
  assert.equal(f.events.started.length, 0);
  f.detector.dispose();
});

test("recognizes voice UI only when voice mode is enabled", async () => {
  const f = fixture([], true);
  f.detector.start();
  f.setButtons(["Mute microphone", "End voice conversation"]);
  assert.equal(f.events.started[0].kind, "voice");
  f.setButtons([]);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 30));
  assert.equal(f.events.stopped.length, 1);
  f.detector.dispose();
});

test("repeated page mutations do not restart the 32 ms stop confirmation", async () => {
  const f = fixture(["Dictate"]);
  f.detector.start();
  f.setButtons(["Stop dictation"]);
  f.setButtons(["Dictate"]);
  const startedAt = performance.now();
  const churn = setInterval(() => f.detector.safeEvaluate("unrelated-page-churn"), 8);
  await new Promise((resolve) => setTimeout(resolve, 120));
  clearInterval(churn);
  assert.equal(f.events.stopped.length, 1);
  assert.ok(performance.now() - startedAt < 200);
  f.detector.dispose();
});

test("a new recording cancels a pending restore confirmation", async () => {
  const f = fixture(["Dictate"]);
  f.detector.start();
  f.setButtons(["Stop dictation"]);
  f.setButtons(["Dictate"]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  f.setButtons(["Stop dictation"]);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 30));
  assert.equal(f.events.started.length, 1);
  assert.equal(f.events.stopped.length, 0);
  f.setButtons(["Dictate"]);
  await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_MS + 30));
  assert.equal(f.events.stopped.length, 1);
  f.detector.dispose();
});
