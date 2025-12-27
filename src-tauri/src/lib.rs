// ABOUTME: Main library for SQL Parrot Tauri application
// ABOUTME: Contains app setup, command registration, and module declarations

use serde::{Deserialize, Serialize};

// Module declarations
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
}

/// Health check response
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub connected: bool,
    pub version: String,
    pub platform: String,
}

/// Simple health check command - tests that Tauri commands work
#[tauri::command]
fn check_health() -> ApiResponse<HealthResponse> {
    ApiResponse::success(HealthResponse {
        connected: false, // Will be true once SQL Server connection is implemented
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
    })
}

/// Placeholder command for getting groups (to be implemented)
#[tauri::command]
fn get_groups() -> ApiResponse<Vec<()>> {
    ApiResponse::error("Not yet implemented - Tauri backend in development".to_string())
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
            check_health,
            get_groups,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
