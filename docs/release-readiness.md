# Release readiness — ChatDuck v2.7.5-alpha.1

This is an experimental alpha candidate. The repository remains private while the proposed MIT license awaits explicit approval. Do not describe the product as stable.

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

## Before public release

- Approve the proposed MIT license explicitly, then rename `LICENSE.proposed-MIT.txt` to `LICENSE`.
- Complete isolated Windows install/upgrade/restart/uninstall validation and real ChatGPT recording checks.
- Complete Tampermonkey pairing/update and supported player regression checks.
- Rebuild the public userscript and MSI from the final commit, inspect both, and verify the attached SHA-256 manifest.
- Review issue/security reporting routes and release notes. Keep the repository private until the license is approved.
