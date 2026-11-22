# Release readiness — ChatDuck v2.7.5-alpha.2

This is an experimental alpha candidate. The maintainer approved the MIT license and public alpha on 2026-11-22. Do not describe the product as stable.

## Verified from the 2.7.4 baseline

- The project owner manually tested the previous version with ChatGPT dictation, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows (Ducking).
- The settings-panel capture was regenerated headlessly from the current ChatDuck modal preview fixture. It is not a capture from a live ChatGPT or Tampermonkey session.
- Existing MSI identity was reviewed: the upgrade code, per-user app-data folder, executable name, registry startup value, and internal agent protocol identifiers remain unchanged. MSI ProductVersion is numeric `2.7.5`, newer than `2.7.4`; the display/release version is `2.7.5-alpha.1`.
- Tampermonkey `@name`, localized names, `@namespace`, and legacy userscript filename are retained to preserve update identity. Product UI and new install assets use ChatDuck. The update URL points to the renamed `fevegit/chatduck` repository and legacy filename.

## Candidate checks

- Alpha.2 rebuilds the generic userscript only. The already published alpha.1 Windows Agent MSI remains an optional download; no installer identity or Windows component was changed.
- MSI database inspection confirmed `ProductName=ChatDuck Windows Agent`, `ProductVersion=2.7.5`, and the unchanged UpgradeCode `{75A2EB87-3A7D-4A1C-A128-6BD4A88DB93F}`.
- JavaScript tests: 70 passed. Native volume tests: 20 passed. Native HMAC protocol checks passed.
- Alpha.2 SHA-256 manifest verified against the rebuilt ChatDuck userscript and unchanged alpha.1 MSI.
- The generic userscript header retains the legacy name/namespace and uses the new repository update URL; no per-install token is embedded.
- Actual MSI install, upgrade, restart, and uninstall on an isolated Windows machine: pending.
- Real Tampermonkey pairing, microphone recording, and browser/player checks on alpha.2: pending.
- Update from a real 2.7.4 installation: pending. Do not use the maintainer's daily installation for this test.
- Clean Windows install and compatibility on other computers: not verified; this limitation must remain prominent in alpha notes.
- MSI code signing: not configured.

## GitHub Actions

`.github/workflows/windows-validation.yml` is manual-dispatch only and was not run. Do not trigger it as part of this preparation.

## Alpha.2 scope

- The alpha.2 userscript puts browser controls first, hides Windows-only settings under Advanced for unpaired installations, and skips local agent requests when no pairing token is configured.
- Tampermonkey update identity, stored settings, per-player rules, HMAC pairing, and the audio-control engine are retained.
- The alpha.1 MSI is optional and remains unsigned. Clean installation, upgrade, restart, uninstall, and pairing on an isolated Windows machine are not verified.
- No microphone recording, live ChatGPT dictation, or audio behavior was exercised in this headless validation.
- GitHub Actions were not run. This release remains a pre-release, not a stable version.
