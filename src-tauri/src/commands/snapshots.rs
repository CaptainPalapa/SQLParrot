// ABOUTME: Snapshot management Tauri commands
// ABOUTME: Create, list, delete, and rollback database snapshots

use chrono::Utc;
use uuid::Uuid;

use crate::config::AppConfig;
use crate::db::{MetadataStore, SqlServerConnection};
use crate::models::{DatabaseSnapshot, HistoryEntry, OperationResult, Snapshot};
use crate::ApiResponse;

/// Get snapshots for a group
#[tauri::command]
pub async fn get_snapshots(group_id: String) -> ApiResponse<Vec<Snapshot>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_snapshots(&group_id) {
        Ok(snapshots) => ApiResponse::success(snapshots),
        Err(e) => ApiResponse::error(format!("Failed to get snapshots: {}", e)),
    }
}

/// Create a new snapshot for all databases in a group
#[tauri::command]
pub async fn create_snapshot(group_id: String, display_name: Option<String>) -> ApiResponse<Snapshot> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to load config: {}", e)),
    };

    let profile = match config.get_active_profile() {
        Some(p) => p,
        None => return ApiResponse::error("No active connection profile".to_string()),
    };

    // Get the group
    let groups = match store.get_groups() {
        Ok(g) => g,
        Err(e) => return ApiResponse::error(format!("Failed to get groups: {}", e)),
    };

    let group = match groups.iter().find(|g| g.id == group_id) {
        Some(g) => g,
        None => return ApiResponse::error(format!("Group not found: {}", group_id)),
    };

    // Get next sequence number
    let sequence = match store.get_next_sequence(&group_id) {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to get sequence: {}", e)),
    };

    let snapshot_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let name = display_name.unwrap_or_else(|| format!("Snapshot {}", sequence));

    // Connect to SQL Server
    let mut conn = match SqlServerConnection::connect(profile).await {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to connect to SQL Server: {}", e)),
    };

    // Create snapshot for each database
    let mut database_snapshots = Vec::new();
    let mut results = Vec::new();

    for database in &group.databases {
        let snapshot_name = format!(
            "{}_snapshot_{}_{}",
            database,
            group.name.replace(' ', "_"),
            sequence
        );

        match conn
            .create_snapshot(database, &snapshot_name, &profile.snapshot_path)
            .await
        {
            Ok(_) => {
                database_snapshots.push(DatabaseSnapshot {
                    database: database.clone(),
                    snapshot_name: snapshot_name.clone(),
                    success: true,
                    error: None,
                });
                results.push(OperationResult {
                    database: database.clone(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                let error_msg = e.to_string();
                database_snapshots.push(DatabaseSnapshot {
                    database: database.clone(),
                    snapshot_name: snapshot_name.clone(),
                    success: false,
                    error: Some(error_msg.clone()),
                });
                results.push(OperationResult {
                    database: database.clone(),
                    success: false,
                    error: Some(error_msg),
                });
            }
        }
    }

    let snapshot = Snapshot {
        id: snapshot_id,
        group_id: group_id.clone(),
        display_name: name,
        sequence,
        created_at: now,
        created_by: Some(whoami::username_os().to_string_lossy().into_owned()),
        database_snapshots,
        is_automatic: false,
    };

    // Save snapshot metadata
    if let Err(e) = store.add_snapshot(&snapshot) {
        return ApiResponse::error(format!("Failed to save snapshot metadata: {}", e));
    }

    // Log to history
    let history_entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        operation_type: "create_snapshot".to_string(),
        timestamp: now,
        user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
        details: Some(serde_json::json!({
            "groupId": group_id,
            "groupName": group.name,
            "snapshotId": snapshot.id,
            "displayName": snapshot.display_name
        })),
        results: Some(results),
    };
    let _ = store.add_history(&history_entry);

    ApiResponse::success(snapshot)
}

/// Delete a snapshot
#[tauri::command]
pub async fn delete_snapshot(snapshot_id: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to load config: {}", e)),
    };

    let profile = match config.get_active_profile() {
        Some(p) => p,
        None => return ApiResponse::error("No active connection profile".to_string()),
    };

    // Get the snapshot to find its database snapshots
    let groups = match store.get_groups() {
        Ok(g) => g,
        Err(e) => return ApiResponse::error(format!("Failed to get groups: {}", e)),
    };

    let mut snapshot_to_delete: Option<Snapshot> = None;
    for group in &groups {
        if let Ok(snapshots) = store.get_snapshots(&group.id) {
            if let Some(s) = snapshots.into_iter().find(|s| s.id == snapshot_id) {
                snapshot_to_delete = Some(s);
                break;
            }
        }
    }

    let snapshot = match snapshot_to_delete {
        Some(s) => s,
        None => return ApiResponse::error(format!("Snapshot not found: {}", snapshot_id)),
    };

    // Connect and drop SQL Server snapshots
    let mut conn = match SqlServerConnection::connect(profile).await {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to connect: {}", e)),
    };

    for db_snapshot in &snapshot.database_snapshots {
        if db_snapshot.success {
            if let Err(e) = conn.drop_snapshot(&db_snapshot.snapshot_name).await {
                // Log but continue - snapshot might already be gone
                eprintln!(
                    "Warning: Failed to drop snapshot {}: {}",
                    db_snapshot.snapshot_name, e
                );
            }
        }
    }

    // Delete from metadata
    match store.delete_snapshot(&snapshot_id) {
        Ok(_) => ApiResponse::success(()),
        Err(e) => ApiResponse::error(format!("Failed to delete snapshot metadata: {}", e)),
    }
}

/// Rollback to a snapshot
#[tauri::command]
pub async fn rollback_snapshot(snapshot_id: String) -> ApiResponse<RollbackResult> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to load config: {}", e)),
    };

    let profile = match config.get_active_profile() {
        Some(p) => p,
        None => return ApiResponse::error("No active connection profile".to_string()),
    };

    // Find the snapshot and its group
    let groups = match store.get_groups() {
        Ok(g) => g,
        Err(e) => return ApiResponse::error(format!("Failed to get groups: {}", e)),
    };

    let mut target_snapshot: Option<Snapshot> = None;
    let mut target_group: Option<&crate::models::Group> = None;

    for group in &groups {
        if let Ok(snapshots) = store.get_snapshots(&group.id) {
            if let Some(s) = snapshots.into_iter().find(|s| s.id == snapshot_id) {
                target_snapshot = Some(s);
                target_group = Some(group);
                break;
            }
        }
    }

    let snapshot = match target_snapshot {
        Some(s) => s,
        None => return ApiResponse::error(format!("Snapshot not found: {}", snapshot_id)),
    };

    let group = target_group.unwrap();

    // Connect to SQL Server
    let mut conn = match SqlServerConnection::connect(profile).await {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to connect: {}", e)),
    };

    // Check for external snapshots that would block rollback
    let all_server_snapshots = match conn.get_all_snapshots().await {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to check snapshots: {}", e)),
    };

    // Get all our tracked snapshot names for this group
    let group_snapshots = store.get_snapshots(&group.id).unwrap_or_default();
    let our_snapshot_names: Vec<String> = group_snapshots
        .iter()
        .flat_map(|s| s.database_snapshots.iter().map(|ds| ds.snapshot_name.clone()))
        .collect();

    // Find external snapshots for our databases
    let external_snapshots: Vec<String> = all_server_snapshots
        .iter()
        .filter(|name| {
            !our_snapshot_names.contains(name)
                && group.databases.iter().any(|db| name.starts_with(db))
        })
        .cloned()
        .collect();

    if !external_snapshots.is_empty() {
        return ApiResponse::error(format!(
            "Cannot rollback: external snapshots exist for databases in this group: {:?}",
            external_snapshots
        ));
    }

    let mut results = Vec::new();

    // Perform rollback for each database
    for db_snapshot in &snapshot.database_snapshots {
        if !db_snapshot.success {
            results.push(OperationResult {
                database: db_snapshot.database.clone(),
                success: false,
                error: Some("Original snapshot failed".to_string()),
            });
            continue;
        }

        // Kill connections
        if let Err(e) = conn.kill_connections(&db_snapshot.database).await {
            eprintln!("Warning: Failed to kill connections: {}", e);
        }

        // Set single user mode
        if let Err(e) = conn.set_single_user(&db_snapshot.database).await {
            results.push(OperationResult {
                database: db_snapshot.database.clone(),
                success: false,
                error: Some(format!("Failed to set single user mode: {}", e)),
            });
            continue;
        }

        // Restore from snapshot
        let restore_result = conn
            .restore_from_snapshot(&db_snapshot.database, &db_snapshot.snapshot_name)
            .await;

        // Set back to multi user mode
        let _ = conn.set_multi_user(&db_snapshot.database).await;

        match restore_result {
            Ok(_) => {
                results.push(OperationResult {
                    database: db_snapshot.database.clone(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                results.push(OperationResult {
                    database: db_snapshot.database.clone(),
                    success: false,
                    error: Some(format!("Restore failed: {}", e)),
                });
            }
        }
    }

    // Delete snapshots after the target (newer ones)
    let snapshots_after: Vec<Snapshot> = group_snapshots
        .into_iter()
        .filter(|s| s.sequence > snapshot.sequence)
        .collect();

    for old_snapshot in snapshots_after {
        for db_snapshot in &old_snapshot.database_snapshots {
            if db_snapshot.success {
                let _ = conn.drop_snapshot(&db_snapshot.snapshot_name).await;
            }
        }
        let _ = store.delete_snapshot(&old_snapshot.id);
    }

    // Log to history
    let history_entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        operation_type: "rollback".to_string(),
        timestamp: Utc::now(),
        user_name: Some(whoami::username_os().to_string_lossy().into_owned()),
        details: Some(serde_json::json!({
            "groupId": group.id,
            "groupName": group.name,
            "snapshotId": snapshot.id,
            "displayName": snapshot.display_name
        })),
        results: Some(results.clone()),
    };
    let _ = store.add_history(&history_entry);

    let success_count = results.iter().filter(|r| r.success).count();
    let total_count = results.len();

    ApiResponse::success(RollbackResult {
        success: success_count == total_count,
        databases_restored: success_count,
        databases_failed: total_count - success_count,
        results,
    })
}

/// Verify snapshots exist in SQL Server
#[tauri::command]
pub async fn verify_snapshots(group_id: String) -> ApiResponse<VerificationResult> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to load config: {}", e)),
    };

    let profile = match config.get_active_profile() {
        Some(p) => p,
        None => return ApiResponse::error("No active connection profile".to_string()),
    };

    let mut conn = match SqlServerConnection::connect(profile).await {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(format!("Failed to connect: {}", e)),
    };

    let server_snapshots = match conn.get_all_snapshots().await {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to get snapshots: {}", e)),
    };

    let metadata_snapshots = store.get_snapshots(&group_id).unwrap_or_default();

    let mut orphaned = Vec::new();
    let mut stale = Vec::new();

    // Check for stale metadata (snapshots in metadata but not on server)
    for snapshot in &metadata_snapshots {
        for db_snapshot in &snapshot.database_snapshots {
            if db_snapshot.success && !server_snapshots.contains(&db_snapshot.snapshot_name) {
                stale.push(db_snapshot.snapshot_name.clone());
            }
        }
    }

    // Check for orphaned snapshots (on server but not in metadata)
    let metadata_names: Vec<String> = metadata_snapshots
        .iter()
        .flat_map(|s| s.database_snapshots.iter().map(|ds| ds.snapshot_name.clone()))
        .collect();

    let groups = store.get_groups().unwrap_or_default();
    let group = groups.iter().find(|g| g.id == group_id);

    if let Some(group) = group {
        for server_snapshot in &server_snapshots {
            if group
                .databases
                .iter()
                .any(|db| server_snapshot.starts_with(db))
                && !metadata_names.contains(server_snapshot)
            {
                orphaned.push(server_snapshot.clone());
            }
        }
    }

    ApiResponse::success(VerificationResult {
        verified: orphaned.is_empty() && stale.is_empty(),
        orphaned_snapshots: orphaned,
        stale_metadata: stale,
    })
}

#[derive(serde::Serialize)]
pub struct RollbackResult {
    pub success: bool,
    pub databases_restored: usize,
    pub databases_failed: usize,
    pub results: Vec<OperationResult>,
}

#[derive(serde::Serialize)]
pub struct VerificationResult {
    pub verified: bool,
    pub orphaned_snapshots: Vec<String>,
    pub stale_metadata: Vec<String>,
}
