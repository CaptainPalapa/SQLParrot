// ABOUTME: Group management Tauri commands
// ABOUTME: CRUD operations for snapshot groups

use chrono::Utc;
use uuid::Uuid;

use crate::config::ConnectionProfile;
use crate::db::{MetadataStore, SqlServerConnection};
use crate::models::{Group, HistoryEntry};
use crate::ApiResponse;

/// Helper function to get profile from metadata database using group's profile_id
/// and convert it to ConnectionProfile for SQL Server connection
fn get_profile_for_group(
    store: &MetadataStore,
    group: &Group,
) -> Result<ConnectionProfile, String> {
    let profile_id = group
        .profile_id
        .as_ref()
        .ok_or_else(|| "Group has no profile_id".to_string())?;

    let profile = store
        .get_profile(profile_id)
        .map_err(|e| format!("Failed to get profile: {}", e))?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    // Convert Profile to ConnectionProfile
    Ok(ConnectionProfile {
        name: profile.name.clone(),
        db_type: crate::config::DatabaseType::SqlServer,
        host: profile.host.clone(),
        port: profile.port,
        username: profile.username.clone(),
        password: profile.password.clone(),
        trust_certificate: profile.trust_certificate,
        snapshot_path: profile.snapshot_path.clone(),
    })
}

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
pub async fn create_group(
    name: String,
    databases: Vec<String>,
    profile_id: Option<String>,
) -> ApiResponse<Group> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let now = Utc::now();
    let group = Group {
        id: Uuid::new_v4().to_string(),
        name,
        databases,
        profile_id, // Use provided profile_id or let create_group use active profile
        created_by: whoami::username_os().to_string_lossy().into_owned().into(),
        created_at: now,
        updated_at: now,
    };

    match store.create_group(&group) {
        Ok(_) => {
            // Log to history
            let history_entry = HistoryEntry {
                id: Uuid::new_v4().to_string(),
                operation_type: "create_group".to_string(),
                timestamp: now,
                user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
                details: Some(serde_json::json!({
                    "groupId": group.id,
                    "groupName": group.name,
                    "databaseCount": group.databases.len()
                })),
                results: None,
            };
            let _ = store.add_history(&history_entry);
            ApiResponse::success(group)
        }
        Err(e) => ApiResponse::error(format!("Failed to create group: {}", e)),
    }
}

/// Update an existing group
#[tauri::command]
pub async fn update_group(
    id: String,
    name: String,
    databases: Vec<String>,
    profile_id: Option<String>,
) -> ApiResponse<Group> {
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
        Some(g) => g.clone(),
        None => return ApiResponse::error(format!("Group not found: {}", id)),
    };

    // Find databases that were removed
    let removed_databases: Vec<&String> = existing
        .databases
        .iter()
        .filter(|db| !databases.contains(db))
        .collect();

    // If databases were removed, clean up their snapshots
    if !removed_databases.is_empty() {
        // Get profile from metadata database using group's profile_id
        let profile = match get_profile_for_group(&store, &existing) {
            Ok(p) => p,
            Err(e) => return ApiResponse::error(e),
        };

        // Connect to SQL Server
        let mut conn = match SqlServerConnection::connect(&profile).await {
            Ok(c) => c,
            Err(e) => return ApiResponse::error(format!("Failed to connect: {}", e)),
        };

        // Get all snapshots for this group
        if let Ok(snapshots) = store.get_snapshots(&id) {
            for snapshot in snapshots {
                // Find database snapshots for removed databases
                for db_snapshot in &snapshot.database_snapshots {
                    if removed_databases.contains(&&db_snapshot.database) && db_snapshot.success {
                        // Drop the SQL Server snapshot
                        let _ = conn.drop_snapshot(&db_snapshot.snapshot_name).await;
                    }
                }
            }

            // Delete all snapshots for this group since they're now incomplete
            // (A partial snapshot isn't useful for rollback)
            for snapshot in store.get_snapshots(&id).unwrap_or_default() {
                let _ = store.delete_snapshot(&snapshot.id);
                for db_snapshot in &snapshot.database_snapshots {
                    if db_snapshot.success {
                        let _ = conn.drop_snapshot(&db_snapshot.snapshot_name).await;
                    }
                }
            }
        }
    }

    let group = Group {
        id,
        name,
        databases,
        profile_id: profile_id.or(existing.profile_id.clone()), // Use provided profile_id or preserve existing
        created_by: existing.created_by.clone(),
        created_at: existing.created_at,
        updated_at: Utc::now(),
    };

    match store.update_group(&group) {
        Ok(_) => {
            // Log to history
            let history_entry = HistoryEntry {
                id: Uuid::new_v4().to_string(),
                operation_type: "update_group".to_string(),
                timestamp: Utc::now(),
                user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
                details: Some(serde_json::json!({
                    "groupId": group.id,
                    "groupName": group.name,
                    "databaseCount": group.databases.len()
                })),
                results: None,
            };
            let _ = store.add_history(&history_entry);
            ApiResponse::success(group)
        }
        Err(e) => ApiResponse::error(format!("Failed to update group: {}", e)),
    }
}

/// Delete a group and all its snapshots (including from SQL Server)
#[tauri::command]
pub async fn delete_group(id: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Get group info before deleting for history
    let groups = store.get_groups().unwrap_or_default();
    let group = groups.iter().find(|g| g.id == id);
    let group_name = group.map(|g| g.name.clone()).unwrap_or_default();

    // Get all snapshots for this group to drop from SQL Server
    let group_snapshots = store.get_snapshots(&id).unwrap_or_default();
    let mut dropped_count = 0;

    // If there are snapshots, we need to drop them from SQL Server first
    if !group_snapshots.is_empty() {
        let group = match group {
            Some(g) => g,
            None => return ApiResponse::error(format!("Group not found: {}", id)),
        };

        // Get profile from metadata database using group's profile_id
        let profile = match get_profile_for_group(&store, group) {
            Ok(p) => p,
            Err(e) => return ApiResponse::error(e),
        };

        // Connect to SQL Server and drop each snapshot database
        match crate::db::SqlServerConnection::connect(&profile).await {
            Ok(mut conn) => {
                for snapshot in &group_snapshots {
                    for db_snapshot in &snapshot.database_snapshots {
                        if db_snapshot.success && !db_snapshot.snapshot_name.is_empty() {
                            if let Ok(_) = conn.drop_snapshot(&db_snapshot.snapshot_name).await {
                                dropped_count += 1;
                                log::info!("Dropped snapshot database: {}", db_snapshot.snapshot_name);
                            } else {
                                log::warn!("Failed to drop snapshot database: {} (may not exist)", db_snapshot.snapshot_name);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Could not connect to SQL Server to drop snapshots: {}", e);
                // Continue with metadata deletion even if we couldn't drop SQL Server snapshots
                // User will need to clean up orphans manually
            }
        }
    }

    // Delete snapshot metadata
    if let Err(e) = store.delete_snapshots_for_group(&id) {
        return ApiResponse::error(format!("Failed to delete group snapshots: {}", e));
    }

    match store.delete_group(&id) {
        Ok(_) => {
            // Log to history
            let history_entry = HistoryEntry {
                id: Uuid::new_v4().to_string(),
                operation_type: "delete_group".to_string(),
                timestamp: Utc::now(),
                user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
                details: Some(serde_json::json!({
                    "groupId": id,
                    "groupName": group_name,
                    "droppedSnapshots": dropped_count
                })),
                results: None,
            };
            let _ = store.add_history(&history_entry);
            ApiResponse::success(())
        }
        Err(e) => ApiResponse::error(format!("Failed to delete group: {}", e)),
    }
}
