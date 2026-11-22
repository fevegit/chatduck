# Release readiness — ChatDuck v2.7.5-alpha.1

This is an experimental alpha candidate. The maintainer approved the MIT license and public alpha on 2026-11-22. Do not describe the product as stable.

## Verified from the 2.7.4 baseline

- The project owner manually tested the previous version with ChatGPT dictation, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows (Ducking).
- The settings-panel capture was regenerated headlessly from the current ChatDuck modal preview fixture. It is not a capture from a live ChatGPT or Tampermonkey session.
- Existing MSI identity was reviewed: the upgrade code, per-user app-data folder, executable name, registry startup value, and internal agent protocol identifiers remain unchanged. MSI ProductVersion is numeric `2.7.5`, newer than `2.7.4`; the display/release version is `2.7.5-alpha.1`.
- Tampermonkey `@name`, localized names, `@namespace`, and legacy userscript filename are retained to preserve update identity. Product UI and new install assets use ChatDuck. The update URL points to the renamed `fevegit/chatduck` repository and legacy filename.

## Candidate checks

- The generic userscript, self-contained .NET 10 x64 agent, and MSI were rebuilt locally from this source. The previous MSI and previous-name assets were excluded from `release-artifacts`.
- MSI database inspection confirmed `ProductName=ChatDuck Windows Agent`, `ProductVersion=2.7.5`, and the unchanged UpgradeCode `{75A2EB87-3A7D-4A1C-A128-6BD4A88DB93F}`.
- JavaScript tests: 66 passed. Native volume tests: 21 passed. Native HMAC protocol checks passed.
- SHA-256 manifest was generated and verified against exactly the ChatDuck userscript and the new alpha MSI. No WiX debug symbols or previous-name installers remain in the release directory.
- The generic userscript header retains the legacy name/namespace and uses the new repository update URL; no per-install token is embedded.
- Actual MSI install, upgrade, restart, and uninstall on an isolated Windows machine: pending.
- Real Tampermonkey pairing, microphone recording, and browser/player checks on the alpha: pending.
- Update from a real 2.7.4 installation: pending. Do not use the maintainer's daily installation for this test.
- Clean Windows install and compatibility on other computers: not verified; this limitation must remain prominent in alpha notes.
- MSI code signing: not configured.

## GitHub Actions

`.github/workflows/windows-validation.yml` is manual-dispatch only and was not run. Do not trigger it as part of this preparation.

## Alpha publication decision — 2026-11-22

- The maintainer explicitly approved the MIT license and an experimental public alpha; `LICENSE` is now active.
- Clean Windows installation, MSI upgrade/restart/uninstall, live Tampermonkey pairing, actual ChatGPT dictation, and third-party device/browser compatibility remain unverified and are deliberately deferred to community alpha feedback. Never describe them as tested.
- The Windows MSI is unsigned; explain potential Windows warnings.
- The userscript and MSI release assets were built before this license/documentation-only commit. Application source has not changed. Check their existing SHA-256 manifest before publication.
- The existing annotated tag `v2.7.5-alpha.1` still points to the preceding commit; update it to the final licensed `main` commit before publishing the draft.
- The release draft's stale license-pending sentence must be removed and replaced with MIT licensing text.
- Keep GitHub Actions unexecuted as instructed, and publish only after verifying repository visibility, prerelease flag, tag commit, and asset links.
