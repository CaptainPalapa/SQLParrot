const request = require('supertest');

// A recording mssql mock, rather than tests/__mocks__/mssql.js. These cases are
// about which statements reach SQL Server -- above all which DROP DATABASE
// statements do not -- so every query is captured and per-query responses and
// failures can be scripted.
const sqlLog = [];
let queryResponders = [];
let mockConnectShouldFail = false;

function respondTo(matcher, response) {
  queryResponders.push({ matcher, response });
}

const mockPool = {
  request: jest.fn(() => ({
    query: jest.fn(async (text) => {
      sqlLog.push(text);
      for (const { matcher, response } of queryResponders) {
        if (matcher.test(text)) {
          if (response instanceof Error) throw response;
          return response;
        }
      }
      return { recordset: [] };
    })
  })),
  close: jest.fn().mockResolvedValue(undefined),
  connected: true
};

jest.mock('mssql', () => ({
  connect: jest.fn(async () => {
    if (mockConnectShouldFail) throw new Error('connection refused');
    return mockPool;
  }),
  close: jest.fn().mockResolvedValue(undefined),
  ConnectionPool: jest.fn().mockImplementation(() => mockPool),
  Request: jest.fn(),
  NVarChar: jest.fn(),
  VarChar: jest.fn(),
  Int: jest.fn(),
  BigInt: jest.fn(),
  Bit: jest.fn(),
  DateTime: jest.fn()
}));

let mockGroups = [];
let mockSnapshots = [];

const mockStorageInstance = {
  getActiveProfile: jest.fn(() => ({
    id: 'profile-1',
    name: 'Test',
    host: 'test-host',
    port: 1433,
    username: 'test_user',
    password: 'test_password',
    trustCertificate: true
  })),
  getGroups: jest.fn(async () => ({ success: true, groups: mockGroups })),
  getAllSnapshots: jest.fn(async () => mockSnapshots),
  getSnapshotsForGroup: jest.fn(async (groupId) =>
    mockSnapshots.filter(s => s.groupId === groupId)
  ),
  deleteSnapshot: jest.fn(async () => ({ success: true })),
  deleteGroup: jest.fn(async () => ({ success: true })),
  addHistoryEntry: jest.fn(async () => ({ success: true })),
  getHistory: jest.fn(async () => ({ success: true, history: [] })),
  getSettings: jest.fn(async () => ({ success: true, settings: { maxHistoryEntries: 100 } })),
  getPasswordStatus: jest.fn(async () => ({
    success: true,
    status: 'not-set',
    passwordSet: false,
    passwordSkipped: false
  })),
  getProfiles: jest.fn(async () => ({ success: true, profiles: [] })),
  checkAndMigrate: jest.fn(async () => {})
};

jest.mock('../backend/utils/metadataStorageSqlite', () => {
  return jest.fn().mockImplementation(() => mockStorageInstance);
});

const app = require('../backend/server');
const { cleanupTimers } = require('../backend/server');

// Every DROP DATABASE issued, by database name
function droppedDatabases() {
  return sqlLog
    .map(q => q.match(/DROP DATABASE \[([^\]]+)\]/))
    .filter(Boolean)
    .map(m => m[1]);
}

// Builds a metadata snapshot record as getAllSnapshots returns them
function snapshotRecord(id, groupId, dbSnapshotNames) {
  return {
    id,
    groupId,
    displayName: `Snapshot ${id}`,
    sequence: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'test_user',
    databaseSnapshots: dbSnapshotNames.map(name => ({
      snapshotName: name,
      databaseName: name.replace(/_snap.*$/, ''),
      success: true
    }))
  };
}

describe('Destructive snapshot operations', () => {
  beforeEach(() => {
    sqlLog.length = 0;
    queryResponders = [];
    mockConnectShouldFail = false;
    mockGroups = [];
    mockSnapshots = [];
    Object.values(mockStorageInstance).forEach(fn => {
      if (jest.isMockFunction(fn)) fn.mockClear();
    });
    mockPool.request.mockClear();
    mockPool.close.mockClear();
  });

  afterAll(() => {
    if (typeof cleanupTimers === 'function') cleanupTimers();
  });

  describe('POST /api/snapshots/cleanup (drops every snapshot on the server)', () => {
    it('asks only for databases that are snapshots', async () => {
      await request(app).post('/api/snapshots/cleanup').send({});

      const select = sqlLog.find(q => /FROM sys\.databases/i.test(q));
      expect(select).toBeDefined();
      // source_database_id is non-null only for snapshots, so this predicate is
      // the sole thing standing between this endpoint and a user's databases
      expect(select).toMatch(/source_database_id IS NOT NULL/i);
    });

    it('drops exactly the databases the server reported, and nothing else', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'sales_snap_1' }, { name: 'hr_snap_1' }]
      });

      const res = await request(app).post('/api/snapshots/cleanup').send({});

      expect(res.status).toBe(200);
      expect(droppedDatabases()).toEqual(['sales_snap_1', 'hr_snap_1']);
      expect(res.body.deletedCount).toBe(2);
    });

    it('issues no DROP at all when the server reports no snapshots', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [] });

      const res = await request(app).post('/api/snapshots/cleanup').send({});

      expect(res.status).toBe(200);
      expect(droppedDatabases()).toEqual([]);
      expect(res.body.deletedCount).toBe(0);
    });

    it('continues after a failed drop and counts only the successes', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'first_snap' }, { name: 'locked_snap' }, { name: 'third_snap' }]
      });
      respondTo(/DROP DATABASE \[locked_snap\]/, new Error('database is in use'));

      const res = await request(app).post('/api/snapshots/cleanup').send({});

      // The one that failed was still attempted, and the third was not skipped
      expect(droppedDatabases()).toEqual(['first_snap', 'locked_snap', 'third_snap']);
      expect(res.body.deletedCount).toBe(2);
    });

    it('closes the connection pool', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [{ name: 'a_snap' }] });

      await request(app).post('/api/snapshots/cleanup').send({});

      expect(mockPool.close).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/groups/:id (drops one group\'s snapshots)', () => {
    it('drops only the target group\'s snapshots, leaving other groups untouched', async () => {
      mockGroups = [
        { id: 'group-a', name: 'Group A' },
        { id: 'group-b', name: 'Group B' }
      ];
      mockSnapshots = [
        snapshotRecord('snap-a1', 'group-a', ['a_db1_snap', 'a_db2_snap']),
        snapshotRecord('snap-b1', 'group-b', ['b_db1_snap'])
      ];

      const res = await request(app).delete('/api/groups/group-a');

      expect(res.status).toBe(200);
      const dropped = droppedDatabases();
      expect(dropped).toEqual(['a_db1_snap', 'a_db2_snap']);
      expect(dropped).not.toContain('b_db1_snap');
    });

    it('drops every database snapshot inside the group, not just the first', async () => {
      mockGroups = [{ id: 'group-a', name: 'Group A' }];
      mockSnapshots = [
        snapshotRecord('snap-a1', 'group-a', ['db1_snap', 'db2_snap', 'db3_snap'])
      ];

      await request(app).delete('/api/groups/group-a');

      expect(droppedDatabases()).toEqual(['db1_snap', 'db2_snap', 'db3_snap']);
    });

    it('issues no DROP for a group that has no snapshots', async () => {
      mockGroups = [{ id: 'group-empty', name: 'Empty' }];
      mockSnapshots = [];

      const res = await request(app).delete('/api/groups/group-empty');

      expect(res.status).toBe(200);
      expect(droppedDatabases()).toEqual([]);
      expect(res.body.data.snapshotsDeleted).toBe(0);
    });

    it('issues no DROP when the group does not exist', async () => {
      mockGroups = [{ id: 'group-a', name: 'Group A' }];
      mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['a_db1_snap'])];

      const res = await request(app).delete('/api/groups/no-such-group');

      expect(res.status).toBe(404);
      expect(droppedDatabases()).toEqual([]);
      expect(mockStorageInstance.deleteGroup).not.toHaveBeenCalled();
    });

    it('still removes the group metadata when SQL Server is unreachable', async () => {
      mockGroups = [{ id: 'group-a', name: 'Group A' }];
      mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['a_db1_snap'])];
      mockConnectShouldFail = true;

      const res = await request(app).delete('/api/groups/group-a');

      // Dropping databases is best effort; the group must not be left stranded
      expect(res.status).toBe(200);
      expect(mockStorageInstance.deleteGroup).toHaveBeenCalledWith('group-a');
    });

    it('removes snapshot metadata before the group itself', async () => {
      mockGroups = [{ id: 'group-a', name: 'Group A' }];
      mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['a_db1_snap'])];

      await request(app).delete('/api/groups/group-a');

      // Snapshots reference the group, so ordering matters for referential integrity
      const snapshotDeleteOrder = mockStorageInstance.deleteSnapshot.mock.invocationCallOrder[0];
      const groupDeleteOrder = mockStorageInstance.deleteGroup.mock.invocationCallOrder[0];
      expect(snapshotDeleteOrder).toBeLessThan(groupDeleteOrder);
    });
  });

  describe('POST /api/snapshots/verify', () => {
    it('reports snapshots present on the server but absent from metadata', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'tracked_snap' }, { name: 'mystery_snap' }]
      });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      const res = await request(app).post('/api/snapshots/verify').send({});

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(false);
      expect(res.body.orphanedInSQL).toEqual(['mystery_snap']);
    });

    it('reports verified when the server and metadata agree', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [{ name: 'tracked_snap' }] });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      const res = await request(app).post('/api/snapshots/verify').send({});

      expect(res.body.verified).toBe(true);
      expect(res.body.issues).toEqual([]);
      expect(mockStorageInstance.deleteSnapshot).not.toHaveBeenCalled();
    });

    it('auto-removes metadata for snapshots the server no longer has', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [] });
      mockSnapshots = [snapshotRecord('snap-gone', 'group-a', ['vanished_snap'])];

      const res = await request(app).post('/api/snapshots/verify').send({});

      expect(mockStorageInstance.deleteSnapshot).toHaveBeenCalledWith('snap-gone');
      expect(res.body.verified).toBe(false);
    });

    it('never issues a DROP while verifying', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'tracked_snap' }, { name: 'mystery_snap' }]
      });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      await request(app).post('/api/snapshots/verify').send({});

      // Verification reports; it must not destroy anything
      expect(droppedDatabases()).toEqual([]);
    });
  });

  describe('POST /api/snapshots/cleanup-orphaned', () => {
    it('reports orphans without dropping them', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'tracked_snap' }, { name: 'mystery_snap' }]
      });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      const res = await request(app).post('/api/snapshots/cleanup-orphaned').send({});

      expect(res.status).toBe(200);
      expect(res.body.orphans).toEqual(['mystery_snap']);
      // The endpoint only drops verification.inaccessibleSnapshots, which
      // verifySnapshotConsistency hard-codes to an empty array since the
      // accessibility check was removed. So cleaned is always 0 and an untracked
      // snapshot is surfaced but never deleted.
      expect(res.body.cleaned).toBe(0);
      expect(droppedDatabases()).toEqual([]);
    });

    it('does nothing when everything is consistent', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [{ name: 'tracked_snap' }] });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      const res = await request(app).post('/api/snapshots/cleanup-orphaned').send({});

      expect(res.body.cleaned).toBe(0);
      expect(res.body.orphans).toEqual([]);
      expect(droppedDatabases()).toEqual([]);
    });
  });

  describe('POST /api/snapshots/cleanup-metadata', () => {
    it('reports zero cleaned even when the verification it runs removed entries', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [] });
      mockSnapshots = [snapshotRecord('snap-gone', 'group-a', ['vanished_snap'])];

      const res = await request(app).post('/api/snapshots/cleanup-metadata').send({});

      // verifySnapshotConsistency auto-removes stale entries itself and then
      // returns missingInSQL as an empty array, so this endpoint's own cleanup
      // branch never runs and its count stays at zero. The work happened, but
      // the number reported back does not reflect it.
      expect(mockStorageInstance.deleteSnapshot).toHaveBeenCalledWith('snap-gone');
      expect(res.status).toBe(200);
      expect(res.body.cleaned).toBe(0);
      expect(res.body.staleSnapshots).toEqual([]);
    });

    it('never issues a DROP', async () => {
      respondTo(/FROM sys\.databases/i, {
        recordset: [{ name: 'tracked_snap' }, { name: 'mystery_snap' }]
      });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      await request(app).post('/api/snapshots/cleanup-metadata').send({});

      // inaccessibleSnapshots is likewise always empty, so the drop branch is
      // unreachable and an untracked snapshot on the server is left in place
      expect(droppedDatabases()).toEqual([]);
    });

    it('reports consistent when the server and metadata agree', async () => {
      respondTo(/FROM sys\.databases/i, { recordset: [{ name: 'tracked_snap' }] });
      mockSnapshots = [snapshotRecord('snap-1', 'group-a', ['tracked_snap'])];

      const res = await request(app).post('/api/snapshots/cleanup-metadata').send({});

      expect(res.body.cleaned).toBe(0);
      expect(mockStorageInstance.deleteSnapshot).not.toHaveBeenCalled();
    });
  });
});
