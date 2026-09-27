# Releasing

Releases are built, signed, and published only by `.github/workflows/release.yml`. Never attach locally built installers.

## One-time setup

Updates are signed with a private key. The matching public key is in `app/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

The repository needs two Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

Keep an offline backup of the key and password. If the key is lost, installed copies can no longer update automatically, and users must reinstall once from the download link.

## Release steps

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
2. From `app`, run `npm run version:set -- X.Y.Z` and review the synchronized files.
3. Run `npm run check` and `npm run test:rust`.
4. Commit, then tag and push:

   ```bat
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

The workflow verifies that the tag matches the app version, builds the NSIS installer, signs it, uploads `Local-Kanban-Setup.exe`, `Local-Kanban-Setup.exe.sig`, and `latest.json` to a draft release, checks all three exist, and then publishes the release with the changelog section as notes.

## How updates reach users

The app reads `https://github.com/grayfvll01/local-kanban-board/releases/latest/download/latest.json` a few seconds after launch (unless turned off in Settings). When a newer signed version exists, a button in the status bar offers to install it. The installer runs in passive mode and reopens the app.

The stable asset name `Local-Kanban-Setup.exe` keeps the README download link working for every release.
