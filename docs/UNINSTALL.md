# Uninstall

## Tampermonkey

1. Open the Tampermonkey dashboard.
2. Find **ChatGPT Audio Ducking** and choose Remove.
3. Confirm. If Tampermonkey offers to remove stored data for the script, confirm that too.

This removes browser-side behavior and stored settings. It does not uninstall Tampermonkey.

## Windows Agent

1. Open Windows **Settings → Apps → Installed apps**.
2. Select **Audio Ducking Windows Agent** and choose Uninstall.
3. The installer stops the agent and restores any media session it manages before removing its own program files, token, custom-site list, and local log.

The uninstaller removes only the agent's own `HKCU` startup value and installation data. It does not remove other applications, browser extensions, Tampermonkey preferences, or unrelated registry values. Remove the userscript separately if you no longer want web-player control.
