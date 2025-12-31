@echo off

echo Starting SQL Parrot Production Environment...
echo.

set backend_port=3001
set frontend_port=3000

echo [INFO] Using backend port: %backend_port%
echo [INFO] Using frontend port: %frontend_port%

echo.
echo Checking if .env file exists...
if not exist ".env" (
    echo Warning: .env file not found!
    echo Please copy env.example to .env and configure your settings.
    echo You can run scripts\setup-env.cmd to help with this.
    echo.
    pause
    exit /b 1
)

echo Checking if ports are already in use...
netstat -an | findstr ":%backend_port%.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo ERROR: Port %backend_port% is already in use!
    echo Please stop the conflicting application or run scripts\stop-dev.cmd
    pause
    exit /b 1
)

netstat -an | findstr ":%frontend_port%.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo ERROR: Port %frontend_port% is already in use!
    echo Please stop the conflicting application or run scripts\stop-dev.cmd
    pause
    exit /b 1
)

echo Installing dependencies if needed...
if not exist "node_modules" (
    echo Installing root dependencies...
    npm install
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)

if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    npm install
    cd ..
)

echo.
echo Ports %backend_port% and %frontend_port% are available
echo Starting SQL Parrot Production Mode...
echo.

echo Starting backend server (production mode)...
start "SQL Parrot Backend" cmd /k "cd backend && npm start"

echo Waiting for backend to start...
ping 127.0.0.1 -n 4 >nul

echo Starting frontend server...
start "SQL Parrot Frontend" cmd /k "cd frontend && npm run dev"

echo Waiting for frontend to start...
ping 127.0.0.1 -n 6 >nul

echo.
echo [OK] SQL Parrot Production Mode is running!
echo.
echo - Backend API: http://localhost:%backend_port%
echo - Frontend: http://localhost:%frontend_port%
echo.
echo [INFO] Backend is running in production mode (no auto-restart)
echo [INFO] Frontend is running in development mode (for serving)
echo.
echo       or run scripts\stop-dev.cmd to force stop all processes.
echo.
echo Press any key to close this window...
pause >nul
