# SQL Server Snapshot Behavior in SQL Parrot

This document explains how SQL Server snapshots work and how SQL Parrot manages them. Reference this when you need to understand what will happen before performing snapshot operations.

## SQL Server Requirements

### Version Requirements

| SQL Server Version | Snapshot Support |
|-------------------|------------------|
| SQL Server 2016 SP1+ | ✅ All editions |
| SQL Server 2017+ | ✅ All editions |
| SQL Server 2019+ | ✅ All editions |
| SQL Server 2022+ | ✅ All editions |
| SQL Server 2025+ | ✅ All editions |

**Important:** Prior to SQL Server 2016 SP1, database snapshots were **Enterprise Edition only**. Starting with SQL Server 2016 SP1, Microsoft made snapshots available in all editions including Standard, Developer, and Express.

### Edition Support (SQL Server 2016 SP1 and later)

| Edition | Supported |
|---------|-----------|
| Enterprise | ✅ |
| Standard | ✅ |
| Developer | ✅ |
| Express | ✅ |

If you're running SQL Server 2016 (without SP1) or earlier, you'll need Enterprise or Developer edition.

### Check Your Version

Not sure what version you're running? Run this query:

```sql
SELECT
    SERVERPROPERTY('ProductVersion') AS Version,
    SERVERPROPERTY('Edition') AS Edition,
    @@VERSION AS FullVersion
```

The `FullVersion` column will show something like "Microsoft SQL Server 2022..." which maps to our version table above.

---

## What Snapshots Capture

SQL Server database snapshots capture the **entire database state** at the page level.

| Captured | NOT Captured |
|----------|--------------|
| All table data (rows) | Full-text catalogs |
| Stored procedures | |
| Views | |
| Triggers | |
| Functions | |
| Indexes | |
| Table schema (columns, constraints) | |
| User permissions | |

**Key point:** Snapshots are **independent of each other**. They are not incremental or chained. Each snapshot is a complete point-in-time capture.

---

## Delete vs Rollback: The Core Difference

This is the most important concept to understand:

| Operation | What It Does | Database Impact | Use When |
|-----------|--------------|-----------------|----------|
| **Delete** | Removes the snapshot file only | **NONE** - database is completely unchanged | "I don't need this safety net anymore" |
| **Rollback** | Reverts database to snapshot's point-in-time state | **DESTRUCTIVE** - all changes since snapshot are lost | "Take me back to this checkpoint" |

**Delete is safe.** It only removes the ability to rollback to that point. Your current data is untouched.

**Rollback is destructive.** Everything added, modified, or deleted after the snapshot was created will be lost or reverted.

---

## Scenarios: Understanding the Impact

### Setup: The Example Database

Let's walk through a realistic example to understand exactly what happens in different scenarios.

**Timeline of changes:**

| Step | Action | Database State |
|------|--------|----------------|
| 1 | Create **Snapshot A** | 100 rows, StoredProc1 |
| 2 | Add 20 rows, create StoredProc2 | 120 rows, StoredProc1, StoredProc2 |
| 3 | Create **Snapshot B** | 120 rows, StoredProc1, StoredProc2 |
| 4 | Add 30 rows, create Index1, modify StoredProc1 | 150 rows, StoredProc1 (modified), StoredProc2, Index1 |
| 5 | Create **Snapshot C** | 150 rows, StoredProc1 (modified), StoredProc2, Index1 |
| 6 | Add 30 more rows, drop StoredProc2 | 180 rows, StoredProc1 (modified), Index1, NO StoredProc2 |
| - | **Current state** | 180 rows, modified StoredProc1, Index1, no StoredProc2 |

---

### Scenario 1: Delete Snapshot B

**Action:** Delete B (the middle snapshot)

**Result:**

| Item | State After Delete |
|------|-------------------|
| Database | **Unchanged** - still 180 rows, current schema |
| Snapshot A | Still exists, still valid |
| Snapshot B | **Gone** |
| Snapshot C | Still exists, still valid |
| Recoverable states | A (100 rows) and C (150 rows) only |

**What this means:** You can still rollback to A or C, but B's state (120 rows with original StoredProc1 and StoredProc2) is **no longer recoverable**.

---

### Scenario 2: Rollback to Snapshot B

**Action:** Rollback to B

**Result:**

| Item | State After Rollback |
|------|---------------------|
| Database rows | **120 rows** (60 rows of data GONE FOREVER) |
| StoredProc1 | **Reverted** to original version (modifications lost) |
| StoredProc2 | **Restored** (it existed when B was created) |
| Index1 | **Gone** (didn't exist when B was created) |
| Snapshot A | **Gone** (SQL Parrot cleans up all snapshots) |
| Snapshot B | **Gone** |
| Snapshot C | **Gone** |
| New snapshot | **Automatic** snapshot created at reverted state |

**What's lost permanently:**
- 60 rows of data added after B
- Index1
- All modifications to StoredProc1 made after B
- The states captured by snapshots A and C

---

### Scenario 3: Rollback to Snapshot A

**Action:** Rollback to A (the oldest snapshot)

**Result:**

| Item | State After Rollback |
|------|---------------------|
| Database rows | **100 rows** (80 rows of data GONE FOREVER) |
| StoredProc1 | Original version only |
| StoredProc2 | **Gone** (didn't exist when A was created) |
| Index1 | **Gone** |
| All snapshots | **Gone** |
| New snapshot | **Automatic** snapshot created |

**What's lost permanently:**
- 80 rows of data
- StoredProc2 (entire stored procedure)
- Index1
- All modifications to StoredProc1

---

### Scenario 4: Delete A, Delete C, Then Rollback

**Action:** Delete snapshots A and C, leaving only B

**Result after deletes:**
- Database: unchanged (still 180 rows, current state)
- Only Snapshot B remains

**If you then want to rollback:**
- Can **only** rollback to B
- States captured by A (100 rows) and C (150 rows) are **no longer recoverable**
- Deleting a snapshot permanently removes that recovery point

---

## DDL and Schema Changes

Snapshots capture the complete schema definition, not just data. This includes:

| Schema Element | Snapshot Behavior |
|----------------|-------------------|
| Stored procedure code | Captured - rollback restores old code |
| Index definitions | Captured - indexes removed/restored based on snapshot |
| Table columns | Captured - schema changes reverted |
| Constraints | Captured - FK, PK, CHECK constraints reverted |
| Views | Captured - view definitions restored |
| Triggers | Captured - trigger code restored |
| Functions | Captured - function definitions restored |
| User permissions | Captured - permissions as of snapshot time |

**Example:** If you modify a stored procedure after creating a snapshot and then rollback, you get the **old version** of the procedure. Your code changes are gone.

---

## Why Rollback Removes All Snapshots ("There Can Be Only One")

This is a **SQL Server requirement**, not a SQL Parrot design choice.

When you execute `RESTORE DATABASE [X] FROM DATABASE_SNAPSHOT = 'Y'`:

1. SQL Server **requires** all other snapshots of database X to be dropped first
2. SQL Server won't auto-delete them - it simply **refuses** to restore if others exist
3. The snapshot you restore FROM (Y) gets **consumed** by the restore operation

**Example:** If you have snapshots A, B, C on database X and want to restore from B:
- You must DROP A and C first (SQL Server requirement)
- Then `RESTORE DATABASE X FROM DATABASE_SNAPSHOT = B`
- B is consumed/deleted by the restore
- Result: zero snapshots remain

**What SQL Parrot does:**
- Pre-emptively drops all SQL Parrot snapshots (`sf_%` naming pattern) before restore
- Detects and warns about external snapshots (won't delete those - provides SQL instead)
- Creates a fresh "Automatic" checkpoint after successful restore

This is why rollback is "scorched earth" - not by choice, but because SQL Server enforces the Highlander rule.

---

## SQL Parrot's Specific Behavior

### Scorched Earth Rollback

When you rollback in SQL Parrot, it performs a "scorched earth" cleanup:

1. Restores the database to the selected snapshot
2. **Deletes ALL snapshots** in that group
3. Creates one fresh **"Automatic"** checkpoint at the reverted state

**Why?** This prevents confusion about what remaining snapshots represent. After a rollback, the timeline has changed - old snapshots would reference states that no longer make sense in the new timeline.

### Group Isolation

Snapshots are organized into groups. Rolling back Group A's snapshots **does not affect** Group B's snapshots.

Use groups to organize snapshots by:
- Feature branch / task
- Testing session
- Risk category

---

## Important: Snapshots Block Backup Restores

SQL Server **will not allow you to restore a backup** if any snapshots exist for that database. You'll get an error like:

```
RESTORE cannot be performed on database 'MyDatabase' because it has one or more database snapshots.
```

**Solution:** Use SQL Parrot to delete all snapshots for that database before restoring your backup.

**Note:** SQL Parrot's **Verify** button detects ALL snapshots on the server, including ones created outside of SQL Parrot. These show up as "orphaned snapshots" and can be cleaned up through the verification dialog.

---

## Best Practices

### Before Risky Operations

Create a snapshot before:
- Bulk UPDATE or DELETE statements
- Schema changes (ALTER TABLE, etc.)
- Stored procedure modifications
- Data migrations
- Any operation you might want to undo

### Naming Conventions

Name snapshots descriptively so future-you knows what state they represent:

| Good Names | Bad Names |
|------------|-----------|
| `Before bulk customer update` | `snapshot1` |
| `Pre-schema-migration-v2` | `backup` |
| `Working state - feature complete` | `test` |

### Key Reminders

1. **Rollback is destructive** - there is no way to recover changes made after the snapshot
2. **Delete is safe** - only removes the safety net, doesn't touch your data
3. **Snapshots are independent** - deleting one doesn't affect others
4. **Schema is included** - stored procedures, indexes, everything reverts
5. **Test in dev first** - if you're unsure, practice on a non-production database

---

## Quick Reference

### "I want to remove a snapshot I don't need"
Use **Delete**. Your database stays exactly as it is.

### "I want to undo changes and go back to a previous state"
Use **Rollback**. Understand that:
- All data/schema changes after that snapshot are lost
- All snapshots in the group will be removed
- You'll get a fresh "Automatic" snapshot at the reverted state

### "Can I rollback and keep my other snapshots?"
No. SQL Parrot's rollback is designed to clean up all snapshots to prevent timeline confusion. Create a new snapshot after rollback if you need a checkpoint.

### "I accidentally deleted a snapshot - can I recover that state?"
No. Once a snapshot is deleted, that recovery point is gone. The only way to reach that state is if you have another snapshot from the same point in time (unlikely) or backups.
