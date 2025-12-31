// Test setup file
// Note: Do NOT import mssql here - it will be mocked in individual test files
// Importing it here would cache the real module before mocks take effect
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// Setup test database - creates a fresh database with Node.js schema
// Note: We do NOT copy the bundled database (from Rust) because it may have
// a different schema that causes corruption or incompatible queries.
// Instead, we always create a fresh database with the correct Node.js schema.
async function setupTestDatabase() {
  const testDbPath = path.join(__dirname, '..', 'data', 'sqlparrot.db');
  const testDbDir = path.dirname(testDbPath);

  // Ensure data directory exists
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  // Remove existing test database files to ensure clean state
  // Also remove WAL and SHM files that SQLite creates
  const filesToRemove = [
    testDbPath,
    testDbPath + '-wal',
    testDbPath + '-shm'
  ];

  for (const file of filesToRemove) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Wait and retry if file is locked
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          fs.unlinkSync(file);
        } catch (retryError) {
          console.warn(`⚠️  Could not remove ${path.basename(file)}: ${retryError.message}`);
        }
      }
    }
  }

  console.log('🗄️  Creating fresh test database with Node.js schema...');

  // Initialize with fresh Node.js schema
  // Note: Skip if MetadataStorage is mocked (some tests mock it)
  let storage;
  try {
    const MetadataStorage = require('../backend/utils/metadataStorageSqlite');

    // Check if the module is mocked by verifying it returns a real constructor
    // Mocked modules typically return a jest.fn() which doesn't have a proper prototype
    const isMocked = typeof MetadataStorage.mock !== 'undefined' ||
                     !MetadataStorage.prototype ||
                     typeof MetadataStorage.prototype.initialize !== 'function';

    if (isMocked) {
      console.log('⚠️  MetadataStorage is mocked, skipping database initialization');
      return;
    }

    storage = new MetadataStorage();

    // Check if initialize method exists and works (might be mocked at instance level)
    if (typeof storage.initialize === 'function') {
      await storage.initialize();
      console.log('✅ Initialized database schema');
    } else {
      console.log('⚠️  MetadataStorage.initialize is not a function, skipping');
    }
  } catch (error) {
    // If initialization fails, clean up and rethrow
    if (storage && typeof storage.close === 'function') {
      try {
        storage.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    console.error(`❌ Failed to initialize test database: ${error.message}`);
    throw error;
  }
}

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting API tests...');
  await setupTestDatabase();
});

afterAll(async () => {
  console.log('🏁 API tests completed');

  // Close any remaining SQL connections (only if mssql was actually loaded)
  try {
    // Use dynamic require to avoid caching issues with mocks
    const sql = require('mssql');
    if (sql && typeof sql.close === 'function') {
      await sql.close();
    }
  } catch (error) {
    // Ignore connection close errors - may be mocked or not connected
  }
});

// Increase timeout for database operations
jest.setTimeout(30000);
