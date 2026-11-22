# ChatDuck

**Automatically pause or lower your music while you use ChatGPT voice input.**

No Windows app needed for YouTube, YouTube Music, Spotify Web, Twitch or Plex Web: **just Tampermonkey and ChatDuck**.

**Desktop apps too (optional):** the Windows Agent can control **user-selected compatible applications**, including adding a local `.exe` file in the settings. You can choose Pause or Ducking per application. Earlier builds have been tried with Spotify Desktop and Plex for Windows. **Compatibility is not universal:** ducking needs an accessible Windows audio session; true pause requires supported media controls. Some applications are excluded for safety.

> **Experimental alpha — v2.7.5-alpha.2.** ChatDuck is still being tested. See [known limitations](#alpha-status) before relying on it.

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

If you use Spotify **Desktop**, Plex **for Windows**, or another compatible Windows desktop player, the userscript alone cannot directly control those native applications. Install the separate Windows agent **only if you need that feature**.

**More than Spotify and Plex:** after pairing, open **ChatDuck settings → Advanced → Windows apps**. You can select detected applications or add a local `.exe` path, enable or disable each application, and choose **Pause** or **Ducking** (and a custom volume target) per app. The agent controls only selected compatible media/audio sessions, not arbitrary application functionality. **Not every executable will work:** volume control requires an accessible Windows audio session; real pause/resume requires compatible Windows media controls. When pause is unavailable, a configured volume-reduction fallback may be used instead. Protected apps (including browsers and communication apps) are deliberately excluded. The creator tested earlier builds with Spotify Desktop and Plex for Windows; other executables remain unverified and should be reported via Issues.

1. Download the [optional ChatDuck Windows Agent MSI (v2.7.5-alpha.1)](https://github.com/fevegit/chatduck/releases/download/v2.7.5-alpha.1/ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi). Alpha.2 updates the userscript only; this MSI remains the alpha.1 agent.
2. Run the installer, then open **ChatDuck Agent** from the Windows Start menu.
3. Follow the pairing steps to connect your browser to the local agent.

**Alpha caution:** the MSI is unsigned, may trigger Windows security warnings, and has not yet been tested on a clean Windows machine. Only install it if you understand these limitations. No PowerShell, manually entered tokens or custom paths are required for normal installation. Startup with Windows is disabled by default.

Read [Windows Agent security](docs/SECURITY.md), [permissions](docs/PERMISSIONS.md) and [uninstall instructions](docs/UNINSTALL.md) for technical details.

</details>

## Alpha status

- The earlier 2.7.4 build was manually tested by its creator with ChatGPT, Spotify Web/Desktop, YouTube, Plex Web and Plex for Windows.
- **This public alpha has not yet been fully tested** for clean Windows installation, agent upgrades, pairing or end-to-end ChatGPT recording on other machines.
- ChatDuck is experimental. Please [report reproducible issues](https://github.com/fevegit/chatduck/issues), including browser, Windows version if relevant, player and reproduction steps. Never share pairing codes, tokens, personal paths or unredacted logs.

See [v2.7.5-alpha.2 release and downloads](https://github.com/fevegit/chatduck/releases/tag/v2.7.5-alpha.2) and [release-readiness notes](docs/release-readiness.md).

## Privacy, uninstall and support

ChatDuck runs locally; it has no telemetry, paid features or account requirement. The userscript does not request microphone access. To remove browser integration, uninstall **ChatGPT Audio Ducking** in Tampermonkey. The optional Windows Agent can be removed separately from Windows Settings → Apps. See [Privacy](docs/PRIVACY.md) and the [full uninstall guide](docs/UNINSTALL.md).

ChatDuck is free and open source under the [MIT License](LICENSE). Optional donations: [Ko-fi](https://ko-fi.com/fevee).
