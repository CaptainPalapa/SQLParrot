@echo off
setlocal enabledelayedexpansion

REM SQL Parrot Environment Setup Script (Windows)
REM This script helps you set up the correct .env files for your chosen deployment method

echo SQL Parrot Environment Setup
echo ================================
echo.

REM Check if we're in the right directory
if not exist "env.example" (
    echo Error: env.example not found. Please run this script from the SQL Parrot project root.
    pause
    exit /b 1
)

echo Choose your deployment method:
echo 1) Docker (Recommended - Only 1 .env file needed)
echo 2) NPM Development (Only 1 .env file needed)
echo 3) Exit
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo Setting up for Docker deployment...

    if exist ".env" (
        echo FAIL FAIL FAIL: .env file already exists!
        echo This script will NOT overwrite your existing .env file.
        echo If you want to create a new .env file, please delete the existing one first.
        echo.
        echo Exiting to protect your existing configuration.
        pause
        exit /b 1
    )

    copy env.example .env >nul
    echo Created .env file in project root
    echo.
    echo Next steps:
    echo 1. Edit .env with your SQL Server details
    echo 2. Run: docker-compose up
    echo.
    echo Required variables in .env:
    echo    - SQL_SERVER (e.g., host.docker.internal)
    echo    - SQL_USERNAME
    echo    - SQL_PASSWORD
    echo    - SQL_TRUST_CERTIFICATE=true
    echo.
    echo Optional port configuration:
    echo    - SQL_PARROT_BACKEND_PORT=3000 (default)
    echo    - SQL_PARROT_FRONTEND_PORT=3001 (default)
    echo    Change these if ports 3000/3001 are in use
    goto :end
)

if "%choice%"=="2" (
    echo.
    echo Setting up for NPM development...

    if exist ".env" (
        echo FAIL FAIL FAIL: .env file already exists!
        echo This script will NOT overwrite your existing .env file.
        echo If you want to create a new .env file, please delete the existing one first.
        echo.
        echo Exiting to protect your existing configuration.
        pause
        exit /b 1
    )

    copy env.example .env >nul
    echo Created .env file in project root
    echo.
    echo Next steps:
    echo 1. Edit .env with your SQL Server details
    echo 2. Run: npm run install:all
    echo 3. Run: scripts\start-dev.cmd
    echo.
    echo Required variables in .env:
    echo    - SQL_SERVER (e.g., localhost)
    echo    - SQL_USERNAME
    echo    - SQL_PASSWORD
    echo    - SQL_TRUST_CERTIFICATE=true
    echo.
    echo Optional port configuration:
    echo    - SQL_PARROT_BACKEND_PORT=3000 (default)
    echo    - SQL_PARROT_FRONTEND_PORT=3001 (default)
    echo    Change these if ports 3000/3001 are in use
    goto :end
)

if "%choice%"=="3" (
    echo Goodbye!
    goto :end
)

echo Invalid choice. Please run the script again and choose 1, 2, or 3.
pause
exit /b 1

:end
echo.
echo For more detailed information, see docs\ENVIRONMENT_SETUP.md
echo Visit http://localhost:3000 after starting the application
pause
