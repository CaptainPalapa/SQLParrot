# SQL Parrot - Project Configuration

## Project Overview
SQL Parrot is a database snapshot management tool for SQL Server. It provides a beautiful UI for creating, managing, and rolling back to database snapshots for testing workflows. Available as both a Docker/npm web deployment and a Tauri desktop application.

## Architecture

### Dual-Stack Deployment Model

| Version | Backend | Use Case |
|---------|---------|----------|
| **Docker/npm** | Node.js/Express + mssql | Server deployment, self-hosted, multi-user |
| **Tauri Desktop** | Rust + tiberius | Desktop app, "double-click and run", single user |

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

### Project Structure
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
│   │       ├── snapshots.rs
│   │       └── settings.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                  # Documentation
│   ├── SNAPSHOT_BEHAVIOR.md
│   ├── TAURI.md
│   └── RELEASE_STRATEGY.md
├── docker-compose.yml     # Docker deployment
└── package.json           # Root orchestration
```

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
- Commit directly to main for now (small project)

---

## Current Development Priorities

### Release Automation (In Progress)
See `docs/RELEASE_STRATEGY.md` for full details.

**Phase 1 - Manual Releases (Current)**
- Create releases manually on GitHub
- Build locally: `npm run tauri:build`
- Upload binaries to release
- Tag with version: `git tag v1.x.x && git push --tags`

**Phase 2 - Semi-Automated (Next)**
- [ ] Add GitHub Action for Tauri builds on tag push
- [ ] Add GitHub Action for Docker push to ghcr.io
- [ ] Create CHANGELOG.md
- [ ] Address Dependabot vulnerabilities

**Phase 3 - Fully Automated (Future)**
- [ ] Adopt Conventional Commits
- [ ] Add Release Please for auto-versioning
- [ ] Combined release workflow

### Platform Support
- **Windows**: Desktop builds working (.exe/.msi)
- **macOS**: Planned - requires signing setup
- **Linux**: Planned - needs testing

### Other Considerations
- Keychain integration for secure credential storage (Tauri)
- Optional password protection for web UI

---

## Reference

### Key Rust Crates (Tauri)
- `tauri` v2 - Desktop app framework
- `tiberius` - SQL Server driver (TDS protocol)
- `rusqlite` - SQLite for metadata storage
- `tokio` - Async runtime
- `serde` / `serde_json` - Serialization
- `chrono` - Date/time handling

### Documentation
- Tauri v2 docs: https://v2.tauri.app/
- Tiberius (Rust SQL Server): https://docs.rs/tiberius/
- Desktop app docs: `docs/TAURI.md`
- Snapshot behavior: `docs/SNAPSHOT_BEHAVIOR.md`

---

## Future Enhancement Ideas

Ideas for future development (not currently in scope):

- [ ] **Proxy Profiles** - Allow profiles to connect through SSH tunnels or proxy servers for accessing remote/secured database servers
