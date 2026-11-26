# Windows Agent installer

ChatDuck uses a single x64, framework-dependent, per-user MSI for normal installs, updates, repair, and removal. It does not install a service or scheduled task and does not require elevation for the normal per-user path.

The installer checks the required .NET Desktop Runtime before changing installed files. The agent closes in an orderly way during replacement, starts in the current user's session, and is checked through its authenticated local protocol and reported version before the MSI transaction completes. Failure is handled by Windows Installer rollback. The `HKCU` startup option is user-scoped; preferences and pairing remain outside the program directory.

## MSI component authoring

Each component that installs files under LocalAppData has a Registry table key path rooted at `HKCU`. The agent files and startup value use one fixed-GUID component; the Start Menu shortcut has a separate `HKCU` registry key path. This is the per-user authoring required by [ICE38](https://learn.microsoft.com/en-us/windows/win32/msi/ice38), and avoids file key paths for per-user-profile components.

[ICE91](https://learn.microsoft.com/en-us/windows/win32/msi/ice91) can report expected warnings for resources in LocalAppData and the per-user Start Menu because these locations do not vary with `ALLUSERS`. The package is explicitly per-user and never installs per-machine; those resources are intentionally scoped to the installing user. The warnings are not suppressed. A rollback induced by a real failed MSI transaction has not been exercised in this environment.

Legacy installs from a different MSI context are an exceptional migration case and are not removed by the routine per-user update. Do not remove Windows Installer registration data manually. The MSI is unsigned; verify downloaded files against the SHA-256 manifest in the release.
