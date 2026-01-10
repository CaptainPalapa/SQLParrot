/**
 * Rollback Checkpoint Setting Tests
 * 
 * Tests that rollback respects the autoCreateCheckpoint setting:
 * - When autoCreateCheckpoint is true, checkpoint should be created
 * - When autoCreateCheckpoint is false, checkpoint should NOT be created
 */

const request = require('supertest');

// Mock mssql module
jest.mock('mssql');

// Mock MetadataStorage before requiring server
let mockSnapshots = [];
let mockGroups = [];
let mockSettings = {
  maxHistoryEntries: 100,
  defaultGroup: '',
  autoCreateCheckpoint: true, // Default to true
  autoVerificationEnabled: false,
  autoVerificationIntervalMinutes: 15,
  passwordHash: null,
  passwordSkipped: false
};

const createMockStorage = () => ({
  getAllSnapshots: jest.fn(async () => mockSnapshots),
  getAllGroups: jest.fn(async () => mockGroups),
  getGroup: jest.fn((id) => mockGroups.find(g => g.id === id) || null),
  deleteSnapshot: jest.fn((id) => ({ success: true })),
  addSnapshot: jest.fn(() => ({ success: true })),
  addHistory: jest.fn(async () => ({ success: true })),
  addHistoryEntry: jest.fn(async () => ({ success: true })),
  getSettings: jest.fn(() => ({
    success: true,
    settings: { ...mockSettings }
  })),
  getPasswordStatus: jest.fn(async () => ({
    success: true,
    status: 'not-set',
    passwordHash: null,
    passwordSkipped: false
  })),
  getActiveProfile: jest.fn(() => ({
    id: 'profile-1',
    name: 'Test Profile',
    snapshotPath: '/var/opt/mssql/snapshots'
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

afterAll(() => {
  cleanupTimers();
});

beforeEach(() => {
  // Reset mocks
  mockSnapshots = [];
  mockGroups = [];
  mockSettings = {
    maxHistoryEntries: 100,
    defaultGroup: '',
    autoCreateCheckpoint: true, // Default to true
    autoVerificationEnabled: false,
    autoVerificationIntervalMinutes: 15,
    passwordHash: null,
    passwordSkipped: false
  };
  
  jest.clearAllMocks();
  
  // Reset mock implementations
  mockStorageInstance.getSettings.mockImplementation(() => ({
    success: true,
    settings: { ...mockSettings }
  }));
});

describe('Rollback Checkpoint Setting', () => {
  test('should NOT create checkpoint when autoCreateCheckpoint is false', async () => {
    // Set autoCreateCheckpoint to false
    mockSettings.autoCreateCheckpoint = false;
    
    // Setup test data
    const groupId = 'group-123';
    const snapshotId = 'sf_test123';
    
    mockGroups = [{
      id: groupId,
      name: 'Test Group',
      databases: ['test_db']
    }];
    
    mockSnapshots = [{
      id: snapshotId,
      groupId: groupId,
      groupName: 'Test Group',
      displayName: 'Test Snapshot',
      createdAt: new Date().toISOString(),
      databaseSnapshots: [{
        database: 'test_db',
        snapshotName: 'sf_test123_test_db',
        success: true
      }]
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
      .mockResolvedValueOnce({ recordset: [{ state_desc: 'ONLINE' }] }) // Database state
      .mockResolvedValueOnce({ recordset: [] }) // Restore database
      .mockResolvedValueOnce({ recordset: [] }) // Set multi user
      .mockResolvedValueOnce({ recordset: [] }); // Cleanup remaining snapshots
    
    const response = await request(app)
      .post(`/api/snapshots/${snapshotId}/rollback`)
      .expect(200);
    
    // Verify checkpoint was NOT created
    expect(response.body.data?.checkpointCreated || response.body.checkpointCreated).toBe(false);
    
    // Verify addSnapshot was NOT called (checkpoint creation)
    expect(mockStorageInstance.addSnapshot).not.toHaveBeenCalled();
  });

  test('should create checkpoint when autoCreateCheckpoint is true', async () => {
    // Set autoCreateCheckpoint to true
    mockSettings.autoCreateCheckpoint = true;
    
    // Setup test data
    const groupId = 'group-123';
    const snapshotId = 'sf_test123';
    
    mockGroups = [{
      id: groupId,
      name: 'Test Group',
      databases: ['test_db']
    }];
    
    mockSnapshots = [{
      id: snapshotId,
      groupId: groupId,
      groupName: 'Test Group',
      displayName: 'Test Snapshot',
      createdAt: new Date().toISOString(),
      databaseSnapshots: [{
        database: 'test_db',
        snapshotName: 'sf_test123_test_db',
        success: true
      }]
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
      .mockResolvedValueOnce({ recordset: [{ state_desc: 'ONLINE' }] }) // Database state
      .mockResolvedValueOnce({ recordset: [] }) // Restore database
      .mockResolvedValueOnce({ recordset: [] }) // Set multi user
      .mockResolvedValueOnce({ recordset: [] }) // Cleanup remaining snapshots
      .mockResolvedValueOnce({ recordset: [{ name: 'file1', physical_name: '/path/file1.mdf' }] }) // Database files for checkpoint
      .mockResolvedValueOnce({ recordset: [] }); // Create checkpoint snapshot
    
    const response = await request(app)
      .post(`/api/snapshots/${snapshotId}/rollback`)
      .expect(200);
    
    // Verify checkpoint WAS created
    expect(response.body.data?.checkpointCreated || response.body.checkpointCreated).toBe(true);
    
    // Verify addSnapshot WAS called (checkpoint creation)
    expect(mockStorageInstance.addSnapshot).toHaveBeenCalled();
  });
});
