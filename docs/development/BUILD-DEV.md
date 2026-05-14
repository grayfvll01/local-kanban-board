# Developer Build Guide

This guide is for contributors who want to run or package local-kanban-word from source. Normal users should download the Windows app from GitHub Releases or use staged builds in `releases/windows/`.

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
app\src-tauri\target\release\local-kanban-word.exe
```

The NSIS installer is generated at:

```text
app\src-tauri\target\release\bundle\nsis\local-kanban-word_0.1.0_x64-setup.exe
```

## Stage Windows Builds

Public releases should be attached to GitHub Releases. If you intentionally stage a build in the repository, copy it to `/releases/windows`.

From the repository root:

```bat
copy app\src-tauri\target\release\local-kanban-word.exe releases\windows\
copy app\src-tauri\target\release\bundle\nsis\local-kanban-word_0.1.0_x64-setup.exe releases\windows\
```

## Vault Notes

The selected vault path is stored in the stable app config folder for the Tauri identifier `com.local.localkanbanword`.

The vault itself contains:

```text
kanban.sqlite
attachments/
backups/
exports/
```

Do not commit personal vaults, generated backups, attachments, exports, or local database files. The repository `.gitignore` excludes common local data and allows deliberate Windows release artifacts only in `releases/windows/`.
