# Developer Build Guide

This guide is for contributors who want to run or package Local Kanban from source. Normal users should use the download link in the repository README.

The source app lives in `/app`. Run development commands from that folder.

For architecture details, see [TECHNICAL-REFERENCE.md](TECHNICAL-REFERENCE.md).

## Prerequisites

- Node.js with npm
- Rust toolchain with Cargo
- Visual Studio C++ Build Tools
- WebView2 Runtime, usually already installed on modern Windows

If Cargo is installed under `%USERPROFILE%\.cargo\bin` but not on `PATH`, the helper scripts add that folder for the current script run.

## Setup

```bat
cd app
scripts\setup.bat
```

This installs npm packages and runs a Rust project check.

## Development

```bat
cd app
scripts\dev.bat
```

This starts Vite and Tauri development mode.

## Build Commands

```bat
cd app
npm run typecheck
cd src-tauri
cargo test
cd ..
scripts\build.bat
```

The direct executable is generated at:

```text
app\src-tauri\target\release\local-kanban.exe
```

The NSIS installer is generated at:

```text
app\src-tauri\target\release\bundle\nsis\Local Kanban_1.0.0_x64-setup.exe
```

## Publish a release

Synchronize the semantic version with `npm run version:set -- X.Y.Z`, commit it, and push a matching `vX.Y.Z` tag. The release workflow builds the clean source revision and publishes `Local-Kanban-Setup.exe` to GitHub Releases.

## Vault Notes

The selected vault path is stored in the stable app config folder for the Tauri identifier `com.local.localkanbanword`.

The vault itself contains:

```text
kanban.sqlite
attachments/
backups/
exports/
```

Do not commit personal vaults, generated backups, attachments, exports, local database files, or built executables. The repository `.gitignore` excludes these artifacts.
