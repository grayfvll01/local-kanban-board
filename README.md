# local-kanban-board

local-kanban-board is a local-first desktop Kanban app for Windows. It keeps your boards, cards, attachments, backups, and exports in a folder you choose, with no account and no cloud service required.

## Screenshots

Screenshots will be added here before the first public release.

## Features

- Local-first Kanban boards stored in your selected vault
- Multiple boards, custom columns, and rich cards
- Card movement controls for moving cards left, right, up, and down as a precise alternative to drag-and-drop
- Theme selector with Default, Everforest, Catppuccin, Nord, and Gruvbox themes
- Dark, light, and system appearance modes
- Markdown card descriptions with task checkboxes
- Pasted and uploaded image/file attachments
- Tags, priorities, due dates, search, and filters
- JSON import/export, board export to Markdown and CSV, and vault data backups

## Install

1. Download the latest Windows `.exe` or installer from GitHub Releases.
2. Run the app.
3. On first launch, choose or create a vault folder.
4. Start creating boards, columns, and cards.

Normal users do not need Node.js, Rust, or a source build.

## What Is A Vault?

A vault is the folder where local-kanban-board saves your workspace. It contains your board data, attachments, backups, and exports.

Choose a folder you can find again, such as a folder in Documents. Do not choose a temporary download folder if you want your board to stay there long term.

## Basic Use

- Use the sidebar to switch boards or create a board.
- Use the top toolbar to search, filter, create a column, open settings, switch appearance, or reload from the vault.
- Use the plus button inside a column to create a card in that column.
- Open a card to edit Markdown details, tags, priority, due date, color, and attachments.
- Use Settings to change vaults, open the current vault folder, make backups, restore backups, and import or export data.

## Privacy

local-kanban-board is designed for offline use.

- No account is required.
- No cloud sync is included.
- No telemetry is included.
- Your data stays in the selected vault unless you move, back up, export, or share it yourself.

## Reporting Issues

Use the repository issue tracker for bugs, feature requests, and release problems. Include your Windows version, app version, and a short description of what happened.

## Developer Setup

Developer setup and build instructions live in [BUILD-DEV.md](BUILD-DEV.md). Architecture and maintenance notes live in [TECHNICAL-REFERENCE.md](TECHNICAL-REFERENCE.md).

## License

No license file is currently included. Add a license before publishing or accepting external contributions.
