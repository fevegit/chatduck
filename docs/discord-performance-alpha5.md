# Discord performance validation — 2.8.4-alpha.5

## Changes measured

| Stage | Before | alpha.5 instrumentation / change |
| --- | --- | --- |
| Click to dictation detection | Not measured | `clickToDetectionMs` captured at the native mic click and reported when ChatGPT's dictation state is detected. |
| Userscript ↔ agent | Status request could precede every begin | Status is reused for 10 seconds when healthy; begin and status bridge RTTs are recorded separately. |
| Discord process/window | Process enumeration on discovery | Validated HWND/PID/process start time is reused; enumeration occurs on cache miss or invalidation. |
| UIA discovery | Five full discovery passes per controller activation | Two full discovery passes in the synthetic benchmark; cached controls are validated before use. |
| Toggle execution | Included in discovery/action path | Toggle invocation has a separate duration. |
| Confirmation | Repeated fixed waits plus fresh discovery | UIA property change wakes confirmation early; success still requires a fresh read of Discord's tree. Bounded retries remain if the event is late or unavailable. |
| CPU / RAM / threads | Not separately observable | Agent logs a process-wide CPU delta, working set, and thread count for each active Discord begin. This is an activation sample, not an idle or per-feature attribution. |

## Comparative synthetic benchmark

`tests/agent-regressions/Program.cs` runs 11 Mute and 11 Deafen activations for each implementation against an isolated provider. The fixture adds a deterministic 8 ms cost per full-tree scan and a 2 ms toggle cost. It verifies the state transition and reports median elapsed time plus full-tree scan count. Expected reduction is 5 to 2 scans (60%). The actual median is emitted by the regression runner; the synthetic delay is not a measurement of Discord's UIA provider.

The old path serialized Discord begin after the media fade and incurred a 250 ms minimum ducking fade before dispatch. alpha.5 starts Discord control concurrently with the existing media operation. Thus the media fade is removed from Discord's dispatch critical path, though the response to the begin request still waits for existing media work and Discord confirmation.

## Limits

The official desktop hotkeys support mute/deafen, and custom desktop keybinds can be configured, but ChatDuck does not synthesize global key presses: a shortcut can collide with the user's own input and does not itself confirm which Discord control changed. The Social SDK exposes `SetSelfMute` / `SetSelfDeaf` to applications using an integrated Discord call; the documented Discord desktop RPC access to voice settings is read-only. Neither provides an authorized generic control surface for an unrelated installed Discord client. UI Automation remains the available direct control path without focus changes or code injection. References: [Discord keybinds](https://support.discord.com/hc/en-us/articles/217083547-How-do-I-add-different-Keybinds), [Discord desktop shortcuts](https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide), [Discord Social SDK Call](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1Call.html), and [Social SDK release notes](https://discord.com/developers/docs/social-sdk/release_notes.html).

No live Discord window, personal call, game, or browser was accessed. Real process-bridge latency, Discord's minimized-window accessibility tree, actual toggle and confirmation latency, agent idle CPU/RAM/thread baseline, and game FPS/frametime/input latency could not be measured safely in this run. Diagnostics in the installed agent can collect activation-time data without sending input to the global Windows microphone or bringing Discord to the foreground. Synthetic tests do not prove that Discord's own UIA implementation raises the expected state event or exposes the same tree on every client version.

No change was made to YouTube, Spotify, Plex, or web ducking algorithms.
