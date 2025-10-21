# SQL Parrot - Snapshot Restore Behavior Documentation

## Overview

This document explains how SQL Server database snapshots work and how our application handles snapshot restoration, including the automatic cleanup and checkpoint creation process. This is essential reading for understanding the rollback workflow and troubleshooting snapshot issues.

## How SQL Server Database Snapshots Work

### Key Facts

1. **SQL Server requires only ONE snapshot to exist** for a database when performing a restore operation
2. **When you restore from a snapshot, SQL Server automatically removes that snapshot** during the restore process
3. **Other snapshots are NOT automatically removed** - they must be manually dropped
4. **Once you restore to a snapshot, you cannot restore to earlier snapshots** - they become unusable
5. **Snapshots can only be created from databases with data files** (log files are excluded)

### SQL Server Restore Command

```sql
RESTORE DATABASE [DatabaseName] FROM DATABASE_SNAPSHOT = 'SnapshotName';
```

This command:
- Restores the database to the state when the snapshot was taken
- Automatically removes the source snapshot
- Leaves all other snapshots intact (but unusable)

## Our Application's Rollback Process

### What Happens When You Rollback to a Snapshot

**Example Scenario:** You have snapshots A, B, C and want to restore to B

1. **Drop Other Snapshots**: Our application drops snapshots A and C (but keeps B)
2. **Restore from Target**: SQL Server restores the database from snapshot B
3. **Target Snapshot Removed**: SQL Server automatically removes snapshot B during restore
4. **All Snapshots Gone**: No snapshots remain (A, B, C are all gone)
5. **Create Automatic Checkpoint**: Our application immediately creates a new "Automatic Checkpoint Snapshot"
6. **Reset Sequence**: Sequence numbering starts fresh from 1

### The Complete Workflow

```
Before Rollback: A(1) → B(2) → C(3)
Restore to B: Drop A, C → Restore from B → B auto-removed
After Rollback: Automatic Checkpoint Snapshot(1) ← All databases restored to B's state
```

### Why This Approach?

1. **Clean Slate**: After restore, you have a clean slate with no old snapshots
2. **Preserve State**: The automatic checkpoint preserves the restored state as a new starting point
3. **Prevent Confusion**: No orphaned or unusable snapshots remain
4. **Reset Sequence**: Sequence numbering starts fresh, avoiding conflicts
5. **Single Checkpoint**: There's always exactly one "Automatic Checkpoint Snapshot"

## Automatic Checkpoint Management

### The Single Checkpoint Rule

Our application enforces a **single checkpoint rule**:

- **Only one "Automatic Checkpoint Snapshot" can exist** at any time
- **After every rollback**, the old checkpoint is removed and a new one is created
- **The checkpoint represents the current state** of your databases
- **Future snapshots** are created with sequence numbers 2, 3, 4, etc.

### Checkpoint Lifecycle

```
Initial State: Automatic Checkpoint Snapshot(1)
Create Snapshot A: Automatic Checkpoint Snapshot(1) → Snapshot A(2)
Create Snapshot B: Automatic Checkpoint Snapshot(1) → Snapshot A(2) → Snapshot B(3)
Rollback to A: Drop B → Restore A → A auto-removed → New Automatic Checkpoint Snapshot(1)
```

### Benefits of Single Checkpoint

1. **Clear State**: You always know what the "current" state is
2. **No Confusion**: No multiple checkpoints to choose from
3. **Consistent Naming**: Always called "Automatic Checkpoint Snapshot"
4. **Fresh Sequence**: Sequence numbering resets after every rollback

## Implementation Details

### Step-by-Step Process

1. **Identify Target Snapshot**: Find the snapshot to restore to
2. **Drop Other Snapshots**: Remove all snapshots except the target
3. **Restore Database**: Use SQL Server's restore command
4. **Clean Metadata**: Remove all snapshots from our data files
5. **Create Automatic Checkpoint**: Immediately create a new "Automatic Checkpoint Snapshot"
6. **Log History**: Record the rollback and checkpoint creation

### Code Flow

```javascript
// 1. Drop other snapshots
const otherSnapshots = snapshots.filter(s => s.id !== targetId);
for (const snap of otherSnapshots) {
  await pool.request().query(`DROP DATABASE [${snap.snapshotName}]`);
}

// 2. Restore from target (target gets auto-removed)
await pool.request().query(`DROP DATABASE [${sourceDb}]`);
await pool.request().query(`RESTORE DATABASE [${sourceDb}] FROM DATABASE_SNAPSHOT = '${targetSnapshot}'`);

// 3. Remove all snapshots from metadata
snapshotsData.snapshots = snapshotsData.snapshots.filter(s => s.groupId !== targetGroupId);

// 4. Create automatic checkpoint snapshot
const checkpoint = await createSnapshot(group, "Automatic Checkpoint Snapshot");

// 5. Log to history
await logHistory('create_automatic_checkpoint', checkpoint);
```

## User Experience

### What You See

1. **Before Rollback**: Multiple snapshots (A, B, C) with sequence numbers 1, 2, 3
2. **During Rollback**: Confirmation dialog warning about snapshot removal
3. **After Rollback**: Single "Automatic Checkpoint Snapshot" with sequence number 1
4. **Future Snapshots**: New snapshots continue with sequence 2, 3, 4...

### Benefits

- **No Orphaned Snapshots**: All old snapshots are properly cleaned up
- **Clear State**: You always know exactly what state your databases are in
- **Fresh Start**: Sequence numbering resets, preventing conflicts
- **Preserved State**: The restored state is immediately preserved as a checkpoint

## Error Handling

### Common Issues

1. **Snapshot Already Dropped**: If a snapshot was already removed, skip it
2. **Database Restore Failure**: Log the error and continue with other databases
3. **Checkpoint Creation Failure**: Log the error but don't fail the entire operation

### Recovery

If something goes wrong during rollback:
1. Check the console logs for specific error messages
2. Verify database states in SQL Server Management Studio
3. Use the "Refresh Snapshots" button to sync the UI with actual state
4. If needed, manually clean up orphaned snapshots using the cleanup endpoint
5. Use the health check endpoint (`GET /api/health`) to identify orphaned snapshots
6. Consider resetting the application state by deleting `data/snapshots.json`

## Best Practices

### For Users

1. **Always confirm rollback operations** - they cannot be undone
2. **Check the automatic checkpoint** after rollback to ensure it was created successfully
3. **Create new snapshots** after making changes to preserve your work
4. **Use descriptive names** for snapshots to track your progress
5. **Remember the single checkpoint rule** - there's always exactly one "Automatic Checkpoint Snapshot"

### For Developers

1. **Always log operations** to history for debugging
2. **Handle errors gracefully** - don't fail the entire operation for one database
3. **Verify cleanup** - ensure all snapshots are properly removed
4. **Test edge cases** - what happens with failed snapshots, missing databases, etc.

## Troubleshooting

### "Multiple snapshots exist" Error

This means SQL Server found multiple snapshots for a database during restore. Our application should prevent this by dropping other snapshots first, but if it happens:

1. Check if our cleanup process failed
2. Manually drop the extra snapshots
3. Retry the rollback operation

### Missing Automatic Checkpoint After Rollback

If the automatic checkpoint wasn't created:

1. Check the console logs for checkpoint creation errors
2. Verify the group still exists and has databases
3. Manually create a new snapshot if needed
4. The databases should still be in the restored state

### Orphaned Snapshots

If you see snapshots in SQL Server that aren't in the UI:

1. Use the "Refresh Snapshots" button
2. Check for unmanaged snapshots in the console logs
3. Use the cleanup endpoint to remove them
4. Verify the snapshots.json file is in sync

## Conclusion

This rollback process ensures a clean, predictable state after every restore operation. By automatically cleaning up old snapshots and creating a single "Automatic Checkpoint Snapshot", we prevent the confusion and issues that can arise from orphaned snapshots and sequence number conflicts.

The key insight is that **SQL Server doesn't automatically clean up other snapshots** - our application must manage this cleanup to provide a smooth user experience. The single checkpoint rule ensures you always have a clear reference point for the current state of your databases.

### Related Documentation

- [Main README](../README.md) - Complete feature overview and setup instructions
- [Troubleshooting Guide](../README.md#-troubleshooting) - Common issues and solutions
- [API Documentation](../README.md#api-endpoints) - Complete endpoint reference
