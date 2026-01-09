# SQL Parrot 🦜

A beautiful, modern tool for managing SQL Server database snapshots with a stunning theme system.

![SQL Parrot](https://img.shields.io/badge/Version-1.5.1-blue.svg)
![Tests](https://github.com/CaptainPalapa/SQLParrot/actions/workflows/tests.yml/badge.svg)
[![Coverage](https://codecov.io/gh/CaptainPalapa/SQLParrot/branch/main/graph/badge.svg)](https://github.com/apps/codecov/installations/new)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-18+-61dafb.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1+-38bdf8.svg)
![Rust](https://img.shields.io/badge/Rust-1.77+-orange.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.9+-ffc131.svg)

> **📝 Note:** SQL Parrot works best for individual developers managing SQL Server databases where you're the primary person modifying data. Rollbacks revert *all* changes since the snapshot was created—if multiple users are modifying data, a rollback might unexpectedly undo someone else's work.

> **⚠️ Using Full-Text Search?** Database snapshots do NOT include full-text catalogs. If your databases use full-text indexes, read the [Full-Text Search Warning](docs/SNAPSHOT_BEHAVIOR.md#full-text-search-warning) before using SQL Parrot.

## ✨ Features

### 🗄️ **Database Management**
- **Group Organization**: Create and manage database groups
- **Snapshot Operations**: Create, restore, and delete snapshots
- **Real-time Monitoring**: See snapshot sizes, creation dates, and status
- **Unique Database Ownership**: Each database can only belong to one group

### 🔧 **Advanced Features**
- **Multi-Profile Support**: Create and switch between multiple SQL Server connection profiles
- **Profile-Specific Groups**: Groups are tied to specific profiles for clean organization
- **UI Password Protection**: Optional password protection for the SQL Parrot interface
- **Local SQLite Metadata Storage**: All metadata stored locally in SQLite database (no SQL Server metadata database needed)
- **Connection Testing**: Test SQL Server connections before operations
- **Orphaned Snapshot Cleanup**: Clean up orphaned snapshot databases and files
- **Health Monitoring**: Health check endpoint with orphaned snapshot detection
- **Automatic Checkpoint System**: Creates checkpoints after rollbacks with sequence management
- **Database Categorization**: Automatically categorizes databases (Global, User, Data Warehouse)
- **Multi-file Snapshot Support**: Handles databases with multiple data files
- **User Attribution**: Operation history with user tracking
- **Fail-Fast Validation**: Application validates SQL Server connection and permissions on startup
- **Responsive Design**: Beautiful UI that works on all devices

### 🎨 **Theme System**
- **Light/Dark Mode**: Toggle between light and dark backgrounds
- **7 Accent Colors**: Ocean Blue, Forest Emerald, Royal Purple, Sunset Rose, Autumn Orange, Ocean Teal, and Midnight
- **Live Preview**: Hover to preview themes instantly
- **Persistent Storage**: Your preferences are remembered

## 🚀 Quick Start

SQL Parrot can be run three ways:

| Method | Best For | Setup Time |
|--------|----------|------------|
| **🖥️ Desktop App** | End users, quick setup | ~2 minutes |
| **🐳 Docker** | Server deployment, self-hosted | ~5 minutes |
| **💻 npm dev** | Development, contributing | ~5 minutes |

### Option 1: Desktop App (Easiest)

Download the installer for your platform from [Releases](https://github.com/CaptainPalapa/SQLParrot/releases):
- **Windows**: `.exe` or `.msi`
- **macOS**: `.dmg`
- **Linux**: `.AppImage` or `.deb`

Launch the app, go to Settings, configure your SQL Server connection, and you're ready!

📖 **See [docs/TAURI.md](docs/TAURI.md) for desktop app documentation**

---

### Option 2: Docker or npm (Server/Development)

**Prerequisites:**
- Node.js 18+ (npm) or Docker
- SQL Server instance
- Git

**Clone and configure:**
```bash
git clone https://github.com/CaptainPalapa/SQLParrot.git
cd SQLParrot
cp env.example .env
# Edit .env with your SQL Server details
```

**🐳 Docker:**
```bash
docker-compose up
```

**💻 npm Development:**
```bash
npm run install:all
npm run dev
```

📖 **See [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) for detailed configuration guide**

**Access the application:**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001 (Docker/npm only)

---

## 🎨 Theme Browser

Access the theme browser by clicking the palette icon (🎨) in the header:

- **Browse Themes**: See all 7 themes in a beautiful grid
- **Live Preview**: Hover over themes for instant preview
- **One-Click Apply**: Click any theme to apply and save
- **Persistent**: Your choice is automatically saved

### Available Themes
- 🌊 **Ocean Blue** - Professional and clean
- 🌲 **Forest Emerald** - Fresh and natural
- 👑 **Royal Purple** - Elegant and sophisticated
- 🌅 **Sunset Rose** - Warm and inviting
- 🍂 **Autumn Orange** - Vibrant and energetic
- 🌊 **Ocean Teal** - Calming and serene
- 🌙 **Midnight Dark** - Modern dark mode

## 📖 Usage Guide

### 1. **Configure Connection**
   - Go to Settings tab
   - Enter your SQL Server details
   - Test the connection
   - Save settings

### 2. **Create Database Groups**
   - Click "New Group" button
   - Enter group name
   - Add databases (comma-separated)
   - Save the group

### 3. **Manage Snapshots**
   - Select a group
   - Click "Create Snapshot"
   - Enter snapshot name
   - Monitor progress in real-time

### 4. **Track Operations**
   - View History tab
   - See all operations with timestamps
   - Monitor success/failure status

### 5. **Automatic Checkpoint System**
   - After every rollback, an "Automatic Checkpoint Snapshot" is created
   - Only one checkpoint exists at any time (single checkpoint rule)
   - Sequence numbering resets after rollbacks (1, 2, 3...)
   - Checkpoints preserve the restored state as a new starting point

## 🏗️ Architecture

### **Frontend Stack**
- **React 18** - Modern component-based UI
- **Vite** - Lightning-fast development server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library

### **Backend Stack (Docker/npm)**
- **Node.js** - JavaScript runtime
- **Express** - Web application framework
- **mssql** - SQL Server driver

### **Backend Stack (Tauri Desktop)**
- **Rust** - Systems programming language
- **Tauri v2** - Desktop application framework
- **tiberius** - SQL Server driver (TDS protocol)
- **rusqlite** - SQLite driver for local metadata

### **Data Storage**
- **Local SQLite Database** - All metadata stored locally
  - `snapshots` table - Snapshot metadata with user attribution
  - `groups` table - Database group definitions
  - `history` table - Complete operation history
  - `settings` table - Application settings
- **Browser Storage** - Theme preferences stored in localStorage

## 📁 Project Structure

```
SQLParrot/
├── frontend/                 # React frontend (shared)
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/          # Custom React hooks
│   │   └── utils/          # Utility functions
│   └── package.json
├── backend/                 # Node.js backend (Docker/npm)
│   ├── server.js          # Express server
│   ├── utils/
│   │   └── metadataStorageSqlite.js
│   └── package.json
├── src-tauri/               # Rust backend (Desktop app)
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App setup
│   │   ├── db/             # Database modules
│   │   └── commands/       # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                    # Documentation
│   ├── SNAPSHOT_BEHAVIOR.md # Snapshot technical details
│   └── TAURI.md            # Desktop app docs
├── docker-compose.example.yml
└── README.md
```

## 🔧 Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend
npm run dev

# Start only frontend
npm run dev:frontend

# Start only backend
npm run dev:backend
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | Get all groups |
| POST | `/api/groups` | Create new group |
| PUT | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |
| GET | `/api/groups/:id/snapshots` | Get snapshots for group |
| POST | `/api/groups/:id/snapshots` | Create snapshots for group |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |
| POST | `/api/test-connection` | Test SQL Server connection |
| GET | `/api/databases` | Get available databases |
| GET | `/api/snapshots/unmanaged` | Get unmanaged snapshots count |
| POST | `/api/snapshots/cleanup` | Clean up orphaned snapshots |
| GET | `/api/health` | Application health check |
| POST | `/api/snapshots/:snapshotId/rollback` | Rollback to specific snapshot |
| POST | `/api/snapshots/:snapshotId/cleanup` | Cleanup invalid snapshot |
| DELETE | `/api/snapshots/:snapshotId` | Delete specific snapshot |
| GET | `/api/profiles` | Get all connection profiles |
| GET | `/api/profiles/:id` | Get specific profile |
| POST | `/api/profiles` | Create new profile |
| PUT | `/api/profiles/:id` | Update profile |
| DELETE | `/api/profiles/:id` | Delete profile |
| POST | `/api/profiles/:id/activate` | Set profile as active |

## 🐳 Docker Support

SQL Parrot is Docker-ready! Here's how to configure it:

### Docker Environment Variables

```env
# SQL Server Connection
SQL_SERVER=your_sql_server_host
SQL_USERNAME=your_username
SQL_PASSWORD=your_password
SQL_TRUST_CERTIFICATE=true

# Application Settings
NODE_ENV=production
PORT=3000

# Snapshot Storage Path (Docker)
SNAPSHOT_PATH=/var/opt/mssql/snapshots
```

### Docker Volume Configuration

**Important**: SQL Parrot doesn't manage snapshot files directly. The snapshot volume should be configured in your **SQL Server's Docker Compose file**, not in SQL Parrot's compose file.

```yaml
# In your SQL Server's docker-compose.yml
services:
  sql-server:
    image: mcr.microsoft.com/mssql/server:2022-latest
    volumes:
      - sql-server-data:/var/opt/mssql
      - snapshot-volume:/var/opt/mssql/snapshots  # Add this volume for snapshots
    environment:
      - ACCEPT_EULA=Y
      - SA_PASSWORD=YourStrong@Passw0rd

volumes:
  sql-server-data:
  snapshot-volume:  # Dedicated volume for snapshot files
```

**Note**: SQL Parrot uses `build: .` in its docker-compose.yml to build from the included Dockerfile. No external image repository is required.

### Snapshot Path Options

- **Docker**: `/var/opt/mssql/snapshots` (recommended for SQL Server containers)
- **Windows**: `C:\Snapshots`
- **Linux**: `/var/snapshots` or `/opt/snapshots`

## 🗄️ Local SQLite Metadata Storage

SQL Parrot uses a **local SQLite database** for storing all metadata. This provides zero-configuration setup, fast access, and no additional database dependencies.

### Key Benefits
- **Zero Configuration**: No separate metadata database needed in SQL Server
- **Fast Local Access**: SQLite provides instant read/write operations
- **User Attribution**: Operations tracked with configured username
- **Complete History**: All operations logged with timestamps
- **Self-Contained**: Metadata travels with your SQL Parrot installation

### Metadata Location
The SQLite database is stored at `backend/data/sqlparrot.db` and contains:
- **groups** - Database group definitions
- **snapshots** - Snapshot metadata and database mappings
- **history** - Complete operation history
- **settings** - Application preferences (snapshot path, auto-verification, etc.)

**Note:** UI preferences like theme and dark/light mode are stored in the browser's localStorage, not in SQLite.

### Docker Data Persistence

**Important:** For Docker deployments, you must mount a volume to persist your SQLite database. Without a volume, your data is lost when the container is recreated!

```yaml
services:
  sql-parrot:
    volumes:
      # Bind mount (recommended - easy to backup/inspect):
      - ./sqlparrot-data:/app/backend/data
      # Or named volume (Docker manages location):
      # - sqlparrot-data:/app/backend/data
```

- **Bind mount** (`./path:/container/path`): Maps a specific host folder. Easy to find, backup, and inspect.
- **Named volume** (`volume-name:/container/path`): Docker manages storage location. More portable but harder to locate files.

### Required Environment Variables
```env
# SQL Server Connection (REQUIRED)
SQL_SERVER=your_sql_server_host
SQL_PORT=1433
SQL_USERNAME=your_username_here
SQL_PASSWORD=your_password_here
SQL_TRUST_CERTIFICATE=true

# User identification for audit trail (OPTIONAL)
SQLPARROT_USER_NAME=your_name_here
```

## 🛠️ Configuration

### SQL Server Requirements
- SQL Server 2016 SP1+ (snapshots available in **all editions** including Express)
- SQL Server 2016 without SP1 or earlier requires Enterprise/Developer edition
- Appropriate permissions for snapshot operations (see below)
- Network access from the application server

📖 **See [docs/SNAPSHOT_BEHAVIOR.md](docs/SNAPSHOT_BEHAVIOR.md) for detailed information about how snapshots work, Delete vs Rollback behavior, and version requirements.**

### 🔐 SQL Server Permissions Required

SQL Parrot requires specific permissions to perform snapshot operations.

#### **Required Operations:**
- Create and drop database snapshots (`CREATE DATABASE ... AS SNAPSHOT OF`)
- Restore databases from snapshots (`RESTORE DATABASE ... FROM DATABASE_SNAPSHOT`)
- Access system metadata (`sys.databases`, `sys.master_files`)

#### **Permission Options:**

**Option 1: sysadmin Role (Simplest)**
```sql
ALTER SERVER ROLE sysadmin ADD MEMBER [your_username];
```
- ✅ Works immediately, full access
- ❌ Broad permissions (not recommended for production)

**Option 2: Dedicated Service Account (Recommended)**
```sql
-- Create a dedicated service account
CREATE LOGIN [sql_parrot_service] WITH PASSWORD = 'YourSecurePassword123!';

-- Required for CREATE DATABASE (snapshots)
GRANT CREATE ANY DATABASE TO [sql_parrot_service];

-- Required for ALTER DATABASE (SINGLE_USER/MULTI_USER mode during restore)
GRANT ALTER ANY DATABASE TO [sql_parrot_service];

-- CRITICAL: Required for RESTORE DATABASE FROM SNAPSHOT
ALTER SERVER ROLE dbcreator ADD MEMBER [sql_parrot_service];

-- Required for reading sys.databases and sys.master_files
GRANT VIEW ANY DEFINITION TO [sql_parrot_service];
GRANT VIEW SERVER STATE TO [sql_parrot_service];
```

**Note:** `CONTROL SERVER` permission is NOT sufficient for RESTORE operations - the `dbcreator` role is specifically required.

#### **Security Best Practices:**
- Use a dedicated service account (not `sa`)
- Grant minimum required permissions
- Use strong passwords
- Regularly audit permissions

#### **Troubleshooting Permission Issues:**
- **"CREATE DATABASE permission denied"** → User needs `dbcreator` role or `CREATE ANY DATABASE` permission
- **"RESTORE permission denied"** → User needs `dbcreator` server role (not just CONTROL SERVER)
- **"Cannot access sys.databases"** → User needs `VIEW ANY DEFINITION` permission
- **"Application fails to start"** → Check SQL Server connection and verify permissions above

### 🔒 Security & Environment Variables

**SQL Parrot uses secure environment variables for sensitive data:**

- **Credentials are stored in `.env` file** (never committed to git)
- **Settings file only stores non-sensitive preferences**
- **Passwords are masked in the UI** (`***masked***`)

**Required Environment Variables:**
```env
# SQL Server Connection (sensitive - stored in .env)
SQL_SERVER=your_server_address
SQL_PORT=1433
SQL_USERNAME=your_username
SQL_PASSWORD=your_password
SQL_TRUST_CERTIFICATE=true

# User identification for audit trail (REQUIRED)
SQLPARROT_USER_NAME=your_name_here

# Application Settings
NODE_ENV=development
PORT=3000

# Snapshot Storage Path, absolutely requires a Docker Volume, not a Bind Mount
SNAPSHOT_PATH=/var/opt/mssql/snapshots  # SQL Server on Docker/Linux
```

**Security Features:**
- ✅ Credentials never stored in version control
- ✅ Settings API masks sensitive data
- ✅ Environment variables take precedence over settings
- ✅ `.env` file is gitignored
- ✅ Local SQLite metadata isolated from SQL Server
- ✅ User attribution and audit trails for all operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

SQL Parrot is dual-licensed:

- **AGPL v3** - Free for open source use. If you modify and host SQL Parrot as a service, you must share your modifications under the same license.
- **Commercial License** - For organizations that want to use SQL Parrot without AGPL obligations. Contact the Author for commercial licensing inquiries.

See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ using React, Node.js, and Tailwind CSS
- Icons by [Lucide](https://lucide.dev/)
- Inspired by the need for better SQL Server snapshot management

## 🔧 Troubleshooting

### Common Issues

#### **Connection Problems**
- **"No SQL Server configuration found"**: Ensure your `.env` file exists and contains valid credentials
- **"Connection timeout"**: Check network connectivity and SQL Server firewall settings
- **"Login failed"**: Verify username/password and SQL Server authentication mode
- **"Application fails to start"**: Check SQL Server connection and required permissions

#### **Snapshot Creation Failures**
- **"No data files found"**: Database must have at least one data file (not just log files)
- **"Access denied"**: Ensure SQL Server service account has write permissions to snapshot path AND if using Docker that it is a Docker Volume, *not* a bind mount
- **"Insufficient disk space"**: Check available space in snapshot directory

#### **Snapshot Rollback Issues**
- **"Multiple snapshots exist"**: Use cleanup endpoint to remove orphaned snapshots first
- **"Snapshot not found"**: Refresh snapshots or check if snapshot was manually deleted
- **"Database in use"**: Ensure no active connections to the database

#### **File Management Problems**
- **"Orphaned snapshots detected"**: Use cleanup endpoint to remove orphaned snapshots
- **Manual file cleanup**: Use SSH into SQL Server container or Docker Desktop to manually remove snapshot files
- **Docker volume access**: Use `docker exec -it <sql-server-container> bash` to access snapshot directory
- **Metadata sync issues**: Use "Refresh Snapshots" button to sync UI with SQL Server state

### Health Check Endpoints

Use these endpoints to diagnose issues:

- `GET /api/health` - Check SQL Server connection and orphaned snapshots
- `GET /api/snapshots/unmanaged` - Count unmanaged snapshots

### Recovery Procedures

#### **Clean Up Orphaned Snapshots**
```bash
# Via API
curl -X POST http://localhost:3001/api/snapshots/cleanup

# Or use the cleanup endpoint for specific snapshots
curl -X POST http://localhost:3001/api/snapshots/{snapshotId}/cleanup
```

#### **Reset Application State**
1. Stop the application
2. Delete the SQLite database file: `backend/data/sqlparrot.db`
3. Restart the application (it will recreate the metadata database)
4. All metadata will be reset to clean state

#### **Manual Database Cleanup**
If automatic cleanup fails, manually drop orphaned snapshots:

```sql
-- List all snapshot databases (not regular databases)
SELECT name, source_database_id, create_date, state_desc
FROM sys.databases
WHERE source_database_id IS NOT NULL;

-- Drop specific snapshot database
DROP DATABASE [snapshot_name];
```

**Note**: The query above shows only snapshot databases (those with `source_database_id IS NOT NULL`). Regular databases will not appear in this list.

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/CaptainPalapa/SQLParrot/issues) page
2. Create a new issue with detailed information
3. Include your SQL Server version, specific error messages and any additional helpful details
4. Run health check endpoints and include their output

---

## 👨‍💻 About the Creator

**SQL Parrot** was conceived and designed by **Will Belden**, who believes that even minor tools should be both powerful and beautiful.

**AI-Assisted Development**: This project showcases AI-assisted development. Will's expertise lies in application design, architecture, and defining what tools should accomplish. The implementation leverages AI collaboration to bring those designs to life using modern web technologies.

The project represents:
- **Application Design Expertise** - Understanding user workflows and defining optimal solutions
- **Architectural Vision** - Structuring how applications should work and what they should accomplish
- **AI Collaboration** - Leveraging modern AI tools to bring design concepts to life
- **Open Source Philosophy** - Built for the community, contributions welcome

*"Why should minor, utility tools be ugly? Every developer deserves beautiful, intuitive interfaces for their daily work."* - Will Belden

---

**SQL Parrot** - Making database snapshot management beautiful! 🦜
