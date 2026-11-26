const test = require("node:test");
const assert = require("node:assert/strict");
const { MediaController, fingerprint, collectMediaElements } = require("../src/media-controller.js");

class FakeMedia extends EventTarget {
  constructor(src, { paused = false, volume = 0.8, acceptsVolume = true, playDelay = 0, trace = null } = {}) {
    super();
    this.tagName = "VIDEO";
    this.paused = paused;
    this.ended = false;
    this.readyState = 0;
    this.src = src;
    this.currentSrc = src;
    this.acceptsVolume = acceptsVolume;
    this.playDelay = playDelay;
    this.trace = trace;
    this._volume = volume;
    this._muted = false;
    Object.defineProperty(this, "muted", {
      configurable: true,
      get: () => this._muted,
      set: (value) => {
        this._muted = Boolean(value);
        this.trace?.push({ at: performance.now(), kind: "write", target: "muted", value: this._muted });
        this.dispatchEvent(new Event("volumechange"));
      }
    });
    Object.defineProperty(this, "volume", {
      configurable: true,
      get: () => this._volume,
      set: (value) => {
        if (!this.acceptsVolume) return;
        this._volume = Math.max(0, Math.min(1, value));
        this.trace?.push({ at: performance.now(), kind: "write", target: "element.volume", value: this._volume });
        this.dispatchEvent(new Event("volumechange"));
      }
    });
  }
  dispatchEvent(event) {
    this.trace?.push({ at: performance.now(), kind: "media-event", name: event.type, volume: this._volume, muted: this._muted });
    return super.dispatchEvent(event);
  }
  pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  play() {
    this.paused = false;
    this.playStartedAt = performance.now();
    this.dispatchEvent(new Event("play"));
    return new Promise((resolve) => setTimeout(resolve, this.playDelay));
  }
  setVolume(value) { this.volume = value; }
}

const settings = (mode = "pause", overrides = {}) => ({
  mode, targetVolumePercent: 10,
  fadeOutMs: 0, fadeInMs: 0,
  fallbackDucking: true, fallbackToPause: false, ...overrides
});
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
const makeController = (elements, mode = "pause", overrides = {}) => new MediaController({
  getElements: () => elements,
  locationHref: () => "https://media.example/watch/1",
  tabId: "tab-1",
  getSettings: () => settings(mode, overrides)
});

test("pauses active media and restores only the pause it owns", async () => {
  const first = new FakeMedia("https://media.example/a.mp4");
  const alreadyPaused = new FakeMedia("https://media.example/b.mp4", { paused: true });
  const controller = makeController([first, alreadyPaused]);
  await controller.begin({ id: "session-12345678" });
  assert.equal(controller.sessionId, "session-12345678");
  assert.equal(first.paused, true);
  assert.equal(alreadyPaused.paused, true);
  assert.equal(controller.status().touchedCount, 1);
  await controller.restore("session-12345678");
  assert.equal(first.paused, false);
  assert.equal(alreadyPaused.paused, true);
});

test("reports detected media action and verified restoration state", async () => {
  const media = new FakeMedia("https://cdn.example/video.mp4", { volume: 0.8 });
  const controller = makeController([media], "duck");
  await controller.begin({ id: "session-diagnostics-123" });
  assert.deepEqual(controller.diagnostics(), [{
    id: "tab-1:1", mediaType: "video", origin: "https://cdn.example", action: "duck", playing: true,
    paused: false, ended: false, readyState: 0, originalVolumePercent: 80, targetVolumePercent: 10,
    appliedVolumePercent: 10, currentVolumePercent: 10, transitionState: "ducked", manualOverride: false,
    fallbackUsed: false, reason: ""
  }]);
  await controller.restore();
  closeTo(media.volume, 0.8);
  assert.deepEqual(controller.diagnostics(), []);
});

test("on-demand diagnostics include detected but uncontrolled media without inventing an action", async () => {
  const playing = new FakeMedia("https://cdn.example/live.mp3", { volume: 0.65 });
  const idle = new FakeMedia("https://cdn.example/idle.mp3", { paused: true, volume: 0.4 });
  const controller = makeController([], "duck");
  assert.deepEqual(controller.diagnostics([playing, idle]).map(({ action, reason, playing: isPlaying, currentVolumePercent }) => ({ action, reason, playing: isPlaying, currentVolumePercent })), [
    { action: "detected", reason: "not-controlled", playing: true, currentVolumePercent: 65 },
    { action: "detected", reason: "not-playing", playing: false, currentVolumePercent: 40 }
  ]);
});

test("unknown domains inherit Ducking and keep media playing through restore", async () => {
  const core = require("../src/core.js");
  const settings = core.normalizeSettings({});
  const href = "https://arbitrary-player.invalid/watch/42";
  assert.equal(core.shouldManageWeb(href, settings), true);
  const effective = core.resolveWebsiteOverride(settings, href);
  assert.equal(effective.mode, "duck");
  const media = new FakeMedia("https://cdn.invalid/a.mp3", { volume: 0.8 });
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => href, tabId: "unknown-site",
    getSettings: () => settings
  });
  await controller.begin({ id: "unknown-domain-session", settings: effective });
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.1);
  assert.equal(controller.diagnostics()[0].action, "duck");
  const restored = await controller.restore("unknown-domain-session");
  assert.deepEqual(restored, ["unknown-site:1"]);
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.8);
});

test("collects HTML media from the document and open shadow roots", () => {
  const media = { matches: (selector) => selector === "audio,video", lastElementChild: null, previousElementSibling: null };
  const shadowMedia = { matches: (selector) => selector === "audio,video", lastElementChild: null, previousElementSibling: null };
  const shadowRoot = { nodeType: 11, children: [shadowMedia] };
  const host = { shadowRoot, lastElementChild: media, previousElementSibling: null, matches: () => false };
  const doc = { nodeType: 9, children: [host] };
  const collected = collectMediaElements(doc);
  assert.equal(collected.length, 2);
  assert.ok(collected.includes(media) && collected.includes(shadowMedia));
});

test("independent media controllers duck and restore across 100 simulated tabs", async () => {
  const count = 100;
  const pages = Array.from({ length: count }, (_, index) => {
    const media = new FakeMedia(`https://media-${index}.example/audio.mp3`, { volume: 0.8 });
    const controller = new MediaController({
      getElements: () => [media], locationHref: () => `https://media-${index}.example/`,
      tabId: `tab-${index}`, getSettings: () => settings("duck")
    });
    return { media, controller };
  });
  const startedAt = performance.now();
  await Promise.all(pages.map(({ controller }, index) => controller.begin({ id: `session-many-tabs-${index}` })));
  assert.ok(pages.every(({ media }) => media.volume === 0.1));
  await Promise.all(pages.map(({ controller }) => controller.restore()));
  assert.ok(pages.every(({ media }) => media.volume === 0.8));
  console.log(`ℹ ${count} simulated tabs ducked and restored in ${(performance.now() - startedAt).toFixed(1)} ms`);
});

test("pause mode fades to zero before pausing and resumes at zero before fading back", async () => {
  const media = new FakeMedia("https://media.example/pause-fade.mp3", { volume: 0.8 });
  const writes = [];
  let volume = 0.8;
  Object.defineProperty(media, "volume", {
    get: () => volume,
    set: (value) => { volume = Math.max(0, Math.min(1, value)); writes.push({ at: performance.now(), value: volume, paused: media.paused }); media.dispatchEvent(new Event("volumechange")); }
  });
  let pausedAt = 0;
  let volumeAtPlay = null;
  media.addEventListener("pause", () => { if (!pausedAt) pausedAt = performance.now(); });
  media.addEventListener("play", () => { volumeAtPlay = media.volume; });
  const controller = makeController([media], "pause", { fadeOutMs: 200, fadeInMs: 350 });
  const start = performance.now();
  await controller.begin({ id: "session-pause-fade-123" });
  assert.equal(media.paused, true);
  closeTo(media.volume, 0);
  assert.ok(pausedAt - start >= 160 && pausedAt - start < 700, `pause occurred after ${pausedAt - start}ms`);
  assert.ok(writes.length >= 5, `expected interpolated pause writes, got ${writes.length}`);
  assert.ok(writes.every((item, index) => index === 0 || item.value <= writes[index - 1].value + 0.001));

  const restoreStart = performance.now();
  await controller.restore();
  const restoreElapsed = performance.now() - restoreStart;
  closeTo(media.volume, 0.8);
  assert.equal(media.paused, false);
  assert.ok(media.playStartedAt >= restoreStart);
  closeTo(volumeAtPlay, 0);
  assert.ok(restoreElapsed >= 300 && restoreElapsed < 900, `fade-in duration ${restoreElapsed}ms`);
});

test("manual pause during pause fade cancels the operation and keeps the original level", async () => {
  const media = new FakeMedia("https://media.example/manual-pause.mp3", { volume: 0.8 });
  const controller = makeController([media], "pause", { fadeOutMs: 350 });
  const begin = controller.begin({ id: "session-manual-pause-fade-123" });
  await new Promise((resolve) => setTimeout(resolve, 75));
  media.pause();
  await begin;
  closeTo(media.volume, 0.8);
  await controller.restore();
  assert.equal(media.paused, true);
});

test("manual volume while paused becomes the fade-in target", async () => {
  const media = new FakeMedia("https://media.example/manual-volume-paused.mp3", { volume: 0.8 });
  const controller = makeController([media], "pause");
  await controller.begin({ id: "session-manual-volume-paused-123" });
  media.setVolume(0.35);
  await controller.restore();
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.35);
});

test("stopping during pause fade restores the playing media volume", async () => {
  const media = new FakeMedia("https://media.example/interrupted-pause.mp3", { volume: 0.8 });
  const controller = makeController([media], "pause", { fadeOutMs: 350, fadeInMs: 0 });
  const begin = controller.begin({ id: "session-interrupt-pause-123" });
  await new Promise((resolve) => setTimeout(resolve, 75));
  await controller.restore();
  await begin;
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.8);
});

test("preserves a manual play during an automatic pause", async () => {
  const media = new FakeMedia("https://media.example/a.mp4");
  const controller = makeController([media]);
  await controller.begin({ id: "session-manual-123" });
  await media.play();
  await controller.restore();
  assert.equal(media.paused, false);
});

test("fixed target never raises a quiet player and restores the original volume", async () => {
  const loud = new FakeMedia("https://media.example/a.mp4", { volume: 0.8 });
  const quiet = new FakeMedia("https://media.example/b.mp4", { volume: 0.05 });
  const controller = makeController([loud, quiet], "duck", { targetVolumePercent: 10 });
  await controller.begin({ id: "session-fixed-123" });
  closeTo(loud.volume, 0.1);
  closeTo(quiet.volume, 0.05);
  assert.equal(controller.status().duckedCount, 1);
  assert.equal(controller.status().unchangedCount, 1);
  await controller.restore();
  closeTo(loud.volume, 0.8);
  closeTo(quiet.volume, 0.05);
});

test("fixed target keeps the lower value and restores a manual level", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { volume: 0.8 });
  const controller = makeController([media], "duck", { targetVolumePercent: 10 });
  await controller.begin({ id: "session-fixed-manual-123" });
  closeTo(media.volume, 0.1);
  media.setVolume(0.5);
  closeTo(media.volume, 0.1);
  await controller.restore();
  closeTo(media.volume, 0.5);
});

test("applies the settings snapshot captured when the dictation session starts", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { volume: 0.8 });
  const controller = makeController([media], "pause");
  await controller.begin({
    id: "session-settings-snapshot-123",
    settings: settings("duck", { targetVolumePercent: 20 })
  });
  closeTo(media.volume, 0.2);
  assert.equal(media.paused, false);
  await controller.restore();
  closeTo(media.volume, 0.8);
});

test("keeps a manual fixed-target adjustment as the restoration value", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { volume: 0.8 });
  const controller = makeController([media], "duck", { targetVolumePercent: 10 });
  await controller.begin({ id: "session-manual-volume-123" });
  media.setVolume(0.6);
  closeTo(media.volume, 0.1);
  await controller.restore();
  closeTo(media.volume, 0.6);
});

test("falls back to pausing when an element rejects ducking and reports it", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { acceptsVolume: false });
  const errors = [];
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => "https://media.example/watch/1", tabId: "tab-1",
    getSettings: () => settings("duck", { fallbackToPause: true }), onError: (error) => errors.push(error)
  });
  await controller.begin({ id: "session-fallback-123" });
  assert.equal(media.paused, true);
  assert.equal(controller.status().fallbackPausedCount, 1);
  assert.match(errors[0], /pausado como alternativa/);
  await controller.restore();
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.8);
});

test("reports unsupported ducking when pause fallback is disabled", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { acceptsVolume: false });
  const controller = makeController([media], "duck", { fallbackToPause: false });
  await controller.begin({ id: "session-unsupported-123" });
  assert.equal(media.paused, false);
  assert.equal(controller.status().unsupportedCount, 1);
  assert.equal(controller.status().duckedCount, 0);
  closeTo(media.volume, 0.8);
  await controller.restore();
});

test("Ducking never pauses an unsupported player unless Pause fallback is explicitly enabled", async () => {
  const media = new FakeMedia("https://media.example/a.mp4", { acceptsVolume: false });
  const controller = makeController([media], "duck");
  await controller.begin({ id: "session-no-implicit-pause-123" });
  assert.equal(media.paused, false);
  assert.equal(controller.status().fallbackPausedCount, 0);
  await controller.restore();
  assert.equal(media.paused, false);
});

test("handles multiple players concurrently when restoring", async (t) => {
  const elements = Array.from({ length: 6 }, (_, index) => new FakeMedia(`https://media.example/${index}.mp4`, { playDelay: 40 }));
  const controller = makeController(elements);
  await controller.begin({ id: "session-many-players-123" });
  const restored = await controller.restore();
  assert.equal(restored.length, elements.length);
  const starts = elements.map((media) => media.playStartedAt);
  const spreadMs = Math.max(...starts) - Math.min(...starts);
  assert.ok(spreadMs < 15, "play() calls should start together");
  t.diagnostic(`6 player play() dispatch spread: ${spreadMs.toFixed(1)} ms`);
  assert.ok(elements.every((media) => !media.paused));
});

test("handles a second player added during the same session", async () => {
  const first = new FakeMedia("https://media.example/a.mp4");
  const elements = [first];
  const controller = makeController(elements);
  const session = { id: "session-dynamic-123" };
  await controller.begin(session);
  const second = new FakeMedia("https://media.example/b.mp4");
  elements.push(second);
  await controller.begin(session);
  assert.equal(first.paused, true);
  assert.equal(second.paused, true);
  assert.equal(controller.status().touchedCount, 2);
  await controller.restore();
  assert.equal(first.paused, false);
  assert.equal(second.paused, false);
});

test("restores pending actions from current and legacy hashed fingerprints", async () => {
  const page = "https://media.example/watch/1";
  const src = "https://media.example/a.mp4";
  const current = new FakeMedia(src, { paused: true });
  const legacy = new FakeMedia("https://media.example/b.mp4", { paused: true });
  const controller = makeController([current, legacy]);
  const actions = [
    { id: "current", mediaType: "video", sourceFingerprint: "https://media.example/watch/1|https://media.example/a.mp4", mode: "pause", wasPlaying: true, ownsPause: true, manualOverride: false },
    { id: "legacy", mediaType: "video", sourceFingerprint: await fingerprint(page, legacy.currentSrc), mode: "pause", wasPlaying: true, ownsPause: true, manualOverride: false }
  ];
  const restored = await controller.restorePending(actions);
  assert.equal(restored.length, 2);
  assert.equal(current.paused, false);
  assert.equal(legacy.paused, false);
});

test("ignores obsolete sessions but restores ducking after a source change", async () => {
  const media = new FakeMedia("https://media.example/a.mp4");
  const controller = makeController([media], "duck");
  await controller.begin({ id: "session-source-123" });
  await controller.restore("another-session-123");
  closeTo(media.volume, 0.1);
  media.currentSrc = "https://media.example/b.mp4";
  media.setVolume(0.6);
  closeTo(media.volume, 0.1);
  await controller.restore();
  closeTo(media.volume, 0.6);
});

test("a fast consecutive session restores then applies the new mode once", async () => {
  const media = new FakeMedia("https://media.example/a.mp4");
  let mode = "pause";
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => "https://media.example/watch/1", tabId: "tab-1",
    getSettings: () => settings(mode)
  });
  await controller.begin({ id: "session-first-123" });
  assert.equal(media.paused, true);
  mode = "duck";
  await controller.begin({ id: "session-second-123" });
  assert.equal(media.paused, false);
  closeTo(media.volume, 0.1);
  assert.equal(controller.status().touchedCount, 1);
  await controller.restore("session-second-123");
  closeTo(media.volume, 0.8);
});

test("YouTube ducking uses the player volume API and keeps its UI volume synchronized", async () => {
  const media = new FakeMedia("blob:https://www.youtube.com/stream", { volume: 1 });
  let playerVolume = 100;
  media.ownerDocument = { getElementById: (id) => id === "movie_player" ? {
    getVolume: () => playerVolume,
    setVolume: (value) => { playerVolume = value; media._volume = value / 100; media.dispatchEvent(new Event("volumechange")); }
  } : null };
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => "https://www.youtube.com/watch?v=abc", tabId: "yt-tab",
    getSettings: () => settings("duck", { targetVolumePercent: 25 })
  });
  await controller.begin({ id: "session-youtube-api-123" });
  assert.equal(playerVolume, 25);
  closeTo(media.volume, 0.25);
  await controller.restore();
  assert.equal(playerVolume, 100);
  closeTo(media.volume, 1);
});

test("YouTube fade skips writes that round to the current player volume", async () => {
  const media = new FakeMedia("blob:https://www.youtube.com/stream", { volume: 1 });
  let playerVolume = 100;
  let writes = 0;
  media.ownerDocument = { getElementById: (id) => id === "movie_player" ? {
    getVolume: () => playerVolume,
    setVolume: (value) => { writes++; playerVolume = value; media._volume = value / 100; media.dispatchEvent(new Event("volumechange")); }
  } : null };
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => "https://www.youtube.com/watch?v=quantized", tabId: "yt-quantized",
    getSettings: () => settings("duck", { targetVolumePercent: 99, fadeOutMs: 200 })
  });
  await controller.begin({ id: "session-youtube-quantized-123" });
  assert.equal(playerVolume, 99);
  assert.ok(writes <= 2, `expected at most one meaningful and one exact write, got ${writes}`);
  await controller.restore();
  assert.equal(playerVolume, 100);
});

function tracedYouTubeMedia(trace, pageHref = "https://www.youtube.com/watch?v=trace") {
  const media = new FakeMedia("blob:https://www.youtube.com/stream", { volume: 1, trace });
  let playerVolume = 100;
  media.ownerDocument = { getElementById: (id) => id === "movie_player" ? {
    getVolume: () => playerVolume,
    setVolume: (value) => {
      playerVolume = value;
      media._volume = value / 100;
      trace.push({ at: performance.now(), kind: "write", target: "player.setVolume", value });
      media.dispatchEvent(new Event("volumechange"));
    }
  } : null };
  return { media, getPlayerVolume: () => playerVolume, pageHref };
}

test("adopts pending duck state without a premature volume restoration", async (t) => {
  const trace = [];
  const { media, getPlayerVolume, pageHref } = tracedYouTubeMedia(trace);
  const actions = [{ id: "previous-controller", mediaType: "video", sourceFingerprint: `${pageHref}|`, mode: "duck",
    wasPlaying: true, originalVolume: 1, appliedVolume: 0.25, manualOverride: false, sessionId: "session-old-123456" }];
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => pageHref, tabId: "trace-tab",
    getSettings: () => settings("duck", { targetVolumePercent: 10, fadeOutMs: 0, fadeInMs: 0 }),
    onChange: (state) => trace.push({ at: performance.now(), kind: "controller", state: state.sessionId, duckedCount: state.duckedCount })
  });
  const nativeTransition = controller.transition.bind(controller);
  controller.transition = (record, target, duration) => {
    const from = Number.isFinite(record.appliedVolume) ? record.appliedVolume : controller.readVolume(record.element);
    trace.push({ at: performance.now(), kind: "transition", state: target < from ? "fade-down" : "fade-up", from, target, duration });
    return nativeTransition(record, target, duration);
  };
  await controller.begin({ id: "session-new-123456" }, actions);
  const record = controller.records.values().next().value;
  t.diagnostic(JSON.stringify(trace));
  assert.equal(record.originalVolume, 1, "the new controller must retain the saved restoration value");
  assert.equal(getPlayerVolume(), 10);
  assert.equal(trace.some((item) => item.kind === "write" && item.target === "player.setVolume" && item.value === 100), false);
  assert.equal(trace.some((item) => item.kind === "write" && item.target === "muted"), false);
  assert.equal(trace.some((item) => item.kind === "media-event" && ["pause", "play"].includes(item.name)), false);
  await controller.restore();
  assert.equal(getPlayerVolume(), 100);
});

test("chronological YouTube trace stays monotonic and never toggles muted or playback", async (t) => {
  const trace = [];
  const { media, getPlayerVolume, pageHref } = tracedYouTubeMedia(trace, "https://www.youtube.com/watch?v=monotonic");
  const controller = new MediaController({
    getElements: () => [media], locationHref: () => pageHref, tabId: "trace-monotonic",
    getSettings: () => settings("duck", { targetVolumePercent: 10, fadeOutMs: 200, fadeInMs: 350 }),
    onChange: (state) => trace.push({ at: performance.now(), kind: "controller", state: state.sessionId, duckedCount: state.duckedCount })
  });
  const nativeTransition = controller.transition.bind(controller);
  controller.transition = (record, target, duration) => {
    const from = Number.isFinite(record.appliedVolume) ? record.appliedVolume : controller.readVolume(record.element);
    trace.push({ at: performance.now(), kind: "transition", state: target < from ? "fade-down" : "fade-up", from, target, duration });
    return nativeTransition(record, target, duration);
  };
  await controller.begin({ id: "session-monotonic-123" });
  const downward = trace.filter((item) => item.kind === "write" && item.target === "player.setVolume").map((item) => item.value);
  assert.ok(downward.length >= 5, `expected a sequence of volume writes, got ${downward.length}`);
  assert.ok(downward.every((value, index) => index === 0 || value <= downward[index - 1]), `fade-down oscillated: ${downward}`);
  const writesBeforeDuplicateStart = trace.filter((item) => item.kind === "write").length;
  await controller.begin({ id: "session-monotonic-123" });
  assert.equal(trace.filter((item) => item.kind === "write").length, writesBeforeDuplicateStart, "duplicate start must not add a second controller or fade");
  const restoreStart = trace.length;
  await controller.restore();
  const upward = trace.slice(restoreStart).filter((item) => item.kind === "write" && item.target === "player.setVolume").map((item) => item.value);
  assert.ok(upward.length >= 5, `expected a restoration sequence, got ${upward.length}`);
  assert.ok(upward.every((value, index) => index === 0 || value >= upward[index - 1]), `fade-up oscillated: ${upward}`);
  assert.equal(getPlayerVolume(), 100);
  assert.equal(trace.some((item) => item.kind === "write" && item.target === "muted"), false);
  assert.equal(trace.some((item) => item.kind === "write" && item.target === "element.volume"), false, "YouTube API is the sole volume writer for this player");
  assert.equal(trace.some((item) => item.kind === "media-event" && ["pause", "play"].includes(item.name)), false);
  assert.equal(controller.snapshot().length, 0, "restoration should leave no owned media records");
  assert.deepEqual(trace.filter((item) => item.kind === "transition").map((item) => item.state), ["fade-down", "fade-up"],
    "self-generated volumechange events and duplicate dictation edges must not create extra transitions");
  const writesAfterRestore = trace.filter((item) => item.kind === "write").length;
  await controller.restore();
  assert.equal(trace.filter((item) => item.kind === "write").length, writesAfterRestore, "duplicate end must be idempotent");
  assert.equal(trace.every((item, index) => index === 0 || item.at >= trace[index - 1].at), true);
  t.diagnostic(JSON.stringify(trace));
});

test("fades ducking and restoration with monotonic timers", async () => {
  const media = new FakeMedia("https://media.example/fade.mp3", { volume: 0.8 });
  const writes = [];
  let volume = 0.8;
  Object.defineProperty(media, "volume", {
    get: () => volume,
    set: (value) => { volume = Math.max(0, Math.min(1, value)); writes.push({ at: performance.now(), value: volume }); media.dispatchEvent(new Event("volumechange")); }
  });
  const controller = makeController([media], "duck", { targetVolumePercent: 10, fadeOutMs: 200, fadeInMs: 350 });
  const fadeStarted = performance.now();
  await controller.begin({ id: "session-fade-123456" });
  const fadeOutElapsed = performance.now() - fadeStarted;
  assert.ok(writes.length >= 5, `expected interpolated writes, got ${writes.length}`);
  assert.ok(fadeOutElapsed >= 160 && fadeOutElapsed < 700, `fade-out duration ${fadeOutElapsed}ms`);
  assert.ok(writes.every((item, index) => index === 0 || item.value <= writes[index - 1].value + 0.001));
  const restoreStarted = performance.now();
  await controller.restore();
  const fadeInElapsed = performance.now() - restoreStarted;
  closeTo(media.volume, 0.8);
  assert.ok(fadeInElapsed >= 300 && fadeInElapsed < 900, `fade-in duration ${fadeInElapsed}ms`);
});

test("a queued callback from a cancelled fade cannot stop its replacement", async () => {
  const media = new FakeMedia("https://media.example/replaced-fade.mp3", { volume: 0.8 });
  const controller = makeController([media], "duck");
  const nativeSetInterval = global.setInterval;
  const nativeClearInterval = global.clearInterval;
  const callbacks = new Map();
  let nextTimerId = 0;
  global.setInterval = (callback) => { const id = ++nextTimerId; callbacks.set(id, callback); return id; };
  global.clearInterval = () => {};
  try {
    const record = { element: media, mode: "duck", originalVolume: 0.8, appliedVolume: 0.8, applyingVolume: false };
    const oldFade = controller.transition(record, 0.2, 1000);
    const oldTimer = record.fadeTimer;
    const queuedOldCallback = callbacks.get(oldTimer);
    const replacementFade = controller.transition(record, 0.4, 1000);
    const replacementTimer = record.fadeTimer;

    queuedOldCallback();
    assert.equal(record.fadeTimer, replacementTimer);
    callbacks.get(replacementTimer)();
    assert.equal(record.fadeTimer, replacementTimer);

    controller.cancelTransition(record);
    assert.deepEqual(await Promise.all([oldFade, replacementFade]), [false, false]);
  } finally {
    global.setInterval = nativeSetInterval;
    global.clearInterval = nativeClearInterval;
  }
});

test("interrupted fades reconcile to the current level before restoring", async () => {
  const media = new FakeMedia("https://media.example/interrupted.mp3", { volume: 0.8 });
  const controller = makeController([media], "duck", { targetVolumePercent: 10, fadeOutMs: 400, fadeInMs: 0 });
  const begin = controller.begin({ id: "session-interrupt-123456" });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await controller.restore();
  await begin;
  closeTo(media.volume, 0.8);
  assert.equal(controller.status().touchedCount, 0);
});

test("background-style timer throttling still reaches exact duck and restore levels", async () => {
  const media = new FakeMedia("https://media.example/background.mp3", { volume: 0.8 });
  const nativeInterval = global.setInterval;
  global.setInterval = (callback) => nativeInterval(callback, 85);
  try {
    const controller = makeController([media], "duck", { targetVolumePercent: 20, fadeOutMs: 200, fadeInMs: 250 });
    await controller.begin({ id: "session-background-123" });
    closeTo(media.volume, 0.2);
    await controller.restore();
    closeTo(media.volume, 0.8);
  } finally { global.setInterval = nativeInterval; }
});

test("separate web players can pause and duck in one dictation session", async () => {
  const plexVideo = new FakeMedia("https://app.plex.tv/video/1", { volume: 0.82 });
  const youtubeVideo = new FakeMedia("https://www.youtube.com/watch?v=2", { volume: 0.64 });
  const plex = makeController([plexVideo], "pause");
  const youtube = makeController([youtubeVideo], "duck", { targetVolumePercent: 15 });
  const sessionId = "session-mixed-players-123";
  await Promise.all([
    plex.begin({ id: sessionId, settings: settings("pause") }),
    youtube.begin({ id: sessionId, settings: settings("duck", { targetVolumePercent: 15 }) })
  ]);
  assert.equal(plexVideo.paused, true);
  closeTo(plexVideo.volume, 0);
  closeTo(youtubeVideo.volume, 0.15);
  await Promise.all([plex.restore(sessionId), youtube.restore(sessionId)]);
  assert.equal(plexVideo.paused, false);
  closeTo(plexVideo.volume, 0.82);
  closeTo(youtubeVideo.volume, 0.64);
});
