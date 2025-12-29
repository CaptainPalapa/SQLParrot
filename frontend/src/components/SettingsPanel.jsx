import React, { useState, useEffect, useCallback } from 'react';
import { Save, Database, Clock, X, RefreshCw, CheckCircle, AlertCircle, Server, Plug, Eye, EyeOff, Loader2, HelpCircle, Copy, Check, Lock } from 'lucide-react';
import { Toast } from './ui/Modal';
import FormInput from './ui/FormInput';
import { useNotification } from '../hooks/useNotification';
import { useFormValidation, validators } from '../utils/validation';
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
  const [snapshotPath, setSnapshotPath] = useState('');
  const [metadataStatus, setMetadataStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const { passwordStatus } = usePassword();

  // Connection settings state (for Tauri desktop app)
  const [connection, setConnection] = useState({
    host: 'localhost',
    port: 1433,
    username: 'sql_parrot_service',
    password: '',
    trustCertificate: true,
    snapshotPath: '/var/opt/mssql/snapshots'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null); // null, 'success', 'error'
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [showPathHelper, setShowPathHelper] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const isTauriApp = isTauri();

  const windowsPathQuery = `USE master;
SELECT name 'Logical Name', physical_name 'File Location'
FROM sys.master_files;`;

  const copyPathQuery = async () => {
    try {
      await navigator.clipboard.writeText(windowsPathQuery);
      setCopiedQuery(true);
      setTimeout(() => setCopiedQuery(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
    fetchMetadataStatus();
    if (isTauriApp) {
      fetchConnection();
    }
  }, [isTauriApp]);

  // Fetch saved connection profile (Tauri only)
  const fetchConnection = useCallback(async () => {
    try {
      const result = await api.get('/api/connection');
      if (result.success && result.data) {
        setConnection(prev => ({
          ...prev,
          host: result.data.host || 'localhost',
          port: result.data.port || 1433,
          username: result.data.username || 'sql_parrot_service',
          trustCertificate: result.data.trust_certificate ?? true,
          snapshotPath: result.data.snapshot_path || '/var/opt/mssql/snapshots'
          // Note: password is not returned for security
        }));
      }
    } catch (error) {
      console.error('Error fetching connection:', error);
    }
  }, []);

  // Test SQL Server connection
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus(null);
    try {
      const result = await api.post('/api/test-connection', {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        trustCertificate: connection.trustCertificate
      });

      if (result.success) {
        setConnectionStatus('success');
        showSuccess(`Connected! ${result.data}`);
      } else {
        setConnectionStatus('error');
        showError(result.messages?.error?.[0] || 'Connection failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      showError('Connection test failed: ' + error.message);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Save connection profile (Tauri only)
  const handleSaveConnection = async () => {
    setIsSavingConnection(true);
    try {
      const result = await api.post('/api/save-connection', {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        trustCertificate: connection.trustCertificate,
        snapshotPath: connection.snapshotPath
      });

      if (result.success) {
        showSuccess('Connection saved successfully!');
        // Navigate to Groups tab after successful save
        if (onNavigateGroups) {
          setTimeout(() => onNavigateGroups(), 1000); // Brief delay to show success message
        }
      } else {
        showError(result.messages?.error?.[0] || 'Failed to save connection');
      }
    } catch (error) {
      showError('Failed to save connection: ' + error.message);
    } finally {
      setIsSavingConnection(false);
    }
  };

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

  const handleSaveSettings = async () => {
    setIsLoading(true);
    try {
      const updatedSettings = {
        preferences: {
          defaultGroup: settings.preferences?.defaultGroup || '',
          maxHistoryEntries: settings.preferences?.maxHistoryEntries || 100,
          autoCreateCheckpoint: settings.preferences?.autoCreateCheckpoint ?? true
        },
        autoVerification: {
          enabled: settings.autoVerification?.enabled || false,
          intervalMinutes: settings.autoVerification?.intervalMinutes || 15
        }
      };

      await api.put('/api/settings', updatedSettings);

      setSettings(updatedSettings);
      showSuccess('Settings saved successfully!');

      // Navigate to Groups tab after successful save
      if (onNavigateGroups) {
        setTimeout(() => onNavigateGroups(), 1000);
      }
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


      {/* SQL Server Connection (Tauri desktop app only) */}
      {isTauriApp && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center space-x-2">
            <Plug className="w-5 h-5" />
            <span>SQL Server Connection</span>
            {connectionStatus === 'success' && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                Connected
              </span>
            )}
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="host" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Host / Server
                </label>
                <FormInput
                  id="host"
                  type="text"
                  value={connection.host}
                  onChange={(value) => setConnection(prev => ({ ...prev, host: value }))}
                  placeholder="localhost or server name"
                />
              </div>

              <div>
                <label htmlFor="port" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Port
                </label>
                <FormInput
                  id="port"
                  type="number"
                  min="1"
                  max="65535"
                  value={connection.port.toString()}
                  onChange={(value) => setConnection(prev => ({ ...prev, port: parseInt(value) || 1433 }))}
                  placeholder="1433"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Username
                </label>
                <FormInput
                  id="username"
                  type="text"
                  value={connection.username}
                  onChange={(value) => setConnection(prev => ({ ...prev, username: value }))}
                  placeholder="sa"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <FormInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={connection.password}
                    onChange={(value) => setConnection(prev => ({ ...prev, password: value }))}
                    placeholder="Enter password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-500 hover:text-secondary-700 dark:text-secondary-400 dark:hover:text-secondary-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="snapshotPath" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                  Snapshot Storage Path
                </label>
                <button
                  type="button"
                  onClick={() => setShowPathHelper(!showPathHelper)}
                  className="text-xs text-primary-500 hover:text-primary-600 flex items-center space-x-1"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>Windows path help</span>
                </button>
              </div>
              <FormInput
                id="snapshotPath"
                type="text"
                value={connection.snapshotPath}
                onChange={(value) => setConnection(prev => ({ ...prev, snapshotPath: value }))}
                placeholder="/var/opt/mssql/snapshots"
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
                Path on SQL Server where snapshot files will be stored. Default is for Docker/Linux.
              </p>

              {/* Windows Path Helper Popover */}
              {showPathHelper && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-secondary-800 rounded-lg border border-blue-200 dark:border-secondary-500">
                  <p className="text-xs text-secondary-700 dark:text-secondary-200 mb-2">
                    <strong>Windows (non-Docker):</strong> Run this query in SSMS to find your data directory:
                  </p>
                  <div className="relative">
                    <pre className="text-xs bg-white dark:bg-secondary-900 p-2 rounded font-mono overflow-x-auto text-secondary-800 dark:text-secondary-100 border border-secondary-200 dark:border-secondary-600">
                      {windowsPathQuery}
                    </pre>
                    <button
                      type="button"
                      onClick={copyPathQuery}
                      className="absolute top-1 right-1 p-1 bg-secondary-200 dark:bg-secondary-700 rounded hover:bg-secondary-300 dark:hover:bg-secondary-600"
                      title="Copy to clipboard"
                    >
                      {copiedQuery ? (
                        <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-secondary-600 dark:text-secondary-300" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-secondary-600 dark:text-secondary-300 mt-2">
                    Use the directory from the physical_name column (e.g., <code className="bg-white dark:bg-secondary-900 px-1 rounded text-secondary-800 dark:text-secondary-100">C:\Program Files\Microsoft SQL Server\...</code>)
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="trustCertificate"
                type="checkbox"
                checked={connection.trustCertificate}
                onChange={(e) => setConnection(prev => ({ ...prev, trustCertificate: e.target.checked }))}
                className="w-4 h-4 text-primary-600 bg-secondary-100 border-secondary-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-secondary-800 focus:ring-2 dark:bg-secondary-700 dark:border-secondary-600"
              />
              <label htmlFor="trustCertificate" className="text-sm text-secondary-700 dark:text-secondary-300">
                Trust server certificate (for self-signed certs)
              </label>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={isTestingConnection || !connection.host || !connection.username}
                className="btn-secondary flex items-center space-x-2"
              >
                {isTestingConnection ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : connectionStatus === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : connectionStatus === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <Plug className="w-4 h-4" />
                )}
                <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <button
                onClick={handleSaveConnection}
                disabled={isSavingConnection || !connection.host || !connection.username}
                className="btn-primary flex items-center space-x-2"
              >
                {isSavingConnection ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSavingConnection ? 'Saving...' : 'Save Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Environment Configuration - Docker/Express only */}
      {!isTauriApp && (
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

      {/* Password Management Modal */}
      <PasswordManagementModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};

export default SettingsPanel;
