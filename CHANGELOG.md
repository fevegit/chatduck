# Changelog

## 2.7.5-alpha.2 — Browser-first setup

- Put web playback, Pause/Ducking, target volume, and supported player toggles in the main settings view.
- Fold Windows Agent, desktop controls, custom sites, permissions, and technical settings under Advanced; open it by default for a paired agent.
- Show a positive browser-ready state when supported web integrations are enabled, and stop sending local agent requests when no pairing token is configured.
- Keep the alpha.1 Windows Agent MSI as an optional, clearly versioned download; no MSI rebuild was needed.

## 2.7.5-alpha.1 — ChatDuck public alpha candidate

- Rebranded the product, settings panel, Windows Agent installer, Start menu shortcut, and documentation as ChatDuck.
- Prepared generic userscript and Windows Agent release assets for `fevegit/chatduck`.
- Preserved the existing Tampermonkey update identity, legacy script filename, MSI UpgradeCode, and installed agent paths/names for upgrade compatibility.
- Added an explicit alpha notice and documented installation, compatibility, and verification limits.

- Added local first-run pairing with a per-install random token; the token is not embedded in the userscript.
- Signed local agent commands and responses with HMAC-SHA-256, timestamps, and replay-resistant nonces.
- Replaced open local userscript delivery with short-lived, single-use download tickets.
- Added a localized Windows Agent installation link and an explicit, opt-in per-user startup setting.
- Added a per-user Windows installer build and privacy, permissions, security, installation, and uninstall documentation.
- Kept the 2.7.4 audio-control engine and web integration behavior unchanged.

This alpha still requires the isolated Windows installation and live ChatGPT recording checks listed in `docs/release-readiness.md`.
