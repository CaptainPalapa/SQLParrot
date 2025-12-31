@echo off
setlocal enabledelayedexpansion

echo Stopping SQL Parrot Development Environment...
echo.

set found_processes=0
set killed_count=0

set backend_port=3001
set frontend_port=3000

echo [INFO] Using backend port: %backend_port%
echo [INFO] Using frontend port: %frontend_port%

echo.
echo [CHECK] Looking for SQL Parrot processes...

set killed_pids=

echo Checking port %backend_port% (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%backend_port%" ^| findstr "LISTENING"') do (
    set pid=%%a
    set pid=!pid: =!
    if not "!pid!"=="" (
        echo   Found process !pid! on port %backend_port%
        echo %killed_pids% | findstr /c:"!pid!" >nul
        if !errorlevel! neq 0 (
            taskkill /f /pid !pid! 2>nul
            if !errorlevel! equ 0 (
                echo   SUCCESS: The process with PID !pid! has been terminated.
                echo   [OK] Backend process !pid! terminated
                set /a killed_count+=1
                set found_processes=1
                set killed_pids=%killed_pids% !pid!
            ) else (
                echo   [WARN] Could not terminate process !pid!
            )
        )
    )
)

echo Checking port %frontend_port% (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%frontend_port%" ^| findstr "LISTENING"') do (
    set pid=%%a
    set pid=!pid: =!
    if not "!pid!"=="" (
        echo   Found process !pid! on port %frontend_port%
        echo %killed_pids% | findstr /c:"!pid!" >nul
        if !errorlevel! neq 0 (
            taskkill /f /pid !pid! 2>nul
            if !errorlevel! equ 0 (
                echo   SUCCESS: The process with PID !pid! has been terminated.
                echo   [OK] Frontend process !pid! terminated
                set /a killed_count+=1
                set found_processes=1
                set killed_pids=%killed_pids% !pid!
            ) else (
                echo   [WARN] Could not terminate process !pid!
            )
        )
    )
)

echo Checking for nodemon processes...
for /f "skip=1 tokens=2" %%a in ('tasklist /fi "imagename eq nodemon.exe" /fo csv 2^>nul') do (
    set pid=%%a
    set pid=!pid:"=!
    if not "!pid!"=="" (
        echo   Found nodemon process !pid!
        echo %killed_pids% | findstr /c:"!pid!" >nul
        if !errorlevel! neq 0 (
            taskkill /f /pid !pid! 2>nul
            if !errorlevel! equ 0 (
                echo   [OK] Nodemon process !pid! terminated
                set /a killed_count+=1
                set found_processes=1
                set killed_pids=%killed_pids% !pid!
            ) else (
                echo   [WARN] Could not terminate nodemon process !pid!
            )
        )
    )
)

echo.
if %found_processes% equ 1 (
    echo [OK] SQL Parrot stopped successfully (%killed_count% processes terminated)
) else (
    echo [INFO] No SQL Parrot processes found running
)

echo.
echo [INFO] This script targets:
echo       - Processes on configured ports (%backend_port% and %frontend_port%)
echo       - Nodemon processes
echo       - Other Node.js applications are left untouched.
echo.

