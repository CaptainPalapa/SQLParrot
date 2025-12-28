// ABOUTME: Connection-related Tauri commands
// ABOUTME: Handles SQL Server connection testing and database listing

use crate::config::{AppConfig, ConnectionProfile};
use crate::db::SqlServerConnection;
use crate::models::DatabaseInfo;
use crate::{ApiResponse, HealthResponse};

/// Test connection to SQL Server using provided credentials
#[tauri::command]
#[allow(non_snake_case)]
pub async fn test_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
    trustCertificate: bool,
) -> ApiResponse<String> {
    let profile = ConnectionProfile {
        name: "test".to_string(),
        db_type: crate::config::DatabaseType::SqlServer,
        host,
        port,
        username,
        password,
        trust_certificate: trustCertificate,
        snapshot_path: String::new(),
    };

    match SqlServerConnection::connect(&profile).await {
        Ok(mut conn) => match conn.test_connection().await {
            Ok(version) => ApiResponse::success(version),
            Err(e) => ApiResponse::error(format!("Connection test failed: {}", e)),
        },
        Err(e) => ApiResponse::error(format!("Failed to connect: {}", e)),
    }
}

/// Get list of databases from SQL Server
#[tauri::command]
pub async fn get_databases() -> ApiResponse<Vec<DatabaseInfo>> {
    // Load config to get connection profile
    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to load config: {}", e)),
    };

    let profile = match config.get_active_profile() {
        Some(p) => p,
        None => return ApiResponse::error("No active connection profile configured".to_string()),
    };

    match SqlServerConnection::connect(profile).await {
        Ok(mut conn) => match conn.get_databases().await {
            Ok(databases) => ApiResponse::success(databases),
            Err(e) => ApiResponse::error(format!("Failed to get databases: {}", e)),
        },
        Err(e) => ApiResponse::error(format!("Failed to connect: {}", e)),
    }
}

/// Check overall health status - does NOT auto-connect to SQL Server
/// Connection status is checked separately via test_connection when user requests it
#[tauri::command]
pub async fn check_health() -> ApiResponse<HealthResponse> {
    // Just return app health - don't try to connect to SQL Server automatically
    // User must explicitly test/save connection first
    let config = AppConfig::load().ok();
    let has_profile = config
        .as_ref()
        .and_then(|c| c.get_active_profile())
        .map(|p| !p.password.is_empty())
        .unwrap_or(false);

    ApiResponse::success(HealthResponse {
        connected: has_profile, // Just indicates if a profile with password is configured
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        sql_server_version: None, // Only set when user explicitly tests connection
    })
}

/// Save connection profile
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
    trustCertificate: bool,
    snapshotPath: String,
) -> ApiResponse<()> {
    let mut config = AppConfig::load().unwrap_or_default();

    let profile = ConnectionProfile {
        name: "default".to_string(),
        db_type: crate::config::DatabaseType::SqlServer,
        host,
        port,
        username,
        password,
        trust_certificate: trustCertificate,
        snapshot_path: snapshotPath,
    };

    config
        .profiles
        .insert("default".to_string(), profile);
    config.active_profile = "default".to_string();

    match config.save() {
        Ok(_) => ApiResponse::success(()),
        Err(e) => ApiResponse::error(format!("Failed to save connection: {}", e)),
    }
}

/// Get current connection profile (without password)
#[tauri::command]
pub async fn get_connection() -> ApiResponse<Option<ConnectionProfilePublic>> {
    match AppConfig::load() {
        Ok(config) => {
            let profile = config.get_active_profile().map(|p| ConnectionProfilePublic {
                name: p.name.clone(),
                host: p.host.clone(),
                port: p.port,
                username: p.username.clone(),
                trust_certificate: p.trust_certificate,
                snapshot_path: p.snapshot_path.clone(),
            });
            ApiResponse::success(profile)
        }
        Err(_) => ApiResponse::success(None),
    }
}

/// Public connection profile (without password)
#[derive(serde::Serialize)]
pub struct ConnectionProfilePublic {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub trust_certificate: bool,
    pub snapshot_path: String,
}

/// Get the current snapshot path configuration
#[tauri::command]
pub async fn test_snapshot_path() -> ApiResponse<SnapshotPathInfo> {
    match AppConfig::load() {
        Ok(config) => {
            let path = config
                .get_active_profile()
                .map(|p| p.snapshot_path.clone())
                .unwrap_or_else(|| "Not configured".to_string());
            ApiResponse::success(SnapshotPathInfo {
                snapshot_path: path,
                configured: config.get_active_profile().is_some(),
            })
        }
        Err(_) => ApiResponse::success(SnapshotPathInfo {
            snapshot_path: "Not configured".to_string(),
            configured: false,
        }),
    }
}

#[derive(serde::Serialize)]
pub struct SnapshotPathInfo {
    #[serde(rename = "snapshotPath")]
    pub snapshot_path: String,
    pub configured: bool,
}
