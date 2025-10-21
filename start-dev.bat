@echo off
echo Starting SQL Parrot Development Environment...
echo.
echo Backend will run on: http://localhost:3001
echo Frontend will run on: http://localhost:3000
echo.
echo Starting backend...
start "SQL Parrot Backend" cmd /k "cd backend && npm start"
timeout /t 3 /nobreak >nul
echo Starting frontend...
start "SQL Parrot Frontend" cmd /k "cd frontend && npm run dev"
echo.
echo Both services are starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
pause
