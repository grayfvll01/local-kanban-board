# Security policy

## Supported versions

Only the [latest release](https://github.com/grayfvll01/local-kanban-board/releases/latest) receives fixes. The app updates itself, so staying current is automatic unless update checks are turned off.

## Reporting a vulnerability

Please report security issues privately through [GitHub security advisories](https://github.com/grayfvll01/local-kanban-board/security/advisories/new). Do not open a public issue. Include steps to reproduce and the app version (Settings → Updates). You should receive a response within a week.

## Design notes

- Local Kanban never uploads your data. The only network request is the optional update check to GitHub Releases.
- Updates are verified against a signing key embedded in the app before they are installed.
- Attachments that are executables or scripts are shown in Explorer instead of being launched.
- The interface runs under a strict content security policy and can only open files inside the active vault.
