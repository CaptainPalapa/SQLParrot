// ABOUTME: Shared data models for SQL Parrot
// ABOUTME: Mirrors the data structures from the Express backend for API compatibility

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A snapshot group containing multiple databases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub databases: Vec<String>,
    #[serde(rename = "createdBy", default)]
    pub created_by: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
}

/// A database snapshot entry within a group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSnapshot {
    pub database: String,
    #[serde(rename = "snapshotName")]
    pub snapshot_name: String,
    pub success: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// A snapshot checkpoint containing snapshots of multiple databases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    #[serde(rename = "groupId")]
    pub group_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub sequence: u32,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "createdBy", default)]
    pub created_by: Option<String>,
    #[serde(rename = "databaseSnapshots")]
    pub database_snapshots: Vec<DatabaseSnapshot>,
    #[serde(rename = "isAutomatic", default)]
    pub is_automatic: bool,
}

/// History entry for tracking operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub operation_type: String,
    pub timestamp: DateTime<Utc>,
    #[serde(rename = "userName", default)]
    pub user_name: Option<String>,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
    #[serde(default)]
    pub results: Option<Vec<OperationResult>>,
}

/// Result of an individual operation (e.g., per-database in a snapshot)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    pub database: String,
    pub success: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub preferences: SettingsPreferences,
    #[serde(rename = "autoVerification", default)]
    pub auto_verification: AutoVerification,
    #[serde(default)]
    pub connection: ConnectionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SettingsPreferences {
    #[serde(rename = "defaultGroup", default)]
    pub default_group: String,
    #[serde(rename = "maxHistoryEntries", default = "default_max_history")]
    pub max_history_entries: u32,
}

fn default_max_history() -> u32 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AutoVerification {
    #[serde(default)]
    pub enabled: bool,
    #[serde(rename = "intervalMinutes", default = "default_interval")]
    pub interval_minutes: u32,
}

fn default_interval() -> u32 {
    15
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConnectionInfo {
    #[serde(default)]
    pub server: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub connected: bool,
}

/// Database info from SQL Server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub category: String,
    #[serde(rename = "createDate")]
    pub create_date: DateTime<Utc>,
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub connected: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(rename = "sqlServerVersion", default)]
    pub sql_server_version: Option<String>,
}

/// Metadata status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataStatus {
    pub mode: String,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(rename = "userName", default)]
    pub user_name: Option<String>,
}

/// Verification results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResults {
    pub verified: bool,
    #[serde(rename = "orphanedSnapshots", default)]
    pub orphaned_snapshots: Vec<String>,
    #[serde(rename = "staleMetadata", default)]
    pub stale_metadata: Vec<String>,
    #[serde(default)]
    pub cleaned: bool,
}
