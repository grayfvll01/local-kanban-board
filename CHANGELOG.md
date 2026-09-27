# Changelog

All notable changes to Local Kanban are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-27

First public release.

### Added
- Automatic updates: the app checks GitHub Releases for a signed update and installs it with one click. Can be turned off in Settings.
- Automatic daily backups (the 10 most recent are kept), plus a backup before every import or restore.
- Move columns left or right, and move tasks with Alt+Arrow keys or the task menu.
- Attach any file from the task drawer, paste or drop images into notes, and open links in your browser.
- Clear confirmations for destructive actions and visible error messages when something can't be saved.

### Fixed
- Drag and drop now works on Windows.
- Images attached to tasks now display in the notes preview.
- Imports and restores are validated first and never leave a vault half-replaced.
- Deleted boards no longer reappear as a sample board after restarting.
- Moved or copied vault folders keep their attachments working.
- Only one copy of the app runs at a time, and window size and position are remembered.

[1.0.0]: https://github.com/grayfvll01/local-kanban-board/releases/tag/v1.0.0
