// ABOUTME: Group management Tauri commands
// ABOUTME: CRUD operations for snapshot groups

use chrono::Utc;
use uuid::Uuid;

use crate::db::MetadataStore;
use crate::models::Group;
use crate::ApiResponse;

/// Get all groups
#[tauri::command]
pub async fn get_groups() -> ApiResponse<Vec<Group>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_groups() {
        Ok(groups) => ApiResponse::success(groups),
        Err(e) => ApiResponse::error(format!("Failed to get groups: {}", e)),
    }
}

/// Create a new group
#[tauri::command]
pub async fn create_group(name: String, databases: Vec<String>) -> ApiResponse<Group> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let now = Utc::now();
    let group = Group {
        id: Uuid::new_v4().to_string(),
        name,
        databases,
        created_by: whoami::username_os().to_string_lossy().into_owned().into(),
        created_at: now,
        updated_at: now,
    };

    match store.create_group(&group) {
        Ok(_) => ApiResponse::success(group),
        Err(e) => ApiResponse::error(format!("Failed to create group: {}", e)),
    }
}

/// Update an existing group
#[tauri::command]
pub async fn update_group(id: String, name: String, databases: Vec<String>) -> ApiResponse<Group> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Get existing group to preserve created_at and created_by
    let existing_groups = match store.get_groups() {
        Ok(g) => g,
        Err(e) => return ApiResponse::error(format!("Failed to get groups: {}", e)),
    };

    let existing = match existing_groups.iter().find(|g| g.id == id) {
        Some(g) => g,
        None => return ApiResponse::error(format!("Group not found: {}", id)),
    };

    let group = Group {
        id,
        name,
        databases,
        created_by: existing.created_by.clone(),
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };

    match store.update_group(&group) {
        Ok(_) => ApiResponse::success(group),
        Err(e) => ApiResponse::error(format!("Failed to update group: {}", e)),
    }
}

/// Delete a group and all its snapshots
#[tauri::command]
pub async fn delete_group(id: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Delete snapshots first
    if let Err(e) = store.delete_snapshots_for_group(&id) {
        return ApiResponse::error(format!("Failed to delete group snapshots: {}", e));
    }

    match store.delete_group(&id) {
        Ok(_) => ApiResponse::success(()),
        Err(e) => ApiResponse::error(format!("Failed to delete group: {}", e)),
    }
}
