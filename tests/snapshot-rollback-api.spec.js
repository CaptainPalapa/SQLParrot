const request = require('supertest');
const sql = require('mssql');
require('dotenv').config();

// Import the Express app
const app = require('../backend/server');

const TEST_DATABASE = 'trash_for_testing';

// SQL Server connection configuration
async function getSqlConfig() {
  return {
    server: process.env.SQL_SERVER || 'localhost',
    port: parseInt(process.env.SQL_PORT) || 1433,
    user: process.env.SQL_USERNAME || 'sa',
    password: process.env.SQL_PASSWORD || '',
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' || true
    }
  };
}

// Helper function to execute SQL queries
async function executeSQL(query) {
  const config = await getSqlConfig();
  const pool = await sql.connect(config);
  try {
    const result = await pool.request().query(query);
    return result;
  } finally {
    await pool.close();
  }
}

// Helper function to execute SQL queries in a specific database
async function executeSQLInDatabase(query, database) {
  const config = await getSqlConfig();
  config.database = database;
  const pool = await sql.connect(config);
  try {
    const result = await pool.request().query(query);
    return result;
  } finally {
    await pool.close();
  }
}

// Helper function to clean up test database
async function cleanupTestDatabase() {
  console.log('🧹 Cleaning up test database...');

  // Drop all snapshots first
  try {
    const snapshots = await executeSQL(`
      SELECT name FROM sys.databases
      WHERE source_database_id = DB_ID('${TEST_DATABASE}')
    `);

    for (const snapshot of snapshots.recordset) {
      try {
        await executeSQL(`DROP DATABASE [${snapshot.name}]`);
        console.log(`✅ Dropped snapshot: ${snapshot.name}`);
      } catch (error) {
        console.log(`⚠️ Could not drop snapshot ${snapshot.name}: ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`ℹ️ No snapshots to clean up: ${error.message}`);
  }

  // Drop and recreate the test database
  try {
    await executeSQL(`DROP DATABASE [${TEST_DATABASE}]`);
    console.log(`✅ Dropped database: ${TEST_DATABASE}`);
  } catch (error) {
    console.log(`ℹ️ Database didn't exist: ${error.message}`);
  }

  try {
    await executeSQL(`CREATE DATABASE [${TEST_DATABASE}]`);
    console.log(`✅ Created database: ${TEST_DATABASE}`);
  } catch (error) {
    console.log(`⚠️ Database already exists or creation failed: ${error.message}`);
  }
}

// Helper function to clean up test group and snapshots
async function cleanupTestGroup() {
  console.log('🧹 Cleaning up test groups and snapshots...');

  try {
    // Get all groups
    const groupsResponse = await request(app).get('/api/groups');
    if (groupsResponse.status === 200) {
      const groups = groupsResponse.body.data?.groups || groupsResponse.body.groups || [];

      // Find all groups that use the test database
      const testGroups = groups.filter(g => g.databases.includes(TEST_DATABASE));

      console.log(`Found ${testGroups.length} groups using test database: ${testGroups.map(g => g.name).join(', ')}`);

      // Delete each test group
      for (const testGroup of testGroups) {
        try {
          console.log(`🗑️ Cleaning up test group: ${testGroup.name} (ID: ${testGroup.id})`);

        // Delete all snapshots for this group
        const snapshotsResponse = await request(app).get(`/api/groups/${testGroup.id}/snapshots`);
        if (snapshotsResponse.status === 200) {
          // Use standardized response format
          const snapshots = snapshotsResponse.body.data;
          for (const snapshot of snapshots) {
              try {
                await request(app).post(`/api/snapshots/${snapshot.id}/cleanup`);
                console.log(`✅ Cleaned up snapshot: ${snapshot.displayName}`);
              } catch (error) {
                console.log(`⚠️ Could not clean up snapshot ${snapshot.displayName}: ${error.message}`);
              }
            }
          }

          // Delete the test group
          const deleteResponse = await request(app).delete(`/api/groups/${testGroup.id}`);
          if (deleteResponse.status === 200) {
            console.log(`✅ Successfully deleted test group: ${testGroup.name}`);
          } else {
            console.log(`⚠️ Failed to delete test group ${testGroup.name}: ${deleteResponse.status}`);
          }
        } catch (error) {
          console.log(`⚠️ Error cleaning up test group ${testGroup.name}: ${error.message}`);
        }
      }

      if (testGroups.length === 0) {
        console.log('ℹ️ No test groups found to clean up');
      }
    }
  } catch (error) {
    console.log(`⚠️ Could not clean up test groups: ${error.message}`);
  }
}

// Helper function to set up base test data
async function setupBaseTestData() {
  console.log('🏗️ Setting up base test data...');

  // Create flavor schema
  try {
    await executeSQLInDatabase(`CREATE SCHEMA [flavor]`, TEST_DATABASE);
    console.log('✅ Created schema: flavor');
  } catch (error) {
    console.log(`⚠️ Flavor schema might already exist: ${error.message}`);
  }

  // Create vanilla table in flavor schema
  try {
    await executeSQLInDatabase(`
      CREATE TABLE [flavor].[vanilla] (
        [ID] int IDENTITY(1,1) PRIMARY KEY,
        [CRUDDate] datetime2 DEFAULT GETDATE(),
        [Name] varchar(50),
        [Price] decimal(10,2),
        [Description] varchar(255)
      )
    `, TEST_DATABASE);
    console.log('✅ Created table: flavor.vanilla');
  } catch (error) {
    console.log(`⚠️ Vanilla table might already exist: ${error.message}`);
  }

  // Create cherry table in flavor schema
  try {
    await executeSQLInDatabase(`
      CREATE TABLE [flavor].[cherry] (
        [ID] int IDENTITY(1,1) PRIMARY KEY,
        [CRUDDate] datetime2 DEFAULT GETDATE(),
        [Name] varchar(50),
        [Price] decimal(10,2),
        [Description] varchar(255)
      )
    `, TEST_DATABASE);
    console.log('✅ Created table: flavor.cherry');
  } catch (error) {
    console.log(`⚠️ Cherry table might already exist: ${error.message}`);
  }

  // Insert test data
  try {
    await executeSQLInDatabase(`
      INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
      ('Vanilla Bean', 4.99, 'Classic vanilla ice cream'),
      ('French Vanilla', 5.49, 'Rich and creamy vanilla'),
      ('Vanilla Swirl', 4.79, 'Vanilla with caramel swirl')
    `, TEST_DATABASE);
    console.log('✅ Inserted vanilla test data');
  } catch (error) {
    console.log(`⚠️ Vanilla data might already exist: ${error.message}`);
  }

  try {
    await executeSQLInDatabase(`
      INSERT INTO [flavor].[cherry] ([Name], [Price], [Description]) VALUES
      ('Cherry Garcia', 5.99, 'Cherry ice cream with chocolate chunks'),
      ('Cherry Vanilla', 5.49, 'Cherry and vanilla swirl'),
      ('Cherry Almond', 5.79, 'Cherry with almond pieces')
    `, TEST_DATABASE);
    console.log('✅ Inserted cherry test data');
  } catch (error) {
    console.log(`⚠️ Cherry data might already exist: ${error.message}`);
  }
}

// Helper function to create test group
async function createTestGroup() {
  console.log('📁 Creating test group...');

  const testGroupName = `TFT_${Math.random().toString(36).substring(2, 15)}`;

  const response = await request(app)
    .post('/api/groups')
    .send({
      name: testGroupName,
      databases: [TEST_DATABASE]
    });

  if (response.status !== 200) {
    throw new Error(`Failed to create test group: ${response.body.messages?.error?.[0] || response.body.error || 'Unknown error'}`);
  }

  console.log(`✅ Created test group: ${testGroupName}`);
  return response.body.data;
}

// Helper function to create snapshot via API
async function createSnapshotViaAPI(groupId, snapshotName) {
  console.log(`📸 Creating snapshot: ${snapshotName}`);

  const response = await request(app)
    .post(`/api/groups/${groupId}/snapshots`)
    .send({
      snapshotName: snapshotName
    });

  if (response.status !== 200) {
    throw new Error(`Failed to create snapshot: ${response.body.error}`);
  }

  console.log(`✅ Created snapshot: ${snapshotName}`);
  // Use standardized response format
  return response.body.data;
}

// Helper function to get snapshots for a group
async function getGroupSnapshots(groupId) {
  const response = await request(app)
    .get(`/api/groups/${groupId}/snapshots`);

  if (response.status !== 200) {
    throw new Error(`Failed to get snapshots: ${response.body.error}`);
  }

  // Use standardized response format
  return response.body.data;
}

// Helper function to rollback to snapshot
async function rollbackToSnapshot(snapshotId) {
  console.log(`🔄 Rolling back to snapshot: ${snapshotId}`);

  const response = await request(app)
    .post(`/api/snapshots/${snapshotId}/rollback`);

  if (response.status !== 200) {
    console.log(`❌ Rollback failed with status ${response.status}:`, response.body);
    throw new Error(`Failed to rollback snapshot: ${response.body.message || response.body.error || 'Unknown error'}`);
  }

  console.log(`✅ Rolled back to snapshot: ${snapshotId}`);
  return response.body;
}

// Helper function to verify database state
async function verifyDatabaseState(expectedVanillaCount, expectedCherryCount) {
  const vanillaResult = await executeSQLInDatabase(`
    SELECT COUNT(*) as count FROM [flavor].[vanilla]
  `, TEST_DATABASE);

  const cherryResult = await executeSQLInDatabase(`
    SELECT COUNT(*) as count FROM [flavor].[cherry]
  `, TEST_DATABASE);

  const actualVanillaCount = vanillaResult.recordset[0].count;
  const actualCherryCount = cherryResult.recordset[0].count;

  console.log(`📊 Database state: Vanilla=${actualVanillaCount}, Cherry=${actualCherryCount}`);

  if (actualVanillaCount !== expectedVanillaCount) {
    throw new Error(`Expected ${expectedVanillaCount} vanilla records, got ${actualVanillaCount}`);
  }

  if (actualCherryCount !== expectedCherryCount) {
    throw new Error(`Expected ${expectedCherryCount} cherry records, got ${actualCherryCount}`);
  }

  return { vanillaCount: actualVanillaCount, cherryCount: actualCherryCount };
}

// Helper function to modify database state
async function modifyDatabaseState() {
  console.log('🔧 Modifying database state...');

  // Add more vanilla records
  await executeSQLInDatabase(`
    INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
    ('Vanilla Deluxe', 6.99, 'Premium vanilla ice cream'),
    ('Vanilla Supreme', 7.49, 'Ultimate vanilla experience')
  `, TEST_DATABASE);

  // Add more cherry records
  await executeSQLInDatabase(`
    INSERT INTO [flavor].[cherry] ([Name], [Price], [Description]) VALUES
    ('Cherry Deluxe', 6.99, 'Premium cherry ice cream'),
    ('Cherry Supreme', 7.49, 'Ultimate cherry experience')
  `, TEST_DATABASE);

  console.log('✅ Modified database state');
}

describe('Snapshot Rollback API Tests', () => {
  let testGroup;

  beforeAll(async () => {
    // Clean up any existing test groups and set up fresh environment
    await cleanupTestGroup();
    await cleanupTestDatabase();
    await setupBaseTestData();
    testGroup = await createTestGroup();
  });

  beforeEach(async () => {
    // Clean up any existing test groups first
    await cleanupTestGroup();
    // Clean up database state before each test
    await cleanupTestDatabase();
    await setupBaseTestData();
    // Create a fresh test group for each test
    testGroup = await createTestGroup();
  });

  afterEach(async () => {
    // Clean up any snapshots created during the test
    if (testGroup) {
      try {
        const snapshotsResponse = await request(app).get(`/api/groups/${testGroup.id}/snapshots`);
        if (snapshotsResponse.status === 200) {
          // Use standardized response format
          const snapshots = snapshotsResponse.body.data;
          for (const snapshot of snapshots) {
            try {
              await request(app).post(`/api/snapshots/${snapshot.id}/cleanup`);
              console.log(`✅ Cleaned up snapshot: ${snapshot.displayName}`);
            } catch (error) {
              console.log(`⚠️ Could not clean up snapshot ${snapshot.displayName}: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not clean up snapshots: ${error.message}`);
      }
    }
    // Clean up the test group after each test
    await cleanupTestGroup();
  });

  afterAll(async () => {
    // Clean up test database and group
    await cleanupTestGroup();
    await cleanupTestDatabase();
  });

  describe('Test 1: Base setup + Delete all snapshots (verify current state)', () => {
    test('should verify initial database state', async () => {
      console.log('🧪 Running Test 1: Verify current state test');

      // Verify initial state (3 vanilla, 3 cherry)
      await verifyDatabaseState(3, 3);

      // Verify no snapshots exist
      const snapshots = await getGroupSnapshots(testGroup.id);
      expect(snapshots).toHaveLength(0);

      console.log('✅ Test 1 passed: Initial state verified');
    });
  });

  describe('Test 2: Base setup + Rollback to Snapshot B', () => {
    test('should create snapshots and rollback to Snapshot B', async () => {
      console.log('🧪 Running Test 2: Rollback to Snapshot B test');

      // Create Snapshot A
      const snapshotA = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_A');

      // Modify database state
      await modifyDatabaseState();

      // Verify modified state (5 vanilla, 5 cherry)
      await verifyDatabaseState(5, 5);

      // Create Snapshot B
      const snapshotB = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_B');

      // Modify database state again
      await executeSQLInDatabase(`
        INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
        ('Vanilla Extreme', 8.99, 'Extreme vanilla flavor')
      `, TEST_DATABASE);

      // Verify current state (6 vanilla, 5 cherry)
      await verifyDatabaseState(6, 5);

      // Rollback to Snapshot B
      await rollbackToSnapshot(snapshotB.snapshot.id);

      // Verify we're back to Snapshot B state (5 vanilla, 5 cherry)
      await verifyDatabaseState(5, 5);

      console.log('✅ Test 2 passed: Rollback to Snapshot B successful');
    });
  });

  describe('Test 3: Base setup + Rollback to Snapshot C', () => {
    test('should create multiple snapshots and rollback to Snapshot C', async () => {
      console.log('🧪 Running Test 3: Rollback to Snapshot C test');

      // Create Snapshot A
      const snapshotA = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_A');

      // Modify database state
      await modifyDatabaseState();

      // Create Snapshot B
      const snapshotB = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_B');

      // Modify database state again
      await executeSQLInDatabase(`
        INSERT INTO [flavor].[cherry] ([Name], [Price], [Description]) VALUES
        ('Cherry Extreme', 8.99, 'Extreme cherry flavor')
      `, TEST_DATABASE);

      // Create Snapshot C
      const snapshotC = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_C');

      // Modify database state one more time
      await executeSQLInDatabase(`
        INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
        ('Vanilla Ultimate', 9.99, 'Ultimate vanilla experience')
      `, TEST_DATABASE);

      // Verify current state (6 vanilla, 6 cherry)
      await verifyDatabaseState(6, 6);

      // Rollback to Snapshot C
      await rollbackToSnapshot(snapshotC.snapshot.id);

      // Verify we're back to Snapshot C state (5 vanilla, 6 cherry)
      await verifyDatabaseState(5, 6);

      console.log('✅ Test 3 passed: Rollback to Snapshot C successful');
    });
  });

  describe('Test 4: Edge Case - Rollback to earliest snapshot when multiple exist', () => {
    test('should rollback to earliest snapshot', async () => {
      console.log('🧪 Running Test 4: Rollback to earliest snapshot test');

      // Create multiple snapshots
      const snapshotA = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_A');

      await modifyDatabaseState();
      const snapshotB = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_B');

      await executeSQLInDatabase(`
        INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
        ('Vanilla Special', 6.49, 'Special vanilla flavor')
      `, TEST_DATABASE);
      const snapshotC = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_C');

      // Verify we have 3 snapshots
      const snapshots = await getGroupSnapshots(testGroup.id);
      expect(snapshots.length).toBeGreaterThanOrEqual(3);

      // Rollback to earliest snapshot (Snapshot A)
      await rollbackToSnapshot(snapshotA.snapshot.id);

      // Verify we're back to original state (3 vanilla, 3 cherry)
      await verifyDatabaseState(3, 3);

      console.log('✅ Test 4 passed: Rollback to earliest snapshot successful');
    });
  });

  describe('Test 5: Edge Case - Verify snapshot cleanup after rollback', () => {
    test('should verify snapshots are cleaned up after rollback', async () => {
      console.log('🧪 Running Test 5: Snapshot cleanup verification test');

      // Create a snapshot
      const snapshotA = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_A');

      // Modify database state
      await modifyDatabaseState();

      // Create another snapshot
      const snapshotB = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_B');

      // Verify we have snapshots
      let snapshots = await getGroupSnapshots(testGroup.id);
      expect(snapshots.length).toBeGreaterThanOrEqual(2);

      // Rollback to Snapshot A
      await rollbackToSnapshot(snapshotA.snapshot.id);

      // Verify snapshots are cleaned up (should only have checkpoint)
      snapshots = await getGroupSnapshots(testGroup.id);
      expect(snapshots.length).toBeLessThanOrEqual(1); // Only checkpoint should remain

      console.log('✅ Test 5 passed: Snapshot cleanup verification successful');
    });
  });

  describe('Test 6: API Workflow - Create multiple snapshots and verify API state', () => {
    test('should create multiple snapshots and verify API responses', async () => {
      console.log('🧪 Running Test 6: API workflow verification test');

      // Create multiple snapshots
      const snapshotA = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_A');

      await modifyDatabaseState();
      const snapshotB = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_B');

      await executeSQLInDatabase(`
        INSERT INTO [flavor].[vanilla] ([Name], [Price], [Description]) VALUES
        ('Vanilla API Test', 5.99, 'API test vanilla')
      `, TEST_DATABASE);
      const snapshotC = await createSnapshotViaAPI(testGroup.id, 'Test_Snapshot_C');

      // Verify API returns correct snapshot count
      const snapshots = await getGroupSnapshots(testGroup.id);
      expect(snapshots.length).toBeGreaterThanOrEqual(3);

      // Verify snapshot metadata
      expect(snapshotA.snapshot.displayName).toBe('Test_Snapshot_A');
      expect(snapshotB.snapshot.displayName).toBe('Test_Snapshot_B');
      expect(snapshotC.snapshot.displayName).toBe('Test_Snapshot_C');

      // Verify snapshot sequences
      expect(snapshotA.snapshot.sequence).toBe(1);
      expect(snapshotB.snapshot.sequence).toBe(2);
      expect(snapshotC.snapshot.sequence).toBe(3);

      console.log('✅ Test 6 passed: API workflow verification successful');
    });
  });
});

// Utility function to manually clean up all test groups (can be called independently)
async function cleanupAllTestGroups() {
  console.log('🧹 MANUAL CLEANUP: Removing all groups using test database...');

  try {
    const groupsResponse = await request(app).get('/api/groups');
    if (groupsResponse.status === 200) {
      const groups = groupsResponse.body.groups || [];
      const testGroups = groups.filter(g => g.databases.includes(TEST_DATABASE));

      if (testGroups.length === 0) {
        console.log('✅ No test groups found - cleanup complete');
        return;
      }

      console.log(`Found ${testGroups.length} test groups to clean up:`);
      testGroups.forEach(g => console.log(`  - ${g.name} (ID: ${g.id})`));

      for (const testGroup of testGroups) {
        try {
          // Delete all snapshots first
          const snapshotsResponse = await request(app).get(`/api/groups/${testGroup.id}/snapshots`);
          if (snapshotsResponse.status === 200) {
            const snapshots = snapshotsResponse.body;
            for (const snapshot of snapshots) {
              try {
                await request(app).post(`/api/snapshots/${snapshot.id}/cleanup`);
                console.log(`  ✅ Cleaned up snapshot: ${snapshot.displayName}`);
              } catch (error) {
                console.log(`  ⚠️ Could not clean up snapshot ${snapshot.displayName}: ${error.message}`);
              }
            }
          }

          // Delete the group
          const deleteResponse = await request(app).delete(`/api/groups/${testGroup.id}`);
          if (deleteResponse.status === 200) {
            console.log(`  ✅ Deleted group: ${testGroup.name}`);
          } else {
            console.log(`  ❌ Failed to delete group ${testGroup.name}: ${deleteResponse.status}`);
          }
        } catch (error) {
          console.log(`  ❌ Error cleaning up group ${testGroup.name}: ${error.message}`);
        }
      }

      console.log('✅ Manual cleanup complete');
    }
  } catch (error) {
    console.log(`❌ Error during manual cleanup: ${error.message}`);
  }
}

// Export the cleanup function for manual use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanupAllTestGroups };
}
