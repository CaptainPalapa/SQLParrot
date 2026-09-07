const request = require('supertest');

// A recording mssql mock, matching the pattern in destructive-snapshot-operations.spec.js.
// Every query is captured and per-query responses can be scripted, since these
// cases are specifically about what the verify path does and does NOT touch:
// checking consistency must never itself delete a snapshot record, even when
// it finds one that looks stale.
const sqlLog = [];
let queryResponders = [];

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
  connect: jest.fn(async () => mockPool),
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
  getAllGroups: jest.fn(async () => mockGroups),
  getGroups: jest.fn(async () => ({ success: true, groups: mockGroups })),
  getAllSnapshots: jest.fn(async () => mockSnapshots),
  getSnapshotsForGroup: jest.fn(async (groupId) =>
    mockSnapshots.filter(s => s.groupId === groupId)
  ),
  deleteSnapshot: jest.fn(async (id) => {
    mockSnapshots = mockSnapshots.filter(s => s.id !== id);
    return { success: true };
  }),
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
      database: name.replace(/_snap.*$/, ''),
      success: true
    }))
  };
}

describe('Snapshot verification (/api/snapshots/verify)', () => {
  beforeEach(() => {
    sqlLog.length = 0;
    queryResponders = [];
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

  it('reports a snapshot missing from SQL Server but does not delete its metadata record', async () => {
    mockGroups = [{ id: 'group-a', name: 'Group A', databases: ['db1'] }];
    mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['db1_snap_gone'])];

    // No snapshot databases at all currently exist on the server
    respondTo(/source_database_id IS NOT NULL/i, { recordset: [] });
    respondTo(/source_database_id IS NULL/i, { recordset: [{ name: 'db1', state_desc: 'ONLINE' }] });

    const res = await request(app).post('/api/snapshots/verify').send({});

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
    expect(res.body.missingInSQL).toEqual(['db1_snap_gone']);

    // This is the actual regression: verifying consistency must be read-only.
    // Deleting the stale record is the explicit, user-triggered "Clean Stale
    // Metadata" action (cleanup-metadata), never a side effect of checking.
    expect(mockStorageInstance.deleteSnapshot).not.toHaveBeenCalled();
    expect(mockSnapshots).toHaveLength(1);
  });

  it('does not report a false mismatch, and does not touch metadata, when everything matches', async () => {
    mockGroups = [{ id: 'group-a', name: 'Group A', databases: ['db1'] }];
    mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['db1_snap_ok'])];

    respondTo(/source_database_id IS NOT NULL/i, { recordset: [{ name: 'db1_snap_ok', create_date: new Date(), state_desc: 'ONLINE' }] });
    respondTo(/source_database_id IS NULL/i, { recordset: [{ name: 'db1', state_desc: 'ONLINE' }] });

    const res = await request(app).post('/api/snapshots/verify').send({});

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(mockStorageInstance.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('flags a tracked database that is not online, even when snapshot bookkeeping matches', async () => {
    mockGroups = [{ id: 'group-a', name: 'Group A', databases: ['vsrwest_dev_usr_dgl'] }];
    mockSnapshots = [];

    respondTo(/source_database_id IS NOT NULL/i, { recordset: [] });
    respondTo(/source_database_id IS NULL/i, {
      recordset: [{ name: 'vsrwest_dev_usr_dgl', state_desc: 'RESTORING' }]
    });

    const res = await request(app).post('/api/snapshots/verify').send({});

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
    expect(res.body.unhealthyDatabases).toEqual([
      { database: 'vsrwest_dev_usr_dgl', state: 'RESTORING' }
    ]);
  });

  it('does not flag a tracked database that is online', async () => {
    mockGroups = [{ id: 'group-a', name: 'Group A', databases: ['db1'] }];
    mockSnapshots = [];

    respondTo(/source_database_id IS NOT NULL/i, { recordset: [] });
    respondTo(/source_database_id IS NULL/i, { recordset: [{ name: 'db1', state_desc: 'ONLINE' }] });

    const res = await request(app).post('/api/snapshots/verify').send({});

    expect(res.body.verified).toBe(true);
    expect(res.body.unhealthyDatabases).toEqual([]);
  });
});

describe('POST /api/snapshots/cleanup-metadata (the actual, explicit cleanup)', () => {
  beforeEach(() => {
    sqlLog.length = 0;
    queryResponders = [];
    mockGroups = [];
    mockSnapshots = [];
    Object.values(mockStorageInstance).forEach(fn => {
      if (jest.isMockFunction(fn)) fn.mockClear();
    });
    mockPool.request.mockClear();
    mockPool.close.mockClear();
  });

  it('deletes the stale metadata record when explicitly asked to', async () => {
    mockGroups = [{ id: 'group-a', name: 'Group A', databases: ['db1'] }];
    mockSnapshots = [snapshotRecord('snap-a1', 'group-a', ['db1_snap_gone'])];

    respondTo(/source_database_id IS NOT NULL/i, { recordset: [] });
    respondTo(/source_database_id IS NULL/i, { recordset: [{ name: 'db1', state_desc: 'ONLINE' }] });

    const res = await request(app).post('/api/snapshots/cleanup-metadata').send({});

    expect(res.status).toBe(200);
    expect(mockStorageInstance.deleteSnapshot).toHaveBeenCalledWith('snap-a1');
    expect(res.body.cleaned).toBe(1);
  });
});
