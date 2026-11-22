# Permissions

## Tampermonkey userscript

| Permission | Purpose |
| --- | --- |
| Match rules for ChatGPT, YouTube, Spotify Web, Twitch, Plex Web, and loopback | Observe ChatGPT's dictation interface, coordinate sessions, and control supported web media on those pages. |
| `GM_getValue`, `GM_setValue`, and `GM_addValueChangeListener` | Store settings and the per-install agent token; synchronize session state between tabs. |
| `GM_getTab`, `GM_saveTab`, and `GM_getTabs` | Coordinate state and safe restoration across open tabs. |
| `GM_registerMenuCommand`, `GM_unregisterMenuCommand` | Open the settings panel from Tampermonkey's menu. |
| `GM_xmlhttpRequest` to `127.0.0.1` | Communicate with the optional local Windows agent. No remote API is contacted during audio control. |

The userscript does not access `getUserMedia`, `MediaRecorder`, `AudioContext`, microphone permissions, or browser audio prototypes. It does not request microphone or camera permission.

## Optional Windows agent

The agent runs as the signed-in user, binds only to IPv4 loopback on port 48731, and controls explicitly selected Windows media sessions and per-app WASAPI volume. It does not run as a service, require administrator rights, change master volume, or capture microphone audio.

Enabling **Start the agent when I sign in** writes only the agent's named value under the current user's `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`. It is off by default and is removed on agent uninstall only when it still points to this agent executable.
