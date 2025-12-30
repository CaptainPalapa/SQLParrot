// ABOUTME: SQLite-based metadata storage for SQL Parrot
// ABOUTME: Stores snapshots, groups, history, and settings in a local SQLite database

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * SQLite Metadata Storage System for SQL Parrot
 *
 * This module provides local SQLite-based metadata storage:
 * - Uses a local SQLite file (./data/sqlparrot.db)
 * - No SQL Server permissions required for metadata
 * - Self-contained and portable
 * - Single-user per instance
 */
class MetadataStorage {
  constructor() {
    this.userName = process.env.SQLPARROT_USER_NAME || 'local_user';
    this.dbPath = path.join(process.cwd(), 'data', 'sqlparrot.db');
    this.db = null;

    console.log(`🔧 SQLite Metadata Storage:`);
    console.log(`   User = "${this.userName}"`);
    console.log(`   Database = "${this.dbPath}"`);
  }

  /**
   * Get database connection, creating if needed
   * @returns {Database} SQLite database instance
   */
  getDb() {
    if (!this.db) {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      // Enable foreign keys and WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
    }
    return this.db;
  }

  /**
   * Close the database connection (call on app shutdown)
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('🔌 SQLite database closed');
    }
  }

  // Alias for compatibility
  async closePool() {
    this.close();
  }

  /**
   * Test database connection
   * @returns {Object} Connection test result
   */
  async testConnection() {
    try {
      console.log('🔍 Testing SQLite connection...');
      const db = this.getDb();
      db.prepare('SELECT 1 as test').get();
      console.log('✅ SQLite connection successful');
      return { success: true, message: 'SQLite connection successful' };
    } catch (error) {
      console.error('❌ SQLite connection failed:', error.message);
      throw new Error(`SQLite connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize database tables
   * @returns {Object} Initialization result
   */
  async initialize() {
    try {
      console.log('🚀 Initializing SQLite metadata storage...');
      const db = this.getDb();

      // Create snapshot table
      db.exec(`
        CREATE TABLE IF NOT EXISTS snapshot (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_name TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          group_id TEXT NOT NULL,
          group_name TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          purpose TEXT DEFAULT 'manual',
          tags TEXT,
          database_count INTEGER DEFAULT 0,
          database_snapshots TEXT
        )
      `);

      // Create history table
      db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          user_name TEXT NOT NULL,
          group_name TEXT,
          snapshot_name TEXT,
          snapshot_id TEXT,
          sequence INTEGER,
          details TEXT
        )
      `);

      // Create groups table
      db.exec(`
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          databases TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create stats table
      db.exec(`
        CREATE TABLE IF NOT EXISTS stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stat_name TEXT NOT NULL UNIQUE,
          stat_value TEXT,
          updated_at TEXT NOT NULL
        )
      `);

      // Create _metadata table for version tracking
      db.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      // Create profiles table for connection profiles
      db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          platform_type TEXT NOT NULL DEFAULT 'Microsoft SQL Server',
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 1433,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          trust_certificate INTEGER DEFAULT 1,
          snapshot_path TEXT NOT NULL DEFAULT '/var/opt/mssql/snapshots',
          description TEXT,
          notes TEXT,
          is_active INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create indexes for common queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshot_group_id ON snapshot(group_id);
        CREATE INDEX IF NOT EXISTS idx_snapshot_created_at ON snapshot(created_at);
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_history_type ON history(type);
        CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);
      `);

      // Initialize metadata version if not exists
      db.exec(`
        INSERT OR IGNORE INTO _metadata (key, value) VALUES ('last_version_seen', '0.0.0')
      `);

      console.log('✅ SQLite metadata storage initialized successfully');

      // Check version and migrate if needed
      await this.checkAndMigrate();

      return { success: true, message: 'Metadata storage initialized' };

    } catch (error) {
      console.error('❌ Failed to initialize metadata storage:', error.message);
      throw new Error(`Metadata storage initialization failed: ${error.message}`);
    }
  }

  /**
   * Check version and run migrations if needed
   */
  async checkAndMigrate() {
    try {
      const db = this.getDb();
      const versionResult = db.prepare('SELECT value FROM _metadata WHERE key = ?').get('last_version_seen');
      const lastVersion = versionResult ? versionResult.value : '0.0.0';
      const currentVersion = '1.3.0';

      if (this.compareVersions(lastVersion, currentVersion) < 0) {
        console.log(`🔄 Migrating from version ${lastVersion} to ${currentVersion}...`);

        // Migration from versions < 1.3.0: Migrate config.json and env vars to profiles table
        if (this.compareVersions(lastVersion, '1.3.0') < 0) {
          await this.migrateConfigJsonToProfiles();
          await this.migrateEnvVarsToProfiles();
        }

        // Update version
        db.prepare('INSERT OR REPLACE INTO _metadata (key, value) VALUES (?, ?)').run('last_version_seen', currentVersion);
        console.log(`✅ Migration to ${currentVersion} completed`);
      }
    } catch (error) {
      console.error('⚠️ Migration check failed:', error.message);
      // Continue anyway - migration failures shouldn't prevent app from starting
    }
  }

  /**
   * Compare two version strings
   * @param {string} v1
   * @param {string} v2
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(n => parseInt(n) || 0);
    const v2Parts = v2.split('.').map(n => parseInt(n) || 0);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Val = v1Parts[i] || 0;
      const v2Val = v2Parts[i] || 0;

      if (v1Val < v2Val) return -1;
      if (v1Val > v2Val) return 1;
    }
    return 0;
  }

  /**
   * Migrate config.json to profiles table
   * Migrates connection profiles from config.json to SQLite profiles table
   * Also migrates preferences to SQLite settings
   * Deletes config.json after successful migration
   */
  async migrateConfigJsonToProfiles() {
    try {
      const db = this.getDb();
      const { v4: uuidv4 } = require('uuid');
      const configPath = path.join(process.cwd(), 'config.json');

      // Check if config.json exists
      if (!fs.existsSync(configPath)) {
        // No config.json, nothing to migrate
        return;
      }

      // Check if profiles table already has data (skip if already migrated)
      const profileCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
      if (profileCount && profileCount.count > 0) {
        // Already migrated or profiles exist, skip migration
        // But still try to migrate preferences if needed
        await this.migrateConfigPreferences(configPath);
        return;
      }

      // Load config.json
      let config;
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configContent);
      } catch (error) {
        console.error('⚠️ Failed to load config.json:', error.message);
        return;
      }

      // Migrate each profile from config.json
      const now = new Date().toISOString();
      let migratedProfiles = [];

      if (config.profiles && typeof config.profiles === 'object') {
        for (const [profileKey, profile] of Object.entries(config.profiles)) {
          // Skip if password is empty (invalid profile)
          if (!profile.password) {
            continue;
          }

          const profileId = uuidv4();
          const isActive = profileKey === config.active_profile ? 1 : 0;
          const name = profileKey === 'default' ? 'Migrated' : (profile.name || profileKey);

          // Insert profile into SQLite
          db.prepare(`
            INSERT INTO profiles (id, name, platform_type, host, port, username, password,
                                  trust_certificate, snapshot_path, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            profileId,
            name,
            'Microsoft SQL Server',
            profile.host || 'localhost',
            profile.port || 1433,
            profile.username || '',
            profile.password,
            profile.trust_certificate !== false ? 1 : 0,
            profile.snapshot_path || '/var/opt/mssql/snapshots',
            isActive,
            now,
            now
          );

          migratedProfiles.push({
            name,
            host: profile.host || 'localhost',
            port: profile.port || 1433
          });

          console.log(`✅ Migrated profile "${name}" from config.json`);
        }
      }

      // Migrate preferences to SQLite settings
      await this.migrateConfigPreferences(configPath);

      // Add history entry for migration
      if (migratedProfiles.length > 0) {
        const historyEntry = {
          type: 'migrate_config_to_profiles',
          migratedProfiles: migratedProfiles,
          sourceFile: 'config.json',
          message: `Migrated ${migratedProfiles.length} connection profile(s) from config.json to SQLite`
        };
        await this.addHistoryEntry(historyEntry);
        console.log(`✅ Added history entry for config.json migration`);
      }

      // Delete config.json after successful migration
      try {
        fs.unlinkSync(configPath);
        console.log('✅ Deleted config.json after successful migration');
      } catch (error) {
        console.warn('⚠️ Failed to delete config.json after migration:', error.message);
        // Continue anyway - migration succeeded even if deletion failed
      }
    } catch (error) {
      console.error('⚠️ Failed to migrate config.json to profiles:', error.message);
      // Continue anyway - migration failures shouldn't prevent app from starting
    }
  }

  /**
   * Migrate preferences from config.json to SQLite settings
   * @param {string} configPath Path to config.json file
   */
  async migrateConfigPreferences(configPath) {
    try {
      if (!fs.existsSync(configPath)) {
        return;
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      if (config.preferences) {
        const settingsResult = await this.getSettings();
        const settings = settingsResult.success ? settingsResult.settings : {};

        // Migrate preferences
        if (config.preferences.max_history_entries !== undefined) {
          settings.maxHistoryEntries = config.preferences.max_history_entries;
        }
        // Note: theme preference is handled by frontend, not stored in backend

        await this.updateSettings(settings);
        console.log('✅ Migrated preferences from config.json');
      }
    } catch (error) {
      console.error('⚠️ Failed to migrate preferences from config.json:', error.message);
      // Continue anyway
    }
  }

  /**
   * Migrate environment variables to profiles table
   * Creates/updates a "Migrated" profile with current env vars
   */
  async migrateEnvVarsToProfiles() {
    try {
      const db = this.getDb();
      const { v4: uuidv4 } = require('uuid');

      // Check if we have env vars to migrate
      const hasEnvVars = process.env.SQL_SERVER && process.env.SQL_USERNAME && process.env.SQL_PASSWORD;

      if (!hasEnvVars) {
        console.log('ℹ️ No environment variables to migrate');
        return;
      }

      // Check if "Migrated" profile already exists
      const existingProfile = db.prepare('SELECT id FROM profiles WHERE name = ?').get('Migrated');

      const now = new Date().toISOString();
      const existingCreatedAt = existingProfile
        ? db.prepare('SELECT created_at FROM profiles WHERE name = ?').get('Migrated')?.created_at || now
        : now;

      const profileData = {
        id: existingProfile ? existingProfile.id : uuidv4(),
        name: 'Migrated',
        platform_type: 'Microsoft SQL Server',
        host: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT) || 1433,
        username: process.env.SQL_USERNAME || '',
        password: process.env.SQL_PASSWORD || '',
        trust_certificate: process.env.SQL_TRUST_CERTIFICATE === 'true' ? 1 : 1,
        snapshot_path: process.env.SNAPSHOT_PATH || '/var/opt/mssql/snapshots',
        is_active: 1, // Always set as active
        created_at: existingCreatedAt,
        updated_at: now
      };

      if (existingProfile) {
        // Update existing profile
        db.prepare(`
          UPDATE profiles
          SET platform_type = ?, host = ?, port = ?, username = ?, password = ?,
              trust_certificate = ?, snapshot_path = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(
          profileData.platform_type,
          profileData.host,
          profileData.port,
          profileData.username,
          profileData.password,
          profileData.trust_certificate,
          profileData.snapshot_path,
          profileData.is_active,
          profileData.updated_at,
          profileData.id
        );
        console.log('✅ Updated "Migrated" profile from environment variables');
      } else {
        // Deactivate all other profiles first
        db.prepare('UPDATE profiles SET is_active = 0').run();

        // Create new profile
        db.prepare(`
          INSERT INTO profiles (id, name, platform_type, host, port, username, password,
                                trust_certificate, snapshot_path, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          profileData.id,
          profileData.name,
          profileData.platform_type,
          profileData.host,
          profileData.port,
          profileData.username,
          profileData.password,
          profileData.trust_certificate,
          profileData.snapshot_path,
          profileData.is_active,
          profileData.created_at,
          profileData.updated_at
        );
        console.log('✅ Created "Migrated" profile from environment variables');
      }
    } catch (error) {
      console.error('⚠️ Failed to migrate environment variables to profiles:', error.message);
      // Continue anyway
    }
  }

  /**
   * Get active profile
   * @returns {Object|null} Active profile or null
   */
  getActiveProfile() {
    try {
      const db = this.getDb();
      const profile = db.prepare(`
        SELECT id, name, platform_type, host, port, username, password,
               trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at
        FROM profiles
        WHERE is_active = 1
        LIMIT 1
      `).get();

      if (!profile) {
        return null;
      }

      return {
        id: profile.id,
        name: profile.name,
        platformType: profile.platform_type,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        trustCertificate: profile.trust_certificate === 1,
        snapshotPath: profile.snapshot_path,
        description: profile.description || null,
        notes: profile.notes || null,
        isActive: profile.is_active === 1,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };
    } catch (error) {
      console.error('Error getting active profile:', error);
      return null;
    }
  }

  /**
   * Get all profiles (without passwords for security)
   * @returns {Array} Array of profiles
   */
  getProfiles() {
    try {
      const db = this.getDb();
      const profiles = db.prepare(`
        SELECT id, name, platform_type, host, port, username,
               trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at
        FROM profiles
        ORDER BY is_active DESC, name
      `).all();

      return profiles.map(p => ({
        id: p.id,
        name: p.name,
        platformType: p.platform_type,
        host: p.host,
        port: p.port,
        username: p.username,
        trustCertificate: p.trust_certificate === 1,
        snapshotPath: p.snapshot_path,
        description: p.description || null,
        notes: p.notes || null,
        isActive: p.is_active === 1,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));
    } catch (error) {
      console.error('Error getting profiles:', error);
      return [];
    }
  }

  /**
   * Get a single profile by ID (without password)
   * @param {string} profileId
   * @returns {Object|null} Profile or null
   */
  getProfile(profileId) {
    try {
      const db = this.getDb();
      const profile = db.prepare(`
        SELECT id, name, platform_type, host, port, username, password,
               trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at
        FROM profiles
        WHERE id = ?
      `).get(profileId);

      if (!profile) {
        return null;
      }

      return {
        id: profile.id,
        name: profile.name,
        platformType: profile.platform_type,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        trustCertificate: profile.trust_certificate === 1,
        snapshotPath: profile.snapshot_path,
        description: profile.description || null,
        notes: profile.notes || null,
        isActive: profile.is_active === 1,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  }

  /**
   * Create a new profile
   * @param {Object} profileData
   * @returns {Object} Result with success and profile
   */
  createProfile(profileData) {
    try {
      const db = this.getDb();
      const { v4: uuidv4 } = require('uuid');

      // If setting as active, deactivate all others first
      if (profileData.isActive) {
        db.prepare('UPDATE profiles SET is_active = 0').run();
      }

      const profileId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO profiles (id, name, platform_type, host, port, username, password,
                              trust_certificate, snapshot_path, description, notes, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profileId,
        profileData.name,
        profileData.platformType || 'Microsoft SQL Server',
        profileData.host,
        profileData.port,
        profileData.username,
        profileData.password,
        profileData.trustCertificate ? 1 : 0,
        profileData.snapshotPath || '/var/opt/mssql/snapshots',
        profileData.description || null,
        profileData.notes || null,
        profileData.isActive ? 1 : 0,
        now,
        now
      );

      return {
        success: true,
        profile: this.getProfile(profileId)
      };
    } catch (error) {
      console.error('Error creating profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update an existing profile
   * @param {string} profileId
   * @param {Object} profileData
   * @returns {Object} Result with success and profile
   */
  updateProfile(profileId, profileData) {
    try {
      const db = this.getDb();

      // Get existing profile to preserve password if not provided
      const existingProfile = db.prepare('SELECT password FROM profiles WHERE id = ?').get(profileId);
      if (!existingProfile) {
        return {
          success: false,
          error: 'Profile not found'
        };
      }

      // If setting as active, deactivate all others first
      if (profileData.isActive) {
        db.prepare('UPDATE profiles SET is_active = 0 WHERE id != ?').run(profileId);
      }

      const password = profileData.password !== undefined ? profileData.password : existingProfile.password;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE profiles
        SET name = ?, platform_type = ?, host = ?, port = ?, username = ?, password = ?,
            trust_certificate = ?, snapshot_path = ?, description = ?, notes = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        profileData.name,
        profileData.platformType || 'Microsoft SQL Server',
        profileData.host,
        profileData.port,
        profileData.username,
        password,
        profileData.trustCertificate ? 1 : 0,
        profileData.snapshotPath || '/var/opt/mssql/snapshots',
        profileData.description || null,
        profileData.notes || null,
        profileData.isActive ? 1 : 0,
        now,
        profileId
      );

      return {
        success: true,
        profile: this.getProfile(profileId)
      };
    } catch (error) {
      console.error('Error updating profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a profile
   * @param {string} profileId
   * @returns {Object} Result with success
   */
  deleteProfile(profileId) {
    try {
      const db = this.getDb();
      db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set a profile as active (deactivates all others)
   * @param {string} profileId
   * @returns {Object} Result with success
   */
  setActiveProfile(profileId) {
    try {
      const db = this.getDb();
      db.prepare('UPDATE profiles SET is_active = 0').run();
      const now = new Date().toISOString();
      db.prepare('UPDATE profiles SET is_active = 1, updated_at = ? WHERE id = ?').run(now, profileId);
      return { success: true };
    } catch (error) {
      console.error('Error setting active profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if metadata storage is properly initialized
   * @returns {boolean} True if initialized
   */
  async isInitialized() {
    try {
      const db = this.getDb();
      const result = db.prepare(`
        SELECT COUNT(*) as table_count
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('snapshot', 'history', 'groups', 'stats')
      `).get();

      return result.table_count === 4;
    } catch (error) {
      console.error('❌ Error checking metadata initialization:', error.message);
      return false;
    }
  }

  /**
   * Add a snapshot to metadata storage
   * @param {Object} snapshot Snapshot metadata
   * @returns {Object} Result
   */
  async addSnapshot(snapshot) {
    try {
      const db = this.getDb();

      const stmt = db.prepare(`
        INSERT INTO snapshot (
          snapshot_name,
          display_name,
          description,
          group_id,
          group_name,
          sequence,
          created_by,
          created_at,
          purpose,
          tags,
          database_count,
          database_snapshots
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        snapshot.id,
        snapshot.displayName,
        snapshot.description || '',
        snapshot.groupId,
        snapshot.groupName,
        snapshot.sequence,
        this.userName,
        snapshot.createdAt,
        snapshot.purpose || 'manual',
        JSON.stringify(snapshot.tags || []),
        snapshot.databaseCount,
        JSON.stringify(snapshot.databaseSnapshots || [])
      );

      return { success: true, mode: 'sqlite' };

    } catch (error) {
      console.error(`❌ Failed to add snapshot to metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all snapshots from metadata storage
   * @returns {Array} Array of snapshots
   */
  async getAllSnapshots() {
    try {
      const db = this.getDb();

      const rows = db.prepare(`
        SELECT
          snapshot_name as id,
          display_name as displayName,
          description,
          group_id as groupId,
          group_name as groupName,
          sequence,
          created_by as createdBy,
          created_at as createdAt,
          purpose,
          tags,
          database_count as databaseCount,
          database_snapshots as databaseSnapshots
        FROM snapshot
        ORDER BY created_at DESC
      `).all();

      // Parse JSON fields
      return rows.map(row => ({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : [],
        databaseSnapshots: row.databaseSnapshots ? JSON.parse(row.databaseSnapshots) : []
      }));

    } catch (error) {
      console.error(`❌ Failed to get snapshots from metadata: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a snapshot from metadata storage
   * @param {string} snapshotId Snapshot ID to delete
   * @returns {Object} Result
   */
  async deleteSnapshot(snapshotId) {
    try {
      const db = this.getDb();

      const result = db.prepare(`
        DELETE FROM snapshot WHERE snapshot_name = ?
      `).run(snapshotId);

      return { success: true, deleted: result.changes };

    } catch (error) {
      console.error(`❌ Failed to delete snapshot from metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add history entry to metadata storage (legacy method)
   * @param {Object} historyEntry History entry
   * @returns {Object} Result
   */
  async addHistory(historyEntry) {
    return this.addHistoryEntry(historyEntry);
  }

  /**
   * Add a history entry
   * @param {Object} historyEntry History entry object
   * @returns {Object} Result
   */
  async addHistoryEntry(historyEntry) {
    try {
      const db = this.getDb();

      const stmt = db.prepare(`
        INSERT INTO history (
          timestamp,
          type,
          user_name,
          group_name,
          snapshot_name,
          snapshot_id,
          sequence,
          details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        historyEntry.timestamp || new Date().toISOString(),
        historyEntry.type,
        this.userName,
        historyEntry.groupName || '',
        historyEntry.snapshotName || '',
        historyEntry.snapshotId || '',
        historyEntry.sequence || 0,
        JSON.stringify(historyEntry)
      );

      console.log(`✅ Added history entry to metadata database`);

      // Enforce max history entries limit
      const settingsResult = await this.getSettings();
      const maxEntries = settingsResult.settings?.maxHistoryEntries || 100;
      await this.trimHistoryEntries(maxEntries);

      return { success: true, mode: 'sqlite' };
    } catch (error) {
      console.error(`❌ Failed to add history entry: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get history from metadata storage
   * @param {number} limit Optional limit
   * @returns {Object} History result
   */
  async getHistory(limit) {
    try {
      const db = this.getDb();

      let query = `
        SELECT
          timestamp,
          type,
          user_name,
          group_name,
          snapshot_name,
          snapshot_id,
          sequence,
          details
        FROM history
        ORDER BY timestamp DESC
      `;

      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }

      const rows = db.prepare(query).all();

      const history = rows.map(row => {
        const entry = {
          timestamp: row.timestamp,
          type: row.type,
          userName: row.user_name,
          groupName: row.group_name,
          snapshotName: row.snapshot_name,
          snapshotId: row.snapshot_id,
          sequence: row.sequence
        };

        // Parse details if available
        if (row.details) {
          try {
            const details = JSON.parse(row.details);
            Object.assign(entry, details);
          } catch (e) {
            entry.details = row.details;
          }
        }

        return entry;
      });

      return { success: true, history };
    } catch (error) {
      console.error(`❌ Failed to get history: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trim history entries to specified count
   * @param {number} maxEntries Maximum number of entries to keep
   * @returns {Object} Result with trimmed count
   */
  async trimHistoryEntries(maxEntries) {
    try {
      const db = this.getDb();

      // Get current count
      const countResult = db.prepare('SELECT COUNT(*) as total_count FROM history').get();
      const currentCount = countResult.total_count;

      if (currentCount > maxEntries) {
        // Delete oldest entries
        db.prepare(`
          DELETE FROM history
          WHERE id IN (
            SELECT id FROM history
            ORDER BY timestamp ASC
            LIMIT ?
          )
        `).run(currentCount - maxEntries);

        const trimmed = currentCount - maxEntries;
        return { success: true, trimmed };
      }

      return { success: true, trimmed: 0 };
    } catch (error) {
      console.error(`❌ Failed to trim history entries: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all history entries
   */
  async clearHistory() {
    try {
      const db = this.getDb();
      db.prepare('DELETE FROM history').run();
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to clear history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get settings from metadata storage
   * @returns {Object} Settings result
   */
  async getSettings() {
    try {
      const db = this.getDb();

      const result = db.prepare(`
        SELECT stat_value FROM stats WHERE stat_name = 'settings'
      `).get();

      if (result) {
        const settings = JSON.parse(result.stat_value);
        return { success: true, settings };
      } else {
        // Return default settings
        const defaultSettings = {
          maxHistoryEntries: 100,
          defaultGroup: '',
          passwordHash: null,
          passwordSkipped: false
        };
        return { success: true, settings: defaultSettings };
      }
    } catch (error) {
      console.error(`❌ Failed to get settings: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update settings in metadata storage
   * @param {Object} settings Settings object
   * @returns {Object} Result
   */
  async updateSettings(settings) {
    try {
      const db = this.getDb();

      db.prepare(`
        INSERT OR REPLACE INTO stats (stat_name, stat_value, updated_at)
        VALUES ('settings', ?, ?)
      `).run(JSON.stringify(settings), new Date().toISOString());

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to update settings: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update stats in metadata storage
   * @param {Object} pool Unused (for compatibility)
   * @param {number} snapshotCount Current snapshot count
   */
  async updateStats(pool, snapshotCount) {
    try {
      const db = this.getDb();

      db.prepare(`
        INSERT OR REPLACE INTO stats (stat_name, stat_value, updated_at)
        VALUES ('snapshot_count', ?, ?)
      `).run(String(snapshotCount), new Date().toISOString());

    } catch (error) {
      console.error(`❌ Failed to update stats: ${error.message}`);
      // Don't throw - stats update failure shouldn't break the system
    }
  }

  /**
   * Get all groups from metadata storage
   * @returns {Array} Array of groups
   */
  async getAllGroups() {
    const result = await this.getGroups();
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve groups from database');
    }
    return result.groups;
  }

  /**
   * Get groups from metadata storage
   * @returns {Object} Groups result
   */
  async getGroups() {
    try {
      const db = this.getDb();

      const rows = db.prepare(`
        SELECT
          id,
          name,
          databases,
          created_by,
          created_at,
          updated_at
        FROM groups
        ORDER BY name
      `).all();

      const groups = rows.map(row => {
        const group = {
          id: row.id,
          name: row.name,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };

        // Parse databases if available
        if (row.databases) {
          try {
            group.databases = JSON.parse(row.databases);
          } catch (e) {
            group.databases = [];
          }
        } else {
          group.databases = [];
        }

        return group;
      });

      return { success: true, groups };
    } catch (error) {
      console.error(`❌ Failed to get groups: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a group in metadata storage
   * @param {Object} group Group object
   * @returns {Object} Result
   */
  async createGroup(group) {
    try {
      const db = this.getDb();

      db.prepare(`
        INSERT INTO groups (id, name, databases, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        group.id,
        group.name,
        JSON.stringify(group.databases || []),
        this.userName,
        new Date().toISOString(),
        new Date().toISOString()
      );

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to create group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a group in metadata storage
   * @param {string} groupId Group ID
   * @param {Object} group Group object
   */
  async updateGroup(groupId, group) {
    try {
      const db = this.getDb();

      db.prepare(`
        UPDATE groups
        SET name = ?, databases = ?, updated_at = ?
        WHERE id = ?
      `).run(
        group.name,
        JSON.stringify(group.databases || []),
        new Date().toISOString(),
        groupId
      );

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to update group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a group from metadata storage
   * @param {string} groupId Group ID
   */
  async deleteGroup(groupId) {
    try {
      const db = this.getDb();
      db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to delete group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get status of metadata storage
   * @returns {Object} Status result
   */
  async getStatus() {
    try {
      const isInit = await this.isInitialized();
      return {
        initialized: isInit,
        mode: 'sqlite',
        database: this.dbPath,
        userName: this.userName
      };
    } catch (error) {
      console.error(`❌ Failed to get status: ${error.message}`);
      return {
        initialized: false,
        mode: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check if metadata table mode is enabled
   * @returns {boolean} Always true
   */
  isMetadataTableMode() {
    return true;
  }

  /**
   * Perform sync (placeholder for compatibility)
   * @returns {Object} Sync result
   */
  async performSync() {
    return {
      success: true,
      resolved: [],
      message: 'Sync not needed in SQLite mode'
    };
  }

  // Compatibility methods that aren't needed but may be called

  async getSqlConfig() {
    // Not needed for SQLite but kept for compatibility
    return null;
  }

  async getPool() {
    // Return db for compatibility with code that expects a pool
    return this.getDb();
  }

  async addGroup(group) {
    // Alias for createGroup
    return this.createGroup(group);
  }

  /**
   * Get password status
   * @returns {Object} Password status
   */
  async getPasswordStatus() {
    try {
      const settingsResult = await this.getSettings();
      const settings = settingsResult.success ? settingsResult.settings : {};
      const passwordHash = settings.passwordHash || null;
      const passwordSkipped = settings.passwordSkipped || false;

      let status = 'not-set';
      if (passwordHash) {
        status = 'set';
      } else if (passwordSkipped) {
        status = 'skipped';
      }

      return {
        success: true,
        status,
        passwordSet: !!passwordHash,
        passwordSkipped
      };
    } catch (error) {
      console.error(`❌ Failed to get password status: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set password hash in settings
   * @param {string} passwordHash Bcrypt hash of password
   * @returns {Object} Result
   */
  async setPasswordHash(passwordHash) {
    try {
      const settingsResult = await this.getSettings();
      const settings = settingsResult.success ? settingsResult.settings : {};

      settings.passwordHash = passwordHash;
      settings.passwordSkipped = false; // Clear skip flag when setting password

      return await this.updateSettings(settings);
    } catch (error) {
      console.error(`❌ Failed to set password hash: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove password protection
   * @returns {Object} Result
   */
  async removePassword() {
    try {
      const settingsResult = await this.getSettings();
      const settings = settingsResult.success ? settingsResult.settings : {};


      settings.passwordHash = null;
      settings.passwordSkipped = true; // Mark as explicitly skipped

      return await this.updateSettings(settings);
    } catch (error) {
      console.error(`❌ Failed to remove password: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Skip password protection (first launch only)
   * @returns {Object} Result
   */
  async skipPassword() {
    try {
      const settingsResult = await this.getSettings();
      const settings = settingsResult.success ? settingsResult.settings : {};

      settings.passwordHash = null;
      settings.passwordSkipped = true;

      return await this.updateSettings(settings);
    } catch (error) {
      console.error(`❌ Failed to skip password: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MetadataStorage;
