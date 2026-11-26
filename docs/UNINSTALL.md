# Uninstall

## Tampermonkey

1. Open the Tampermonkey dashboard.
2. Find **ChatGPT Audio Ducking** and choose Remove. This is the retained legacy Tampermonkey name used to preserve update identity.
3. Confirm. If Tampermonkey offers to remove stored data for the script, confirm that too.

This removes browser-side behavior and stored settings. It does not uninstall Tampermonkey.

## Windows Agent

1. Open Windows **Settings → Apps → Installed apps**.
2. Select **ChatDuck Windows Agent** and choose Uninstall.
3. The installer stops the agent and restores any media session it manages before removing its program files and startup entry.

Pairing and agent preferences are kept under `%LOCALAPPDATA%\ChatDuck` when the agent is uninstalled. To erase that data too, remove that folder after uninstalling. The uninstaller does not remove other applications, browser extensions, Tampermonkey preferences, or unrelated registry values. Remove the userscript separately if you no longer want web-player control.
