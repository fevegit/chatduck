# ChatDuck

> **ALPHA — v2.7.5-alpha.1.** This is an experimental community build. A clean Windows agent installation and compatibility on other computers have not been fully verified. Expect issues and share feedback before relying on it.

**Audio ducking for ChatGPT voice input.** ChatDuck pauses or lowers selected players while you dictate. The Tampermonkey userscript runs locally; an optional Windows agent adds selected desktop players.

![ChatDuck settings panel](docs/images/settings-panel.png)

## Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Firefox, Chrome, or Edge.
2. Open the [ChatDuck userscript](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) and confirm Tampermonkey's installation prompt.
3. Open ChatGPT and a supported player in the same browser. Open ChatDuck from Tampermonkey's menu.

Supported web-player integrations work without the Windows agent. No token or local path setup is needed. ChatGPT and the browser handle microphone access; ChatDuck does not request microphone permission.

## Optional Windows agent

Download the [ChatDuck Windows Agent MSI](https://github.com/fevegit/chatduck/releases/download/v2.7.5-alpha.1/ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi) only to control Spotify or another selected desktop player. The installer is per-user and does not require administrator privileges. Run it yourself, then open **ChatDuck Agent** from the Start menu to pair the browser. It never downloads or installs itself silently.

Windows clean-install and upgrade behavior have not yet been verified on an isolated Windows machine. The MSI is unsigned. Startup with Windows is off until enabled in settings. The agent controls selected media sessions and per-application volume; it does not record microphone audio or change master volume.

## Features

- Pause or duck supported web playback while ChatGPT dictation is active.
- Optional Windows control for Spotify desktop and selected media applications.
- Independent pause/duck rules, target volume, fade settings, and player selections.
- Optional Plex Web origin support and custom website integrations.
- English and Spanish settings panel.
- No analytics, telemetry, accounts, or paid features.

## Compatibility status

The project owner manually tested the previous 2.7.4 version with ChatGPT, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows (Ducking). That does not verify this alpha's packaging, clean Windows installation, upgrade from an older agent, or compatibility on other computers. See [release readiness](docs/release-readiness.md) for checks still pending.

The Tampermonkey script keeps its legacy manager name and update identity so existing installations can receive updates without creating a second script entry. The product, settings panel, and new installer are branded ChatDuck.

## Privacy and permissions

ChatDuck has no analytics or telemetry. The userscript does not access microphone APIs or request microphone permission. The optional Windows agent communicates over local loopback and stores its per-install token in the current user's local app data. Read [Privacy](docs/PRIVACY.md), [Permissions](docs/PERMISSIONS.md), and [Security](docs/SECURITY.md) before enabling agent features.

## Uninstall

- Remove **ChatGPT Audio Ducking** from Tampermonkey's dashboard. This legacy dashboard name is retained for upgrade compatibility.
- If installed, remove **ChatDuck Windows Agent** from Windows Settings → Apps → Installed apps.
- See the [uninstall guide](docs/UNINSTALL.md) for details.

## Feedback and support

Open a [GitHub issue](https://github.com/fevegit/chatduck/issues) using a template. Remove usernames, tokens, local paths, and unredacted logs before attaching diagnostics. Support is voluntary through [Ko-fi](https://ko-fi.com/fevee).

## License

ChatDuck is licensed under the [MIT License](LICENSE). Copyright (c) 2026 ChatDuck contributors.
