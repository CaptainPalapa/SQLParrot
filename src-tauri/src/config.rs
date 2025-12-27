// ABOUTME: Configuration management for SQL Parrot desktop app
// ABOUTME: Handles connection profiles and app preferences with extensible JSON format

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    ReadError(#[from] std::io::Error),
    #[error("Failed to parse config file: {0}")]
    ParseError(#[from] serde_json::Error),
    #[error("Config directory not found")]
    NoDirFound,
    #[error("Profile not found: {0}")]
    ProfileNotFound(String),
}

/// Database type for future extensibility
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    SqlServer,
    // Future: PostgreSQL, MySQL, etc.
}

impl Default for DatabaseType {
    fn default() -> Self {
        DatabaseType::SqlServer
    }
}

/// Connection profile for a database server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub name: String,
    #[serde(rename = "type", default)]
    pub db_type: DatabaseType,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default = "default_true")]
    pub trust_certificate: bool,
    #[serde(default = "default_snapshot_path")]
    pub snapshot_path: String,
}

fn default_port() -> u16 {
    1433
}

fn default_true() -> bool {
    true
}

fn default_snapshot_path() -> String {
    "C:\\Snapshots".to_string()
}

impl Default for ConnectionProfile {
    fn default() -> Self {
        Self {
            name: "Default".to_string(),
            db_type: DatabaseType::SqlServer,
            host: "localhost".to_string(),
            port: 1433,
            username: "sa".to_string(),
            password: String::new(),
            trust_certificate: true,
            snapshot_path: "C:\\Snapshots".to_string(),
        }
    }
}

/// Application preferences
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    #[serde(default)]
    pub theme: String,
    #[serde(default = "default_max_history")]
    pub max_history_entries: u32,
}

fn default_max_history() -> u32 {
    100
}

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_active_profile")]
    pub active_profile: String,
    #[serde(default)]
    pub profiles: HashMap<String, ConnectionProfile>,
    #[serde(default)]
    pub preferences: Preferences,
}

fn default_version() -> u32 {
    1
}

fn default_active_profile() -> String {
    "default".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert("default".to_string(), ConnectionProfile::default());

        Self {
            version: 1,
            active_profile: "default".to_string(),
            profiles,
            preferences: Preferences::default(),
        }
    }
}

impl AppConfig {
    /// Get the config file path based on OS
    pub fn config_path() -> Result<PathBuf, ConfigError> {
        let config_dir = dirs::config_dir().ok_or(ConfigError::NoDirFound)?;
        let app_dir = config_dir.join("SQL Parrot");
        Ok(app_dir.join("config.json"))
    }

    /// Load config from file, or create default if not exists
    pub fn load() -> Result<Self, ConfigError> {
        let path = Self::config_path()?;

        if !path.exists() {
            // Create default config
            let config = Self::default();
            config.save()?;
            return Ok(config);
        }

        let contents = fs::read_to_string(&path)?;
        let config: AppConfig = serde_json::from_str(&contents)?;
        Ok(config)
    }

    /// Save config to file
    pub fn save(&self) -> Result<(), ConfigError> {
        let path = Self::config_path()?;

        // Ensure directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let contents = serde_json::to_string_pretty(self)?;
        fs::write(&path, contents)?;
        Ok(())
    }

    /// Get the active connection profile
    pub fn active_profile(&self) -> Result<&ConnectionProfile, ConfigError> {
        self.profiles
            .get(&self.active_profile)
            .ok_or_else(|| ConfigError::ProfileNotFound(self.active_profile.clone()))
    }

    /// Get a mutable reference to the active profile
    pub fn active_profile_mut(&mut self) -> Result<&mut ConnectionProfile, ConfigError> {
        let active = self.active_profile.clone();
        self.profiles
            .get_mut(&active)
            .ok_or_else(|| ConfigError::ProfileNotFound(active))
    }

    /// Add or update a profile
    pub fn set_profile(&mut self, key: String, profile: ConnectionProfile) {
        self.profiles.insert(key, profile);
    }

    /// Remove a profile (cannot remove if it's the only one)
    pub fn remove_profile(&mut self, key: &str) -> Result<(), ConfigError> {
        if self.profiles.len() <= 1 {
            return Err(ConfigError::ProfileNotFound(
                "Cannot remove the last profile".to_string(),
            ));
        }
        self.profiles.remove(key);

        // If we removed the active profile, switch to another one
        if self.active_profile == key {
            if let Some(first_key) = self.profiles.keys().next() {
                self.active_profile = first_key.clone();
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.version, 1);
        assert_eq!(config.active_profile, "default");
        assert!(config.profiles.contains_key("default"));
    }

    #[test]
    fn test_serialization() {
        let config = AppConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();
        let parsed: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.version, config.version);
    }
}
