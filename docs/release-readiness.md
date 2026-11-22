# Release readiness — ChatDuck v2.7.6-beta.1

This is an experimental beta, not a stable release. Its MSI is unsigned. Clean Windows installation, upgrade, restart, uninstall, pairing, and compatibility on other computers require isolated-machine testing.

## Compatibility and migration

- The Tampermonkey identity remains `@name ChatGPT Audio Ducking`, namespace `https://local.chatgpt-audio-ducking/`, legacy script filename, and raw `main` update URL. The existing userscript should update in place and retain its stored preferences; a live Tampermonkey update was not exercised in this headless build.
- The MSI keeps UpgradeCode `{75A2EB87-3A7D-4A1C-A128-6BD4A88DB93F}`, per-user scope, install folder `ChatGPTAudioDuckingTM`, executable name `ChatGPTAudioDuckingAgent.exe`, and Start menu identity. Its numeric ProductVersion is `2.7.6`, above the previous MSI's `2.7.5`.
- Browser Mode supports web integrations without the Windows Agent. Native Pause requires a usable Windows media-control session; Ducking requires an accessible audio session. Some applications do not expose those sessions. Protected apps are excluded. Custom executable paths do not imply universal compatibility, and restoration depends on session state remaining recoverable.
- The project owner manually tested the earlier 2.7.4 build with ChatGPT, Spotify Web and Desktop, YouTube, Plex Web, and Plex for Windows (Ducking). That history does not verify this beta on another machine.

## Validation record

- Built a fresh generic userscript and Windows x64 MSI locally from this source using WiX Toolset 4.0.3. No alpha MSI was reused.
- JavaScript tests: **71 passed**. Native audio-volume tests: **20 passed**. Native HMAC protocol checks passed.
- MSI database inspection (without installing): `ProductName=ChatDuck Windows Agent`, `ProductVersion=2.7.6`, and UpgradeCode `{75A2EB87-3A7D-4A1C-A128-6BD4A88DB93F}`. Its ProductCode differs from alpha.2, and its file table contains the agent executable, settings page, userscript template, and MIT license.
- The SHA-256 manifest contains exactly the userscript and new MSI; both hashes were recomputed and matched.
- A pattern scan found no candidate credentials or personal paths in the reachable Git history, tracked working tree, or built userscript/MSI. `.wix/` and `release-artifacts/` remain ignored build outputs.
- Updated `docs/images/settings-panel.png` from the headless modal preview. This is a fixture rendering, not a capture from live ChatGPT or Tampermonkey.
- Real ChatGPT recording, live player audio, clean Windows install/upgrade/restart/uninstall, and pairing on another computer were not performed; this environment has no separate Windows test machine. The maintainer's daily Windows installation was not touched.
- GitHub Actions were not run; the workflow remains manual-dispatch only. Its asset and smoke-test paths now target the beta MSI.

## Release assets

The prepared beta assets are `ChatDuck.user.js`, the freshly built `ChatDuck-Windows-Agent-2.7.6-beta.1-x64.msi`, and `SHA256SUMS.txt`. Do not reuse any alpha MSI. Verify the downloaded public assets against the manifest before retiring the alpha releases and tags.
