@echo off

echo Starting SQL Parrot Development Environment...
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
echo Starting SQL Parrot with concurrently...
echo This will start both frontend and backend in a single terminal window.
echo.

npm run dev

echo.
echo SQL Parrot has stopped.
echo.
pause
