import React, { useState, useEffect, useCallback } from 'react';
import { Save, TestTube, CheckCircle, XCircle, Shield, Database } from 'lucide-react';
import { Toast } from './ui/Modal';
import FormInput from './ui/FormInput';
import FormCheckbox from './ui/FormCheckbox';
import { useNotification } from '../hooks/useNotification';
import { useFormValidation, validators } from '../utils/validation';

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
  const [isLoading, setIsLoading] = useState(false);
  const [snapshotPath, setSnapshotPath] = useState('');

  // Form validation for settings
  const settingsForm = useFormValidation(
    { refreshInterval: 5000 },
    {
      refreshInterval: [validators.required, validators.number, validators.min(1000), validators.max(60000)],
    }
  );

  // Custom hook for notifications
  const { notification, showSuccess, showError, hideNotification } = useNotification();

  useEffect(() => {
    fetchSettings();
    fetchSnapshotPath();
  }, []);

  const fetchSnapshotPath = useCallback(async () => {
    try {
      const response = await fetch('/api/test-snapshot-path');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSnapshotPath(data.snapshotPath || 'Not configured');
    } catch (error) {
      console.error('Error fetching snapshot path:', error);
      setSnapshotPath('Error loading path');
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      showError('Failed to load settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const handleSaveSettings = async () => {
    if (!settingsForm.validate()) {
      return;
    }

    setIsLoading(true);
    try {
      const updatedSettings = {
        preferences: {
          autoRefresh: settings.preferences.autoRefresh,
          refreshInterval: Number(settingsForm.values.refreshInterval)
        }
      };

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSettings(updatedSettings);
      showSuccess('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      showError('Failed to save settings. Please try again.');
    } finally {
      setIsLoading(false);
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setConnectionStatus({
          type: 'success',
          message: result.message,
          databaseCount: result.databaseCount
        });
        showSuccess('Connection test successful!');
      } else {
        setConnectionStatus({
          type: 'error',
          message: result.error
        });
        showError('Connection test failed');
      }
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: 'Connection failed'
      });
      showError('Connection test failed. Please check your settings.');
    } finally {
      setIsTestingConnection(false);
    }
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
            aria-label="Test database connection"
          >
            <TestTube className="w-4 h-4" aria-hidden="true" />
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
          <FormCheckbox
            label="Auto-refresh snapshots"
            checked={settings.preferences.autoRefresh}
            onChange={(checked) => setSettings(prev => ({
              ...prev,
              preferences: { ...prev.preferences, autoRefresh: checked }
            }))}
          />

          <FormInput
            label="Refresh Interval (milliseconds)"
            type="number"
            value={settingsForm.values.refreshInterval?.toString() || ''}
            onChange={(value) => settingsForm.setValue('refreshInterval', value)}
            onBlur={() => settingsForm.setFieldTouched('refreshInterval')}
            error={settingsForm.errors.refreshInterval}
            touched={settingsForm.touched.refreshInterval}
            min="1000"
            step="1000"
            required
          />
        </div>
      </div>

      {/* Environment Configuration */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          Environment Configuration
        </h3>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Snapshot Storage Path
              </span>
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <div className="font-mono bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">
                {snapshotPath || 'Loading...'}
              </div>
              <p className="mt-2 text-xs">
                This path is used in SQL Server CREATE DATABASE commands for snapshot storage.
                Configured via SNAPSHOT_PATH environment variable.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          disabled={isLoading || !settingsForm.isValid}
          className="btn-primary flex items-center space-x-2"
          aria-label="Save application settings"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>{isLoading ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Toast Notification */}
      <Toast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default SettingsPanel;
