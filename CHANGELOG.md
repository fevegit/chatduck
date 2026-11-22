# Changelog

## 2.7.5 — public release candidate

- Added local first-run pairing with a per-install random token; the token is not embedded in the userscript.
- Signed local agent commands and responses with HMAC-SHA-256, timestamps, and replay-resistant nonces.
- Replaced open local userscript delivery with short-lived, single-use download tickets.
- Added a localized Windows Agent installation link and an explicit, opt-in per-user startup setting.
- Added a per-user Windows installer build and privacy, permissions, security, installation, and uninstall documentation.
- Kept the 2.7.4 audio-control engine and web integration behavior unchanged.

This candidate still requires the clean Windows installer and live ChatGPT recording checks listed in `docs/release-readiness.md`.
