// Exercises storage methods against a real in-memory SQLite database rather than
// a mocked driver, so the assertions cover the SQL itself. The sibling
// metadataStorageSqlite.test.js mocks better-sqlite3 and asserts call shapes;
// these cases are about what the queries actually do to the data.

const MetadataStorage = require('../metadataStorageSqlite');

describe('MetadataStorage behaviour (real SQLite)', () => {
  let storage;

  beforeEach(async () => {
    storage = new MetadataStorage();
    // ':memory:' keeps each test isolated and leaves nothing on disk.
    // path.dirname(':memory:') is '.', so getDb() skips its mkdir.
    storage.dbPath = ':memory:';
    await storage.initialize();
  });

  afterEach(() => {
    storage.close();
  });

  // snapshots.group_id is a foreign key, so the group has to exist first.
  function insertGroup(groupId) {
    const now = new Date().toISOString();
    storage.getDb().prepare(`
      INSERT OR IGNORE INTO groups (id, name, databases, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(groupId, `Group ${groupId}`, JSON.stringify([]), 'test_user', now, now);
  }

  // Inserts a snapshot row directly. addSnapshot has its own required shape and
  // side effects; these sequence tests only need rows with a group and sequence.
  function insertSnapshot(groupId, sequence) {
    insertGroup(groupId);
    storage.getDb().prepare(`
      INSERT INTO snapshots (id, group_id, display_name, sequence, created_at, created_by, database_snapshots)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `snap-${groupId}-${sequence}`,
      groupId,
      `Snapshot ${sequence}`,
      sequence,
      new Date().toISOString(),
      'test_user',
      JSON.stringify([])
    );
  }

  describe('getNextSequence', () => {
    it('starts at 1 for a group with no snapshots', () => {
      expect(storage.getNextSequence('group-a')).toBe(1);
    });

    it('returns 1 for a group that does not exist', () => {
      expect(storage.getNextSequence('no-such-group')).toBe(1);
    });

    it('returns one past the highest existing sequence', () => {
      insertSnapshot('group-a', 1);
      insertSnapshot('group-a', 2);
      insertSnapshot('group-a', 3);

      expect(storage.getNextSequence('group-a')).toBe(4);
    });

    it('follows the highest sequence, not the row count', () => {
      // A gap left by a deleted snapshot must not cause a number to be reused
      insertSnapshot('group-a', 1);
      insertSnapshot('group-a', 7);

      expect(storage.getNextSequence('group-a')).toBe(8);
    });

    it('counts sequences per group rather than globally', () => {
      insertSnapshot('group-a', 5);
      insertSnapshot('group-b', 1);

      expect(storage.getNextSequence('group-a')).toBe(6);
      expect(storage.getNextSequence('group-b')).toBe(2);
      expect(storage.getNextSequence('group-c')).toBe(1);
    });
  });

  describe('trimHistoryEntries', () => {
    // Timestamps are ordered explicitly: trimming deletes by timestamp ASC, and
    // entries written in the same millisecond would make "oldest" ambiguous.
    function seedHistory(count) {
      const stmt = storage.getDb().prepare(`
        INSERT INTO history (id, operation_type, timestamp, user_name, details, results)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < count; i++) {
        stmt.run(
          `hist-${i}`,
          'create_snapshots',
          new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
          'test_user',
          JSON.stringify({ index: i }),
          null
        );
      }
    }

    function historyCount() {
      return storage.getDb().prepare('SELECT COUNT(*) as c FROM history').get().c;
    }

    it('does nothing when the entry count is below the limit', async () => {
      seedHistory(5);

      const result = await storage.trimHistoryEntries(10);

      expect(result.success).toBe(true);
      expect(result.trimmed).toBe(0);
      expect(historyCount()).toBe(5);
    });

    it('does nothing when the entry count exactly equals the limit', async () => {
      // The boundary: trimming at equality would discard a wanted entry
      seedHistory(10);

      const result = await storage.trimHistoryEntries(10);

      expect(result.success).toBe(true);
      expect(result.trimmed).toBe(0);
      expect(historyCount()).toBe(10);
    });

    it('trims exactly one entry when one over the limit', async () => {
      seedHistory(11);

      const result = await storage.trimHistoryEntries(10);

      expect(result.trimmed).toBe(1);
      expect(historyCount()).toBe(10);
    });

    it('leaves exactly maxEntries rows behind', async () => {
      seedHistory(25);

      const result = await storage.trimHistoryEntries(10);

      expect(result.trimmed).toBe(15);
      expect(historyCount()).toBe(10);
    });

    it('deletes the oldest entries and keeps the newest', async () => {
      seedHistory(15);

      await storage.trimHistoryEntries(5);

      const remaining = storage.getDb()
        .prepare('SELECT id FROM history ORDER BY timestamp ASC')
        .all()
        .map(r => r.id);

      // Seeded 0..14 ascending in time, so 10..14 are the newest five
      expect(remaining).toEqual(['hist-10', 'hist-11', 'hist-12', 'hist-13', 'hist-14']);
    });

    it('empties the table when the limit is zero', async () => {
      seedHistory(4);

      const result = await storage.trimHistoryEntries(0);

      expect(result.trimmed).toBe(4);
      expect(historyCount()).toBe(0);
    });

    it('handles an empty history without error', async () => {
      const result = await storage.trimHistoryEntries(10);

      expect(result.success).toBe(true);
      expect(result.trimmed).toBe(0);
    });
  });

  describe('addHistoryEntry', () => {
    it('applies the configured maxHistoryEntries on insert', async () => {
      await storage.updateSettings({ maxHistoryEntries: 3 });

      for (let i = 0; i < 6; i++) {
        await storage.addHistoryEntry({
          type: 'create_snapshots',
          timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
          details: { index: i }
        });
      }

      const count = storage.getDb().prepare('SELECT COUNT(*) as c FROM history').get().c;
      expect(count).toBe(3);
    });

    it('records the operation type from the entry type field', async () => {
      await storage.addHistoryEntry({ type: 'discard_changes', details: {} });

      const row = storage.getDb()
        .prepare('SELECT operation_type FROM history LIMIT 1')
        .get();
      expect(row.operation_type).toBe('discard_changes');
    });

    it('falls back to unknown when no type is supplied', async () => {
      await storage.addHistoryEntry({ details: {} });

      const row = storage.getDb()
        .prepare('SELECT operation_type FROM history LIMIT 1')
        .get();
      expect(row.operation_type).toBe('unknown');
    });
  });

  describe('getPasswordStatus', () => {
    it('reports not-set on a fresh database', async () => {
      const status = await storage.getPasswordStatus();

      expect(status.success).toBe(true);
      expect(status.status).toBe('not-set');
      expect(status.passwordSet).toBe(false);
    });

    it('reports set once a hash is stored', async () => {
      await storage.setPasswordHash('$2b$10$abcdefghijklmnopqrstuv');

      const status = await storage.getPasswordStatus();

      expect(status.status).toBe('set');
      expect(status.passwordSet).toBe(true);
    });

    it('reports not-set again after the password is removed', async () => {
      await storage.setPasswordHash('$2b$10$abcdefghijklmnopqrstuv');
      await storage.removePassword();

      const status = await storage.getPasswordStatus();

      expect(status.passwordSet).toBe(false);
    });

    // Reporting a healthy "not-set" here would tell requirePasswordAuth that
    // protection is off while a hash is actually stored, which is how an
    // unreadable database would silently drop the UI password gate.
    it('reports failure rather than not-set when settings cannot be read', async () => {
      await storage.setPasswordHash('$2b$10$abcdefghijklmnopqrstuv');
      jest.spyOn(storage, 'getSettings').mockResolvedValue({
        success: false,
        error: 'database is locked'
      });

      const status = await storage.getPasswordStatus();

      expect(status.success).toBe(false);
      expect(status.status).toBeUndefined();
      expect(status.passwordSet).toBeUndefined();
    });

    it('does not claim a password is unset when the database is unreadable', async () => {
      jest.spyOn(storage, 'getSettings').mockResolvedValue({
        success: false,
        error: 'database is locked'
      });

      const status = await storage.getPasswordStatus();

      expect(status.success).toBe(false);
      expect(status.error).toMatch(/locked/i);
    });
  });
});
