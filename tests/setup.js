// Test setup file
// Note: Do NOT import mssql here - it will be mocked in individual test files
// Importing it here would cache the real module before mocks take effect
require('dotenv').config();

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting API tests...');
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
