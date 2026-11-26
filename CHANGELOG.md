# Changelog

# 2.8.4-alpha.5 — Discord latency and resource instrumentation

- Dispatch Discord control as soon as the dictation begin request reaches the agent, concurrently with existing media ducking, removing the media fade from Discord's activation critical path.
- Reuse a validated Discord process/window and cached UIA controls for the pre-action state and watcher setup; invalidate on stale HWND, PID/start-time change, or unavailable elements. Keep a fresh tree read after each toggle before reporting success.
- Use UIA state-change events to wake confirmation early, retaining bounded fresh-state retries when events are unavailable. Avoid periodic UIA polling while no Discord session is active.
- Reuse fresh agent status for up to 10 seconds and skip a redundant status round trip before activation. Record click-to-detection, bridge RTT, Discord dispatch, process lookup, tree search, toggle, confirmation, and process-wide CPU/RAM/thread samples in local diagnostics.
- Add synthetic before/after Mute and Deafen benchmarks. The fixture reports five versus two full-tree discovery passes per activation; live Discord timings, idle resource baselines, and game frametime require a controlled runtime and are not claimed here.
- Advanced MSI ProductVersion to 2.8.6 for alpha.5; stable rollback remains the exact 2.8.3-rc.1 package.

# 2.8.4-alpha.4 — Discord activation and installer repair

- Added an independent Discord activation mode: automatic (preserved as the default for existing settings) or Ctrl+click on ChatGPT's native dictation microphone. The click modifier is captured once and associated with that dictation session; normal clicks continue regular web ducking without sending Discord actions.
- Kept the Mute and Deafen choices independent; Deafen's existing agent coordination avoids duplicating the microphone action when both are enabled.
- Captured the physical click before ChatGPT's control changes, ignored keyboard activation and duplicate clicks, and cleared the gesture at session start, timeout, stop, and unload.
- Advanced MSI ProductVersion from 2.8.4 to 2.8.5 so Windows Installer detects alpha.3 as a major upgrade, and safely stop/restart the current agent for repairs/reinstalls to avoid locked executable freezes.
- Automated gesture, preference gating, translation, session, and installer checks. No personal Discord call was accessed; real Discord UI behavior remains a manual environment limit.

# 2.8.4-alpha.1 — Experimental Discord microphone mute

- Restored the prior UI Automation work and connected a separate, off-by-default Windows preference to the existing agent.
- Control only Discord's microphone toggle. Preserve incoming audio and Windows global input/output state.
- Add serialized begin/restore, event-based manual-override detection, durable same-call recovery, and fail-closed behavior when UIA state observation is unavailable.
- Add synthetic race, concurrency, restore, and restart-recovery regressions. Minimized Discord behavior remains unverified in a controlled call.

# 2.8.0-alpha.2 — Local identity-preserving candidate

- Default new installations to Ducking; preserve saved Pause or Ducking modes and disable automatic Pause/Web Audio mute fallbacks by default.
- Bundle media diagnostics into ChatDuck settings so installation needs one userscript.
- Keep the original userscript name and namespace and stable Windows-agent bridge; add a local rollback image from the committed 2.7.6 code.
- Provide three independent UI studies and a loopback-only page to compare them and install or roll back locally. No release or merge was made.

# 2.8.0-alpha.1 — Universal Web Engine (experimental)

- Replaced opt-in site support with HTTP/HTTPS HTML media control, safe domain exclusions, per-website overrides, and migration of disabled legacy sites/platforms.
- Added frame-local media coordination, open Shadow DOM collection, dynamic-player observation, and event-driven scans without the previous 1.5-second media polling.
- Kept ChatGPT, local agent pages, and common communication services outside media control; made Ducking-to-Pause fallback opt-in by default.
- Broadened userscript matches to all HTTP and HTTPS pages; retained Tampermonkey's isolated DOM sandbox and loopback-only authenticated agent bridge.
- Kept experimental Discord UI Automation isolated from product settings and normal agent commands; synthetic controller checks remain separate, with no live-call actions in this validation.
- Added an isolated LibreWolf QA userscript and temporary read-only media diagnostics for detected players, applied actions, and restore status. Real playback compatibility still needs manual testing across services, browsers, frames, and multiple tabs. Web Audio-only and closed-shadow-root players remain unsupported.

## 2.7.6-beta.1 — Beta transition and Windows agent update

- Prepared a newly built generic userscript and Windows Agent MSI for the beta release.
- Advanced MSI `ProductVersion` to `2.7.6` while retaining the existing UpgradeCode, per-user installation path, executable name, and Start menu identity.
- Preserved the Tampermonkey name, namespace, legacy filename, and raw `main` update URL so existing installs can update in place.
- Clarified Browser Mode, optional Windows Agent capabilities, and compatibility limits; added a beta installer notice and updated English/Spanish documentation.
- Removed retired alpha releases and tags after verifying the beta release and download hashes.

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
