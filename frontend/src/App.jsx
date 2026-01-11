import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Database, Settings, History, Palette, Info, LogOut, Server } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { PasswordProvider, usePassword } from './contexts/PasswordContext';
import ThemeSelector from './components/ThemeSelector';
import ProfileSelector from './components/ProfileSelector';
import GroupsManager from './components/GroupsManager';
import ProfilesPanel from './components/ProfilesPanel';
import SettingsPanel from './components/SettingsPanel';
import HistoryView from './components/HistoryView';
import AboutPanel from './components/AboutPanel';
import PasswordGate from './components/PasswordGate';
import PasswordSetup from './components/PasswordSetup';
import logoIcon from './assets/sql-parrot-icon.png';

function AppContent() {
  const [activeTab, setActiveTab] = useState('groups');
  const [isThemeSelectorOpen, setIsThemeSelectorOpen] = useState(false);
  const { passwordStatus, isAuthenticated, isLoading, logout, refreshStatus } = usePassword();
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const profileSelectorRef = useRef(null);

  // Refresh password status on mount to get current state from backend
  // This ensures we have the latest state, especially when switching between backend instances
  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Called when active profile changes - forces re-render and switches to Groups tab
  const handleProfileChange = useCallback(() => {
    setProfileRefreshKey(prev => prev + 1);
    setActiveTab('groups'); // Switch to Groups tab when profile changes
  }, []);

  // Called when groups are added/removed - refreshes the header profile selector counts
  const handleGroupsChanged = useCallback(() => {
    profileSelectorRef.current?.refresh();
  }, []);

  // Called when profiles are added/updated/deleted - refreshes the header profile selector
  const handleProfilesChanged = useCallback(() => {
    profileSelectorRef.current?.refresh();
  }, []);

  const tabs = [
    { id: 'groups', name: 'Groups', icon: Database },
    { id: 'profiles', name: 'Profiles', icon: Server },
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

  // Show password setup only if status is 'not-set' (not 'skipped' or 'set')
  // Rely on backend status, not local state, to avoid showing setup screen incorrectly
  if (passwordStatus?.status === 'not-set') {
    return (
      <ThemeProvider>
        <PasswordSetup onComplete={() => refreshStatus()} />
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
                    src={logoIcon}
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
                  <ProfileSelector ref={profileSelectorRef} onProfileChange={handleProfileChange} />
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
          {activeTab === 'groups' && <GroupsManager key={`groups-${profileRefreshKey}`} onNavigateSettings={() => setActiveTab('profiles')} onGroupsChanged={handleGroupsChanged} />}
          {activeTab === 'profiles' && <ProfilesPanel key={`profiles-${profileRefreshKey}`} onProfileChange={handleProfileChange} onProfilesChanged={handleProfilesChanged} />}
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
