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

      // Create indexes for common queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshot_group_id ON snapshot(group_id);
        CREATE INDEX IF NOT EXISTS idx_snapshot_created_at ON snapshot(created_at);
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_history_type ON history(type);
      `);

      console.log('✅ SQLite metadata storage initialized successfully');
      return { success: true, message: 'Metadata storage initialized' };

    } catch (error) {
      console.error('❌ Failed to initialize metadata storage:', error.message);
      throw new Error(`Metadata storage initialization failed: ${error.message}`);
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
          defaultGroup: ''
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
}

module.exports = MetadataStorage;
