const test = require("node:test");
const assert = require("node:assert/strict");
const { TabAudioFallback } = require("../src/tab-audio-controller.js");

class FakeTabAudio {
  constructor({ isMuted = false, muteReason = undefined, isAudible = true } = {}) {
    this.state = { isMuted, muteReason, isAudible };
    this.listeners = new Set();
    this.calls = [];
  }
  getState(callback) { const state = { ...this.state }; callback?.(state); return Promise.resolve(state); }
  setMute({ isMuted }, callback) {
    this.calls.push(isMuted);
    this.state = { ...this.state, isMuted, muteReason: isMuted ? "extension" : undefined };
    this.emit({ muted: isMuted ? "extension" : false, audible: this.state.isAudible });
    callback?.();
    return Promise.resolve();
  }
  addStateChangeListener(listener) { this.listeners.add(listener); return Promise.resolve(); }
  removeStateChangeListener(listener) { this.listeners.delete(listener); return Promise.resolve(); }
  userMute(isMuted) {
    this.state = { ...this.state, isMuted, muteReason: isMuted ? "user" : undefined };
    this.emit({ muted: isMuted ? "user" : false, audible: this.state.isAudible });
  }
  emit(event) { for (const listener of this.listeners) listener(event); }
}

function make(audio, { hasMediaOrFrame = () => false, pending = null, log = [] } = {}) {
  const controller = new TabAudioFallback({
    audio, enabled: () => true, hasMediaOrFrame, getPending: () => pending,
    persist: async (value) => { log.push(value); pending = value; },
  });
  return { controller, log, get pending() { return pending; } };
}

test("mutes an audible Web Audio-only tab and restores the extension-owned mute", async () => {
  const audio = new FakeTabAudio();
  const setup = make(audio);
  const { controller, log } = setup;
  await controller.begin("session-web-audio-01");
  assert.equal(audio.state.isMuted, true);
  assert.equal(controller.status().state, "muted-tab-web-audio");
  assert.equal(log[0].appliedMuted, true);
  assert.equal(await controller.restore("session-web-audio-01"), true);
  assert.equal(audio.state.isMuted, false);
  assert.equal(setup.pending, null);
  assert.deepEqual(audio.calls, [true, false]);
});

test("does not override an existing user mute", async () => {
  const audio = new FakeTabAudio({ isMuted: true, muteReason: "user" });
  const { controller, log } = make(audio);
  await controller.begin("session-web-audio-02");
  assert.deepEqual(audio.calls, []);
  assert.equal(await controller.restore("session-web-audio-02"), true);
  assert.deepEqual(audio.calls, []);
  assert.deepEqual(log, []);
});

test("a user unmute and remute during dictation is preserved", async () => {
  const audio = new FakeTabAudio();
  const { controller } = make(audio);
  await controller.begin("session-web-audio-03");
  audio.userMute(false);
  audio.userMute(true);
  assert.equal(await controller.restore("session-web-audio-03"), true);
  assert.equal(audio.state.isMuted, true);
  assert.equal(audio.state.muteReason, "user");
  assert.deepEqual(audio.calls, [true]);
});

test("does not tab-mute when an HTML media element or iframe may own the sound", async () => {
  const audio = new FakeTabAudio();
  const { controller } = make(audio, { hasMediaOrFrame: () => true });
  await controller.begin("session-web-audio-04");
  assert.deepEqual(audio.calls, []);
  await controller.restore("session-web-audio-04");
});

test("a pending snapshot from an interrupted userscript instance restores on the next instance", async () => {
  const audio = new FakeTabAudio({ isMuted: true, muteReason: "extension" });
  const pending = { sessionId: "session-web-audio-05", originalMuted: false, appliedMuted: true, startedAt: Date.now() };
  const setup = make(audio, { pending });
  const { controller } = setup;
  assert.equal(await controller.restore(), true);
  assert.equal(audio.state.isMuted, false);
  assert.equal(setup.pending, null);
});

test("waits for audio to become audible and then applies the fallback", async () => {
  const audio = new FakeTabAudio({ isAudible: false });
  const { controller } = make(audio);
  await controller.begin("session-web-audio-06");
  assert.deepEqual(audio.calls, []);
  audio.state.isAudible = true;
  audio.emit({ audible: true });
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.deepEqual(audio.calls, [true]);
  await controller.restore("session-web-audio-06");
});
