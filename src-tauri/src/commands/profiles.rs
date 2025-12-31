// ABOUTME: Profile management Tauri commands
// ABOUTME: CRUD operations for database connection profiles

use chrono::Utc;
use uuid::Uuid;

use crate::db::MetadataStore;
use crate::models::Profile;
use crate::ApiResponse;

/// Get all profiles (without passwords for security) with group counts
#[tauri::command]
pub async fn get_profiles() -> ApiResponse<Vec<crate::models::ProfilePublic>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Ensure at least one profile is active (if profiles exist)
    let _ = store.ensure_active_profile();

    // Get group counts per profile
    let group_counts = store.get_group_counts_by_profile().unwrap_or_default();

    match store.get_profiles() {
        Ok(profiles) => {
            // Convert to public profiles (without passwords) with group counts
            let public_profiles: Vec<crate::models::ProfilePublic> = profiles
                .into_iter()
                .map(|p| {
                    let group_count = group_counts.get(&p.id).copied().unwrap_or(0);
                    crate::models::ProfilePublic {
                        id: p.id.clone(),
                        name: p.name,
                        platform_type: p.platform_type,
                        host: p.host,
                        port: p.port,
                        username: p.username,
                        trust_certificate: p.trust_certificate,
                        snapshot_path: p.snapshot_path,
                        description: p.description,
                        notes: p.notes,
                        is_active: p.is_active,
                        group_count,
                        created_at: p.created_at,
                        updated_at: p.updated_at,
                    }
                })
                .collect();
            ApiResponse::success(public_profiles)
        }
        Err(e) => ApiResponse::error(format!("Failed to get profiles: {}", e)),
    }
}

/// Get a single profile by ID (without password for security)
#[tauri::command]
pub async fn get_profile(profile_id: String) -> ApiResponse<Option<crate::models::ProfilePublic>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Get group counts per profile
    let group_counts = store.get_group_counts_by_profile().unwrap_or_default();

    match store.get_profiles() {
        Ok(profiles) => {
            let profile = profiles.into_iter().find(|p| p.id == profile_id);
            match profile {
                Some(p) => {
                    let group_count = group_counts.get(&p.id).copied().unwrap_or(0);
                    let public_profile = crate::models::ProfilePublic {
                        id: p.id.clone(),
                        name: p.name,
                        platform_type: p.platform_type,
                        host: p.host,
                        port: p.port,
                        username: p.username,
                        trust_certificate: p.trust_certificate,
                        snapshot_path: p.snapshot_path,
                        description: p.description,
                        notes: p.notes,
                        is_active: p.is_active,
                        group_count,
                        created_at: p.created_at,
                        updated_at: p.updated_at,
                    };
                    ApiResponse::success(Some(public_profile))
                }
                None => ApiResponse::success(None),
            }
        }
        Err(e) => ApiResponse::error(format!("Failed to get profile: {}", e)),
    }
}

/// Create a new profile
#[tauri::command]
#[allow(non_snake_case)]
pub async fn create_profile(
    name: String,
    platformType: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    trustCertificate: bool,
    snapshotPath: String,
    description: Option<String>,
    notes: Option<String>,
    isActive: Option<bool>, // Optional - if None, will auto-activate if it's the only profile
) -> ApiResponse<crate::models::ProfilePublic> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Determine if this profile should be active
    // If explicitly set, use that; otherwise, activate if it's the only profile
    let should_be_active = if let Some(explicit) = isActive {
        explicit
    } else {
        // Check if this will be the only profile
        match store.get_profiles() {
            Ok(profiles) => profiles.is_empty(), // Activate if it's the first profile
            Err(_) => false, // On error, don't activate
        }
    };

    let now = Utc::now();
    let profile = Profile {
        id: Uuid::new_v4().to_string(),
        name,
        platform_type: platformType,
        host,
        port,
        username,
        password,
        trust_certificate: trustCertificate,
        snapshot_path: snapshotPath,
        description,
        notes,
        is_active: should_be_active,
        created_at: now,
        updated_at: now,
    };

    match store.create_profile(&profile) {
        Ok(_) => {
            // Ensure at least one profile is active after creation
            let _ = store.ensure_active_profile();

            let public_profile = crate::models::ProfilePublic {
                id: profile.id,
                name: profile.name,
                platform_type: profile.platform_type,
                host: profile.host,
                port: profile.port,
                username: profile.username,
                trust_certificate: profile.trust_certificate,
                snapshot_path: profile.snapshot_path,
                description: profile.description,
                notes: profile.notes,
                is_active: profile.is_active,
                group_count: 0, // New profile has no groups yet
                created_at: profile.created_at,
                updated_at: profile.updated_at,
            };
            ApiResponse::success(public_profile)
        }
        Err(e) => ApiResponse::error(format!("Failed to create profile: {}", e)),
    }
}

/// Update an existing profile
#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_profile(
    profile_id: String,
    name: String,
    platformType: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>, // Optional - if None, keep existing password
    trustCertificate: bool,
    snapshotPath: String,
    description: Option<String>,
    notes: Option<String>,
    isActive: Option<bool>, // Optional - if None, preserve existing value
) -> ApiResponse<crate::models::ProfilePublic> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    // Get existing profile to preserve password if not provided
    let existing_profiles = match store.get_profiles() {
        Ok(p) => p,
        Err(e) => return ApiResponse::error(format!("Failed to get profiles: {}", e)),
    };

    let existing_profile = match existing_profiles.iter().find(|p| p.id == profile_id) {
        Some(p) => p,
        None => return ApiResponse::error("Profile not found".to_string()),
    };

    let password_to_use = password.unwrap_or_else(|| existing_profile.password.clone());
    // Preserve existing is_active if not explicitly provided
    let is_active = isActive.unwrap_or(existing_profile.is_active);

    let profile = Profile {
        id: profile_id,
        name,
        platform_type: platformType,
        host,
        port,
        username,
        password: password_to_use,
        trust_certificate: trustCertificate,
        snapshot_path: snapshotPath,
        description,
        notes,
        is_active,
        created_at: existing_profile.created_at,
        updated_at: Utc::now(),
    };

    // Get group count for this profile
    let group_counts = store.get_group_counts_by_profile().unwrap_or_default();
    let group_count = group_counts.get(&profile.id).copied().unwrap_or(0);

    match store.update_profile(&profile) {
        Ok(_) => {
            // Ensure at least one profile is active after update
            let _ = store.ensure_active_profile();

            // Re-fetch profile to get updated is_active status
            let updated_profiles = store.get_profiles().unwrap_or_default();
            let updated_profile = updated_profiles.iter().find(|p| p.id == profile.id);

            let public_profile = if let Some(p) = updated_profile {
                crate::models::ProfilePublic {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    platform_type: p.platform_type.clone(),
                    host: p.host.clone(),
                    port: p.port,
                    username: p.username.clone(),
                    trust_certificate: p.trust_certificate,
                    snapshot_path: p.snapshot_path.clone(),
                    description: p.description.clone(),
                    notes: p.notes.clone(),
                    is_active: p.is_active,
                    group_count,
                    created_at: p.created_at,
                    updated_at: p.updated_at,
                }
            } else {
                // Fallback to original profile data if re-fetch fails
                crate::models::ProfilePublic {
                    id: profile.id,
                    name: profile.name,
                    platform_type: profile.platform_type,
                    host: profile.host,
                    port: profile.port,
                    username: profile.username,
                    trust_certificate: profile.trust_certificate,
                    snapshot_path: profile.snapshot_path,
                    description: profile.description,
                    notes: profile.notes,
                    is_active: profile.is_active,
                    group_count,
                    created_at: profile.created_at,
                    updated_at: profile.updated_at,
                }
            };
            ApiResponse::success(public_profile)
        }
        Err(e) => ApiResponse::error(format!("Failed to update profile: {}", e)),
    }
}

/// Delete a profile
#[tauri::command]
pub async fn delete_profile(profile_id: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.delete_profile(&profile_id) {
        Ok(_) => {
            // Ensure at least one profile is active after deletion (if profiles still exist)
            let _ = store.ensure_active_profile();
            ApiResponse::success(())
        }
        Err(e) => ApiResponse::error(format!("Failed to delete profile: {}", e)),
    }
}

/// Set a profile as active (deactivates all others)
#[tauri::command]
pub async fn set_active_profile(profile_id: String) -> ApiResponse<()> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.set_active_profile(&profile_id) {
        Ok(_) => ApiResponse::success(()),
        Err(e) => ApiResponse::error(format!("Failed to set active profile: {}", e)),
    }
}

