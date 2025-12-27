// ABOUTME: SQLite metadata storage for SQL Parrot desktop app
// ABOUTME: Stores groups, snapshots, history, and settings locally

use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;

use crate::models::{Group, HistoryEntry, Settings, Snapshot};

#[derive(Error, Debug)]
pub enum MetadataError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Database not initialized")]
    NotInitialized,
    #[error("Data directory not found")]
    NoDirFound,
}

pub struct MetadataStore {
    conn: Mutex<Connection>,
}

impl MetadataStore {
    /// Get the database file path
    pub fn db_path() -> Result<PathBuf, MetadataError> {
        let data_dir = dirs::data_local_dir().ok_or(MetadataError::NoDirFound)?;
        let app_dir = data_dir.join("SQL Parrot");
        std::fs::create_dir_all(&app_dir).map_err(|_| {
            MetadataError::Sqlite(rusqlite::Error::InvalidPath(app_dir.clone()))
        })?;
        Ok(app_dir.join("sqlparrot.db"))
    }

    /// Open or create the metadata database
    pub fn open() -> Result<Self, MetadataError> {
        let path = Self::db_path()?;
        let conn = Connection::open(&path)?;

        let store = Self {
            conn: Mutex::new(conn),
        };
        store.initialize()?;
        Ok(store)
    }

    /// Initialize database schema
    fn initialize(&self) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            -- Groups table
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                databases TEXT NOT NULL,
                created_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Snapshots table
            CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT,
                database_snapshots TEXT NOT NULL,
                is_automatic INTEGER DEFAULT 0,
                FOREIGN KEY (group_id) REFERENCES groups(id)
            );

            -- History table
            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                user_name TEXT,
                details TEXT,
                results TEXT
            );

            -- Settings table (single row)
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_snapshots_group ON snapshots(group_id);
            CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
            "#,
        )?;

        // Initialize settings if not exists
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)",
            params![serde_json::to_string(&Settings::default())?],
        )?;

        Ok(())
    }

    // ===== Groups =====

    /// Get all groups
    pub fn get_groups(&self) -> Result<Vec<Group>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, databases, created_by, created_at, updated_at FROM groups ORDER BY name",
        )?;

        let groups = stmt
            .query_map([], |row| {
                let databases_json: String = row.get(2)?;
                let databases: Vec<String> =
                    serde_json::from_str(&databases_json).unwrap_or_default();

                Ok(Group {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    databases,
                    created_by: row.get(3)?,
                    created_at: row
                        .get::<_, String>(4)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: row
                        .get::<_, String>(5)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(groups)
    }

    /// Create a new group
    pub fn create_group(&self, group: &Group) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO groups (id, name, databases, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                group.id,
                group.name,
                serde_json::to_string(&group.databases)?,
                group.created_by,
                group.created_at.to_rfc3339(),
                group.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Update an existing group
    pub fn update_group(&self, group: &Group) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE groups SET name = ?, databases = ?, updated_at = ? WHERE id = ?",
            params![
                group.name,
                serde_json::to_string(&group.databases)?,
                group.updated_at.to_rfc3339(),
                group.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a group
    pub fn delete_group(&self, group_id: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM groups WHERE id = ?", params![group_id])?;
        Ok(())
    }

    // ===== Snapshots =====

    /// Get snapshots for a group
    pub fn get_snapshots(&self, group_id: &str) -> Result<Vec<Snapshot>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, group_id, display_name, sequence, created_at, created_by, database_snapshots, is_automatic
             FROM snapshots WHERE group_id = ? ORDER BY sequence DESC",
        )?;

        let snapshots = stmt
            .query_map(params![group_id], |row| {
                let db_snapshots_json: String = row.get(6)?;
                let database_snapshots = serde_json::from_str(&db_snapshots_json).unwrap_or_default();

                Ok(Snapshot {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    display_name: row.get(2)?,
                    sequence: row.get(3)?,
                    created_at: row
                        .get::<_, String>(4)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                    created_by: row.get(5)?,
                    database_snapshots,
                    is_automatic: row.get::<_, i32>(7)? == 1,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(snapshots)
    }

    /// Add a snapshot
    pub fn add_snapshot(&self, snapshot: &Snapshot) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO snapshots (id, group_id, display_name, sequence, created_at, created_by, database_snapshots, is_automatic)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                snapshot.id,
                snapshot.group_id,
                snapshot.display_name,
                snapshot.sequence,
                snapshot.created_at.to_rfc3339(),
                snapshot.created_by,
                serde_json::to_string(&snapshot.database_snapshots)?,
                if snapshot.is_automatic { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    /// Delete a snapshot
    pub fn delete_snapshot(&self, snapshot_id: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM snapshots WHERE id = ?", params![snapshot_id])?;
        Ok(())
    }

    /// Delete all snapshots for a group
    pub fn delete_snapshots_for_group(&self, group_id: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM snapshots WHERE group_id = ?",
            params![group_id],
        )?;
        Ok(())
    }

    /// Get next sequence number for a group
    pub fn get_next_sequence(&self, group_id: &str) -> Result<u32, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let max: Option<u32> = conn.query_row(
            "SELECT MAX(sequence) FROM snapshots WHERE group_id = ?",
            params![group_id],
            |row| row.get(0),
        )?;
        Ok(max.unwrap_or(0) + 1)
    }

    // ===== History =====

    /// Get history entries
    pub fn get_history(&self, limit: Option<u32>) -> Result<Vec<HistoryEntry>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let query = match limit {
            Some(l) => format!(
                "SELECT id, operation_type, timestamp, user_name, details, results
                 FROM history ORDER BY timestamp DESC LIMIT {}",
                l
            ),
            None => "SELECT id, operation_type, timestamp, user_name, details, results
                     FROM history ORDER BY timestamp DESC"
                .to_string(),
        };

        let mut stmt = conn.prepare(&query)?;
        let entries = stmt
            .query_map([], |row| {
                let details_json: Option<String> = row.get(4)?;
                let results_json: Option<String> = row.get(5)?;

                Ok(HistoryEntry {
                    id: row.get(0)?,
                    operation_type: row.get(1)?,
                    timestamp: row
                        .get::<_, String>(2)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                    user_name: row.get(3)?,
                    details: details_json.and_then(|j| serde_json::from_str(&j).ok()),
                    results: results_json.and_then(|j| serde_json::from_str(&j).ok()),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }

    /// Add a history entry
    pub fn add_history(&self, entry: &HistoryEntry) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO history (id, operation_type, timestamp, user_name, details, results) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                entry.id,
                entry.operation_type,
                entry.timestamp.to_rfc3339(),
                entry.user_name,
                entry.details.as_ref().map(|d| serde_json::to_string(d).ok()).flatten(),
                entry.results.as_ref().map(|r| serde_json::to_string(r).ok()).flatten(),
            ],
        )?;
        Ok(())
    }

    /// Clear all history
    pub fn clear_history(&self) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM history", [])?;
        Ok(())
    }

    /// Trim history to max entries
    pub fn trim_history(&self, max_entries: u32) -> Result<u32, MetadataError> {
        let conn = self.conn.lock().unwrap();

        // Count entries to delete
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM history",
            [],
            |row| row.get(0),
        )?;

        if count <= max_entries {
            return Ok(0);
        }

        let to_delete = count - max_entries;

        // Delete oldest entries
        conn.execute(
            "DELETE FROM history WHERE id IN (
                SELECT id FROM history ORDER BY timestamp ASC LIMIT ?
            )",
            params![to_delete],
        )?;

        Ok(to_delete)
    }

    // ===== Settings =====

    /// Get settings
    pub fn get_settings(&self) -> Result<Settings, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let data: String = conn.query_row(
            "SELECT data FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        Ok(serde_json::from_str(&data)?)
    }

    /// Update settings
    pub fn update_settings(&self, settings: &Settings) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE settings SET data = ? WHERE id = 1",
            params![serde_json::to_string(settings)?],
        )?;
        Ok(())
    }
}
