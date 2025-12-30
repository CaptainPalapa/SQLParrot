// ABOUTME: Connection-related Tauri commands
// ABOUTME: Handles SQL Server connection testing and database listing

use crate::config::ConnectionProfile;
use crate::db::{MetadataStore, SqlServerConnection};
use crate::models::DatabaseInfo;
use crate::{ApiResponse, HealthResponse};

/// Test connection to SQL Server using provided credentials
/// If password is empty, uses the saved password from active profile (for security, passwords aren't shown in UI)
#[tauri::command]
#[allow(non_snake_case)]
pub async fn test_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
    trustCertificate: bool,
    profile_id: Option<String>, // Optional profile ID when editing
) -> ApiResponse<String> {
    // If password is empty or whitespace, try to use saved password from profile (either specified or active)
    let password = if password.trim().is_empty() {
        match MetadataStore::open() {
            Ok(store) => {
                // If profile_id is provided (editing mode), prioritize that profile
                if let Some(pid) = profile_id {
                    if let Ok(Some(profile)) = store.get_profile(&pid) {
                        // When editing, always use saved password from the profile being edited
                        profile.password
                    } else {
                        String::new()
                    }
                } else {
                    // Otherwise try active profile
                    if let Ok(Some(profile)) = store.get_active_profile() {
                        // Only use saved password if host, port, and username match
                        if profile.host == host && profile.port == port && profile.username == username {
                            profile.password
                        } else {
                            String::new() // No matching profile - allow empty password
                        }
                    } else {
                        String::new() // No profile found - allow empty password
                    }
                }
            }
            Err(_) => String::new(), // Allow empty password
        }
    } else {
        password
    };

    // Allow empty password - SQL Server might not require it (Windows auth, etc.)

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
    // Get active profile from SQLite
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let profile = match store.get_active_profile() {
        Ok(Some(p)) => p,
        Ok(None) => return ApiResponse::error("No active connection profile configured".to_string()),
        Err(e) => return ApiResponse::error(format!("Failed to get active profile: {}", e)),
    };

    // Convert Profile to ConnectionProfile for SqlServerConnection
    let connection_profile = ConnectionProfile {
        name: profile.name.clone(),
        db_type: crate::config::DatabaseType::SqlServer,
        host: profile.host.clone(),
        port: profile.port,
        username: profile.username.clone(),
        password: profile.password.clone(),
        trust_certificate: profile.trust_certificate,
        snapshot_path: profile.snapshot_path.clone(),
    };

    match SqlServerConnection::connect(&connection_profile).await {
        Ok(mut conn) => match conn.get_databases().await {
            Ok(databases) => ApiResponse::success(databases),
            Err(e) => ApiResponse::error(format!("Failed to get databases: {}", e)),
        },
        Err(e) => ApiResponse::error(format!("Failed to connect: {}", e)),
    }
}

/// Check overall health status - tests connection to active profile's SQL Server
#[tauri::command]
pub async fn check_health() -> ApiResponse<HealthResponse> {
    // Get active profile and test actual SQL connectivity
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(_) => {
            return ApiResponse::success(HealthResponse {
                connected: false,
                version: env!("CARGO_PKG_VERSION").to_string(),
                platform: std::env::consts::OS.to_string(),
                sql_server_version: None,
            });
        }
    };

    let profile = match store.get_active_profile() {
        Ok(Some(p)) if !p.password.is_empty() => p,
        _ => {
            return ApiResponse::success(HealthResponse {
                connected: false,
                version: env!("CARGO_PKG_VERSION").to_string(),
                platform: std::env::consts::OS.to_string(),
                sql_server_version: None,
            });
        }
    };

    // Actually test the SQL connection
    let connection_profile = ConnectionProfile {
        name: profile.name.clone(),
        db_type: crate::config::DatabaseType::SqlServer,
        host: profile.host.clone(),
        port: profile.port,
        username: profile.username.clone(),
        password: profile.password.clone(),
        trust_certificate: profile.trust_certificate,
        snapshot_path: profile.snapshot_path.clone(),
    };

    match SqlServerConnection::connect(&connection_profile).await {
        Ok(_) => ApiResponse::success(HealthResponse {
            connected: true,
            version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
            sql_server_version: Some("Connected".to_string()),
        }),
        Err(e) => {
            eprintln!("[check_health] SQL connection failed for profile '{}': {}", profile.name, e);
            ApiResponse::success(HealthResponse {
                connected: false,
                version: env!("CARGO_PKG_VERSION").to_string(),
                platform: std::env::consts::OS.to_string(),
                sql_server_version: Some(format!("Error: {}", e)),
            })
        }
    }
}

/// Save connection profile (DEPRECATED - use create_profile or update_profile instead)
/// Kept for backward compatibility but should be removed in future versions
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
    // This command is deprecated - use create_profile or update_profile instead
    // For backward compatibility, we'll find or create a profile matching host/port/username
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Try to find existing profile by host/port/username
    let existing_profile = match store.find_profile_by_connection(&host, port, &username) {
        Ok(Some(p)) => Some(p),
        _ => None,
    };

    use chrono::Utc;
    use uuid::Uuid;
    use crate::models::Profile;

    if let Some(existing) = existing_profile {
        // Update existing profile
        let updated_profile = Profile {
            id: existing.id,
            name: existing.name,
            platform_type: existing.platform_type,
            host,
            port,
            username,
            password,
            trust_certificate: trustCertificate,
            snapshot_path: snapshotPath,
            description: existing.description,
            notes: existing.notes,
            is_active: true, // Set as active
            created_at: existing.created_at,
            updated_at: Utc::now(),
        };

        match store.update_profile(&updated_profile) {
            Ok(_) => ApiResponse::success(()),
            Err(e) => ApiResponse::error(format!("Failed to update profile: {}", e)),
        }
    } else {
        // Create new profile
        let new_profile = Profile {
            id: Uuid::new_v4().to_string(),
            name: "Migrated".to_string(),
            platform_type: "Microsoft SQL Server".to_string(),
            host,
            port,
            username,
            password,
            trust_certificate: trustCertificate,
            snapshot_path: snapshotPath,
            description: None,
            notes: None,
            is_active: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        match store.create_profile(&new_profile) {
            Ok(_) => ApiResponse::success(()),
            Err(e) => ApiResponse::error(format!("Failed to create profile: {}", e)),
        }
    }
}

/// Get current connection profile (without password)
#[tauri::command]
pub async fn get_connection() -> ApiResponse<Option<ConnectionProfilePublic>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(_) => return ApiResponse::success(None),
    };

    match store.get_active_profile() {
        Ok(Some(profile)) => {
            ApiResponse::success(Some(ConnectionProfilePublic {
                name: profile.name,
                host: profile.host,
                port: profile.port,
                username: profile.username,
                trust_certificate: profile.trust_certificate,
                snapshot_path: profile.snapshot_path,
            }))
        }
        _ => ApiResponse::success(None),
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
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(_) => {
            return ApiResponse::success(SnapshotPathInfo {
                snapshot_path: "Not configured".to_string(),
                configured: false,
            });
        }
    };

    match store.get_active_profile() {
        Ok(Some(profile)) => ApiResponse::success(SnapshotPathInfo {
            snapshot_path: profile.snapshot_path,
            configured: true,
        }),
        _ => ApiResponse::success(SnapshotPathInfo {
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
