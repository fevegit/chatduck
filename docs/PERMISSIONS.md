# Permissions

## Tampermonkey userscript

| Permission | Purpose |
| --- | --- |
| HTTP and HTTPS pages, including frames | Observe HTML5 media state on pages where universal control is enabled. ChatGPT and communication sites are excluded from media control. The userscript needs broad match permission to work on new sites without domain updates. |
| `GM_getValue`, `GM_setValue`, and `GM_addValueChangeListener` | Store settings and the per-install agent token; synchronize session state between tabs and frames. |
| `GM_getTab`, `GM_saveTab`, and `GM_getTabs` | Coordinate state and safe restoration across open tabs. |
| `GM_registerMenuCommand`, `GM_unregisterMenuCommand` | Open the settings panel from Tampermonkey's menu. |
| `GM_xmlhttpRequest` to `127.0.0.1` | Communicate with the optional local Windows agent. No remote API is contacted during audio control. |

The userscript uses Tampermonkey's isolated `DOM` sandbox. The page cannot access the userscript's GM storage or agent client. The local-agent bridge is used only by ChatGPT and the pairing page, and the agent requires the per-install HMAC token, timestamp, one-use nonce, and loopback origin checks. The userscript does not access `getUserMedia`, `MediaRecorder`, `AudioContext`, microphone permissions, or browser audio prototypes. It does not request microphone or camera permission.

Universal mode observes `audio` and `video` elements in the current document and open shadow roots. Userscript execution in frames lets each same-origin or cross-origin frame control its own media document; media inside closed shadow roots, cross-origin frame inspection from a parent page, and Web Audio-only graphs are not supported. No page text, URL history, account data, or credentials are collected or sent.

## Optional Windows agent

The agent runs as the signed-in user, binds only to IPv4 loopback on port 48731, and controls explicitly selected Windows media sessions and per-app WASAPI volume. It does not run as a service, require administrator rights, change master volume, or capture microphone audio.

Enabling **Start the agent when I sign in** writes only the agent's named value under the current user's `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`. It is off by default and is removed on agent uninstall only when it still points to this agent executable.
