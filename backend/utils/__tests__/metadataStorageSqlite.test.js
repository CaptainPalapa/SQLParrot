// Mock better-sqlite3 before requiring MetadataStorage
jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn(),
    exec: jest.fn(),
    close: jest.fn()
  };

  return jest.fn(() => mockDb);
});

const MetadataStorage = require('../metadataStorageSqlite');

describe('MetadataStorage SQLite Tests', () => {
  let storage;
  let mockDb;
  let mockStmt;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock statement
    mockStmt = {
      run: jest.fn().mockReturnValue({ changes: 1 }),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
      queryRow: jest.fn()
    };

    // Create mock database
    const betterSqlite3 = require('better-sqlite3');
    mockDb = betterSqlite3();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockDb.exec.mockReturnValue(undefined);

    // Create storage instance
    storage = new MetadataStorage();

    // Replace the internal db with our mock
    storage.db = mockDb;
  });

  describe('Profile Management', () => {
    test('should create a profile', () => {
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
        notes: 'Test notes',
        isActive: false
      };

      // Mock the getProfiles call to return empty array (no active profiles)
      mockStmt.all.mockReturnValueOnce([]);

      // Mock the insert statement
      const insertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 })
      };
      mockDb.prepare.mockReturnValueOnce(mockStmt); // For getProfiles check
      mockDb.prepare.mockReturnValueOnce(insertStmt); // For insert

      // Mock getProfile to return the created profile
      const getStmt = {
        get: jest.fn().mockReturnValue({
          id: 'test-id-123',
          name: 'TEST_CreateProfile',
          platform_type: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: 'testpassword',
          trust_certificate: 1,
          snapshot_path: '/var/opt/mssql/snapshots',
          description: 'Test profile',
          notes: 'Test notes',
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
      };
      mockDb.prepare.mockReturnValueOnce(getStmt); // For getProfile

      const result = storage.createProfile(profileData);

      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile.name).toBe('TEST_CreateProfile');
      expect(result.profile.host).toBe('localhost');
      expect(result.profile.port).toBe(1433);
      expect(result.profile.username).toBe('sa');
      expect(result.profile.description).toBe('Test profile');
      expect(result.profile.notes).toBe('Test notes');
      expect(result.profile.password).toBeUndefined(); // Password should not be returned
    });

    test('should get all profiles', () => {
      // Mock getProfiles to return test data
      mockStmt.all.mockReturnValue([
        {
          id: 'test-id-1',
          name: 'TEST_GetProfiles',
          platform_type: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: 'test', // Should not be in returned data
          trust_certificate: 1,
          snapshot_path: '/var/opt/mssql/snapshots',
          description: null,
          notes: null,
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]);

      const profiles = storage.getProfiles();
      expect(Array.isArray(profiles)).toBe(true);
      expect(profiles.length).toBe(1);

      const testProfile = profiles[0];
      expect(testProfile.name).toBe('TEST_GetProfiles');
      expect(testProfile.password).toBeUndefined(); // Password should not be returned
      expect(testProfile.host).toBe('localhost');
      expect(testProfile.port).toBe(1433);
    });

    test('should get a profile by ID', () => {
      const testId = 'test-id-123';

      // Mock getProfile to return test data
      mockStmt.get.mockReturnValue({
        id: testId,
        name: 'TEST_GetProfile',
        platform_type: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'test', // Should not be in returned data
        trust_certificate: 1,
        snapshot_path: '/var/opt/mssql/snapshots',
        description: null,
        notes: null,
        is_active: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });

      const profile = storage.getProfile(testId);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('TEST_GetProfile');
      expect(profile.password).toBeUndefined(); // Password should not be returned
      expect(mockStmt.get).toHaveBeenCalledWith(testId);
    });

    test('should update a profile', () => {
      const testId = 'test-id-123';

      // Mock getProfile to return existing profile (for password preservation check)
      const getStmt = {
        get: jest.fn().mockReturnValue({
          id: testId,
          name: 'TEST_UpdateProfile',
          platform_type: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: 'original',
          trust_certificate: 1,
          snapshot_path: '/var/opt/mssql/snapshots',
          description: null,
          notes: null,
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
      };

      // Mock update statement
      const updateStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };

      // Mock getProfile after update
      const getAfterUpdateStmt = {
        get: jest.fn().mockReturnValue({
          id: testId,
          name: 'TEST_UpdatedProfile',
          platform_type: 'Microsoft SQL Server',
          host: 'updated-host',
          port: 1434,
          username: 'updated-user',
          password: 'updated-password',
          trust_certificate: 0,
          snapshot_path: '/updated/path',
          description: 'Updated',
          notes: 'Updated notes',
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
      };

      mockDb.prepare
        .mockReturnValueOnce(getStmt) // For getting existing profile
        .mockReturnValueOnce(updateStmt) // For update
        .mockReturnValueOnce(getAfterUpdateStmt); // For getProfile after update

      const updateResult = storage.updateProfile(testId, {
        name: 'TEST_UpdatedProfile',
        platformType: 'Microsoft SQL Server',
        host: 'updated-host',
        port: 1434,
        username: 'updated-user',
        password: 'updated-password',
        trustCertificate: false,
        snapshotPath: '/updated/path',
        description: 'Updated',
        notes: 'Updated notes',
        isActive: false
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.profile.name).toBe('TEST_UpdatedProfile');
      expect(updateResult.profile.host).toBe('updated-host');
      expect(updateResult.profile.port).toBe(1434);
      expect(updateResult.profile.username).toBe('updated-user');
    });

    test('should preserve password when not provided in update', () => {
      const testId = 'test-id-123';
      const originalPassword = 'original-password';

      // Mock getProfile to return existing profile with password
      const getStmt = {
        get: jest.fn().mockReturnValue({
          id: testId,
          name: 'TEST_PreservePassword',
          platform_type: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: originalPassword,
          trust_certificate: 1,
          snapshot_path: '/var/opt/mssql/snapshots',
          description: null,
          notes: null,
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
      };

      // Mock update statement (should use original password)
      const updateStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };

      // Mock getProfile after update (should still have original password)
      const getAfterUpdateStmt = {
        get: jest.fn().mockReturnValue({
          id: testId,
          name: 'TEST_PreservePasswordUpdated',
          platform_type: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: originalPassword, // Password preserved
          trust_certificate: 1,
          snapshot_path: '/var/opt/mssql/snapshots',
          description: null,
          notes: null,
          is_active: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
      };

      mockDb.prepare
        .mockReturnValueOnce(getStmt) // For getting existing profile
        .mockReturnValueOnce(updateStmt) // For update
        .mockReturnValueOnce(getAfterUpdateStmt); // For getProfile after update

      const updateResult = storage.updateProfile(testId, {
        name: 'TEST_PreservePasswordUpdated',
        platformType: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        // password not provided - should preserve original
        trustCertificate: true,
        snapshotPath: '/var/opt/mssql/snapshots',
        isActive: false
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.profile.name).toBe('TEST_PreservePasswordUpdated');
      // Verify update was called with original password
      expect(updateStmt.run).toHaveBeenCalled();
      const updateCall = updateStmt.run.mock.calls[0];
      expect(updateCall[0]).toContain(originalPassword); // Password should be in update params
    });

    test('should delete a profile', () => {
      const testId = 'test-id-123';

      // Mock delete statement
      const deleteStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };

      mockDb.prepare.mockReturnValueOnce(deleteStmt);

      const deleteResult = storage.deleteProfile(testId);
      expect(deleteResult.success).toBe(true);
      expect(deleteStmt.run).toHaveBeenCalledWith(testId);
    });

    test('should set active profile', () => {
      const profile1Id = 'test-id-1';
      const profile2Id = 'test-id-2';

      // Mock setActiveProfile - deactivate all, then activate profile2
      const deactivateAllStmt = {
        run: jest.fn().mockReturnValue({ changes: 2 })
      };

      const activateStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };

      mockDb.prepare
        .mockReturnValueOnce(deactivateAllStmt) // Deactivate all
        .mockReturnValueOnce(activateStmt); // Activate profile2

      const result = storage.setActiveProfile(profile2Id);
      expect(result.success).toBe(true);
      expect(deactivateAllStmt.run).toHaveBeenCalled();
      expect(activateStmt.run).toHaveBeenCalledWith(expect.any(String), profile2Id);
    });

    test('should get active profile', () => {
      const testId = 'test-id-123';

      // Mock getActiveProfile to return active profile with password
      mockStmt.get.mockReturnValue({
        id: testId,
        name: 'TEST_GetActive',
        platform_type: 'Microsoft SQL Server',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: 'test', // Should be included for active profile
        trust_certificate: 1,
        snapshot_path: '/var/opt/mssql/snapshots',
        description: null,
        notes: null,
        is_active: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });

      const activeProfile = storage.getActiveProfile();
      expect(activeProfile).toBeDefined();
      expect(activeProfile.id).toBe(testId);
      expect(activeProfile.isActive).toBe(true);
      expect(activeProfile.password).toBeDefined(); // Active profile should include password for connection
    });

    test('should return null when no active profile exists', () => {
      // Mock getActiveProfile to return null (no active profile)
      mockStmt.get.mockReturnValue(undefined);

      const activeProfile = storage.getActiveProfile();
      expect(activeProfile).toBeNull();
    });
  });

  describe('Migration', () => {
    test('should migrate environment variables to profiles', async () => {
      // Mock environment variables
      const originalEnv = { ...process.env };
      process.env.SQL_SERVER = 'test-server';
      process.env.SQL_PORT = '1433';
      process.env.SQL_USERNAME = 'test-user';
      process.env.SQL_PASSWORD = 'test-password';
      process.env.SQL_TRUST_CERTIFICATE = 'true';
      process.env.SNAPSHOT_PATH = '/test/path';

      // Mock find_profile_by_connection to return null (no existing profile)
      const findStmt = {
        get: jest.fn().mockReturnValue(undefined)
      };

      // Mock deactivate all
      const deactivateStmt = {
        run: jest.fn().mockReturnValue({ changes: 0 })
      };

      // Mock insert
      const insertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 })
      };

      mockDb.prepare
        .mockReturnValueOnce(findStmt) // Find existing profile
        .mockReturnValueOnce(deactivateStmt) // Deactivate all
        .mockReturnValueOnce(insertStmt); // Insert new profile

      const result = await storage.migrateEnvVarsToProfiles();

      // Restore environment
      process.env = originalEnv;

      // Should not throw an error
      expect(result).toBeUndefined(); // Method returns void
      expect(insertStmt.run).toHaveBeenCalled();
    });
  });
});

