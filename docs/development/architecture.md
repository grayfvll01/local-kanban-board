# Architecture Notes

local-kanban-word is a local-first Tauri desktop app. The source application lives in `/app`. The frontend is React and TypeScript, and the backend is a Rust command layer over SQLite.

The main long-form architecture reference now lives in [TECHNICAL-REFERENCE.md](TECHNICAL-REFERENCE.md).

## Reference Inspiration

The Bunbun reference app uses a Vite/React Kanban interface with browser-local persistence, card detail modals, Markdown rendering, GFM checkboxes, image paste/upload, color-coded cards, and import/export. Those product ideas informed local-kanban-word, but the implementation is original and built for Tauri, vault storage, and SQLite persistence.

## Core Layers

- `app/src-tauri/src/lib.rs`: vault config, SQLite migrations, transactions, file attachments, import/export, backup/restore, and Tauri commands.
- `app/src/db/api.ts`: typed invoke wrapper used by React.
- `app/src/features/boards`: board sidebar and board actions.
- `app/src/features/cards`: Kanban board surface, drag-and-drop, explicit card movement controls, and Markdown card drawer.
- `app/src/styles`: theme definitions and CSS variable-backed component styling.

## Data Flow

React loads a snapshot from `load_snapshot`. If no vault is configured, the snapshot marks `vault_required`, and the UI asks the user to select a vault. Mutations call Rust commands, write to SQLite, and update or reload React state.

The selected vault path is stored in the app config folder for `com.local.localkanbanword`. The active vault contains `kanban.sqlite`, `attachments`, `backups`, and `exports`.
