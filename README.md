# ChatGPT Audio Ducking

Pause or lower selected players while you dictate in ChatGPT. Audio Ducking runs locally in Tampermonkey. Its optional Windows agent adds support for desktop players.

![Audio Ducking settings panel](docs/images/settings-panel.png)

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Firefox, Chrome, or Edge.
2. Install the [Audio Ducking userscript](https://raw.githubusercontent.com/fevegit/audio-ducking/main/ChatGPT-Audio-Ducking.user.js) and confirm Tampermonkey's install prompt.
3. Open ChatGPT and the supported player in the same browser. Open Audio Ducking from the Tampermonkey menu.

The userscript works with supported web players without the Windows agent. You do not need to enter a token or edit a local path. ChatGPT microphone access remains under ChatGPT and browser control; Audio Ducking does not request microphone permission.

### Optional Windows agent

Install the [Windows Agent MSI](https://github.com/fevegit/audio-ducking/releases/latest/download/Audio-Ducking-Windows-Agent-2.7.5-x64.msi) only if you want to control Spotify or another selected desktop player. The installer is per-user and does not require administrator privileges. After installation, open **Audio Ducking Agent** from the Start menu to pair this browser. Pairing is explicit; the agent does not launch or install itself silently.

The agent starts with Windows only after you turn on that option in Audio Ducking settings. It controls selected applications' media sessions and per-application volume. It does not record microphone audio or change master volume.

## Features

- Pause or duck supported web playback while ChatGPT dictation is active.
- Optional Windows control for Spotify desktop and selected media applications.
- Independent pause/duck rules, target volume, fade settings, and player selections.
- Optional Plex Web origin support and custom website integrations.
- English and Spanish settings panel.
- No analytics, telemetry, accounts, or paid features.

## Verified compatibility

The project owner manually verified Audio Ducking 2.7.4 with ChatGPT, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows (Ducking). The screenshots are from the Firefox UI audit. This 2.7.5 public candidate changes agent pairing and packaging; clean-install and browser-specific release checks are listed in [Release readiness](docs/release-readiness.md) and remain pending until recorded there.

## Privacy and permissions

Read [Privacy](docs/PRIVACY.md), [Permissions](docs/PERMISSIONS.md), and [Windows Agent security](docs/SECURITY.md) before installing the optional agent. The public source contains no developer token, custom domains, local logs, or personal backups.

## Uninstall

- Remove **ChatGPT Audio Ducking** from Tampermonkey's dashboard.
- If installed, remove **Audio Ducking Windows Agent** from Windows Settings → Apps → Installed apps. The agent removes only its own files and startup entry. Tampermonkey preferences remain separate; see [Uninstall guide](docs/UNINSTALL.md).

## Support

Open a [GitHub issue](https://github.com/fevegit/audio-ducking/issues) with the template. Please remove usernames, tokens, local paths, and logs before attaching diagnostic information.

Voluntary support: [Ko-fi](https://ko-fi.com/fevee).

## License

The project proposes the MIT License. The proposal is in [`LICENSE.proposed-MIT.txt`](LICENSE.proposed-MIT.txt); it is not the active license until the maintainer approves and renames it to `LICENSE`.
