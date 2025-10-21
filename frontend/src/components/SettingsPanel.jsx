import React, { useState, useEffect, useCallback } from 'react';
import { Save, Database } from 'lucide-react';
import { Toast } from './ui/Modal';
import FormInput from './ui/FormInput';
import FormCheckbox from './ui/FormCheckbox';
import { useNotification } from '../hooks/useNotification';
import { useFormValidation, validators } from '../utils/validation';

const SettingsPanel = () => {
  const [settings, setSettings] = useState({
    preferences: {
      defaultGroup: '',
      maxHistoryEntries: 100
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [snapshotPath, setSnapshotPath] = useState('');

  // Form validation for settings
  const settingsForm = useFormValidation(
    {},
    {}
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
    setIsLoading(true);
    try {
      const updatedSettings = {
        preferences: {
          defaultGroup: settings.preferences.defaultGroup,
          maxHistoryEntries: settings.preferences.maxHistoryEntries
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
          Settings
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400">
          Configure your application preferences
        </p>
      </div>


      {/* Preferences */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="maxHistoryEntries" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Maximum History Entries
            </label>
            <FormInput
              id="maxHistoryEntries"
              type="number"
              min="1"
              max="1000"
              value={settings.preferences.maxHistoryEntries?.toString() || '100'}
              onChange={(value) => setSettings(prev => ({
                ...prev,
                preferences: {
                  ...prev.preferences,
                  maxHistoryEntries: parseInt(value) || 100
                }
              }))}
              placeholder="100"
              className="w-full"
            />
            <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
              Maximum number of history entries to keep. Older entries will be automatically removed when this limit is exceeded.
            </p>
          </div>
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
                <br />
                <span className="font-medium">Note:</span> For Docker containers (especially Linux containers on Windows),
                this must be a Docker volume, not a bind mount, to ensure proper file permissions and access.
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
