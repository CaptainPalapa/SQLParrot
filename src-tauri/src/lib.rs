// ABOUTME: Main library for SQL Parrot Tauri application
// ABOUTME: Contains app setup, command registration, and module declarations

use serde::{Deserialize, Serialize};

// Module declarations
pub mod commands;
pub mod config;
pub mod db;
pub mod models;

/// Standard API response format matching the Express backend
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub messages: Messages,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Messages {
    pub error: Vec<String>,
    pub warning: Vec<String>,
    pub info: Vec<String>,
    pub success: Vec<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            messages: Messages::default(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            messages: Messages {
                error: vec![message],
                ..Default::default()
            },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn error_with_data(message: String, data: T) -> Self {
        Self {
            success: false,
            data: Some(data),
            messages: Messages {
                error: vec![message],
                ..Default::default()
            },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Health check response
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub connected: bool,
    pub version: String,
    pub platform: String,
    #[serde(rename = "sqlServerVersion", skip_serializing_if = "Option::is_none")]
    pub sql_server_version: Option<String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Connection commands
            commands::check_health,
            commands::test_connection,
            commands::get_databases,
            commands::save_connection,
            commands::get_connection,
            // Group commands
            commands::get_groups,
            commands::create_group,
            commands::update_group,
            commands::delete_group,
            // Snapshot commands
            commands::get_snapshots,
            commands::create_snapshot,
            commands::delete_snapshot,
            commands::rollback_snapshot,
            commands::verify_snapshots,
            // Settings/history commands
            commands::get_settings,
            commands::update_settings,
            commands::get_history,
            commands::clear_history,
            commands::trim_history,
            commands::get_metadata_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
