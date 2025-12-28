// ABOUTME: Settings and history Tauri commands
// ABOUTME: Manages app settings and operation history

use crate::db::MetadataStore;
use crate::models::{HistoryEntry, Settings};
use crate::ApiResponse;

/// Get application settings
#[tauri::command]
pub async fn get_settings() -> ApiResponse<Settings> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_settings() {
        Ok(settings) => ApiResponse::success(settings),
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Update application settings
/// Note: Takes individual fields to match the API client's request format
#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_settings(
    preferences: crate::models::SettingsPreferences,
    autoVerification: crate::models::AutoVerification,
) -> ApiResponse<Settings> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let settings = Settings {
        preferences,
        auto_verification: autoVerification,
        connection: Default::default(),
    };

    match store.update_settings(&settings) {
        Ok(_) => ApiResponse::success(settings),
        Err(e) => ApiResponse::error(format!("Failed to update settings: {}", e)),
    }
}

/// Get operation history
#[tauri::command]
pub async fn get_history(limit: Option<u32>) -> ApiResponse<Vec<HistoryEntry>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_history(limit) {
        Ok(history) => ApiResponse::success(history),
        Err(e) => ApiResponse::error(format!("Failed to get history: {}", e)),
    }
}

/// Clear all history
#[tauri::command]
pub async fn clear_history() -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.clear_history() {
        Ok(_) => ApiResponse::success(()),
        Err(e) => ApiResponse::error(format!("Failed to clear history: {}", e)),
    }
}

/// Trim history to max entries based on settings
#[tauri::command]
pub async fn trim_history() -> ApiResponse<u32> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let settings = match store.get_settings() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to get settings: {}", e)),
    };

    match store.trim_history(settings.preferences.max_history_entries) {
        Ok(deleted) => ApiResponse::success(deleted),
        Err(e) => ApiResponse::error(format!("Failed to trim history: {}", e)),
    }
}

/// Get metadata status
#[tauri::command]
pub async fn get_metadata_status() -> ApiResponse<MetadataStatusResponse> {
    let db_path = match MetadataStore::db_path() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => "Unknown".to_string(),
    };

    ApiResponse::success(MetadataStatusResponse {
        mode: "sqlite".to_string(),
        database: Some(db_path),
        user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
    })
}

#[derive(serde::Serialize)]
pub struct MetadataStatusResponse {
    pub mode: String,
    pub database: Option<String>,
    pub user_name: Option<String>,
}
