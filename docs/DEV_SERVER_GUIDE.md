# Development Server Guide

## Ports

- **Frontend (Vite Dev Server)**: `http://localhost:3000` ← **USE THIS FOR DEVELOPMENT**
- **Backend API**: `http://localhost:3001` (API only, no UI in dev mode)
- **Backend with Built Frontend**: `http://localhost:3001` (production mode - serves built frontend)

## Development Mode

When developing, you should use **`localhost:3000`** which runs the Vite dev server with:
- Hot module replacement (instant updates)
- Fast refresh
- Development tools
- API proxying to backend on 3001

## Starting Development Servers

### Option 1: Start Both Together (Recommended)
```bash
npm run dev
```
This starts both frontend (3000) and backend (3001) simultaneously.

### Option 2: Start Separately

**Terminal 1 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

## Windows Scripts

You can also use:
- `scripts\start-dev.cmd` - Starts both servers
- `scripts\stop-dev.cmd` - Stops both servers

## Troubleshooting

**If port 3000 isn't working:**
1. Check if Vite dev server is running: `netstat -an | findstr ":3000.*LISTENING"`
2. If not running, start it: `cd frontend && npm run dev`
3. Wait a few seconds for it to start
4. Open `http://localhost:3000` in your browser

**If you see UI on port 3001:**
- That's the backend serving the built frontend (production mode)
- For development, use port 3000 instead
- The backend on 3001 is just the API in dev mode

## Quick Check

```bash
# Check if frontend is running
netstat -an | findstr ":3000.*LISTENING"

# Check if backend is running
netstat -an | findstr ":3001.*LISTENING"
```

Both should show LISTENING when everything is running correctly.
