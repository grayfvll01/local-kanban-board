use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use uuid::Uuid;

type AppResult<T> = Result<T, String>;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Board {
    id: String,
    name: String,
    description: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct KanbanColumn {
    id: String,
    board_id: String,
    name: String,
    sort_order: i64,
    wip_limit: Option<i64>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Card {
    id: String,
    board_id: String,
    column_id: String,
    title: String,
    description: String,
    priority: String,
    due_date: Option<String>,
    color: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
    tags: Vec<String>,
    attachments: Vec<Attachment>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Attachment {
    id: String,
    card_id: String,
    file_name: String,
    file_path: String,
    mime_type: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct Snapshot {
    boards: Vec<Board>,
    columns: Vec<KanbanColumn>,
    cards: Vec<Card>,
    settings: HashMap<String, String>,
    app_data_dir: String,
    database_path: String,
    vault_path: Option<String>,
    vault_required: bool,
    config_path: String,
    status_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppConfig {
    vault_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CardInput {
    id: Option<String>,
    board_id: String,
    column_id: String,
    title: String,
    description: String,
    priority: String,
    due_date: Option<String>,
    color: String,
    sort_order: Option<i64>,
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CardOrderUpdate {
    id: String,
    column_id: String,
    sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportBundle {
    version: u32,
    exported_at: String,
    boards: Vec<Board>,
    columns: Vec<KanbanColumn>,
    cards: Vec<ExportCard>,
    settings: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportCard {
    id: String,
    board_id: String,
    column_id: String,
    title: String,
    description: String,
    priority: String,
    due_date: Option<String>,
    color: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
    tags: Vec<String>,
    attachments: Vec<ExportAttachment>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportAttachment {
    id: String,
    card_id: String,
    file_name: String,
    mime_type: String,
    created_at: String,
    data_base64: String,
}

struct Database {
    conn: Connection,
    app_dir: PathBuf,
    db_path: PathBuf,
    attachments_dir: PathBuf,
    exports_dir: PathBuf,
    backups_dir: PathBuf,
}

struct AppState {
    db: Mutex<Option<Database>>,
    app_data_dir: PathBuf,
    config_path: PathBuf,
    last_error: Mutex<Option<String>>,
}

impl Database {
    fn open_at(app_dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&app_dir).map_err(to_string)?;
        let attachments_dir = app_dir.join("attachments");
        let exports_dir = app_dir.join("exports");
        let backups_dir = app_dir.join("backups");
        fs::create_dir_all(&attachments_dir).map_err(to_string)?;
        fs::create_dir_all(&exports_dir).map_err(to_string)?;
        fs::create_dir_all(&backups_dir).map_err(to_string)?;

        let db_path = app_dir.join("kanban.sqlite");
        let conn = Connection::open(&db_path).map_err(to_string)?;
        let mut db = Self {
            conn,
            app_dir,
            db_path,
            attachments_dir,
            exports_dir,
            backups_dir,
        };
        db.configure()?;
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    fn configure(&self) -> AppResult<()> {
        self.conn
            .execute_batch(
                "
                PRAGMA foreign_keys = ON;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA busy_timeout = 5000;
                ",
            )
            .map_err(to_string)?;
        Ok(())
    }

    fn migrate(&self) -> AppResult<()> {
        self.conn
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS boards (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS columns (
                    id TEXT PRIMARY KEY,
                    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    wip_limit INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cards (
                    id TEXT PRIMARY KEY,
                    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    due_date TEXT,
                    color TEXT NOT NULL DEFAULT '#3b82f6',
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS card_tags (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                    tag TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS attachments (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_columns_board_order ON columns(board_id, sort_order);
                CREATE INDEX IF NOT EXISTS idx_cards_board_column_order ON cards(board_id, column_id, sort_order);
                CREATE INDEX IF NOT EXISTS idx_card_tags_card ON card_tags(card_id);
                CREATE INDEX IF NOT EXISTS idx_attachments_card ON attachments(card_id);
                ",
            )
            .map_err(to_string)?;
        Ok(())
    }

    fn seed_if_empty(&mut self) -> AppResult<()> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM boards", [], |row| row.get(0))
            .map_err(to_string)?;
        if count > 0 {
            return Ok(());
        }

        let tx = self.conn.transaction().map_err(to_string)?;
        let now = now();
        let board_id = id();
        tx.execute(
            "INSERT INTO boards (id, name, description, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
            params![board_id, "Launch Plan", "A local-first board stored in your vault.", now],
        )
        .map_err(to_string)?;

        let column_names = ["Backlog", "In Progress", "Review", "Done"];
        let mut first_column = String::new();
        for (index, name) in column_names.iter().enumerate() {
            let column_id = id();
            if index == 0 {
                first_column = column_id.clone();
            }
            tx.execute(
                "INSERT INTO columns (id, board_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![column_id, board_id, name, index as i64 * 1000, now],
            )
            .map_err(to_string)?;
        }

        let card_id = id();
        tx.execute(
            "INSERT INTO cards (id, board_id, column_id, title, description, priority, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'high', '#14b8a6', 0, ?6, ?6)",
            params![
                card_id,
                board_id,
                first_column,
                "Welcome to local-kanban-word",
                "This card is Markdown-enabled.\n\n- [x] Local vault storage\n- [x] Move cards between columns\n- [ ] Add your first real task\n\nPaste or upload images in the card drawer.",
                now
            ],
        )
        .map_err(to_string)?;
        tx.execute(
            "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, ?3)",
            params![id(), card_id, "local-first"],
        )
        .map_err(to_string)?;
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES
                ('selected_board_id', ?1),
                ('theme', 'dark'),
                ('theme_family', 'default'),
                ('theme_mode', 'dark')",
            params![board_id],
        )
        .map_err(to_string)?;
        tx.commit().map_err(to_string)?;
        Ok(())
    }

    fn snapshot(&self) -> AppResult<Snapshot> {
        Ok(Snapshot {
            boards: self.boards()?,
            columns: self.columns()?,
            cards: self.cards()?,
            settings: self.settings()?,
            app_data_dir: self.app_dir.to_string_lossy().to_string(),
            database_path: self.db_path.to_string_lossy().to_string(),
            vault_path: Some(self.app_dir.to_string_lossy().to_string()),
            vault_required: false,
            config_path: String::new(),
            status_error: None,
        })
    }

    fn boards(&self) -> AppResult<Vec<Board>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, description, sort_order, created_at, updated_at FROM boards ORDER BY sort_order, created_at")
            .map_err(to_string)?;
        let boards = stmt
            .query_map([], |row| {
                Ok(Board {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    sort_order: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(boards)
    }

    fn columns(&self) -> AppResult<Vec<KanbanColumn>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, board_id, name, sort_order, wip_limit, created_at, updated_at FROM columns ORDER BY sort_order, created_at")
            .map_err(to_string)?;
        let columns = stmt
            .query_map([], |row| {
                Ok(KanbanColumn {
                    id: row.get(0)?,
                    board_id: row.get(1)?,
                    name: row.get(2)?,
                    sort_order: row.get(3)?,
                    wip_limit: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(columns)
    }

    fn cards(&self) -> AppResult<Vec<Card>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at
                 FROM cards ORDER BY sort_order, created_at",
            )
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Card {
                    id: row.get(0)?,
                    board_id: row.get(1)?,
                    column_id: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    priority: row.get(5)?,
                    due_date: row.get(6)?,
                    color: row.get(7)?,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    tags: Vec::new(),
                    attachments: Vec::new(),
                })
            })
            .map_err(to_string)?;

        let mut cards = Vec::new();
        for card_result in rows {
            let mut card = card_result.map_err(to_string)?;
            card.tags = self.tags_for_card(&card.id)?;
            card.attachments = self.attachments_for_card(&card.id)?;
            cards.push(card);
        }
        Ok(cards)
    }

    fn tags_for_card(&self, card_id: &str) -> AppResult<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT tag FROM card_tags WHERE card_id = ?1 ORDER BY tag")
            .map_err(to_string)?;
        let tags = stmt
            .query_map(params![card_id], |row| row.get(0))
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(tags)
    }

    fn attachments_for_card(&self, card_id: &str) -> AppResult<Vec<Attachment>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, card_id, file_name, file_path, mime_type, created_at FROM attachments WHERE card_id = ?1 ORDER BY created_at")
            .map_err(to_string)?;
        let attachments = stmt
            .query_map(params![card_id], |row| {
                Ok(Attachment {
                    id: row.get(0)?,
                    card_id: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    mime_type: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(attachments)
    }

    fn settings(&self) -> AppResult<HashMap<String, String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM app_settings")
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(to_string)?;
        let mut settings = HashMap::new();
        for row in rows {
            let (key, value) = row.map_err(to_string)?;
            settings.insert(key, value);
        }
        Ok(settings)
    }

    fn card_by_id(&self, card_id: &str) -> AppResult<Card> {
        let mut card = self
            .conn
            .query_row(
                "SELECT id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at
                 FROM cards WHERE id = ?1",
                params![card_id],
                |row| {
                    Ok(Card {
                        id: row.get(0)?,
                        board_id: row.get(1)?,
                        column_id: row.get(2)?,
                        title: row.get(3)?,
                        description: row.get(4)?,
                        priority: row.get(5)?,
                        due_date: row.get(6)?,
                        color: row.get(7)?,
                        sort_order: row.get(8)?,
                        created_at: row.get(9)?,
                        updated_at: row.get(10)?,
                        tags: Vec::new(),
                        attachments: Vec::new(),
                    })
                },
            )
            .map_err(to_string)?;
        card.tags = self.tags_for_card(card_id)?;
        card.attachments = self.attachments_for_card(card_id)?;
        Ok(card)
    }
}

impl AppState {
    fn snapshot(&self) -> AppResult<Snapshot> {
        let db_guard = self.db.lock().map_err(lock_error)?;
        if let Some(db) = db_guard.as_ref() {
            let mut snapshot = db.snapshot()?;
            snapshot.app_data_dir = self.app_data_dir.to_string_lossy().to_string();
            snapshot.config_path = self.config_path.to_string_lossy().to_string();
            return Ok(snapshot);
        }

        let config = read_config(&self.config_path).unwrap_or_default();
        Ok(Snapshot {
            boards: Vec::new(),
            columns: Vec::new(),
            cards: Vec::new(),
            settings: HashMap::new(),
            app_data_dir: self.app_data_dir.to_string_lossy().to_string(),
            database_path: String::new(),
            vault_path: config.vault_path,
            vault_required: true,
            config_path: self.config_path.to_string_lossy().to_string(),
            status_error: self.last_error.lock().map_err(lock_error)?.clone(),
        })
    }

    fn set_vault(&self, vault_path: PathBuf) -> AppResult<Snapshot> {
        let db = Database::open_at(vault_path.clone()).map_err(|error| {
            format!(
                "Could not open vault at {}: {error}",
                vault_path.to_string_lossy()
            )
        })?;
        write_config(
            &self.config_path,
            &AppConfig {
                vault_path: Some(vault_path.to_string_lossy().to_string()),
            },
        )?;
        *self.db.lock().map_err(lock_error)? = Some(db);
        *self.last_error.lock().map_err(lock_error)? = None;
        self.snapshot()
    }
}

#[tauri::command]
fn load_snapshot(state: State<AppState>) -> AppResult<Snapshot> {
    state.snapshot()
}

#[tauri::command]
fn choose_vault_folder(state: State<AppState>) -> AppResult<Snapshot> {
    let folder = rfd::FileDialog::new()
        .set_title("Choose local-kanban-word vault folder")
        .pick_folder()
        .ok_or_else(|| "Vault selection was cancelled.".to_string())?;
    state.set_vault(folder)
}

#[tauri::command]
fn set_vault_path(path: String, state: State<AppState>) -> AppResult<Snapshot> {
    if path.trim().is_empty() {
        return Err("Vault path cannot be empty.".to_string());
    }
    state.set_vault(PathBuf::from(path))
}

#[tauri::command]
fn open_vault_folder(state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    opener::open(&db.app_dir).map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn create_board(name: String, description: String, state: State<AppState>) -> AppResult<Board> {
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let tx = db.conn.transaction().map_err(to_string)?;
    let sort_order: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1000) + 1000 FROM boards",
            [],
            |row| row.get(0),
        )
        .map_err(to_string)?;
    let board_id = id();
    let now = now();
    tx.execute(
        "INSERT INTO boards (id, name, description, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![board_id, name.trim(), description, sort_order, now],
    )
    .map_err(to_string)?;
    for (index, column_name) in ["Backlog", "In Progress", "Done"].iter().enumerate() {
        tx.execute(
            "INSERT INTO columns (id, board_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id(), board_id, column_name, index as i64 * 1000, now],
        )
        .map_err(to_string)?;
    }
    tx.execute(
        "INSERT INTO app_settings (key, value) VALUES ('selected_board_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![board_id],
    )
    .map_err(to_string)?;
    tx.commit().map_err(to_string)?;
    db.boards()?
        .into_iter()
        .find(|board| board.id == board_id)
        .ok_or_else(|| "Created board could not be loaded".to_string())
}

#[tauri::command]
fn update_board(
    id: String,
    name: String,
    description: String,
    state: State<AppState>,
) -> AppResult<Board> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let now = now();
    db.conn
        .execute(
            "UPDATE boards SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
            params![name.trim(), description, now, id],
        )
        .map_err(to_string)?;
    db.boards()?
        .into_iter()
        .find(|board| board.id == id)
        .ok_or_else(|| "Board not found".to_string())
}

#[tauri::command]
fn delete_board(id: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    db.conn
        .execute("DELETE FROM boards WHERE id = ?1", params![id])
        .map_err(to_string)?;
    if let Some(next_id) = db
        .conn
        .query_row(
            "SELECT id FROM boards ORDER BY sort_order LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)?
    {
        save_setting_inner(&db.conn, "selected_board_id", &next_id)?;
    }
    Ok(())
}

#[tauri::command]
fn create_column(
    board_id: String,
    name: String,
    state: State<AppState>,
) -> AppResult<KanbanColumn> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let sort_order: i64 = db
        .conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1000) + 1000 FROM columns WHERE board_id = ?1",
            params![board_id],
            |row| row.get(0),
        )
        .map_err(to_string)?;
    let column_id = id();
    let now = now();
    db.conn
        .execute(
            "INSERT INTO columns (id, board_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![column_id, board_id, name.trim(), sort_order, now],
        )
        .map_err(to_string)?;
    db.columns()?
        .into_iter()
        .find(|column| column.id == column_id)
        .ok_or_else(|| "Created column could not be loaded".to_string())
}

#[tauri::command]
fn update_column(
    id: String,
    name: String,
    wip_limit: Option<i64>,
    state: State<AppState>,
) -> AppResult<KanbanColumn> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let now = now();
    db.conn
        .execute(
            "UPDATE columns SET name = ?1, wip_limit = ?2, updated_at = ?3 WHERE id = ?4",
            params![name.trim(), wip_limit, now, id],
        )
        .map_err(to_string)?;
    db.columns()?
        .into_iter()
        .find(|column| column.id == id)
        .ok_or_else(|| "Column not found".to_string())
}

#[tauri::command]
fn delete_column(id: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    db.conn
        .execute("DELETE FROM columns WHERE id = ?1", params![id])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn reorder_columns(
    board_id: String,
    ordered_ids: Vec<String>,
    state: State<AppState>,
) -> AppResult<()> {
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let tx = db.conn.transaction().map_err(to_string)?;
    let now = now();
    for (index, column_id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE columns SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND board_id = ?4",
            params![index as i64 * 1000, now, column_id, board_id],
        )
        .map_err(to_string)?;
    }
    tx.commit().map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn upsert_card(card: CardInput, state: State<AppState>) -> AppResult<Card> {
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let tx = db.conn.transaction().map_err(to_string)?;
    let now = now();
    let card_id = card.id.unwrap_or_else(id);
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE id = ?1)",
            params![card_id],
            |row| row.get(0),
        )
        .map_err(to_string)?;
    let sort_order = match card.sort_order {
        Some(value) => value,
        None => tx
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1000) + 1000 FROM cards WHERE column_id = ?1",
                params![card.column_id],
                |row| row.get(0),
            )
            .map_err(to_string)?,
    };

    if exists {
        tx.execute(
            "UPDATE cards
             SET board_id = ?1, column_id = ?2, title = ?3, description = ?4, priority = ?5, due_date = ?6, color = ?7, updated_at = ?8
             WHERE id = ?9",
            params![
                card.board_id,
                card.column_id,
                card.title.trim(),
                card.description,
                card.priority,
                card.due_date,
                card.color,
                now,
                card_id
            ],
        )
        .map_err(to_string)?;
    } else {
        tx.execute(
            "INSERT INTO cards (id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![
                card_id,
                card.board_id,
                card.column_id,
                card.title.trim(),
                card.description,
                card.priority,
                card.due_date,
                card.color,
                sort_order,
                now
            ],
        )
        .map_err(to_string)?;
    }

    tx.execute("DELETE FROM card_tags WHERE card_id = ?1", params![card_id])
        .map_err(to_string)?;
    for tag in normalized_tags(&card.tags) {
        tx.execute(
            "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, ?3)",
            params![id(), card_id, tag],
        )
        .map_err(to_string)?;
    }
    tx.commit().map_err(to_string)?;
    db.card_by_id(&card_id)
}

#[tauri::command]
fn delete_card(id: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    for attachment in db.attachments_for_card(&id)? {
        let _ = fs::remove_file(&attachment.file_path);
    }
    db.conn
        .execute("DELETE FROM cards WHERE id = ?1", params![id])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn reorder_cards(updates: Vec<CardOrderUpdate>, state: State<AppState>) -> AppResult<()> {
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let tx = db.conn.transaction().map_err(to_string)?;
    let now = now();
    for update in updates {
        tx.execute(
            "UPDATE cards SET column_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
            params![update.column_id, update.sort_order, now, update.id],
        )
        .map_err(to_string)?;
    }
    tx.commit().map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn save_setting(key_name: String, value: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    save_setting_inner(&db.conn, &key_name, &value)
}

#[tauri::command]
fn add_attachment(
    card_id: String,
    file_name: String,
    mime_type: String,
    data_base64: String,
    state: State<AppState>,
) -> AppResult<Attachment> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("Attachment data was not valid base64: {error}"))?;
    let attachment_id = id();
    let safe_name = sanitize_filename::sanitize(file_name);
    let card_dir = db.attachments_dir.join(&card_id);
    fs::create_dir_all(&card_dir).map_err(to_string)?;
    let file_path = card_dir.join(format!("{attachment_id}-{safe_name}"));
    fs::write(&file_path, bytes).map_err(to_string)?;
    let created_at = now();
    db.conn
        .execute(
            "INSERT INTO attachments (id, card_id, file_name, file_path, mime_type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                attachment_id,
                card_id,
                safe_name,
                file_path.to_string_lossy().to_string(),
                mime_type,
                created_at
            ],
        )
        .map_err(to_string)?;
    db.attachments_for_card(&card_id)?
        .into_iter()
        .find(|attachment| attachment.id == attachment_id)
        .ok_or_else(|| "Attachment could not be loaded".to_string())
}

#[tauri::command]
fn delete_attachment(id: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let file_path: Option<String> = db
        .conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_string)?;
    if let Some(path) = file_path {
        let _ = fs::remove_file(path);
    }
    db.conn
        .execute("DELETE FROM attachments WHERE id = ?1", params![id])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn open_path(path: String, state: State<AppState>) -> AppResult<()> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let requested = PathBuf::from(path);
    let allowed_root = db.app_dir.canonicalize().map_err(to_string)?;
    let target = if requested.exists() {
        requested.canonicalize().map_err(to_string)?
    } else {
        requested
    };
    if !target.starts_with(&allowed_root) {
        return Err("Only files in the active vault can be opened from the app.".to_string());
    }
    opener::open(target).map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn export_json(state: State<AppState>) -> AppResult<String> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let bundle = build_export_bundle(&db)?;
    let json = serde_json::to_string_pretty(&bundle).map_err(to_string)?;
    let path = db
        .exports_dir
        .join(format!("local-kanban-word-export-{}.json", file_stamp()));
    fs::write(&path, json.as_bytes()).map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn import_json(json: String, state: State<AppState>) -> AppResult<()> {
    let bundle: ExportBundle = serde_json::from_str(&json).map_err(to_string)?;
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let tx = db.conn.transaction().map_err(to_string)?;
    tx.execute_batch(
        "
        DELETE FROM attachments;
        DELETE FROM card_tags;
        DELETE FROM cards;
        DELETE FROM columns;
        DELETE FROM boards;
        DELETE FROM app_settings;
        ",
    )
    .map_err(to_string)?;

    for board in &bundle.boards {
        tx.execute(
            "INSERT INTO boards (id, name, description, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![board.id, board.name, board.description, board.sort_order, board.created_at, board.updated_at],
        )
        .map_err(to_string)?;
    }
    for column in &bundle.columns {
        tx.execute(
            "INSERT INTO columns (id, board_id, name, sort_order, wip_limit, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![column.id, column.board_id, column.name, column.sort_order, column.wip_limit, column.created_at, column.updated_at],
        )
        .map_err(to_string)?;
    }
    for card in &bundle.cards {
        tx.execute(
            "INSERT INTO cards (id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                card.id,
                card.board_id,
                card.column_id,
                card.title,
                card.description,
                card.priority,
                card.due_date,
                card.color,
                card.sort_order,
                card.created_at,
                card.updated_at
            ],
        )
        .map_err(to_string)?;
        for tag in normalized_tags(&card.tags) {
            tx.execute(
                "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, ?3)",
                params![id(), card.id, tag],
            )
            .map_err(to_string)?;
        }
    }
    for (key, value) in &bundle.settings {
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(to_string)?;
    }
    tx.commit().map_err(to_string)?;

    let _ = fs::remove_dir_all(&db.attachments_dir);
    fs::create_dir_all(&db.attachments_dir).map_err(to_string)?;
    for card in bundle.cards {
        for attachment in card.attachments {
            let bytes = general_purpose::STANDARD
                .decode(attachment.data_base64)
                .map_err(to_string)?;
            let card_dir = db.attachments_dir.join(&card.id);
            fs::create_dir_all(&card_dir).map_err(to_string)?;
            let safe_name = sanitize_filename::sanitize(attachment.file_name);
            let file_path = card_dir.join(format!("{}-{safe_name}", attachment.id));
            fs::write(&file_path, bytes).map_err(to_string)?;
            db.conn
                .execute(
                    "INSERT INTO attachments (id, card_id, file_name, file_path, mime_type, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        attachment.id,
                        card.id,
                        safe_name,
                        file_path.to_string_lossy().to_string(),
                        attachment.mime_type,
                        attachment.created_at
                    ],
                )
                .map_err(to_string)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn export_board_markdown(board_id: String, state: State<AppState>) -> AppResult<String> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let board = db
        .boards()?
        .into_iter()
        .find(|board| board.id == board_id)
        .ok_or_else(|| "Board not found".to_string())?;
    let columns: Vec<_> = db
        .columns()?
        .into_iter()
        .filter(|column| column.board_id == board.id)
        .collect();
    let cards = db.cards()?;
    let mut markdown = format!("# {}\n\n{}\n\n", board.name, board.description);
    for column in columns {
        markdown.push_str(&format!("## {}\n\n", column.name));
        for card in cards
            .iter()
            .filter(|card| card.column_id == column.id)
            .collect::<Vec<_>>()
        {
            markdown.push_str(&format!(
                "### {}\n\nPriority: **{}**  \nDue: {}\nTags: {}\n\n{}\n\n",
                card.title,
                card.priority,
                card.due_date.clone().unwrap_or_else(|| "none".to_string()),
                card.tags.join(", "),
                card.description
            ));
        }
    }
    let path = db
        .exports_dir
        .join(format!("{}-{}.md", slug(&board.name), file_stamp()));
    fs::write(&path, markdown.as_bytes()).map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_board_csv(board_id: String, state: State<AppState>) -> AppResult<String> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    let board = db
        .boards()?
        .into_iter()
        .find(|board| board.id == board_id)
        .ok_or_else(|| "Board not found".to_string())?;
    let columns = db.columns()?;
    let cards = db.cards()?;
    let path = db
        .exports_dir
        .join(format!("{}-{}.csv", slug(&board.name), file_stamp()));
    let mut writer = csv::Writer::from_path(&path).map_err(to_string)?;
    writer
        .write_record([
            "board",
            "column",
            "title",
            "description",
            "priority",
            "due_date",
            "color",
            "tags",
            "created_at",
            "updated_at",
        ])
        .map_err(to_string)?;
    for card in cards.iter().filter(|card| card.board_id == board.id) {
        let column_name = columns
            .iter()
            .find(|column| column.id == card.column_id)
            .map(|column| column.name.as_str())
            .unwrap_or("");
        writer
            .write_record([
                board.name.as_str(),
                column_name,
                card.title.as_str(),
                card.description.as_str(),
                card.priority.as_str(),
                card.due_date.as_deref().unwrap_or(""),
                card.color.as_str(),
                card.tags.join(", ").as_str(),
                card.created_at.as_str(),
                card.updated_at.as_str(),
            ])
            .map_err(to_string)?;
    }
    writer.flush().map_err(to_string)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn backup_database(state: State<AppState>) -> AppResult<String> {
    let db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_ref().ok_or_else(no_vault_error)?;
    db.conn
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(to_string)?;
    let backup_path = db.backups_dir.join(format!(
        "local-kanban-word-backup-{}.sqlite3",
        file_stamp()
    ));
    fs::copy(&db.db_path, &backup_path).map_err(to_string)?;
    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
fn restore_database(data_base64: String, state: State<AppState>) -> AppResult<()> {
    let mut db_guard = state.db.lock().map_err(lock_error)?;
    let db = db_guard.as_mut().ok_or_else(no_vault_error)?;
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(to_string)?;
    let temp_path = db.app_dir.join("restore-check.sqlite3");
    fs::write(&temp_path, &bytes).map_err(to_string)?;
    {
        let check = Connection::open(&temp_path).map_err(to_string)?;
        check
            .query_row("SELECT name FROM sqlite_master LIMIT 1", [], |_| Ok(()))
            .optional()
            .map_err(|error| format!("Selected file is not a readable backup file: {error}"))?;
    }
    let memory = Connection::open_in_memory().map_err(to_string)?;
    let old = std::mem::replace(&mut db.conn, memory);
    drop(old);
    fs::copy(&temp_path, &db.db_path).map_err(to_string)?;
    let _ = fs::remove_file(&temp_path);
    db.conn = Connection::open(&db.db_path).map_err(to_string)?;
    db.configure()?;
    db.migrate()?;
    db.seed_if_empty()?;
    Ok(())
}

fn build_export_bundle(db: &Database) -> AppResult<ExportBundle> {
    let cards = db
        .cards()?
        .into_iter()
        .map(|card| {
            let attachments = card
                .attachments
                .iter()
                .map(|attachment| {
                    let bytes = fs::read(&attachment.file_path).unwrap_or_default();
                    ExportAttachment {
                        id: attachment.id.clone(),
                        card_id: attachment.card_id.clone(),
                        file_name: attachment.file_name.clone(),
                        mime_type: attachment.mime_type.clone(),
                        created_at: attachment.created_at.clone(),
                        data_base64: general_purpose::STANDARD.encode(bytes),
                    }
                })
                .collect();
            ExportCard {
                id: card.id,
                board_id: card.board_id,
                column_id: card.column_id,
                title: card.title,
                description: card.description,
                priority: card.priority,
                due_date: card.due_date,
                color: card.color,
                sort_order: card.sort_order,
                created_at: card.created_at,
                updated_at: card.updated_at,
                tags: card.tags,
                attachments,
            }
        })
        .collect();
    Ok(ExportBundle {
        version: 1,
        exported_at: now(),
        boards: db.boards()?,
        columns: db.columns()?,
        cards,
        settings: db.settings()?,
    })
}

fn read_config(path: &PathBuf) -> AppResult<AppConfig> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let json = fs::read_to_string(path).map_err(|error| {
        format!(
            "Could not read app config at {}: {error}",
            path.to_string_lossy()
        )
    })?;
    serde_json::from_str(&json).map_err(|error| {
        format!(
            "Could not parse app config at {}: {error}",
            path.to_string_lossy()
        )
    })
}

fn write_config(path: &PathBuf, config: &AppConfig) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    let json = serde_json::to_string_pretty(config).map_err(to_string)?;
    fs::write(path, json).map_err(|error| {
        format!(
            "Could not write app config at {}: {error}",
            path.to_string_lossy()
        )
    })?;
    Ok(())
}

fn save_setting_inner(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(to_string)?;
    Ok(())
}

fn normalized_tags(tags: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = tags
        .iter()
        .flat_map(|tag| tag.split(','))
        .map(|tag| tag.trim().trim_start_matches('#').to_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect();
    normalized.sort();
    normalized.dedup();
    normalized
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn file_stamp() -> String {
    Utc::now().format("%Y%m%d-%H%M%S").to_string()
}

fn id() -> String {
    Uuid::new_v4().to_string()
}

fn slug(value: &str) -> String {
    let slug = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "board".to_string()
    } else {
        slug
    }
}

fn to_string<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn no_vault_error() -> String {
    "No local-kanban-word vault is configured. Choose a vault folder before using the app."
        .to_string()
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    format!("Database lock failed: {error}")
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
            fs::create_dir_all(&app_data_dir).map_err(to_string)?;
            let config_path = app_data_dir.join("config.json");
            let mut last_error = None;
            let db = match read_config(&config_path) {
                Ok(config) => match config.vault_path {
                    Some(path) => {
                        let vault_path = PathBuf::from(path);
                        if vault_path.exists() {
                            match Database::open_at(vault_path.clone()) {
                                Ok(db) => Some(db),
                                Err(error) => {
                                    last_error = Some(error);
                                    None
                                }
                            }
                        } else {
                            last_error = Some(format!(
                                "Configured vault folder no longer exists: {}",
                                vault_path.to_string_lossy()
                            ));
                            None
                        }
                    }
                    None => None,
                },
                Err(error) => {
                    last_error = Some(error);
                    None
                }
            };
            app.manage(AppState {
                db: Mutex::new(db),
                app_data_dir,
                config_path,
                last_error: Mutex::new(last_error),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_snapshot,
            choose_vault_folder,
            set_vault_path,
            open_vault_folder,
            create_board,
            update_board,
            delete_board,
            create_column,
            update_column,
            delete_column,
            reorder_columns,
            upsert_card,
            delete_card,
            reorder_cards,
            save_setting,
            add_attachment,
            delete_attachment,
            open_path,
            export_json,
            import_json,
            export_board_markdown,
            export_board_csv,
            backup_database,
            restore_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running local-kanban-word");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_persists_cards_columns_and_settings_after_reopen() {
        let dir = std::env::temp_dir().join(format!("local-kanban-word-test-{}", id()));
        let db = Database::open_at(dir.clone()).expect("database opens");
        let snapshot = db.snapshot().expect("snapshot loads");
        let board = snapshot.boards.first().expect("seed board exists").clone();
        let mut columns: Vec<_> = snapshot
            .columns
            .into_iter()
            .filter(|column| column.board_id == board.id)
            .collect();
        columns.sort_by_key(|column| column.sort_order);
        assert!(columns.len() >= 2);

        let first = columns[0].clone();
        let second = columns[1].clone();
        db.conn
            .execute(
                "UPDATE columns SET sort_order = 0 WHERE id = ?1",
                params![second.id],
            )
            .expect("second column order written");
        db.conn
            .execute(
                "UPDATE columns SET sort_order = 1000 WHERE id = ?1",
                params![first.id],
            )
            .expect("first column order written");

        let card_id = id();
        let now = now();
        db.conn
            .execute(
                "INSERT INTO cards (id, board_id, column_id, title, description, priority, color, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Persistent card', '- [x] survives reopen', 'urgent', '#ef4444', 0, ?4, ?4)",
                params![card_id, board.id, second.id, now],
            )
            .expect("card inserted");
        db.conn
            .execute(
                "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, 'restart')",
                params![id(), card_id],
            )
            .expect("tag inserted");
        save_setting_inner(&db.conn, "selected_board_id", &board.id).expect("setting saved");
        drop(db);

        let reopened = Database::open_at(dir.clone()).expect("database reopens");
        let snapshot = reopened.snapshot().expect("reopened snapshot loads");
        let reopened_columns: Vec<_> = snapshot
            .columns
            .iter()
            .filter(|column| column.board_id == board.id)
            .collect();
        assert_eq!(reopened_columns[0].id, second.id);
        let card = snapshot
            .cards
            .iter()
            .find(|card| card.id == card_id)
            .expect("card survives reopen");
        assert_eq!(card.column_id, second.id);
        assert_eq!(card.tags, vec!["restart".to_string()]);
        assert_eq!(snapshot.settings.get("selected_board_id"), Some(&board.id));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn vault_path_is_saved_in_stable_config() {
        let root = std::env::temp_dir().join(format!("local-kanban-word-vault-test-{}", id()));
        let app_data = root.join("config-home");
        let vault = root.join("work-vault");
        fs::create_dir_all(&app_data).expect("app config dir created");
        let state = AppState {
            db: Mutex::new(None),
            config_path: app_data.join("config.json"),
            app_data_dir: app_data.clone(),
            last_error: Mutex::new(None),
        };

        let snapshot = state.set_vault(vault.clone()).expect("vault opens");
        assert_eq!(
            snapshot.vault_path,
            Some(vault.to_string_lossy().to_string())
        );
        assert!(vault.join("kanban.sqlite").exists());
        assert!(vault.join("attachments").exists());
        assert!(vault.join("backups").exists());
        assert!(vault.join("exports").exists());

        let config = read_config(&state.config_path).expect("config reads");
        assert_eq!(config.vault_path, Some(vault.to_string_lossy().to_string()));
        let _ = fs::remove_dir_all(root);
    }
}
