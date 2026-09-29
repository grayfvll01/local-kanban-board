# Contributing

Thanks for helping improve Local Kanban. Bug reports, small fixes, and focused improvements are welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Keep the product promise: fast, private, offline-first, no account. Prefer good defaults over new settings.
- Never change vault data or file formats without a migration and tests.

## Development

See [docs/development/BUILD-DEV.md](docs/development/BUILD-DEV.md) for prerequisites. From `app/`:

```bat
npm ci
npm run dev
```

Before opening a pull request, run the same checks as CI (`check` includes clippy with warnings as errors):

```bat
npm run check
npm run test:rust
```

## Pull requests

- One focused change per pull request, with a short description of the user-facing effect.
- Add or update tests for behavior changes, and add a line to `CHANGELOG.md` under an `Unreleased` heading.
- Interface changes must keep keyboard access, visible focus, and a non-drag alternative for every drag action.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
