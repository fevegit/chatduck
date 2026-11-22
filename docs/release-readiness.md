# Release readiness — v2.7.5 candidate

This local candidate is not a published GitHub release. It is not signed with a code-signing certificate.

## Verified from the inherited 2.7.4 baseline

- The project owner reports manual use with ChatGPT dictation, Spotify Web and desktop, YouTube, Plex Web, and Plex for Windows in Ducking.
- Existing Firefox UI screenshots are included as representative settings-panel captures.
- The original project folder has no Git history; this staged repository starts with a clean local history.

## Checks completed on this local candidate

- A previous .NET 10 Release build produced a self-contained x64 MSI; database inspection confirmed per-user scope and the three expected payloads. The latest rebuild compiled the agent but stopped before MSI generation because this host lacks the WiX UI extension. The Windows workflow installs the pinned extension before building.
- No MSI installation has been run on this computer. The existing local MSI is not evidence of the workflow's built artifact or a clean-install test.
- `node --test tests/*.test.cjs`: 66 passed. The volume suite passed 21 checks; protocol helper checks passed for valid and invalid HMAC inputs.
- The initial staged Git history contained 48 source/documentation files, no local binaries, and no developer token or personal profile path. Build outputs and release assets are ignored.
- SHA-256 values were generated for both local release assets. They must be regenerated after replacing the placeholder repository URL.

## Windows CI status

- .github/workflows/windows-validation.yml is manual-dispatch only, uses one hosted Windows job, read-only repository permissions, pinned first-party actions, a 30-minute timeout, and uploads no artifacts.
- The workflow has not been dispatched. GitHub's billing API is unavailable to the current CLI session, so the plan, remaining included compute, and any hard spending limit could not be verified. Do not dispatch until the account owner confirms the run fits within included usage or a no-overage budget.
- The workflow is prepared to build and hash the release files, run JavaScript and native agent tests, and install, exercise, restart, and uninstall the actual MSI on the ephemeral runner. The local smoke script is guarded so it refuses to run outside a GitHub-hosted Windows runner.
- The MSI smoke test exercises the installed agent over loopback, including a fresh token, unsigned and invalid-pair rejection, HMAC response verification, replay rejection, reconnect, and cleanup. It does not exercise a real Tampermonkey/browser pairing or microphone session.

## Must be completed before publication

- The local userscript and MSI links target `https://github.com/fevegit/audio-ducking`. Keep this repository private until a separate release decision; no release assets have been uploaded. Rebuild and verify hashes after any final release change.
- Dispatch the hosted Windows validation workflow after billing status is confirmed and address any runner-only failures.
- Verify real one-time pairing and expiry, custom-site ticket expiry/use, and Tampermonkey/browser integration separately; a simulated HTTP client is not a substitute for those checks.
- Test update from 2.7.4 with synthetic configuration only. No 2.7.4 installer or synthetic migration fixture is currently available in this staging distribution.
- Test ChatGPT recording and playback with the public candidate installed, plus YouTube, Spotify Web/Desktop, Plex Web, and Plex for Windows. Do not infer these from unit tests.
- Verify no new permission prompts, microphone permission changes, exceptions, or user data in the staged Git history and release assets.
- Review and approve the proposed MIT license, then rename it to `LICENSE`.
- Confirm the final release filenames and SHA-256 values after the Windows VM test.
- Decide whether to sign the MSI. No paid signing certificate was purchased or used.
- Set a maintainer contact or GitHub private vulnerability reporting route before enabling public contributions.

No item above is claimed as complete by static or unit tests alone.
