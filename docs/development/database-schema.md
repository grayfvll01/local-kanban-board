# Database Schema

The full database and vault reference lives in [TECHNICAL-REFERENCE.md](TECHNICAL-REFERENCE.md).

The SQLite database is created automatically inside the selected vault as `kanban.sqlite`.

## Tables

```sql
boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  wip_limit INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

cards (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

card_tags (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Schema version

The schema version is stored in SQLite's `PRAGMA user_version`. Vaults created before versioning report `0` and are upgraded to `1` on open without changing any rows. A vault with a newer version than the app supports is refused rather than modified. Add a numbered step to `Database::migrate` in `app/src-tauri/src/lib.rs`, with a test, for every future schema change.

## Settings Keys

Per-vault preferences stored in `app_settings`:

- `selected_board_id`
- `theme_family` and `theme_mode` (`theme` is a legacy key that is still read)
- `layout` (`comfortable`, `compact`, or `minimal`)
- `search`
- `filters`

Older vaults may also contain `window_state`. It is ignored; window size and position are now remembered by the app itself.

App-wide settings live in `config.json` in the app config folder for `com.local.localkanbanword`, not in the database: `vault_path` and `check_for_updates`.

## Indexes

- `idx_columns_board_order` on `(board_id, sort_order)`
- `idx_cards_board_column_order` on `(board_id, column_id, sort_order)`
- `idx_card_tags_card` on `(card_id)`
- `idx_attachments_card` on `(card_id)`
