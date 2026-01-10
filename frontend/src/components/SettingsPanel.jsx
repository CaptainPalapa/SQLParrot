import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Clock, X, RefreshCw, CheckCircle, AlertCircle, Server, Loader2, Lock } from 'lucide-react';
import { Toast } from './ui/Modal';
import FormInput from './ui/FormInput';
import { useNotification } from '../hooks/useNotification';
import { api, isTauri } from '../api';
import { usePassword } from '../contexts/PasswordContext';
import PasswordManagementModal from './PasswordManagementModal';

const SettingsPanel = ({ onNavigateGroups }) => {
  const [settings, setSettings] = useState({
    preferences: {
      defaultGroup: '',
      maxHistoryEntries: 100,
      autoCreateCheckpoint: true
    },
    autoVerification: {
      enabled: false,
      intervalMinutes: 15
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [snapshotPath, setSnapshotPath] = useState('');
  const [metadataStatus, setMetadataStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const { passwordStatus } = usePassword();
  const saveTimeoutRef = useRef(null);
  const savedTimeoutRef = useRef(null);
  const isInitialLoadRef = useRef(true);


  // Form validation for settings (not currently used, but kept for future use)
  // const settingsForm = useFormValidation({}, {});

  // Custom hook for notifications
  const { notification, showSuccess, showError, hideNotification } = useNotification();

  useEffect(() => {
    fetchSettings();
    fetchSnapshotPath();
    fetchMetadataStatus();
  }, []);

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Capture current values to avoid stale closures
    const maxHistoryEntries = settings.preferences?.maxHistoryEntries || 100;
    const autoCreateCheckpoint = settings.preferences?.autoCreateCheckpoint ?? true;
    const defaultGroup = settings.preferences?.defaultGroup || '';
    const autoVerificationEnabled = settings.autoVerification?.enabled || false;
    const autoVerificationInterval = settings.autoVerification?.intervalMinutes || 15;

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      setIsSaved(false);
      try {
        const updatedSettings = {
          preferences: {
            defaultGroup,
            maxHistoryEntries,
            autoCreateCheckpoint
          },
          autoVerification: {
            enabled: autoVerificationEnabled,
            intervalMinutes: autoVerificationInterval
          }
        };

        await api.put('/api/settings', updatedSettings);
        // Show subtle "Saved" indicator instead of toast
        setIsSaving(false);
        setIsSaved(true);
        
        // Hide "Saved" indicator after 2 seconds
        if (savedTimeoutRef.current) {
          clearTimeout(savedTimeoutRef.current);
        }
        savedTimeoutRef.current = setTimeout(() => {
          setIsSaved(false);
        }, 2000);
      } catch (error) {
        console.error('Error saving settings:', error);
        setIsSaving(false);
        // Only show error notification for failures
        showError('Failed to save settings. Please try again.');
      }
    }, 500); // 500ms debounce

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.preferences?.maxHistoryEntries, 
    settings.preferences?.autoCreateCheckpoint,
    settings.preferences?.defaultGroup,
    settings.autoVerification?.enabled,
    settings.autoVerification?.intervalMinutes
  ]);

  const fetchSnapshotPath = useCallback(async () => {
    try {
      const data = await api.get('/api/test-snapshot-path');
      setSnapshotPath(data.snapshotPath || 'Not configured');
    } catch (error) {
      console.error('Error fetching snapshot path:', error);
      setSnapshotPath('Error loading path');
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/settings');
      // Normalized response has settings in data property
      const data = response.data || response;

      // Ensure we have proper default structure
      const safeSettings = {
        preferences: {
          defaultGroup: data.preferences?.defaultGroup || '',
          maxHistoryEntries: data.preferences?.maxHistoryEntries || 100,
          autoCreateCheckpoint: data.preferences?.autoCreateCheckpoint ?? true
        },
        autoVerification: {
          enabled: data.autoVerification?.enabled || false,
          intervalMinutes: data.autoVerification?.intervalMinutes || 15
        },
        connection: data.connection || {},
        fileApi: data.fileApi || { configured: false }
      };

      setSettings(safeSettings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      showError('Failed to load settings. Please try again.');

      // Set default settings on error
      setSettings({
        preferences: {
          defaultGroup: '',
          maxHistoryEntries: 100,
          autoCreateCheckpoint: true
        },
        autoVerification: {
          enabled: false,
          intervalMinutes: 15
        },
        connection: {},
        fileApi: { configured: false }
      });
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const fetchMetadataStatus = useCallback(async () => {
    try {
      const data = await api.get('/api/metadata/status');
      setMetadataStatus(data.data);
    } catch (error) {
      console.error('Error fetching metadata status:', error);
      setMetadataStatus({ mode: 'json', useMetadataTable: false });
    }
  }, []);

  const handleSyncMetadata = async () => {
    setIsSyncing(true);
    try {
      const data = await api.post('/api/metadata/sync');
      showSuccess(`Sync completed: ${data.data.resolved.length} conflicts resolved`);

      // Refresh metadata status after sync
      await fetchMetadataStatus();
    } catch (error) {
      console.error('Error syncing metadata:', error);
      showError('Failed to sync metadata. Please try again.');
    } finally {
      setIsSyncing(false);
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

      {/* Password Protection */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center space-x-2">
          <Lock className="w-5 h-5" />
          <span>Password Protection</span>
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-700 dark:text-secondary-300">
                Status: <span className="font-medium">
                  {passwordStatus?.status === 'set' ? 'Enabled' :
                   passwordStatus?.status === 'skipped' ? 'Disabled' :
                   'Not Configured'}
                </span>
              </p>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
                Protect SQL Parrot UI with a password (optional)
              </p>
            </div>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="btn btn-secondary"
            >
              Manage Password
            </button>
          </div>

          {passwordStatus?.envVarIgnored && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  UI_PASSWORD in your Docker configuration is being ignored because a password was already set via the UI.
                  Remove UI_PASSWORD from your .env file or reset the SQLite database to use it.
                </p>
              </div>
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

          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="autoCreateCheckpoint"
              checked={settings.preferences.autoCreateCheckpoint ?? true}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                preferences: {
                  ...prev.preferences,
                  autoCreateCheckpoint: e.target.checked
                }
              }))}
              className="mt-1 h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <label htmlFor="autoCreateCheckpoint" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Auto-create checkpoint after rollback
              </label>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
                Automatically create a new "Automatic" snapshot after successfully rolling back to a previous state. This provides a recovery point at the rolled-back state.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Configuration - Docker/Express only */}
      {!isTauri() && (
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
      )}

      {/* Metadata Storage Status */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          Metadata Storage
        </h3>

        <div className="space-y-4">
          {metadataStatus && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    Local SQLite Database
                  </span>
                </div>
              </div>

              <div className="text-sm text-green-700 dark:text-green-300">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Server className="w-4 h-4" />
                    <span className="font-mono text-xs">
                      {metadataStatus.database || 'sqlparrot.db'}
                    </span>
                  </div>

                  <div className="text-xs">
                    <p className="font-medium">Features:</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>Local embedded database - no external dependencies</li>
                      <li>User attribution for all operations</li>
                      <li>Fast and lightweight</li>
                      <li>Portable configuration</li>
                    </ul>
                  </div>

                  <div className="text-xs opacity-75">
                    <p>
                      <span className="font-medium">User:</span> {metadataStatus.userName || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auto-save indicator */}
      {(isSaving || isSaved) && (
        <div className="flex justify-end">
          <p className={`text-sm flex items-center space-x-2 ${
            isSaving 
              ? 'text-secondary-500 dark:text-secondary-400' 
              : 'text-green-600 dark:text-green-400'
          }`}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Saved</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />

      {/* Password Management Modal */}
      <PasswordManagementModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};

export default SettingsPanel;
