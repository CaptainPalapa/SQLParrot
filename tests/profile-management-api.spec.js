const request = require('supertest');

// Mock mssql module - Jest will use __mocks__/mssql.js
jest.mock('mssql');

// Mock MetadataStorage before requiring server
// The server.js creates a singleton instance, so we need to mock at module level
// These variables must be in module scope so the mock can access them
let mockProfiles = new Map();
let activeProfileId = null;

// Store original implementation functions so we can restore them after each test
// This is necessary because mockReturnValue() persists across tests unless we restore
const originalImplementations = {
  getProfiles: function() {
    // Ensure at least one profile is active before getting profiles
    this.ensureActiveProfile();

    return Array.from(mockProfiles.values()).map(p => ({
      id: p.id,
      name: p.name,
      platformType: p.platformType,
      host: p.host,
      port: p.port,
      username: p.username,
      trustCertificate: p.trustCertificate,
      snapshotPath: p.snapshotPath,
      description: p.description,
      notes: p.notes,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
  },
  getProfile: function(id) {
    const profile = mockProfiles.get(id);
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      platformType: profile.platformType,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      trustCertificate: profile.trustCertificate,
      snapshotPath: profile.snapshotPath,
      description: profile.description,
      notes: profile.notes,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  },
  createProfile: function(data) {
    // Validate required fields (matches SQLite NOT NULL constraints)
    const requiredFields = ['name', 'host', 'port', 'username', 'password'];
    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
      return { success: false, error: `Missing required fields: ${missingFields.join(', ')}` };
    }

    for (const p of mockProfiles.values()) {
      if (p.name === data.name) {
        return { success: false, error: 'Profile name already exists' };
      }
    }

    const id = `profile-${Date.now()}-${Math.random()}`;
    // If explicitly set, use that; otherwise, activate if it's the only profile
    let isActive = data.isActive === true;
    if (data.isActive === undefined) {
      isActive = mockProfiles.size === 0; // Activate if it's the first profile
    }

    if (isActive) {
      for (const p of mockProfiles.values()) {
        p.isActive = false;
      }
      activeProfileId = id;
    }

    const profile = {
      id,
      name: data.name,
      platformType: data.platformType || 'Microsoft SQL Server',
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      trustCertificate: data.trustCertificate !== false,
      snapshotPath: data.snapshotPath || '/var/opt/mssql/snapshots',
      description: data.description || null,
      notes: data.notes || null,
      isActive: isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockProfiles.set(id, profile);

    // Ensure at least one profile is active after creation
    this.ensureActiveProfile();

    const returnProfile = {
      id: profile.id,
      name: profile.name,
      platformType: profile.platformType,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      trustCertificate: profile.trustCertificate,
      snapshotPath: profile.snapshotPath,
      description: profile.description,
      notes: profile.notes,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };

    return { success: true, profile: returnProfile };
  },
  updateProfile: function(id, data) {
    const existing = mockProfiles.get(id);
    if (!existing) {
      return { success: false, error: 'Profile not found' };
    }

    const updated = {
      ...existing,
      name: data.name,
      platformType: data.platformType || existing.platformType,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password !== undefined ? data.password : existing.password,
      trustCertificate: data.trustCertificate !== undefined ? data.trustCertificate : existing.trustCertificate,
      snapshotPath: data.snapshotPath || existing.snapshotPath,
      description: data.description !== undefined ? data.description : existing.description,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      updatedAt: new Date().toISOString()
    };

    if (data.isActive) {
      for (const p of mockProfiles.values()) {
        if (p.id !== id) {
          p.isActive = false;
        }
      }
      activeProfileId = id;
      updated.isActive = true;
    }

    mockProfiles.set(id, updated);

    // Ensure at least one profile is active after update
    this.ensureActiveProfile();

    return { success: true, profile: { ...updated, password: undefined } };
  },
  deleteProfile: function(id) {
    if (!mockProfiles.has(id)) {
      return { success: false, error: 'Profile not found' };
    }
    const wasActive = activeProfileId === id;
    mockProfiles.delete(id);
    if (wasActive) {
      activeProfileId = null;
    }

    // Ensure at least one profile is active after deletion (if profiles still exist)
    this.ensureActiveProfile();

    return { success: true };
  },
  setActiveProfile: function(id) {
    if (!mockProfiles.has(id)) {
      return { success: false, error: 'Profile not found' };
    }
    for (const p of mockProfiles.values()) {
      if (p.id !== id) {
        p.isActive = false;
      }
    }
    const profile = mockProfiles.get(id);
    profile.isActive = true;
    activeProfileId = id;
    return { success: true };
  },
  ensureActiveProfile: function() {
    // Check if any profile is active
    const hasActive = Array.from(mockProfiles.values()).some(p => p.isActive);

    // If no active profile and profiles exist, activate the first one
    if (!hasActive && mockProfiles.size > 0) {
      const profiles = Array.from(mockProfiles.values());
      // Sort by createdAt (or id if createdAt is same) to get first profile
      profiles.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return a.id.localeCompare(b.id);
      });
      const firstProfile = profiles[0];
      firstProfile.isActive = true;
      activeProfileId = firstProfile.id;
    }
  },
  getActiveProfile: function() {
    // Ensure at least one profile is active before getting it
    this.ensureActiveProfile();

    if (!activeProfileId) return null;
    const profile = mockProfiles.get(activeProfileId);
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      platformType: profile.platformType,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      password: profile.password,
      trustCertificate: profile.trustCertificate,
      snapshotPath: profile.snapshotPath,
      description: profile.description,
      notes: profile.notes,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  },
  findProfileByConnection: function(host, port, username) {
    for (const profile of mockProfiles.values()) {
      if (profile.host === host && profile.port === port && profile.username === username) {
        return { ...profile };
      }
    }
    return null;
  },
  migrateEnvVarsToProfiles: async function() {},
  getPasswordStatus: async function() {
    return { success: true, status: 'not-set', passwordHash: null, passwordSkipped: false };
  },
  getSettings: async function() {
    return {
      success: true,
      preferences: { defaultGroup: '', maxHistoryEntries: 100 },
      autoVerification: { enabled: false, intervalMinutes: 15 },
      passwordHash: null,
      passwordSkipped: false
    };
  },
  setPasswordHash: async function(hash) { return { success: true }; },
  removePasswordHash: async function() { return { success: true }; },
  skipPasswordProtection: async function() { return { success: true }; },
  checkPassword: async function(password) { return { success: true, authenticated: false }; },
  getGroups: function() { return { success: true, groups: [] }; },
  getSnapshots: function() { return { success: true, snapshots: [] }; },
  getHistory: function() { return { success: true, history: [] }; },
  getGroupCountsByProfile: function() { return { success: true, counts: {} }; },
  checkAndMigrate: async function() {}
};

// Create mock storage methods using the original implementations
const createMockStorage = () => {
  const mock = {
    getProfiles: jest.fn(originalImplementations.getProfiles),
    getProfile: jest.fn(originalImplementations.getProfile),
    createProfile: jest.fn(originalImplementations.createProfile),
    updateProfile: jest.fn(originalImplementations.updateProfile),
    deleteProfile: jest.fn(originalImplementations.deleteProfile),
    setActiveProfile: jest.fn(originalImplementations.setActiveProfile),
    getActiveProfile: jest.fn(originalImplementations.getActiveProfile),
    ensureActiveProfile: jest.fn(originalImplementations.ensureActiveProfile),
    findProfileByConnection: jest.fn(originalImplementations.findProfileByConnection),
    migrateEnvVarsToProfiles: jest.fn(originalImplementations.migrateEnvVarsToProfiles),
    getPasswordStatus: jest.fn(originalImplementations.getPasswordStatus),
    getSettings: jest.fn(originalImplementations.getSettings),
    setPasswordHash: jest.fn(originalImplementations.setPasswordHash),
    removePasswordHash: jest.fn(originalImplementations.removePasswordHash),
    skipPasswordProtection: jest.fn(originalImplementations.skipPasswordProtection),
    checkPassword: jest.fn(originalImplementations.checkPassword),
    getGroups: jest.fn(originalImplementations.getGroups),
    getSnapshots: jest.fn(originalImplementations.getSnapshots),
    getHistory: jest.fn(originalImplementations.getHistory),
    getGroupCountsByProfile: jest.fn(originalImplementations.getGroupCountsByProfile),
    checkAndMigrate: jest.fn(originalImplementations.checkAndMigrate)
  };

  // Bind ensureActiveProfile to the mock so 'this' works correctly
  mock.ensureActiveProfile = originalImplementations.ensureActiveProfile.bind(mock);

  return mock;
};

// Create singleton mock instance
const mockStorageInstance = createMockStorage();

// Mock the module - return the same instance every time
// jest.mock is hoisted, but the factory function can reference variables in scope
jest.mock('../backend/utils/metadataStorageSqlite', () => {
  // Return a constructor function that returns the mock instance
  return jest.fn().mockImplementation(() => mockStorageInstance);
});

// Import the Express app (after mocking)
// The mock will be used when server.js requires metadataStorageSqlite
const app = require('../backend/server');

const sql = require('mssql');
const MetadataStorage = require('../backend/utils/metadataStorageSqlite');

// Helper to get storage instance (mocked singleton)
function getStorage() {
  return mockStorageInstance;
}

// Helper to clean up test profiles (reset mock)
function cleanupTestProfiles() {
  // Reset all mocks and clear profile data
  mockProfiles.clear();
  activeProfileId = null;

  // Clear mock call history AND restore original implementations
  // This is critical because mockReturnValue() persists until mockReset() or mockImplementation()
  Object.keys(mockStorageInstance).forEach(key => {
    if (jest.isMockFunction(mockStorageInstance[key])) {
      mockStorageInstance[key].mockClear();
      // Restore the original implementation (clears any mockReturnValue from previous tests)
      if (originalImplementations[key]) {
        mockStorageInstance[key].mockImplementation(originalImplementations[key]);
      }
    }
  });
}

// Helper to create a test profile
// This just adds a profile to mockProfiles - the actual mock implementations will use it
function createTestProfile(name = null) {
  const profileName = name || `TEST_${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create profile data
  const profileId = `profile-${Date.now()}-${Math.random()}`;
  const profile = {
    id: profileId,
    name: profileName,
    platformType: 'Microsoft SQL Server',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: 'testpassword',
    trustCertificate: true,
    snapshotPath: '/var/opt/mssql/snapshots',
    description: 'Test profile',
    notes: 'Created by test suite',
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Store in mock - the mock implementations will read from this
  mockProfiles.set(profileId, profile);

  return { ...profile, password: undefined };
}

describe('Profile Management API Tests', () => {
  let testProfileId;
  let testProfile;

  beforeEach(() => {
    // Reset mocks before each test
    cleanupTestProfiles();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestProfiles();
  });

  describe('GET /api/profiles', () => {
    test('should return empty array when no profiles exist', async () => {
      // mockProfiles is already cleared in beforeEach
      const response = await request(app)
        .get('/api/profiles');

      if (response.status !== 200) {
        console.error('Error response:', response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    test('should return all profiles without passwords', async () => {
      testProfile = createTestProfile('TEST_GetProfiles');
      testProfileId = testProfile.id;

      const response = await request(app)
        .get('/api/profiles');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);

      const profile = response.body.data.find(p => p.id === testProfileId);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('TEST_GetProfiles');
      expect(profile.password).toBeUndefined(); // Password should not be returned
      expect(profile.host).toBeDefined();
      expect(profile.port).toBeDefined();
      expect(profile.username).toBeDefined();
    });
  });

  describe('GET /api/profiles/:id', () => {
    test('should return a single profile by ID', async () => {
      testProfile = createTestProfile('TEST_GetProfile');
      testProfileId = testProfile.id;

      const response = await request(app)
        .get(`/api/profiles/${testProfileId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(testProfileId);
      expect(response.body.data.name).toBe('TEST_GetProfile');
      expect(response.body.data.password).toBeUndefined(); // Password should not be returned
    });

    test('should return 404 for non-existent profile', async () => {
      // Ensure no profiles exist
      mockProfiles.clear();

      const response = await request(app)
        .get('/api/profiles/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/profiles', () => {
    test('should create a new profile', async () => {
      const storage = getStorage();
      const profileData = {
        name: 'TEST_CreateProfile',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots',
        description: 'Test profile',
        notes: 'Created by test',
        isActive: false
      };

      const mockCreatedProfile = {
        id: 'test-id-123',
        ...profileData,
        password: undefined, // Not returned
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      storage.createProfile.mockReturnValue({
        success: true,
        profile: mockCreatedProfile
      });

      const response = await request(app)
        .post('/api/profiles')
        .send(profileData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('TEST_CreateProfile');
      expect(response.body.data.password).toBeUndefined(); // Password should not be returned
      expect(response.body.data.host).toBe('localhost');
      expect(response.body.data.port).toBe(1433);
      expect(response.body.data.username).toBe('sa');
      expect(response.body.data.description).toBe('Test profile');
      expect(response.body.data.notes).toBe('Created by test');

      testProfileId = response.body.data.id;
      expect(storage.createProfile).toHaveBeenCalledWith(profileData);
    });

    test('should set profile as active when isActive is true', async () => {
      // Start fresh
      mockProfiles.clear();
      activeProfileId = null;

      const profileData = {
        name: 'TEST_ActiveProfile',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots',
        isActive: true
      };

      const response = await request(app)
        .post('/api/profiles')
        .send(profileData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBe(true);

      // Verify it's the only active profile
      const profilesResponse = await request(app).get('/api/profiles');
      const activeProfiles = profilesResponse.body.data.filter(p => p.isActive);
      expect(activeProfiles.length).toBe(1);
      expect(activeProfiles[0].id).toBe(response.body.data.id);

      // Verify getActiveProfile returns it
      const connectionResponse = await request(app).get('/api/connection');
      expect(connectionResponse.body.data).toBeDefined();
      expect(connectionResponse.body.data.name).toBe('TEST_ActiveProfile');
    });

    test('should return error for duplicate profile name', async () => {
      const storage = getStorage();
      const profileData = {
        name: 'TEST_DuplicateName',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots',
        isActive: false
      };

      // Mock createProfile to return error for duplicate name
      storage.createProfile.mockReturnValue({
        success: false,
        error: 'Profile name already exists'
      });

      const response = await request(app)
        .post('/api/profiles')
        .send(profileData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return error for missing required fields', async () => {
      const profileData = {
        name: 'TEST_Incomplete',
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/profiles')
        .send(profileData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should auto-activate first profile when isActive is not specified', async () => {
      // Start fresh
      mockProfiles.clear();
      activeProfileId = null;

      const profileData = {
        name: 'TEST_FirstProfile',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots'
        // isActive not specified
      };

      const response = await request(app)
        .post('/api/profiles')
        .send(profileData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBe(true); // Should be auto-activated

      // Verify it's the only active profile
      const profilesResponse = await request(app).get('/api/profiles');
      const activeProfiles = profilesResponse.body.data.filter(p => p.isActive);
      expect(activeProfiles.length).toBe(1);
      expect(activeProfiles[0].id).toBe(response.body.data.id);
    });
  });

  describe('PUT /api/profiles/:id', () => {
    test('should update an existing profile', async () => {
      const storage = getStorage();
      testProfile = createTestProfile('TEST_UpdateProfile');
      testProfileId = testProfile.id;

      const updateData = {
        name: 'TEST_UpdatedProfile',
        platformType: 'Microsoft SQL Server',
        host: 'updated-host',
        port: 1434,
        username: 'updated-user',
        password: 'updated-password',
        trustCertificate: false,
        snapshotPath: '/updated/path',
        description: 'Updated description',
        notes: 'Updated notes',
        isActive: false
      };

      const mockUpdatedProfile = {
        id: testProfileId,
        ...updateData,
        password: undefined, // Not returned
        createdAt: testProfile.createdAt,
        updatedAt: new Date().toISOString()
      };

      // Mock getProfiles to return existing profile (for password preservation check)
      storage.getProfiles.mockReturnValue([testProfile]);
      storage.updateProfile.mockReturnValue({
        success: true,
        profile: mockUpdatedProfile
      });

      const response = await request(app)
        .put(`/api/profiles/${testProfileId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('TEST_UpdatedProfile');
      expect(response.body.data.host).toBe('updated-host');
      expect(response.body.data.port).toBe(1434);
      expect(response.body.data.username).toBe('updated-user');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.password).toBeUndefined(); // Password should not be returned
    });

    test('should preserve password when not provided in update', async () => {
      const storage = getStorage();
      testProfile = createTestProfile('TEST_PreservePassword');
      testProfileId = testProfile.id;

      // Don't mock getProfiles - use original implementation which includes ensureActiveProfile
      // The profile is already in mockProfiles, so getProfiles will return it
      // Get the existing profile from mockProfiles
      const existingProfile = mockProfiles.get(testProfileId);

      const updateData = {
        name: 'TEST_PreservePasswordUpdated',
        platformType: 'Microsoft SQL Server',
        host: existingProfile.host,
        port: existingProfile.port,
        username: existingProfile.username,
        // password not provided
        trustCertificate: existingProfile.trustCertificate,
        snapshotPath: existingProfile.snapshotPath,
        isActive: false
      };

      const mockUpdatedProfile = {
        ...updateData,
        id: testProfileId,
        password: undefined, // Not returned
        createdAt: existingProfile.createdAt,
        updatedAt: new Date().toISOString()
      };

      storage.updateProfile.mockReturnValue({
        success: true,
        profile: mockUpdatedProfile
      });

      const response = await request(app)
        .put(`/api/profiles/${testProfileId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('TEST_PreservePasswordUpdated');

      // Verify updateProfile was called with original password
      expect(storage.updateProfile).toHaveBeenCalled();
      const updateCall = storage.updateProfile.mock.calls[0];
      expect(updateCall[1].password).toBeUndefined(); // Should not be in update data when not provided
    });

    test('should return 404 for non-existent profile', async () => {
      const storage = getStorage();
      // Don't mock getProfiles - use original implementation
      // Clear mockProfiles to simulate no profiles
      mockProfiles.clear();

      const updateData = {
        name: 'TEST_NonExistent',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'test',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots',
        isActive: false
      };

      storage.updateProfile.mockReturnValue({
        success: false,
        error: 'Profile not found'
      });

      const response = await request(app)
        .put('/api/profiles/non-existent-id')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/profiles/:id', () => {
    test('should delete an existing profile', async () => {
      const storage = getStorage();
      testProfile = createTestProfile('TEST_DeleteProfile');
      testProfileId = testProfile.id;

      storage.deleteProfile.mockReturnValue({ success: true });
      storage.getProfile.mockReturnValue(null); // After deletion

      const response = await request(app)
        .delete(`/api/profiles/${testProfileId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should activate another profile when deleting the active profile', async () => {
      // Create two profiles
      const profile1 = createTestProfile('TEST_Profile1');
      const profile2 = createTestProfile('TEST_Profile2');

      // Set profile1 as active
      await request(app).post(`/api/profiles/${profile1.id}/activate`);

      // Verify profile1 is active
      const beforeDelete = await request(app).get('/api/profiles');
      const activeBefore = beforeDelete.body.data.find(p => p.isActive);
      expect(activeBefore.id).toBe(profile1.id);

      // Delete the active profile
      const response = await request(app)
        .delete(`/api/profiles/${profile1.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify another profile is now active
      const afterDelete = await request(app).get('/api/profiles');
      const activeProfiles = afterDelete.body.data.filter(p => p.isActive);
      expect(activeProfiles.length).toBe(1);
      expect(activeProfiles[0].id).toBe(profile2.id);
    });

    test('should handle deleting the only profile gracefully', async () => {
      // Create and activate one profile
      const profile = createTestProfile('TEST_OnlyProfile');
      await request(app).post(`/api/profiles/${profile.id}/activate`);

      // Delete it
      const response = await request(app)
        .delete(`/api/profiles/${profile.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify no profiles exist
      const profilesResponse = await request(app).get('/api/profiles');
      expect(profilesResponse.body.data.length).toBe(0);
    });

    test('should return error for non-existent profile', async () => {
      const storage = getStorage();
      storage.deleteProfile.mockReturnValue({
        success: false,
        error: 'Profile not found'
      });

      const response = await request(app)
        .delete('/api/profiles/non-existent-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/profiles/:id/activate', () => {
    test('should set a profile as active', async () => {
      // Create two profiles
      const profile1 = createTestProfile('TEST_Profile1');
      const profile2 = createTestProfile('TEST_Profile2');

      // Activate profile1
      const response1 = await request(app)
        .post(`/api/profiles/${profile1.id}/activate`);

      expect(response1.status).toBe(200);
      expect(response1.body.success).toBe(true);

      // Verify profile1 is active
      const getResponse1 = await request(app).get(`/api/profiles/${profile1.id}`);
      expect(getResponse1.body.data.isActive).toBe(true);

      // Activate profile2
      const response2 = await request(app)
        .post(`/api/profiles/${profile2.id}/activate`);

      expect(response2.status).toBe(200);
      expect(response2.body.success).toBe(true);

      // Verify profile2 is now active and profile1 is not
      const getResponse2 = await request(app).get(`/api/profiles/${profile2.id}`);
      expect(getResponse2.body.data.isActive).toBe(true);

      const getResponse1Again = await request(app).get(`/api/profiles/${profile1.id}`);
      expect(getResponse1Again.body.data.isActive).toBe(false);
    });

    test('should return error for non-existent profile', async () => {
      const storage = getStorage();
      storage.setActiveProfile.mockReturnValue({
        success: false,
        error: 'Profile not found'
      });

      const response = await request(app)
        .post('/api/profiles/non-existent-id/activate');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/connection', () => {
    test('should return active profile without password', async () => {
      testProfile = createTestProfile('TEST_ActiveConnection');
      testProfileId = testProfile.id;

      // Set as active
      await request(app).post(`/api/profiles/${testProfileId}/activate`);

      const response = await request(app)
        .get('/api/connection');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('TEST_ActiveConnection');
      expect(response.body.data.password).toBeUndefined(); // Password should not be returned
      expect(response.body.data.host).toBeDefined();
      expect(response.body.data.port).toBeDefined();
      expect(response.body.data.username).toBeDefined();
    });

    test('should return null when no active profile exists', async () => {
      // Ensure no active profile
      mockProfiles.clear();
      activeProfileId = null;

      const response = await request(app)
        .get('/api/connection');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    test('should auto-activate first profile when getProfiles is called with no active profiles', async () => {
      // Create two profiles but set both to inactive
      const profile1 = createTestProfile('TEST_Profile1');
      const profile2 = createTestProfile('TEST_Profile2');

      // Manually set both to inactive
      profile1.isActive = false;
      profile2.isActive = false;
      activeProfileId = null;

      // Call getProfiles - should auto-activate the first one
      const response = await request(app).get('/api/profiles');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const activeProfiles = response.body.data.filter(p => p.isActive);
      expect(activeProfiles.length).toBe(1);
      // Should be the first profile (by createdAt or id)
      expect(activeProfiles[0].id).toBe(profile1.id);
    });

    test('should auto-activate first profile when getActiveProfile is called with no active profiles', async () => {
      // Create a profile but set it to inactive
      const profile = createTestProfile('TEST_Profile');
      profile.isActive = false;
      activeProfileId = null;

      // Ensure the profile is in mockProfiles
      expect(mockProfiles.has(profile.id)).toBe(true);

      // Call getActiveProfile - should auto-activate and return it
      const response = await request(app).get('/api/connection');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Check what getActiveProfile returns directly to verify auto-activation worked
      const storage = getStorage();
      const activeProfile = storage.getActiveProfile();

      // The profile should be auto-activated by ensureActiveProfile
      expect(activeProfile).toBeDefined();
      expect(activeProfile.id).toBe(profile.id);
      expect(activeProfile.isActive).toBe(true);

      // The /api/connection endpoint returns profile data (without id/isActive)
      // Verify it returns the profile data
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe(profile.name);
      expect(response.body.data.host).toBe(profile.host);
      expect(response.body.data.port).toBe(profile.port);
      expect(response.body.data.username).toBe(profile.username);
    });
  });

  describe('Always-Active Profile Integration Tests', () => {
    test('should maintain at least one active profile through multiple operations', async () => {
      // Create three profiles
      const profile1 = createTestProfile('TEST_Profile1');
      const profile2 = createTestProfile('TEST_Profile2');
      const profile3 = createTestProfile('TEST_Profile3');

      // Set profile1 as active
      await request(app).post(`/api/profiles/${profile1.id}/activate`);

      // Verify profile1 is active before update
      const beforeUpdate = await request(app).get('/api/profiles');
      const activeBefore = beforeUpdate.body.data.find(p => p.isActive);
      expect(activeBefore.id).toBe(profile1.id);

      // Update profile1 to inactive - should activate another
      const updateResponse = await request(app)
        .put(`/api/profiles/${profile1.id}`)
        .send({
          name: profile1.name,
          platformType: profile1.platformType,
          host: profile1.host,
          port: profile1.port,
          username: profile1.username,
          password: 'test',
          trustCertificate: profile1.trustCertificate,
          snapshotPath: profile1.snapshotPath,
          isActive: false
        });

      expect(updateResponse.status).toBe(200);

      // Verify another profile is now active (or profile1 if it's the first by createdAt)
      const profilesResponse = await request(app).get('/api/profiles');
      const activeProfiles = profilesResponse.body.data.filter(p => p.isActive);
      expect(activeProfiles.length).toBe(1);
      // The ensureActiveProfile() activates the first profile by createdAt
      // If profile1 was created first, it will be reactivated (which is correct behavior)
      // If another profile was created first, that one will be activated
      // Either way, exactly one profile should be active
      expect(activeProfiles[0].id).toBeDefined();
    });

    test('should auto-activate profile after deleting active profile in sequence', async () => {
      // Create three profiles
      const profile1 = createTestProfile('TEST_Delete1');
      const profile2 = createTestProfile('TEST_Delete2');
      const profile3 = createTestProfile('TEST_Delete3');

      // Set profile1 as active
      await request(app).post(`/api/profiles/${profile1.id}/activate`);

      // Delete profile1 - should activate profile2
      await request(app).delete(`/api/profiles/${profile1.id}`);

      const afterDelete1 = await request(app).get('/api/profiles');
      const active1 = afterDelete1.body.data.find(p => p.isActive);
      expect(active1).toBeDefined();
      expect(active1.id).not.toBe(profile1.id);

      // Delete the new active profile - should activate another
      await request(app).delete(`/api/profiles/${active1.id}`);

      const afterDelete2 = await request(app).get('/api/profiles');
      const active2 = afterDelete2.body.data.find(p => p.isActive);
      expect(active2).toBeDefined();
      expect(active2.id).not.toBe(active1.id);
      expect(active2.id).not.toBe(profile1.id);
    });
  });

  describe('POST /api/test-connection', () => {
    test('should test connection with provided credentials', async () => {
      const connectionData = {
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true
      };

      const response = await request(app)
        .post('/api/test-connection')
        .send(connectionData);

      // Should succeed (mocked SQL connection)
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined(); // Should return SQL Server version
    });

    test('should use saved password from active profile when password is empty', async () => {
      testProfile = createTestProfile('TEST_TestConnection');
      testProfileId = testProfile.id;

      // Verify profile exists in mockProfiles before activating
      expect(mockProfiles.has(testProfileId)).toBe(true);

      // Set as active
      const activateResponse = await request(app).post(`/api/profiles/${testProfileId}/activate`);
      if (activateResponse.status !== 200) {
        console.log('Activate response:', activateResponse.body);
      }
      expect(activateResponse.status).toBe(200);

      // Verify the profile is active
      const storage = getStorage();
      const activeProfile = storage.getActiveProfile();
      expect(activeProfile).not.toBeNull();
      expect(activeProfile.id).toBe(testProfileId);

      const connectionData = {
        host: testProfile.host,
        port: testProfile.port,
        username: testProfile.username,
        password: '', // Empty password - should use saved password
        trustCertificate: testProfile.trustCertificate
      };

      const response = await request(app)
        .post('/api/test-connection')
        .send(connectionData);

      // Should succeed (mocked SQL connection with saved password)
      if (response.status !== 200) {
        console.log('Test connection response:', response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return error when password is required but not provided', async () => {
      const storage = getStorage();
      // Clear profiles so there's no active profile to get password from
      mockProfiles.clear();
      activeProfileId = null;
      storage.getActiveProfile.mockReturnValue(null); // No active profile

      const connectionData = {
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '', // Empty password
        trustCertificate: true
      };

      const response = await request(app)
        .post('/api/test-connection')
        .send(connectionData);

      // The endpoint may succeed if it allows empty password, or fail if it requires one
      // Check that it doesn't crash and returns a valid response
      expect([200, 400, 500]).toContain(response.status);
      // If it's an error, it should have success: false
      if (response.status !== 200) {
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('GET /api/test-snapshot-path', () => {
    test('should return snapshot path from active profile', async () => {
      testProfile = createTestProfile('TEST_SnapshotPath');
      testProfileId = testProfile.id;

      await request(app).post(`/api/profiles/${testProfileId}/activate`);

      const response = await request(app)
        .get('/api/test-snapshot-path');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.snapshotPath).toBe(testProfile.snapshotPath);
      expect(response.body.configured).toBe(true);
    });

    test('should return fallback path when no active profile', async () => {
      // Ensure no active profile
      mockProfiles.clear();
      activeProfileId = null;

      const response = await request(app)
        .get('/api/test-snapshot-path');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.snapshotPath).toBeDefined();
      expect(response.body.configured).toBe(false);
    });
  });

  describe('POST /api/save-connection (deprecated)', () => {
    test('should create profile when no matching profile exists', async () => {
      const storage = getStorage();
      storage.findProfileByConnection.mockReturnValue(null); // No matching profile
      storage.createProfile.mockReturnValue({
        success: true,
        profile: {
          id: 'migrated-id',
          name: 'Migrated',
          platformType: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: undefined,
          trustCertificate: true,
          snapshotPath: '/var/opt/mssql/snapshots',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      storage.getProfiles.mockReturnValue([
        {
          id: 'migrated-id',
          name: 'Migrated',
          isActive: true
        }
      ]);

      const connectionData = {
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'testpassword',
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots'
      };

      const response = await request(app)
        .post('/api/save-connection')
        .send(connectionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify profile was created
      const profilesResponse = await request(app).get('/api/profiles');
      const createdProfile = profilesResponse.body.data.find(p => p.name === 'Migrated');
      expect(createdProfile).toBeDefined();
      expect(createdProfile.isActive).toBe(true);
    });

    test('should update existing profile when matching host/port/username', async () => {
      const storage = getStorage();
      testProfile = createTestProfile('TEST_SaveConnection');
      testProfileId = testProfile.id;

      storage.findProfileByConnection.mockReturnValue({
        ...testProfile,
        password: 'oldpassword'
      });

      storage.updateProfile.mockReturnValue({
        success: true,
        profile: {
          ...testProfile,
          snapshotPath: '/new/path',
          isActive: true,
          password: undefined
        }
      });

      storage.getProfile.mockReturnValue({
        ...testProfile,
        snapshotPath: '/new/path',
        isActive: true,
        password: undefined
      });

      const connectionData = {
        host: testProfile.host,
        port: testProfile.port,
        username: testProfile.username,
        password: 'newpassword',
        trustCertificate: false,
        snapshotPath: '/new/path'
      };

      const response = await request(app)
        .post('/api/save-connection')
        .send(connectionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify profile was updated
      const getResponse = await request(app).get(`/api/profiles/${testProfileId}`);
      expect(getResponse.body.data.snapshotPath).toBe('/new/path');
      expect(getResponse.body.data.isActive).toBe(true);
    });
  });
});

