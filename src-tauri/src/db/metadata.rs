// ABOUTME: SQLite metadata storage for SQL Parrot desktop app
// ABOUTME: Stores groups, snapshots, history, and settings locally

use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

use crate::models::{Group, HistoryEntry, Profile, Settings, Snapshot};

#[derive(Error, Debug)]
pub enum MetadataError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
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

        // Check if database exists
        let db_exists = path.exists();

        // If database doesn't exist, try to copy from bundled resource
        if !db_exists {
            // Try to find bundled database in various locations
            let mut bundled_paths = vec![
                // In installed app, resources might be in app directory
                path.parent().unwrap().join("resources").join("sqlparrot.db"),
                // Or relative to current directory (for development)
                PathBuf::from("resources/sqlparrot.db"),
            ];

            // Add executable directory path if available
            if let Ok(exe) = std::env::current_exe() {
                if let Some(exe_dir) = exe.parent() {
                    bundled_paths.push(exe_dir.join("resources").join("sqlparrot.db"));
                }
            }

            for bundled_path in bundled_paths {
                if bundled_path.exists() {
                    // Copy bundled database to target location
                    if let Some(parent) = path.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    std::fs::copy(&bundled_path, &path)?;
                    break;
                }
            }
        }

        let conn = Connection::open(&path)?;

        let store = Self {
            conn: Mutex::new(conn),
        };
        store.initialize()?;

        // Check version and migrate if needed
        let current_version = env!("CARGO_PKG_VERSION");
        if let Err(e) = store.check_and_migrate(current_version) {
            eprintln!("Warning: Failed to check/migrate database version: {}", e);
            // Continue anyway - migration failures shouldn't prevent app from starting
        }

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

            -- Metadata table for version tracking (may not exist in older databases)
            CREATE TABLE IF NOT EXISTS _metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Connection profiles table (for multiple database profiles)
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                platform_type TEXT NOT NULL DEFAULT 'Microsoft SQL Server',
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 1433,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                trust_certificate INTEGER DEFAULT 1,
                snapshot_path TEXT NOT NULL DEFAULT '/var/opt/mssql/snapshots',
                description TEXT,
                notes TEXT,
                is_active INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_snapshots_group ON snapshots(group_id);
            CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
            CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);
            "#,
        )?;

        // Initialize settings if not exists
        conn.execute(
            "INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)",
            params![serde_json::to_string(&Settings::default())?],
        )?;

        // Initialize metadata version if not exists (for databases created before version tracking)
        conn.execute(
            "INSERT OR IGNORE INTO _metadata (key, value) VALUES ('last_version_seen', '0.0.0')",
            [],
        )?;

        Ok(())
    }

    /// Get the last version seen from metadata
    pub fn get_last_version_seen(&self) -> Result<String, MetadataError> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row(
            "SELECT value FROM _metadata WHERE key = 'last_version_seen'",
            [],
            |row| row.get::<_, String>(0),
        ) {
            Ok(version) => Ok(version),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok("0.0.0".to_string()),
            Err(e) => Err(e.into()),
        }
    }

    /// Update the last version seen
    pub fn update_last_version_seen(&self, version: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO _metadata (key, value) VALUES ('last_version_seen', ?)",
            params![version],
        )?;
        Ok(())
    }

    /// Check and run migrations if needed
    pub fn check_and_migrate(&self, current_version: &str) -> Result<(), MetadataError> {
        let last_version = self.get_last_version_seen()?;

        if last_version == current_version {
            // Already up to date
            return Ok(());
        }

        // Migration from versions < 1.3.0: Migrate config.json to profiles table
        if self.compare_versions(&last_version, "1.3.0") < 0 {
            if let Err(e) = self.migrate_config_json_to_profiles() {
                eprintln!("Warning: Failed to migrate config.json to profiles: {}", e);
                // Continue anyway - migration failures shouldn't prevent app from starting
            }
        }

        // Update version after migrations
        self.update_last_version_seen(current_version)?;

        Ok(())
    }

    /// Compare two version strings (returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
    fn compare_versions(&self, v1: &str, v2: &str) -> i32 {
        let v1_parts: Vec<u32> = v1.split('.').filter_map(|s| s.parse().ok()).collect();
        let v2_parts: Vec<u32> = v2.split('.').filter_map(|s| s.parse().ok()).collect();

        for i in 0..v1_parts.len().max(v2_parts.len()) {
            let v1_val = v1_parts.get(i).copied().unwrap_or(0);
            let v2_val = v2_parts.get(i).copied().unwrap_or(0);

            if v1_val < v2_val {
                return -1;
            } else if v1_val > v2_val {
                return 1;
            }
        }
        0
    }

    /// Migrate config.json to profiles table and settings
    /// Also migrates preferences (theme, max_history_entries) to SQLite settings
    /// Deletes config.json after successful migration
    fn migrate_config_json_to_profiles(&self) -> Result<(), MetadataError> {
        use crate::config::AppConfig;
        use std::fs;

        // Check if config.json exists
        let config_path = match AppConfig::config_path() {
            Ok(p) => p,
            Err(_) => {
                // No config.json, nothing to migrate
                return Ok(());
            }
        };

        if !config_path.exists() {
            // No config.json, nothing to migrate
            return Ok(());
        }

        // Check if profiles table already has data
        let conn = self.conn.lock().unwrap();
        let profile_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM profiles",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        if profile_count > 0 {
            // Already migrated or profiles exist, skip migration
            // But still try to migrate preferences if needed
            drop(conn);
            self.migrate_config_preferences(&config_path)?;
            return Ok(());
        }

        // Load config.json
        let config = match AppConfig::load() {
            Ok(c) => c,
            Err(_) => {
                // Failed to load config.json, skip migration
                return Ok(());
            }
        };

        // Migrate each profile from config.json
        let now = Utc::now().to_rfc3339();
        let mut migrated_profiles = Vec::new();

        for (profile_key, profile) in &config.profiles {
            // Skip if password is empty (invalid profile)
            if profile.password.is_empty() {
                continue;
            }

            let profile_id = Uuid::new_v4().to_string();
            let is_active = if profile_key == &config.active_profile { 1 } else { 0 };
            let name = if profile_key == "default" {
                "Migrated".to_string()
            } else {
                profile.name.clone()
            };

            conn.execute(
                "INSERT INTO profiles (id, name, platform_type, host, port, username, password, trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    profile_id,
                    name.clone(),
                    "Microsoft SQL Server",
                    profile.host,
                    profile.port,
                    profile.username,
                    profile.password,
                    if profile.trust_certificate { 1 } else { 0 },
                    profile.snapshot_path,
                    None::<String>, // description
                    None::<String>, // notes
                    is_active,
                    now,
                    now
                ],
            )?;

            migrated_profiles.push(serde_json::json!({
                "name": name,
                "host": profile.host,
                "port": profile.port
            }));
        }

        // Migrate preferences to SQLite settings
        drop(conn);
        self.migrate_config_preferences(&config_path)?;

        // Add history entry for migration
        if !migrated_profiles.is_empty() {
            let history_entry = HistoryEntry {
                id: Uuid::new_v4().to_string(),
                operation_type: "migrate_config_to_profiles".to_string(),
                timestamp: Utc::now(),
                user_name: None,
                details: Some(serde_json::json!({
                    "migratedProfiles": migrated_profiles,
                    "sourceFile": "config.json",
                    "message": format!("Migrated {} connection(s) in config.json to profile(s)", migrated_profiles.len())
                })),
                results: None,
            };
            if let Err(e) = self.add_history(&history_entry) {
                eprintln!("Warning: Failed to add history entry for config.json migration: {}", e);
            }
        }

        // Delete config.json after successful migration
        if let Err(e) = fs::remove_file(&config_path) {
            eprintln!("Warning: Failed to delete config.json after migration: {}", e);
            // Continue anyway - migration succeeded even if deletion failed
        }

        Ok(())
    }

    /// Migrate preferences from config.json to SQLite settings
    fn migrate_config_preferences(&self, config_path: &std::path::Path) -> Result<(), MetadataError> {
        use crate::config::AppConfig;

        // Load config.json to get preferences
        let config = match AppConfig::load() {
            Ok(c) => c,
            Err(_) => return Ok(()), // No config.json, nothing to migrate
        };

        // Get current settings
        let mut settings = self.get_settings().unwrap_or_default();

        // Migrate preferences.theme and preferences.max_history_entries
        // Only update if not already set in SQLite (preserve existing values)
        if settings.preferences.max_history_entries == 100 && config.preferences.max_history_entries != 100 {
            settings.preferences.max_history_entries = config.preferences.max_history_entries;
        }

        // Note: theme is not currently stored in SQLite Settings model, but we could add it if needed
        // For now, we'll skip theme migration

        // Save updated settings
        self.update_settings(&settings)?;

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

    // ===== Profiles =====

    /// Get all profiles
    pub fn get_profiles(&self) -> Result<Vec<Profile>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, platform_type, host, port, username, password, trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at FROM profiles ORDER BY is_active DESC, name",
        )?;

        let profiles = stmt
            .query_map([], |row| {
                Ok(Profile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    platform_type: row.get(2)?,
                    host: row.get(3)?,
                    port: row.get(4)?,
                    username: row.get(5)?,
                    password: row.get(6)?,
                    trust_certificate: row.get::<_, i32>(7)? == 1,
                    snapshot_path: row.get(8)?,
                    description: row.get(9)?,
                    notes: row.get(10)?,
                    is_active: row.get::<_, i32>(11)? == 1,
                    created_at: row
                        .get::<_, String>(12)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: row
                        .get::<_, String>(13)?
                        .parse()
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(profiles)
    }

    /// Get active profile
    pub fn get_active_profile(&self) -> Result<Option<Profile>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, platform_type, host, port, username, password, trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at FROM profiles WHERE is_active = 1 LIMIT 1",
        )?;

        match stmt.query_row([], |row| {
            Ok(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                platform_type: row.get(2)?,
                host: row.get(3)?,
                port: row.get(4)?,
                username: row.get(5)?,
                password: row.get(6)?,
                trust_certificate: row.get::<_, i32>(7)? == 1,
                snapshot_path: row.get(8)?,
                description: row.get(9)?,
                notes: row.get(10)?,
                is_active: row.get::<_, i32>(11)? == 1,
                created_at: row
                    .get::<_, String>(12)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: row
                    .get::<_, String>(13)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
            })
        }) {
            Ok(profile) => Ok(Some(profile)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Create a new profile
    pub fn create_profile(&self, profile: &Profile) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();

        // If this is being set as active, deactivate all others first
        if profile.is_active {
            conn.execute("UPDATE profiles SET is_active = 0", [])?;
        }

        conn.execute(
            "INSERT INTO profiles (id, name, platform_type, host, port, username, password, trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                profile.id,
                profile.name,
                profile.platform_type,
                profile.host,
                profile.port,
                profile.username,
                profile.password,
                if profile.trust_certificate { 1 } else { 0 },
                profile.snapshot_path,
                profile.description.as_ref(),
                profile.notes.as_ref(),
                if profile.is_active { 1 } else { 0 },
                profile.created_at.to_rfc3339(),
                profile.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Update an existing profile
    pub fn update_profile(&self, profile: &Profile) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();

        // If this is being set as active, deactivate all others first
        if profile.is_active {
            conn.execute("UPDATE profiles SET is_active = 0 WHERE id != ?", params![profile.id])?;
        }

        conn.execute(
            "UPDATE profiles SET name = ?, platform_type = ?, host = ?, port = ?, username = ?, password = ?, trust_certificate = ?, snapshot_path = ?, description = ?, notes = ?, is_active = ?, updated_at = ? WHERE id = ?",
            params![
                profile.name,
                profile.platform_type,
                profile.host,
                profile.port,
                profile.username,
                profile.password,
                if profile.trust_certificate { 1 } else { 0 },
                profile.snapshot_path,
                profile.description.as_ref(),
                profile.notes.as_ref(),
                if profile.is_active { 1 } else { 0 },
                profile.updated_at.to_rfc3339(),
                profile.id,
            ],
        )?;
        Ok(())
    }

    /// Find profile by host, port, and username (for migration matching)
    pub fn find_profile_by_connection(&self, host: &str, port: u16, username: &str) -> Result<Option<Profile>, MetadataError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, platform_type, host, port, username, password, trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at FROM profiles WHERE host = ? AND port = ? AND username = ? LIMIT 1",
        )?;

        match stmt.query_row(params![host, port, username], |row| {
            Ok(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                platform_type: row.get(2)?,
                host: row.get(3)?,
                port: row.get(4)?,
                username: row.get(5)?,
                password: row.get(6)?,
                trust_certificate: row.get::<_, i32>(7)? == 1,
                snapshot_path: row.get(8)?,
                description: row.get(9)?,
                notes: row.get(10)?,
                is_active: row.get::<_, i32>(11)? == 1,
                created_at: row
                    .get::<_, String>(12)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: row
                    .get::<_, String>(13)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
            })
        }) {
            Ok(profile) => Ok(Some(profile)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Delete a profile
    pub fn delete_profile(&self, profile_id: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM profiles WHERE id = ?", params![profile_id])?;
        Ok(())
    }

    /// Set a profile as active (deactivates all others)
    pub fn set_active_profile(&self, profile_id: &str) -> Result<(), MetadataError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE profiles SET is_active = 0", [])?;
        conn.execute("UPDATE profiles SET is_active = 1, updated_at = ? WHERE id = ?", params![Utc::now().to_rfc3339(), profile_id])?;
        Ok(())
    }
}
