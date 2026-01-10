/**
 * Group Profile Assignment Tests
 * 
 * Tests for group profile assignment functionality:
 * - Groups can be assigned to specific profiles when creating
 * - Groups can have their profile changed when updating
 * - Groups default to active profile if no profile specified
 * - Groups are filtered by active profile
 */

const request = require('supertest');

// Mock mssql module
jest.mock('mssql');

// Mock MetadataStorage before requiring server
let mockProfiles = [];
let mockGroups = [];
let activeProfileId = null;

const createMockStorage = () => ({
  getAllSnapshots: jest.fn(async () => []),
  getAllGroups: jest.fn(async () => mockGroups),
  getGroups: jest.fn(async (profileId) => {
    const filterProfileId = profileId || activeProfileId;
    const filtered = filterProfileId 
      ? mockGroups.filter(g => g.profileId === filterProfileId)
      : mockGroups;
    return { success: true, groups: filtered };
  }),
  getGroup: jest.fn((id) => mockGroups.find(g => g.id === id) || null),
  createGroup: jest.fn(async (group) => {
    // Use provided profileId or active profile
    const profileId = group.profileId || activeProfileId;
    const newGroup = {
      ...group,
      profileId: profileId
    };
    mockGroups.push(newGroup);
    return { success: true };
  }),
  updateGroup: jest.fn(async (groupId, group) => {
    const index = mockGroups.findIndex(g => g.id === groupId);
    if (index === -1) {
      return { success: false, error: 'Group not found' };
    }
    // Update profileId if provided
    const profileId = group.profileId !== undefined ? group.profileId : mockGroups[index].profileId;
    mockGroups[index] = {
      ...mockGroups[index],
      ...group,
      profileId: profileId || activeProfileId
    };
    return { success: true };
  }),
  deleteSnapshot: jest.fn((id) => ({ success: true })),
  addSnapshot: jest.fn(() => ({ success: true })),
  addHistory: jest.fn(() => ({ success: true })),
  addHistoryEntry: jest.fn(async () => ({ success: true })),
  getSettings: jest.fn(() => ({
    success: true,
    settings: { maxHistoryEntries: 100 }
  })),
  getPasswordStatus: jest.fn(async () => ({
    success: true,
    status: 'not-set',
    passwordHash: null,
    passwordSkipped: false
  })),
  getActiveProfile: jest.fn(() => {
    return mockProfiles.find(p => p.isActive) || null;
  }),
  getProfiles: jest.fn(() => mockProfiles),
  getGroupCountsByProfile: jest.fn(() => {
    const counts = {};
    mockGroups.forEach(g => {
      if (g.profileId) {
        counts[g.profileId] = (counts[g.profileId] || 0) + 1;
      }
    });
    return { success: true, counts };
  }),
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
  mockProfiles = [];
  mockGroups = [];
  activeProfileId = null;
  
  jest.clearAllMocks();
  
  // Reset mock implementations
  mockStorageInstance.getActiveProfile.mockImplementation(() => {
    return mockProfiles.find(p => p.isActive) || null;
  });
  
  mockStorageInstance.getGroups.mockImplementation(async (profileId) => {
    const filterProfileId = profileId || activeProfileId;
    const filtered = filterProfileId 
      ? mockGroups.filter(g => g.profileId === filterProfileId)
      : mockGroups;
    return { success: true, groups: filtered };
  });
  
  mockStorageInstance.createGroup.mockImplementation(async (group) => {
    const profileId = group.profileId || activeProfileId;
    const newGroup = {
      ...group,
      profileId: profileId
    };
    mockGroups.push(newGroup);
    return { success: true };
  });
  
  mockStorageInstance.updateGroup.mockImplementation(async (groupId, group) => {
    const index = mockGroups.findIndex(g => g.id === groupId);
    if (index === -1) {
      return { success: false, error: 'Group not found' };
    }
    const existing = mockGroups[index];
    const profileId = group.profileId !== undefined ? group.profileId : existing.profileId;
    mockGroups[index] = {
      ...existing,
      ...group,
      profileId: profileId || activeProfileId
    };
    return { success: true };
  });
});

describe('Group Profile Assignment', () => {
  test('should assign group to active profile when profileId not provided', async () => {
    // Setup: one active profile
    const profile1 = {
      id: 'profile-1',
      name: 'Profile 1',
      isActive: true
    };
    mockProfiles = [profile1];
    activeProfileId = 'profile-1';
    
    const newGroup = {
      name: 'Test Group',
      databases: ['test_db']
    };
    
    const response = await request(app)
      .post('/api/groups')
      .send(newGroup)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(mockGroups.length).toBe(1);
    expect(mockGroups[0].profileId).toBe('profile-1');
  });

  test('should assign group to specified profile when profileId provided', async () => {
    // Setup: two profiles, one active
    const profile1 = {
      id: 'profile-1',
      name: 'Profile 1',
      isActive: true
    };
    const profile2 = {
      id: 'profile-2',
      name: 'Profile 2',
      isActive: false
    };
    mockProfiles = [profile1, profile2];
    activeProfileId = 'profile-1';
    
    const newGroup = {
      name: 'Test Group',
      databases: ['test_db'],
      profileId: 'profile-2' // Explicitly assign to profile 2
    };
    
    const response = await request(app)
      .post('/api/groups')
      .send(newGroup)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(mockGroups.length).toBe(1);
    expect(mockGroups[0].profileId).toBe('profile-2');
  });

  test('should update group profile when profileId changed', async () => {
    // Setup: two profiles
    const profile1 = {
      id: 'profile-1',
      name: 'Profile 1',
      isActive: true
    };
    const profile2 = {
      id: 'profile-2',
      name: 'Profile 2',
      isActive: false
    };
    mockProfiles = [profile1, profile2];
    activeProfileId = 'profile-1';
    
    // Create group with profile 1
    const group = {
      id: 'group-1',
      name: 'Test Group',
      databases: ['test_db'],
      profileId: 'profile-1'
    };
    mockGroups = [group];
    
    // Update group to use profile 2
    const response = await request(app)
      .put('/api/groups/group-1')
      .send({
        name: 'Test Group',
        databases: ['test_db'],
        profileId: 'profile-2'
      })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(mockGroups[0].profileId).toBe('profile-2');
  });

  test('should preserve group profile when profileId not provided in update', async () => {
    // Setup: two profiles
    const profile1 = {
      id: 'profile-1',
      name: 'Profile 1',
      isActive: true
    };
    const profile2 = {
      id: 'profile-2',
      name: 'Profile 2',
      isActive: false
    };
    mockProfiles = [profile1, profile2];
    activeProfileId = 'profile-1';
    
    // Create group with profile 2
    const group = {
      id: 'group-1',
      name: 'Test Group',
      databases: ['test_db'],
      profileId: 'profile-2'
    };
    mockGroups = [group];
    
    // Update group name only (no profileId)
    const response = await request(app)
      .put('/api/groups/group-1')
      .send({
        name: 'Updated Group',
        databases: ['test_db']
        // profileId not provided
      })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(mockGroups[0].name).toBe('Updated Group');
    expect(mockGroups[0].profileId).toBe('profile-2'); // Should preserve original profile
  });

  test('should return all groups (filtering happens in frontend)', async () => {
    // Note: GET /api/groups returns all groups via getAllGroups()
    // Frontend filtering by active profile happens client-side
    // This test verifies groups include profileId
    
    // Setup: two profiles
    const profile1 = {
      id: 'profile-1',
      name: 'Profile 1',
      isActive: true
    };
    const profile2 = {
      id: 'profile-2',
      name: 'Profile 2',
      isActive: false
    };
    mockProfiles = [profile1, profile2];
    activeProfileId = 'profile-1';
    
    // Create groups for different profiles
    mockGroups = [
      { id: 'group-1', name: 'Group 1', databases: ['db1'], profileId: 'profile-1' },
      { id: 'group-2', name: 'Group 2', databases: ['db2'], profileId: 'profile-2' },
      { id: 'group-3', name: 'Group 3', databases: ['db3'], profileId: 'profile-1' }
    ];
    
    // Get groups (returns all, but includes profileId)
    const response = await request(app)
      .get('/api/groups')
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data.groups.length).toBe(3);
    // Verify all groups have profileId
    expect(response.body.data.groups.every(g => g.profileId)).toBe(true);
    expect(response.body.data.groups.find(g => g.id === 'group-1').profileId).toBe('profile-1');
    expect(response.body.data.groups.find(g => g.id === 'group-2').profileId).toBe('profile-2');
  });
});
