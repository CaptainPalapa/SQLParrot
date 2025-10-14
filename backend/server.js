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
    const { name, databases } = req.body;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };

    const groupIndex = data.groups.findIndex(g => g.id === id);
    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    data.groups[groupIndex] = { ...data.groups[groupIndex], name, databases };
    await writeJsonFile(GROUPS_FILE, data);

    await addToHistory({
      type: 'update_group',
      groupName: name,
      databaseCount: databases?.length || 0
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
    data.groups.splice(groupIndex, 1);
    await writeJsonFile(GROUPS_FILE, data);

    await addToHistory({
      type: 'delete_group',
      groupName: deletedGroup.name
    });

    res.json({ success: true });
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

// Get snapshots for a group
app.get('/api/groups/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonFile(GROUPS_FILE) || { groups: [] };
    const group = data.groups.find(g => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);
    const snapshots = [];

    for (const database of group.databases) {
      try {
        const result = await pool.request().query(`
          SELECT
            d.name,
            d.source_database_id,
            d.create_date,
            d.database_snapshot_lsn,
            mf.physical_name,
            mf.size * 8 / 1024 AS size_mb
          FROM sys.databases d
          LEFT JOIN sys.master_files mf ON d.database_id = mf.database_id
          WHERE d.source_database_id IS NOT NULL
          AND d.name LIKE '${database}_snapshot_%'
        `);

        snapshots.push(...result.recordset.map(row => ({
          ...row,
          sourceDatabase: database
        })));
      } catch (dbError) {
        console.error(`Error querying snapshots for ${database}:`, dbError);
      }
    }

    await pool.close();
    res.json(snapshots);
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

    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);
    const results = [];

    for (const database of group.databases) {
      try {
        const fullSnapshotName = `${database}_snapshot_${snapshotName}`;
        const snapshotPath = `C:\\Snapshots\\${fullSnapshotName}.ss`;

        // Get database files
        const dbFiles = await pool.request().query(`
          SELECT name, physical_name
          FROM sys.master_files
          WHERE database_id = DB_ID('${database}')
        `);

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

        results.push({ database, snapshotName: fullSnapshotName, success: true });
      } catch (dbError) {
        results.push({ database, error: dbError.message, success: false });
      }
    }

    await pool.close();

    await addToHistory({
      type: 'create_snapshots',
      groupName: group.name,
      snapshotName,
      results
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// Start server
app.listen(PORT, () => {
  console.log(`SQL Parrot backend running on port ${PORT}`);
});
