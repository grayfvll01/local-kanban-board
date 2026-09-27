use base64::{engine::general_purpose, Engine as _};
use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection, DatabaseName, OpenFlags, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Manager, State, Window};
use uuid::Uuid;

type AppResult<T> = Result<T, String>;

/// Increment when the vault schema changes and add a step to `Database::migrate`.
const SCHEMA_VERSION: i64 = 1;
const DATABASE_FILE: &str = "kanban.sqlite";
const EXPORT_FORMAT_VERSION: u32 = 1;
const MAX_NAME_CHARS: usize = 200;
const MAX_TITLE_CHARS: usize = 500;
const MAX_TEXT_CHARS: usize = 200_000;
const MAX_TAGS: usize = 50;
const MAX_TAG_CHARS: usize = 50;
const MAX_SETTING_KEY_CHARS: usize = 64;
const MAX_SETTING_VALUE_CHARS: usize = 100_000;
const MAX_WIP_LIMIT: i64 = 9_999;
const MAX_PASTED_ATTACHMENT_BYTES: usize = 50 * 1024 * 1024;
const MAX_ATTACHMENT_NAME_CHARS: usize = 80;
const AUTO_BACKUP_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const AUTO_BACKUPS_TO_KEEP: usize = 10;
const PRIORITIES: [&str; 4] = ["low", "medium", "high", "urgent"];
const DEFAULT_CARD_COLOR: &str = "#3b82f6";
/// File types that are revealed in Explorer instead of being launched directly.
const REVEAL_ONLY_EXTENSIONS: [&str; 28] = [
    "appx", "bat", "cmd", "com", "cpl", "dll", "exe", "hta", "inf", "jar", "js", "jse", "lnk",
    "msc", "msi", "msix", "pif", "ps1", "psm1", "reg", "scf", "scr", "sys", "url", "vbe", "vbs",
    "wsf", "wsh",
];

const SCHEMA_V1: &str = "
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
";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Board {
    id: String,
    name: String,
    #[serde(default)]
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
    app_version: String,
    check_for_updates: bool,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct AppConfig {
    vault_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    check_for_updates: Option<bool>,
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
    #[serde(default)]
    settings: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportCard {
    id: String,
    board_id: String,
    column_id: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    priority: String,
    due_date: Option<String>,
    #[serde(default)]
    color: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
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

#[derive(Debug, Serialize)]
struct ImportSummary {
    boards: usize,
    cards: usize,
    attachments: usize,
    backup_path: String,
}

#[derive(Debug, Serialize)]
struct RestoreSummary {
    backup_path: String,
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
    app_version: String,
    last_error: Mutex<Option<String>>,
}

impl Database {
    fn open_at(app_dir: PathBuf) -> AppResult<Self> {
        let attachments_dir = app_dir.join("attachments");
        let exports_dir = app_dir.join("exports");
        let backups_dir = app_dir.join("backups");
        for dir in [&app_dir, &attachments_dir, &exports_dir, &backups_dir] {
            fs::create_dir_all(dir)
                .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
        }

        let db_path = app_dir.join(DATABASE_FILE);
        let conn = Connection::open(&db_path)
            .map_err(|error| format!("Could not open the vault database: {error}"))?;
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
            .map_err(to_string)
    }

    /// Brings the vault schema to `SCHEMA_VERSION`. Vaults created before schema
    /// versioning report version 0 and already contain the version 1 tables.
    fn migrate(&mut self) -> AppResult<()> {
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(to_string)?;
        if version > SCHEMA_VERSION {
            return Err(newer_vault_error());
        }

        let tx = self.conn.transaction().map_err(to_string)?;
        tx.execute_batch(SCHEMA_V1).map_err(to_string)?;
        if version == 0 {
            let boards: i64 = tx
                .query_row("SELECT COUNT(*) FROM boards", [], |row| row.get(0))
                .map_err(to_string)?;
            let settings: i64 = tx
                .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
                .map_err(to_string)?;
            if boards == 0 && settings == 0 {
                seed(&tx)?;
            }
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)
                .map_err(to_string)?;
        }
        tx.commit().map_err(to_string)
    }

    fn snapshot(&self) -> AppResult<Snapshot> {
        Ok(Snapshot {
            boards: self.boards()?,
            columns: self.columns()?,
            cards: self.cards()?,
            settings: self.settings()?,
            app_data_dir: String::new(),
            database_path: self.db_path.to_string_lossy().to_string(),
            vault_path: Some(self.app_dir.to_string_lossy().to_string()),
            vault_required: false,
            config_path: String::new(),
            status_error: None,
            app_version: String::new(),
            check_for_updates: true,
        })
    }

    fn boards(&self) -> AppResult<Vec<Board>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, description, sort_order, created_at, updated_at FROM boards ORDER BY sort_order, created_at")
            .map_err(to_string)?;
        let boards = stmt
            .query_map([], board_from_row)
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(boards)
    }

    fn board(&self, id: &str) -> AppResult<Board> {
        self.conn
            .query_row(
                "SELECT id, name, description, sort_order, created_at, updated_at FROM boards WHERE id = ?1",
                params![id],
                board_from_row,
            )
            .optional()
            .map_err(to_string)?
            .ok_or_else(|| "This board no longer exists.".to_string())
    }

    fn columns(&self) -> AppResult<Vec<KanbanColumn>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, board_id, name, sort_order, wip_limit, created_at, updated_at FROM columns ORDER BY sort_order, created_at")
            .map_err(to_string)?;
        let columns = stmt
            .query_map([], column_from_row)
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(columns)
    }

    fn column(&self, id: &str) -> AppResult<KanbanColumn> {
        self.conn
            .query_row(
                "SELECT id, board_id, name, sort_order, wip_limit, created_at, updated_at FROM columns WHERE id = ?1",
                params![id],
                column_from_row,
            )
            .optional()
            .map_err(to_string)?
            .ok_or_else(|| "This column no longer exists.".to_string())
    }

    fn cards(&self) -> AppResult<Vec<Card>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at
                 FROM cards ORDER BY sort_order, created_at",
            )
            .map_err(to_string)?;
        let mut cards = stmt
            .query_map([], card_from_row)
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;

        let mut tags: HashMap<String, Vec<String>> = HashMap::new();
        let mut stmt = self
            .conn
            .prepare("SELECT card_id, tag FROM card_tags ORDER BY tag")
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(to_string)?;
        for row in rows {
            let (card_id, tag) = row.map_err(to_string)?;
            tags.entry(card_id).or_default().push(tag);
        }

        let mut attachments: HashMap<String, Vec<Attachment>> = HashMap::new();
        let mut stmt = self
            .conn
            .prepare("SELECT id, card_id, file_name, file_path, mime_type, created_at FROM attachments ORDER BY created_at")
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| self.attachment_from_row(row))
            .map_err(to_string)?;
        for row in rows {
            let attachment = row.map_err(to_string)?;
            attachments
                .entry(attachment.card_id.clone())
                .or_default()
                .push(attachment);
        }

        for card in &mut cards {
            card.tags = tags.remove(&card.id).unwrap_or_default();
            card.attachments = attachments.remove(&card.id).unwrap_or_default();
        }
        Ok(cards)
    }

    fn card_by_id(&self, card_id: &str) -> AppResult<Card> {
        let mut card = self
            .conn
            .query_row(
                "SELECT id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at
                 FROM cards WHERE id = ?1",
                params![card_id],
                card_from_row,
            )
            .optional()
            .map_err(to_string)?
            .ok_or_else(|| "This task no longer exists.".to_string())?;
        card.tags = self.tags_for_card(card_id)?;
        card.attachments = self.attachments_for_card(card_id)?;
        Ok(card)
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
            .query_map(params![card_id], |row| self.attachment_from_row(row))
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        Ok(attachments)
    }

    fn attachment(&self, id: &str) -> AppResult<Attachment> {
        self.conn
            .query_row(
                "SELECT id, card_id, file_name, file_path, mime_type, created_at FROM attachments WHERE id = ?1",
                params![id],
                |row| self.attachment_from_row(row),
            )
            .optional()
            .map_err(to_string)?
            .ok_or_else(|| "This attachment no longer exists.".to_string())
    }

    fn attachment_from_row(&self, row: &rusqlite::Row<'_>) -> rusqlite::Result<Attachment> {
        let id: String = row.get(0)?;
        let card_id: String = row.get(1)?;
        let file_name: String = row.get(2)?;
        let stored_path: String = row.get(3)?;
        let file_path = self
            .resolve_attachment_path(&card_id, &id, &file_name, &stored_path)
            .to_string_lossy()
            .to_string();
        Ok(Attachment {
            id,
            card_id,
            file_name,
            file_path,
            mime_type: row.get(4)?,
            created_at: row.get(5)?,
        })
    }

    fn attachment_path(&self, card_id: &str, attachment_id: &str, file_name: &str) -> PathBuf {
        self.attachments_dir
            .join(card_id)
            .join(format!("{attachment_id}-{file_name}"))
    }

    /// Attachments live at a predictable place inside the vault, so a vault that was
    /// moved or copied keeps working even though older rows store absolute paths.
    fn resolve_attachment_path(
        &self,
        card_id: &str,
        attachment_id: &str,
        file_name: &str,
        stored_path: &str,
    ) -> PathBuf {
        let expected = self.attachment_path(card_id, attachment_id, file_name);
        if expected.exists() || stored_path.is_empty() {
            return expected;
        }
        let stored = PathBuf::from(stored_path);
        if stored.exists() && is_within(&stored, &self.app_dir) {
            stored
        } else {
            expected
        }
    }

    fn settings(&self) -> AppResult<HashMap<String, String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM app_settings")
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(to_string)?;
        let mut settings = HashMap::new();
        for row in rows {
            let (key, value) = row.map_err(to_string)?;
            settings.insert(key, value);
        }
        Ok(settings)
    }

    fn create_board(&mut self, name: &str, description: &str) -> AppResult<Board> {
        let name = clean_name(name, "Board name")?;
        let description = clean_text(description, "Board description")?;
        let tx = self.conn.transaction().map_err(to_string)?;
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
            params![board_id, name, description, sort_order, now],
        )
        .map_err(to_string)?;
        for (index, column_name) in ["Backlog", "In Progress", "Done"].iter().enumerate() {
            tx.execute(
                "INSERT INTO columns (id, board_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![id(), board_id, column_name, index as i64 * 1000, now],
            )
            .map_err(to_string)?;
        }
        save_setting_inner(&tx, "selected_board_id", &board_id)?;
        tx.commit().map_err(to_string)?;
        self.board(&board_id)
    }

    fn update_board(&self, id: &str, name: &str, description: &str) -> AppResult<Board> {
        let name = clean_name(name, "Board name")?;
        let description = clean_text(description, "Board description")?;
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
                params![name, description, now(), id],
            )
            .map_err(to_string)?;
        if changed == 0 {
            return Err("This board no longer exists.".to_string());
        }
        self.board(id)
    }

    fn delete_board(&mut self, id: &str) -> AppResult<()> {
        let card_ids = self.card_ids_where("board_id", id)?;
        let tx = self.conn.transaction().map_err(to_string)?;
        tx.execute("DELETE FROM boards WHERE id = ?1", params![id])
            .map_err(to_string)?;
        let next_id: Option<String> = tx
            .query_row(
                "SELECT id FROM boards ORDER BY sort_order, created_at LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)?;
        match next_id {
            Some(next_id) => save_setting_inner(&tx, "selected_board_id", &next_id)?,
            None => {
                tx.execute(
                    "DELETE FROM app_settings WHERE key = 'selected_board_id'",
                    [],
                )
                .map_err(to_string)?;
            }
        }
        tx.commit().map_err(to_string)?;
        self.remove_card_files(&card_ids);
        Ok(())
    }

    fn create_column(&self, board_id: &str, name: &str) -> AppResult<KanbanColumn> {
        let name = clean_name(name, "Column name")?;
        self.board(board_id)?;
        let sort_order: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1000) + 1000 FROM columns WHERE board_id = ?1",
                params![board_id],
                |row| row.get(0),
            )
            .map_err(to_string)?;
        let column_id = id();
        self.conn
            .execute(
                "INSERT INTO columns (id, board_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![column_id, board_id, name, sort_order, now()],
            )
            .map_err(to_string)?;
        self.column(&column_id)
    }

    fn update_column(&self, id: &str, name: &str, wip_limit: Option<i64>) -> AppResult<KanbanColumn> {
        let name = clean_name(name, "Column name")?;
        let wip_limit = clean_wip_limit(wip_limit)?;
        let changed = self
            .conn
            .execute(
                "UPDATE columns SET name = ?1, wip_limit = ?2, updated_at = ?3 WHERE id = ?4",
                params![name, wip_limit, now(), id],
            )
            .map_err(to_string)?;
        if changed == 0 {
            return Err("This column no longer exists.".to_string());
        }
        self.column(id)
    }

    fn delete_column(&mut self, id: &str) -> AppResult<()> {
        let card_ids = self.card_ids_where("column_id", id)?;
        self.conn
            .execute("DELETE FROM columns WHERE id = ?1", params![id])
            .map_err(to_string)?;
        self.remove_card_files(&card_ids);
        Ok(())
    }

    fn reorder_columns(&mut self, board_id: &str, ordered_ids: &[String]) -> AppResult<()> {
        let tx = self.conn.transaction().map_err(to_string)?;
        let now = now();
        for (index, column_id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE columns SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND board_id = ?4",
                params![index as i64 * 1000, now, column_id, board_id],
            )
            .map_err(to_string)?;
        }
        tx.commit().map_err(to_string)
    }

    fn upsert_card(&mut self, card: CardInput) -> AppResult<Card> {
        let title = clean_title(&card.title)?;
        let description = clean_text(&card.description, "Task notes")?;
        let priority = clean_priority(&card.priority)?;
        let due_date = clean_due_date(card.due_date.as_deref())?;
        let color = clean_color(&card.color);
        let tags = normalized_tags(&card.tags);
        if tags.len() > MAX_TAGS {
            return Err(format!("A task can have at most {MAX_TAGS} tags."));
        }
        let card_id = match card.id {
            Some(value) if !value.trim().is_empty() => {
                if !is_safe_id(&value) {
                    return Err("The task identifier is invalid.".to_string());
                }
                value
            }
            _ => id(),
        };

        let tx = self.conn.transaction().map_err(to_string)?;
        let column_board: Option<String> = tx
            .query_row(
                "SELECT board_id FROM columns WHERE id = ?1",
                params![card.column_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)?;
        if column_board.as_deref() != Some(card.board_id.as_str()) {
            return Err("The selected column no longer exists on this board.".to_string());
        }
        let existing_column: Option<String> = tx
            .query_row(
                "SELECT column_id FROM cards WHERE id = ?1",
                params![card_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)?;
        let end_of_column = |tx: &Transaction| -> AppResult<i64> {
            tx.query_row(
                "SELECT COALESCE(MAX(sort_order), -1000) + 1000 FROM cards WHERE column_id = ?1",
                params![card.column_id],
                |row| row.get(0),
            )
            .map_err(to_string)
        };
        let now = now();

        match existing_column {
            Some(previous_column) => {
                let sort_order = if previous_column == card.column_id {
                    None
                } else {
                    Some(end_of_column(&tx)?)
                };
                tx.execute(
                    "UPDATE cards
                     SET board_id = ?1, column_id = ?2, title = ?3, description = ?4, priority = ?5,
                         due_date = ?6, color = ?7, updated_at = ?8, sort_order = COALESCE(?9, sort_order)
                     WHERE id = ?10",
                    params![
                        card.board_id,
                        card.column_id,
                        title,
                        description,
                        priority,
                        due_date,
                        color,
                        now,
                        sort_order,
                        card_id
                    ],
                )
                .map_err(to_string)?;
            }
            None => {
                let sort_order = match card.sort_order {
                    Some(value) => value,
                    None => end_of_column(&tx)?,
                };
                tx.execute(
                    "INSERT INTO cards (id, board_id, column_id, title, description, priority, due_date, color, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                    params![
                        card_id,
                        card.board_id,
                        card.column_id,
                        title,
                        description,
                        priority,
                        due_date,
                        color,
                        sort_order,
                        now
                    ],
                )
                .map_err(to_string)?;
            }
        }

        tx.execute("DELETE FROM card_tags WHERE card_id = ?1", params![card_id])
            .map_err(to_string)?;
        for tag in tags {
            tx.execute(
                "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, ?3)",
                params![id(), card_id, tag],
            )
            .map_err(to_string)?;
        }
        tx.commit().map_err(to_string)?;
        self.card_by_id(&card_id)
    }

    fn delete_card(&mut self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM cards WHERE id = ?1", params![id])
            .map_err(to_string)?;
        self.remove_card_files(&[id.to_string()]);
        Ok(())
    }

    fn reorder_cards(&mut self, updates: &[CardOrderUpdate]) -> AppResult<()> {
        let tx = self.conn.transaction().map_err(to_string)?;
        let now = now();
        for update in updates {
            tx.execute(
                "UPDATE cards SET column_id = ?1, sort_order = ?2, updated_at = ?3
                 WHERE id = ?4 AND EXISTS (SELECT 1 FROM columns WHERE id = ?1 AND board_id = cards.board_id)",
                params![update.column_id, update.sort_order, now, update.id],
            )
            .map_err(to_string)?;
        }
        tx.commit().map_err(to_string)
    }

    fn save_setting(&self, key: &str, value: &str) -> AppResult<()> {
        if key.trim().is_empty() || key.chars().count() > MAX_SETTING_KEY_CHARS {
            return Err("Setting name is invalid.".to_string());
        }
        if value.chars().count() > MAX_SETTING_VALUE_CHARS {
            return Err("Setting value is too large.".to_string());
        }
        save_setting_inner(&self.conn, key, value)
    }

    fn store_attachment(
        &self,
        card_id: &str,
        file_name: &str,
        mime_type: &str,
        bytes: &[u8],
    ) -> AppResult<Attachment> {
        self.ensure_card(card_id)?;
        let attachment_id = id();
        let safe_name = safe_file_name(file_name);
        let path = self.attachment_path(card_id, &attachment_id, &safe_name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(to_string)?;
        }
        fs::write(&path, bytes)
            .map_err(|error| format!("Could not save the attachment: {error}"))?;
        self.insert_attachment_row(card_id, &attachment_id, &safe_name, mime_type, &path)
    }

    fn copy_attachment(&self, card_id: &str, source: &Path) -> AppResult<Attachment> {
        self.ensure_card(card_id)?;
        let file_name = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "attachment".to_string());
        let attachment_id = id();
        let safe_name = safe_file_name(&file_name);
        let path = self.attachment_path(card_id, &attachment_id, &safe_name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(to_string)?;
        }
        fs::copy(source, &path)
            .map_err(|error| format!("Could not copy {file_name}: {error}"))?;
        self.insert_attachment_row(card_id, &attachment_id, &safe_name, mime_from_name(&safe_name), &path)
    }

    fn insert_attachment_row(
        &self,
        card_id: &str,
        attachment_id: &str,
        file_name: &str,
        mime_type: &str,
        path: &Path,
    ) -> AppResult<Attachment> {
        let mime_type = if mime_type.trim().is_empty() || mime_type.len() > 255 {
            mime_from_name(file_name)
        } else {
            mime_type.trim()
        };
        let inserted = self.conn.execute(
            "INSERT INTO attachments (id, card_id, file_name, file_path, mime_type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                attachment_id,
                card_id,
                file_name,
                path.to_string_lossy().to_string(),
                mime_type,
                now()
            ],
        );
        if let Err(error) = inserted {
            let _ = fs::remove_file(path);
            return Err(error.to_string());
        }
        self.attachment(attachment_id)
    }

    fn delete_attachment(&mut self, id: &str) -> AppResult<()> {
        let attachment = self.attachment(id)?;
        self.conn
            .execute("DELETE FROM attachments WHERE id = ?1", params![id])
            .map_err(to_string)?;
        let path = PathBuf::from(&attachment.file_path);
        if is_within(&path, &self.attachments_dir) {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    fn ensure_card(&self, card_id: &str) -> AppResult<()> {
        if !is_safe_id(card_id) {
            return Err("The task identifier is invalid.".to_string());
        }
        let exists: bool = self
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM cards WHERE id = ?1)",
                params![card_id],
                |row| row.get(0),
            )
            .map_err(to_string)?;
        if exists {
            Ok(())
        } else {
            Err("Save the task before adding attachments.".to_string())
        }
    }

    fn card_ids_where(&self, column: &str, value: &str) -> AppResult<Vec<String>> {
        let sql = match column {
            "board_id" => "SELECT id FROM cards WHERE board_id = ?1",
            "column_id" => "SELECT id FROM cards WHERE column_id = ?1",
            _ => return Err("Unsupported card filter.".to_string()),
        };
        let mut stmt = self.conn.prepare(sql).map_err(to_string)?;
        let ids = stmt
            .query_map(params![value], |row| row.get(0))
            .map_err(to_string)?
            .collect::<Result<Vec<String>, _>>()
            .map_err(to_string)?;
        Ok(ids)
    }

    /// Best-effort cleanup of attachment folders for cards that were deleted.
    fn remove_card_files(&self, card_ids: &[String]) {
        for card_id in card_ids.iter().filter(|card_id| is_safe_id(card_id)) {
            let dir = self.attachments_dir.join(card_id);
            if dir.is_dir() {
                let _ = fs::remove_dir_all(dir);
            }
        }
    }

    fn export_bundle(&self) -> AppResult<ExportBundle> {
        let mut cards = Vec::new();
        for card in self.cards()? {
            let mut attachments = Vec::new();
            for attachment in &card.attachments {
                // A missing file must not block an export of everything else.
                let bytes = fs::read(&attachment.file_path).unwrap_or_default();
                attachments.push(ExportAttachment {
                    id: attachment.id.clone(),
                    card_id: attachment.card_id.clone(),
                    file_name: attachment.file_name.clone(),
                    mime_type: attachment.mime_type.clone(),
                    created_at: attachment.created_at.clone(),
                    data_base64: general_purpose::STANDARD.encode(bytes),
                });
            }
            cards.push(ExportCard {
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
            });
        }
        Ok(ExportBundle {
            version: EXPORT_FORMAT_VERSION,
            exported_at: now(),
            boards: self.boards()?,
            columns: self.columns()?,
            cards,
            settings: self.settings()?,
        })
    }

    fn export_json(&self) -> AppResult<PathBuf> {
        let bundle = self.export_bundle()?;
        let json = serde_json::to_string_pretty(&bundle).map_err(to_string)?;
        let path = unique_path(
            &self.exports_dir,
            &format!("local-kanban-export-{}", file_stamp()),
            "json",
        );
        fs::write(&path, json.as_bytes())
            .map_err(|error| format!("Could not write the export: {error}"))?;
        Ok(path)
    }

    /// Replaces the vault contents with an export bundle. Everything is validated and a
    /// database backup is written before any existing data is touched.
    fn import_bundle(&mut self, bundle: ExportBundle) -> AppResult<ImportSummary> {
        if bundle.version != EXPORT_FORMAT_VERSION {
            return Err(format!(
                "This export uses format version {}, which this version of Local Kanban cannot read.",
                bundle.version
            ));
        }

        let invalid = |what: &str| format!("The export file is damaged: {what}.");
        let mut board_ids = HashSet::new();
        for board in &bundle.boards {
            if !is_safe_id(&board.id) || !board_ids.insert(board.id.as_str()) {
                return Err(invalid("a board has a missing or duplicate identifier"));
            }
        }
        let mut column_boards = HashMap::new();
        for column in &bundle.columns {
            if !is_safe_id(&column.id) || column_boards.contains_key(column.id.as_str()) {
                return Err(invalid("a column has a missing or duplicate identifier"));
            }
            if !board_ids.contains(column.board_id.as_str()) {
                return Err(invalid("a column belongs to a board that is not in the file"));
            }
            column_boards.insert(column.id.as_str(), column.board_id.as_str());
        }
        let mut card_ids = HashSet::new();
        let mut attachment_ids = HashSet::new();
        let mut files = Vec::new();
        for card in &bundle.cards {
            if !is_safe_id(&card.id) || !card_ids.insert(card.id.as_str()) {
                return Err(invalid("a task has a missing or duplicate identifier"));
            }
            if column_boards.get(card.column_id.as_str()) != Some(&card.board_id.as_str()) {
                return Err(invalid("a task belongs to a column that is not in the file"));
            }
            for attachment in &card.attachments {
                if !is_safe_id(&attachment.id) || !attachment_ids.insert(attachment.id.as_str()) {
                    return Err(invalid("an attachment has a missing or duplicate identifier"));
                }
                let bytes = general_purpose::STANDARD
                    .decode(attachment.data_base64.as_bytes())
                    .map_err(|_| invalid("an attachment could not be decoded"))?;
                files.push((card.id.as_str(), attachment, safe_file_name(&attachment.file_name), bytes));
            }
        }

        let backup = self.backup("before-import")?;

        for (card_id, attachment, safe_name, bytes) in &files {
            let path = self.attachment_path(card_id, &attachment.id, safe_name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(to_string)?;
            }
            fs::write(&path, bytes)
                .map_err(|error| format!("Could not write an imported attachment: {error}"))?;
        }

        let attachment_rows: Vec<_> = files
            .iter()
            .map(|(card_id, attachment, safe_name, _)| {
                let path = self.attachment_path(card_id, &attachment.id, safe_name);
                (*card_id, *attachment, safe_name, path_string(path))
            })
            .collect();

        let tx = self.conn.transaction().map_err(to_string)?;
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
                params![
                    board.id,
                    fallback_name(&board.name, "Untitled board"),
                    board.description,
                    board.sort_order,
                    board.created_at,
                    board.updated_at
                ],
            )
            .map_err(to_string)?;
        }
        for column in &bundle.columns {
            tx.execute(
                "INSERT INTO columns (id, board_id, name, sort_order, wip_limit, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    column.id,
                    column.board_id,
                    fallback_name(&column.name, "Untitled column"),
                    column.sort_order,
                    clean_wip_limit(column.wip_limit).unwrap_or(None),
                    column.created_at,
                    column.updated_at
                ],
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
                    fallback_name(&card.title, "Untitled task"),
                    card.description,
                    clean_priority(&card.priority).unwrap_or_else(|_| "medium".to_string()),
                    clean_due_date(card.due_date.as_deref()).unwrap_or(None),
                    clean_color(&card.color),
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
        for (card_id, attachment, safe_name, path) in &attachment_rows {
            tx.execute(
                "INSERT INTO attachments (id, card_id, file_name, file_path, mime_type, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    attachment.id,
                    card_id,
                    safe_name,
                    path,
                    attachment.mime_type,
                    attachment.created_at
                ],
            )
            .map_err(to_string)?;
        }
        for (key, value) in &bundle.settings {
            save_setting_inner(&tx, key, value)?;
        }
        tx.commit().map_err(to_string)?;

        Ok(ImportSummary {
            boards: bundle.boards.len(),
            cards: bundle.cards.len(),
            attachments: files.len(),
            backup_path: backup.to_string_lossy().to_string(),
        })
    }

    fn export_board_markdown(&self, board_id: &str) -> AppResult<PathBuf> {
        let board = self.board(board_id)?;
        let columns: Vec<_> = self
            .columns()?
            .into_iter()
            .filter(|column| column.board_id == board.id)
            .collect();
        let cards = self.cards()?;
        let mut markdown = format!("# {}\n\n", board.name);
        if !board.description.trim().is_empty() {
            markdown.push_str(&format!("{}\n\n", board.description.trim()));
        }
        for column in columns {
            markdown.push_str(&format!("## {}\n\n", column.name));
            for card in cards.iter().filter(|card| card.column_id == column.id) {
                markdown.push_str(&format!(
                    "### {}\n\nPriority: **{}**  \nDue: {}  \nTags: {}\n\n{}\n\n",
                    card.title,
                    card.priority,
                    card.due_date.as_deref().unwrap_or("none"),
                    if card.tags.is_empty() { "none".to_string() } else { card.tags.join(", ") },
                    card.description
                ));
            }
        }
        let path = unique_path(
            &self.exports_dir,
            &format!("{}-{}", slug(&board.name), file_stamp()),
            "md",
        );
        fs::write(&path, markdown.as_bytes())
            .map_err(|error| format!("Could not write the export: {error}"))?;
        Ok(path)
    }

    fn export_board_csv(&self, board_id: &str) -> AppResult<PathBuf> {
        let board = self.board(board_id)?;
        let columns = self.columns()?;
        let cards = self.cards()?;
        let path = unique_path(
            &self.exports_dir,
            &format!("{}-{}", slug(&board.name), file_stamp()),
            "csv",
        );
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
                    csv_cell(&board.name),
                    csv_cell(column_name),
                    csv_cell(&card.title),
                    csv_cell(&card.description),
                    csv_cell(&card.priority),
                    csv_cell(card.due_date.as_deref().unwrap_or("")),
                    csv_cell(&card.color),
                    csv_cell(&card.tags.join(", ")),
                    csv_cell(&card.created_at),
                    csv_cell(&card.updated_at),
                ])
                .map_err(to_string)?;
        }
        writer.flush().map_err(to_string)?;
        Ok(path)
    }

    /// Writes a consistent, compacted copy of the database into the backups folder.
    fn backup(&self, kind: &str) -> AppResult<PathBuf> {
        let path = unique_path(
            &self.backups_dir,
            &format!("local-kanban-{kind}-{}", file_stamp()),
            "sqlite3",
        );
        self.conn
            .execute("VACUUM INTO ?1", params![path.to_string_lossy().to_string()])
            .map_err(|error| format!("Could not create a backup: {error}"))?;
        Ok(path)
    }

    /// Creates at most one automatic backup per day and keeps the most recent ones.
    fn auto_backup(&self) -> AppResult<Option<PathBuf>> {
        let has_data: bool = self
            .conn
            .query_row("SELECT EXISTS(SELECT 1 FROM boards)", [], |row| row.get(0))
            .map_err(to_string)?;
        if !has_data {
            return Ok(None);
        }
        let mut existing = self.auto_backups();
        let recent = existing.first().is_some_and(|latest| {
            fs::metadata(latest)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| SystemTime::now().duration_since(modified).ok())
                .is_some_and(|age| age < AUTO_BACKUP_INTERVAL)
        });
        if recent {
            return Ok(None);
        }
        let path = self.backup("auto")?;
        existing.insert(0, path.clone());
        for old in existing.iter().skip(AUTO_BACKUPS_TO_KEEP) {
            let _ = fs::remove_file(old);
        }
        Ok(Some(path))
    }

    fn auto_backups(&self) -> Vec<PathBuf> {
        let mut backups: Vec<PathBuf> = fs::read_dir(&self.backups_dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|path| {
                        path.file_name()
                            .map(|name| name.to_string_lossy())
                            .is_some_and(|name| {
                                name.starts_with("local-kanban-auto-") && name.ends_with(".sqlite3")
                            })
                    })
                    .collect()
            })
            .unwrap_or_default();
        backups.sort();
        backups.reverse();
        backups
    }

    /// Restores a backup into the live database. The current data is backed up first
    /// and the vault is left unchanged if the restore fails.
    fn restore_from(&mut self, source: &Path) -> AppResult<PathBuf> {
        if is_same_file(source, &self.db_path) {
            return Err("Choose a backup file, not the live vault database.".to_string());
        }
        validate_backup(source)?;
        let safety_backup = self.backup("before-restore")?;
        self.conn
            .execute_batch("PRAGMA journal_mode = DELETE;")
            .map_err(to_string)?;
        let restored = self
            .conn
            .restore(DatabaseName::Main, source, None::<fn(rusqlite::backup::Progress)>);
        let configured = self.configure();
        restored.map_err(|error| {
            format!("Could not restore the backup ({error}). Your data was not changed.")
        })?;
        configured?;
        self.migrate()?;
        Ok(safety_backup)
    }
}

impl AppState {
    fn with_db<R>(&self, action: impl FnOnce(&mut Database) -> AppResult<R>) -> AppResult<R> {
        let mut guard = lock(&self.db);
        let db = guard.as_mut().ok_or_else(no_vault_error)?;
        action(db)
    }

    fn config(&self) -> AppConfig {
        read_config(&self.config_path).unwrap_or_default()
    }

    fn snapshot(&self) -> AppResult<Snapshot> {
        let check_for_updates = self.config().check_for_updates.unwrap_or(true);
        let guard = lock(&self.db);
        let mut snapshot = match guard.as_ref() {
            Some(db) => db.snapshot()?,
            None => Snapshot {
                boards: Vec::new(),
                columns: Vec::new(),
                cards: Vec::new(),
                settings: HashMap::new(),
                app_data_dir: String::new(),
                database_path: String::new(),
                vault_path: self.config().vault_path,
                vault_required: true,
                config_path: String::new(),
                status_error: lock(&self.last_error).clone(),
                app_version: String::new(),
                check_for_updates,
            },
        };
        snapshot.app_data_dir = self.app_data_dir.to_string_lossy().to_string();
        snapshot.config_path = self.config_path.to_string_lossy().to_string();
        snapshot.app_version = self.app_version.clone();
        snapshot.check_for_updates = check_for_updates;
        Ok(snapshot)
    }

    fn set_vault(&self, vault_path: PathBuf) -> AppResult<Snapshot> {
        let db = Database::open_at(vault_path.clone()).map_err(|error| {
            format!("Could not open the vault at {}: {error}", vault_path.display())
        })?;
        if let Err(error) = db.auto_backup() {
            eprintln!("Automatic backup skipped: {error}");
        }
        let mut config = self.config();
        config.vault_path = Some(vault_path.to_string_lossy().to_string());
        write_config(&self.config_path, &config)?;
        *lock(&self.db) = Some(db);
        *lock(&self.last_error) = None;
        self.snapshot()
    }

    fn set_update_checks(&self, enabled: bool) -> AppResult<()> {
        let mut config = self.config();
        config.check_for_updates = Some(enabled);
        write_config(&self.config_path, &config)
    }

    fn attachments_dir(&self) -> Option<PathBuf> {
        lock(&self.db).as_ref().map(|db| db.attachments_dir.clone())
    }

    fn vault_dir(&self) -> AppResult<PathBuf> {
        self.with_db(|db| Ok(db.app_dir.clone()))
    }
}

#[tauri::command]
async fn load_snapshot(state: State<'_, AppState>) -> AppResult<Snapshot> {
    state.snapshot()
}

#[tauri::command]
async fn choose_vault_folder(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
) -> AppResult<Option<Snapshot>> {
    let Some(folder) = rfd::FileDialog::new()
        .set_title("Choose a folder for your Local Kanban vault")
        .set_parent(&window)
        .pick_folder()
    else {
        return Ok(None);
    };
    let snapshot = state.set_vault(folder)?;
    allow_vault_assets(&app, &state);
    Ok(Some(snapshot))
}

#[tauri::command]
async fn open_vault_folder(state: State<'_, AppState>) -> AppResult<()> {
    let dir = state.vault_dir()?;
    opener::open(&dir).map_err(|error| format!("Could not open the vault folder: {error}"))
}

#[tauri::command]
async fn set_update_checks(enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    state.set_update_checks(enabled)
}

#[tauri::command]
async fn create_board(name: String, description: String, state: State<'_, AppState>) -> AppResult<Board> {
    state.with_db(|db| db.create_board(&name, &description))
}

#[tauri::command]
async fn update_board(
    id: String,
    name: String,
    description: String,
    state: State<'_, AppState>,
) -> AppResult<Board> {
    state.with_db(|db| db.update_board(&id, &name, &description))
}

#[tauri::command]
async fn delete_board(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.delete_board(&id))
}

#[tauri::command]
async fn create_column(
    board_id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<KanbanColumn> {
    state.with_db(|db| db.create_column(&board_id, &name))
}

#[tauri::command]
async fn update_column(
    id: String,
    name: String,
    wip_limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<KanbanColumn> {
    state.with_db(|db| db.update_column(&id, &name, wip_limit))
}

#[tauri::command]
async fn delete_column(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.delete_column(&id))
}

#[tauri::command]
async fn reorder_columns(
    board_id: String,
    ordered_ids: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.with_db(|db| db.reorder_columns(&board_id, &ordered_ids))
}

#[tauri::command]
async fn upsert_card(card: CardInput, state: State<'_, AppState>) -> AppResult<Card> {
    state.with_db(|db| db.upsert_card(card))
}

#[tauri::command]
async fn delete_card(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.delete_card(&id))
}

#[tauri::command]
async fn reorder_cards(updates: Vec<CardOrderUpdate>, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.reorder_cards(&updates))
}

#[tauri::command]
async fn save_setting(key_name: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.save_setting(&key_name, &value))
}

#[tauri::command]
async fn add_attachment(
    card_id: String,
    file_name: String,
    mime_type: String,
    data_base64: String,
    state: State<'_, AppState>,
) -> AppResult<Attachment> {
    if data_base64.len() / 4 * 3 > MAX_PASTED_ATTACHMENT_BYTES {
        return Err("Pasted files can be up to 50 MB. Use Attach file for larger files.".to_string());
    }
    let bytes = general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|_| "The pasted file could not be read.".to_string())?;
    state.with_db(|db| db.store_attachment(&card_id, &file_name, &mime_type, &bytes))
}

#[tauri::command]
async fn attach_files(
    card_id: String,
    window: Window,
    state: State<'_, AppState>,
) -> AppResult<Vec<Attachment>> {
    state.with_db(|db| db.ensure_card(&card_id))?;
    let Some(files) = rfd::FileDialog::new()
        .set_title("Attach files")
        .set_parent(&window)
        .pick_files()
    else {
        return Ok(Vec::new());
    };
    state.with_db(|db| {
        files
            .iter()
            .map(|file| db.copy_attachment(&card_id, file))
            .collect()
    })
}

#[tauri::command]
async fn delete_attachment(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.with_db(|db| db.delete_attachment(&id))
}

/// Opens an attachment with its default app. Executable and script files are shown in
/// Explorer instead so an imported file can never run by accident.
#[tauri::command]
async fn open_attachment(id: String, state: State<'_, AppState>) -> AppResult<String> {
    let (path, vault) = state.with_db(|db| {
        let attachment = db.attachment(&id)?;
        Ok((PathBuf::from(attachment.file_path), db.app_dir.clone()))
    })?;
    if !path.exists() {
        return Err("This attachment file is missing from the vault folder.".to_string());
    }
    if !is_within(&path, &vault) {
        return Err("Only files inside the vault can be opened.".to_string());
    }
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if REVEAL_ONLY_EXTENSIONS.contains(&extension.as_str()) {
        opener::reveal(&path).map_err(to_string)?;
        return Ok("revealed".to_string());
    }
    opener::open(&path).map_err(|error| format!("Could not open the attachment: {error}"))?;
    Ok("opened".to_string())
}

/// Shows a vault file (export or backup) selected in Explorer.
#[tauri::command]
async fn reveal_path(path: String, state: State<'_, AppState>) -> AppResult<()> {
    let vault = state.vault_dir()?;
    let target = PathBuf::from(path);
    if !target.exists() || !is_within(&target, &vault) {
        return Err("Only files inside the vault can be shown.".to_string());
    }
    opener::reveal(&target).map_err(|error| format!("Could not show the file: {error}"))
}

#[tauri::command]
async fn open_url(url: String) -> AppResult<()> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    let allowed = ["https://", "http://", "mailto:"]
        .iter()
        .any(|prefix| lower.starts_with(prefix));
    if !allowed || url.len() > 4096 || url.chars().any(char::is_control) {
        return Err("Only web and email links can be opened.".to_string());
    }
    opener::open(url).map_err(|error| format!("Could not open the link: {error}"))
}

#[tauri::command]
async fn export_json(state: State<'_, AppState>) -> AppResult<String> {
    state.with_db(|db| db.export_json().map(path_string))
}

#[tauri::command]
async fn import_json_file(window: Window, state: State<'_, AppState>) -> AppResult<Option<ImportSummary>> {
    let exports_dir = state.with_db(|db| Ok(db.exports_dir.clone()))?;
    let Some(path) = rfd::FileDialog::new()
        .set_title("Import a Local Kanban JSON export")
        .add_filter("Local Kanban export", &["json"])
        .set_directory(exports_dir)
        .set_parent(&window)
        .pick_file()
    else {
        return Ok(None);
    };
    let json = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let bundle: ExportBundle = serde_json::from_str(&json)
        .map_err(|_| "This file is not a Local Kanban JSON export.".to_string())?;
    state.with_db(|db| db.import_bundle(bundle)).map(Some)
}

#[tauri::command]
async fn export_board_markdown(board_id: String, state: State<'_, AppState>) -> AppResult<String> {
    state.with_db(|db| db.export_board_markdown(&board_id).map(path_string))
}

#[tauri::command]
async fn export_board_csv(board_id: String, state: State<'_, AppState>) -> AppResult<String> {
    state.with_db(|db| db.export_board_csv(&board_id).map(path_string))
}

#[tauri::command]
async fn backup_database(state: State<'_, AppState>) -> AppResult<String> {
    state.with_db(|db| db.backup("backup").map(path_string))
}

#[tauri::command]
async fn restore_backup_file(window: Window, state: State<'_, AppState>) -> AppResult<Option<RestoreSummary>> {
    let backups_dir = state.with_db(|db| Ok(db.backups_dir.clone()))?;
    let Some(path) = rfd::FileDialog::new()
        .set_title("Restore a Local Kanban backup")
        .add_filter("Local Kanban backup", &["sqlite3", "sqlite", "db"])
        .set_directory(backups_dir)
        .set_parent(&window)
        .pick_file()
    else {
        return Ok(None);
    };
    state
        .with_db(|db| db.restore_from(&path))
        .map(|backup| {
            Some(RestoreSummary {
                backup_path: path_string(backup),
            })
        })
}

fn seed(tx: &Transaction) -> AppResult<()> {
    let now = now();
    let board_id = id();
    tx.execute(
        "INSERT INTO boards (id, name, description, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
        params![board_id, "Getting started", "A local-first board stored in your vault.", now],
    )
    .map_err(to_string)?;

    let mut first_column = String::new();
    for (index, name) in ["Backlog", "In Progress", "Review", "Done"].iter().enumerate() {
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
            "Welcome to Local Kanban",
            "Notes support **Markdown**.\n\n- [x] Everything is saved in your vault folder\n- [x] Drag tasks between columns, or use the ••• menu\n- [ ] Add your first real task\n\nPaste an image into the notes to attach it.",
            now
        ],
    )
    .map_err(to_string)?;
    tx.execute(
        "INSERT INTO card_tags (id, card_id, tag) VALUES (?1, ?2, ?3)",
        params![id(), card_id, "local-first"],
    )
    .map_err(to_string)?;
    save_setting_inner(tx, "selected_board_id", &board_id)?;
    save_setting_inner(tx, "theme_family", "default")?;
    save_setting_inner(tx, "theme_mode", "system")?;
    Ok(())
}

fn board_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Board> {
    Ok(Board {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn column_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KanbanColumn> {
    Ok(KanbanColumn {
        id: row.get(0)?,
        board_id: row.get(1)?,
        name: row.get(2)?,
        sort_order: row.get(3)?,
        wip_limit: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn card_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Card> {
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
}

fn validate_backup(path: &Path) -> AppResult<()> {
    let not_a_backup = || "This file is not a Local Kanban backup.".to_string();
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| not_a_backup())?;
    let check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|_| not_a_backup())?;
    if check != "ok" {
        return Err("This backup file is damaged and cannot be restored.".to_string());
    }
    let tables: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('boards', 'columns', 'cards')",
            [],
            |row| row.get(0),
        )
        .map_err(|_| not_a_backup())?;
    if tables != 3 {
        return Err(not_a_backup());
    }
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| not_a_backup())?;
    if version > SCHEMA_VERSION {
        return Err(newer_vault_error());
    }
    Ok(())
}

fn read_config(path: &Path) -> AppResult<AppConfig> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let json = fs::read_to_string(path).map_err(|error| {
        format!("Could not read the app settings at {}: {error}", path.display())
    })?;
    serde_json::from_str(&json).map_err(|error| {
        format!("Could not read the app settings at {}: {error}", path.display())
    })
}

/// Writes the config through a temporary file so a crash never leaves it half-written.
fn write_config(path: &Path, config: &AppConfig) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    let json = serde_json::to_string_pretty(config).map_err(to_string)?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, json)
        .and_then(|_| fs::rename(&temp, path))
        .map_err(|error| {
            format!("Could not save the app settings at {}: {error}", path.display())
        })
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

fn allow_vault_assets(app: &AppHandle, state: &AppState) {
    if let Some(dir) = state.attachments_dir() {
        if let Err(error) = app.asset_protocol_scope().allow_directory(&dir, true) {
            eprintln!("Could not allow attachment previews: {error}");
        }
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn clean_name(value: &str, label: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{label} cannot be empty."));
    }
    if value.chars().count() > MAX_NAME_CHARS {
        return Err(format!("{label} must be {MAX_NAME_CHARS} characters or fewer."));
    }
    Ok(value.to_string())
}

fn clean_title(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Task title cannot be empty.".to_string());
    }
    if value.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("Task title must be {MAX_TITLE_CHARS} characters or fewer."));
    }
    Ok(value.to_string())
}

fn clean_text(value: &str, label: &str) -> AppResult<String> {
    if value.chars().count() > MAX_TEXT_CHARS {
        return Err(format!("{label} are too long."));
    }
    Ok(value.to_string())
}

fn fallback_name(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.chars().take(MAX_TITLE_CHARS).collect()
    }
}

fn clean_priority(value: &str) -> AppResult<String> {
    let value = value.trim().to_lowercase();
    if PRIORITIES.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err("Priority must be low, medium, high, or urgent.".to_string())
    }
}

fn clean_due_date(value: Option<&str>) -> AppResult<Option<String>> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some(value) => NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map(|date| Some(date.format("%Y-%m-%d").to_string()))
            .map_err(|_| "Due date must be a valid date.".to_string()),
    }
}

fn clean_color(value: &str) -> String {
    let value = value.trim();
    let valid = value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|ch| ch.is_ascii_hexdigit());
    if valid {
        value.to_ascii_lowercase()
    } else {
        DEFAULT_CARD_COLOR.to_string()
    }
}

fn clean_wip_limit(value: Option<i64>) -> AppResult<Option<i64>> {
    match value {
        None | Some(0) => Ok(None),
        Some(limit) if (1..=MAX_WIP_LIMIT).contains(&limit) => Ok(Some(limit)),
        Some(_) => Err(format!("WIP limit must be between 1 and {MAX_WIP_LIMIT}.")),
    }
}

fn normalized_tags(tags: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = tags
        .iter()
        .flat_map(|tag| tag.split(','))
        .map(|tag| tag.trim().trim_start_matches('#').to_lowercase())
        .filter(|tag| !tag.is_empty())
        .map(|tag| tag.chars().take(MAX_TAG_CHARS).collect())
        .collect();
    normalized.sort();
    normalized.dedup();
    normalized
}

/// Identifiers become folder names, so only allow characters that are safe on disk.
fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

/// Sanitizes a file name and keeps it short enough for Windows path limits.
fn safe_file_name(value: &str) -> String {
    let sanitized = sanitize_filename::sanitize(value.trim());
    let sanitized = sanitized.trim_matches(|ch: char| ch == '.' || ch.is_whitespace());
    if sanitized.is_empty() {
        return "attachment".to_string();
    }
    if sanitized.chars().count() <= MAX_ATTACHMENT_NAME_CHARS {
        return sanitized.to_string();
    }
    let path = Path::new(sanitized);
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| value.chars().count() <= 10);
    let stem_limit = MAX_ATTACHMENT_NAME_CHARS - extension.as_ref().map_or(0, |ext| ext.chars().count() + 1);
    let stem: String = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default()
        .chars()
        .take(stem_limit)
        .collect();
    match extension {
        Some(extension) => format!("{stem}.{extension}"),
        None => stem,
    }
}

fn mime_from_name(file_name: &str) -> &'static str {
    let extension = Path::new(file_name)
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" | "log" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// Prevents spreadsheet apps from treating exported text as a formula.
fn csv_cell(value: &str) -> String {
    if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

fn is_within(path: &Path, root: &Path) -> bool {
    match (path.canonicalize(), root.canonicalize()) {
        (Ok(path), Ok(root)) => path.starts_with(root),
        _ => false,
    }
}

fn is_same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn unique_path(dir: &Path, stem: &str, extension: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}.{extension}"));
    let mut counter = 2;
    while path.exists() {
        path = dir.join(format!("{stem}-{counter}.{extension}"));
        counter += 1;
    }
    path
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic while holding the lock must not make the vault unusable for the session.
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
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

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
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
        slug.chars().take(60).collect()
    }
}

fn to_string<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn no_vault_error() -> String {
    "No vault is open. Choose a vault folder to continue.".to_string()
}

fn newer_vault_error() -> String {
    "This vault was saved by a newer version of Local Kanban. Update the app to open it.".to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Could not find the app data folder: {error}"))?;
            fs::create_dir_all(&app_data_dir).map_err(to_string)?;
            let config_path = app_data_dir.join("config.json");
            let mut last_error = None;
            let db = match read_config(&config_path) {
                Ok(AppConfig {
                    vault_path: Some(path),
                    ..
                }) => {
                    let vault_path = PathBuf::from(path);
                    if vault_path.is_dir() {
                        match Database::open_at(vault_path) {
                            Ok(db) => {
                                if let Err(error) = db.auto_backup() {
                                    eprintln!("Automatic backup skipped: {error}");
                                }
                                Some(db)
                            }
                            Err(error) => {
                                last_error = Some(error);
                                None
                            }
                        }
                    } else {
                        last_error = Some(format!(
                            "The vault folder could not be found: {}. Choose it again, or pick a new folder.",
                            vault_path.display()
                        ));
                        None
                    }
                }
                Ok(_) => None,
                Err(error) => {
                    last_error = Some(error);
                    None
                }
            };
            app.manage(AppState {
                db: Mutex::new(db),
                app_data_dir,
                config_path,
                app_version: app.package_info().version.to_string(),
                last_error: Mutex::new(last_error),
            });
            let handle = app.handle().clone();
            allow_vault_assets(&handle, &app.state::<AppState>());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_snapshot,
            choose_vault_folder,
            open_vault_folder,
            set_update_checks,
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
            attach_files,
            delete_attachment,
            open_attachment,
            reveal_path,
            open_url,
            export_json,
            import_json_file,
            export_board_markdown,
            export_board_csv,
            backup_database,
            restore_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Local Kanban");
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("local-kanban-{name}-{}", id()));
            fs::create_dir_all(&dir).expect("temp dir created");
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn first_board_columns(db: &Database) -> (Board, Vec<KanbanColumn>) {
        let board = db.boards().expect("boards load")[0].clone();
        let columns = db
            .columns()
            .expect("columns load")
            .into_iter()
            .filter(|column| column.board_id == board.id)
            .collect();
        (board, columns)
    }

    fn card_input(board: &Board, column: &KanbanColumn, title: &str) -> CardInput {
        CardInput {
            id: None,
            board_id: board.id.clone(),
            column_id: column.id.clone(),
            title: title.to_string(),
            description: "Notes".to_string(),
            priority: "high".to_string(),
            due_date: Some("2030-01-31".to_string()),
            color: "#ABCDEF".to_string(),
            sort_order: None,
            tags: vec!["Release, #QA".to_string()],
        }
    }

    #[test]
    fn sqlite_persists_cards_columns_and_settings_after_reopen() {
        let dir = TempDir::new("persist");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        let (board, columns) = first_board_columns(&db);
        assert!(columns.len() >= 2);
        let second = columns[1].clone();
        let ids: Vec<String> = vec![second.id.clone(), columns[0].id.clone()];
        db.reorder_columns(&board.id, &ids).expect("columns reordered");
        let card = db
            .upsert_card(card_input(&board, &second, "Persistent card"))
            .expect("card saved");
        db.save_setting("selected_board_id", &board.id).expect("setting saved");
        drop(db);

        let reopened = Database::open_at(dir.0.clone()).expect("database reopens");
        let snapshot = reopened.snapshot().expect("snapshot loads");
        let reopened_columns: Vec<_> = snapshot
            .columns
            .iter()
            .filter(|column| column.board_id == board.id)
            .collect();
        assert_eq!(reopened_columns[0].id, second.id);
        let saved = snapshot
            .cards
            .iter()
            .find(|item| item.id == card.id)
            .expect("card survives reopen");
        assert_eq!(saved.column_id, second.id);
        assert_eq!(saved.tags, vec!["qa".to_string(), "release".to_string()]);
        assert_eq!(saved.color, "#abcdef");
        assert_eq!(snapshot.settings.get("selected_board_id"), Some(&board.id));
    }

    #[test]
    fn deleted_boards_are_not_reseeded() {
        let dir = TempDir::new("reseed");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        for board in db.boards().expect("boards load") {
            db.delete_board(&board.id).expect("board deleted");
        }
        drop(db);
        let reopened = Database::open_at(dir.0.clone()).expect("database reopens");
        assert!(reopened.boards().expect("boards load").is_empty());
    }

    #[test]
    fn newer_vaults_are_refused() {
        let dir = TempDir::new("newer");
        let db = Database::open_at(dir.0.clone()).expect("database opens");
        db.conn
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .expect("version bumped");
        drop(db);
        let error = Database::open_at(dir.0.clone()).err().expect("newer vault refused");
        assert!(error.contains("newer version"));
    }

    #[test]
    fn invalid_card_input_is_rejected() {
        let dir = TempDir::new("validate");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        let (board, columns) = first_board_columns(&db);
        let mut input = card_input(&board, &columns[0], "  ");
        assert!(db.upsert_card(input).is_err());
        input = card_input(&board, &columns[0], "Task");
        input.priority = "someday".to_string();
        assert!(db.upsert_card(input).is_err());
        input = card_input(&board, &columns[0], "Task");
        input.due_date = Some("31/01/2030".to_string());
        assert!(db.upsert_card(input).is_err());
        input = card_input(&board, &columns[0], "Task");
        input.column_id = "missing".to_string();
        assert!(db.upsert_card(input).is_err());
        assert!(db.store_attachment("../escape", "a.txt", "text/plain", b"x").is_err());
    }

    #[test]
    fn moving_a_card_to_another_column_places_it_last() {
        let dir = TempDir::new("move");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        let (board, columns) = first_board_columns(&db);
        db.upsert_card(card_input(&board, &columns[1], "Existing")).expect("saved");
        let moving = db.upsert_card(card_input(&board, &columns[0], "Moving")).expect("saved");
        let mut input = card_input(&board, &columns[1], "Moving");
        input.id = Some(moving.id.clone());
        let moved = db.upsert_card(input).expect("moved");
        assert_eq!(moved.column_id, columns[1].id);
        assert_eq!(moved.sort_order, 1000);
    }

    #[test]
    fn json_export_round_trips_with_attachments_and_backs_up_first() {
        let source_dir = TempDir::new("export");
        let mut source = Database::open_at(source_dir.0.clone()).expect("source opens");
        let (board, columns) = first_board_columns(&source);
        let card = source
            .upsert_card(card_input(&board, &columns[0], "With file"))
            .expect("card saved");
        source
            .store_attachment(&card.id, "notes?.txt", "text/plain", b"hello")
            .expect("attachment saved");
        let export_path = source.export_json().expect("export written");
        let bundle: ExportBundle =
            serde_json::from_str(&fs::read_to_string(export_path).expect("export reads"))
                .expect("export parses");

        let target_dir = TempDir::new("import");
        let mut target = Database::open_at(target_dir.0.clone()).expect("target opens");
        let summary = target.import_bundle(bundle).expect("import succeeds");
        assert_eq!(summary.attachments, 1);
        assert!(Path::new(&summary.backup_path).exists());

        let imported = target.card_by_id(&card.id).expect("card imported");
        assert_eq!(imported.title, "With file");
        let attachment = &imported.attachments[0];
        assert!(is_within(Path::new(&attachment.file_path), &target_dir.0));
        assert_eq!(fs::read(&attachment.file_path).expect("file copied"), b"hello");
    }

    #[test]
    fn damaged_import_leaves_data_untouched() {
        let dir = TempDir::new("bad-import");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        let before = db.cards().expect("cards load").len();
        let bundle = ExportBundle {
            version: 1,
            exported_at: now(),
            boards: Vec::new(),
            columns: Vec::new(),
            cards: vec![ExportCard {
                id: "orphan".to_string(),
                board_id: "missing".to_string(),
                column_id: "missing".to_string(),
                title: "Orphan".to_string(),
                description: String::new(),
                priority: "low".to_string(),
                due_date: None,
                color: String::new(),
                sort_order: 0,
                created_at: now(),
                updated_at: now(),
                tags: Vec::new(),
                attachments: Vec::new(),
            }],
            settings: HashMap::new(),
        };
        assert!(db.import_bundle(bundle).is_err());
        assert_eq!(db.cards().expect("cards load").len(), before);
    }

    #[test]
    fn backups_restore_and_invalid_files_are_rejected() {
        let dir = TempDir::new("restore");
        let mut db = Database::open_at(dir.0.clone()).expect("database opens");
        let (board, columns) = first_board_columns(&db);
        let backup = db.backup("backup").expect("backup written");
        db.upsert_card(card_input(&board, &columns[0], "After backup"))
            .expect("card saved");
        assert_eq!(db.cards().expect("cards").len(), 2);

        let safety = db.restore_from(&backup).expect("restore succeeds");
        assert!(safety.exists());
        assert_eq!(db.cards().expect("cards").len(), 1);

        let junk = dir.0.join("junk.sqlite3");
        fs::write(&junk, b"not a database").expect("junk written");
        assert!(db.restore_from(&junk).is_err());
        assert_eq!(db.cards().expect("cards").len(), 1);
        let live = db.db_path.clone();
        assert!(db.restore_from(&live).is_err());
    }

    #[test]
    fn auto_backup_runs_once_per_interval() {
        let dir = TempDir::new("auto");
        let db = Database::open_at(dir.0.clone()).expect("database opens");
        assert!(db.auto_backup().expect("auto backup").is_some());
        assert!(db.auto_backup().expect("auto backup").is_none());
        assert_eq!(db.auto_backups().len(), 1);
    }

    #[test]
    fn vault_path_is_saved_in_stable_config() {
        let root = TempDir::new("vault");
        let app_data = root.0.join("config-home");
        let vault = root.0.join("work-vault");
        fs::create_dir_all(&app_data).expect("app config dir created");
        let state = AppState {
            db: Mutex::new(None),
            config_path: app_data.join("config.json"),
            app_data_dir: app_data.clone(),
            app_version: "1.0.0".to_string(),
            last_error: Mutex::new(None),
        };

        let snapshot = state.set_vault(vault.clone()).expect("vault opens");
        assert_eq!(snapshot.vault_path, Some(vault.to_string_lossy().to_string()));
        assert!(snapshot.check_for_updates);
        assert!(vault.join("kanban.sqlite").exists());
        assert!(vault.join("attachments").exists());

        state.set_update_checks(false).expect("preference saved");
        let config = read_config(&state.config_path).expect("config reads");
        assert_eq!(config.vault_path, Some(vault.to_string_lossy().to_string()));
        assert_eq!(config.check_for_updates, Some(false));
    }

    #[test]
    fn helpers_sanitize_untrusted_values() {
        assert!(!is_safe_id("../x"));
        assert!(is_safe_id("c1"));
        assert_eq!(clean_color("red"), DEFAULT_CARD_COLOR);
        assert_eq!(csv_cell("=SUM(A1)"), "'=SUM(A1)");
        let long = format!("{}.png", "a".repeat(200));
        let safe = safe_file_name(&long);
        assert!(safe.chars().count() <= MAX_ATTACHMENT_NAME_CHARS);
        assert!(safe.ends_with(".png"));
        assert_eq!(safe_file_name("..."), "attachment");
    }
}
