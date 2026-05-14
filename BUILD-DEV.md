# Developer Build Guide

This guide is for contributors who want to run or package local-kanban-board from source. Normal users should download the Windows app from GitHub Releases instead.

For architecture details, see [TECHNICAL-REFERENCE.md](TECHNICAL-REFERENCE.md).

## Prerequisites

- Node.js with npm
- Rust toolchain with Cargo
- Visual Studio C++ Build Tools
- WebView2 Runtime, usually already installed on modern Windows

If Cargo is installed under `%USERPROFILE%\.cargo\bin` but not on `PATH`, the helper scripts add that folder for the current script run.

## Install Dependencies

```bat
scripts\setup.bat
```

This installs npm packages and runs a Rust project check.

## Run In Development

```bat
scripts\dev.bat
```

This starts Vite and Tauri development mode.

## Build The Windows App

```bat
scripts\build.bat
```

The direct executable is generated at:

```text
src-tauri\target\release\local-kanban-board.exe
```

The NSIS installer is generated at:

```text
src-tauri\target\release\bundle\nsis\local-kanban-board_0.1.0_x64-setup.exe
```

## Useful Commands

```bat
npm run typecheck
cd src-tauri
cargo test
cd ..
npm run build
```

## Troubleshooting

- If `cargo` is not found, install Rust or add `%USERPROFILE%\.cargo\bin` to `PATH`.
- If native Windows linking fails, verify Visual Studio C++ Build Tools are installed.
- If Tauri cannot start, verify the WebView2 Runtime is available.
- If a dev window opens but data is missing, check that a vault folder is selected.
- If a vault folder was moved or deleted, the app will ask you to choose another vault.

## App Data And Vault Notes

The selected vault path is stored in the stable app config folder for the Tauri identifier `com.local.localkanbanboard`.

The vault itself contains:

```text
kanban.sqlite
attachments/
backups/
exports/
```

Do not commit personal vaults, generated backups, attachments, or local data files. The repository `.gitignore` excludes common local data and release artifact paths.

## Release Flow

1. Run `npm run typecheck`.
2. Run `cargo test` from `src-tauri`.
3. Run `scripts\build.bat`.
4. Upload the generated Windows executable or installer to GitHub Releases.
5. Use `release/` only as a local staging area when needed.
