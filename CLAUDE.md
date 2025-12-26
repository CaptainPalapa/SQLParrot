# SQL Parrot - Project Configuration

## Project Overview
SQL Parrot is a web-based tool for managing SQL Server database snapshots. It provides a UI for creating, managing, and rolling back to database snapshots for testing workflows.

## Architecture
- **Frontend:** React 18 + Vite + Tailwind CSS (in `frontend/`)
- **Backend:** Express.js + mssql driver (in `backend/`)
- **Database:** SQL Server (connects to user's SQL Server instance)
- **Deployment:** Docker support via docker-compose

## Development Commands
```bash
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Frontend only (Vite on port 3000)
npm run dev:backend      # Backend only (Express on port 3001)
npm run install:all      # Install all dependencies
```

## Git Workflow
- Main branch: `main`
- This is a public open source repo (AGPL v3 + Commercial dual license)
- Commit directly to main for now (small project)

---

# NEXT DEVELOPMENT TASK: Add Tauri Desktop App

## Goal
Create a Tauri-based desktop executable ("lite" version) that runs alongside the existing Docker deployment option.

## Requirements
1. **Full feature parity** - All features from the web version must work in Tauri
2. **Cross-platform** - Windows, Mac, and Linux executables
3. **Direct SQL Server connection** - No Node.js backend; Rust backend talks directly to SQL Server
4. **Keep Docker** - Docker deployment remains the primary open source distribution method

## Technical Approach

### Dual Distribution Model
| Version | Backend | Use Case |
|---------|---------|----------|
| Docker | Node.js/Express | Server deployment, self-hosted, open source |
| Tauri | Rust (tiberius) | Desktop app, "double-click and run" |

### Implementation Plan

#### Phase 1: Tauri Project Setup
- [ ] Initialize Tauri v2 in the project (alongside existing structure)
- [ ] Configure for cross-platform builds (Windows, Mac, Linux)
- [ ] Set up shared frontend (React app works for both Docker and Tauri)
- [ ] Configure Tauri to use existing `frontend/` as the web layer

#### Phase 2: Rust Backend for SQL Server
- [ ] Add `tiberius` crate for SQL Server connectivity
- [ ] Port connection logic from `backend/server.js` to Rust
- [ ] Implement Tauri commands for:
  - Database connection management
  - Snapshot creation (`CREATE DATABASE ... AS SNAPSHOT OF`)
  - Snapshot listing (query `sys.databases`)
  - Snapshot rollback (`RESTORE DATABASE ... FROM DATABASE_SNAPSHOT`)
  - Snapshot deletion (`DROP DATABASE`)
  - Group management
  - History tracking

#### Phase 3: Metadata Storage for Tauri
- [ ] Decide on local storage approach for Tauri version:
  - Option A: SQLite local database (via `rusqlite`) - matches Docker version's approach
  - Option B: JSON file storage (simpler)
- [ ] Port metadata storage logic to Rust (Docker version now uses local SQLite)

#### Phase 4: Frontend Adaptation
- [ ] Create abstraction layer for API calls that works with both:
  - HTTP fetch (Docker/Express version)
  - Tauri invoke (desktop version)
- [ ] Environment detection to choose correct API method
- [ ] Test all UI flows work with Tauri backend

#### Phase 5: Build & Distribution
- [ ] Configure GitHub Actions for cross-platform builds
- [ ] Create release workflow for Windows (.exe/.msi), Mac (.dmg), Linux (.AppImage/.deb)
- [ ] Update README with both installation options

### File Structure (Proposed)
```
SQLParrot/
├── frontend/          # Shared React frontend (existing)
├── backend/           # Node.js backend for Docker (existing)
├── src-tauri/         # Tauri Rust backend (NEW)
│   ├── src/
│   │   ├── main.rs
│   │   ├── db/        # SQL Server connection logic
│   │   ├── commands/  # Tauri command handlers
│   │   └── storage/   # Local metadata storage
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docker-compose.yml # Docker deployment (existing)
└── package.json       # Orchestrates both dev workflows
```

### Key Rust Crates Needed
- `tauri` - Desktop app framework
- `tiberius` - SQL Server driver (TDS protocol)
- `tokio` - Async runtime
- `serde` / `serde_json` - Serialization
- `rusqlite` or similar - Local metadata storage (if not using SQL Server)

### Notes
- The React frontend should be largely unchanged; just need an API abstraction layer
- Tauri uses system webview (Edge on Windows, WebKit on Mac/Linux) - small binary size
- User will need to configure SQL Server connection on first run (connection dialog)
- Consider storing connection configs securely (Tauri has secure storage plugins)

## Reference
- Tauri v2 docs: https://v2.tauri.app/
- Tiberius (Rust SQL Server): https://docs.rs/tiberius/
- Similar implementation in claupact project: `D:\Development\projects\claupact\app\`
