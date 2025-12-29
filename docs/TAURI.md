# SQL Parrot Desktop App (Tauri)

The Tauri desktop app provides a native, cross-platform experience for SQL Parrot. It's designed for users who want a simple "double-click and run" solution without Docker or Node.js dependencies.

## Overview

| Aspect | Docker/npm Version | Tauri Desktop |
|--------|-------------------|---------------|
| **Backend** | Node.js/Express | Rust (tiberius crate) |
| **Frontend** | React (shared) | React (shared) |
| **SQL Server Driver** | mssql (Node.js) | tiberius (Rust) |
| **Metadata Storage** | SQLite | SQLite |
| **Configuration** | `.env` file | Settings dialog |
| **Distribution** | Docker image / npm | .exe (Windows), others planned |

## Installation

### Windows
Download the `.exe` or `.msi` installer from the [Releases](https://github.com/CaptainPalapa/SQLParrot/releases) page.

### macOS (Planned)
macOS builds (`.dmg`) are planned for a future release. For now, Mac users can use the Docker deployment option.

### Linux (Planned)
Linux builds (`.AppImage`, `.deb`) are planned for a future release. For now, Linux users can use the Docker deployment option.

---

## First-Time Setup

1. **Launch SQL Parrot**
2. **Go to Settings tab**
3. **Configure your SQL Server connection:**
   - **Host**: Your SQL Server hostname or IP
   - **Port**: Usually 1433
   - **Username**: SQL Server login
   - **Password**: Your password
   - **Trust Certificate**: Enable for self-signed certs (common in dev environments)
   - **Snapshot Path**: Where SQL Server stores snapshot files
4. **Click "Test Connection"** to verify
5. **Save settings**

---

## Configuration Storage

Settings are stored in the standard app data location:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\SQL Parrot\config.json` |
| macOS | `~/Library/Application Support/SQL Parrot/config.json` |
| Linux | `~/.config/sql-parrot/config.json` |

### Configuration Format

```json
{
  "version": 1,
  "activeProfile": "default",
  "profiles": {
    "default": {
      "name": "Default",
      "type": "sqlserver",
      "host": "localhost",
      "port": 1433,
      "username": "sql_parrot_service",
      "password": "...",
      "trustCertificate": true,
      "snapshotPath": "C:\\Snapshots"
    }
  },
  "preferences": {
    "theme": "blue",
    "maxHistoryEntries": 100,
    "autoCreateCheckpoint": true
  }
}
```

---

## SQL Server Requirements

The desktop app needs the same SQL Server permissions as Docker/npm versions.

### Quick Setup (run in SSMS or Azure Data Studio)

```sql
-- Create dedicated service account
CREATE LOGIN [sql_parrot_service] WITH PASSWORD = 'YourSecurePassword!';

-- Grant required permissions
GRANT CREATE ANY DATABASE TO [sql_parrot_service];
GRANT ALTER ANY DATABASE TO [sql_parrot_service];
ALTER SERVER ROLE dbcreator ADD MEMBER [sql_parrot_service];
GRANT VIEW ANY DEFINITION TO [sql_parrot_service];
GRANT VIEW SERVER STATE TO [sql_parrot_service];
```

**Important:** The `dbcreator` role is required for RESTORE operations. `CONTROL SERVER` alone is not sufficient.

---

## Snapshot Path Configuration

The snapshot path must be:
1. **Accessible to SQL Server** - SQL Server creates the snapshot files, not SQL Parrot
2. **Writable by SQL Server service account**

### Common Paths

| SQL Server Installation | Recommended Path |
|------------------------|------------------|
| Windows local | `C:\Snapshots` |
| Windows remote | `\\server\share\snapshots` |
| Docker (Linux) | `/var/opt/mssql/snapshots` |

### Docker SQL Server on Windows

If your SQL Server runs in Docker, the snapshot path should be a **Docker volume** path inside the container, not a Windows path:

```
/var/opt/mssql/snapshots
```

Make sure this volume is configured in your SQL Server container's docker-compose.

---

## Development

### Building from Source

```bash
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone repository
git clone https://github.com/CaptainPalapa/SQLParrot.git
cd SQLParrot

# Install frontend dependencies
cd frontend
npm install

# Run in development mode
npm run tauri:dev

# Build production release
npm run tauri:build
```

### Project Structure

```
SQLParrot/
├── frontend/               # React frontend (shared with Docker/npm)
│   └── src/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App setup, command registration
│   │   ├── config.rs       # Connection profile management
│   │   ├── models.rs       # Shared data types
│   │   ├── db/
│   │   │   ├── sqlserver.rs   # SQL Server via tiberius
│   │   │   └── metadata.rs    # SQLite metadata storage
│   │   └── commands/
│   │       ├── connection.rs  # Connection testing
│   │       ├── groups.rs      # Group CRUD
│   │       ├── snapshots.rs   # Snapshot operations
│   │       └── settings.rs    # Settings management
│   ├── Cargo.toml
│   └── tauri.conf.json
└── README.md
```

### Key Rust Dependencies

| Crate | Purpose |
|-------|---------|
| `tauri` | Desktop app framework |
| `tiberius` | SQL Server driver (TDS protocol) |
| `rusqlite` | SQLite for metadata storage |
| `tokio` | Async runtime |
| `serde` | Serialization |
| `chrono` | Date/time handling |

---

## Troubleshooting

### "Connection failed"
- Verify SQL Server is running and accessible from your machine
- Check firewall allows port 1433 (or your configured port)
- For Docker SQL Server: ensure the container is running

### "RESTORE permission denied"
- Ensure user has `dbcreator` role: `ALTER SERVER ROLE dbcreator ADD MEMBER [your_user];`
- `CONTROL SERVER` alone is NOT sufficient for RESTORE

### "Snapshot path access denied"
- SQL Server service account must have write access to snapshot path
- For Docker: use Docker volumes, not bind mounts

### App won't start
- Check logs in app data directory
- Windows: `%APPDATA%\SQL Parrot\logs\`
- Try running from command line to see error output

---

## Feature Parity

The Tauri desktop app has full feature parity with the Docker/npm version:

- Create and manage database groups
- Create database snapshots
- Rollback to snapshots
- Delete snapshots
- Automatic checkpoint after rollback
- Snapshot verification
- History tracking
- Theme selection
- All 7 themes available

---

## Differences from Docker Version

| Feature | Docker/npm | Tauri Desktop |
|---------|-----------|---------------|
| Configuration | `.env` file | Settings UI |
| Installation | Docker pull or npm install | Download installer |
| Updates | Docker pull / git pull | Download new version |
| Multi-user | Shared server | Single user |
| Remote access | Via web browser | Local only |

---

## Security Notes

- Credentials are stored locally in config.json (not encrypted in current version)
- Future versions may add OS keychain integration for secure credential storage
- The app only connects to SQL Server you configure - no external connections
- All operations are logged in local history
