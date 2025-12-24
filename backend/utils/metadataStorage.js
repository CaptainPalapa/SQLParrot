const sql = require('mssql');

/**
 * SQL Server Metadata Storage System for SQL Parrot
 *
 * This module provides SQL Server-based metadata storage:
 * - Uses dedicated SQL Server metadata tables in 'sqlparrot' database
 * - Requires SQL Server connection with CREATE DATABASE permissions
 * - Fails fast on startup if SQL Server connection is not available
 * - Provides multi-user support with audit trail
 *
 * Database Design:
 * - Creates dedicated "sqlparrot" database (separate from user databases)
 * - NEVER touches user databases - only reads from them
 * - Excludes "sqlparrot" database from all snapshot/restore operations
 */
class MetadataStorage {
  constructor() {
    this.userName = process.env.SQLPARROT_USER_NAME || 'unknown_user';
    this.metadataDatabaseName = 'sqlparrot';
    this.sqlConfig = null;
    this.pool = null;
    this.isConnecting = false;
    this.connectionError = null;

    console.log(`🔧 SQL Server Metadata Storage:`);
    console.log(`   SQLPARROT_USER_NAME = "${this.userName}"`);
    console.log(`   Metadata Database = "${this.metadataDatabaseName}"`);
  }

  /**
   * Get SQL Server configuration
   * @returns {Object} SQL Server config
   */
  async getSqlConfig() {
    if (!this.sqlConfig) {
      // Validate required environment variables
      const requiredVars = ['SQL_SERVER', 'SQL_PORT', 'SQL_USERNAME', 'SQL_PASSWORD'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);

      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      this.sqlConfig = {
        server: process.env.SQL_SERVER,
        port: parseInt(process.env.SQL_PORT),
        user: process.env.SQL_USERNAME,
        password: process.env.SQL_PASSWORD,
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true',
          enableArithAbort: true,
          requestTimeout: 30000,
          connectionTimeout: 30000
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        }
      };
    }
    return this.sqlConfig;
  }

  /**
   * Get a connection pool, creating or reconnecting as needed
   * This maintains a persistent pool instead of opening/closing for each request
   * @returns {ConnectionPool} SQL Server connection pool
   */
  async getPool() {
    // If we have a connected pool, return it
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    // If already connecting, wait for it
    if (this.isConnecting) {
      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getPool();
    }

    // Need to connect
    this.isConnecting = true;
    this.connectionError = null;

    try {
      const config = await this.getSqlConfig();

      // Close existing pool if any
      if (this.pool) {
        try {
          await this.pool.close();
        } catch (e) {
          // Ignore close errors
        }
        this.pool = null;
      }

      this.pool = await sql.connect(config);
      console.log('✅ SQL Server connection pool established');
      return this.pool;
    } catch (error) {
      this.connectionError = error.message;
      console.error('❌ Failed to establish connection pool:', error.message);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Close the connection pool (call on app shutdown)
   */
  async closePool() {
    if (this.pool) {
      try {
        await this.pool.close();
        console.log('🔌 SQL Server connection pool closed');
      } catch (e) {
        // Ignore close errors
      }
      this.pool = null;
    }
  }

  /**
   * Test SQL Server connection
   * @returns {Object} Connection test result
   */
  async testConnection() {
    try {
      console.log('🔍 Testing SQL Server connection...');
      const pool = await this.getPool();

      // Test basic connectivity
      await pool.request().query('SELECT 1 as test');

      console.log('✅ SQL Server connection successful');
      return { success: true, message: 'SQL Server connection successful' };
    } catch (error) {
      console.error('❌ SQL Server connection failed:', error.message);
      throw new Error(`SQL Server connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize metadata database and tables
   * @returns {Object} Initialization result
   */
  async initialize() {
    try {
      console.log('🚀 Initializing SQL Server metadata storage...');
      const pool = await this.getPool();

      // Create metadata database if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${this.metadataDatabaseName}')
        BEGIN
          CREATE DATABASE [${this.metadataDatabaseName}]
          PRINT 'Created metadata database: ${this.metadataDatabaseName}'
        END
        ELSE
          PRINT 'Metadata database already exists: ${this.metadataDatabaseName}'
      `);

      // Switch to metadata database
      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      // Create snapshot metadata table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[snapshot]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[snapshot] (
            [id] INT IDENTITY(1,1) PRIMARY KEY,
            [snapshot_name] NVARCHAR(255) NOT NULL UNIQUE,
            [display_name] NVARCHAR(255) NOT NULL,
            [description] NVARCHAR(MAX),
            [group_id] NVARCHAR(255) NOT NULL,
            [group_name] NVARCHAR(255) NOT NULL,
            [sequence] INT NOT NULL,
            [created_by] NVARCHAR(255) NOT NULL,
            [created_at] DATETIME2 NOT NULL,
            [purpose] NVARCHAR(50) DEFAULT 'manual',
            [tags] NVARCHAR(MAX),
            [database_count] INT DEFAULT 0,
            [database_snapshots] NVARCHAR(MAX)
          )
          PRINT 'Created snapshot metadata table'
        END
        ELSE
          PRINT 'Snapshot metadata table already exists'
      `);

      // Create history table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[history]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[history] (
            [id] INT IDENTITY(1,1) PRIMARY KEY,
            [timestamp] DATETIME2 NOT NULL,
            [type] NVARCHAR(50) NOT NULL,
            [user_name] NVARCHAR(255) NOT NULL,
            [group_name] NVARCHAR(255),
            [snapshot_name] NVARCHAR(255),
            [snapshot_id] NVARCHAR(255),
            [sequence] INT,
            [details] NVARCHAR(MAX)
          )
          PRINT 'Created history table'
        END
        ELSE
          PRINT 'History table already exists'
      `);

      // Create groups table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[groups]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[groups] (
            [id] NVARCHAR(255) PRIMARY KEY,
            [name] NVARCHAR(255) NOT NULL UNIQUE,
            [databases] NVARCHAR(MAX),
            [created_by] NVARCHAR(255) NOT NULL,
            [created_at] DATETIME2 NOT NULL,
            [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
          )
          PRINT 'Created groups table'
        END
        ELSE
          PRINT 'Groups table already exists'
      `);

      // Create stats table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[stats]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[stats] (
            [id] INT IDENTITY(1,1) PRIMARY KEY,
            [stat_name] NVARCHAR(100) NOT NULL UNIQUE,
            [stat_value] NVARCHAR(MAX),
            [updated_at] DATETIME2 NOT NULL DEFAULT GETDATE()
          )
          PRINT 'Created stats table'
        END
        ELSE
          PRINT 'Stats table already exists'
      `);

      console.log('✅ SQL Server metadata storage initialized successfully');
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
      const pool = await this.getPool();

      // Check if database exists
      const dbResult = await pool.request().query(`
        SELECT name FROM sys.databases WHERE name = '${this.metadataDatabaseName}'
      `);

      if (dbResult.recordset.length === 0) {

        return false;
      }

      // Switch to metadata database and check tables
      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const tableResult = await pool.request().query(`
        SELECT COUNT(*) as table_count
        FROM sys.objects
        WHERE type = 'U' AND name IN ('snapshot', 'history', 'groups', 'stats')
      `);

      return tableResult.recordset[0].table_count === 4;
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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        INSERT INTO [dbo].[snapshot] (
          [snapshot_name],
          [display_name],
          [description],
          [group_id],
          [group_name],
          [sequence],
          [created_by],
          [created_at],
          [purpose],
          [tags],
          [database_count],
          [database_snapshots]
        ) VALUES (
          '${snapshot.id}',
          '${snapshot.displayName}',
          '${(snapshot.description || '').replace(/'/g, "''")}',
          '${snapshot.groupId}',
          '${snapshot.groupName}',
          ${snapshot.sequence},
          '${this.userName}',
          '${snapshot.createdAt}',
          '${snapshot.purpose || 'manual'}',
          '${JSON.stringify(snapshot.tags || []).replace(/'/g, "''")}',
          ${snapshot.databaseCount},
          '${JSON.stringify(snapshot.databaseSnapshots || []).replace(/'/g, "''")}'
        )
      `);

      return { success: true, mode: 'sql' };

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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
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
        FROM [dbo].[snapshot]
        ORDER BY created_at DESC
      `);

      // Parse JSON fields
      const snapshots = result.recordset.map(row => ({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : [],
        databaseSnapshots: row.databaseSnapshots ? JSON.parse(row.databaseSnapshots) : []
      }));

      return snapshots;

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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        DELETE FROM [dbo].[snapshot]
        WHERE snapshot_name = '${snapshotId}'
      `);

      return { success: true, deleted: result.rowsAffected[0] };

    } catch (error) {
      console.error(`❌ Failed to delete snapshot from metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add history entry to metadata storage
   * @param {Object} historyEntry History entry
   * @returns {Object} Result
   */
  async addHistory(historyEntry) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        INSERT INTO [dbo].[history] (
          [timestamp],
          [type],
          [user_name],
          [group_name],
          [snapshot_name],
          [snapshot_id],
          [sequence],
          [details]
        ) VALUES (
          '${historyEntry.timestamp || new Date().toISOString()}',
          '${historyEntry.type}',
          '${this.userName}',
          '${historyEntry.groupName || ''}',
          '${historyEntry.snapshotName || ''}',
          '${historyEntry.snapshotId || ''}',
          ${historyEntry.sequence || 'NULL'},
          '${JSON.stringify(historyEntry.details || {}).replace(/'/g, "''")}'
        )
      `);

      return { success: true, mode: 'sql' };

    } catch (error) {
      console.error(`❌ Failed to add history entry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get history entries from metadata storage
   * @param {number} limit Maximum number of entries to return
   * @returns {Array} Array of history entries
   */
  async getHistory(limit = 100) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT TOP ${limit}
          timestamp,
          type,
          user_name as userName,
          group_name as groupName,
          snapshot_name as snapshotName,
          snapshot_id as snapshotId,
          sequence,
          details
        FROM [dbo].[history]
        ORDER BY timestamp DESC
      `);

      // Parse JSON fields
      const history = result.recordset.map(row => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : {}
      }));

      return history;

    } catch (error) {
      console.error(`❌ Failed to get history from metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update stats in metadata storage
   * @param {Object} pool SQL Server connection pool
   * @param {number} snapshotCount Current snapshot count
   */
  async updateStats(pool, snapshotCount) {
    try {
      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        MERGE [dbo].[stats] AS target
        USING (SELECT 'snapshot_count' as stat_name, '${snapshotCount}' as stat_value) AS source
        ON target.stat_name = source.stat_name
        WHEN MATCHED THEN
          UPDATE SET stat_value = source.stat_value, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (stat_name, stat_value, updated_at)
          VALUES (source.stat_name, source.stat_value, GETDATE());
      `);

    } catch (error) {
      console.error(`❌ Failed to update stats: ${error.message}`);
      // Don't throw - stats update failure shouldn't break the system
    }
  }

  /**
   * Get settings from metadata storage
   * @returns {Object} Settings object
   */
  async getSettings() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT stat_name, stat_value
        FROM [dbo].[stats]
        WHERE stat_name LIKE 'setting_%'
      `);

      const settings = { preferences: { maxHistoryEntries: 100 } };
      result.recordset.forEach(row => {
        const key = row.stat_name.replace('setting_', '');
        settings[key] = row.stat_value;
      });

      return settings;

    } catch (error) {
      console.error(`❌ Failed to get settings from metadata: ${error.message}`);
      return { preferences: { maxHistoryEntries: 100 } };
    }
  }

  /**
   * Update settings in metadata storage
   * @param {Object} settings Settings object
   */
  async updateSettings(settings) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      for (const [key, value] of Object.entries(settings)) {
        await pool.request().query(`
          MERGE [dbo].[stats] AS target
          USING (SELECT 'setting_${key}' as stat_name, '${JSON.stringify(value).replace(/'/g, "''")}' as stat_value) AS source
          ON target.stat_name = source.stat_name
          WHEN MATCHED THEN
            UPDATE SET stat_value = source.stat_value, updated_at = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (stat_name, stat_value, updated_at)
            VALUES (source.stat_name, source.stat_value, GETDATE());
        `);
      }

    } catch (error) {
      console.error(`❌ Failed to update settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all groups from metadata storage
   * @returns {Array} Array of groups
   */
  async getAllGroups() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT DISTINCT group_id as id, group_name as name
        FROM [dbo].[snapshot]
        ORDER BY group_name
      `);

      const groups = result.recordset.map(row => ({
        id: row.id,
        name: row.name,
        databases: [], // Will be populated separately
        createdAt: new Date().toISOString()
      }));

      return groups;

    } catch (error) {
      console.error(`❌ Failed to get groups from metadata: ${error.message}`);
      return [];
    }
  }

  /**
   * Add a group to metadata storage
   * @param {Object} group Group object
   */
  async addGroup(group) {
    // Groups are stored implicitly through snapshots
    // This is a placeholder for compatibility
    return { success: true };
  }

  /**
   * Update a group in metadata storage
   * @param {string} groupId Group ID
   * @param {Object} group Group object
   */
  async updateGroup(groupId, group) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        UPDATE [dbo].[groups]
        SET
          [name] = '${group.name.replace(/'/g, "''")}',
          [databases] = '${JSON.stringify(group.databases || []).replace(/'/g, "''")}',
          [updated_at] = GETDATE()
        WHERE [id] = '${groupId}'
      `);

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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        DELETE FROM [dbo].[groups] WHERE [id] = '${groupId}'
      `);

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to delete group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all history entries
   */
  async clearHistory() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`DELETE FROM [dbo].[history]`);

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to clear history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if metadata table mode is enabled
   * @returns {boolean} Always true - SQL Server is required
   */
  isMetadataTableMode() {
    return true;
  }

  /**
   * Add a history entry
   * @param {Object} historyEntry History entry object
   * @returns {Object} Result
   */
  async addHistoryEntry(historyEntry) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        INSERT INTO [dbo].[history] (
          [timestamp],
          [type],
          [user_name],
          [group_name],
          [snapshot_name],
          [snapshot_id],
          [sequence],
          [details]
        ) VALUES (
          '${historyEntry.timestamp}',
          '${historyEntry.type}',
          '${this.userName}',
          '${historyEntry.groupName || ''}',
          '${historyEntry.snapshotName || ''}',
          '${historyEntry.snapshotId || ''}',
          ${historyEntry.sequence || 0},
          '${JSON.stringify(historyEntry).replace(/'/g, "''")}'
        )
      `);

      return { success: true, mode: 'sql' };
    } catch (error) {
      console.error(`❌ Failed to add history entry: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get settings from metadata storage
   * @returns {Object} Settings result
   */
  async getSettings() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT stat_value FROM [dbo].[stats] WHERE stat_name = 'settings'
      `);

      if (result.recordset.length > 0) {
        const settings = JSON.parse(result.recordset[0].stat_value);
        return { success: true, settings };
      } else {
        // Return default settings
        const defaultSettings = {
          maxHistoryEntries: 100,
          defaultGroup: '',
          autoVerificationEnabled: false,
          autoVerificationIntervalMinutes: 15
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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        MERGE [dbo].[stats] AS target
        USING (SELECT 'settings' AS stat_name, '${JSON.stringify(settings).replace(/'/g, "''")}' AS stat_value) AS source
        ON target.stat_name = source.stat_name
        WHEN MATCHED THEN
          UPDATE SET stat_value = source.stat_value, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (stat_name, stat_value) VALUES (source.stat_name, source.stat_value);
      `);

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to update settings: ${error.message}`);
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
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      // Get current count
      const countResult = await pool.request().query(`
        SELECT COUNT(*) as total_count FROM [dbo].[history]
      `);
      const currentCount = countResult.recordset[0].total_count;

      if (currentCount > maxEntries) {
        // Delete oldest entries
        await pool.request().query(`
          DELETE FROM [dbo].[history]
          WHERE id IN (
            SELECT TOP (${currentCount - maxEntries}) id
            FROM [dbo].[history]
            ORDER BY timestamp ASC
          )
        `);

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
   * Get all groups from metadata storage
   * @returns {Object} Groups result
   */
  async getGroups() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT
          id,
          name,
          databases,
          created_by,
          created_at,
          updated_at
        FROM [dbo].[groups]
        ORDER BY name
      `);

      const groups = result.recordset.map(row => {
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
   * Get all groups (alias for compatibility)
   * @returns {Array} Array of groups
   * @throws {Error} If database connection fails
   */
  async getAllGroups() {
    const result = await this.getGroups();
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve groups from database');
    }
    return result.groups;
  }

  /**
   * Create a group in metadata storage
   * @param {Object} group Group object
   * @returns {Object} Result
   */
  async createGroup(group) {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      await pool.request().query(`
        INSERT INTO [dbo].[groups] (
          [id],
          [name],
          [databases],
          [created_by],
          [created_at]
        ) VALUES (
          '${group.id}',
          '${group.name.replace(/'/g, "''")}',
          '${JSON.stringify(group.databases || []).replace(/'/g, "''")}',
          '${this.userName}',
          '${new Date().toISOString()}'
        )
      `);

      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to create group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get history from metadata storage
   * @returns {Object} History result
   */
  async getHistory() {
    try {
      const pool = await this.getPool();

      await pool.request().query(`USE [${this.metadataDatabaseName}]`);

      const result = await pool.request().query(`
        SELECT
          timestamp,
          type,
          user_name,
          group_name,
          snapshot_name,
          snapshot_id,
          sequence,
          details
        FROM [dbo].[history]
        ORDER BY timestamp DESC
      `);

      const history = result.recordset.map(row => {
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
            // If parsing fails, just use the raw details
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
   * Get status of metadata storage
   * @returns {Object} Status result
   */
  async getStatus() {
    try {
      const isInit = await this.isInitialized();
      return {
        initialized: isInit,
        mode: 'sql',
        database: this.metadataDatabaseName,
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
   * Perform sync between SQL Server and JSON (placeholder)
   * @param {Object} pool SQL connection pool
   * @returns {Object} Sync result
   */
  async performSync(pool) {
    // Placeholder for compatibility
    return {
      success: true,
      resolved: [],
      message: 'Sync not implemented in SQL-only mode'
    };
  }

}

module.exports = MetadataStorage;
