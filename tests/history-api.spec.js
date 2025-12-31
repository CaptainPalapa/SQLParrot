const request = require('supertest');

// Mock mssql module - Jest will use __mocks__/mssql.js
jest.mock('mssql');

// Mock MetadataStorage before requiring server
let mockHistory = [];
let mockSettings = {
  maxHistoryEntries: 100
};

// Create mock storage methods
const createMockStorage = () => ({
  getHistory: jest.fn(function(limit) {
    // Sort by timestamp descending (most recent first) - matches real implementation
    let history = [...mockHistory].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    if (limit) {
      history = history.slice(0, parseInt(limit));
    }
    return { success: true, history };
  }),
  addHistoryEntry: jest.fn(function(entry) {
    const historyEntry = {
      timestamp: entry.timestamp || new Date().toISOString(),
      type: entry.type,
      userName: entry.userName || 'test_user',
      groupName: entry.groupName || '',
      snapshotName: entry.snapshotName || '',
      snapshotId: entry.snapshotId || '',
      sequence: entry.sequence || 0,
      details: entry.details || {}
    };
    mockHistory.unshift(historyEntry); // Add to beginning (most recent first)
    return { success: true };
  }),
  clearHistory: jest.fn(function() {
    mockHistory = [];
    return { success: true };
  }),
  trimHistoryEntries: jest.fn(function(maxEntries) {
    if (mockHistory.length > maxEntries) {
      mockHistory = mockHistory.slice(0, maxEntries);
    }
    return { success: true, trimmed: Math.max(0, mockHistory.length - maxEntries) };
  }),
  getSettings: jest.fn(function() {
    return {
      success: true,
      settings: {
        ...mockSettings,
        passwordHash: null,
        passwordSkipped: false
      }
    };
  }),
  getPasswordStatus: jest.fn(async () => {
    return {
      success: true,
      status: 'not-set',
      passwordHash: null,
      passwordSkipped: false
    };
  }),
  // Other required methods
  getGroups: jest.fn(() => ({ success: true, groups: [] })),
  getSnapshots: jest.fn(() => ({ success: true, snapshots: [] })),
  getProfiles: jest.fn(() => ({ success: true, profiles: [] })),
  getActiveProfile: jest.fn(() => null),
  checkAndMigrate: jest.fn(async () => {})
});

// Create singleton mock instance
const mockStorageInstance = createMockStorage();

// Mock the module - return the same instance every time
jest.mock('../backend/utils/metadataStorageSqlite', () => {
  return jest.fn().mockImplementation(() => mockStorageInstance);
});

// Import the Express app (after mocking)
const app = require('../backend/server');
const { cleanupTimers } = require('../backend/server');

// Helper to get storage instance
function getStorage() {
  return mockStorageInstance;
}

// Helper to clean up test history
function cleanupTestHistory() {
  mockHistory = [];
  mockSettings = { maxHistoryEntries: 100 };

  // Clear mock call history but keep implementations
  Object.keys(mockStorageInstance).forEach(key => {
    if (jest.isMockFunction(mockStorageInstance[key])) {
      mockStorageInstance[key].mockClear();
    }
  });
}

// Helper to create a test history entry
function createTestHistoryEntry(type = 'create_snapshots', overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    type,
    userName: 'test_user',
    groupName: 'Test Group',
    snapshotName: 'test_snapshot',
    snapshotId: 'test-snapshot-id',
    sequence: 1,
    details: { ...overrides }
  };
}

describe('History API Tests', () => {
  beforeEach(() => {
    cleanupTestHistory();
  });

  afterEach(() => {
    cleanupTestHistory();
  });

  describe('GET /api/history', () => {
    test('should return empty array when no history exists', async () => {
      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('operations');
      expect(Array.isArray(response.body.operations)).toBe(true);
      expect(response.body.operations.length).toBe(0);
    });

    test('should return all history entries', async () => {
      // Add test history entries with different timestamps
      const now = new Date();
      const entry1 = createTestHistoryEntry('create_snapshots');
      entry1.timestamp = new Date(now.getTime() - 3000).toISOString(); // Oldest

      const entry2 = createTestHistoryEntry('restore_snapshot', { rolledBackDatabases: ['db1'] });
      entry2.timestamp = new Date(now.getTime() - 2000).toISOString(); // Middle

      const entry3 = createTestHistoryEntry('delete_snapshot');
      entry3.timestamp = new Date(now.getTime() - 1000).toISOString(); // Most recent

      mockHistory.push(entry1, entry2, entry3);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('operations');
      expect(response.body.operations.length).toBe(3);
      expect(response.body.operations[0].type).toBe('delete_snapshot'); // Most recent first
      expect(response.body.operations[1].type).toBe('restore_snapshot');
      expect(response.body.operations[2].type).toBe('create_snapshots');
    });

    test('should return history entries in descending order by timestamp', async () => {
      const now = new Date();
      const entry1 = createTestHistoryEntry('create_snapshots');
      entry1.timestamp = new Date(now.getTime() - 2000).toISOString(); // 2 seconds ago

      const entry2 = createTestHistoryEntry('restore_snapshot');
      entry2.timestamp = new Date(now.getTime() - 1000).toISOString(); // 1 second ago

      const entry3 = createTestHistoryEntry('delete_snapshot');
      entry3.timestamp = now.toISOString(); // Now

      mockHistory.push(entry1, entry2, entry3);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations.length).toBe(3);
      // Should be sorted descending (most recent first)
      expect(response.body.operations[0].timestamp).toBe(entry3.timestamp);
      expect(response.body.operations[1].timestamp).toBe(entry2.timestamp);
      expect(response.body.operations[2].timestamp).toBe(entry1.timestamp);
    });

    test('should handle history entry with details', async () => {
      const entry = createTestHistoryEntry('create_snapshots', {
        results: [
          { database: 'db1', success: true },
          { database: 'db2', success: true }
        ]
      });

      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations.length).toBe(1);
      expect(response.body.operations[0].type).toBe('create_snapshots');
      expect(response.body.operations[0].details).toBeDefined();
    });

    test('should return error when storage fails', async () => {
      const storage = getStorage();
      storage.getHistory.mockReturnValueOnce({ success: false, error: 'Database error' });

      const response = await request(app)
        .get('/api/history');

      // Should still return empty array (graceful degradation)
      expect(response.status).toBe(200);
      expect(response.body.operations).toEqual([]);
    });
  });

  describe('DELETE /api/history', () => {
    test('should clear all history entries', async () => {
      // Add some history entries
      mockHistory.push(
        createTestHistoryEntry('create_snapshots'),
        createTestHistoryEntry('restore_snapshot'),
        createTestHistoryEntry('delete_snapshot')
      );

      expect(mockHistory.length).toBe(3);

      const response = await request(app)
        .delete('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.messages.success).toContain('History cleared successfully');

      // Verify history was cleared
      expect(mockHistory.length).toBe(0);
      const storage = getStorage();
      expect(storage.clearHistory).toHaveBeenCalled();
    });

    test('should return success when clearing empty history', async () => {
      expect(mockHistory.length).toBe(0);

      const response = await request(app)
        .delete('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.messages.success).toContain('History cleared successfully');
    });

    test('should return error when storage clear fails', async () => {
      const storage = getStorage();
      storage.clearHistory.mockReturnValueOnce({ success: false, error: 'Database error' });

      const response = await request(app)
        .delete('/api/history');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.messages.error).toContain('Failed to clear history');
    });

    test('should handle storage exception', async () => {
      const storage = getStorage();
      storage.clearHistory.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .delete('/api/history');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to clear history');
    });
  });

  describe('History Entry Types', () => {
    test('should handle create_snapshots entry type', async () => {
      const entry = createTestHistoryEntry('create_snapshots', {
        results: [
          { database: 'db1', success: true },
          { database: 'db2', success: false, error: 'Failed' }
        ]
      });

      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations[0].type).toBe('create_snapshots');
      expect(response.body.operations[0].details.results).toBeDefined();
    });

    test('should handle restore_snapshot entry type', async () => {
      const entry = createTestHistoryEntry('restore_snapshot', {
        rolledBackDatabases: ['db1', 'db2'],
        droppedSnapshots: 2,
        results: [
          { database: 'db1', success: true },
          { database: 'db2', success: true }
        ]
      });

      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations[0].type).toBe('restore_snapshot');
      expect(response.body.operations[0].details.rolledBackDatabases).toEqual(['db1', 'db2']);
    });

    test('should handle delete_snapshot entry type', async () => {
      const entry = createTestHistoryEntry('delete_snapshot', {
        deletedDatabases: ['db1_snapshot', 'db2_snapshot']
      });

      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations[0].type).toBe('delete_snapshot');
      expect(response.body.operations[0].details.deletedDatabases).toBeDefined();
    });

    test('should handle create_automatic_checkpoint entry type', async () => {
      const entry = createTestHistoryEntry('create_automatic_checkpoint', {
        checkpointSnapshotName: 'checkpoint_001',
        checkpointId: 'checkpoint-id-123',
        sequence: 1,
        results: [
          { database: 'db1', success: true }
        ]
      });

      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations[0].type).toBe('create_automatic_checkpoint');
      expect(response.body.operations[0].details.checkpointSnapshotName).toBe('checkpoint_001');
    });
  });

  describe('History Entry Fields', () => {
    test('should include all required fields in history entry', async () => {
      const entry = createTestHistoryEntry('create_snapshots');
      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      const historyEntry = response.body.operations[0];

      expect(historyEntry).toHaveProperty('timestamp');
      expect(historyEntry).toHaveProperty('type');
      expect(historyEntry).toHaveProperty('userName');
      expect(historyEntry).toHaveProperty('groupName');
      expect(historyEntry).toHaveProperty('snapshotName');
      expect(historyEntry).toHaveProperty('snapshotId');
      expect(historyEntry).toHaveProperty('sequence');
    });

    test('should handle optional fields in history entry', async () => {
      const entry = createTestHistoryEntry('create_snapshots', {
        customField: 'custom_value',
        results: [{ database: 'db1', success: true }]
      });
      mockHistory.push(entry);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      const historyEntry = response.body.operations[0];

      expect(historyEntry.details).toBeDefined();
      expect(historyEntry.details.customField).toBe('custom_value');
      expect(historyEntry.details.results).toBeDefined();
    });

    test('should handle history entry with sequence number', async () => {
      const now = new Date();
      const entry1 = createTestHistoryEntry('create_snapshots');
      entry1.sequence = 1;
      entry1.timestamp = new Date(now.getTime() - 1000).toISOString(); // Older

      const entry2 = createTestHistoryEntry('create_snapshots');
      entry2.sequence = 2;
      entry2.timestamp = now.toISOString(); // Newer

      mockHistory.push(entry1, entry2);

      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body.operations.length).toBe(2);
      // Most recent first (by timestamp), so sequence 2 comes first
      expect(response.body.operations[0].sequence).toBe(2);
      expect(response.body.operations[1].sequence).toBe(1);
    });
  });

  describe('History Storage Integration', () => {
    test('should call getHistory on storage when fetching history', async () => {
      const storage = getStorage();
      storage.getHistory.mockReturnValue({ success: true, history: [] });

      await request(app)
        .get('/api/history');

      expect(storage.getHistory).toHaveBeenCalled();
    });

    test('should call clearHistory on storage when clearing history', async () => {
      const storage = getStorage();
      storage.clearHistory.mockReturnValue({ success: true });

      await request(app)
        .delete('/api/history');

      expect(storage.clearHistory).toHaveBeenCalled();
    });

    test('should handle addHistoryEntry result', async () => {
      const storage = getStorage();
      const entry = createTestHistoryEntry('create_snapshots');

      const result = await storage.addHistoryEntry(entry);

      expect(result.success).toBe(true);
      expect(mockHistory.length).toBe(1);
      expect(mockHistory[0].type).toBe('create_snapshots');
    });
  });
});

// Cleanup timers after all tests
afterAll(() => {
  cleanupTimers();
});

