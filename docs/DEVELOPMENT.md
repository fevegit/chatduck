# Development and release build

## Source of truth

- `src/` contains the userscript modules; `ChatGPT-Audio-Ducking.user.js` is the reviewed, versioned distribution bundle.
- `agent/` contains the optional Windows Agent and WiX product authoring.
- `installer/` contains the Windows Installer custom action source.
- `tests/` contains JavaScript, agent, package, and installer regression tests and isolated fixtures.
- `scripts/build-public.ps1` builds the userscript. `scripts/build-installer.ps1` is the authoritative MSI and release-package builder; `scripts/build-release.ps1` is its release entry point.

## Build requirements

- Windows x64, PowerShell 7, Node.js 22, and .NET 10 SDK.
- WiX Toolset 4.0.3 with `WixToolset.UI.wixext/4.0.3`.
- .NET Framework 4.8 for the non-destructive Windows Installer custom-action probe.

Install the pinned WiX tools, then build:

```powershell
dotnet tool install --tool-path .tools wix --version 4.0.3
./.tools/wix.exe extension add --global WixToolset.UI.wixext/4.0.3
./scripts/build-release.ps1 -RepositoryUrl 'https://github.com/fevegit/chatduck'
```

The script derives the product version from `agent/AudioDuckingAgent.csproj`, performs package and installer-action checks, and writes the userscript, per-user framework-dependent x64 MSI, and `SHA256SUMS.txt` only to `out/` (intermediates to `out/.work/`). Review the checksum manifest and validation output before release. The MSI is unsigned.

## Tests

```powershell
node --test tests/*.test.cjs
dotnet run --project tests/agent-regressions/ChatDuckAgent.RegressionTests.csproj --configuration Release
```

The build script also compiles and runs installer upgrade-filter regressions and a non-destructive Windows Installer custom-action probe. These checks do not replace testing on other Windows hardware or with each supported media application.

## Installer model

Normal installation and updates use one per-user MSI. Preferences and pairing are stored separately from the installed program files. Exceptional migration from legacy installation contexts is outside the routine MSI flow. See [Windows installer](installer-peruser.md).
