# SQL Parrot - Starting Project Prompt

## Project Setup Instructions

### 1. Create Project Folder
```bash
mkdir sql-parrot
cd sql-parrot
```

### 2. Initialize Project Structure
```bash
mkdir frontend backend data
```

### 3. Create Root Package.json
Create `package.json` in the root folder:
```json
{
  "name": "sql-parrot",
  "version": "1.0.0",
  "description": "SQL Server Snapshot Management Tool",
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "cd backend && npm run dev",
    "install:all": "npm install && cd frontend && npm install && cd ../backend && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### 4. Create Data Directory Structure
```bash
mkdir data
```

Create these empty files in the `data` folder:
- `groups.json`
- `settings.json`
- `history.json`

### 5. Create Initial Data Files

**data/groups.json:**
```json
{
  "groups": []
}
```

**data/settings.json:**
```json
{
  "connection": {
    "server": "localhost",
    "port": 1433,
    "username": "",
    "password": "",
    "trustServerCertificate": true
  },
  "preferences": {
    "defaultGroup": "",
    "autoRefresh": true,
    "refreshInterval": 5000
  }
}
```

**data/history.json:**
```json
{
  "operations": []
}
```

### 6. Create README.md
```markdown
# SQL Parrot

A beautiful, modern tool for managing SQL Server database snapshots.

## Features
- Create and manage database groups
- Create, restore, and delete snapshots
- Beautiful, responsive UI
- Local data storage (no SQL Server pollution)

## Development
```bash
npm run install:all
npm run dev
```

## Usage
1. Configure your SQL Server connection in settings
2. Create database groups
3. Manage snapshots for your groups
```

## What to Tell Me Next

After you've created this structure, just say:

**"I've set up the SQL Parrot project structure. Ready to start building!"**

And I'll take over from there, building out the frontend and backend with all the snapshot management functionality you need! 🚀

## Architecture Overview

**Frontend: React + Vite + Tailwind CSS**
- React: Component-based, highly flexible UI
- Vite: Lightning-fast development server
- Tailwind CSS: Beautiful, responsive design with minimal effort
- Modern UI libraries: Shadcn/ui or Headless UI for polished components

**Backend: Node.js + Express + SQL Server Driver**
- Node.js: Fast, lightweight server
- Express: Simple REST API
- mssql: Official SQL Server driver for Node.js
- CORS: Enable local development

**Data Storage: Local JSON files**
- `groups.json` - Your database groups and configurations
- `settings.json` - Connection settings, preferences
- `history.json` - Snapshot operation history/logs

## Key Features

- **Group Management**: Create/edit groups, assign databases
- **Snapshot Operations**: Create, list, restore, delete snapshots
- **Real-time Updates**: See snapshot sizes, creation dates
- **Beautiful UI**: Modern, responsive design
- **Local Storage**: Save your groups and preferences
- **Unique Database Ownership**: Each database can only belong to one group

## Example JSON Structure
```json
// data/groups.json
{
  "groups": [
    {
      "id": "sf-group",
      "name": "SF Warehouse",
      "databases": [
        "vsrwest_dev_usr_sf",
        "vsrwest_dev_DW_Dreamwear",
        "vsrwest_dev_DW_Eastman",
        "vsrwest_dev_DW_EastmanCW"
      ]
    },
    {
      "id": "sf-dw",
      "name": "SF - Data Warehouses Only",
      "databases": [
        "vsrwest_dev_DW_Dreamwear",
        "vsrwest_dev_DW_Eastman",
        "vsrwest_dev_DW_EastmanCW"
      ]
    }
  ]
}
```

## SQL Server Snapshot Commands Reference

### Create Snapshot
```sql
CREATE DATABASE SnapshotName
ON (NAME = 'LogicalName', FILENAME = 'C:\Path\SnapshotName.ss')
AS SNAPSHOT OF SourceDatabaseName;
```

### List Snapshots
```sql
SELECT
    name,
    source_database_id,
    create_date,
    database_snapshot_lsn
FROM sys.databases
WHERE source_database_id IS NOT NULL;
```

### Restore from Snapshot
```sql
RESTORE DATABASE SourceDatabaseName
FROM DATABASE_SNAPSHOT = 'SnapshotName';
```

### Drop Snapshot
```sql
DROP DATABASE SnapshotName;
```

### Check Snapshot File Sizes
```sql
SELECT
    d.name,
    mf.physical_name,
    mf.size * 8 / 1024 AS size_mb
FROM sys.databases d
JOIN sys.master_files mf ON d.database_id = mf.database_id
WHERE d.source_database_id IS NOT NULL;
```
