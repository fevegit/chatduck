# Security

## Local agent boundary

The optional agent listens on `127.0.0.1:48731`; it rejects non-loopback peers and unexpected `Host` values. The userscript pairs only after the user launches **ChatDuck Agent**. The agent opens a five-minute, random, single-use pairing code in the URL fragment. The code is never included in the HTTP request path or agent logs. The returned per-install token is stored in Tampermonkey storage and the current user's agent configuration.

Regular browser-agent commands and responses after pairing are authenticated with HMAC-SHA-256. Requests include a timestamp and one-use nonce to reject stale or replayed commands. The agent does not serve a token-bearing userscript from an unauthenticated endpoint. Custom-site script downloads use short-lived, single-use tickets created by an authenticated request.

For migration and uninstall only, the local agent may try one legacy Bearer-authenticated shutdown request if a signed shutdown fails, so an older agent can exit. This is sent by the local Windows process to `127.0.0.1`, never by the userscript, and is not written to logs.

The listener uses local HTTP rather than TLS. The pairing code and command signatures protect the normal browser/agent flow; local software running as the same Windows user can access that user's files and remains outside this boundary. Do not run untrusted programs under your account.

## Agent authority

The agent runs without elevation and controls only selected media sessions and per-application volume. It does not record microphone audio or modify system master volume. The optional startup value is per-user, disabled by default, and names only this application.

## Reporting

Please use the private security reporting option in the GitHub repository once its owner and contact route are configured. Until then, do not put tokens, pairing codes, personal paths, or unredacted logs in public issues.
