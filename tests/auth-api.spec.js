const request = require('supertest');
const bcrypt = require('bcryptjs');

// Mock mssql module - Jest will use __mocks__/mssql.js
jest.mock('mssql');

// Mutable state the mock storage reads from, so each test can describe the
// stored-password situation it needs without rebuilding the mock.
let mockState = {
  passwordHash: null,
  passwordSkipped: false,
  // Set to force getPasswordStatus into its failure return, which is the path
  // that decides whether the auth middleware lets a request through.
  passwordStatusFails: false,
  settingsFail: false,
  setPasswordHashFails: false,
  removePasswordFails: false,
  skipPasswordFails: false
};

const createMockStorage = () => ({
  getPasswordStatus: jest.fn(async () => {
    if (mockState.passwordStatusFails) {
      return { success: false, error: 'database is locked' };
    }
    let status = 'not-set';
    if (mockState.passwordHash) {
      status = 'set';
    } else if (mockState.passwordSkipped) {
      status = 'skipped';
    }
    return {
      success: true,
      status,
      passwordSet: !!mockState.passwordHash,
      passwordSkipped: mockState.passwordSkipped
    };
  }),
  getSettings: jest.fn(async () => {
    if (mockState.settingsFail) {
      return { success: false, error: 'database is locked' };
    }
    return {
      success: true,
      settings: {
        maxHistoryEntries: 100,
        passwordHash: mockState.passwordHash,
        passwordSkipped: mockState.passwordSkipped
      }
    };
  }),
  setPasswordHash: jest.fn(async (hash) => {
    if (mockState.setPasswordHashFails) {
      return { success: false, error: 'write failed' };
    }
    mockState.passwordHash = hash;
    return { success: true };
  }),
  removePassword: jest.fn(async () => {
    if (mockState.removePasswordFails) {
      return { success: false, error: 'write failed' };
    }
    mockState.passwordHash = null;
    return { success: true };
  }),
  skipPassword: jest.fn(async () => {
    if (mockState.skipPasswordFails) {
      return { success: false, error: 'write failed' };
    }
    mockState.passwordSkipped = true;
    return { success: true };
  }),

  // Methods the server touches on routes used to exercise the middleware
  getHistory: jest.fn(async () => ({ success: true, history: [] })),
  getGroups: jest.fn(async () => ({ success: true, groups: [] })),
  getSnapshots: jest.fn(async () => ({ success: true, snapshots: [] })),
  getProfiles: jest.fn(async () => ({ success: true, profiles: [] })),
  getActiveProfile: jest.fn(() => null),
  checkAndMigrate: jest.fn(async () => {})
});

const mockStorageInstance = createMockStorage();

jest.mock('../backend/utils/metadataStorageSqlite', () => {
  return jest.fn().mockImplementation(() => mockStorageInstance);
});

const app = require('../backend/server');
const { cleanupTimers } = require('../backend/server');

// A real bcrypt hash, generated once - the endpoints call bcrypt.compare against
// whatever is stored, so a hand-written string would not exercise the real path.
const KNOWN_PASSWORD = 'correct-horse';
let KNOWN_HASH;

// Any /api/ route that is neither /api/auth/* nor /api/health, used to prove the
// middleware gates ordinary traffic.
const PROTECTED_ROUTE = '/api/history';

function resetState() {
  mockState = {
    passwordHash: null,
    passwordSkipped: false,
    passwordStatusFails: false,
    settingsFail: false,
    setPasswordHashFails: false,
    removePasswordFails: false,
    skipPasswordFails: false
  };
  Object.keys(mockStorageInstance).forEach(key => {
    if (jest.isMockFunction(mockStorageInstance[key])) {
      mockStorageInstance[key].mockClear();
    }
  });
}

describe('UI Authentication API', () => {
  beforeAll(async () => {
    KNOWN_HASH = await bcrypt.hash(KNOWN_PASSWORD, 10);
  });

  beforeEach(() => {
    resetState();
    delete process.env.UI_PASSWORD;
  });

  afterAll(() => {
    if (typeof cleanupTimers === 'function') {
      cleanupTimers();
    }
  });

  describe('GET /api/auth/password-status', () => {
    it('reports not-set when no password has been stored', async () => {
      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('not-set');
      expect(res.body.data.passwordSet).toBe(false);
      expect(res.body.data.passwordSkipped).toBe(false);
    });

    it('reports set once a hash is stored', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('set');
      expect(res.body.data.passwordSet).toBe(true);
    });

    it('reports skipped when the user declined to set one', async () => {
      mockState.passwordSkipped = true;

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('skipped');
      expect(res.body.data.passwordSkipped).toBe(true);
    });

    it('warns that UI_PASSWORD is ignored when it differs from the stored hash', async () => {
      mockState.passwordHash = KNOWN_HASH;
      process.env.UI_PASSWORD = 'something-else-entirely';

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
      expect(res.body.data.envVarIgnored).toBe(true);
      expect(res.body.messages.warning.length).toBeGreaterThan(0);
      expect(res.body.messages.warning[0]).toMatch(/UI_PASSWORD/);
    });

    it('does not warn when UI_PASSWORD matches the stored hash', async () => {
      mockState.passwordHash = KNOWN_HASH;
      process.env.UI_PASSWORD = KNOWN_PASSWORD;

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
      expect(res.body.data.envVarIgnored).toBe(false);
      expect(res.body.messages.warning).toHaveLength(0);
    });

    it('returns 500 when the password status cannot be read', async () => {
      mockState.passwordStatusFails = true;

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/check-password', () => {
    it('rejects a request with no password', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).post('/api/auth/check-password').send({});

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/required/i);
    });

    it('rejects when no password has been set', async () => {
      const res = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/not set/i);
    });

    it('rejects an incorrect password with 401', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app)
        .post('/api/auth/check-password')
        .send({ password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('accepts the correct password and returns a session token', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.authenticated).toBe(true);
      expect(res.body.data.sessionToken).toEqual(expect.any(String));
      // randomUUID format, so a replayed or guessable token would fail here
      expect(res.body.data.sessionToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('issues a distinct token per successful login', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const first = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });
      const second = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });

      expect(first.body.data.sessionToken).not.toBe(second.body.data.sessionToken);
    });

    it('returns 500 when the status says a password is set but no hash is stored', async () => {
      // getPasswordStatus and getSettings disagreeing is the corrupted-settings case
      mockStorageInstance.getPasswordStatus.mockResolvedValueOnce({
        success: true,
        status: 'set',
        passwordSet: true,
        passwordSkipped: false
      });

      const res = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });

      expect(res.status).toBe(500);
      expect(res.body.messages.error[0]).toMatch(/hash/i);
    });
  });

  describe('POST /api/auth/set-password', () => {
    it('requires both password and confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'longenough' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/required/i);
    });

    it('rejects a mismatched confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'longenough', confirm: 'different' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/do not match/i);
    });

    it('rejects a password shorter than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'abcde', confirm: 'abcde' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/6 characters/i);
    });

    it('accepts exactly 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'abcdef', confirm: 'abcdef' });

      expect(res.status).toBe(200);
      expect(res.body.data.passwordSet).toBe(true);
    });

    it('stores a bcrypt hash rather than the password itself', async () => {
      await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'plaintext-secret', confirm: 'plaintext-secret' });

      const stored = mockStorageInstance.setPasswordHash.mock.calls[0][0];
      expect(stored).not.toBe('plaintext-secret');
      expect(stored).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare('plaintext-secret', stored)).resolves.toBe(true);
    });

    it('refuses to overwrite an existing password', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'brand-new-one', confirm: 'brand-new-one' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/already set/i);
      expect(mockStorageInstance.setPasswordHash).not.toHaveBeenCalled();
    });

    it('returns 500 when the hash cannot be persisted', async () => {
      mockState.setPasswordHashFails = true;

      const res = await request(app)
        .post('/api/auth/set-password')
        .send({ password: 'longenough', confirm: 'longenough' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/change-password', () => {
    beforeEach(() => {
      mockState.passwordHash = KNOWN_HASH;
    });

    it('requires current password, new password, and confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ currentPassword: KNOWN_PASSWORD, newPassword: 'newpassword' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/required/i);
    });

    it('rejects a mismatched confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'newpassword',
          confirm: 'different-one'
        });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/do not match/i);
    });

    it('enforces the 6 character minimum on the new password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ currentPassword: KNOWN_PASSWORD, newPassword: 'abcde', confirm: 'abcde' });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/6 characters/i);
    });

    it('rejects an incorrect current password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'not-the-current-one',
          newPassword: 'newpassword',
          confirm: 'newpassword'
        });

      expect(res.status).toBe(401);
      expect(mockStorageInstance.setPasswordHash).not.toHaveBeenCalled();
    });

    it('replaces the stored hash so the old password stops working', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: KNOWN_PASSWORD,
          newPassword: 'a-brand-new-password',
          confirm: 'a-brand-new-password'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.passwordChanged).toBe(true);

      const stored = mockStorageInstance.setPasswordHash.mock.calls[0][0];
      await expect(bcrypt.compare('a-brand-new-password', stored)).resolves.toBe(true);
      await expect(bcrypt.compare(KNOWN_PASSWORD, stored)).resolves.toBe(false);
    });

    it('rejects a change when no password is set yet', async () => {
      mockState.passwordHash = null;

      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'anything',
          newPassword: 'newpassword',
          confirm: 'newpassword'
        });

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/not set/i);
    });
  });

  describe('POST /api/auth/remove-password', () => {
    beforeEach(() => {
      mockState.passwordHash = KNOWN_HASH;
    });

    it('requires the current password', async () => {
      const res = await request(app).post('/api/auth/remove-password').send({});

      expect(res.status).toBe(400);
      expect(mockStorageInstance.removePassword).not.toHaveBeenCalled();
    });

    it('rejects an incorrect current password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/remove-password')
        .send({ currentPassword: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(mockStorageInstance.removePassword).not.toHaveBeenCalled();
    });

    it('removes protection when the current password is correct', async () => {
      const res = await request(app)
        .post('/api/auth/remove-password')
        .send({ currentPassword: KNOWN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.passwordRemoved).toBe(true);
      expect(mockStorageInstance.removePassword).toHaveBeenCalled();
      expect(mockState.passwordHash).toBeNull();
    });

    it('rejects removal when no password is set', async () => {
      mockState.passwordHash = null;

      const res = await request(app)
        .post('/api/auth/remove-password')
        .send({ currentPassword: KNOWN_PASSWORD });

      expect(res.status).toBe(400);
      expect(mockStorageInstance.removePassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/skip-password', () => {
    it('marks protection as skipped on a fresh install', async () => {
      const res = await request(app).post('/api/auth/skip-password').send({});

      expect(res.status).toBe(200);
      expect(res.body.data.skipped).toBe(true);
      expect(mockState.passwordSkipped).toBe(true);
    });

    it('refuses to skip once a password exists', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).post('/api/auth/skip-password').send({});

      expect(res.status).toBe(400);
      expect(res.body.messages.error[0]).toMatch(/already set/i);
      expect(mockStorageInstance.skipPassword).not.toHaveBeenCalled();
    });

    it('returns 500 when the skip cannot be persisted', async () => {
      mockState.skipPasswordFails = true;

      const res = await request(app).post('/api/auth/skip-password').send({});

      expect(res.status).toBe(500);
    });
  });

  describe('requirePasswordAuth middleware', () => {
    it('allows API traffic when no password is configured', async () => {
      const res = await request(app).get(PROTECTED_ROUTE);

      expect(res.status).not.toBe(401);
    });

    it('allows API traffic when protection was skipped', async () => {
      mockState.passwordSkipped = true;

      const res = await request(app).get(PROTECTED_ROUTE);

      expect(res.status).not.toBe(401);
    });

    it('blocks API traffic with 401 once a password is set', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).get(PROTECTED_ROUTE);

      expect(res.status).toBe(401);
      expect(res.body.messages.error[0]).toMatch(/authentication required/i);
    });

    it('admits a request carrying a token from a successful login', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const login = await request(app)
        .post('/api/auth/check-password')
        .send({ password: KNOWN_PASSWORD });
      const token = login.body.data.sessionToken;

      const res = await request(app).get(PROTECTED_ROUTE).set('x-session-token', token);

      expect(res.status).not.toBe(401);
    });

    it('rejects a token that was never issued', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app)
        .get(PROTECTED_ROUTE)
        .set('x-session-token', '00000000-0000-4000-8000-000000000000');

      expect(res.status).toBe(401);
    });

    it('leaves the auth endpoints reachable while protection is active', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).get('/api/auth/password-status');

      expect(res.status).toBe(200);
    });

    it('leaves the health endpoint reachable while protection is active', async () => {
      mockState.passwordHash = KNOWN_HASH;

      const res = await request(app).get('/api/health');

      expect(res.status).not.toBe(401);
    });

    // The gate closes rather than opens when the database cannot answer: a
    // password may be configured, and an unreadable database is no reason to
    // stop asking for it. 503 rather than 401 so the client can tell "storage
    // is broken" from "wrong password" and does not prompt for a password that
    // cannot be checked.
    it('denies API traffic with 503 when the password status cannot be read', async () => {
      mockState.passwordHash = KNOWN_HASH;
      mockState.passwordStatusFails = true;

      const res = await request(app).get(PROTECTED_ROUTE);

      expect(res.status).toBe(503);
      expect(res.body.messages.error[0]).toMatch(/metadata storage/i);
    });

    it('denies API traffic even when no password was ever configured, if the status is unreadable', async () => {
      // The database cannot confirm protection is off, so it is not assumed off
      mockState.passwordHash = null;
      mockState.passwordStatusFails = true;

      const res = await request(app).get(PROTECTED_ROUTE);

      expect(res.status).toBe(503);
    });

    // The other route to the same failure lives inside
    // MetadataStorage.getPasswordStatus, where a failing getSettings used to be
    // reported as a healthy "not-set". That is asserted against the real
    // implementation in metadataStorageBehavior.test.js.
  });
});
