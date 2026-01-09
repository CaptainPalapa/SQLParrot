import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, Eye, EyeOff, CheckCircle, AlertCircle, Network, HelpCircle } from 'lucide-react';
import { api } from '../api/client';
import FormInput from './ui/FormInput';
import { useNotification } from '../hooks/useNotification';

// Helper component for env var info popover
const EnvVarInfoPopover = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="ml-1 text-secondary-400 hover:text-secondary-600 dark:text-secondary-500 dark:hover:text-secondary-300 transition-colors"
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-6 z-50 w-80 p-3 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg text-sm">
          <p className="font-semibold text-secondary-900 dark:text-white mb-2">
            Environment Variable Substitution
          </p>
          <p className="text-secondary-700 dark:text-secondary-300 mb-2">
            You can use <code className="px-1 py-0.5 bg-secondary-100 dark:bg-secondary-700 rounded text-xs">${'{'}VAR_NAME{'}'}</code> syntax to reference <strong>ANY</strong> environment variable from your <code className="px-1 py-0.5 bg-secondary-100 dark:bg-secondary-700 rounded text-xs">.env</code> file.
          </p>
          <p className="text-secondary-700 dark:text-secondary-300 mb-2">
            Examples:
          </p>
          <ul className="list-disc list-inside text-secondary-600 dark:text-secondary-400 space-y-1 text-xs ml-2">
            <li><code>${'{'}SQL_SERVER{'}'}</code> - Uses SQL_SERVER from .env</li>
            <li><code>${'{'}SQL_SERVER_1{'}'}</code> - Uses SQL_SERVER_1 from .env</li>
            <li><code>${'{'}SNAPSHOT_PATH_2{'}'}</code> - Uses SNAPSHOT_PATH_2 from .env</li>
            <li><code>${'{'}MY_CUSTOM_HOST{'}'}</code> - Uses any variable name you define!</li>
          </ul>
          <p className="text-secondary-600 dark:text-secondary-400 text-xs mt-2">
            This keeps sensitive credentials in your <code className="px-1 py-0.5 bg-secondary-100 dark:bg-secondary-700 rounded">.env</code> file instead of the database.
          </p>
        </div>
      )}
    </div>
  );
};

const ProfileManagementModal = ({ isOpen, onClose, onSave, editingProfile }) => {
  const [formData, setFormData] = useState({
    name: '',
    platformType: 'Microsoft SQL Server',
    host: 'localhost',
    port: 1433,
    username: '',
    password: '',
    trustCertificate: true,
    snapshotPath: '/var/opt/mssql/snapshots',
    description: '',
    notes: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [testFailedMessage, setTestFailedMessage] = useState('');
  const { showError, showSuccess } = useNotification();

  // Use refs to track test state (synchronous, prevents race conditions with React state)
  const isTestingRef = useRef(false);
  const testFailedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (editingProfile) {
        // Editing existing profile - don't pre-fill password
        setFormData({
          name: editingProfile.name || '',
          platformType: editingProfile.platformType || 'Microsoft SQL Server',
          host: editingProfile.host || 'localhost',
          port: editingProfile.port || 1433,
          username: editingProfile.username || '',
          password: '', // Don't pre-fill password
          trustCertificate: editingProfile.trustCertificate ?? true,
          snapshotPath: editingProfile.snapshotPath || '/var/opt/mssql/snapshots',
          description: editingProfile.description || '',
          notes: editingProfile.notes || ''
        });
      } else {
        // New profile
        setFormData({
          name: '',
          platformType: 'Microsoft SQL Server',
          host: 'localhost',
          port: 1433,
          username: '',
          password: '',
          trustCertificate: true,
          snapshotPath: '/var/opt/mssql/snapshots',
          description: '',
          notes: ''
        });
      }
      setErrors({});
      setTestResult(null); // Clear test results when modal opens
      setTestFailedMessage(''); // Clear failed message
      setShowSaveConfirm(false); // Clear save confirmation dialog
      // Reset refs when modal opens
      isTestingRef.current = false;
      testFailedRef.current = false;
    }
  }, [isOpen, editingProfile]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isSaving && !isTesting) {
        // If save confirmation is showing, close that first
        if (showSaveConfirm) {
          setShowSaveConfirm(false);
          setTestFailedMessage('');
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isTesting, showSaveConfirm, onClose]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Profile name is required';
    }

    if (!formData.host.trim()) {
      newErrors.host = 'Host is required';
    }

    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Valid port (1-65535) is required';
    }

    if (!formData.username || !formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    // Password is optional for both new and editing profiles

    if (!formData.snapshotPath.trim()) {
      newErrors.snapshotPath = 'Snapshot path is required';
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;

    // If validation failed, show error message
    if (!isValid) {
      const errorMessages = Object.values(newErrors).filter(msg => msg);
      if (errorMessages.length > 0) {
        showError(`Please fix the following errors: ${errorMessages.join(', ')}`);
      }
    }

    return isValid;
  };

  const handleTestConnection = async () => {
    // Basic validation for test
    if (!formData.host || !formData.host.trim()) {
      showError('Host is required to test connection');
      return;
    }
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      showError('Valid port is required to test connection');
      return;
    }
    if (!formData.username || !formData.username.trim()) {
      showError('Username is required to test connection');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      // For editing mode: use new password if provided, otherwise use saved password
      // For new profile: use password if provided, otherwise test without it
      // Trim password to handle whitespace-only passwords
      const passwordToTest = formData.password?.trim() || ''; // Always use empty string if not provided or whitespace

      // When editing and password is empty, backend will use saved password from profileId
      const testData = {
        host: formData.host.trim(),
        port: parseInt(formData.port),
        username: formData.username.trim(),
        password: passwordToTest, // Empty string if not provided - backend will use saved password when editing
        trustCertificate: formData.trustCertificate,
        ...(editingProfile && { profileId: editingProfile.id }) // Always include profile ID when editing
      };

      const response = await api.post('/api/test-connection', testData);

      if (response.success || response.connected) {
        setTestResult({ success: true, message: 'Connection successful!' });
        showSuccess('Connection test successful!');
        // Clear failure flag when test succeeds
        testFailedRef.current = false;
        setShowSaveConfirm(false);
        setTestFailedMessage('');
      } else {
        setTestResult({
          success: false,
          message: response.error || response.messages?.error?.[0] || 'Connection test failed'
        });
        showError(response.error || response.messages?.error?.[0] || 'Connection test failed');
        // Set failure flag when test fails
        testFailedRef.current = true;
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error.message || 'Connection test failed'
      });
      showError('Connection test failed: ' + error.message);
      // Set failure flag when test throws exception
      testFailedRef.current = true;
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (skipTest = false) => {
    // Prevent saving if test failed and user hasn't confirmed (unless explicitly skipping)
    if (!skipTest && testFailedRef.current) {
      // Ensure dialog is shown
      if (!showSaveConfirm) {
        setShowSaveConfirm(true);
      }
      return;
    }

    // Prevent saving if confirmation dialog is showing (unless user explicitly confirmed)
    if (!skipTest && showSaveConfirm) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Auto-test connection before saving (unless user confirmed to save anyway)
    if (!skipTest) {
      isTestingRef.current = true;
      testFailedRef.current = false;
      setIsTesting(true);
      setTestResult(null);

      try {
        // Trim password to handle whitespace-only passwords
        const passwordToTest = formData.password?.trim() || '';
        const testData = {
          host: formData.host.trim(),
          port: parseInt(formData.port),
          username: formData.username.trim(),
          password: passwordToTest, // Empty string if not provided - backend will use saved password when editing
          trustCertificate: formData.trustCertificate,
          ...(editingProfile && { profileId: editingProfile.id }) // Always include profile ID when editing
        };

        const testResponse = await api.post('/api/test-connection', testData);

        // Check if test failed - be very explicit about what constitutes failure
        // If response is null/undefined, treat as failure
        if (!testResponse) {
          setTestFailedMessage('Connection test failed: No response from server');
          setShowSaveConfirm(true);
          setIsTesting(false);
          return;
        }

        const isSuccess = testResponse?.success === true;
        const hasError = !!(testResponse?.error ||
                           (testResponse?.messages?.error && testResponse.messages.error.length > 0));
        const testPassed = isSuccess && !hasError;

        if (!testPassed) {
          // Test failed - show confirmation dialog and STOP
          const errorMsg = testResponse?.error ||
                          testResponse?.messages?.error?.[0] ||
                          testResponse?.data ||
                          'Connection test failed';

          // Mark test as failed in ref (synchronous, prevents race conditions)
          testFailedRef.current = true;
          isTestingRef.current = false;

          // Set state and return IMMEDIATELY - don't proceed
          setTestFailedMessage(errorMsg);
          setShowSaveConfirm(true);
          setIsTesting(false);

          return; // CRITICAL: Stop execution here
        }

        testFailedRef.current = false; // Clear failure flag
        isTestingRef.current = false;
        setIsTesting(false);
      } catch (error) {
        // Test failed with exception - show confirmation dialog and STOP
        const errorMsg = error?.message || error?.toString() || 'Connection test failed';

        // Mark test as failed in ref (synchronous, prevents race conditions)
        testFailedRef.current = true;
        isTestingRef.current = false;

        setTestFailedMessage(errorMsg);
        setShowSaveConfirm(true);
        setIsTesting(false);

        return; // CRITICAL: Stop execution here
      }
    } else {
      // Clear failure flag when user explicitly skips test
      testFailedRef.current = false;
    }

    // Proceed with save ONLY if we got here (test passed or skipped)
    setIsSaving(true);
    try {
      const profileData = {
        name: formData.name.trim(),
        platformType: formData.platformType,
        host: formData.host.trim(),
        port: parseInt(formData.port),
        username: formData.username.trim(),
        password: formData.password || undefined, // Only send if provided (for editing)
        trustCertificate: formData.trustCertificate,
        snapshotPath: formData.snapshotPath.trim(),
        description: formData.description.trim() || null,
        notes: formData.notes.trim() || null
      };

      let response;
      if (editingProfile) {
        response = await api.updateProfile(editingProfile.id, profileData);
      } else {
        response = await api.createProfile(profileData);
      }

      if (response.success) {
        // After saving, check if this is the only profile and set it as active if so
        let activatedProfileId = null;
        try {
          const profilesResponse = await api.getProfiles();
          if (profilesResponse.success && profilesResponse.data) {
            const profiles = Array.isArray(profilesResponse.data)
              ? profilesResponse.data
              : (profilesResponse.data.profiles || []);

            if (profiles.length === 1) {
              // Only one profile exists - set it as active
              // Use editingProfile.id if editing, otherwise use the profile from the list
              const profileId = editingProfile ? editingProfile.id : profiles[0].id;
              const activateResponse = await api.setActiveProfile(profileId);
              if (activateResponse.success) {
                activatedProfileId = profileId;
              }
            }
          }
        } catch (error) {
          // Non-critical error - log but don't fail the save
          console.warn('Failed to check/set active profile:', error);
        }

        // Pass the activated profile ID to onSave so parent can refresh Groups tab
        onSave(activatedProfileId);
        onClose(); // Close modal after successful save
      } else {
        showError(response.messages?.error?.[0] || 'Failed to save profile');
      }
    } catch (error) {
      showError('Failed to save profile: ' + error.message);
    } finally {
      setIsSaving(false);
      setShowSaveConfirm(false);
      setTestFailedMessage('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative ${showSaveConfirm ? 'pointer-events-none' : ''}`}>
        <div className="sticky top-0 bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-secondary-900 dark:text-white">
            {editingProfile ? 'Edit Profile' : 'Add Profile'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Profile Name *
            </label>
            <FormInput
              id="profile-name"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="e.g., Production Server"
              error={errors.name}
              touched={errors.name ? true : undefined}
            />
          </div>

          {/* Platform Type */}
          <div>
            <label htmlFor="profile-platform-type" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Platform Type *
            </label>
            <select
              id="profile-platform-type"
              name="platformType"
              value={formData.platformType}
              onChange={(e) => setFormData({ ...formData, platformType: e.target.value })}
              className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="Microsoft SQL Server">Microsoft SQL Server</option>
            </select>
          </div>

          {/* Host and Port */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-host" className="flex items-center text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Host / Server *
                <EnvVarInfoPopover />
              </label>
              <FormInput
                id="profile-host"
                value={formData.host}
                onChange={(value) => setFormData({ ...formData, host: value })}
                placeholder="localhost"
                error={errors.host}
                touched={errors.host ? true : undefined}
              />
            </div>
            <div>
              <label htmlFor="profile-port" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Port *
              </label>
              <FormInput
                id="profile-port"
                type="number"
                min="1"
                max="65535"
                value={formData.port.toString()}
                onChange={(value) => setFormData({ ...formData, port: parseInt(value) || 1433 })}
                placeholder="1433"
                error={errors.port}
                touched={errors.port ? true : undefined}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label htmlFor="profile-username" className="flex items-center text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Username *
              <EnvVarInfoPopover />
            </label>
            <FormInput
              id="profile-username"
              value={formData.username}
              onChange={(value) => setFormData({ ...formData, username: value })}
              placeholder="sa"
              error={errors.username}
              touched={errors.username ? true : undefined}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="profile-password" className="flex items-center text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Password
              {editingProfile && <span className="text-xs text-secondary-500 ml-1">(leave blank to keep existing)</span>}
              <EnvVarInfoPopover />
            </label>
            <div className="relative">
              <FormInput
                id="profile-password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(value) => setFormData({ ...formData, password: value })}
                placeholder={editingProfile ? 'Enter new password (optional)' : 'Enter password'}
                error={errors.password}
                touched={errors.password ? true : undefined}
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


          {/* Snapshot Path */}
          <div>
            <label htmlFor="profile-snapshot-path" className="flex items-center text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Snapshot Storage Path *
              <EnvVarInfoPopover />
            </label>
            <FormInput
              id="profile-snapshot-path"
              value={formData.snapshotPath}
              onChange={(value) => setFormData({ ...formData, snapshotPath: value })}
              placeholder="/var/opt/mssql/snapshots"
              error={errors.snapshotPath}
              touched={errors.snapshotPath ? true : undefined}
            />
            <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
              Path on SQL Server where snapshot files will be stored
            </p>
          </div>

          {/* Trust Certificate */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="trustCertificate"
              checked={formData.trustCertificate}
              onChange={(e) => setFormData({ ...formData, trustCertificate: e.target.checked })}
              className="w-4 h-4 text-primary-600 bg-secondary-100 border-secondary-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-secondary-800 focus:ring-2 dark:bg-secondary-700 dark:border-secondary-600"
            />
            <label htmlFor="trustCertificate" className="flex items-center text-sm text-secondary-700 dark:text-secondary-300">
              Trust server certificate (for self-signed certs)
              <EnvVarInfoPopover />
            </label>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="profile-description" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Description (optional)
            </label>
            <FormInput
              id="profile-description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Brief description of this profile"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="profile-notes" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="profile-notes"
              name="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this profile"
              rows={4}
              className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-secondary-50 dark:bg-secondary-900 border-t border-secondary-200 dark:border-secondary-700 px-6 py-4">
          {/* Test Result */}
          {testResult && (
            <div className={`mb-3 p-3 rounded-lg flex items-center space-x-2 ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-sm ${
                testResult.success
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {testResult.message}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              className="btn-secondary flex items-center space-x-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Network className="w-4 h-4" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                disabled={isSaving || isTesting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleSave(false); // Explicitly pass false to ensure test runs
                }}
                disabled={isSaving || isTesting || showSaveConfirm}
                className="btn-primary flex items-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Save Confirmation Dialog (when test fails) - rendered inside modal */}
        {showSaveConfirm && (
          <div
            className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 rounded-lg pointer-events-auto"
            onClick={(e) => {
              // Prevent clicks on backdrop from closing
              e.stopPropagation();
            }}
          >
            <div
              className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4">
                Connection Test Failed
              </h3>
              <p className="text-secondary-700 dark:text-secondary-300 mb-2">
                This profile could not connect to the database.
              </p>
              {testFailedMessage && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-mono text-xs break-words">
                  {testFailedMessage}
                </p>
              )}
              <p className="text-secondary-700 dark:text-secondary-300 mb-6">
                Do you want to save this profile anyway?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Clear failure flag so user can try again after fixing credentials
                    testFailedRef.current = false;
                    setShowSaveConfirm(false);
                    setTestFailedMessage('');
                  }}
                  disabled={isSaving}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    // Clear failure flag and close the confirmation dialog first
                    testFailedRef.current = false;
                    setShowSaveConfirm(false);
                    setTestFailedMessage('');
                    // Then proceed with save (skip test)
                    await handleSave(true);
                  }}
                  disabled={isSaving}
                  className="btn-primary"
                >
                  {isSaving ? 'Saving...' : 'Save Anyway'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileManagementModal;

