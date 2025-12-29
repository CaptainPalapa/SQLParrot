// ABOUTME: Settings and history Tauri commands
// ABOUTME: Manages app settings and operation history
// ABOUTME: UI Security - password protection for SQL Parrot UI (NOT database profile passwords)

use crate::db::MetadataStore;
use crate::models::{HistoryEntry, Settings};
use crate::ApiResponse;
use bcrypt::{hash, verify, DEFAULT_COST};

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
/// Preserves password fields (not updated through this endpoint)
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

    // Get current settings to preserve password fields
    let current_settings = match store.get_settings() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to get current settings: {}", e)),
    };

    let settings = Settings {
        preferences,
        auto_verification: autoVerification,
        connection: Default::default(),
        // Preserve password fields
        password_hash: current_settings.password_hash,
        password_skipped: current_settings.password_skipped,
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

#[derive(serde::Serialize)]
pub struct PasswordStatus {
    pub status: String, // "set" | "skipped" | "not-set"
    #[serde(rename = "passwordSet")]
    pub password_set: bool,
    #[serde(rename = "passwordSkipped")]
    pub password_skipped: bool,
}

// ===== UI Security Password Commands =====

/// Get password status
#[tauri::command]
pub async fn get_password_status() -> ApiResponse<PasswordStatus> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_settings() {
        Ok(settings) => {
            let password_hash = settings.password_hash.clone();
            let password_skipped = settings.password_skipped;

            let status = if password_hash.is_some() {
                "set".to_string()
            } else if password_skipped {
                "skipped".to_string()
            } else {
                "not-set".to_string()
            };

            ApiResponse::success(PasswordStatus {
                status,
                password_set: password_hash.is_some(),
                password_skipped,
            })
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Check password (verify and return success)
#[tauri::command]
pub async fn check_password(password: String) -> ApiResponse<bool> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_settings() {
        Ok(settings) => {
            let password_hash = match settings.password_hash {
                Some(hash) => hash,
                None => return ApiResponse::error("Password not set".to_string()),
            };

            match verify(&password, &password_hash) {
                Ok(valid) => {
                    if valid {
                        ApiResponse::success(true)
                    } else {
                        ApiResponse::error("Invalid password".to_string())
                    }
                }
                Err(e) => ApiResponse::error(format!("Password verification failed: {}", e)),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Set password (initial setup only)
#[tauri::command]
pub async fn set_password(password: String, confirm: String) -> ApiResponse<()> {
    if password != confirm {
        return ApiResponse::error("Passwords do not match".to_string());
    }

    if password.len() < 6 {
        return ApiResponse::error("Password must be at least 6 characters".to_string());
    }

    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Check if password already exists
    match store.get_settings() {
        Ok(settings) => {
            if settings.password_hash.is_some() {
                return ApiResponse::error("Password already set. Use change_password instead.".to_string());
            }
        }
        Err(e) => return ApiResponse::error(format!("Failed to get settings: {}", e)),
    }

    // Hash password
    let password_hash = match hash(&password, DEFAULT_COST) {
        Ok(hash) => hash,
        Err(e) => return ApiResponse::error(format!("Failed to hash password: {}", e)),
    };

    // Update settings
    match store.get_settings() {
        Ok(mut settings) => {
            settings.password_hash = Some(password_hash);
            settings.password_skipped = false;

            match store.update_settings(&settings) {
                Ok(_) => ApiResponse::success(()),
                Err(e) => ApiResponse::error(format!("Failed to update settings: {}", e)),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Change password (requires current password)
#[tauri::command]
pub async fn change_password(
    current_password: String,
    new_password: String,
    confirm: String,
) -> ApiResponse<()> {
    if new_password != confirm {
        return ApiResponse::error("New passwords do not match".to_string());
    }

    if new_password.len() < 6 {
        return ApiResponse::error("Password must be at least 6 characters".to_string());
    }

    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Verify current password
    match store.get_settings() {
        Ok(settings) => {
            let password_hash = match settings.password_hash {
                Some(hash) => hash,
                None => return ApiResponse::error("Password not set. Use set_password instead.".to_string()),
            };

            match verify(&current_password, &password_hash) {
                Ok(valid) => {
                    if !valid {
                        return ApiResponse::error("Current password is incorrect".to_string());
                    }
                }
                Err(e) => return ApiResponse::error(format!("Password verification failed: {}", e)),
            }

            // Hash new password
            let new_password_hash = match hash(&new_password, DEFAULT_COST) {
                Ok(hash) => hash,
                Err(e) => return ApiResponse::error(format!("Failed to hash password: {}", e)),
            };

            // Update settings
            let mut updated_settings = settings;
            updated_settings.password_hash = Some(new_password_hash);
            updated_settings.password_skipped = false;

            match store.update_settings(&updated_settings) {
                Ok(_) => ApiResponse::success(()),
                Err(e) => ApiResponse::error(format!("Failed to update settings: {}", e)),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Remove password protection (requires current password)
#[tauri::command]
pub async fn remove_password(current_password: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Verify current password
    match store.get_settings() {
        Ok(settings) => {
            let password_hash = match settings.password_hash {
                Some(hash) => hash,
                None => return ApiResponse::error("Password not set".to_string()),
            };

            match verify(&current_password, &password_hash) {
                Ok(valid) => {
                    if !valid {
                        return ApiResponse::error("Current password is incorrect".to_string());
                    }
                }
                Err(e) => return ApiResponse::error(format!("Password verification failed: {}", e)),
            }

            // Remove password
            let mut updated_settings = settings;
            updated_settings.password_hash = None;
            updated_settings.password_skipped = true;

            match store.update_settings(&updated_settings) {
                Ok(_) => ApiResponse::success(()),
                Err(e) => ApiResponse::error(format!("Failed to update settings: {}", e)),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}

/// Skip password protection (first launch only)
#[tauri::command]
pub async fn skip_password() -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Check if password already exists
    match store.get_settings() {
        Ok(settings) => {
            if settings.password_hash.is_some() {
                return ApiResponse::error("Password already set. Cannot skip.".to_string());
            }

            // Skip password
            let mut updated_settings = settings;
            updated_settings.password_hash = None;
            updated_settings.password_skipped = true;

            match store.update_settings(&updated_settings) {
                Ok(_) => ApiResponse::success(()),
                Err(e) => ApiResponse::error(format!("Failed to update settings: {}", e)),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get settings: {}", e)),
    }
}
