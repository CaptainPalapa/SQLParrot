// ABOUTME: Connection-related Tauri commands
// ABOUTME: Handles SQL Server connection testing and database listing

use crate::config::{AppConfig, ConnectionProfile};
use crate::db::SqlServerConnection;
use crate::models::DatabaseInfo;
use crate::{ApiResponse, HealthResponse};

/// Test connection to SQL Server using provided credentials
#[tauri::command]
pub async fn test_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
    trust_certificate: bool,
) -> ApiResponse<String> {
    let profile = ConnectionProfile {
        name: "test".to_string(),
        db_type: crate::config::DatabaseType::SqlServer,
        host,
        port,
        username,
        password,
        trust_certificate,
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

/// Check overall health status
#[tauri::command]
pub async fn check_health() -> ApiResponse<HealthResponse> {
    let config = AppConfig::load().ok();
    let mut connected = false;
    let mut sql_version = None;

    if let Some(ref cfg) = config {
        if let Some(profile) = cfg.get_active_profile() {
            if let Ok(mut conn) = SqlServerConnection::connect(profile).await {
                if let Ok(version) = conn.test_connection().await {
                    connected = true;
                    sql_version = Some(version);
                }
            }
        }
    }

    ApiResponse::success(HealthResponse {
        connected,
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        sql_server_version: sql_version,
    })
}

/// Save connection profile
#[tauri::command]
pub async fn save_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
    trust_certificate: bool,
    snapshot_path: String,
) -> ApiResponse<()> {
    let mut config = AppConfig::load().unwrap_or_default();

    let profile = ConnectionProfile {
        name: "default".to_string(),
        db_type: crate::config::DatabaseType::SqlServer,
        host,
        port,
        username,
        password,
        trust_certificate,
        snapshot_path,
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
