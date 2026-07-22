# Technical Reference

This document is for future maintainers and AI-assisted development. The user-facing overview is in [../../README.md](../../README.md), and build instructions are in [BUILD-DEV.md](BUILD-DEV.md).

## 1. Project Overview

Local Kanban is an offline desktop Kanban app. It uses a Tauri shell, a React/TypeScript frontend, and a Rust command layer that persists data to SQLite inside a user-selected vault folder.

The source application lives in `/app`; run npm, Vite, Tauri, and Cargo workflows from there unless a command explicitly says to start from the repository root.

Architecture goals:

- Local-first behavior with no cloud dependency
- Offline desktop use on Windows
- Vault-based persistence owned by the user
- SQLite for durable structured data
- Filesystem storage for attachments, backups, and exports
- React frontend with a small typed command wrapper

## 2. Technology Stack

- Tauri: desktop wrapper, native window, build packaging, and Rust command bridge. Config lives in `app/src-tauri/tauri.conf.json`.
- Rust: backend command implementation in `app/src-tauri/src/lib.rs`.
- rusqlite: bundled SQLite access, migrations, transactions, WAL configuration, and persistence tests.
- rfd: native folder picker for vault selection.
- opener: opens vault files and folders through the OS.
- React: frontend application and component composition under `app/src`.
- TypeScript: typed UI state, command inputs, and snapshot models.
- Vite: frontend development server and production bundling.
- Tailwind CSS: utility layout classes plus app-specific CSS in `app/src/styles/app.css`.
- React Markdown and remark-gfm: Markdown preview, task checkboxes, and image rendering in card details.
- lucide-react: icon set for toolbar, card, and settings controls.
- Native HTML drag-and-drop: card movement across columns and within columns. Arrow buttons remain available as precise movement controls.

## 3. Folder Structure

- `app`: source code, Tauri config, npm package files, scripts, and frontend build config.
- `app/src`: React frontend entry, UI components, feature modules, hooks, styles, and shared types.
- `app/src/components`: small reusable UI components.
- `app/src/features/boards`: board sidebar and board-level interactions.
- `app/src/features/cards`: Kanban board surface, drag-and-drop, card movement controls, and card drawer.
- `app/src/db`: typed Tauri invoke wrapper.
- `app/src/hooks`: keyboard shortcut and React hook helpers.
- `app/src/styles`: theme definitions and CSS variable-backed component styles.
- `app/src/types`: shared frontend models matching Rust snapshots.
- `app/src-tauri`: Tauri, Rust backend, SQLite persistence, packaging config, and Rust tests.
- `docs/development`: supplemental technical notes.
- `app/scripts`: Windows helper scripts for setup, development, and production builds.
- `.github/workflows`: quality checks and version-tagged Windows releases.

The frontend treats Rust as the source of truth. It loads a full snapshot, performs optimistic local updates for common mutations, and uses reloads for import/restore or larger state changes.

## 4. Theme System

Themes are centralized in `app/src/styles/themes.ts`.

The theme system exposes semantic tokens rather than raw palette names:

- `appBg`
- `sidebarBg`
- `toolbarBg`
- `boardBg`
- `columnBg`
- `columnHeaderBg`
- `cardBg`
- `cardHoverBg`
- `modalBg`
- `popoverBg`
- `inputBg`
- `buttonBg`
- `buttonHoverBg`
- `addColumnBg`
- `addColumnHoverBg`
- `textPrimary`
- `textSecondary`
- `textMuted`
- `border`
- `borderStrong`
- `accent`
- `accentHover`
- `success`
- `warning`
- `danger`
- `shadow`

`applyThemeTokens` resolves the selected family and mode, writes CSS variables to `document.documentElement`, toggles the `dark` class, and records `data-theme`, `data-theme-mode`, and `data-resolved-theme-mode`.

Supported theme families:

- Default
- Everforest
- Catppuccin
- Nord
- Gruvbox

Supported modes:

- Dark
- Light
- System

To add a theme, add a family entry to `themeDefinitions`, include both dark and light token maps, add a label to `themeFamilies`, and verify key surfaces such as sidebar, toolbar, modals, inputs, columns, and cards.

## 5. Database Architecture

The active vault contains the SQLite database file `kanban.sqlite`.

Tables:

- `boards`: board metadata and board ordering.
- `columns`: column metadata, board relationship, WIP limit, and column ordering.
- `cards`: card metadata, column relationship, priority, due date, color, and card ordering.
- `card_tags`: normalized card tags.
- `attachments`: attachment metadata and vault file paths.
- `app_settings`: selected board, search/filter state, theme selection, and window state.

Relationships:

- Boards own columns and cards.
- Columns belong to boards.
- Cards belong to boards and columns.
- Tags and attachments belong to cards.
- Foreign keys cascade delete child records.

Persistence flow:

1. React calls a typed function in `app/src/db/api.ts`.
2. The wrapper invokes a Tauri command.
3. Rust validates the active vault and writes through SQLite.
4. Rust returns a record or the frontend reloads a snapshot.
5. React updates local state.

SQLite configuration:

- Foreign keys enabled
- WAL journaling
- `synchronous=NORMAL`
- Busy timeout
- Transactions for grouped writes, import, setup, and ordering changes

Migration strategy is currently inline `CREATE TABLE IF NOT EXISTS` statements in `Database::migrate`. Future schema changes should add explicit version tracking before destructive or multi-step migrations are introduced.

## 6. Vault System

A vault is the user-selected folder containing all local workspace data.

Expected structure:

```text
kanban.sqlite
attachments/
backups/
exports/
```

Vault initialization happens in `Database::open_at`:

1. Create the vault folder if needed.
2. Create required subfolders.
3. Open `kanban.sqlite`.
4. Configure SQLite.
5. Run migrations.
6. Seed starter content if the database is empty.

The selected vault path is stored in the app config folder for identifier `com.local.localkanbanword`. The vault path is not stored in the database because it is needed before the database can be opened.

When the vault is missing or cannot be opened, the snapshot marks `vault_required`, and the UI asks the user to select a vault. Changing vaults writes the new path, opens or initializes that vault, and refreshes the UI. The previous vault is not deleted.

## 7. Drag-And-Drop And Card Movement

Cards support drag-and-drop and explicit movement buttons:

- Drag a card onto another card to place it before that card.
- Drag a card into a column to place it at the end.
- Left and right buttons move a card to adjacent columns.
- Up and down buttons reorder a card inside its current column.
- Buttons are hidden when movement is not possible.

Movement flow:

1. `KanbanBoard` computes available movement per card.
2. Drag/drop or button movement creates a normalized card list.
3. `App.reorderCards` updates local state.
4. Rust persists `column_id` and `sort_order` through `reorder_cards`.

Column creation and deletion are handled through Tauri commands. Column drag reordering is not currently exposed in the UI, although the backend has a `reorder_columns` command.

Keep ordering normalization in one place and persist only the final `column_id` and `sort_order` changes. If movement rules become more complex, consider moving to a dedicated drag-and-drop library while preserving Rust as the persistence boundary.

## 8. State Management

State is held in React component state inside `App.tsx`.

Global app state:

- Current snapshot
- Selected board
- Search and filters
- Active card drawer
- Entity dialog
- Settings dialog
- Theme family and mode
- Last exported/restored path notice

Local component state:

- Card draft state in `CardDrawer`
- Settings busy state
- Vault selection busy/error state
- Entity dialog form fields

Synchronization:

- Search and filters are debounced into settings.
- Selected board is saved when changed.
- Card saves write immediately.
- Movement updates are optimistic and then persisted.
- Import/restore reloads the snapshot.

## 9. Build And Release Architecture

The build is driven by Tauri:

1. From `app`, `npm run build` calls `tauri build`.
2. Tauri runs `npm run build:vite`.
3. Vite compiles TypeScript and bundles the frontend into `app/dist`.
4. Cargo compiles the Rust app.
5. Tauri writes the executable and NSIS installer under `app/src-tauri/target/release`.

Expected outputs:

```text
app/src-tauri/target/release/local-kanban.exe
app/src-tauri/target/release/bundle/nsis/Local Kanban_1.0.0_x64-setup.exe
```

GitHub Releases is the only public binary distribution channel. Version tags trigger clean Windows builds and publish a stable `Local-Kanban-Setup.exe` asset.

Scripts:

- `app/scripts/setup.bat`: dependency install and Rust check.
- `app/scripts/dev.bat`: local development mode.
- `app/scripts/build.bat`: production package build.

## 10. Future Development Guidelines

- Keep user-facing text non-technical unless the user is in Settings or developer docs.
- Keep all persistent data under the selected vault.
- Do not write personal data, generated databases, attachments, backups, or exports into the repository.
- Add new UI colors through semantic theme tokens, not raw Tailwind color utilities.
- Add settings as keys in `app_settings`, then expose typed frontend helpers if the setting grows.
- Add database tables through migrations and tests.
- Keep Rust commands as the persistence boundary.
- Prefer small feature modules under `app/src/features`.
- Keep frontend models in `app/src/types` aligned with Rust snapshot structs.

## 11. Known Limitations And Technical Debt

- Column reordering exists in backend shape but is not currently exposed in the UI.
- Drag-and-drop uses native browser events rather than a dedicated drag-and-drop library.
- Schema migrations are currently simple idempotent table creation.
- There is no cloud sync or multi-device conflict resolution.
- There is no built-in encrypted vault mode.
- Existing attachments are stored as normal files in the vault.

## 12. Security And Privacy Notes

- Data is local-only.
- No telemetry is implemented.
- No cloud sync is implemented.
- Attachments are copied into the selected vault.
- Opening files is restricted to files under the active vault.
- A user who shares a vault shares its boards, attachments, exports, and backups.

## 13. AI And Developer Continuation Guidance

Future agents and maintainers should:

- Read existing patterns before adding abstractions.
- Preserve the Tauri/Rust persistence boundary.
- Avoid coupling UI components directly to filesystem paths.
- Keep vault switching and database opening in Rust.
- Keep theme palettes centralized in `app/src/styles/themes.ts`.
- Prefer semantic CSS variables over hardcoded colors.
- Keep user-facing language friendly and avoid implementation details in the app UI.
- Update tests when touching persistence, vault handling, ordering, import/export, or settings.
- Avoid committing generated build output or personal vault data.
