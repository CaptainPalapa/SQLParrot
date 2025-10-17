const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Data file paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.json');

// Helper functions
async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return null;
  }
}

async function writeJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

async function addToHistory(operation) {
  try {
    const history = await readJsonFile(HISTORY_FILE) || { operations: [] };
    history.operations.unshift({
      ...operation,
      timestamp: new Date().toISOString()
    });
    // Keep only last 100 operations
    history.operations = history.operations.slice(0, 100);
    await writeJsonFile(HISTORY_FILE, history);
  } catch (error) {
    console.error('Error adding to history:', error);
  }
}

// Snapshot management functions
async function getSnapshotsData() {
  return await readJsonFile(SNAPSHOTS_FILE) || { snapshots: [], metadata: { version: "1.0", lastUpdated: null } };
}

async function saveSnapshotsData(data) {
  data.metadata.lastUpdated = new Date().toISOString();
  return await writeJsonFile(SNAPSHOTS_FILE, data);
}

function generateSnapshotId(groupName, sequence) {
  // Clean group name: lowercase, no spaces or special characters
  const cleanGroupName = groupName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanGroupName}_${sequence.toString().padStart(2, '0')}`;
}

function generateDisplayName(snapshotName) {
  // Convert user input to display-friendly name
  return snapshotName.trim();
}

async function getNextSequenceForGroup(groupId) {
  const snapshotsData = await getSnapshotsData();
  const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === groupId);
  return groupSnapshots.length + 1;
}

async function deleteAllSnapshots() {
  try {
    const config = await getSqlConfig();
    if (!config) {
      throw new Error('No SQL Server configuration found');
    }

    const pool = await sql.connect(config);

    // Get all snapshot databases
    const result = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const deletedSnapshots = [];
    for (const db of result.recordset) {
      try {
        await pool.request().query(`DROP DATABASE [${db.name}]`);
        deletedSnapshots.push(db.name);
      } catch (error) {
        console.error(`Error deleting snapshot ${db.name}:`, error.message);
      }
    }

    await pool.close();

    // Clear snapshots.json
    await saveSnapshotsData({ snapshots: [], metadata: { version: "1.0", lastUpdated: new Date().toISOString() } });

    return deletedSnapshots;
  } catch (error) {
    console.error('Error deleting all snapshots:', error);
    throw error;
  }
}

async function deleteGroupSnapshots(groupId) {
  try {
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === groupId);

    if (groupSnapshots.length === 0) {
      return { deletedCount: 0, deletedSnapshots: [] };
    }

    const config = await getSqlConfig();
    if (!config) {
      throw new Error('No SQL Server configuration found');
    }

    const pool = await sql.connect(config);
    const deletedSnapshots = [];

    for (const snapshot of groupSnapshots) {
      for (const dbSnapshot of snapshot.databaseSnapshots) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          deletedSnapshots.push(dbSnapshot.snapshotName);
        } catch (error) {
          console.error(`Error deleting snapshot ${dbSnapshot.snapshotName}:`, error.message);
        }
      }
    }

    await pool.close();

    // Remove from snapshots.json
    snapshotsData.snapshots = snapshotsData.snapshots.filter(s => s.groupId !== groupId);
    await saveSnapshotsData(snapshotsData);

    return { deletedCount: deletedSnapshots.length, deletedSnapshots };
  } catch (error) {
    console.error('Error deleting group snapshots:', error);
    throw error;
  }
}

async function cleanupOrphanedSnapshots() {
  try {
    console.log('Checking for orphaned snapshots on startup...');
    const config = await getFreshSqlConfig();
    if (!config) {
      console.log('No SQL Server configuration found, skipping orphan cleanup');
      return { cleaned: 0, orphans: [] };
    }

    const pool = await sql.connect(config);

    // Get all snapshot databases
    const result = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const orphanedSnapshots = [];
    const cleanedSnapshots = [];

    for (const db of result.recordset) {
      try {
        // Try to query the database to see if it's accessible
        // If the files are missing, this will fail
        await pool.request().query(`SELECT 1 FROM [${db.name}].sys.tables`);

        // If we get here, the database is accessible
        console.log(`Snapshot ${db.name} is accessible`);
      } catch (error) {
        // Database is orphaned (files missing)
        console.log(`Detected orphaned snapshot: ${db.name} (${error.message})`);
        orphanedSnapshots.push(db.name);

        try {
          // Drop the orphaned database
          await pool.request().query(`DROP DATABASE [${db.name}]`);
          cleanedSnapshots.push(db.name);
          console.log(`Cleaned up orphaned snapshot: ${db.name}`);
        } catch (dropError) {
          console.error(`Failed to drop orphaned snapshot ${db.name}:`, dropError.message);
        }
      }
    }

    await pool.close();

    if (cleanedSnapshots.length > 0) {
      await addToHistory({
        type: 'startup_orphan_cleanup',
        deletedCount: cleanedSnapshots.length,
        deletedSnapshots: cleanedSnapshots.slice(0, 10)
      });

      console.log(`Startup cleanup completed: removed ${cleanedSnapshots.length} orphaned snapshots`);
    } else {
      console.log('No orphaned snapshots found');
    }

    return { cleaned: cleanedSnapshots.length, orphans: orphanedSnapshots };
  } catch (error) {
    console.error('Error during startup orphan cleanup:', error);
    return { cleaned: 0, orphans: [], error: error.message };
  }
}

// SQL Server connection
let sqlConfig = null;

async function getSqlConfig() {
  if (!sqlConfig) {
    // Use environment variables for sensitive data, fallback to settings file for non-sensitive
    const settings = await readJsonFile(SETTINGS_FILE);

    sqlConfig = {
      server: process.env.SQL_SERVER || settings?.connection?.server || 'localhost',
      port: parseInt(process.env.SQL_PORT) || settings?.connection?.port || 1433,
      user: process.env.SQL_USERNAME || settings?.connection?.username || '',
      password: process.env.SQL_PASSWORD || settings?.connection?.password || '',
      database: 'master',
      options: {
        encrypt: false,
        trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' ||
                                settings?.connection?.trustServerCertificate || true
      }
    };
  }
  return sqlConfig;
}

// Force fresh SQL config for unmanaged snapshots
async function getFreshSqlConfig() {
  const settings = await readJsonFile(SETTINGS_FILE);
  return {
    server: process.env.SQL_SERVER || settings?.connection?.server || 'localhost',
    port: parseInt(process.env.SQL_PORT) || settings?.connection?.port || 1433,
    user: process.env.SQL_USERNAME || settings?.connection?.username || '',
    password: process.env.SQL_PASSWORD || settings?.connection?.password || '',
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' ||
                              settings?.connection?.trustServerCertificate || true
    }
  };
}

// Routes

// Get all groups
app.get('/api/groups', async (req, res) => {
  try {
    const data = await readJsonFile(GROUPS_FILE);
    res.json(data || { groups: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read groups' });
  }
});

// Create a new group
app.post('/api/groups', async (req, res) => {
  try {
    const { name, databases } = req.body;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };

    const newGroup = {
      id: `group-${Date.now()}`,
      name,
      databases: databases || []
    };

    data.groups.push(newGroup);
    await writeJsonFile(GROUPS_FILE, data);

    await addToHistory({
      type: 'create_group',
      groupName: name,
      databaseCount: databases?.length || 0
    });

    res.json(newGroup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a group
app.put('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, databases, deleteSnapshots = false } = req.body;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };

    const groupIndex = data.groups.findIndex(g => g.id === id);
    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const originalGroup = data.groups[groupIndex];

    // Check if snapshots exist and changes were made
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === id);
    const hasSnapshots = groupSnapshots.length > 0;

    const nameChanged = originalGroup.name !== name;
    const databasesChanged = JSON.stringify(originalGroup.databases.sort()) !== JSON.stringify(databases.sort());
    const hasChanges = nameChanged || databasesChanged;

    if (hasSnapshots && hasChanges && !deleteSnapshots) {
      return res.status(400).json({
        error: 'Group modifications require snapshot deletion',
        requiresConfirmation: true,
        snapshotCount: groupSnapshots.length,
        databaseCount: originalGroup.databases.length,
        totalSnapshots: groupSnapshots.length * originalGroup.databases.length
      });
    }

    // Delete snapshots if confirmed
    if (hasSnapshots && hasChanges && deleteSnapshots) {
      await deleteGroupSnapshots(id);
    }

    data.groups[groupIndex] = { ...data.groups[groupIndex], name, databases };
    await writeJsonFile(GROUPS_FILE, data);

    await addToHistory({
      type: 'update_group',
      groupName: name,
      databaseCount: databases?.length || 0,
      snapshotsDeleted: hasSnapshots && hasChanges ? groupSnapshots.length : 0
    });

    res.json(data.groups[groupIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete a group
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };

    const groupIndex = data.groups.findIndex(g => g.id === id);
    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const deletedGroup = data.groups[groupIndex];

    // Delete all snapshots for this group
    const snapshotResult = await deleteGroupSnapshots(id);

    data.groups.splice(groupIndex, 1);
    await writeJsonFile(GROUPS_FILE, data);

    await addToHistory({
      type: 'delete_group',
      groupName: deletedGroup.name,
      snapshotsDeleted: snapshotResult.deletedCount
    });

    res.json({
      success: true,
      snapshotsDeleted: snapshotResult.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Get settings (without sensitive data)
app.get('/api/settings', async (req, res) => {
  try {
    const data = await readJsonFile(SETTINGS_FILE);
    // Return settings but mask sensitive data
    const safeSettings = {
      ...data,
      connection: {
        ...data?.connection,
        username: data?.connection?.username ? '***masked***' : '',
        password: data?.connection?.password ? '***masked***' : ''
      }
    };
    res.json(safeSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Update settings (only non-sensitive data)
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    // Don't store sensitive data in settings file
    const safeSettings = {
      ...settings,
      connection: {
        ...settings.connection,
        username: '', // Don't store username in file
        password: ''  // Don't store password in file
      }
    };
    await writeJsonFile(SETTINGS_FILE, safeSettings);
    sqlConfig = null; // Reset SQL config to reload
    res.json(safeSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Test SQL Server connection
app.post('/api/test-connection', async (req, res) => {
  try {
    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);

    // Test basic connection
    await pool.request().query('SELECT 1 as test');

    // Get database count (user databases only)
    let databaseCount = 0;
    try {
      const dbResult = await pool.request().query(`
        SELECT COUNT(*) as database_count
        FROM sys.databases
        WHERE database_id > 4
        AND state = 0  -- Only online databases
      `);
      databaseCount = dbResult.recordset[0].database_count;
    } catch (dbError) {
      console.log('Could not get database count:', dbError.message);
      // Continue without database count
    }

    await pool.close();

    res.json({
      success: true,
      message: databaseCount > 0 ?
        `Connection successful - ${databaseCount} databases found` :
        'Connection successful',
      databaseCount: databaseCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get databases list
app.get('/api/databases', async (req, res) => {
  try {
    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);

    // Get user databases (exclude system databases and snapshots)
    const result = await pool.request().query(`
      SELECT
        name,
        database_id,
        create_date,
        collation_name
      FROM sys.databases
      WHERE database_id > 4  -- Exclude system databases (master, tempdb, model, msdb)
      AND state = 0  -- Only online databases
      AND source_database_id IS NULL  -- Exclude snapshot databases
      ORDER BY name
    `);

    await pool.close();

    // Categorize databases
    const databases = result.recordset.map(db => {
      let category = 'User';
      if (db.name.toLowerCase().includes('global')) {
        category = 'Global';
      } else if (db.name.toLowerCase().includes('dw') || db.name.toLowerCase().includes('datawarehouse')) {
        category = 'Data Warehouse';
      }

      return {
        name: db.name,
        category,
        databaseId: db.database_id,
        createDate: db.create_date,
        collation: db.collation_name
      };
    });

    // Sort by category priority, then by name within category
    const categoryOrder = { 'Global': 0, 'User': 1, 'Data Warehouse': 2 };
    databases.sort((a, b) => {
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      return a.name.localeCompare(b.name);
    });

    res.json({ databases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clean up all existing snapshots (migration endpoint)
app.post('/api/snapshots/cleanup', async (req, res) => {
  try {
    const deletedSnapshots = await deleteAllSnapshots();

    await addToHistory({
      type: 'cleanup_snapshots',
      deletedCount: deletedSnapshots.length,
      deletedSnapshots: deletedSnapshots.slice(0, 10) // Limit for history
    });

    res.json({
      success: true,
      deletedCount: deletedSnapshots.length,
      message: `Cleaned up ${deletedSnapshots.length} existing snapshots`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of snapshot files that need cleanup
app.get('/api/snapshots/files-to-cleanup', async (req, res) => {
  try {
    const config = await getFreshSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);

    // Get snapshot path from environment or use default
    const snapshotBasePath = process.env.SNAPSHOT_PATH || '/var/opt/mssql/snapshots';

    // List all .ss files in the snapshot directory
    const result = await pool.request().query(`
      EXEC xp_cmdshell 'ls -la ${snapshotBasePath}/*.ss 2>/dev/null || echo "No files found"'
    `);

    const filesToCleanup = [];
    let totalSizeBytes = 0;

    for (const row of result.recordset) {
      if (row.output && row.output.includes('.ss') && !row.output.includes('No files found')) {
        // Parse the ls -la output to extract filename and size
        const parts = row.output.trim().split(/\s+/);
        if (parts.length >= 9) {
          const sizeBytes = parseInt(parts[4]) || 0;
          const fileName = parts[8];

          filesToCleanup.push({
            fileName: fileName,
            fullPath: `${snapshotBasePath}/${fileName}`,
            sizeBytes: sizeBytes,
            sizeMB: Math.round(sizeBytes / 1024 / 1024 * 100) / 100
          });

          totalSizeBytes += sizeBytes;
        }
      }
    }

    await pool.close();

    res.json({
      snapshotPath: snapshotBasePath,
      filesToCleanup: filesToCleanup,
      totalFiles: filesToCleanup.length,
      totalSizeBytes: totalSizeBytes,
      totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 100) / 100,
      totalSizeGB: Math.round(totalSizeBytes / 1024 / 1024 / 1024 * 100) / 100,
      cleanupCommand: `rm -f ${snapshotBasePath}/*.ss`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for N8N to trigger file cleanup
app.post('/api/snapshots/cleanup-webhook', async (req, res) => {
  try {
    const config = await getFreshSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);

    // Get snapshot path from environment or use default
    const snapshotBasePath = process.env.SNAPSHOT_PATH || '/var/opt/mssql/snapshots';

    // Get list of files first
    const listResult = await pool.request().query(`
      EXEC xp_cmdshell 'ls -la ${snapshotBasePath}/*.ss 2>/dev/null || echo "No files found"'
    `);

    const filesToCleanup = [];
    for (const row of listResult.recordset) {
      if (row.output && row.output.includes('.ss') && !row.output.includes('No files found')) {
        const parts = row.output.trim().split(/\s+/);
        if (parts.length >= 9) {
          const fileName = parts[8];
          filesToCleanup.push({
            fileName: fileName,
            fullPath: `${snapshotBasePath}/${fileName}`
          });
        }
      }
    }

    // Attempt to delete files
    const deletedFiles = [];
    const errors = [];

    for (const file of filesToCleanup) {
      try {
        await pool.request().query(`
          EXEC xp_cmdshell 'rm -f "${file.fullPath}"'
        `);
        deletedFiles.push(file.fileName);
        console.log(`Deleted snapshot file: ${file.fileName}`);
      } catch (error) {
        console.error(`Error deleting file ${file.fileName}:`, error.message);
        errors.push({ file: file.fileName, error: error.message });
      }
    }

    await pool.close();

    await addToHistory({
      type: 'webhook_file_cleanup',
      deletedCount: deletedFiles.length,
      deletedFiles: deletedFiles.slice(0, 10),
      errors: errors.length
    });

    res.json({
      success: true,
      deletedFiles: deletedFiles,
      errors: errors,
      totalDeleted: deletedFiles.length,
      totalErrors: errors.length,
      message: `Cleanup completed: ${deletedFiles.length} files deleted, ${errors.length} errors`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get snapshots for a group
app.get('/api/groups/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };
    const group = data.groups.find(g => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots
      .filter(s => s.groupId === id)
      .sort((a, b) => b.sequence - a.sequence); // Most recent first

    res.json(groupSnapshots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create snapshot for a group
app.post('/api/groups/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;
    const { snapshotName } = req.body;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };
    const group = data.groups.find(g => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check 9-snapshot limit
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === id);
    if (groupSnapshots.length >= 9) {
      return res.status(400).json({
        error: 'Maximum of 9 snapshots allowed per group. Please delete some snapshots before creating new ones.'
      });
    }

    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const sequence = await getNextSequenceForGroup(id);
    const snapshotId = generateSnapshotId(group.name, sequence);
    const displayName = generateDisplayName(snapshotName);

    const pool = await sql.connect(config);
    const databaseSnapshots = [];
    const results = [];

    for (const database of group.databases) {
      try {
        const fullSnapshotName = `${snapshotId}_${database}`;
        // Use configurable snapshot path (Windows/Linux compatible)
        const snapshotBasePath = process.env.SNAPSHOT_PATH || 'C:\\Snapshots';
        const snapshotPath = `${snapshotBasePath}/${fullSnapshotName}.ss`;

        // Get database files (exclude log files - only data files allowed in snapshots)
        const dbFiles = await pool.request().query(`
          SELECT name, physical_name
          FROM sys.master_files
          WHERE database_id = DB_ID('${database}')
          AND type = 0  -- Only data files (type 0), exclude log files (type 1)
        `);

        // Check if we have any data files
        if (dbFiles.recordset.length === 0) {
          throw new Error(`No data files found for database '${database}'. Cannot create snapshot.`);
        }

        let fileList = '';
        for (const file of dbFiles.recordset) {
          fileList += `(NAME = '${file.name}', FILENAME = '${snapshotPath.replace('.ss', `_${file.name}.ss`)}'),`;
        }
        fileList = fileList.slice(0, -1); // Remove trailing comma

        await pool.request().query(`
          CREATE DATABASE [${fullSnapshotName}]
          ON ${fileList}
          AS SNAPSHOT OF [${database}]
        `);

        databaseSnapshots.push({
          database,
          snapshotName: fullSnapshotName,
          success: true
        });

        results.push({ database, snapshotName: fullSnapshotName, success: true });
      } catch (dbError) {
        databaseSnapshots.push({
          database,
          error: dbError.message,
          success: false
        });
        results.push({ database, error: dbError.message, success: false });
      }
    }

    await pool.close();

    // Save snapshot metadata
    const newSnapshot = {
      id: snapshotId,
      groupId: id,
      groupName: group.name,
      displayName: displayName,
      sequence: sequence,
      createdAt: new Date().toISOString(),
      databaseCount: group.databases.length,
      databaseSnapshots: databaseSnapshots
    };

    snapshotsData.snapshots.push(newSnapshot);
    await saveSnapshotsData(snapshotsData);

    await addToHistory({
      type: 'create_snapshots',
      groupName: group.name,
      snapshotName: displayName,
      snapshotId: snapshotId,
      sequence: sequence,
      results
    });

    res.json({
      success: true,
      snapshot: newSnapshot,
      results: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test snapshot path configuration (shows configured path only)
app.get('/api/test-snapshot-path', async (req, res) => {
  try {
    const snapshotBasePath = process.env.SNAPSHOT_PATH || 'C:\\Snapshots';

    res.json({
      success: true,
      snapshotPath: snapshotBasePath,
      message: 'Snapshot path configured for SQL Server queries',
      note: 'This path will be used in CREATE DATABASE statements for SQL Server snapshots'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get information about non-managed snapshots
app.get('/api/snapshots/unmanaged', async (req, res) => {
  try {
    console.log('Fetching unmanaged snapshots...');
    const config = await getFreshSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    // Always create a fresh connection to get current data
    const pool = await sql.connect(config);

    // Get all snapshot databases
    const result = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    await pool.close();

    console.log(`Found ${result.recordset.length} total snapshots in SQL Server`);
    console.log('Snapshot details:', result.recordset.map(db => ({ name: db.name, state: db.state_desc })));

    // Get our managed snapshots (fresh read)
    const snapshotsData = await getSnapshotsData();
    const managedSnapshotNames = new Set();

    snapshotsData.snapshots.forEach(snapshot => {
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success) {
          managedSnapshotNames.add(dbSnapshot.snapshotName);
        }
      });
    });

    console.log(`Found ${managedSnapshotNames.size} managed snapshots`);
    console.log('Managed snapshot names:', Array.from(managedSnapshotNames));

    // Find unmanaged snapshots
    const unmanagedSnapshots = result.recordset.filter(db =>
      !managedSnapshotNames.has(db.name)
    );

    console.log(`Found ${unmanagedSnapshots.length} unmanaged snapshots`);
    console.log('Unmanaged snapshot names:', unmanagedSnapshots.map(db => db.name));

    res.json({
      unmanagedCount: unmanagedSnapshots.length,
      unmanagedSnapshots: unmanagedSnapshots.map(db => ({
        name: db.name,
        createDate: db.create_date
      }))
    });
  } catch (error) {
    console.error('Error fetching unmanaged snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint that also checks for orphaned snapshots
app.get('/api/health', async (req, res) => {
  try {
    const config = await getFreshSqlConfig();
    if (!config) {
      return res.status(400).json({
        status: 'error',
        message: 'No SQL Server configuration found'
      });
    }

    const pool = await sql.connect(config);

    // Test basic connection
    await pool.request().query('SELECT 1 as test');

    // Check for orphaned snapshots
    const result = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const orphanedSnapshots = [];
    for (const db of result.recordset) {
      try {
        await pool.request().query(`SELECT 1 FROM [${db.name}].sys.tables`);
      } catch (error) {
        orphanedSnapshots.push(db.name);
      }
    }

    await pool.close();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      sqlServer: 'connected',
      orphanedSnapshots: orphanedSnapshots.length,
      orphanedSnapshotNames: orphanedSnapshots
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`SQL Parrot backend running on port ${PORT}`);

  // Run orphan cleanup on startup
  try {
    const cleanupResult = await cleanupOrphanedSnapshots();
    if (cleanupResult.cleaned > 0) {
      console.log(`✅ Startup cleanup: Removed ${cleanupResult.cleaned} orphaned snapshots`);
    } else {
      console.log('✅ Startup cleanup: No orphaned snapshots found');
    }
  } catch (error) {
    console.error('❌ Startup cleanup failed:', error.message);
  }
});
