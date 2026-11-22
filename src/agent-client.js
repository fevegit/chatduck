(function (root) {
  "use strict";

  const BASE_URL = "http://127.0.0.1:48731";
  const COMMAND_URL = `${BASE_URL}/v1/command`;
  const TOKEN_KEY = "agentToken";

  function token() {
    try { return typeof GM_getValue === "function" ? String(GM_getValue(TOKEN_KEY, "") || "") : ""; }
    catch (_) { return ""; }
  }

  function hexBytes(value) {
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Credencial local no válida");
    return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
  }

  function base64url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (char) => char.charCodeAt(0));
  }

  async function signature(secret, message) {
    if (!root.crypto?.subtle) throw new Error("WebCrypto no está disponible para autenticar el agente");
    const key = await root.crypto.subtle.importKey("raw", hexBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return base64url(new Uint8Array(await root.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
  }

  async function verify(secret, message, expected) {
    const actual = fromBase64url(await signature(secret, message));
    const received = fromBase64url(expected);
    if (actual.length !== received.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ received[i];
    return diff === 0;
  }

  function request(payload, timeout = 1800) {
    const secret = token();
    if (!secret) return Promise.reject(new Error("Empareja el agente Windows desde su acceso del menú Inicio"));
    if (typeof GM_xmlhttpRequest !== "function") return Promise.reject(new Error("Tampermonkey no expone GM_xmlhttpRequest"));
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = base64url(root.crypto.getRandomValues(new Uint8Array(16)));
    const message = `req\nPOST\n/v1/command\n${timestamp}\n${nonce}\n${body}`;
    return signature(secret, message).then((signed) => new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: COMMAND_URL,
        headers: {
          "Content-Type": "application/json",
          "X-Audio-Ducking-Timestamp": timestamp,
          "X-Audio-Ducking-Nonce": nonce,
          "X-Audio-Ducking-Signature": signed
        },
        data: body,
        anonymous: true,
        redirect: "error",
        timeout,
        responseType: "text",
        onload(response) {
          const responseNonce = response.responseHeaders?.match(/^x-audio-ducking-response-nonce:\s*([^\r\n]+)/im)?.[1]?.trim();
          const responseSignature = response.responseHeaders?.match(/^x-audio-ducking-response-signature:\s*([^\r\n]+)/im)?.[1]?.trim();
          const text = String(response.responseText || "");
          if (responseNonce !== nonce || !responseSignature) { reject(new Error("Respuesta del agente no autenticada")); return; }
          verify(secret, `resp\n${response.status}\n${nonce}\n${text}`, responseSignature).then((valid) => {
            if (!valid) { reject(new Error("Firma de respuesta del agente no válida")); return; }
            let value;
            try { value = JSON.parse(text); } catch (_) { reject(new Error("Respuesta no válida del agente Windows")); return; }
            if (response.status < 200 || response.status >= 300) { reject(new Error(value?.error || `Agente Windows respondió HTTP ${response.status}`)); return; }
            resolve(value);
          }, reject);
        },
        onerror() { reject(new Error("No se pudo conectar al agente Windows")); },
        ontimeout() { reject(new Error("El agente Windows no respondió a tiempo")); },
        onabort() { reject(new Error("Solicitud al agente cancelada")); }
      });
    }));
  }

  function isPairPage(href = root.location?.href || "") {
    try {
      const url = new URL(href);
      return url.origin === BASE_URL && url.pathname === "/pair" && /^[a-f0-9]{64}$/i.test(url.hash.slice(1));
    } catch (_) { return false; }
  }

  function setPairStatus(doc, message) {
    const update = () => { const status = doc?.querySelector?.("[data-pair-status]"); if (status) status.textContent = message; };
    if (doc?.readyState === "loading") doc.addEventListener("DOMContentLoaded", update, { once: true });
    else update();
  }

  function completePairing(win = root, doc = root.document) {
    if (!isPairPage(win.location.href)) return Promise.resolve(false);
    const code = win.location.hash.slice(1);
    win.history.replaceState(null, "", `${win.location.pathname}${win.location.search}`);
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") { reject(new Error("Tampermonkey no está disponible en este navegador")); return; }
      GM_xmlhttpRequest({
        method: "POST", url: `${BASE_URL}/v1/pair`, headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ code }), anonymous: true, redirect: "error", timeout: 5000, responseType: "text",
        onload(response) {
          let value;
          try { value = JSON.parse(response.responseText || "{}"); } catch (_) { value = null; }
          if (response.status < 200 || response.status >= 300 || !/^[a-f0-9]{64}$/i.test(value?.token || "")) {
            reject(new Error(value?.error || "No se pudo emparejar. Inicia otra vez ChatDuck Agent para generar un código nuevo."));
            return;
          }
          try { GM_setValue(TOKEN_KEY, value.token); }
          catch (_) { reject(new Error("Tampermonkey no pudo guardar la credencial local")); return; }
          setPairStatus(doc, "ChatDuck is connected to this browser. You can close this tab.");
          resolve(true);
        },
        onerror() { reject(new Error("No se pudo conectar al agente local")); },
        ontimeout() { reject(new Error("El código de emparejamiento ha caducado. Inicia otra vez el agente.")); },
        onabort() { reject(new Error("Emparejamiento cancelado")); }
      });
    });
  }

  const api = {
    request,
    isPairPage,
    completePairing,
    setPairStatus,
    get configured() { return /^[a-f0-9]{64}$/i.test(token()); },
    installUrl: "__WINDOWS_AGENT_DOWNLOAD_URL__"
  };
  root.AudioDuckAgent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
