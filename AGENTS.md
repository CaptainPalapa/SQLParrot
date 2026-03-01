# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SQL Parrot is a database snapshot management tool for SQL Server. It has a React/Vite frontend and a Node.js/Express backend, both running in dev mode via `npm run dev` (uses `concurrently`).

### Running the application

- **Dev servers**: `npm run dev` starts both frontend (port 3000) and backend (port 3001) via concurrently.
- **Port conflict gotcha**: The `env.example` sets `PORT=3000` which overrides the backend's dev-mode default of 3001, causing a conflict with the Vite frontend. After copying `env.example` to `.env`, either comment out or remove the `PORT=3000` line, or change `NODE_ENV` to `development` (the backend uses port 3001 when `npm_lifecycle_event === 'dev'` and `PORT` is unset).
- The backend starts fine without a SQL Server connection — it shows "degraded" health but serves all API routes. No external SQL Server is needed to develop and test the frontend/backend code.

### Testing

- **Backend tests** (Jest, mocked SQL Server): `npx jest --forceExit` from root. All tests use mocked `mssql` — no live SQL Server required.
- **Frontend tests** (Vitest): `cd frontend && npx vitest run`
- **Lint**: `cd frontend && npx eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0` — note: there are pre-existing lint errors (React-in-JSX-scope in test files) that are not blockers.

### Project structure

See `README.md` for full project structure. Key directories: `frontend/` (React+Vite), `backend/` (Express+SQLite), `src-tauri/` (optional Rust desktop app).
