import React, { useState, useEffect } from 'react';
import { Save, TestTube, CheckCircle, XCircle } from 'lucide-react';

const SettingsPanel = () => {
  const [settings, setSettings] = useState({
    connection: {
      server: 'localhost',
      port: 1433,
      username: '',
      password: '',
      trustServerCertificate: true
    },
    preferences: {
      defaultGroup: '',
      autoRefresh: true,
      refreshInterval: 5000
    }
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      if (response.ok) {
        alert('Settings saved successfully!\n\nNote: Username and password are stored securely in environment variables, not in the settings file.');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings.connection)
      });

      const result = await response.json();
      setConnectionStatus(result.success ? 'success' : 'error');
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const updateConnection = (field, value) => {
    setSettings(prev => ({
      ...prev,
      connection: {
        ...prev.connection,
        [field]: value
      }
    }));
  };

  const updatePreferences = (field, value) => {
    setSettings(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [field]: value
      }
    }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
          Settings
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400">
          Configure your SQL Server connection and preferences
        </p>
      </div>

      {/* Connection Settings */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          SQL Server Connection
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Server
            </label>
            <input
              type="text"
              value={settings.connection.server}
              onChange={(e) => updateConnection('server', e.target.value)}
              className="input"
              placeholder="localhost"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Port
            </label>
            <input
              type="number"
              value={settings.connection.port}
              onChange={(e) => updateConnection('port', parseInt(e.target.value))}
              className="input"
              placeholder="1433"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={settings.connection.username}
              onChange={(e) => updateConnection('username', e.target.value)}
              className="input"
              placeholder="sa"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={settings.connection.password}
              onChange={(e) => updateConnection('password', e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.connection.trustServerCertificate}
              onChange={(e) => updateConnection('trustServerCertificate', e.target.checked)}
              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">
              Trust Server Certificate
            </span>
          </label>
        </div>

        <div className="mt-6 flex space-x-3">
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="btn-secondary flex items-center space-x-2"
          >
            <TestTube className="w-4 h-4" />
            <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
          </button>

          {connectionStatus && (
            <div className="flex items-center space-x-2">
              {connectionStatus === 'success' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-600">Connection successful</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm text-red-600">Connection failed</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Default Group
            </label>
            <input
              type="text"
              value={settings.preferences.defaultGroup}
              onChange={(e) => updatePreferences('defaultGroup', e.target.value)}
              className="input"
              placeholder="Leave empty for no default"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.preferences.autoRefresh}
              onChange={(e) => updatePreferences('autoRefresh', e.target.checked)}
              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">
              Auto-refresh snapshots
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Refresh Interval (milliseconds)
            </label>
            <input
              type="number"
              value={settings.preferences.refreshInterval}
              onChange={(e) => updatePreferences('refreshInterval', parseInt(e.target.value))}
              className="input"
              min="1000"
              step="1000"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          className="btn-primary flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>Save Settings</span>
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
