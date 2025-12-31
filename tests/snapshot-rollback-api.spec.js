/**
 * IMPORTANT: Snapshot Rollback Integration Tests - REMOVED
 *
 * This file previously contained integration tests for snapshot creation and rollback
 * functionality. These tests have been intentionally removed because:
 *
 * 1. They require a REAL SQL Server instance with snapshot capabilities
 * 2. They cannot be meaningfully mocked - snapshot/rollback operations are complex
 *    SQL Server features that involve file system operations, database state changes,
 *    and transaction coordination that mocks cannot replicate
 * 3. The mssql mock in tests/__mocks__/mssql.js only handles basic queries
 * 4. Running these tests requires proper SQL Server configuration including:
 *    - A running SQL Server instance
 *    - Permissions to create/drop databases
 *    - Permissions to create/restore snapshots
 *    - A configured snapshot path with proper file system access
 *
 * DO NOT ADD INTEGRATION TESTS HERE THAT REQUIRE REAL SQL SERVER OPERATIONS.
 *
 * If you need to test snapshot functionality:
 * - Test the API layer separately using mocks (see profile-management-api.spec.js)
 * - Test SQL generation/parsing logic in isolation
 * - Use a dedicated integration test environment with real SQL Server
 * - Consider creating a separate test runner for integration tests
 *
 * The following tests were removed:
 * - Test 1: Base setup + Delete all snapshots (verify current state)
 * - Test 2: Base setup + Rollback to Snapshot B
 * - Test 3: Base setup + Rollback to Snapshot C
 * - Test 4: Edge Case - Rollback to earliest snapshot when multiple exist
 * - Test 5: Edge Case - Verify snapshot cleanup after rollback
 * - Test 6: API Workflow - Create multiple snapshots and verify API state
 *
 * These tested actual SQL Server operations which cannot run in CI/CD or
 * development environments without a properly configured SQL Server instance.
 */

describe('Snapshot Rollback API Tests', () => {
  // Placeholder to keep the test file valid
  // All actual tests have been removed - see comments above

  test.skip('Integration tests removed - require real SQL Server', () => {
    // This test is intentionally skipped
    // See file header comments for explanation
    expect(true).toBe(true);
  });
});

/**
 * For future reference, if you need to run actual integration tests:
 *
 * 1. Set up environment variables:
 *    - SQL_SERVER: hostname of SQL Server
 *    - SQL_PORT: port (default 1433)
 *    - SQL_USERNAME: username with admin privileges
 *    - SQL_PASSWORD: password
 *    - SQL_TRUST_CERTIFICATE: true for self-signed certs
 *    - SNAPSHOT_PATH: path where SQL Server can create snapshot files
 *
 * 2. Create a separate test script that:
 *    - Uses jest.unmock('mssql') to use real connections
 *    - Creates test databases, tables, and data
 *    - Tests snapshot creation and rollback
 *    - Cleans up after itself
 *
 * 3. Run integration tests separately from unit tests:
 *    npm run test:integration (if configured)
 */
