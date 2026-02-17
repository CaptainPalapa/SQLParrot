# SQL Server Snapshot Behavior in SQL Parrot

This document explains how SQL Server snapshots work and how SQL Parrot manages them. Reference this when you need to understand what will happen before performing snapshot operations.

## SQL Server Requirements

### Version & Edition Support

| SQL Server Version | Enterprise | Standard | Developer | Express |
| ------------------ | :--------: | :------: | :-------: | :-----: |
| 2016 SP1+          |     ✅      |    ✅     |     ✅     |    ✅    |
| 2017+              |     ✅      |    ✅     |     ✅     |    ✅    |
| 2019+              |     ✅      |    ✅     |     ✅     |    ✅    |
| 2022+              |     ✅      |    ✅     |     ✅     |    ✅    |
| 2016 Pre-SP1       |     ✅      |    ❌     |     ✅     |    ❌    |
| 2014 and earlier   |     ✅      |    ❌     |     ✅     |    ❌    |

**Note:** Microsoft made snapshots available in all editions starting with SQL Server 2016 SP1.

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

| Captured                            | NOT Captured       |
| ----------------------------------- | ------------------ |
| All table data (rows)               | Full-text catalogs |
| Stored procedures                   |                    |
| Views                               |                    |
| Triggers                            |                    |
| Functions                           |                    |
| Indexes                             |                    |
| Table schema (columns, constraints) |                    |
| User permissions                    |                    |

**Key point:** Snapshots are **independent of each other**. They are not incremental or chained. Each snapshot is a complete point-in-time capture.

### Full-Text Search Warning

**If your database uses full-text search, read this carefully.**

Full-text catalogs are NOT included in snapshots. When you query a snapshot, full-text searches run against the **source database's current catalog**, not the snapshot's point-in-time state. This is a SQL Server architectural limitation.

**What this means after Discard Changes:**
- Relational data: Restored to snapshot point-in-time ✅
- Full-text indexes: Still reflect the state before Discard Changes ❌
- Result: Full-text queries may return inconsistent results

**Workaround:** After restoring from a snapshot, rebuild full-text catalogs:

```sql
-- Rebuild the full-text catalog
ALTER FULLTEXT CATALOG YourCatalogName REBUILD;

-- Or rebuild specific full-text index
ALTER FULLTEXT INDEX ON YourTable START FULL POPULATION;
```

**Note:** Catalog rebuilds can be time-consuming and I/O intensive for large databases.

**If full-text consistency is critical:** Consider alternatives like temporal tables (SQL Server 2016+), log shipping, or traditional backups instead of snapshots.

---

## Keep Changes vs Discard Changes: The Core Difference

In the UI, each snapshot has two actions (the API still uses "delete" and "rollback" under the hood):

| Operation | What It Does | Database Impact | Use When |
|-----------|--------------|-----------------|----------|
| **Keep Changes** | Removes the snapshot only | **NONE** - database is completely unchanged | "I accept the current state; I don't need this recovery point anymore" |
| **Discard Changes** | Reverts database to snapshot's point-in-time state | **DESTRUCTIVE** - all changes since snapshot are lost | "Take me back to this checkpoint" |

**Keep Changes is safe.** It only removes the ability to restore to that point. Your current data is untouched.

**Discard Changes is destructive.** Everything added, modified, or deleted after the snapshot was created will be lost or reverted.

**Which snapshot to use when discarding:** SQL Server requires all snapshots to be removed before you can restore from any one. So when you click Discard Changes, every snapshot in the group is dropped and you restore only to the snapshot you chose. You can't "step back" to Test 2 and then later to Test 1 — you get one restore. **To go back to an earlier point in time** (e.g. before today's changes), use **Discard Changes on that earlier snapshot** (the one with the earlier date). Pick the snapshot that represents the point you want.

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

### Scenario 1: Keep Changes (remove snapshot B)

**Action:** Keep Changes on B (the middle snapshot)

**Result:**

| Item | State After Keep Changes |
|------|-------------------|
| Database | **Unchanged** - still 180 rows, current schema |
| Snapshot A | Still exists, still valid |
| Snapshot B | **Gone** |
| Snapshot C | Still exists, still valid |
| Recoverable states | A (100 rows) and C (150 rows) only |

**What this means:** You can still Discard Changes to A or C, but B's state (120 rows with original StoredProc1 and StoredProc2) is **no longer recoverable**.

---

### Scenario 2: Discard Changes (restore to snapshot B)

**Action:** Discard Changes — restore to B

**Result:**

| Item | State After Discard Changes |
|------|---------------------|
| Database rows | **120 rows** (60 rows of data GONE FOREVER) |
| StoredProc1 | **Reverted** to original version (modifications lost) |
| StoredProc2 | **Restored** (it existed when B was created) |
| Index1 | **Gone** (didn't exist when B was created) |
| Snapshot A | **Gone** (SQL Parrot cleans up all snapshots when you discard changes) |
| Snapshot B | **Gone** |
| Snapshot C | **Gone** |
| New snapshot | **Automatic** snapshot created at reverted state |

**What's lost permanently:**
- 60 rows of data added after B
- Index1
- All modifications to StoredProc1 made after B
- The states captured by snapshots A and C

---

### Scenario 3: Discard Changes (restore to snapshot A)

**Action:** Discard Changes — restore to A (the oldest snapshot)

**Result:**

| Item | State After Discard Changes |
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

### Scenario 4: Keep Changes for A and C, then Discard Changes to B

**Action:** Keep Changes on snapshots A and C, leaving only B

**Result after keeping changes:**
- Database: unchanged (still 180 rows, current state)
- Only Snapshot B remains

**If you then Discard Changes to B:**
- You can **only** restore to B
- States captured by A (100 rows) and C (150 rows) are **no longer recoverable**
- Keeping changes (removing a snapshot) permanently removes that recovery point

---

## DDL and Schema Changes

Snapshots capture the complete schema definition, not just data. This includes:

| Schema Element | Snapshot Behavior |
|----------------|-------------------|
| Stored procedure code | Captured - Discard Changes restores old code |
| Index definitions | Captured - indexes removed/restored based on snapshot |
| Table columns | Captured - schema changes reverted |
| Constraints | Captured - FK, PK, CHECK constraints reverted |
| Views | Captured - view definitions restored |
| Triggers | Captured - trigger code restored |
| Functions | Captured - function definitions restored |
| User permissions | Captured - permissions as of snapshot time |

**Example:** If you modify a stored procedure after creating a snapshot and then Discard Changes, you get the **old version** of the procedure. Your code changes are gone.

---

## Why Discard Changes Removes All Snapshots

This is a **SQL Server requirement**, not a SQL Parrot design choice.

When you execute `RESTORE DATABASE [X] FROM DATABASE_SNAPSHOT = 'Y'`:

1. SQL Server **requires** all other snapshots of database X to be dropped first
2. SQL Server won't auto-delete them - it simply **refuses** to restore if others exist
3. The snapshot you restore FROM (Y) gets **consumed** by the restore operation

**Why must other snapshots be dropped?** Those snapshots were based on a database state (or progression of states) that will no longer exist after the restore. Once you revert to an earlier point-in-time, later snapshots become invalid - they reference pages and data from a timeline that's been discarded.

**Example:** If you have snapshots A, B, C on database X and want to restore from B:
- You must DROP A and C first (SQL Server requirement)
- Then `RESTORE DATABASE X FROM DATABASE_SNAPSHOT = B`
- B is consumed/deleted by the restore
- Result: zero snapshots remain

**What SQL Parrot does:**
- Pre-emptively drops all group-related snapshots before restore
- Detects and warns about external snapshots (won't delete those - provides SQL instead)
- Creates a fresh "Automatic" checkpoint after successful restore

---

## SQL Parrot's Specific Behavior

### What Happens When You Discard Changes

When you choose **Discard Changes** in SQL Parrot, it performs a "scorched earth" cleanup:

1. Restores the database to the selected snapshot
2. **Removes ALL snapshots** in that group
3. Creates one fresh **"Automatic"** checkpoint at the reverted state

**Why?** This prevents confusion about what remaining snapshots represent. After discarding changes, the timeline has changed — old snapshots would reference states that no longer make sense in the new timeline.

### Group Isolation

Snapshots are organized into groups. Discarding changes for Group A's snapshots **does not affect** Group B's snapshots.

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

**Solution:** Use SQL Parrot to remove all snapshots for that database (Keep Changes on each, or use cleanup) before restoring your backup.

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

1. **Discard Changes is destructive** — there is no way to recover changes made after the snapshot
2. **Keep Changes is safe** — only removes the recovery point, doesn't touch your data
3. **Snapshots are independent** — keeping changes on one doesn't affect others
4. **Schema is included** — stored procedures, indexes, everything reverts when you Discard Changes
5. **Test in dev first** — if you're unsure, practice on a non-production database

---

## Quick Reference

### "I want to remove a snapshot I don't need"
Use **Keep Changes**. Your database stays exactly as it is; only the snapshot is removed.

### "I want to undo changes and go back to a previous state"
Use **Discard Changes**. Understand that:
- All data/schema changes after that snapshot are lost
- All snapshots in the group will be removed
- You'll get a fresh "Automatic" snapshot at the reverted state

### "Can I Discard Changes and keep my other snapshots?"
No. SQL Parrot's Discard Changes flow is designed to clean up all snapshots to prevent timeline confusion. Create a new snapshot after discarding changes if you need a checkpoint.

### "I accidentally used Keep Changes on a snapshot — can I recover that state?"
No. Once a snapshot is removed, that recovery point is gone. The only way to reach that state is if you have another snapshot from the same point in time (unlikely) or backups.
