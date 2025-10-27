// Test setup file
const sql = require('mssql');
require('dotenv').config();

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting API tests...');
});

afterAll(async () => {
  console.log('🏁 API tests completed');

  // Close any remaining SQL connections
  try {
    await sql.close();
  } catch (error) {
    // Ignore connection close errors
  }
});

// Increase timeout for database operations
jest.setTimeout(30000);
