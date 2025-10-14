import React, { useState, useEffect } from 'react';
import { Save, TestTube, CheckCircle, XCircle, Shield, Database } from 'lucide-react';

const SettingsPanel = () => {
  const [settings, setSettings] = useState({
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
        alert('Settings saved successfully!');
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
        body: JSON.stringify({})
      });
      
      const result = await response.json();
      if (result.success) {
        setConnectionStatus({
          type: 'success',
          message: result.message,
          databaseCount: result.databaseCount
        });
      } else {
        setConnectionStatus({
          type: 'error',
          message: result.error
        });
      }
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: 'Connection failed'
      });
    } finally {
      setIsTestingConnection(false);
    }
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

      {/* Connection Status */}
      <div className="card p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            SQL Server Connection
          </h3>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Database className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Secure Configuration
            </span>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300">
            Connection credentials are securely stored in environment variables (backend/.env file)
            and are never committed to version control.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="btn-primary flex items-center space-x-2"
          >
            <TestTube className="w-4 h-4" />
            <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
          </button>

          {connectionStatus && (
            <div className="flex items-center space-x-2">
              {connectionStatus.type === 'success' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div className="flex flex-col">
                    <span className="text-sm text-green-600 font-medium">
                      {connectionStatus.message}
                    </span>
                    {connectionStatus.databaseCount && (
                      <span className="text-xs text-green-500">
                        Ready to manage snapshots for {connectionStatus.databaseCount} databases
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm text-red-600">{connectionStatus.message}</span>
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
