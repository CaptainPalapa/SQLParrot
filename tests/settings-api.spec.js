const request = require('supertest');

// Mock mssql module
jest.mock('mssql');

// Mock MetadataStorage before requiring server
let mockSettings = {
  maxHistoryEntries: 100,
  defaultGroup: '',
  autoCreateCheckpoint: true,
  autoVerificationEnabled: false,
  autoVerificationIntervalMinutes: 15,
  passwordHash: null,
  passwordSkipped: false
};

const createMockStorage = () => ({
  initialize: jest.fn(async () => {}),
  close: jest.fn(async () => {}),
  getSettings: jest.fn(() => ({
    success: true,
    settings: { ...mockSettings }
  })),
  updateSettings: jest.fn((settings) => {
    // Merge new settings with existing ones
    mockSettings = { ...mockSettings, ...settings };
    return { success: true };
  }),
  getPasswordStatus: jest.fn(async () => ({
    success: true,
    status: 'not-set',
    passwordHash: null,
    passwordSkipped: false
  })),
  userName: 'test-user'
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
  // Reset mock settings to defaults before each test
  mockSettings = {
    maxHistoryEntries: 100,
    defaultGroup: '',
    autoCreateCheckpoint: true,
    autoVerificationEnabled: false,
    autoVerificationIntervalMinutes: 15,
    passwordHash: null,
    passwordSkipped: false
  };
  
  // Reset mock implementations
  mockStorageInstance.getSettings.mockImplementation(() => ({
    success: true,
    settings: { ...mockSettings }
  }));
  
  mockStorageInstance.updateSettings.mockImplementation((settings) => {
    mockSettings = { ...mockSettings, ...settings };
    return { success: true };
  });
  
  jest.clearAllMocks();
});

describe('Settings API - autoCreateCheckpoint persistence', () => {
  describe('GET /api/settings', () => {
    it('should return autoCreateCheckpoint in preferences', async () => {
      mockSettings.autoCreateCheckpoint = true;
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences).toHaveProperty('autoCreateCheckpoint');
      expect(response.body.preferences.autoCreateCheckpoint).toBe(true);
    });

    it('should return false when autoCreateCheckpoint is false', async () => {
      mockSettings.autoCreateCheckpoint = false;
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body.preferences.autoCreateCheckpoint).toBe(false);
    });

    it('should default to true when autoCreateCheckpoint is undefined', async () => {
      delete mockSettings.autoCreateCheckpoint;
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      // Should default to true using ?? operator
      expect(response.body.preferences.autoCreateCheckpoint).toBe(true);
    });
  });

  describe('PUT /api/settings', () => {
    it('should save autoCreateCheckpoint when provided', async () => {
      const newSettings = {
        preferences: {
          maxHistoryEntries: 100,
          defaultGroup: '',
          autoCreateCheckpoint: false
        },
        autoVerification: {
          enabled: false,
          intervalMinutes: 15
        }
      };
      
      const response = await request(app)
        .put('/api/settings')
        .send(newSettings)
        .expect(200);
      
      // Verify response includes autoCreateCheckpoint
      expect(response.body.preferences).toHaveProperty('autoCreateCheckpoint');
      expect(response.body.preferences.autoCreateCheckpoint).toBe(false);
      
      // Verify it was actually saved (check mockSettings)
      expect(mockSettings.autoCreateCheckpoint).toBe(false);
    });

    it('should save autoCreateCheckpoint as true when provided', async () => {
      mockSettings.autoCreateCheckpoint = false; // Start with false
      
      const newSettings = {
        preferences: {
          maxHistoryEntries: 100,
          defaultGroup: '',
          autoCreateCheckpoint: true
        },
        autoVerification: {
          enabled: false,
          intervalMinutes: 15
        }
      };
      
      const response = await request(app)
        .put('/api/settings')
        .send(newSettings)
        .expect(200);
      
      expect(response.body.preferences.autoCreateCheckpoint).toBe(true);
      expect(mockSettings.autoCreateCheckpoint).toBe(true);
    });

    it('should default to true when autoCreateCheckpoint is not provided', async () => {
      mockSettings.autoCreateCheckpoint = false; // Start with false
      
      const newSettings = {
        preferences: {
          maxHistoryEntries: 150,
          defaultGroup: 'test-group'
          // autoCreateCheckpoint not provided
        },
        autoVerification: {
          enabled: false,
          intervalMinutes: 15
        }
      };
      
      const response = await request(app)
        .put('/api/settings')
        .send(newSettings)
        .expect(200);
      
      // Should default to true using ?? operator
      expect(response.body.preferences.autoCreateCheckpoint).toBe(true);
      expect(mockSettings.autoCreateCheckpoint).toBe(true);
    });

    it('should persist autoCreateCheckpoint and return it in subsequent GET', async () => {
      // First, set it to false
      const putResponse = await request(app)
        .put('/api/settings')
        .send({
          preferences: {
            maxHistoryEntries: 100,
            defaultGroup: '',
            autoCreateCheckpoint: false
          },
          autoVerification: {
            enabled: false,
            intervalMinutes: 15
          }
        })
        .expect(200);
      
      expect(putResponse.body.preferences.autoCreateCheckpoint).toBe(false);
      
      // Then verify GET returns the saved value
      const getResponse = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(getResponse.body.preferences.autoCreateCheckpoint).toBe(false);
    });

    it('should preserve other settings when updating autoCreateCheckpoint', async () => {
      mockSettings.maxHistoryEntries = 200;
      mockSettings.defaultGroup = 'existing-group';
      
      const newSettings = {
        preferences: {
          maxHistoryEntries: 200,
          defaultGroup: 'existing-group',
          autoCreateCheckpoint: false
        },
        autoVerification: {
          enabled: true,
          intervalMinutes: 30
        }
      };
      
      const response = await request(app)
        .put('/api/settings')
        .send(newSettings)
        .expect(200);
      
      // Verify all settings are preserved
      expect(response.body.preferences.maxHistoryEntries).toBe(200);
      expect(response.body.preferences.defaultGroup).toBe('existing-group');
      expect(response.body.preferences.autoCreateCheckpoint).toBe(false);
      expect(response.body.autoVerification.enabled).toBe(true);
      expect(response.body.autoVerification.intervalMinutes).toBe(30);
    });
  });
});
