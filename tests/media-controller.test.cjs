const test = require("node:test");
const assert = require("node:assert/strict");
const { MediaController, fingerprint } = require("../src/media-controller.js");

class FakeMedia extends EventTarget {
  constructor(src, { paused = false, volume = 0.8, acceptsVolume = true, playDelay = 0 } = {}) {
    super();
    this.tagName = "VIDEO";
    this.paused = paused;
    this.ended = false;
    this.readyState = 0;
    this.src = src;
    this.currentSrc = src;
    this.acceptsVolume = acceptsVolume;
    this.playDelay = playDelay;
    this._volume = volume;
    Object.defineProperty(this, "volume", {
      configurable: true,
      get: () => this._volume,
      set: (value) => {
        if (!this.acceptsVolume) return;
        this._volume = Math.max(0, Math.min(1, value));
        this.dispatchEvent(new Event("volumechange"));
      }
    });
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
  fallbackDucking: true, fallbackToPause: true, ...overrides
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
    setVolume: (value) => { playerVolume = value; media._volume = value / 100; }
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
