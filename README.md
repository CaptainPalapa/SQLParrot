# SQL Parrot 🦜

A beautiful, modern tool for managing SQL Server database snapshots with a stunning theme system.

![SQL Parrot](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-18+-61dafb.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.3+-38bdf8.svg)

## ✨ Features

### 🎨 **Beautiful Theme System**
- **7 Stunning Themes**: Ocean Blue, Forest Emerald, Royal Purple, Sunset Rose, Autumn Orange, Ocean Teal, and Midnight Dark
- **Live Preview**: Hover to preview themes instantly
- **Persistent Storage**: Your theme choice is remembered
- **Dark Mode Support**: All themes work in both light and dark modes

### 🗄️ **Database Management**
- **Group Organization**: Create and manage database groups
- **Snapshot Operations**: Create, restore, and delete snapshots
- **Real-time Monitoring**: See snapshot sizes, creation dates, and status
- **Unique Database Ownership**: Each database can only belong to one group

### 🔧 **Advanced Features**
- **Connection Testing**: Test SQL Server connections before operations
- **File Verification**: Verify snapshot files exist and show status
- **Orphaned Snapshot Cleanup**: Clean up orphaned snapshot databases and files
- **External File Management**: Integration with external APIs for file management
- **Health Monitoring**: Health check endpoint with orphaned snapshot detection
- **Automatic Checkpoint System**: Creates checkpoints after rollbacks with sequence management
- **Database Categorization**: Automatically categorizes databases (Global, User, Data Warehouse)
- **Multi-file Snapshot Support**: Handles databases with multiple data files
- **Local Storage**: No SQL Server pollution - all metadata stored locally
- **Responsive Design**: Beautiful UI that works on all devices

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- SQL Server instance
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/CaptainPalapa/SQLParrot.git
   cd SQLParrot
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up secure environment variables**
   ```bash
   # Windows PowerShell
   .\setup-env.ps1

   # Or manually create .env file
   cp backend/env.example backend/.env
   ```

   **Edit `backend/.env` file and add your SQL Server credentials:**
   ```env
   SQL_SERVER=your_server_address
   SQL_USERNAME=your_username
   SQL_PASSWORD=your_password
   SQL_TRUST_CERTIFICATE=true
   ```

4. **Start the application**
   ```bash
   # Option 1: Use the startup script (Windows)
   .\start-dev.bat

   # Option 2: Manual start
   npm run dev
   ```

5. **Open your browser**
   - **Frontend**: http://localhost:3000 (React/Vite)
   - **Backend API**: http://localhost:3001 (Node.js/Express)

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

### **Backend Stack**
- **Node.js** - JavaScript runtime
- **Express** - Web application framework
- **mssql** - SQL Server driver
- **CORS** - Cross-origin resource sharing

### **Data Storage**
- **Local JSON Files** - No database required
  - `data/groups.json` - Database groups
  - `data/settings.json` - User preferences (non-sensitive)
  - `data/history.json` - Operation history
  - `data/snapshots.json` - Snapshot metadata

## 📁 Project Structure

```
SQLParrot/
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── ui/         # Reusable UI components
│   │   │   ├── __tests__/  # Component tests
│   │   │   └── *.jsx       # Main components
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Utility functions
│   │   ├── constants/     # Theme definitions
│   │   ├── App.jsx        # Main app component
│   │   └── main.jsx       # Entry point
│   ├── dist/              # Built frontend
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── backend/                 # Node.js backend
│   ├── server.js          # Express server
│   ├── env.example        # Environment template
│   └── package.json
├── data/                   # Local data storage
│   ├── groups.json        # Database groups
│   ├── settings.json      # User preferences
│   ├── history.json       # Operation history
│   └── snapshots.json     # Snapshot metadata
├── react-analyzer-mcp/     # MCP server for React analysis
│   ├── src/
│   ├── build/
│   └── package.json
├── package.json            # Root package.json
├── setup-env.ps1          # PowerShell setup script
├── start-dev.bat          # Windows startup script
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
| GET | `/api/health` | Health check with orphaned snapshots |
| GET | `/api/n8n-health` | N8N API health check |
| POST | `/api/snapshots/:snapshotId/rollback` | Rollback to specific snapshot |
| POST | `/api/snapshots/:snapshotId/cleanup` | Cleanup invalid snapshot |
| DELETE | `/api/snapshots/:snapshotId` | Delete specific snapshot |

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
PORT=3001

# Snapshot Storage Path (Docker)
SNAPSHOT_PATH=/var/opt/mssql/snapshots
```

### Docker Volume Configuration

Create a volume for snapshot storage:

```yaml
# docker-compose.yml example
services:
  sql-parrot:
    image: your-sql-parrot-image
    volumes:
      - ./data-snapshots:/var/opt/mssql/snapshots
    environment:
      - SNAPSHOT_PATH=/var/opt/mssql/snapshots
      - SQL_SERVER=your_sql_server
      - SQL_USERNAME=your_username
      - SQL_PASSWORD=your_password
```

### Snapshot Path Options

- **Docker**: `/var/opt/mssql/snapshots` (recommended for SQL Server containers)
- **Windows**: `C:\Snapshots`
- **Linux**: `/var/snapshots` or `/opt/snapshots`

## 🛠️ Configuration

### SQL Server Requirements
- SQL Server 2016+ (for snapshot support)
- Appropriate permissions for snapshot operations
- Network access from the application server

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

# Application Settings
NODE_ENV=development
PORT=3001

# Snapshot Storage Path
SNAPSHOT_PATH=C:\Snapshots  # Windows
# SNAPSHOT_PATH=/var/opt/mssql/snapshots  # Docker/Linux

# External File Management API (Optional)
FILES_API_USERNAME=your_files_api_username
FILES_API_PASSWORD=your_files_api_password
FILES_API_LIST=https://your-api.com/webhook/snapshots/
FILES_API_DELETE=https://your-api.com/webhook/snapshots/delete/{{filename}}
```

**Security Features:**
- ✅ Credentials never stored in version control
- ✅ Settings API masks sensitive data
- ✅ Environment variables take precedence over settings file
- ✅ `.env` file is gitignored

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

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

#### **Snapshot Creation Failures**
- **"No data files found"**: Database must have at least one data file (not just log files)
- **"Access denied"**: Ensure SQL Server service account has write permissions to snapshot path
- **"Insufficient disk space"**: Check available space in snapshot directory

#### **Snapshot Rollback Issues**
- **"Multiple snapshots exist"**: Use cleanup endpoint to remove orphaned snapshots first
- **"Snapshot not found"**: Refresh snapshots or check if snapshot was manually deleted
- **"Database in use"**: Ensure no active connections to the database

#### **File Management Problems**
- **"File verification failed"**: Check N8N API configuration and network connectivity
- **"Orphaned snapshots detected"**: Use cleanup endpoint to remove orphaned snapshots
- **"Physical files missing"**: Verify snapshot files exist in the configured path

### Health Check Endpoints

Use these endpoints to diagnose issues:

- `GET /api/health` - Check SQL Server connection and orphaned snapshots
- `GET /api/n8n-health` - Verify external file management API connectivity
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
2. Backup your `data/` folder
3. Delete `data/snapshots.json` to reset snapshot metadata
4. Restart the application

#### **Manual Database Cleanup**
If automatic cleanup fails, manually drop orphaned snapshots:
```sql
-- List all snapshots
SELECT name, source_database_id FROM sys.databases WHERE source_database_id IS NOT NULL;

-- Drop specific snapshot
DROP DATABASE [snapshot_name];
```

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/CaptainPalapa/SQLParrot/issues) page
2. Create a new issue with detailed information
3. Include your SQL Server version and error messages
4. Run health check endpoints and include their output

---

**Made with ❤️ by CaptainPalapa**
