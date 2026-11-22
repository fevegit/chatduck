# ChatDuck

**Automatically pause or lower your music while you use ChatGPT voice input.**

No Windows app needed for YouTube, YouTube Music, Spotify Web, Twitch or Plex Web: **just Tampermonkey and ChatDuck**.

> **Experimental alpha — v2.7.5-alpha.1.** ChatDuck is still being tested. See [known limitations](#alpha-status) before relying on it.

[**Install ChatDuck (userscript)**](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) · [Español](README.es.md) · [Report a bug](https://github.com/fevegit/chatduck/issues)

## Get started — 2 steps

1. **Install [Tampermonkey](https://www.tampermonkey.net/)** for Firefox, Chrome or Edge (skip this if you already have it).
2. **[Install ChatDuck](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js)** and approve the script in Tampermonkey.

**That's it for browser players.** Open [ChatGPT](https://chatgpt.com/) and your supported music/video site in the **same browser**, then start using voice dictation. ChatDuck can automatically pause playback or lower its volume, and restore it when dictation ends.

To change the default behavior, open **Tampermonkey → ChatGPT Audio Ducking → Open ChatDuck settings**. *“ChatGPT Audio Ducking” is the legacy script name retained so earlier installations can update without creating a duplicate.*

![ChatDuck settings panel](docs/images/settings-panel.png)

## What works without Windows software?

| Player | Windows app required? |
| --- | --- |
| YouTube / YouTube Music (web) | **No** |
| Spotify Web | **No** |
| Twitch (web) | **No** |
| Plex Web | **No** (some self-hosted server addresses need permission setup) |
| Spotify Desktop / Plex for Windows | **Yes — optional Windows Agent** |

Each player can have its own Pause or Ducking behavior and volume target. Some browsers and player configurations may behave differently; please report problems during the alpha.

<details>
<summary><strong>Advanced: control Windows desktop applications (optional)</strong></summary>

If you use Spotify **Desktop** or Plex **for Windows**, the userscript alone cannot directly control those native applications. Install the separate Windows agent **only if you need that feature**.

1. Download the [ChatDuck Windows Agent MSI (v2.7.5-alpha.1)](https://github.com/fevegit/chatduck/releases/download/v2.7.5-alpha.1/ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi).
2. Run the installer, then open **ChatDuck Agent** from the Windows Start menu.
3. Follow the pairing steps to connect your browser to the local agent.

**Alpha caution:** the MSI is unsigned, may trigger Windows security warnings, and has not yet been tested on a clean Windows machine. Only install it if you understand these limitations. No PowerShell, manually entered tokens or custom paths are required for normal installation. Startup with Windows is disabled by default.

Read [Windows Agent security](docs/SECURITY.md), [permissions](docs/PERMISSIONS.md) and [uninstall instructions](docs/UNINSTALL.md) for technical details.

</details>

## Alpha status

- The earlier 2.7.4 build was manually tested by its creator with ChatGPT, Spotify Web/Desktop, YouTube, Plex Web and Plex for Windows.
- **This public alpha has not yet been fully tested** for clean Windows installation, agent upgrades, pairing or end-to-end ChatGPT recording on other machines.
- ChatDuck is experimental. Please [report reproducible issues](https://github.com/fevegit/chatduck/issues), including browser, Windows version if relevant, player and reproduction steps. Never share pairing codes, tokens, personal paths or unredacted logs.

See [v2.7.5-alpha.1 release and downloads](https://github.com/fevegit/chatduck/releases/tag/v2.7.5-alpha.1) and [release-readiness notes](docs/release-readiness.md).

## Privacy, uninstall and support

ChatDuck runs locally; it has no telemetry, paid features or account requirement. The userscript does not request microphone access. To remove browser integration, uninstall **ChatGPT Audio Ducking** in Tampermonkey. The optional Windows Agent can be removed separately from Windows Settings → Apps. See [Privacy](docs/PRIVACY.md) and the [full uninstall guide](docs/UNINSTALL.md).

ChatDuck is free and open source under the [MIT License](LICENSE). Optional donations: [Ko-fi](https://ko-fi.com/fevee).
