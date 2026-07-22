# Local Kanban quality contract

Apply these rules to every product, code, documentation, and release change in this repository.

## Product principles

- Keep the core promise: fast, private, offline-first task planning with no account or cloud dependency.
- Prefer clear defaults and progressive disclosure over settings, modes, and permanent toolbar controls.
- Preserve existing vault data and file formats. Treat migrations, restore, import, and deletion as high-risk operations.
- Keep the public repository page focused on one action: download the current Windows installer.

## Interface quality

- Meet WCAG 2.2 AA interaction requirements: keyboard access, visible focus, 24×24 CSS pixel minimum targets, sufficient contrast, and a non-drag alternative for every drag action.
- Use semantic buttons, labels, dialog roles, meaningful accessible names, and polite status announcements.
- Confirm irreversible destructive actions in plain language and state what will be removed.
- Test empty, loading, filtered, long-content, narrow-window, light-theme, and dark-theme states.
- Respect reduced-motion preferences. Do not communicate status by color alone.

## Engineering quality

- Keep React components typed and warnings-free. Avoid duplicating business state outside the Rust/SQLite boundary.
- Run `npm run version:check`, `npm run typecheck`, `npm run build:vite`, and `cargo check --locked --manifest-path src-tauri/Cargo.toml` before merging.
- Keep generated build output and executable artifacts out of Git; publish installers through GitHub Releases.
- Prefer the smallest dependency-free implementation that keeps behavior understandable and testable.

## Release discipline

- Use semantic versions. Run `npm run version:set -- X.Y.Z`, review all synchronized files, then commit.
- Tag the release commit `vX.Y.Z`. The tag version must equal the application version or the release pipeline must fail.
- Let `.github/workflows/release.yml` build and publish the installer. Never attach locally built binaries to a release.
- Keep release notes brief and user-facing. The stable asset name must remain `Local-Kanban-Setup.exe` so the README download link never changes.

## Primary standards

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Tauri distribution and versioning](https://v2.tauri.app/distribute/)
- [Tauri GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/)
- [GitHub release links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
