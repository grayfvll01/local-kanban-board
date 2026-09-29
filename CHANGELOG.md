# Changelog

All notable changes to Local Kanban are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-09-28

### Added
- Six new themes: Paper, GitHub, Tokyo Night, Rosé Pine, Dracula, and Solarized, each with light and dark versions.
- Layout modes: Comfortable, Compact (fits more on screen), and Minimal (titles, priority, and dates only, no decoration).
- A visual theme picker in Settings → Appearance.

### Changed
- Every theme now meets WCAG 2.2 AA contrast for text, including the original five. Some muted text and status colors are slightly stronger as a result.
- Only common document and media attachments open directly. Other file types are shown in Explorer so they never run by accident.
- Web images in task notes are shown as links instead of loading automatically, so viewing notes never goes online.

### Fixed
- Moving a task with the keyboard keeps focus on it, so you can keep moving it.
- A column filter from another board no longer hides every task.
- Pasting text from Excel or Word pastes the text instead of attaching a picture.
- Removing an attachment that is open in another app now says so instead of leaving the file behind.
- Exports no longer write missing attachments as empty files, and imports never overwrite a good file with an empty one.
- If an update fails to install, the error is shown and you can try again.
- On narrow windows, the hidden sidebar no longer takes keyboard focus, and Esc closes it.

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

[1.1.0]: https://github.com/grayfvll01/local-kanban-board/releases/tag/v1.1.0
[1.0.0]: https://github.com/grayfvll01/local-kanban-board/releases/tag/v1.0.0
