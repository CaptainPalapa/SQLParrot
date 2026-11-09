@AGENTS.md

# SQL Parrot - Project Overview

## Project Overview
SQL Parrot is a database snapshot management tool for SQL Server. It provides a beautiful UI for creating, managing, and rolling back to database snapshots for testing workflows. Available as both a Docker/npm web deployment and a Tauri desktop application.

## Architecture

### Dual-Stack Deployment Model
- **Docker/npm**: Node.js/Express + mssql - Server deployment, self-hosted, multi-user
- **Tauri Desktop**: Rust + tiberius - Desktop app, "double-click and run", single user

### Frontend (Shared)
- **React 18** + Vite + Tailwind CSS (in `frontend/`)
- Works with both backends via API abstraction layer

### Backend - Docker/npm
- **Express.js** + mssql driver (in `backend/`)
- Configuration via `.env` file
- SQLite for metadata storage (`backend/data/sqlparrot.db`)

### Backend - Tauri Desktop
- **Rust** + tiberius (TDS protocol) + rusqlite (in `src-tauri/`)
- Configuration via Settings UI (stored in app data directory)
- SQLite for metadata storage (in app data directory)

## Project Structure
```
SQLParrot/
├── frontend/              # Shared React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/         # Custom React hooks
│   │   └── utils/         # Utility functions (including API abstraction)
│   └── package.json
├── backend/               # Node.js backend (Docker/npm)
│   ├── server.js          # Express server
│   ├── utils/
│   │   └── metadataStorageSqlite.js
│   └── package.json
├── src-tauri/             # Rust backend (Desktop app)
│   ├── src/
│   │   ├── main.rs        # Entry point
│   │   ├── lib.rs         # App setup, command registration
│   │   ├── config.rs      # Connection profile management
│   │   ├── models.rs      # Shared data types
│   │   ├── db/            # Database modules
│   │   │   ├── sqlserver.rs   # SQL Server via tiberius
│   │   │   └── metadata.rs    # SQLite metadata storage
│   │   └── commands/      # Tauri command handlers
│   │       ├── connection.rs
│   │       ├── groups.rs
│   │       ├── profiles.rs
│   │       ├── snapshots.rs
│   │       └── settings.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                  # Documentation
│   ├── SNAPSHOT_BEHAVIOR.md
│   ├── TAURI.md
│   ├── ENVIRONMENT_SETUP.md
│   └── private/           # Internal docs (gitignored)
├── scripts/               # Development scripts
├── tests/                 # Jest tests
│   └── __mocks__/         # Jest mocks
├── docker-compose.yml     # Docker deployment
└── package.json           # Root orchestration
```

## Important Notes
- The frontend is shared between both deployment methods (Docker/npm and Tauri)
- Metadata is stored in SQLite, not in SQL Server
- Configuration differs: `.env` file for Docker/npm, Settings UI for Tauri
- Both backends implement the same API surface for the frontend

# SQL Parrot - Technology Stack

## Rust Crates (Tauri)
- `tauri` v2 - Desktop app framework
- `tiberius` - SQL Server driver (TDS protocol)
- `rusqlite` - SQLite for metadata storage
- `tokio` - Async runtime
- `serde` / `serde_json` - Serialization
- `chrono` - Date/time handling

## Node.js Stack
- `express` - Web framework
- `mssql` - SQL Server driver
- `sqlite3` - SQLite for metadata

## Frontend Stack
- `react` 18 - UI framework
- `vite` - Build tool
- `tailwindcss` - Styling
- `vitest` - Testing

# SQL Parrot - Development Guide

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Web development (Docker/npm stack)
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Frontend only (Vite on port 3000)
npm run dev:backend      # Backend only (Express on port 3001)

# Desktop development (Tauri stack)
npm run tauri:dev        # Run desktop app in dev mode
npm run tauri:build      # Build production desktop app
```

## Git Workflow
- Main branch: `main`
- Public open source repo (AGPL v3 + Commercial dual license)

## Documentation References
- Tauri v2 docs: https://v2.tauri.app/
- Tiberius (Rust SQL Server): https://docs.rs/tiberius/
- Desktop app docs: `docs/TAURI.md`
- Snapshot behavior: `docs/SNAPSHOT_BEHAVIOR.md`
- Environment setup: `docs/ENVIRONMENT_SETUP.md`

# SQL Parrot - Testing Guidelines

## Integration Tests - SQL Server Requirements

### Important: Snapshot Rollback Integration Tests

Integration tests for snapshot creation and rollback functionality have been intentionally removed from the test suite. **DO NOT ADD INTEGRATION TESTS THAT REQUIRE REAL SQL SERVER OPERATIONS** in the standard test files.

### Why These Tests Were Removed

1. They require a **REAL SQL Server instance** with snapshot capabilities
2. They cannot be meaningfully mocked - snapshot/rollback operations are complex SQL Server features that involve:
   - File system operations
   - Database state changes
   - Transaction coordination
   - Operations that mocks cannot replicate
3. The `mssql` mock in `tests/__mocks__/mssql.js` only handles basic queries
4. Running these tests requires proper SQL Server configuration including:
   - A running SQL Server instance
   - Permissions to create/drop databases
   - Permissions to create/restore snapshots
   - A configured snapshot path with proper file system access

### Removed Test Cases

The following integration tests were removed from `tests/snapshot-rollback-api.spec.js`:
- Test 1: Base setup + Delete all snapshots (verify current state)
- Test 2: Base setup + Rollback to Snapshot B
- Test 3: Base setup + Rollback to Snapshot C
- Test 4: Edge Case - Rollback to earliest snapshot when multiple exist
- Test 5: Edge Case - Verify snapshot cleanup after rollback
- Test 6: API Workflow - Create multiple snapshots and verify API state

These tested actual SQL Server operations which cannot run in CI/CD or development environments without a properly configured SQL Server instance.

### Alternative Testing Approaches

If you need to test snapshot functionality:

1. **Test the API layer separately** using mocks (see `profile-management-api.spec.js`)
2. **Test SQL generation/parsing logic** in isolation
3. **Use a dedicated integration test environment** with real SQL Server
4. **Consider creating a separate test runner** for integration tests

### Running Integration Tests (Future Reference)

If you need to run actual integration tests in the future:

1. **Set up environment variables:**
   - `SQL_SERVER`: hostname of SQL Server
   - `SQL_PORT`: port (default 1433)
   - `SQL_USERNAME`: username with admin privileges
   - `SQL_PASSWORD`: password
   - `SQL_TRUST_CERTIFICATE`: true for self-signed certs
   - `SNAPSHOT_PATH`: path where SQL Server can create snapshot files

2. **Create a separate test script that:**
   - Uses `jest.unmock('mssql')` to use real connections
   - Creates test databases, tables, and data
   - Tests snapshot creation and rollback
   - Cleans up after itself

3. **Run integration tests separately from unit tests:**
   - `npm run test:integration` (if configured)
