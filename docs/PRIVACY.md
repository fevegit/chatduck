# Privacy

ChatDuck has no analytics, telemetry, account system, or remote control service.

## Data used locally

- Tampermonkey stores ChatDuck preferences and its per-install agent token in the browser's userscript storage. The manager retains the legacy script identity so existing installs can update in place.
- The optional Windows agent stores its random token, custom-site domains, and operational log under the current Windows user's local application data in `Programs/ChatGPTAudioDuckingTM`.
- When the agent is used, ChatDuck sends selected application identifiers, media-session status, and per-app volume commands over loopback (`127.0.0.1`). The agent does not collect microphone audio, camera data, or master-volume state.
- Excluded domains and per-site overrides stay in Tampermonkey storage. They are not sent to the local agent.

## Network requests

Normal operation uses Tampermonkey storage and page media APIs. The optional agent communicates only with the local loopback listener. GitHub is contacted only when the user opens an installation/update link or the userscript manager checks the public update URL. Ko-fi is an optional support link opened by the user.

Universal Web Control requires broad HTTP/HTTPS match permissions. The userscript runs in Tampermonkey's isolated DOM sandbox and processes media elements locally; it does not read page text or collect browsing history. ChatGPT and common communication domains are excluded from playback control. Each frame controls only its own document. Closed shadow roots and Web Audio-only playback are not handled.

The agent token is generated locally, stored by Tampermonkey and in the user's agent configuration, and never included in the public userscript or installer. Regular browser-agent commands use HMAC signatures, timestamps, and one-use nonces. Initial pairing uses a random, single-use code that expires after five minutes. During shutdown/uninstall only, the local process can send the existing token in a loopback Bearer header if signed shutdown fails, to stop a legacy agent; that request is not sent by the userscript or logged.

## Logs and removal

The optional agent writes a local diagnostic log. Do not post logs without reviewing and redacting them. Removing the Tampermonkey script removes its stored values when Tampermonkey offers that cleanup; removing the Windows agent deletes its own configuration and log. See [Uninstall](UNINSTALL.md).
