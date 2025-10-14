# SQL Parrot 🦜

A beautiful, modern tool for managing SQL Server database snapshots with a stunning theme system.

![SQL Parrot](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-18+-61dafb.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.3+-38bdf8.svg)

## ✨ Features

### 🎨 **Beautiful Theme System**
- **7 Stunning Themes**: Ocean Blue, Forest Emerald, Royal Purple, Sunset Rose, Autumn Orange, Ocean Teal, and Midnight Dark
- **Live Preview**: Hover to preview themes instantly
- **Persistent Storage**: Your theme choice is remembered
- **Dark Mode Support**: All themes work in both light and dark modes

### 🗄️ **Database Management**
- **Group Organization**: Create and manage database groups
- **Snapshot Operations**: Create, restore, and delete snapshots
- **Real-time Monitoring**: See snapshot sizes, creation dates, and status
- **Overlapping Groups**: Support for databases across multiple groups

### 🔧 **Advanced Features**
- **Connection Testing**: Test SQL Server connections before operations
- **Operation History**: Track all snapshot and group management operations
- **Local Storage**: No SQL Server pollution - all metadata stored locally
- **Responsive Design**: Beautiful UI that works on all devices

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- SQL Server instance
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/CaptainPalapa/SQLParrot.git
   cd SQLParrot
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up secure environment variables**
   ```bash
   # Windows PowerShell
   .\setup-env.ps1
   
   # Or manually create .env file
   cp env.example .env
   ```
   
   **Edit `.env` file and add your SQL Server credentials:**
   ```env
   SQL_SERVER=your_server_address
   SQL_USERNAME=your_username
   SQL_PASSWORD=your_password
   SQL_TRUST_CERTIFICATE=true
   ```

4. **Start the application**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## 🎨 Theme Browser

Access the theme browser by clicking the palette icon (🎨) in the header:

- **Browse Themes**: See all 7 themes in a beautiful grid
- **Live Preview**: Hover over themes for instant preview
- **One-Click Apply**: Click any theme to apply and save
- **Persistent**: Your choice is automatically saved

### Available Themes
- 🌊 **Ocean Blue** - Professional and clean
- 🌲 **Forest Emerald** - Fresh and natural
- 👑 **Royal Purple** - Elegant and sophisticated
- 🌅 **Sunset Rose** - Warm and inviting
- 🍂 **Autumn Orange** - Vibrant and energetic
- 🌊 **Ocean Teal** - Calming and serene
- 🌙 **Midnight Dark** - Modern dark mode

## 📖 Usage Guide

### 1. **Configure Connection**
   - Go to Settings tab
   - Enter your SQL Server details
   - Test the connection
   - Save settings

### 2. **Create Database Groups**
   - Click "New Group" button
   - Enter group name
   - Add databases (comma-separated)
   - Save the group

### 3. **Manage Snapshots**
   - Select a group
   - Click "Create Snapshot"
   - Enter snapshot name
   - Monitor progress in real-time

### 4. **Track Operations**
   - View History tab
   - See all operations with timestamps
   - Monitor success/failure status

## 🏗️ Architecture

### **Frontend Stack**
- **React 18** - Modern component-based UI
- **Vite** - Lightning-fast development server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library

### **Backend Stack**
- **Node.js** - JavaScript runtime
- **Express** - Web application framework
- **mssql** - SQL Server driver
- **CORS** - Cross-origin resource sharing

### **Data Storage**
- **Local JSON Files** - No database required
  - `data/groups.json` - Database groups
  - `data/settings.json` - Connection settings
  - `data/history.json` - Operation history

## 📁 Project Structure

```
SQLParrot/
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/        # React contexts
│   │   ├── App.jsx         # Main app component
│   │   └── main.jsx        # Entry point
│   ├── package.json
│   └── vite.config.js
├── backend/                 # Node.js backend
│   ├── server.js           # Express server
│   └── package.json
├── data/                   # Local data storage
│   ├── groups.json
│   ├── settings.json
│   └── history.json
├── package.json            # Root package.json
└── README.md
```

## 🔧 Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend
npm run dev

# Start only frontend
npm run dev:frontend

# Start only backend
npm run dev:backend
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | Get all groups |
| POST | `/api/groups` | Create new group |
| PUT | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |
| GET | `/api/groups/:id/snapshots` | Get snapshots for group |
| POST | `/api/groups/:id/snapshots` | Create snapshots for group |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |
| POST | `/api/test-connection` | Test SQL Server connection |
| GET | `/api/history` | Get operation history |

## 🛠️ Configuration

### SQL Server Requirements
- SQL Server 2016+ (for snapshot support)
- Appropriate permissions for snapshot operations
- Network access from the application server

### 🔒 Security & Environment Variables

**SQL Parrot uses secure environment variables for sensitive data:**

- **Credentials are stored in `.env` file** (never committed to git)
- **Settings file only stores non-sensitive preferences**
- **Passwords are masked in the UI** (`***masked***`)

**Required Environment Variables:**
```env
# SQL Server Connection (sensitive - stored in .env)
SQL_SERVER=your_server_address
SQL_USERNAME=your_username
SQL_PASSWORD=your_password
SQL_TRUST_CERTIFICATE=true

# Application Settings
NODE_ENV=development
PORT=3001
```

**Security Features:**
- ✅ Credentials never stored in version control
- ✅ Settings API masks sensitive data
- ✅ Environment variables take precedence over settings file
- ✅ `.env` file is gitignored

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ using React, Node.js, and Tailwind CSS
- Icons by [Lucide](https://lucide.dev/)
- Inspired by the need for better SQL Server snapshot management

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/CaptainPalapa/SQLParrot/issues) page
2. Create a new issue with detailed information
3. Include your SQL Server version and error messages

---

**Made with ❤️ by CaptainPalapa**