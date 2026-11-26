const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "../src/agent-client.js"), "utf8");
const token = "8a".repeat(32);

function context(initialToken = "") {
  const values = new Map(initialToken ? [["agentToken", initialToken]] : []);
  const calls = [];
  const sandbox = {
    crypto: webcrypto,
    btoa,
    atob,
    TextEncoder,
    URL,
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => values.set(key, value),
    GM_xmlhttpRequest: (options) => calls.push(options)
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "agent-client.js" });
  return { api: sandbox.AudioDuckAgent, values, calls };
}

function base64url(bytes) { return Buffer.from(bytes).toString("base64url"); }
async function sign(message) {
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(token, "hex"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function waitForCalls(calls, count) {
  for (let i = 0; calls.length < count && i < 50; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(calls.length, count);
}

test("agent stays unconfigured until a per-install token is paired", async () => {
  const { api } = context();
  assert.equal(api.configured, false);
  await assert.rejects(api.request({ command: "status" }), /empareja/i);
});

test("Discord preferences require explicit agent capabilities", () => {
  const { api } = context();
  const requested = { discordMuteDuringDictation: true, discordDeafenDuringDictation: true };
  assert.deepEqual({ ...api.discordPreferences(requested, {}) }, {
    discordMuteDuringDictation: false, discordDeafenDuringDictation: false, unsupported: true
  });
  assert.deepEqual({ ...api.discordPreferences(requested, { capabilities: ["discordMute"] }) }, {
    discordMuteDuringDictation: true, discordDeafenDuringDictation: false, unsupported: true
  });
  assert.deepEqual({ ...api.discordPreferences(requested, { capabilities: ["discordMute", "discordDeafen"] }) }, {
    discordMuteDuringDictation: true, discordDeafenDuringDictation: true, unsupported: false
  });
  const ctrlClick = { ...requested, discordActivationMode: "ctrl-click" };
  assert.deepEqual({ ...api.discordPreferences(ctrlClick, { capabilities: ["discordMute", "discordDeafen"] }, { discordCtrlClick: false }) }, {
    discordMuteDuringDictation: false, discordDeafenDuringDictation: false, unsupported: false
  });
  assert.deepEqual({ ...api.discordPreferences(ctrlClick, { capabilities: ["discordMute", "discordDeafen"] }, { discordCtrlClick: true }) }, {
    discordMuteDuringDictation: true, discordDeafenDuringDictation: true, unsupported: false
  });
  assert.deepEqual({ ...api.discordPreferences({ ...ctrlClick, discordDeafenDuringDictation: false }, { capabilities: ["discordMute"] }, { discordCtrlClick: true }) }, {
    discordMuteDuringDictation: true, discordDeafenDuringDictation: false, unsupported: false
  });
  assert.deepEqual({ ...api.discordPreferences({ ...ctrlClick, discordMuteDuringDictation: false }, { capabilities: ["discordDeafen"] }, { discordCtrlClick: true }) }, {
    discordMuteDuringDictation: false, discordDeafenDuringDictation: true, unsupported: false
  });
});

test("pairing stores a fresh token and removes the code from the address", async () => {
  const { api, values, calls } = context();
  const win = { location: { href: "http://127.0.0.1:48731/pair#" + "ab".repeat(32), hash: "#" + "ab".repeat(32), pathname: "/pair", search: "" }, history: { replaceState: (_a, _b, url) => { win.cleanedUrl = url; } } };
  const status = { textContent: "" };
  const doc = { readyState: "complete", querySelector: () => status };
  const pending = api.completePairing(win, doc);
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:48731/v1/pair");
  assert.equal(JSON.parse(calls[0].data).code, "ab".repeat(32));
  calls[0].onload({ status: 200, responseText: JSON.stringify({ ok: true, token }) });
  assert.equal(await pending, true);
  assert.equal(values.get("agentToken"), token);
  assert.equal(win.cleanedUrl, "/pair");
  assert.match(status.textContent, /connected/i);
});

test("agent commands use signed nonces and reject unsigned responses", async () => {
  const { api, calls } = context(token);
  const pending = api.request({ command: "status" });
  await new Promise(setImmediate);
  const request = calls[0];
  assert.equal(request.url, "http://127.0.0.1:48731/v1/command");
  assert.ok(request.headers["X-Audio-Ducking-Nonce"]);
  assert.ok(request.headers["X-Audio-Ducking-Signature"]);
  assert.equal(Object.keys(request.headers).some((key) => key.toLowerCase() === "authorization"), false);
  const nonce = request.headers["X-Audio-Ducking-Nonce"];
  const body = '{"ok":true}';
  request.onload({ status: 200, responseText: body, responseHeaders: `X-Audio-Ducking-Response-Nonce: ${nonce}\r\nX-Audio-Ducking-Response-Signature: ${await sign(`resp\n200\n${nonce}\n${body}`)}\r\n` });
  assert.equal((await pending).ok, true);

  const invalid = api.request({ command: "status" });
  await waitForCalls(calls, 2);
  calls[1].onload({ status: 200, responseText: body, responseHeaders: `X-Audio-Ducking-Response-Nonce: ${calls[1].headers["X-Audio-Ducking-Nonce"]}\r\n` });
  await assert.rejects(invalid, /no autenticada/i);
});
