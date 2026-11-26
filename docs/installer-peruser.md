# ChatDuck per-user MSI

## Authoritative build

Run `scripts/build-installer.ps1`. It emits one framework-dependent x64 MSI and one userscript in `out/`; publish and WiX intermediates stay under `out/.work/`. The version for this consolidated package is `2.8.8-rc.1` (MSI `ProductVersion` `2.8.8`, assembly/file version `2.8.8.0`). The MSI upgrade code remains stable across this product line.

The package installs under `%LOCALAPPDATA%\Programs\ChatGPTAudioDuckingTM`. The HKCU Run value starts one normal-user process at logon. Agent preferences, pairing token, downloaded userscript, logs, and recovery state live in `%LOCALAPPDATA%\ChatDuck`; first launch copies legacy files there only when a destination does not already exist, and never deletes the source. Uninstall removes program files and the startup value but preserves user data.

The product version is defined once in `agent/AudioDuckingAgent.csproj`. The build reads it for the MSI and userscript, disables automatic Git revision suffixing in `AssemblyInformationalVersion`, and stores the commit hash in separate `SourceRevisionId` assembly metadata and the authenticated status field. Before accepting the package, `tests/verify-msi-agent-version.ps1` extracts the EXE from the MSI and executes its strict version verifier with matching and mismatching versions.

Before the execute transaction, a WiX launch condition searches for .NET 10 Windows Desktop runtime x64 in the per-user and machine runtime locations. It does not download or install prerequisites. A synchronous pre-install action requests graceful shutdown from the existing per-user agent. After files and the HKCU startup entry are installed, a deferred action starts the new agent and waits for an authenticated `/v1/command` status response. It checks informational version, executable path, PID, logon session, and non-elevated identity before returning success. A mismatch fails the transaction. No `asyncNoWait` action is used.

The rollback script queues a stop action for the new agent before its start action; it checks the active process path/version before sending shutdown, so it will not stop a different or legacy agent. When rollback proceeds, it stops the new process before MSI restores files. An embedded copy of the single-file framework-dependent agent then starts the restored executable and requires an authenticated status response matching the launched PID, restored path, logon session, and normal-user identity. The restore action is scheduled only when Windows Installer detects an older agent executable before the transaction; a clean install has no previous process to restore. A failed rollback start/check surfaces as rollback failure instead of being reported as success. Real MSI rollback execution is not claimed here.

## ICE38 and ICE91

Every component that installs files under LocalAppData has a Registry table key path rooted at HKCU. The agent files and HKCU Run value are one fixed-GUID component; the Start Menu shortcut has a separate HKCU registry key path. This is the authoring ICE38 requires, avoiding file key paths for per-user-profile components. See [Microsoft ICE38](https://learn.microsoft.com/en-us/windows/win32/msi/ice38).

ICE91 may report expected warnings for the files in LocalAppData and the per-user Start Menu shortcut because those directories do not vary with `ALLUSERS`. This package is explicitly per-user and never installs per-machine, so each such resource is intentionally scoped to the installing user. The warnings are not suppressed. See [Microsoft ICE91](https://learn.microsoft.com/en-us/windows/win32/msi/ice91).

## Scope and limits

The ordinary per-user MSI upgrades only the per-user ChatDuck product with the matching upgrade code. It does not remove or rewrite legacy per-machine products; cross-context migration remains a separate, exceptional operation. If a legacy per-machine process still owns the single-instance mutex, the new agent cannot pass the path/version check and the transaction must fail rather than report a false success. No live Discord call or browser session is touched.

## Observed failed installation record

On 2026-11-26 the failed clean-install attempt used ProductCode `{7418F7B0-E537-417D-97CC-C47AF92904B2}` (packed ProductCode `0B7F8147735ED71479CC4CA79F92402B`). `MsiEnumProductsEx` found it only in context 2, per-user unmanaged, for the current SID; it was not a per-machine registration. The decompiled MSI also declares `Scope="perUser"` and its authored registry components target HKCU. The HKLM uninstall entry and `HKLM\Software\Microsoft\Windows\CurrentVersion\Installer\UserData\<SID>\Products\0B7F8147735ED71479CC4CA79F92402B\InstallProperties` are Windows Installer registration records, not application-authored keys. The per-user product record also appears under `HKCU\Software\Microsoft\Installer\Products\0B7F8147735ED71479CC4CA79F92402B`.

The rollback log reports Win32 error 5 (access denied) while Windows Installer edits `HKCU`/`HKEY_USERS\<SID>\Software\Microsoft\Installer\Products\0B7F8147735ED71479CC4CA79F92402B\SourceList` and the SID-scoped HKLM `InstallProperties`; messages 1401/1403 are the corresponding create/delete-value failures. Those are MSI-managed metadata paths, not authored Registry table entries. The records remain registered after the failed transaction while app files and the Run value are absent, so this ProductCode is a residual failed-install registration. No registry keys or ACLs were manually changed. Package authoring cannot safely override Windows Installer's internal metadata permissions; the package-attributable rollback defect was the unconditional restore helper on a clean install, now guarded by a pre-transaction search. The real MSI rollback path has not been rerun.
