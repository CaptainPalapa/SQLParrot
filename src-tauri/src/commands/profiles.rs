// ABOUTME: Profile management Tauri commands
// ABOUTME: CRUD operations for database connection profiles

use chrono::Utc;
use uuid::Uuid;

use crate::db::MetadataStore;
use crate::models::Profile;
use crate::ApiResponse;

/// Get all profiles (without passwords for security)
#[tauri::command]
pub async fn get_profiles() -> ApiResponse<Vec<crate::models::ProfilePublic>> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
    };

    match store.get_profiles() {
        Ok(profiles) => {
            // Convert to public profiles (without passwords)
            let public_profiles: Vec<crate::models::ProfilePublic> = profiles
                .into_iter()
                .map(|p| crate::models::ProfilePublic {
                    id: p.id,
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
                    created_at: p.created_at,
                    updated_at: p.updated_at,
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

    match store.get_profiles() {
        Ok(profiles) => {
            let profile = profiles.into_iter().find(|p| p.id == profile_id);
            match profile {
                Some(p) => {
                    let public_profile = crate::models::ProfilePublic {
                        id: p.id,
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
    isActive: bool,
) -> ApiResponse<crate::models::ProfilePublic> {
    let store = match MetadataStore::open() {
        Ok(s) => s,
        Err(e) => return ApiResponse::error(format!("Failed to open metadata store: {}", e)),
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
        is_active: isActive,
        created_at: now,
        updated_at: now,
    };

    match store.create_profile(&profile) {
        Ok(_) => {
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
    id: String,
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
    isActive: bool,
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

    let existing_profile = match existing_profiles.iter().find(|p| p.id == id) {
        Some(p) => p,
        None => return ApiResponse::error("Profile not found".to_string()),
    };

    let password_to_use = password.unwrap_or_else(|| existing_profile.password.clone());

    let profile = Profile {
        id,
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
        is_active: isActive,
        created_at: existing_profile.created_at,
        updated_at: Utc::now(),
    };

    match store.update_profile(&profile) {
        Ok(_) => {
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
                created_at: profile.created_at,
                updated_at: profile.updated_at,
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
        Ok(_) => ApiResponse::success(()),
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

