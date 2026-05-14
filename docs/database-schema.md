# Database Schema

The full database and vault reference lives in [../TECHNICAL-REFERENCE.md](../TECHNICAL-REFERENCE.md).

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

## Settings Keys

- `selected_board_id`
- `theme`
- `theme_family`
- `theme_mode`
- `search`
- `filters`
- `window_state`

The vault path is stored in the Tauri app config folder for `com.local.localkanbanboard`, not in the database.

## Indexes

- `idx_columns_board_order` on `(board_id, sort_order)`
- `idx_cards_board_column_order` on `(board_id, column_id, sort_order)`
- `idx_card_tags_card` on `(card_id)`
- `idx_attachments_card` on `(card_id)`
