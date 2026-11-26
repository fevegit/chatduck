# Discord activation mode — alpha.4

The Windows tab offers two independent activation modes. `automatic` is the default, including when migrating settings written before this option existed. `ctrl-click` gates only the Discord preferences: every normal microphone click still starts the normal ChatGPT dictation session and the existing web/desktop ducking flow.

The detector captures a physical click (`detail > 0`) on the inactive native dictation microphone during the document capture phase, before ChatGPT handles it. It keeps the first modifier for at most 1.5 seconds, consumes it once when the detector creates the dictation event, and carries the boolean alongside that event ID into the global session snapshot. The agent receives Discord preferences only when that session is automatic or its captured click had Ctrl. Keyboard activation and ordinary clicks do not request Discord actions in `ctrl-click` mode. Ctrl is not sampled again while recording or when restoring.

The existing Discord controller remains responsible for observed Mute/Deafen state, manual overrides, serialized actions, and one restore per session. Enabling both settings continues to let Deafen's microphone effect satisfy Mute without an extra toggle.

## Validation boundary

Automated detector and agent-client checks exercise click filtering, the captured modifier, sequential sessions, automatic and Ctrl-gated preferences, and existing Discord-controller state/recovery regressions. They do not establish that Discord exposes the same accessible microphone button in every client build or while minimized. No personal Discord process, call, token, or UIA tree was accessed for alpha.4; confirm real UIA state only in a separate isolated Discord call.
