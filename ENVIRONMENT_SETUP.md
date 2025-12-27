# Environment Configuration Guide

SQL Parrot can be run in three different ways, each with slightly different configuration needs.

## Deployment Options Overview

| Method | Backend | Use Case | Config Location |
|--------|---------|----------|-----------------|
| **Docker** | Node.js/Express | Self-hosted server deployment | Root `.env` file |
| **npm dev** | Node.js/Express | Local development | Root `.env` file |
| **Tauri Desktop** | Rust/tiberius | Desktop app ("double-click and run") | App settings dialog |

---

## 🐳 Docker Mode

**Best for:** Server deployment, self-hosted environments

**You only need ONE `.env` file** in the project root.

```bash
# Copy the example file
cp env.example .env

# Edit with your settings
nano .env  # or use your preferred editor

# Run with Docker
docker-compose up
```

Docker Compose automatically reads your `.env` file and injects the variables into the container.

### Required Environment Variables
```env
SQL_SERVER=host.docker.internal   # Use this to connect to host SQL Server from Docker
SQL_PORT=1433
SQL_USERNAME=your_username
SQL_PASSWORD=your_password
SQL_TRUST_CERTIFICATE=true

# User identification for audit trail
SQLPARROT_USER_NAME=your_name_here

# Snapshot storage (must be accessible to SQL Server)
SNAPSHOT_PATH=/var/opt/mssql/snapshots
```

---

## 💻 NPM Development Mode

**Best for:** Local development, testing, contributing

**You only need ONE `.env` file** in the project root.

```bash
# Copy the example file
cp env.example .env

# Edit with your settings
nano .env

# Install dependencies
npm run install:all

# Start development servers
npm run dev
```

### How It Works
- **Root `.env`**: Used by both frontend dev server and backend
- **Frontend**: React app on port 3000, talks to backend via API
- **Backend**: Express server on port 3001, connects to SQL Server

### Required Environment Variables
```env
SQL_SERVER=localhost              # Or your SQL Server hostname
SQL_PORT=1433
SQL_USERNAME=your_username
SQL_PASSWORD=your_password
SQL_TRUST_CERTIFICATE=true

SQLPARROT_USER_NAME=your_name_here
SNAPSHOT_PATH=C:\Snapshots        # Windows path
```

---

## 🖥️ Tauri Desktop App

**Best for:** End users who want a simple "double-click and run" experience

The Tauri desktop app stores configuration in its settings dialog - no `.env` file needed.

### First-Time Setup
1. Launch the SQL Parrot desktop app
2. Go to **Settings** tab
3. Enter your SQL Server connection details
4. Click **Test Connection** to verify
5. Save settings

### Configuration Storage
- **Windows**: `%APPDATA%\SQL Parrot\config.json`
- **Mac**: `~/Library/Application Support/SQL Parrot/config.json`
- **Linux**: `~/.config/sql-parrot/config.json`

---

## 🔧 Environment Variable Priority

1. **Environment variables** (highest priority)
2. **Docker Compose variables** (from host `.env`)
3. **Backend `.env` file** (NPM mode only)
4. **Default values** (lowest priority)

---

## 🗄️ Metadata Storage

SQL Parrot stores all metadata (groups, snapshots, history) in a **local SQLite database**:

| Mode | Location |
|------|----------|
| Docker | `/app/data/sqlparrot.db` (in container) |
| npm dev | `backend/data/sqlparrot.db` |
| Tauri | App data directory |

This means:
- No SQL Server metadata database needed
- Metadata is portable with your installation
- Zero additional database configuration

---

## 🔐 SQL Server Permissions

All three deployment methods need the same SQL Server permissions. See [README.md](README.md#-sql-server-permissions-required) for the recommended service account setup.

**Quick setup:**
```sql
CREATE LOGIN [sql_parrot_service] WITH PASSWORD = 'YourSecurePassword!';
GRANT CREATE ANY DATABASE TO [sql_parrot_service];
GRANT ALTER ANY DATABASE TO [sql_parrot_service];
ALTER SERVER ROLE dbcreator ADD MEMBER [sql_parrot_service];
GRANT VIEW ANY DEFINITION TO [sql_parrot_service];
GRANT VIEW SERVER STATE TO [sql_parrot_service];
```

---

## 🔍 Troubleshooting

### "No SQL Server configuration found"
- **Docker/npm**: Check that `.env` file exists in project root with correct credentials
- **Tauri**: Go to Settings and configure connection

### "Connection timeout"
- Verify SQL Server is running and accessible
- Check firewall settings
- For Docker: ensure `host.docker.internal` resolves correctly

### "Login failed"
- Verify username/password
- Check SQL Server is configured for SQL Server Authentication (not Windows-only)

### Check Environment Detection
For Docker/npm modes, visit `/api/environment` in your browser to see how SQL Parrot detects your environment.
