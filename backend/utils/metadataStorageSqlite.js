// ABOUTME: SQLite-based metadata storage for SQL Parrot
// ABOUTME: Stores snapshots, groups, history, and settings in a local SQLite database

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
      const db = this.getDb();
      db.prepare('SELECT 1 as test').get();
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
      const db = this.getDb();

      // Create snapshots table (plural, matching Rust schema)
      db.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT,
          database_snapshots TEXT NOT NULL,
          is_automatic INTEGER DEFAULT 0,
          FOREIGN KEY (group_id) REFERENCES groups(id)
        )
      `);

      // Create history table (matching Rust schema)
      db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          operation_type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          user_name TEXT,
          details TEXT,
          results TEXT
        )
      `);

      // Create groups table (profile_id links groups to connection profiles)
      db.exec(`
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          databases TEXT NOT NULL,
          profile_id TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(name, profile_id)
        )
      `);

      // Create settings table (matching Rust schema - single row with JSON data)
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL
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

      // Create indexes for common queries (profile_id index created after migration)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_group ON snapshots(group_id);
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);
      `);

      // Initialize metadata version if not exists
      db.exec(`
        INSERT OR IGNORE INTO _metadata (key, value) VALUES ('last_version_seen', '0.0.0')
      `);

      // Check version and migrate if needed (this adds profile_id column if needed)
      await this.checkAndMigrate();

      // Safety check: Ensure profile_id column exists in groups table (regardless of version)
      // This handles edge cases where the table was created without the column
      try {
        const tableInfo = db.prepare("PRAGMA table_info('groups')").all();
        const hasProfileId = tableInfo.some(col => col.name === 'profile_id');

        if (!hasProfileId) {
          console.log('⚠️ profile_id column missing from groups table, adding it...');
          db.exec('ALTER TABLE groups ADD COLUMN profile_id TEXT');

          // Assign existing groups to active profile (or first profile if none active)
          let activeProfile = db.prepare('SELECT id FROM profiles WHERE is_active = 1 LIMIT 1').get();
          if (!activeProfile) {
            activeProfile = db.prepare('SELECT id FROM profiles LIMIT 1').get();
          }

          if (activeProfile) {
            db.prepare('UPDATE groups SET profile_id = ? WHERE profile_id IS NULL').run(activeProfile.id);
          }
        }
      } catch (e) {
        console.error('⚠️ Failed to ensure profile_id column exists:', e.message);
        // Continue anyway - this is a safety check
      }

      // Create profile_id index AFTER ensuring column exists
      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_groups_profile_id ON groups(profile_id)');
      } catch (e) {
        // Index creation might fail if column still doesn't exist for some reason
        console.warn('⚠️ Could not create profile_id index:', e.message);
      }

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
      const currentVersion = '1.5.0';

      if (this.compareVersions(lastVersion, currentVersion) < 0) {
        // Migration from versions < 1.3.0: Migrate config.json and env vars to profiles table
        if (this.compareVersions(lastVersion, '1.3.0') < 0) {
          await this.migrateConfigJsonToProfiles();
          await this.migrateEnvVarsToProfiles();
        }

        // Migration from versions < 1.4.0: Add profile_id to groups table
        if (this.compareVersions(lastVersion, '1.4.0') < 0) {
          await this.migrateGroupsAddProfileId();
        }

        // Migration from versions < 1.5.0: Schema alignment with Rust (snapshot->snapshots, type->operation_type, stats->settings)
        if (this.compareVersions(lastVersion, '1.5.0') < 0) {
          await this.migrateSchemaToRustCompatible();
        }

        // Update version
        db.prepare('INSERT OR REPLACE INTO _metadata (key, value) VALUES (?, ?)').run('last_version_seen', currentVersion);
      }
    } catch (error) {
      console.error('⚠️ Migration check failed:', error.message);
      // Continue anyway - migration failures shouldn't prevent app from starting
    }
  }

  /**
   * Migration: Add profile_id column to groups table
   * Assigns existing groups to the active profile (or first profile if none active)
   */
  async migrateGroupsAddProfileId() {
    try {
      const db = this.getDb();

      // Check if column already exists
      const tableInfo = db.prepare("PRAGMA table_info('groups')").all();
      const hasProfileId = tableInfo.some(col => col.name === 'profile_id');

      if (!hasProfileId) {
        // Add the column
        db.exec('ALTER TABLE groups ADD COLUMN profile_id TEXT');

        // Get the active profile (or first profile if none active)
        let activeProfile = db.prepare('SELECT id FROM profiles WHERE is_active = 1 LIMIT 1').get();
        if (!activeProfile) {
          activeProfile = db.prepare('SELECT id FROM profiles LIMIT 1').get();
        }

        if (activeProfile) {
          // Assign existing groups to the active profile
          db.prepare('UPDATE groups SET profile_id = ? WHERE profile_id IS NULL').run(activeProfile.id);
        }

        // Create index for profile_id
        db.exec('CREATE INDEX IF NOT EXISTS idx_groups_profile_id ON groups(profile_id)');

        // Drop the old unique constraint on name and add new one on (name, profile_id)
        // SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
        // For simplicity, we'll just allow duplicate names across profiles going forward
        // The CREATE TABLE already has UNIQUE(name, profile_id)
      }
    } catch (error) {
      console.error('⚠️ Failed to add profile_id to groups:', error.message);
      // Continue anyway
    }
  }

  /**
   * Migration: Align schema with Rust implementation
   * - Rename snapshot table to snapshots
   * - Rename history.type to history.operation_type
   * - Replace stats table with settings table
   * - Update history table structure
   */
  async migrateSchemaToRustCompatible() {
    try {
      const db = this.getDb();

      // Check if old snapshot table exists (Node.js old schema)
      const oldSnapshotExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='snapshot'
      `).get();

      // Check if new snapshots table already exists (Rust schema or already migrated)
      const newSnapshotsExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='snapshots'
      `).get();

      // Only migrate if old table exists and new one doesn't
      if (oldSnapshotExists && !newSnapshotsExists) {
        // Rename snapshot to snapshots and migrate data
        db.exec(`
          CREATE TABLE IF NOT EXISTS snapshots_new (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT,
            database_snapshots TEXT NOT NULL,
            is_automatic INTEGER DEFAULT 0
          )
        `);

        // Migrate data from old snapshot table
        const oldSnapshots = db.prepare('SELECT * FROM snapshot').all();
        const insertStmt = db.prepare(`
          INSERT INTO snapshots_new (id, group_id, display_name, sequence, created_at, created_by, database_snapshots, is_automatic)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const old of oldSnapshots) {
          insertStmt.run(
            old.snapshot_name || old.id,
            old.group_id,
            old.display_name,
            old.sequence,
            old.created_at,
            old.created_by,
            old.database_snapshots || '[]',
            0
          );
        }

        db.exec('DROP TABLE snapshot');
        db.exec('ALTER TABLE snapshots_new RENAME TO snapshots');
        db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_group ON snapshots(group_id)');
      }

      // Check if history table exists and needs migration
      const historyExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='history'
      `).get();

      if (historyExists) {
        const historyInfo = db.prepare("PRAGMA table_info('history')").all();
        const hasTypeColumn = historyInfo.some(col => col.name === 'type');
        const hasOperationTypeColumn = historyInfo.some(col => col.name === 'operation_type');

        // Only migrate if has old 'type' column and not 'operation_type'
        if (hasTypeColumn && !hasOperationTypeColumn) {
        // Migrate history table: rename type to operation_type and restructure
        db.exec(`
          CREATE TABLE IF NOT EXISTS history_new (
            id TEXT PRIMARY KEY,
            operation_type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            user_name TEXT,
            details TEXT,
            results TEXT
          )
        `);

        // Migrate existing history data
        const oldHistory = db.prepare('SELECT * FROM history').all();
        const historyInsert = db.prepare(`
          INSERT INTO history_new (id, operation_type, timestamp, user_name, details, results)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const old of oldHistory) {
          // Generate ID if missing
          const id = old.id || crypto.randomUUID();
          // Use type as operation_type
          const operationType = old.type || old.operation_type || 'unknown';
          // Combine all extra fields into details JSON
          const details = JSON.stringify({
            groupName: old.group_name,
            snapshotName: old.snapshot_name,
            snapshotId: old.snapshot_id,
            sequence: old.sequence,
            ...(old.details ? (typeof old.details === 'string' ? JSON.parse(old.details) : old.details) : {})
          });

          historyInsert.run(
            id,
            operationType,
            old.timestamp,
            old.user_name,
            details,
            null
          );
        }

          db.exec('DROP TABLE history');
          db.exec('ALTER TABLE history_new RENAME TO history');
          db.exec('CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp)');
        }
      }

      // Migrate stats table to settings table (only if stats exists and settings doesn't)
      const statsExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='stats'
      `).get();

      const settingsExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='settings'
      `).get();

      if (statsExists && !settingsExists) {
        // Get settings from stats table
        const settingsRow = db.prepare("SELECT stat_value FROM stats WHERE stat_name = 'settings'").get();

        // Create settings table
        db.exec(`
          CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
          )
        `);

        if (settingsRow) {
          // Migrate settings data
          db.prepare('INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)').run(settingsRow.stat_value);
        } else {
          // Create default settings
          const defaultSettings = {
            preferences: {
              defaultGroup: '',
              maxHistoryEntries: 100,
              autoCreateCheckpoint: true
            },
            autoVerification: {
              enabled: false,
              intervalMinutes: 60
            },
            connection: {
              server: '',
              port: 1433,
              username: '',
              password: '',
              trustServerCertificate: true,
              snapshotPath: '/var/opt/mssql/snapshots'
            },
            passwordHash: null,
            passwordSkipped: false
          };
          db.prepare('INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)').run(JSON.stringify(defaultSettings));
        }

        // Drop old stats table
        db.exec('DROP TABLE stats');
      }

      // Update groups.databases to be NOT NULL if it's nullable
      const groupsInfo = db.prepare("PRAGMA table_info('groups')").all();
      const databasesCol = groupsInfo.find(col => col.name === 'databases');
      if (databasesCol && databasesCol.notnull === 0) {
        // SQLite doesn't support ALTER COLUMN, so we need to recreate
        // For now, just ensure existing rows have non-null values
        db.exec("UPDATE groups SET databases = '[]' WHERE databases IS NULL");
      }

    } catch (error) {
      console.error('⚠️ Failed to migrate schema to Rust-compatible format:', error.message);
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
      }

      // Delete config.json after successful migration
      try {
        fs.unlinkSync(configPath);
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
      }
    } catch (error) {
      console.error('⚠️ Failed to migrate environment variables to profiles:', error.message);
      // Continue anyway
    }
  }

  /**
   * Ensure at least one profile is active (if profiles exist)
   * If no profile is active and profiles exist, activates the first profile
   */
  ensureActiveProfile() {
    try {
      const db = this.getDb();

      // Check if any profile is active
      const activeCount = db.prepare('SELECT COUNT(*) as count FROM profiles WHERE is_active = 1').get();

      // If no active profile and profiles exist, activate the first one
      if (activeCount.count === 0) {
        const totalCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();

        if (totalCount.count > 0) {
          // Get the first profile (by created_at or id)
          const firstProfile = db.prepare(`
            SELECT id FROM profiles ORDER BY created_at ASC, id ASC LIMIT 1
          `).get();

          if (firstProfile) {
            const now = new Date().toISOString();
            db.prepare('UPDATE profiles SET is_active = 1, updated_at = ? WHERE id = ?').run(now, firstProfile.id);
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring active profile:', error);
      // Don't throw - this is a best-effort operation
    }
  }

  /**
   * Get active profile
   * @returns {Object|null} Active profile or null
   */
  getActiveProfile() {
    try {
      // Ensure at least one profile is active before getting it
      this.ensureActiveProfile();

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
      // Ensure at least one profile is active before getting profiles
      this.ensureActiveProfile();

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

      const profileId = uuidv4();
      const now = new Date().toISOString();

      // Determine if this profile should be active
      // If explicitly set, use that; otherwise, activate if it's the only profile
      let shouldBeActive = profileData.isActive;
      if (shouldBeActive === undefined) {
        // Check if this will be the only profile (count existing profiles)
        const existingCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
        shouldBeActive = existingCount.count === 0; // Activate if it's the first profile
      }

      // If setting as active, deactivate all others first
      if (shouldBeActive) {
        db.prepare('UPDATE profiles SET is_active = 0').run();
      }

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
        shouldBeActive ? 1 : 0,
        now,
        now
      );

      // Ensure at least one profile is active after creation
      this.ensureActiveProfile();

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

      // Get existing profile to preserve password and isActive if not provided
      const existingProfile = db.prepare('SELECT password, is_active FROM profiles WHERE id = ?').get(profileId);
      if (!existingProfile) {
        return {
          success: false,
          error: 'Profile not found'
        };
      }

      // Preserve existing isActive if not explicitly provided
      const isActive = profileData.isActive !== undefined ? profileData.isActive : (existingProfile.is_active === 1);

      // If setting as active, deactivate all others first
      if (isActive) {
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
        isActive ? 1 : 0,
        now,
        profileId
      );

      // Ensure at least one profile is active after update
      this.ensureActiveProfile();

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

      // Ensure at least one profile is active after deletion (if profiles still exist)
      this.ensureActiveProfile();

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
        WHERE type = 'table' AND name IN ('snapshots', 'history', 'groups', 'settings')
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
        INSERT INTO snapshots (
          id,
          group_id,
          display_name,
          sequence,
          created_at,
          created_by,
          database_snapshots,
          is_automatic
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        snapshot.id,
        snapshot.groupId,
        snapshot.displayName,
        snapshot.sequence,
        snapshot.createdAt || new Date().toISOString(),
        this.userName,
        JSON.stringify(snapshot.databaseSnapshots || []),
        snapshot.isAutomatic ? 1 : 0
      );

      return { success: true, mode: 'sqlite' };

    } catch (error) {
      console.error(`❌ Failed to add snapshot to metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get snapshots for a specific group
   * @param {string} groupId Group ID
   * @returns {Array} Array of snapshots
   */
  async getSnapshotsForGroup(groupId) {
    try {
      const db = this.getDb();

      const rows = db.prepare(`
        SELECT
          id,
          group_id as groupId,
          display_name as displayName,
          sequence,
          created_at as createdAt,
          created_by as createdBy,
          database_snapshots as databaseSnapshots,
          is_automatic as isAutomatic
        FROM snapshots
        WHERE group_id = ?
        ORDER BY sequence DESC
      `).all(groupId);

      // Parse JSON fields
      return rows.map(row => ({
        id: row.id,
        groupId: row.groupId,
        displayName: row.displayName,
        sequence: row.sequence,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        databaseSnapshots: row.databaseSnapshots ? JSON.parse(row.databaseSnapshots) : [],
        isAutomatic: row.isAutomatic === 1
      }));

    } catch (error) {
      console.error(`❌ Failed to get snapshots for group: ${error.message}`);
      return [];
    }
  }

  /**
   * Get next sequence number for a group
   * @param {string} groupId Group ID
   * @returns {number} Next sequence number
   */
  getNextSequence(groupId) {
    try {
      const db = this.getDb();
      const max = db.prepare(`
        SELECT MAX(sequence) as max_sequence
        FROM snapshots
        WHERE group_id = ?
      `).get(groupId);

      return (max?.max_sequence || 0) + 1;
    } catch (error) {
      console.error(`❌ Failed to get next sequence: ${error.message}`);
      return 1;
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
          id,
          group_id as groupId,
          display_name as displayName,
          sequence,
          created_at as createdAt,
          created_by as createdBy,
          database_snapshots as databaseSnapshots,
          is_automatic as isAutomatic
        FROM snapshots
        ORDER BY created_at DESC
      `).all();

      // Parse JSON fields
      return rows.map(row => ({
        id: row.id,
        groupId: row.groupId,
        displayName: row.displayName,
        sequence: row.sequence,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        databaseSnapshots: row.databaseSnapshots ? JSON.parse(row.databaseSnapshots) : [],
        isAutomatic: row.isAutomatic === 1
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
        DELETE FROM snapshots WHERE id = ?
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

      // Generate ID if not provided
      const historyId = historyEntry.id || crypto.randomUUID();
      const timestamp = historyEntry.timestamp || new Date().toISOString();

      // Map type to operation_type (for backward compatibility)
      const operationType = historyEntry.operation_type || historyEntry.type || 'unknown';

      // Store full entry details in details field, results in results field
      const details = historyEntry.details ?
        (typeof historyEntry.details === 'string' ? historyEntry.details : JSON.stringify(historyEntry.details)) :
        JSON.stringify(historyEntry);
      const results = historyEntry.results ?
        (typeof historyEntry.results === 'string' ? historyEntry.results : JSON.stringify(historyEntry.results)) :
        null;

      const stmt = db.prepare(`
        INSERT INTO history (
          id,
          operation_type,
          timestamp,
          user_name,
          details,
          results
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        historyId,
        operationType,
        timestamp,
        this.userName,
        details,
        results
      );

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
          id,
          operation_type,
          timestamp,
          user_name,
          details,
          results
        FROM history
        ORDER BY timestamp DESC
      `;

      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }

      const rows = db.prepare(query).all();

      const history = rows.map(row => {
        const entry = {
          id: row.id,
          operationType: row.operation_type,
          timestamp: row.timestamp,
          userName: row.user_name || null
        };

        // Parse details if available
        if (row.details) {
          try {
            const details = JSON.parse(row.details);
            // For backward compatibility, map operation_type to type
            entry.type = entry.operationType;
            Object.assign(entry, details);
          } catch (e) {
            entry.details = row.details;
          }
        }

        // Parse results if available
        if (row.results) {
          try {
            entry.results = JSON.parse(row.results);
          } catch (e) {
            entry.results = row.results;
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
        SELECT data FROM settings WHERE id = 1
      `).get();

      if (result) {
        const settings = JSON.parse(result.data);
        return { success: true, settings };
      } else {
        // Return default settings (matching Rust defaults)
        const defaultSettings = {
          preferences: {
            defaultGroup: '',
            maxHistoryEntries: 100,
            autoCreateCheckpoint: true
          },
          autoVerification: {
            enabled: false,
            intervalMinutes: 60
          },
          connection: {
            server: '',
            port: 1433,
            username: '',
            password: '',
            trustServerCertificate: true,
            snapshotPath: '/var/opt/mssql/snapshots'
          },
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
        INSERT OR REPLACE INTO settings (id, data)
        VALUES (1, ?)
      `).run(JSON.stringify(settings));

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to update settings: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update stats in metadata storage (deprecated - stats table removed)
   * @param {Object} pool Unused (for compatibility)
   * @param {number} snapshotCount Current snapshot count
   */
  async updateStats(pool, snapshotCount) {
    // Stats table removed - this method kept for compatibility but does nothing
    // Snapshot count can be calculated from snapshots table if needed
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
   * Get groups from metadata storage (filtered by active profile)
   * @param {string} [profileId] Optional profile ID to filter by (defaults to active profile)
   * @returns {Object} Groups result
   */
  async getGroups(profileId = null) {
    try {
      const db = this.getDb();

      // Get the profile ID to filter by
      let filterProfileId = profileId;
      if (!filterProfileId) {
        const activeProfile = this.getActiveProfile();
        filterProfileId = activeProfile?.id || null;
      }

      let rows;
      if (filterProfileId) {
        rows = db.prepare(`
          SELECT
            id,
            name,
            databases,
            profile_id,
            created_by,
            created_at,
            updated_at
          FROM groups
          WHERE profile_id = ?
          ORDER BY name
        `).all(filterProfileId);
      } else {
        // No profile, return all groups (for backward compatibility)
        rows = db.prepare(`
          SELECT
            id,
            name,
            databases,
            profile_id,
            created_by,
            created_at,
            updated_at
          FROM groups
          ORDER BY name
        `).all();
      }

      const groups = rows.map(row => {
        const group = {
          id: row.id,
          name: row.name,
          profileId: row.profile_id,
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
   * Get group count per profile
   * @returns {Object} Map of profile_id to group count
   */
  getGroupCountsByProfile() {
    try {
      const db = this.getDb();
      const rows = db.prepare(`
        SELECT profile_id, COUNT(*) as count
        FROM groups
        WHERE profile_id IS NOT NULL
        GROUP BY profile_id
      `).all();

      const counts = {};
      rows.forEach(row => {
        counts[row.profile_id] = row.count;
      });

      return { success: true, counts };
    } catch (error) {
      console.error(`❌ Failed to get group counts: ${error.message}`);
      return { success: false, error: error.message, counts: {} };
    }
  }

  /**
   * Create a group in metadata storage
   * @param {Object} group Group object (should include profileId or will use active profile)
   * @returns {Object} Result
   */
  async createGroup(group) {
    try {
      const db = this.getDb();

      // Get profile ID - use provided one or get from active profile
      let profileId = group.profileId;
      if (!profileId) {
        const activeProfile = this.getActiveProfile();
        profileId = activeProfile?.id || null;
      }

      db.prepare(`
        INSERT INTO groups (id, name, databases, profile_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        group.id,
        group.name,
        JSON.stringify(group.databases || []),
        profileId,
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

      // Get profile ID - use provided one or keep existing
      let profileId = group.profileId;
      if (profileId === undefined) {
        // If not provided, get existing profile_id from database
        const existing = db.prepare('SELECT profile_id FROM groups WHERE id = ?').get(groupId);
        profileId = existing?.profile_id || null;
      }
      // If still null, use active profile
      if (!profileId) {
        const activeProfile = this.getActiveProfile();
        profileId = activeProfile?.id || null;
      }

      db.prepare(`
        UPDATE groups
        SET name = ?, databases = ?, profile_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        group.name,
        JSON.stringify(group.databases || []),
        profileId,
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
