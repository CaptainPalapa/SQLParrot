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
    const settings = await readJsonFile(SETTINGS_FILE) || { preferences: { maxHistoryEntries: 100 } };
    const maxHistoryEntries = settings.preferences?.maxHistoryEntries || 100;

    history.operations.unshift({
      ...operation,
      timestamp: new Date().toISOString()
    });
    // Keep only the configured number of operations
    history.operations = history.operations.slice(0, maxHistoryEntries);
    await writeJsonFile(HISTORY_FILE, history);
  } catch (error) {
    console.error('Error adding to history:', error);
  }
}

async function trimHistoryToMaxEntries(maxHistoryEntries) {
  try {
    const history = await readJsonFile(HISTORY_FILE) || { operations: [] };
    const currentCount = history.operations.length;

    if (currentCount > maxHistoryEntries) {
      const removedCount = currentCount - maxHistoryEntries;
      history.operations = history.operations.slice(0, maxHistoryEntries);
      await writeJsonFile(HISTORY_FILE, history);

      // Add a history entry for the trimming action
      await addToHistory({
        type: 'trim_history',
        removedCount: removedCount,
        newMaxEntries: maxHistoryEntries,
        previousCount: currentCount
      });

      return removedCount;
    }
    return 0;
  } catch (error) {
    console.error('Error trimming history:', error);
    return 0;
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

function generateSnapshotId(groupName, snapshotName, timestamp = null) {
  const crypto = require('crypto');

  // Clean group name: lowercase, no spaces or special characters
  const cleanGroupName = groupName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Create a unique hash from snapshot name + timestamp
  const timeStr = timestamp || new Date().toISOString();
  const hashInput = `${snapshotName}_${timeStr}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 8);

  return `${cleanGroupName}_${hash}`;
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
    // Checking for orphaned snapshots on startup
    const config = await getFreshSqlConfig();
    if (!config) {
      // No SQL Server configuration found, skipping orphan cleanup
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
        // Snapshot is accessible
      } catch (error) {
        // Database is orphaned (files missing)
        // Detected orphaned snapshot
        orphanedSnapshots.push(db.name);

        try {
          // Drop the orphaned database
          await pool.request().query(`DROP DATABASE [${db.name}]`);
          cleanedSnapshots.push(db.name);
          // Cleaned up orphaned snapshot
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

      // Startup cleanup completed
    } else {
      // Startup cleanup completed
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

// Migration function to add physical file names to existing snapshots
async function migrateSnapshotFileNames() {
  const snapshotsData = await getSnapshotsData();
  let needsUpdate = false;

  // Get actual file names from N8N API to match against
  let actualFileNames = [];
  try {
    const filesData = await getFilesFromAPI();
    actualFileNames = filesData.map(file => file.filePath);
  } catch (error) {
    console.log('Could not fetch actual file names for migration:', error.message);
  }

  snapshotsData.snapshots.forEach(snapshot => {
    snapshot.databaseSnapshots.forEach(dbSnapshot => {
      if (dbSnapshot.success && !dbSnapshot.physicalFileNames) {
        // Try to find matching actual file names based on the snapshot name
        const snapshotBaseName = dbSnapshot.snapshotName;
        const matchingFiles = actualFileNames.filter(fileName =>
          fileName.includes(snapshotBaseName)
        );

        if (matchingFiles.length > 0) {
          dbSnapshot.physicalFileNames = matchingFiles;
          needsUpdate = true;
        } else {
          // Fallback to simple naming if no matches found
          const snapshotBasePath = process.env.SNAPSHOT_PATH || 'C:\\Snapshots';
          const baseFileName = `${snapshotBasePath}/${dbSnapshot.snapshotName}`;
          const physicalFileNames = [`${baseFileName}.ss`];
          dbSnapshot.physicalFileNames = physicalFileNames;
          needsUpdate = true;
        }
      }
    });
  });

  if (needsUpdate) {
    await saveSnapshotsData(snapshotsData);
    console.log('✅ Migrated existing snapshots to include physical file names');
  }
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

// File Management API helpers
async function getFilesFromAPI() {
  const username = process.env.FILES_API_USERNAME;
  const password = process.env.FILES_API_PASSWORD;
  const listUrl = process.env.FILES_API_LIST;

  if (!username || !password || !listUrl) {
    throw new Error('File API credentials not configured');
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`File API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function deleteFileFromAPI(filename) {
  const username = process.env.FILES_API_USERNAME;
  const password = process.env.FILES_API_PASSWORD;
  const deleteUrl = process.env.FILES_API_DELETE?.replace('{{filename}}', filename);

  if (!username || !password || !deleteUrl) {
    throw new Error('File API credentials not configured');
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const response = await fetch(deleteUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`File API delete error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function verifyFileFromAPI(filename) {
  // Use the generic LIST API to check if a specific file exists
  const filesData = await getFilesFromAPI();

  // Check if the filename exists in the list
  const fileExists = filesData.some(file => file.filePath === filename);

  return {
    exists: fileExists,
    filename: filename
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

// Get operation history
app.get('/api/history', async (req, res) => {
  try {
    const data = await readJsonFile(HISTORY_FILE);
    res.json(data || { operations: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read history' });
  }
});

// Clear operation history
app.delete('/api/history', async (req, res) => {
  try {
    const emptyHistory = { operations: [], metadata: { lastUpdated: new Date().toISOString() } };
    await writeJsonFile(HISTORY_FILE, emptyHistory);
    res.json({ success: true, message: 'History cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear history' });
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
      },
      fileApi: {
        username: process.env.FILES_API_USERNAME ? '***masked***' : '',
        listUrl: process.env.FILES_API_LIST || '',
        deleteUrl: process.env.FILES_API_DELETE || '',
        configured: !!(process.env.FILES_API_USERNAME && process.env.FILES_API_PASSWORD && process.env.FILES_API_LIST && process.env.FILES_API_DELETE)
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
    const currentSettings = await readJsonFile(SETTINGS_FILE) || { preferences: { maxHistoryEntries: 100 } };

    // Check if maxHistoryEntries changed and trim history if needed
    const newMaxHistoryEntries = settings.preferences?.maxHistoryEntries || 100;
    const oldMaxHistoryEntries = currentSettings.preferences?.maxHistoryEntries || 100;

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

    // If maxHistoryEntries decreased, trim the history
    if (newMaxHistoryEntries < oldMaxHistoryEntries) {
      await trimHistoryToMaxEntries(newMaxHistoryEntries);
    }

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

    // Get database count (user databases only, excluding snapshots)
    let databaseCount = 0;
    try {
      const dbResult = await pool.request().query(`
        SELECT COUNT(*) as database_count
        FROM sys.databases
        WHERE database_id > 4
        AND state = 0  -- Only online databases
        AND source_database_id IS NULL  -- Exclude snapshot databases
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

// Get list of snapshot files that need cleanup (using external API)
app.get('/api/snapshots/files-to-cleanup', async (req, res) => {
  try {
    // Get files from external API
    let filesData = [];
    let filesApiConfigured = true;
    try {
      filesData = await getFilesFromAPI();
    } catch (apiErr) {
      // Graceful fallback when Files API is not configured or unreachable
      filesApiConfigured = false;
      filesData = [];
      console.log('⚠️ Files API unavailable:', apiErr.message);
    }

    // Get actual snapshot databases from SQL Server and validate their integrity
    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Get ALL databases (not filtered) to check for specific snapshot databases
    const dbResult = await pool.request().query(`
      SELECT name, state_desc
      FROM sys.databases
    `);

    // Validate snapshot integrity by testing accessibility
    const validatedDatabases = new Set();
    for (const db of dbResult.recordset) {
      try {
        // Test if we can query the database (this will fail if files are missing)
        await pool.request().query(`SELECT 1 FROM [${db.name}].sys.tables`);
        validatedDatabases.add(db.name);
        console.log(`✅ Snapshot ${db.name} validated successfully`);
      } catch (error) {
        console.log(`❌ Snapshot ${db.name} validation failed: ${error.message}`);
        // Don't add to validated set - the snapshot is not accessible
      }
    }

    const existingDatabases = validatedDatabases;

    // Get our managed snapshots to determine which files are orphaned
    const snapshotsData = await getSnapshotsData();
    const managedFileNames = new Set();
    const expectedSnapshotNames = new Set();

    snapshotsData.snapshots.forEach(snapshot => {
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success && dbSnapshot.physicalFileNames) {
          expectedSnapshotNames.add(dbSnapshot.snapshotName);
          // Add all physical file names for this database snapshot
          dbSnapshot.physicalFileNames.forEach(fileName => {
            // Extract just the filename from the full path for comparison
            const fileNameOnly = fileName.split('/').pop() || fileName.split('\\').pop();
            managedFileNames.add(fileNameOnly);
          });
        }
      });
    });

    // Filter files to only show orphaned ones (not managed by our system)
    // filesData is an array of objects with filePath property
    const orphanedFiles = filesData.filter(file =>
      !managedFileNames.has(file.filePath)
    );

    // Use actual files from N8N API as managedFiles (what actually exists)
    const actualFileNames = filesData.map(file => file.filePath);

    // Identify snapshots with missing files for targeted DBCC validation
    const snapshotsWithMissingFiles = [];
    for (const snapshotName of expectedSnapshotNames) {
      const expectedFiles = [];
      snapshotsData.snapshots.forEach(snapshot => {
        snapshot.databaseSnapshots.forEach(dbSnapshot => {
          if (dbSnapshot.snapshotName === snapshotName && dbSnapshot.success && dbSnapshot.physicalFileNames) {
            dbSnapshot.physicalFileNames.forEach(fileName => {
              const fileNameOnly = fileName.split('/').pop() || fileName.split('\\').pop();
              expectedFiles.push(fileNameOnly);
            });
          }
        });
      });

      // Check if any expected files are missing from the actual files
      const missingFiles = expectedFiles.filter(fileName => !actualFileNames.includes(fileName));
      if (missingFiles.length > 0) {
        snapshotsWithMissingFiles.push({
          snapshotName,
          missingFiles,
          expectedFiles
        });
      }
    }


    await pool.close();

    res.json({
      snapshotPath: process.env.SNAPSHOT_PATH || '/var/opt/mssql/snapshots',
      filesToCleanup: orphanedFiles,
      totalFiles: orphanedFiles.length,
      managedFiles: actualFileNames, // Use actual files from N8N API
      expectedFiles: Array.from(managedFileNames), // What we expect from metadata
      existingDatabases: Array.from(existingDatabases), // What exists in SQL Server
      snapshotsWithMissingFiles: snapshotsWithMissingFiles.length,
      apiUsed: 'external',
      filesApiConfigured
    });
  } catch (error) {
    console.error('Error getting files from API:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to validate snapshot integrity with different methods
app.get('/api/test/snapshot-validation/:snapshotName', async (req, res) => {
  const snapshotName = req.params.snapshotName;

  try {
    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    const results = {
      snapshotName,
      tests: {}
    };

    // Test 1: Simple query test
    try {
      await pool.request().query(`SELECT COUNT(*) FROM [${snapshotName}].sys.tables`);
      results.tests.simpleQuery = { success: true, message: 'Simple query succeeded' };
    } catch (error) {
      results.tests.simpleQuery = { success: false, message: error.message };
    }

    // Test 2: File existence check
    try {
      const fileResult = await pool.request().query(`
        SELECT name, physical_name, state_desc
        FROM [${snapshotName}].sys.database_files
      `);
      results.tests.fileCheck = {
        success: true,
        message: 'File check succeeded',
        files: fileResult.recordset
      };
    } catch (error) {
      results.tests.fileCheck = { success: false, message: error.message };
    }

    // Test 3: Snapshot state check
    try {
      const stateResult = await pool.request().query(`
        SELECT name, state_desc, is_read_only
        FROM sys.databases
        WHERE name = '${snapshotName}'
      `);
      results.tests.stateCheck = {
        success: true,
        message: 'State check succeeded',
        state: stateResult.recordset[0]
      };
    } catch (error) {
      results.tests.stateCheck = { success: false, message: error.message };
    }

    // Test 4: DBCC CHECKDB
    const dbccStartTime = Date.now();
    try {
      await pool.request().query(`DBCC CHECKDB('${snapshotName}') WITH NO_INFOMSGS`);
      const dbccEndTime = Date.now();
      results.tests.dbccCheck = {
        success: true,
        message: 'DBCC CHECKDB succeeded',
        duration: dbccEndTime - dbccStartTime
      };
    } catch (error) {
      const dbccEndTime = Date.now();
      results.tests.dbccCheck = {
        success: false,
        message: error.message,
        duration: dbccEndTime - dbccStartTime
      };
    }

    await pool.close();
    res.json(results);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Batch test endpoint to run DBCC CHECKDB against all snapshots
app.get('/api/test/dbcc-all-snapshots', async (req, res) => {
  const startTime = Date.now();

  try {
    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Get all snapshot databases
    const dbResult = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const snapshots = dbResult.recordset.map(db => db.name);
    console.log(`Running DBCC CHECKDB against ${snapshots.length} snapshots...`);

    const results = {
      totalSnapshots: snapshots.length,
      snapshots: [],
      totalDuration: 0,
      averageDuration: 0,
      startTime: new Date().toISOString()
    };

    let totalDbccTime = 0;

    for (const snapshotName of snapshots) {
      const snapshotStartTime = Date.now();
      console.log(`Running DBCC CHECKDB on ${snapshotName}...`);

      try {
        await pool.request().query(`DBCC CHECKDB('${snapshotName}') WITH NO_INFOMSGS`);
        const snapshotEndTime = Date.now();
        const duration = snapshotEndTime - snapshotStartTime;
        totalDbccTime += duration;

        results.snapshots.push({
          name: snapshotName,
          success: true,
          duration: duration,
          message: 'DBCC CHECKDB succeeded'
        });

        console.log(`✅ ${snapshotName}: ${duration}ms`);
      } catch (error) {
        const snapshotEndTime = Date.now();
        const duration = snapshotEndTime - snapshotStartTime;
        totalDbccTime += duration;

        results.snapshots.push({
          name: snapshotName,
          success: false,
          duration: duration,
          message: error.message
        });

        console.log(`❌ ${snapshotName}: ${duration}ms - ${error.message}`);
      }
    }

    await pool.close();

    const endTime = Date.now();
    results.totalDuration = endTime - startTime;
    results.dbccDuration = totalDbccTime;
    results.averageDuration = Math.round(totalDbccTime / snapshots.length);
    results.endTime = new Date().toISOString();

    console.log(`\n📊 DBCC Summary:`);
    console.log(`Total time: ${results.totalDuration}ms`);
    console.log(`DBCC time: ${results.dbccDuration}ms`);
    console.log(`Average per snapshot: ${results.averageDuration}ms`);

    res.json(results);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific snapshot (valid snapshots only)
app.delete('/api/snapshots/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details
    const snapshotsData = await getSnapshotsData();
    const snapshot = snapshotsData.snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Drop all snapshot databases for this snapshot
    const droppedDatabases = [];
    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          droppedDatabases.push(dbSnapshot.snapshotName);
          console.log(`✅ Dropped snapshot database: ${dbSnapshot.snapshotName}`);
        } catch (error) {
          console.log(`❌ Failed to drop snapshot database ${dbSnapshot.snapshotName}: ${error.message}`);
        }
      }
    }

    await pool.close();

    // TODO: Delete physical files via N8N API
    // await deleteSnapshotFiles(snapshot);

    // Remove snapshot from metadata
    snapshotsData.snapshots = snapshotsData.snapshots.filter(s => s.id !== snapshotId);
    await writeJsonFile(SNAPSHOTS_FILE, snapshotsData);

    res.json({
      success: true,
      message: `Snapshot "${snapshot.displayName}" deleted successfully`,
      droppedDatabases: droppedDatabases.length
    });

  } catch (error) {
    console.error('Error deleting snapshot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rollback to a specific snapshot
app.post('/api/snapshots/:snapshotId/rollback', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details
    const snapshotsData = await getSnapshotsData();
    const snapshot = snapshotsData.snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Step 1: Drop ALL snapshot databases for OUR GROUP AND SOURCE DATABASES EXCEPT the target
    // This ensures complete cleanup while preserving the target snapshot for restore
    const droppedSnapshots = [];

    try {
      // Get our source database names
      const sourceDatabaseNames = snapshot.databaseSnapshots
        .filter(dbSnapshot => dbSnapshot.success)
        .map(dbSnapshot => dbSnapshot.database);

      // Get snapshot databases that match our group's naming pattern AND our source databases
      const groupSnapshotsResult = await pool.request().query(`
        SELECT name, source_database_id
        FROM sys.databases
        WHERE source_database_id IS NOT NULL
        AND name LIKE 'sf_%'
        AND (${sourceDatabaseNames.map(db => `source_database_id = DB_ID('${db}')`).join(' OR ')})
      `);

      console.log(`Found ${groupSnapshotsResult.recordset.length} snapshot databases for our group and source databases to clean up`);

      // Get target snapshot names to preserve them
      const targetSnapshotNames = new Set();
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success && dbSnapshot.snapshotName) {
          targetSnapshotNames.add(dbSnapshot.snapshotName);
        }
      });

      // Drop ALL snapshot databases for our group and source databases EXCEPT the target ones
      for (const snapshotDb of groupSnapshotsResult.recordset) {
        if (!targetSnapshotNames.has(snapshotDb.name)) {
          try {
            await pool.request().query(`DROP DATABASE [${snapshotDb.name}]`);
            droppedSnapshots.push(snapshotDb.name);
            console.log(`✅ Dropped group+source snapshot database: ${snapshotDb.name}`);
          } catch (error) {
            console.log(`❌ Failed to drop group+source snapshot database ${snapshotDb.name}: ${error.message}`);
          }
        } else {
          console.log(`⏭️ Preserving target snapshot database: ${snapshotDb.name}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error getting group+source snapshot databases: ${error.message}`);
    }

    // Step 2: Restore each database to the target snapshot state
    // The target snapshot will be automatically removed by SQL Server during restore
    const rolledBackDatabases = [];
    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          const sourceDbName = dbSnapshot.database;

          // Drop the current database and restore from snapshot
          await pool.request().query(`DROP DATABASE [${sourceDbName}]`);
          await pool.request().query(`RESTORE DATABASE [${sourceDbName}] FROM DATABASE_SNAPSHOT = '${dbSnapshot.snapshotName}'`);

          rolledBackDatabases.push(sourceDbName);
          console.log(`✅ Rolled back database: ${sourceDbName} from snapshot: ${dbSnapshot.snapshotName}`);
        } catch (error) {
          console.log(`❌ Failed to rollback database ${dbSnapshot.database}: ${error.message}`);
        }
      }
    }

    // Step 3: Clean up any remaining snapshot databases for our group and source databases (in case SQL Server didn't auto-remove them)
    try {
      // Get our source database names
      const sourceDatabaseNames = snapshot.databaseSnapshots
        .filter(dbSnapshot => dbSnapshot.success)
        .map(dbSnapshot => dbSnapshot.database);

      const remainingGroupSnapshotsResult = await pool.request().query(`
        SELECT name, source_database_id
        FROM sys.databases
        WHERE source_database_id IS NOT NULL
        AND name LIKE 'sf_%'
        AND (${sourceDatabaseNames.map(db => `source_database_id = DB_ID('${db}')`).join(' OR ')})
      `);

      if (remainingGroupSnapshotsResult.recordset.length > 0) {
        console.log(`Found ${remainingGroupSnapshotsResult.recordset.length} remaining group+source snapshot databases after restore - cleaning up`);

        for (const remainingSnapshot of remainingGroupSnapshotsResult.recordset) {
          try {
            await pool.request().query(`DROP DATABASE [${remainingSnapshot.name}]`);
            droppedSnapshots.push(remainingSnapshot.name);
            console.log(`✅ Cleaned up remaining group+source snapshot database: ${remainingSnapshot.name}`);
          } catch (error) {
            console.log(`❌ Failed to cleanup remaining group+source snapshot database ${remainingSnapshot.name}: ${error.message}`);
          }
        }
      } else {
        console.log(`✅ No remaining group+source snapshot databases found after restore`);
      }
    } catch (error) {
      console.log(`❌ Error checking for remaining group+source snapshots: ${error.message}`);
    }

    await pool.close();

    // Step 4: Remove all snapshots from metadata (all snapshots have been cleaned up)
    snapshotsData.snapshots = snapshotsData.snapshots.filter(s => s.groupId !== snapshot.groupId);
    await writeJsonFile(SNAPSHOTS_FILE, snapshotsData);

    // Step 4: Create a new checkpoint snapshot after restore
    console.log(`🔄 Creating checkpoint snapshot after restore...`);

    // Get the group details for creating the checkpoint
    const groupsData = await readJsonFile(GROUPS_FILE) || { groups: [] };
    const group = groupsData.groups.find(g => g.id === snapshot.groupId);

    if (!group) {
      console.log(`❌ Group not found for checkpoint creation`);
      return res.json({
        success: true,
        message: `Successfully rolled back to snapshot "${snapshot.displayName}". All snapshots have been removed.`,
        rolledBackDatabases: rolledBackDatabases.length,
        droppedSnapshots: droppedSnapshots.length,
        checkpointCreated: false,
        note: "Group not found for checkpoint creation"
      });
    }

    // Create checkpoint snapshot using the same logic as regular snapshot creation
    const sequence = 1; // Reset sequence numbering
    const checkpointDisplayName = `Automatic - ${new Date().toLocaleString()}`;
    const checkpointId = generateSnapshotId(snapshot.groupName, checkpointDisplayName);

    // Reconnect to database for checkpoint creation
    const checkpointPool = await sql.connect(config);
    const checkpointDatabaseSnapshots = [];
    const checkpointResults = [];

    for (const database of group.databases) {
      try {
        const fullSnapshotName = `${checkpointId}_${database}`;
        const snapshotBasePath = process.env.SNAPSHOT_PATH || 'C:\\Snapshots';
        const snapshotPath = `${snapshotBasePath}/${fullSnapshotName}.ss`;

        // Get database files (exclude log files - only data files allowed in snapshots)
        const dbFiles = await checkpointPool.request().query(`
          SELECT name, physical_name
          FROM sys.master_files
          WHERE database_id = DB_ID('${database}')
          AND type = 0  -- Only data files (type 0), exclude log files (type 1)
        `);

        if (dbFiles.recordset.length === 0) {
          throw new Error(`No data files found for database '${database}'. Cannot create checkpoint snapshot.`);
        }

        let fileList = '';
        const physicalFileNames = [];
        for (const file of dbFiles.recordset) {
          const physicalFileName = `${snapshotPath.replace('.ss', `_${file.name}.ss`)}`;
          fileList += `(NAME = '${file.name}', FILENAME = '${physicalFileName}'),`;
          physicalFileNames.push(physicalFileName);
        }
        fileList = fileList.slice(0, -1); // Remove trailing comma

        await checkpointPool.request().query(`
          CREATE DATABASE [${fullSnapshotName}]
          ON ${fileList}
          AS SNAPSHOT OF [${database}]
        `);

        checkpointDatabaseSnapshots.push({
          database,
          snapshotName: fullSnapshotName,
          physicalFileNames: physicalFileNames,
          success: true
        });

        checkpointResults.push({ database, snapshotName: fullSnapshotName, physicalFileNames: physicalFileNames, success: true });
        console.log(`✅ Created checkpoint snapshot database: ${fullSnapshotName}`);
      } catch (dbError) {
        checkpointDatabaseSnapshots.push({
          database,
          error: dbError.message,
          success: false
        });
        checkpointResults.push({ database, error: dbError.message, success: false });
        console.log(`❌ Failed to create checkpoint snapshot for database ${database}: ${dbError.message}`);
      }
    }

    await checkpointPool.close();

    // Create the checkpoint snapshot metadata
    const checkpointSnapshot = {
      id: checkpointId,
      groupId: snapshot.groupId,
      groupName: snapshot.groupName,
      displayName: checkpointDisplayName,
      sequence: 1, // Reset sequence numbering
      createdAt: new Date().toISOString(),
      databaseCount: group.databases.length,
      databaseSnapshots: checkpointDatabaseSnapshots
    };

    // Add checkpoint to snapshots data
    snapshotsData.snapshots.push(checkpointSnapshot);
    await writeJsonFile(SNAPSHOTS_FILE, snapshotsData);

    // Log checkpoint creation to history
    const historyData = await readJsonFile(HISTORY_FILE) || { operations: [] };
    historyData.operations.unshift({
      type: 'create_automatic_checkpoint',
      groupName: snapshot.groupName,
      originalSnapshotName: snapshot.displayName,
      checkpointSnapshotName: checkpointDisplayName,
      checkpointId: checkpointId,
      sequence: 1,
      results: checkpointResults,
      timestamp: new Date().toISOString()
    });
    await writeJsonFile(HISTORY_FILE, historyData);

    console.log(`✅ Checkpoint snapshot "${checkpointDisplayName}" created successfully`);

    res.json({
      success: true,
      message: `Successfully rolled back to snapshot "${snapshot.displayName}". All snapshots have been removed and automatic checkpoint created.`,
      rolledBackDatabases: rolledBackDatabases.length,
      droppedSnapshots: droppedSnapshots.length,
      checkpointCreated: true,
      checkpointSnapshot: {
        id: checkpointId,
        displayName: checkpointDisplayName,
        sequence: 1,
        databaseCount: checkpointDatabaseSnapshots.filter(s => s.success).length
      }
    });

  } catch (error) {
    console.error('Error rolling back snapshot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cleanup invalid snapshot (remove from SQL Server)
app.post('/api/snapshots/:snapshotId/cleanup', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details
    const snapshotsData = await getSnapshotsData();
    const snapshot = snapshotsData.snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Drop all snapshot databases for this snapshot (even if they're invalid)
    const droppedDatabases = [];
    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          droppedDatabases.push(dbSnapshot.snapshotName);
          console.log(`✅ Cleaned up snapshot database: ${dbSnapshot.snapshotName}`);
        } catch (error) {
          console.log(`❌ Failed to cleanup snapshot database ${dbSnapshot.snapshotName}: ${error.message}`);
        }
      }
    }

    await pool.close();

    // TODO: Delete physical files via N8N API
    // await deleteSnapshotFiles(snapshot);

    // Remove snapshot from metadata
    snapshotsData.snapshots = snapshotsData.snapshots.filter(s => s.id !== snapshotId);
    await writeJsonFile(SNAPSHOTS_FILE, snapshotsData);

    res.json({
      success: true,
      message: `Snapshot "${snapshot.displayName}" cleaned up successfully`,
      droppedDatabases: droppedDatabases.length
    });

  } catch (error) {
    console.error('Error cleaning up snapshot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function to delete snapshot files via N8N API (stubbed out)
async function deleteSnapshotFiles(snapshot) {
  try {
    const deleteUrl = process.env.FILES_API_DELETE;
    const username = process.env.FILES_API_USERNAME;
    const password = process.env.FILES_API_PASSWORD;

    if (!deleteUrl || !username || !password) {
      console.log('⚠️ File deletion API not configured, skipping file deletion');
      return;
    }

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    // Get list of files to delete
    const filesToDelete = [];
    snapshot.databaseSnapshots.forEach(dbSnapshot => {
      if (dbSnapshot.success && dbSnapshot.physicalFileNames) {
        dbSnapshot.physicalFileNames.forEach(fileName => {
          const fileNameOnly = fileName.split('/').pop() || fileName.split('\\').pop();
          filesToDelete.push(fileNameOnly);
        });
      }
    });

    // TODO: Implement actual file deletion via N8N API
    console.log(`📁 Would delete files: ${filesToDelete.join(', ')}`);

  } catch (error) {
    console.error('Error deleting snapshot files:', error);
  }
}

// Clean up orphaned snapshot files using external API
app.post('/api/snapshots/cleanup-files-api', async (req, res) => {
  try {
    // Get list of orphaned files
    const filesData = await getFilesFromAPI();

    // Get our managed snapshots
    const snapshotsData = await getSnapshotsData();
    const managedFileNames = new Set();

    snapshotsData.snapshots.forEach(snapshot => {
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success && dbSnapshot.physicalFileNames) {
          // Add all physical file names for this database snapshot
          dbSnapshot.physicalFileNames.forEach(fileName => {
            // Extract just the filename from the full path for comparison
            const fileNameOnly = fileName.split('/').pop() || fileName.split('\\').pop();
            managedFileNames.add(fileNameOnly);
          });
        }
      });
    });

    // Find orphaned files
    const orphanedFiles = filesData.filter(file =>
      !managedFileNames.has(file.filePath)
    );

    const deletedFiles = [];
    const errors = [];

    // Delete each orphaned file
    for (const file of orphanedFiles) {
      try {
        await deleteFileFromAPI(file.filePath);
        deletedFiles.push(file.filePath);
        console.log(`Deleted orphaned snapshot file: ${file.filePath}`);
      } catch (error) {
        console.error(`Error deleting file ${file.filePath}:`, error.message);
        errors.push({ file: file.filePath, error: error.message });
      }
    }

    await addToHistory({
      type: 'api_file_cleanup',
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
      message: `Cleanup completed: ${deletedFiles.length} files deleted, ${errors.length} errors`,
      apiUsed: 'external'
    });
  } catch (error) {
    console.error('Error cleaning up files via API:', error);
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
    let groupSnapshots = snapshotsData.snapshots
      .filter(s => s.groupId === id)
      .sort((a, b) => b.sequence - a.sequence); // Most recent first

    // Check for orphaned checkpoint snapshots in SQL Server that aren't in our data files
    try {
      const config = await getSqlConfig();
      if (config) {
        const pool = await sql.connect(config);

        // Get all snapshot databases that match our group's naming pattern
        const result = await pool.request().query(`
          SELECT name, create_date, state_desc
          FROM sys.databases
          WHERE source_database_id IS NOT NULL
          AND name LIKE '${id}_%'
        `);

        await pool.close();

        // Get managed snapshot names
        const managedSnapshotNames = new Set();
        groupSnapshots.forEach(snapshot => {
          snapshot.databaseSnapshots.forEach(dbSnapshot => {
            if (dbSnapshot.success) {
              managedSnapshotNames.add(dbSnapshot.snapshotName);
            }
          });
        });

        // Find orphaned checkpoint snapshots
        const orphanedCheckpoints = result.recordset.filter(db =>
          !managedSnapshotNames.has(db.name) &&
          db.name.includes('_checkpoint_')
        );

        if (orphanedCheckpoints.length > 0) {
          console.log(`Found ${orphanedCheckpoints.length} orphaned checkpoint snapshots for group ${id}`);

          // Group orphaned snapshots by checkpoint ID
          const checkpointGroups = {};
          orphanedCheckpoints.forEach(db => {
            // Extract checkpoint ID from snapshot name (e.g., "group-123_checkpoint_456_vsrwest_dev_global" -> "group-123_checkpoint_456")
            const checkpointIdMatch = db.name.match(/^(.+_checkpoint_\d+)_/);
            if (checkpointIdMatch) {
              const checkpointId = checkpointIdMatch[1];
              if (!checkpointGroups[checkpointId]) {
                checkpointGroups[checkpointId] = [];
              }
              checkpointGroups[checkpointId].push(db);
            }
          });

          // Create snapshot entries for orphaned checkpoints
          Object.entries(checkpointGroups).forEach(([checkpointId, databases]) => {
            const checkpointSnapshot = {
              id: checkpointId,
              groupId: id,
              groupName: group.name,
              displayName: `Checkpoint (orphaned)`,
              sequence: 0, // Mark as orphaned with sequence 0
              createdAt: databases[0].create_date,
              databaseCount: databases.length,
              databaseSnapshots: databases.map(db => ({
                database: db.name.split('_').slice(-1)[0], // Extract database name from end
                snapshotName: db.name,
                physicalFileNames: [], // Will be populated if needed
                success: true
              })),
              isOrphaned: true
            };

            groupSnapshots.unshift(checkpointSnapshot); // Add at beginning
            console.log(`Added orphaned checkpoint: ${checkpointId} with ${databases.length} databases`);
          });
        }
      }
    } catch (error) {
      console.log('Error checking for orphaned checkpoints:', error.message);
      // Continue with normal operation if checkpoint detection fails
    }

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
    const snapshotId = generateSnapshotId(group.name, snapshotName);
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
        const physicalFileNames = [];
        for (const file of dbFiles.recordset) {
          const physicalFileName = `${snapshotPath.replace('.ss', `_${file.name}.ss`)}`;
          fileList += `(NAME = '${file.name}', FILENAME = '${physicalFileName}'),`;
          physicalFileNames.push(physicalFileName);
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
          physicalFileNames: physicalFileNames,
          success: true
        });

        results.push({ database, snapshotName: fullSnapshotName, physicalFileNames: physicalFileNames, success: true });
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
    // Fetching unmanaged snapshots
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

    // Found total snapshots in SQL Server

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

    // Found managed snapshots

    // Find unmanaged snapshots
    const unmanagedSnapshots = result.recordset.filter(db =>
      !managedSnapshotNames.has(db.name)
    );

    // Found unmanaged snapshots

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

// N8N API health check endpoint
app.get('/api/health/n8n', async (req, res) => {
  try {
    const username = process.env.FILES_API_USERNAME;
    const password = process.env.FILES_API_PASSWORD;
    const listUrl = process.env.FILES_API_LIST;

    if (!username || !password || !listUrl) {
      return res.json({
        status: 'not_configured',
        message: 'N8N API credentials not configured',
        timestamp: new Date().toISOString(),
        configured: false
      });
    }

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });

    if (!response.ok) {
      return res.json({
        status: 'error',
        message: `N8N API returned ${response.status}: ${response.statusText}`,
        timestamp: new Date().toISOString(),
        configured: true,
        reachable: false
      });
    }

    const data = await response.json();

    res.json({
      status: 'healthy',
      message: 'N8N API is reachable and responding',
      timestamp: new Date().toISOString(),
      configured: true,
      reachable: true,
      fileCount: Array.isArray(data) ? data.length : 'unknown'
    });

  } catch (error) {
    res.json({
      status: 'error',
      message: `N8N API unreachable: ${error.message}`,
      timestamp: new Date().toISOString(),
      configured: true,
      reachable: false
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`SQL Parrot backend running on port ${PORT}`);

  // Run orphan cleanup on startup
  try {
    // First migrate existing snapshots to include physical file names
    await migrateSnapshotFileNames();

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
