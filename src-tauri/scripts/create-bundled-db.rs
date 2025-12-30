// Script to create the bundled SQLite database for the installer
// Run with: cargo run --bin create-bundled-db

use rusqlite::{Connection, params};
use serde_json;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create database in resources folder
    let db_path = PathBuf::from("resources/sqlparrot.db");

    // Ensure resources directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Remove existing if present
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
    }

    let conn = Connection::open(&db_path)?;

    // Create schema
    conn.execute_batch(
        r#"
        -- Groups table
        CREATE TABLE groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            databases TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Snapshots table
        CREATE TABLE snapshots (
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
        CREATE TABLE history (
            id TEXT PRIMARY KEY,
            operation_type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            user_name TEXT,
            details TEXT,
            results TEXT
        );

        -- Settings table (single row)
        CREATE TABLE settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
        );

        -- Metadata table for version tracking
        CREATE TABLE _metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Indexes
        CREATE INDEX idx_snapshots_group ON snapshots(group_id);
        CREATE INDEX idx_history_timestamp ON history(timestamp);
        "#,
    )?;

    // Initialize settings with defaults
    let default_settings = serde_json::json!({
        "preferences": {
            "defaultGroup": "",
            "maxHistoryEntries": 100,
            "autoCreateCheckpoint": true
        },
        "autoVerification": {
            "enabled": false,
            "intervalMinutes": 60
        },
        "connection": {
            "server": "",
            "port": 1433,
            "username": "",
            "password": "",
            "trustServerCertificate": true,
            "snapshotPath": "/var/opt/mssql/snapshots"
        },
        "passwordHash": null,
        "passwordSkipped": false
    });

    conn.execute(
        "INSERT INTO settings (id, data) VALUES (1, ?)",
        params![serde_json::to_string(&default_settings)?],
    )?;

    // Set version to 0.0.0 to indicate bundled/fresh install
    conn.execute(
        "INSERT INTO _metadata (key, value) VALUES ('last_version_seen', '0.0.0')",
        [],
    )?;

    println!("✅ Created bundled database at: {}", db_path.display());
    println!("   Version: 0.0.0 (fresh install marker)");

    Ok(())
}

