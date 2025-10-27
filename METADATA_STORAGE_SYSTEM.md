# SQL Server Metadata Storage System

SQL Parrot now uses **SQL Server metadata tables exclusively** for storing snapshot metadata. This provides centralized storage, multi-user support, and comprehensive audit trails.

## Requirements

### Environment Variables (REQUIRED)

Add these variables to your `.env` file:

```bash
# SQL Server Connection (REQUIRED)
SQL_SERVER=your_sql_server_host
SQL_PORT=1433
SQL_USERNAME=your_username_here
SQL_PASSWORD=your_password_here
SQL_TRUST_CERTIFICATE=true

# User identification for audit trail (REQUIRED)
SQLPARROT_USER_NAME=your_name_here
```

### SQL Server Permissions

The SQL Server user must have:
- **CREATE DATABASE** permission (to create the `sqlparrot` metadata database)
- **Table creation permissions** (to create metadata tables)
- **Snapshot creation permissions** (for actual database snapshots)
- **Database access permissions** (to read database information)

## Database Design

### Metadata Database: `sqlparrot`

SQL Parrot creates a dedicated `sqlparrot` database that is:
- **Separate from user databases** - never touches your actual data
- **Excluded from all snapshot/restore operations** - metadata only
- **Shared across all instances** - Docker, local npm, etc.

### Tables Created

1. **`[snapshot]`** - Snapshot metadata
   - `snapshot_name` - Unique snapshot identifier
   - `display_name` - User-friendly name
   - `group_id` / `group_name` - Associated database group
   - `sequence` - Snapshot sequence number
   - `created_by` - User who created the snapshot
   - `created_at` - Creation timestamp
   - `database_count` - Number of databases in snapshot
   - `database_snapshots` - JSON array of database snapshot details

2. **`[history]`** - Operation history with audit trail
   - `timestamp` - When the operation occurred
   - `type` - Operation type (create_snapshots, restore_snapshot, etc.)
   - `user_name` - User who performed the operation
   - `group_name` - Database group involved
   - `snapshot_name` - Snapshot involved
   - `details` - JSON object with operation details

3. **`[stats]`** - System statistics
   - `stat_name` - Statistic name (e.g., 'snapshot_count')
   - `stat_value` - Statistic value
   - `updated_at` - Last update timestamp

## Benefits

### Multi-User Support
- **Centralized metadata** - All users see the same snapshots
- **User attribution** - Track who created/modified snapshots
- **Concurrent access** - Multiple users can work simultaneously
- **Audit trail** - Complete history of all operations

### Consistency
- **Single source of truth** - SQL Server is the authority
- **No sync issues** - All instances read from the same database
- **Automatic conflict resolution** - SQL Server handles concurrency

### Performance
- **Better performance** for large datasets
- **Indexed queries** for fast snapshot retrieval
- **Efficient storage** - No duplicate JSON files

## Startup Process

### Fail-Fast Validation

The application now **fails fast** on startup if:
1. **Required environment variables are missing**
2. **SQL Server connection fails**
3. **User lacks required permissions**
4. **Metadata database cannot be created**

### Initialization Steps

1. **Test SQL Server connection** - Verify credentials work
2. **Create metadata database** - Create `sqlparrot` database if needed
3. **Create metadata tables** - Set up snapshot, history, and stats tables
4. **Verify initialization** - Confirm all tables exist and are accessible

## Error Handling

### Connection Failures

If SQL Server is unavailable:
- **Application exits immediately** with clear error message
- **No fallback to JSON** - SQL Server is mandatory
- **Clear error messages** indicate what needs to be fixed

### Permission Errors

If user lacks required permissions:
- **Application exits immediately** with specific permission requirements
- **Clear guidance** on what permissions are needed
- **No partial functionality** - all-or-nothing approach

## Migration from JSON Storage

### Clean Slate Approach

- **No migration needed** - fresh start with SQL Server metadata
- **Existing JSON files ignored** - only SQL Server metadata is used
- **Automatic cleanup** - orphaned snapshots are detected and cleaned up

### Data Consistency

- **SQL Server snapshots are the source of truth**
- **Metadata database reflects actual SQL Server state**
- **Automatic verification** ensures consistency

## Troubleshooting

### Common Issues

1. **"SQL Server connection failed"**
   - Check SQL_SERVER, SQL_PORT, SQL_USERNAME, SQL_PASSWORD
   - Verify SQL Server is running and accessible
   - Test connection with SQL Server Management Studio

2. **"Permission denied"**
   - Grant CREATE DATABASE permission to the user
   - Ensure user has table creation rights
   - Verify user can connect to SQL Server

3. **"Metadata database creation failed"**
   - Check if `sqlparrot` database already exists
   - Verify user has CREATE DATABASE permission
   - Check SQL Server disk space

### Logs to Check

- **Startup logs** - Connection and initialization status
- **Permission error messages** - Specific permission requirements
- **Database creation logs** - Metadata database setup
- **Table creation logs** - Metadata table setup

## Best Practices

### For Users

1. **Always set SQLPARROT_USER_NAME** - Required for audit trails
2. **Use descriptive usernames** - Helps identify who did what
3. **Monitor disk space** - Metadata database grows with usage
4. **Backup metadata database** - Include `sqlparrot` in backups

### For Administrators

1. **Grant appropriate permissions** - CREATE DATABASE + snapshot permissions
2. **Monitor metadata database size** - Can grow with heavy usage
3. **Set up regular backups** - Include `sqlparrot` database
4. **Monitor user activity** - Use audit trail for compliance

## Security Considerations

### Database Security

- **Dedicated metadata database** - Isolated from user data
- **User attribution** - Track all operations
- **Audit trail** - Complete operation history
- **No data exposure** - Only metadata, never actual database content

### Access Control

- **SQL Server authentication** - Uses SQL Server security
- **Permission-based access** - Only authorized users can operate
- **Operation logging** - All actions are recorded with user attribution

## Conclusion

The SQL Server metadata storage system provides a robust, scalable, and secure foundation for SQL Parrot. By eliminating JSON file dependencies and requiring SQL Server connectivity, we ensure:

- **Consistency across all instances** (Docker, local npm, etc.)
- **Multi-user support** with proper audit trails
- **Centralized metadata management**
- **Fail-fast validation** prevents partial functionality
- **Clear error messages** for easy troubleshooting

This approach eliminates the sync issues that occurred with hybrid storage and provides a solid foundation for enterprise use.
