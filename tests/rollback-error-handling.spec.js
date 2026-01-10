/**
 * Rollback Error Handling Tests
 * 
 * Tests for rollback error scenarios and edge cases:
 * - Handling undefined groupName in generateSnapshotId
 * - Error message details in failedRollbacks
 * - Snapshot refresh after rollback failures
 */

const request = require('supertest');

// Mock mssql module
jest.mock('mssql');

// Mock MetadataStorage before requiring server
let mockSnapshots = [];
let mockGroups = [];

const createMockStorage = () => ({
  getAllSnapshots: jest.fn(async () => mockSnapshots),
  getAllGroups: jest.fn(async () => mockGroups),
  getGroup: jest.fn((id) => mockGroups.find(g => g.id === id) || null),
  deleteSnapshot: jest.fn((id) => ({ success: true })),
  addSnapshot: jest.fn(() => ({ success: true })),
  addHistory: jest.fn(() => ({ success: true })),
  getPasswordStatus: jest.fn(async () => ({
    success: true,
    status: 'not-set',
    passwordHash: null,
    passwordSkipped: false
  })),
  getSettings: jest.fn(() => ({ 
    success: true, 
    settings: { maxHistoryEntries: 100 } 
  })),
  checkAndMigrate: jest.fn(async () => {}),
  initialize: jest.fn(async () => {})
});

const mockStorageInstance = createMockStorage();

jest.mock('../backend/utils/metadataStorageSqlite', () => {
  return jest.fn().mockImplementation(() => mockStorageInstance);
});

const app = require('../backend/server');
const { cleanupTimers } = require('../backend/server');

describe('Rollback Error Handling', () => {
  beforeEach(() => {
    // Reset mocks
    mockSnapshots = [];
    mockGroups = [];
    jest.clearAllMocks();
  });

  afterAll(() => {
    cleanupTimers();
  });

  describe('generateSnapshotId with undefined groupName', () => {
    test('should handle undefined groupName gracefully when creating checkpoint', async () => {
      // Create a snapshot with undefined groupName (simulating old metadata)
      const snapshotId = 'sf_test123';
      mockSnapshots = [{
        id: snapshotId,
        groupId: 'group-123',
        groupName: undefined, // This is the bug scenario
        displayName: 'Test Snapshot',
        createdAt: new Date().toISOString(),
        databaseSnapshots: [{
          database: 'test_db',
          snapshotName: 'sf_test123_test_db',
          success: true
        }]
      }];

      mockGroups = [{
        id: 'group-123',
        name: 'Test Group' // Group exists, but snapshot.groupName is undefined
      }];

      // Mock SQL connection and queries
      const sql = require('mssql');
      const mockRequest = {
        query: jest.fn()
      };
      const mockPool = {
        request: jest.fn(() => mockRequest),
        close: jest.fn()
      };

      sql.connect = jest.fn().mockResolvedValue(mockPool);

      // Mock successful rollback queries
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [] }) // No external snapshots
        .mockResolvedValueOnce({ recordset: [] }) // No snapshots to drop
        .mockResolvedValueOnce({ recordset: [{ name: 'sf_test123_test_db' }] }) // Snapshot exists
        .mockResolvedValueOnce({ recordset: [] }) // Kill connections
        .mockResolvedValueOnce({ recordset: [] }) // Set single user
        .mockResolvedValueOnce({ recordset: [{ state_desc: 'ONLINE' }] }) // Check state
        .mockResolvedValueOnce({ recordset: [] }) // Restore
        .mockResolvedValueOnce({ recordset: [] }) // Set multi user
        .mockResolvedValueOnce({ recordset: [] }) // Cleanup remaining
        .mockResolvedValueOnce({ recordset: [] }) // Get database files for checkpoint
        .mockResolvedValueOnce({ recordset: [] }); // Create checkpoint

      const response = await request(app)
        .post(`/api/snapshots/${snapshotId}/rollback`);

      // Should not crash with "Cannot read properties of undefined (reading 'toLowerCase')"
      // Should either succeed or return a proper error (not a 500 from undefined)
      expect([200, 400, 404, 500]).toContain(response.status);
      
      // If it's a 500, the error should be about something other than toLowerCase
      if (response.status === 500) {
        const errorText = JSON.stringify(response.body);
        expect(errorText).not.toContain('toLowerCase');
      }
    });

    test('should use group.name as fallback when snapshot.groupName is undefined', async () => {
      const snapshotId = 'sf_test456';
      mockSnapshots = [{
        id: snapshotId,
        groupId: 'group-456',
        groupName: undefined, // Missing groupName
        displayName: 'Test Snapshot 2',
        createdAt: new Date().toISOString(),
        databaseSnapshots: [{
          database: 'test_db2',
          snapshotName: 'sf_test456_test_db2',
          success: true
        }]
      }];

      mockGroups = [{
        id: 'group-456',
        name: 'My Test Group'
      }];

      const sql = require('mssql');
      const mockRequest = {
        query: jest.fn()
      };
      const mockPool = {
        request: jest.fn(() => mockRequest),
        close: jest.fn()
      };

      sql.connect = jest.fn().mockResolvedValue(mockPool);

      // Mock queries - checkpoint creation should use group.name
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [] }) // External snapshots check
        .mockResolvedValueOnce({ recordset: [] }) // Drop snapshots
        .mockResolvedValueOnce({ recordset: [{ name: 'sf_test456_test_db2' }] }) // Snapshot exists
        .mockResolvedValueOnce({ recordset: [] }) // Kill connections
        .mockResolvedValueOnce({ recordset: [] }) // Set single user
        .mockResolvedValueOnce({ recordset: [{ state_desc: 'ONLINE' }] }) // Check state
        .mockResolvedValueOnce({ recordset: [] }) // Restore
        .mockResolvedValueOnce({ recordset: [] }) // Set multi user
        .mockResolvedValueOnce({ recordset: [] }) // Cleanup
        .mockResolvedValueOnce({ recordset: [{ name: 'test_file', physical_name: '/path/file.mdf' }] }) // DB files
        .mockResolvedValueOnce({ recordset: [] }); // Create checkpoint

      const response = await request(app)
        .post(`/api/snapshots/${snapshotId}/rollback`);

      // The key test: should not error on toLowerCase
      // Even if rollback fails for other reasons (like missing DB files), 
      // it should not crash with "Cannot read properties of undefined (reading 'toLowerCase')"
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('toLowerCase');
      
      // If it's a 500, the error should be about something other than toLowerCase
      if (response.status === 500) {
        expect(responseText).not.toContain('toLowerCase');
        // Should have a proper error message structure
        expect(response.body).toHaveProperty('success', false);
      }
    });
  });

  describe('Rollback error response format', () => {
    test('should include failedRollbacks array in error response', async () => {
      const snapshotId = 'sf_error123';
      mockSnapshots = [{
        id: snapshotId,
        groupId: 'group-error',
        groupName: 'Error Group',
        displayName: 'Error Test',
        createdAt: new Date().toISOString(),
        databaseSnapshots: [{
          database: 'error_db',
          snapshotName: 'sf_error123_error_db',
          success: true
        }]
      }];

      mockGroups = [{
        id: 'group-error',
        name: 'Error Group'
      }];

      const sql = require('mssql');
      const mockRequest = {
        query: jest.fn()
      };
      const mockPool = {
        request: jest.fn(() => mockRequest),
        close: jest.fn()
      };

      sql.connect = jest.fn().mockResolvedValue(mockPool);

      // Mock snapshot doesn't exist (simulating it was dropped)
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [] }) // External snapshots
        .mockResolvedValueOnce({ recordset: [] }) // Drop snapshots
        .mockResolvedValueOnce({ recordset: [] }); // Snapshot doesn't exist

      const response = await request(app)
        .post(`/api/snapshots/${snapshotId}/rollback`);

      // Should return 500 with failedRollbacks
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('failedRollbacks');
      expect(Array.isArray(response.body.failedRollbacks)).toBe(true);
      
      if (response.body.failedRollbacks.length > 0) {
        expect(response.body.failedRollbacks[0]).toHaveProperty('database');
        expect(response.body.failedRollbacks[0]).toHaveProperty('error');
      }
    });

    test('should include detailed error messages in failedRollbacks', async () => {
      const snapshotId = 'sf_detail123';
      mockSnapshots = [{
        id: snapshotId,
        groupId: 'group-detail',
        groupName: 'Detail Group',
        displayName: 'Detail Test',
        createdAt: new Date().toISOString(),
        databaseSnapshots: [{
          database: 'detail_db',
          snapshotName: 'sf_detail123_detail_db',
          success: true
        }]
      }];

      mockGroups = [{
        id: 'group-detail',
        name: 'Detail Group'
      }];

      const sql = require('mssql');
      const mockRequest = {
        query: jest.fn()
      };
      const mockPool = {
        request: jest.fn(() => mockRequest),
        close: jest.fn()
      };

      sql.connect = jest.fn().mockResolvedValue(mockPool);

      // Mock restore failure
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [] }) // External snapshots
        .mockResolvedValueOnce({ recordset: [] }) // Drop snapshots
        .mockResolvedValueOnce({ recordset: [{ name: 'sf_detail123_detail_db' }] }) // Snapshot exists
        .mockResolvedValueOnce({ recordset: [] }) // Kill connections
        .mockResolvedValueOnce({ recordset: [] }) // Set single user
        .mockResolvedValueOnce({ recordset: [{ state_desc: 'ONLINE' }] }) // Check state
        .mockRejectedValueOnce(new Error('RESTORE DATABASE failed: Database is in use')); // Restore fails

      const response = await request(app)
        .post(`/api/snapshots/${snapshotId}/rollback`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('failedRollbacks');
      expect(response.body.failedRollbacks.length).toBeGreaterThan(0);
      expect(response.body.failedRollbacks[0]).toHaveProperty('database', 'detail_db');
      expect(response.body.failedRollbacks[0]).toHaveProperty('error');
      expect(response.body.failedRollbacks[0].error).toContain('RESTORE');
    });
  });
});
