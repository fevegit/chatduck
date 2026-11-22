# Release readiness — v2.7.5 candidate

This local candidate is not a published GitHub release. It is not signed with a code-signing certificate.

## Verified from the inherited 2.7.4 baseline

- The project owner reports manual use with ChatGPT dictation, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows in Ducking.
- Existing Firefox UI screenshots are included as representative settings-panel captures.
- The original project folder has no Git history; this staged repository starts with a clean local history.

## Checks completed on this local candidate

- .NET 10 Release build and self-contained x64 MSI compilation succeeded.
- MSI database inspection confirmed per-user scope and the expected three payloads: agent executable, settings page, and generic userscript template. This was package inspection, not an install test.
- `node --test tests/*.test.cjs`: 66 passed. The volume suite passed 21 checks; protocol helper checks passed for valid and invalid HMAC inputs.
- The staged Git history contains 48 source/documentation files, no remote, no local binaries, and no developer token or personal profile path. Build outputs and release assets are ignored.
- SHA-256 values were generated for both local release assets. They must be regenerated after replacing the placeholder repository URL.

## Must be completed before publication

- The local userscript and MSI links target `https://github.com/fevegit/audio-ducking`. Keep this repository private until a separate release decision; no release assets have been uploaded. Rebuild and verify hashes after any final release change.
- Install, pair, disconnect, restart, update from 2.7.4, and uninstall the MSI in a disposable Windows VM or Windows Sandbox; inspect that only the current test user's app files and startup value change.
- Verify signed request/response exchange, replay rejection, one-time pairing expiry/use, and custom-site ticket expiry/use against the built agent.
- Test ChatGPT recording and playback with the public candidate installed, plus YouTube, Spotify Web/Desktop, Plex Web, and Plex for Windows. Do not infer these from unit tests.
- Verify no new permission prompts, microphone permission changes, exceptions, or user data in the staged Git history and release assets.
- Review and approve the proposed MIT license, then rename it to `LICENSE`.
- Confirm the final release filenames and SHA-256 values after the Windows VM test.
- Decide whether to sign the MSI. No paid signing certificate was purchased or used.
- Set a maintainer contact or GitHub private vulnerability reporting route before enabling public contributions.

No item above is claimed as complete by static or unit tests alone.
