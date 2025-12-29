import React, { useState } from 'react';
import { Database, Settings, History, Palette, Info, LogOut } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { PasswordProvider, usePassword } from './contexts/PasswordContext';
import ThemeSelector from './components/ThemeSelector';
import GroupsManager from './components/GroupsManager';
import SettingsPanel from './components/SettingsPanel';
import HistoryView from './components/HistoryView';
import AboutPanel from './components/AboutPanel';
import PasswordGate from './components/PasswordGate';
import PasswordSetup from './components/PasswordSetup';

function AppContent() {
  const [activeTab, setActiveTab] = useState('groups');
  const [isThemeSelectorOpen, setIsThemeSelectorOpen] = useState(false);
  const { passwordStatus, isAuthenticated, isLoading, logout } = usePassword();
  const [setupComplete, setSetupComplete] = useState(false);

  const tabs = [
    { id: 'groups', name: 'Groups', icon: Database },
    { id: 'settings', name: 'Settings', icon: Settings },
    { id: 'history', name: 'History', icon: History },
    { id: 'about', name: 'About', icon: Info },
  ];

  // Show loading while checking password status
  if (isLoading) {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-secondary-600 dark:text-secondary-400">Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Show password setup on first launch
  if (passwordStatus?.status === 'not-set' && !setupComplete) {
    return (
      <ThemeProvider>
        <PasswordSetup onComplete={() => setSetupComplete(true)} />
      </ThemeProvider>
    );
  }

  // Show password gate if password is set and user not authenticated
  if (passwordStatus?.status === 'set' && !isAuthenticated) {
    return (
      <ThemeProvider>
        <PasswordGate />
      </ThemeProvider>
    );
  }

  // Show main app
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
          {/* Header */}
          <header className="bg-white dark:bg-secondary-800 shadow-sm border-b border-secondary-200 dark:border-secondary-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center space-x-3">
                  <img
                    src="/sql-parrot-icon.png"
                    alt="SQL Parrot"
                    className="w-8 h-8 object-contain"
                  />
                  <h1 className="text-xl font-bold text-secondary-900 dark:text-white">
                    SQL Parrot
                  </h1>
                  <span className="text-sm text-secondary-500 dark:text-secondary-400">
                    Database Server Snapshot Management
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {passwordStatus?.status === 'set' && isAuthenticated && (
                    <button
                      onClick={logout}
                      className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                      title="Logout"
                    >
                      <LogOut className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsThemeSelectorOpen(true)}
                    className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                    title="Change Theme"
                  >
                    <Palette className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                  </button>
                </div>
              </div>
            </div>
          </header>

        {/* Navigation */}
        <nav className="bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300 dark:text-secondary-400 dark:hover:text-secondary-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'groups' && <GroupsManager onNavigateSettings={() => setActiveTab('settings')} />}
          {activeTab === 'settings' && <SettingsPanel onNavigateGroups={() => setActiveTab('groups')} />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'about' && <AboutPanel />}
        </main>

          {/* Theme Selector Modal */}
          <ThemeSelector
            isOpen={isThemeSelectorOpen}
            onClose={() => setIsThemeSelectorOpen(false)}
          />
        </div>
      </ThemeProvider>
    );
}

function App() {
  return (
    <PasswordProvider>
      <AppContent />
    </PasswordProvider>
  );
}

export default App;
