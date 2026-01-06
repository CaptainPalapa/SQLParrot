import React from 'react';
import { Heart, Code, Database, Palette, Shield, Zap, Github, ExternalLink } from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import splashImage from '../assets/sql-parrot-splash.png';

const AboutPanel = () => {
  const features = [
    {
      icon: Database,
      title: "Database Management",
      description: "Create, restore, and delete snapshots with real-time monitoring and group organization"
    },
    {
      icon: Shield,
      title: "Advanced Security",
      description: "Local SQLite metadata storage with user attribution, audit trails, and connection validation"
    },
    {
      icon: Zap,
      title: "Smart Automation",
      description: "Automatic checkpoint system and orphaned snapshot cleanup with health monitoring"
    },
    {
      icon: Palette,
      title: "Beautiful Themes",
      description: "7 stunning themes with live preview and persistent storage across sessions"
    }
  ];

  const techStack = [
    { name: "React 18", description: "Modern component-based UI" },
    { name: "Vite", description: "Lightning-fast development server" },
    { name: "Tailwind CSS", description: "Utility-first CSS framework" },
    { name: "Node.js", description: "JavaScript runtime" },
    { name: "Express", description: "Web application framework" },
    { name: "SQLite", description: "Local metadata storage" }
  ];

  const supportedDatabases = [
    { name: "SQL Server 2016+", description: "All editions including Express (requires SP1 for 2016)" }
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <img
            src={splashImage}
            alt="SQL Parrot"
            className="w-32 h-32 object-contain"
          />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-secondary-900 dark:text-white mb-2">
            SQL Parrot
          </h1>
          <p className="text-xl text-secondary-600 dark:text-secondary-400 mb-4">
            A beautiful, modern tool for managing SQL Server database snapshots
          </p>
          <div className="flex justify-center space-x-4 text-sm text-secondary-500 dark:text-secondary-400">
            <span className="flex items-center space-x-1">
              <Code className="w-4 h-4" />
              <span>Version {APP_VERSION}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Heart className="w-4 h-4 text-red-500" />
              <span>Made with AI assistance</span>
            </span>
          </div>
        </div>
      </div>

      {/* Mission Statement */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900 dark:to-secondary-900 rounded-lg p-6 border border-primary-200 dark:border-primary-700">
        <blockquote className="text-lg italic text-secondary-700 dark:text-secondary-300 text-center">
          "Why should minor, utility tools be ugly? Every developer deserves beautiful, intuitive interfaces for their daily work."
        </blockquote>
        <p className="text-center text-sm text-secondary-600 dark:text-secondary-400 mt-2">
          — Will Belden, Creator
        </p>
      </div>

      {/* Key Features */}
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-6">
          ✨ Key Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="card p-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tech Stack */}
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-6">
          🏗️ Technology Stack
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {techStack.map((tech, index) => (
            <div key={index} className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-1">
                {tech.name}
              </h3>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">
                {tech.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Supported Databases */}
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-6">
          🗄️ Supported Databases
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supportedDatabases.map((db, index) => (
            <div key={index} className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-1">
                {db.name}
              </h3>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">
                {db.description}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-4 italic">
          More database support coming soon!
        </p>
      </div>

      {/* Architecture Highlights */}
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-6">
          🏛️ Architecture Highlights
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-3">
              Frontend (Shared)
            </h3>
            <ul className="space-y-2 text-secondary-600 dark:text-secondary-400">
              <li>• React 18 with modern hooks</li>
              <li>• Vite for lightning-fast builds</li>
              <li>• Tailwind CSS for styling</li>
              <li>• Lucide React for icons</li>
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-3">
              Docker / npm Backend
            </h3>
            <p className="text-xs text-secondary-500 dark:text-secondary-500 mb-2 italic">
              For server deployments
            </p>
            <ul className="space-y-2 text-secondary-600 dark:text-secondary-400">
              <li>• Node.js with Express</li>
              <li>• SQL Server driver (mssql)</li>
              <li>• SQLite metadata storage</li>
              <li>• CORS-enabled REST API</li>
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-3">
              Desktop App Backend
            </h3>
            <p className="text-xs text-secondary-500 dark:text-secondary-500 mb-2 italic">
              For .exe / standalone installs
            </p>
            <ul className="space-y-2 text-secondary-600 dark:text-secondary-400">
              <li>• Tauri v2 (Rust)</li>
              <li>• Tiberius SQL Server driver</li>
              <li>• rusqlite metadata storage</li>
              <li>• Native IPC commands</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Key Capabilities */}
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-6">
          🚀 Key Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
                Smart Snapshot Management
              </h3>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li>• Automatic checkpoint system</li>
                <li>• Orphaned snapshot cleanup</li>
                <li>• Multi-file snapshot support</li>
                <li>• Local SQLite metadata storage</li>
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
                Security & Reliability
              </h3>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li>• Secure environment variables</li>
                <li>• Connection testing</li>
                <li>• User attribution & audit trails</li>
                <li>• Fail-fast validation</li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
                User Experience
              </h3>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li>• 7 beautiful themes</li>
                <li>• Live theme preview</li>
                <li>• Responsive design</li>
                <li>• Real-time monitoring</li>
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
                Flexible Deployment
              </h3>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li>• Desktop app (.exe, .dmg, .AppImage)</li>
                <li>• Docker container deployment</li>
                <li>• npm dev server mode</li>
                <li>• Local SQLite metadata</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* About the Creator */}
      <div className="bg-gradient-to-r from-secondary-50 to-primary-50 dark:from-secondary-800 dark:to-primary-900 rounded-lg p-6 border border-secondary-200 dark:border-secondary-700">
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-4">
          👨‍💻 About the Creator
        </h2>
        <div className="space-y-4">
          <p className="text-secondary-700 dark:text-secondary-300">
            <strong>SQL Parrot</strong> was conceived and designed by <strong>Will Belden</strong>, who believes that even minor tools should be both powerful and beautiful.
          </p>
          <div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600">
            <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
              AI-Assisted Development
            </h3>
            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              This project showcases <strong>AI-assisted development</strong>. Will's expertise lies in application design, architecture, and defining what tools should accomplish. The implementation leverages AI collaboration to bring those designs to life using modern web technologies.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-secondary-900 dark:text-white mb-2">
                The Project Represents:
              </h4>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li>• Application Design Expertise</li>
                <li>• Architectural Vision</li>
                <li>• AI Collaboration</li>
                <li>• Open Source Philosophy</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* License & Open Source */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900 dark:to-secondary-900 rounded-lg p-6 border border-primary-200 dark:border-primary-700">
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-4">
          📄 License
        </h2>
        <div className="space-y-4">
          <p className="text-secondary-700 dark:text-secondary-300">
            SQL Parrot is <strong>dual-licensed</strong> to support both open source and commercial use.
          </p>
          <div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600">
            <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
              AGPL v3 (Open Source)
            </h3>
            <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
              <li>• Free for personal, educational, and open source use</li>
              <li>• If you modify and host it as a service, you must share your code</li>
              <li>• Derivative works must also be AGPL licensed</li>
            </ul>
          </div>
          <div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600">
            <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
              Commercial License
            </h3>
            <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
              <li>• For organizations that cannot comply with AGPL requirements</li>
              <li>• Use in proprietary software without sharing modifications</li>
              <li>• Contact the Author for commercial licensing inquiries</li>
            </ul>
          </div>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            See the <a href="https://github.com/CaptainPalapa/SQLParrot/blob/main/LICENSE" className="text-primary-600 dark:text-primary-400 hover:underline">LICENSE</a> file for full details.
          </p>
        </div>
      </div>

      {/* Links */}
      <div className="text-center space-y-4">
        <div className="flex justify-center space-x-4">
          <a
            href="https://github.com/CaptainPalapa/SQLParrot"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center space-x-2"
          >
            <Github className="w-4 h-4" />
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="text-sm text-secondary-500 dark:text-secondary-400">
          SQL Parrot - Making database snapshot management beautiful!
        </p>
      </div>
    </div>
  );
};

export default AboutPanel;
