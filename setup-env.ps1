# SQL Parrot Environment Setup Script
# Run this script to create your secure .env file

Write-Host "Setting up SQL Parrot environment variables..." -ForegroundColor Green

# Create .env file
$envContent = @"
# SQL Parrot Environment Variables
# NEVER commit this file to git!

# SQL Server Connection (sensitive data)
SQL_SERVER=localhost
SQL_PORT=1433
SQL_USERNAME=
SQL_PASSWORD=
SQL_TRUST_CERTIFICATE=true

# Application Settings
NODE_ENV=development
PORT=3001
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8

Write-Host "✅ Created .env file" -ForegroundColor Green
Write-Host "📝 Please edit .env file and add your SQL Server credentials:" -ForegroundColor Yellow
Write-Host "   - SQL_USERNAME=your_username" -ForegroundColor Cyan
Write-Host "   - SQL_PASSWORD=your_password" -ForegroundColor Cyan
Write-Host "   - SQL_SERVER=your_server_address" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔒 Your credentials will be stored securely and NOT committed to git!" -ForegroundColor Green
