# Environment Configuration Guide

SQL Parrot handles environment variables differently depending on how you run it. **Important**: SQL Parrot now requires SQL Server connectivity and creates a dedicated metadata database.

## 🐳 Docker Mode (Recommended)
**You only need ONE `.env` file** in the project root.

```bash
# Copy the example file
cp env.example .env

# Edit with your settings
# SQL_SERVER=host.docker.internal
# SQL_USERNAME=your_username
# SQL_PASSWORD=your_password
# SQLPARROT_USER_NAME=your_name_here
# etc...

# Run with Docker
docker-compose up
```

Docker Compose automatically reads your `.env` file and injects the variables into the container. The backend detects it's running in a container and skips loading `.env` files.

## 💻 NPM Development Mode
**You only need ONE `.env` file** in the project root!

### Root `.env` file (used by everything)
```bash
# Project root .env
cp env.example .env
# Edit with your settings
```

### How It Works
- **Root `.env`**: Used by both `concurrently` and the backend process
- **Backend**: Automatically loads the root `.env` file (no need for `backend/.env`)
- **Frontend**: Doesn't need environment variables (it's a React app that talks to backend via API)
- **SQL Server**: Required for metadata storage - creates dedicated `sqlparrot` database

The backend automatically detects if it's running in a container and skips `.env` loading when using Docker.

## 🔧 Environment Variable Priority

1. **Environment variables** (highest priority)
2. **Docker Compose variables** (from host `.env`)
3. **Backend `.env` file** (NPM mode only)
4. **Default values** (lowest priority)

## 🚀 Quick Start

### Docker (Easiest)
```bash
cp env.example .env
# Edit .env with your SQL Server details
docker-compose up
```

### NPM Development
```bash
cp env.example .env
# Edit .env with your SQL Server details
npm run dev
```

## 🔍 Troubleshooting

### "No SQL Server configuration found"
- Check that your `.env` file(s) have the correct SQL Server credentials
- Verify `SQL_SERVER`, `SQL_USERNAME`, `SQL_PASSWORD`, and `SQLPARROT_USER_NAME` are set
- Ensure SQL Server is running and accessible

### "Environment variables not loading"
- **Docker**: Ensure `.env` is in the project root
- **NPM**: Ensure `.env` is in the project root (backend automatically loads it)

### Check Environment Detection
Visit `/api/environment` in your browser to see how SQL Parrot detects your environment.

### SQL Server Metadata Database
SQL Parrot creates a dedicated `sqlparrot` database for metadata storage. If you encounter issues:
- Ensure your SQL Server user has `CREATE DATABASE` permission
- Check that the `sqlparrot` database can be created successfully
- Verify the application can connect to SQL Server on startup
