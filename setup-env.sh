#!/bin/bash

# SQL Parrot Environment Setup Script
# This script helps you set up the correct .env files for your chosen deployment method

echo "🦜 SQL Parrot Environment Setup"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "env.example" ]; then
    echo "❌ Error: env.example not found. Please run this script from the SQL Parrot project root."
    exit 1
fi

echo "Choose your deployment method:"
echo "1) Docker (Recommended - Only 1 .env file needed)"
echo "2) NPM Development (Only 1 .env file needed)"
echo "3) Exit"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🐳 Setting up for Docker deployment..."

        if [ -f ".env" ]; then
            echo "❌ FAIL FAIL FAIL: .env file already exists!"
            echo "This script will NOT overwrite your existing .env file."
            echo "If you want to create a new .env file, please delete the existing one first."
            echo ""
            echo "Exiting to protect your existing configuration."
            exit 1
        fi

        cp env.example .env
        echo "✅ Created .env file in project root"
        echo ""
        echo "📝 Next steps:"
        echo "1. Edit .env with your SQL Server details"
        echo "2. Run: docker-compose up"
        echo ""
        echo "🔧 Required variables in .env:"
        echo "   - SQL_SERVER (e.g., host.docker.internal)"
        echo "   - SQL_USERNAME"
        echo "   - SQL_PASSWORD"
        echo "   - SQL_TRUST_CERTIFICATE=true"
        ;;

    2)
        echo ""
        echo "💻 Setting up for NPM development..."

        if [ -f ".env" ]; then
            echo "❌ FAIL FAIL FAIL: .env file already exists!"
            echo "This script will NOT overwrite your existing .env file."
            echo "If you want to create a new .env file, please delete the existing one first."
            echo ""
            echo "Exiting to protect your existing configuration."
            exit 1
        fi

        cp env.example .env
        echo "✅ Created .env file in project root"
        echo ""
        echo "📝 Next steps:"
        echo "1. Edit .env with your SQL Server details"
        echo "2. Run: npm run install:all"
        echo "3. Run: ./start-dev.sh"
        echo ""
        echo "🔧 Required variables in .env:"
        echo "   - SQL_SERVER (e.g., localhost)"
        echo "   - SQL_USERNAME"
        echo "   - SQL_PASSWORD"
        echo "   - SQL_TRUST_CERTIFICATE=true"
        ;;

    3)
        echo "👋 Goodbye!"
        exit 0
        ;;

    *)
        echo "❌ Invalid choice. Please run the script again and choose 1, 2, or 3."
        exit 1
        ;;
esac

echo ""
echo "📖 For more detailed information, see ENVIRONMENT_SETUP.md"
echo "🌐 Visit http://localhost:3000 after starting the application"
