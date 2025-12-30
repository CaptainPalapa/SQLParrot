import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Plus, Edit, Trash2, Camera, RotateCcw, Database, Shield, WifiOff, Settings } from 'lucide-react';
import { Toast, ConfirmationModal, InputModal } from './ui/Modal';
import FormInput from './ui/FormInput';
import DatabaseSelector from './DatabaseSelector';
import { LoadingButton, LoadingPage, LoadingSpinner } from './ui/Loading';
import ProfileManagementModal from './ProfileManagementModal';
import TimeAgo from './ui/TimeAgo';
import { format as formatTimeAgo } from 'timeago.js';
import { useNotification } from '../hooks/useNotification';
import { useConfirmationModal, useInputModal } from '../hooks/useModal';
import { useFormValidation, validators } from '../utils/validation';
import { api, isTauri } from '../api';


const GroupsManager = ({ onNavigateSettings, onGroupsChanged }) => {
  const [groups, setGroups] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [originalGroupData, setOriginalGroupData] = useState(null);
  const [snapshots, setSnapshots] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedDatabases, setSelectedDatabases] = useState([]);
  const [refreshingGroups, setRefreshingGroups] = useState(new Set());
  const [expandedSnapshots, setExpandedSnapshots] = useState(new Set());
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationResults, setVerificationResults] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [settings, setSettings] = useState({});

  // Connection state management
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected', 'connecting', 'error', 'needs_config'
  const [connectionError, setConnectionError] = useState('');
  const [activeProfileName, setActiveProfileName] = useState('');
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingProfileData, setEditingProfileData] = useState(null);
  const isTauriApp = isTauri();

  // Separate loading states for different operations
  const [operationLoading, setOperationLoading] = useState({
    delete: false,
    rollback: false,
    createSnapshot: false,
    cleanup: false
  });
  // Track which group has an operation in progress (locks all buttons for that group)
  const [lockedGroupId, setLockedGroupId] = useState(null);

  // Form validation
  const groupForm = useFormValidation(
    { name: '' },
    {
      name: [validators.required, validators.minLength(2), validators.maxLength(50)],
    }
  );

  // Custom hooks for notifications and modals
  const { notification, showSuccess, showError, hideNotification } = useNotification();
  const { modalState: confirmModal, showConfirmation, hideConfirmation, handleConfirm } = useConfirmationModal();
  const { modalState: inputModal, showInputModal, hideInputModal, handleSubmit } = useInputModal();

  // Check connection health
  const checkConnection = useCallback(async () => {
    try {
      const data = await api.get('/api/health');
      return data.connected === true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }, []);

  // Load data with connection handling
  const loadData = useCallback(async () => {
    // First check if there are ANY profiles configured
    try {
      const profilesResponse = await api.getProfiles();
      const profiles = profilesResponse.data || [];

      if (profiles.length === 0) {
        // No profiles exist - show setup screen to create one
        setConnectionStatus('needs_config');
        setActiveProfileName('');
        setActiveProfileId(null);
        setIsInitialLoading(false);
        setIsLoading(false);
        return;
      }

      // Check if any profile is active and store its info
      const activeProfile = profiles.find(p => p.isActive);
      if (!activeProfile) {
        // Profiles exist but none are active - show setup screen
        setConnectionStatus('needs_config');
        setActiveProfileName('');
        setActiveProfileId(null);
        setIsInitialLoading(false);
        setIsLoading(false);
        return;
      }

      // Store active profile info for connection status messages and edit button
      setActiveProfileName(activeProfile.name);
      setActiveProfileId(activeProfile.id);
    } catch (e) {
      // If profiles check fails in Tauri mode, assume no config
      if (isTauriApp) {
        setConnectionStatus('needs_config');
        setActiveProfileName('');
        setActiveProfileId(null);
        setIsInitialLoading(false);
        setIsLoading(false);
        return;
      }
      // In Docker mode, continue - backend may not be fully ready
    }

    setConnectionStatus('connecting');
    setIsLoading(true);

    try {
      // Verify connection is healthy before loading data
      const isConnected = await checkConnection();
      if (!isConnected) {
        throw new Error('SQL Server connection unavailable');
      }

      // Fetch groups
      const responseData = await api.get('/api/groups');
      if (!responseData.success) {
        throw new Error(responseData.messages?.error?.[0] || 'Failed to fetch groups');
      }
      // Handle both ApiResponse format (Tauri: data is array) and Express format (groups property)
      const fetchedGroups = Array.isArray(responseData.data) ? responseData.data : (responseData.data?.groups || responseData.groups || []);

      // Success - update groups
      setGroups(fetchedGroups);

      // Connection successful
      setConnectionStatus('connected');
      setConnectionError('');

      // Also fetch settings
      try {
        const settingsData = await api.get('/api/settings');
        // Normalized response has settings in data property
        setSettings(settingsData.data || settingsData);
      } catch (settingsError) {
        console.error('Error fetching settings:', settingsError);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Show error immediately - no auto-retry, user can click Retry button
      setConnectionError(error.message);
      setConnectionStatus('error');
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [checkConnection]);

  // Manual reconnect handler
  const handleReconnect = useCallback(() => {
    setConnectionError('');
    loadData();
  }, [loadData]);

  // Open profile edit modal for the active profile
  const handleEditActiveProfile = useCallback(async () => {
    if (!activeProfileId) return;

    try {
      // Fetch full profile data
      const response = await api.getProfiles();
      if (response.success) {
        const profile = response.data?.find(p => p.id === activeProfileId);
        if (profile) {
          setEditingProfileData(profile);
          setIsEditingProfile(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile for editing:', error);
      showError('Failed to load profile data');
    }
  }, [activeProfileId, showError]);

  // Handle profile edit save - close modal and retry connection
  const handleProfileEditSave = useCallback(() => {
    setIsEditingProfile(false);
    setEditingProfileData(null);
    // Refresh header selector (group counts may have changed)
    onGroupsChanged?.();
    // Retry connection with updated profile
    handleReconnect();
  }, [onGroupsChanged, handleReconnect]);

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isCreatingGroup) {
          setIsCreatingGroup(false);
          groupForm.reset();
          setSelectedDatabases([]);
        } else if (editingGroup) {
          setEditingGroup(null);
          groupForm.reset();
          setSelectedDatabases([]);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCreatingGroup, editingGroup, groupForm]);

  // Refresh snapshots when groups change (new group created)
  useEffect(() => {
    if (groups.length > 0 && connectionStatus === 'connected') {
      groups.forEach(group => {
        fetchSnapshots(group.id, true);
      });
    }
  }, [groups, connectionStatus]);

  // Legacy fetchGroups for operations that need to refresh data
  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const responseData = await api.get('/api/groups');
      // Handle both ApiResponse format (Tauri: data is array) and Express format (groups property)
      const groupsList = Array.isArray(responseData.data) ? responseData.data : (responseData.data?.groups || responseData.groups || []);
      setGroups(groupsList);
    } catch (error) {
      console.error('Error fetching groups:', error);
      showError('Failed to load groups. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get('/api/settings');
      // Normalized response has settings in data property
      setSettings(response.data || response);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  const fetchSnapshots = async (groupId, showLoading = false, collapseExpanded = false) => {
    if (showLoading) {
      setRefreshingGroups(prev => new Set(prev).add(groupId));
      // Clear existing snapshots for this group while refreshing
      setSnapshots(prev => ({ ...prev, [groupId]: [] }));
    }

    try {
      const data = await api.get(`/api/groups/${groupId}/snapshots`);

      // Extract snapshots from standardized response format
      const snapshotsList = data.data;

      setSnapshots(prev => ({ ...prev, [groupId]: snapshotsList }));

      // Collapse expanded snapshots if requested (after operations)
      if (collapseExpanded) {
        setExpandedSnapshots(prev => {
          const newSet = new Set(prev);
          newSet.delete(groupId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      showError('Failed to load snapshots. Please try again.');
    } finally {
      if (showLoading) {
        setRefreshingGroups(prev => {
          const newSet = new Set(prev);
          newSet.delete(groupId);
          return newSet;
        });
      }
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();

    if (!groupForm.validate()) {
      return;
    }

    if (selectedDatabases.length === 0) {
      showError('Please select at least one database for the group.');
      return;
    }


    setIsLoading(true);
    try {
      const newGroup = {
        name: groupForm.values.name,
        databases: selectedDatabases
      };

      const responseData = await api.post('/api/groups', newGroup);

      // Handle structured API response
      if (responseData.success) {
        showSuccess(responseData.messages.success?.[0] || 'Group created successfully!');
        await fetchGroups();
        groupForm.reset();
        setSelectedDatabases([]);
        setIsCreatingGroup(false);
        // Notify parent to refresh header profile selector (group counts)
        onGroupsChanged?.();
      } else {
        // Handle error messages from API
        const errorMessage = responseData.messages?.error?.[0] || 'Failed to create group. Please try again.';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      showError(error.message || 'Failed to create group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setOriginalGroupData({
      name: group.name,
      databases: [...group.databases]
    });
    groupForm.setValue('name', group.name);
    setSelectedDatabases([...group.databases]);
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();

    if (!groupForm.validate()) {
      return;
    }

    if (selectedDatabases.length === 0) {
      showError('Please select at least one database for the group.');
      return;
    }


    // Check if changes were made
    const nameChanged = originalGroupData.name !== groupForm.values.name;
    const databasesChanged = JSON.stringify(originalGroupData.databases.sort()) !== JSON.stringify(selectedDatabases.sort());

    if (!nameChanged && !databasesChanged) {
      // No changes made, just close the modal
      setEditingGroup(null);
      groupForm.reset();
      setSelectedDatabases([]);
      setOriginalGroupData(null);
      return;
    }

    // Check if snapshots exist and database members were changed (not just renaming)
    const groupSnapshots = snapshots[editingGroup.id] || [];
    if (groupSnapshots.length > 0 && databasesChanged) {
      const totalSnapshots = groupSnapshots.length * originalGroupData.databases.length;
      showConfirmation({
        title: 'Confirm Database Member Changes',
        message: `Changing database members will delete all ${groupSnapshots.length} snapshots for ${originalGroupData.databases.length} databases (${totalSnapshots} total snapshots). This action cannot be undone.`,
        confirmText: 'Delete Snapshots & Update',
        cancelText: 'Cancel',
        type: 'danger',
        onConfirm: async () => {
          await performGroupUpdate(true);
        }
      });
    } else {
      await performGroupUpdate(false);
    }
  };

  const performGroupUpdate = async (deleteSnapshots) => {
    setIsLoading(true);
    try {
      const updatedGroup = {
        name: groupForm.values.name,
        databases: selectedDatabases,
        deleteSnapshots: deleteSnapshots
      };

      const responseData = await api.put(`/api/groups/${editingGroup.id}`, updatedGroup);

      // Handle structured API response
      if (responseData.success) {
        showSuccess(responseData.messages.success?.[0] || 'Group updated successfully!');
        await fetchGroups();
        groupForm.reset();
        setSelectedDatabases([]);
        setEditingGroup(null);
        setOriginalGroupData(null);
      } else {
        // Handle error messages from API
        const errorMessage = responseData.messages?.error?.[0] || 'Failed to update group. Please try again.';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error updating group:', error);
      showError('Failed to update group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    const group = groups.find(g => g.id === groupId);
    const groupSnapshotList = snapshots[groupId] || [];
    const hasSnapshots = groupSnapshotList.length > 0;

    showConfirmation({
      title: 'Delete Group',
      message: hasSnapshots ? (
        <div>
          <p className="mb-3">Are you sure you want to delete the group "<strong>{group?.name}</strong>"?</p>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
            <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-2">⚠️ This group has {groupSnapshotList.length} snapshot{groupSnapshotList.length !== 1 ? 's' : ''}</p>
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
              <li>All snapshots will be <strong>permanently deleted</strong></li>
              <li>You will <strong>lose the ability to rollback</strong> to any previous state</li>
              <li>Current database state becomes permanent</li>
            </ul>
          </div>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Consider rolling back or deleting snapshots first if you need to preserve a specific state.
          </p>
        </div>
      ) : (
        `Are you sure you want to delete the group "${group?.name}"? This action cannot be undone.`
      ),
      confirmText: hasSnapshots ? 'Delete Group & Snapshots' : 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const responseData = await api.delete(`/api/groups/${groupId}`);

          // Handle structured API response
          if (responseData.success) {
            showSuccess(responseData.messages.success?.[0] || 'Group deleted successfully!');
            await fetchGroups();
            // Notify parent to refresh header profile selector (group counts)
            onGroupsChanged?.();
          } else {
            // Handle error messages from API
            const errorMessage = responseData.messages?.error?.[0] || 'Failed to delete group. Please try again.';
            showError(errorMessage);
          }
        } catch (error) {
          console.error('Error deleting group:', error);
          showError('Failed to delete group. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const handleCreateSnapshot = async (groupId, snapshotName) => {
    setOperationLoading(prev => ({ ...prev, createSnapshot: true }));
    try {
      const data = await api.post(`/api/groups/${groupId}/snapshots`, { snapshotName });

      if (data.success) {
        // Rust ApiResponse returns snapshot directly in data.data
        const snapshot = data.data;
        await fetchSnapshots(groupId, false, true);
        showSuccess(`Snapshot "${snapshot.displayName}" created successfully!`);
      } else {
        // Show specific error message from server response
        const errorMessage = data.messages?.error?.[0] || data.error || data.message || 'Failed to create snapshot. Please try again.';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      // Show more detailed error information
      const errorMessage = error.message || 'Failed to create snapshot. Please try again.';
      showError(`Snapshot creation failed: ${errorMessage}`);
    } finally {
      setOperationLoading(prev => ({ ...prev, createSnapshot: false }));
    }
  };

  // Individual snapshot action handlers
  const handleDeleteSnapshot = async (snapshot) => {
    showConfirmation({
      title: 'Delete Snapshot',
      message: (
        <div>
          <p>Are you sure you want to delete snapshot</p>
          <p className="font-bold text-lg text-center my-2">"{snapshot.displayName}"</p>
          <p className="mb-3">This removes the snapshot - your <strong>database stays exactly as it is now</strong>. All current data and changes are preserved.</p>
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-2">
            <strong>What this means:</strong> You're removing the ability to rollback to this point in time. If you later want to undo changes made after this snapshot was created, you won't be able to.
          </p>
          <p className="text-sm text-secondary-500 dark:text-secondary-500">
            Other snapshots in this group are not affected.
          </p>
        </div>
      ),
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setOperationLoading(prev => ({ ...prev, delete: true }));
        setLockedGroupId(snapshot.groupId);
        try {
          const data = await api.delete(`/api/snapshots/${snapshot.id}`);

          // Handle structured API response
          if (data.success) {
            showSuccess(data.message || `Snapshot "${snapshot.displayName}" deleted successfully!`);
            await fetchSnapshots(snapshot.groupId, false, true);
          } else {
            showError(data.message || 'Failed to delete snapshot. Please try again.');
          }
        } catch (error) {
          console.error('Error deleting snapshot:', error);
          showError('Failed to delete snapshot. Please try again.');
        } finally {
          setOperationLoading(prev => ({ ...prev, delete: false }));
          setLockedGroupId(null);
        }
      }
    });
  };

  const handleRollbackSnapshot = async (snapshot) => {
    // Pre-check for external snapshots before showing confirmation
    try {
      const checkData = await api.get(`/api/snapshots/${snapshot.id}/check-external`);

      if (checkData.hasExternalSnapshots) {
        showConfirmation({
          title: 'External Snapshots Detected',
          message: (
            <div>
              <p className="mb-2">Cannot rollback: external snapshots exist on the target databases. SQL Server requires all snapshots to be removed before restoring.</p>
              <p className="mb-3 text-sm text-secondary-600 dark:text-secondary-400">SQL Parrot automatically removes its own snapshots during rollback, but won't delete snapshots it didn't create. You'll need to remove these manually:</p>
              <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-300 dark:border-gray-700 rounded-lg p-3 mb-3">
                <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                  {checkData.dropCommands.map((cmd, idx) => (
                    <div key={idx}>{cmd}</div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(checkData.dropCommands.join('\n'));
                    showSuccess('SQL copied to clipboard');
                  }}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 underline"
                >
                  Copy to clipboard
                </button>
              </div>
            </div>
          ),
          confirmText: 'Close',
          hideCancelButton: true,
          type: 'warning',
          dismissOnEnter: true,
          onConfirm: () => {}
        });
        return;
      }
    } catch (error) {
      console.error('Error checking for external snapshots:', error);
      // Continue with rollback confirmation if check fails
    }

    const group = groups.find(g => g.id === snapshot.groupId);
    const createdDate = new Date(snapshot.createdAt);
    const timeAgo = formatTimeAgo(createdDate);
    const groupSnapshotCount = snapshots[snapshot.groupId]?.length || 0;

    showConfirmation({
      title: 'Rollback to Snapshot',
      message: (
        <div>
          <p>Rollback all databases in group "{group?.name || 'Unknown'}" to snapshot</p>
          <p className="font-bold text-lg text-center my-2">"{snapshot.displayName}"</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Created {timeAgo} ({createdDate.toLocaleDateString()} at {createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
          </p>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
            <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-1">⚠️ This is destructive</p>
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
              <li>All data changes made after this snapshot will be <strong>permanently lost</strong></li>
              <li>All schema changes (stored procs, indexes, etc.) will be reverted</li>
              <li>{groupSnapshotCount === 1 ? 'The snapshot' : `All ${groupSnapshotCount} snapshots`} in this group will be removed</li>
            </ul>
          </div>

          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            A new "Automatic" checkpoint will be created at the reverted state.
          </p>
        </div>
      ),
      confirmText: 'Rollback',
      cancelText: 'Cancel',
      type: 'success',
      onConfirm: async () => {
        setOperationLoading(prev => ({ ...prev, rollback: true }));
        setLockedGroupId(snapshot.groupId);
        try {
          const data = await api.post(`/api/snapshots/${snapshot.id}/rollback`);

          // Handle external snapshots blocking rollback
          if (data.externalSnapshots) {
            setOperationLoading(prev => ({ ...prev, rollback: false }));
            setLockedGroupId(null);
            showConfirmation({
              title: 'External Snapshots Detected',
              message: (
                <div>
                  <p className="mb-2">Cannot rollback: external snapshots exist on the target databases. SQL Server requires all snapshots to be removed before restoring.</p>
                  <p className="mb-3 text-sm text-secondary-600 dark:text-secondary-400">SQL Parrot automatically removes its own snapshots during rollback, but won't delete snapshots it didn't create. You'll need to remove these manually:</p>
                  <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-300 dark:border-gray-700 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Remove these snapshots manually, then retry:
                    </p>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {data.dropCommands.map((cmd, idx) => (
                        <div key={idx}>{cmd}</div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(data.dropCommands.join('\n'));
                        showSuccess('SQL copied to clipboard');
                      }}
                      className="mt-2 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 underline"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                </div>
              ),
              confirmText: 'Close',
              hideCancelButton: true,
              type: 'warning',
              dismissOnEnter: true,
              onConfirm: () => {}
            });
            return;
          }

          // Handle structured API response
          if (data.success) {
            showSuccess(data.message || `Successfully rolled back to snapshot "${snapshot.displayName}"!`);
            // Refresh all data since rollback can affect multiple groups
            await loadData();
          } else {
            // Show helpful error with suggestion to run Verify
            const errorMsg = data.message || 'Failed to rollback snapshot.';
            showConfirmation({
              title: 'Rollback Failed',
              message: (
                <div>
                  <p className="mb-3">{errorMsg}</p>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">💡 Common cause: External snapshots</p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      SQL Server requires ALL snapshots for a database to be removed before restoring.
                      Click <strong>Verify</strong> to check for orphaned or external snapshots that may be blocking this operation.
                    </p>
                  </div>
                </div>
              ),
              confirmText: 'Close',
              hideCancelButton: true,
              type: 'warning',
              onConfirm: () => {}
            });
          }
        } catch (error) {
          console.error('Error rolling back snapshot:', error);
          const errorMsg = error.message || 'Failed to rollback snapshot.';
          showConfirmation({
            title: 'Rollback Failed',
            message: (
              <div>
                <p className="mb-3">{errorMsg}</p>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">💡 Common cause: External snapshots</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    SQL Server requires ALL snapshots for a database to be removed before restoring.
                    Click <strong>Verify</strong> to check for orphaned or external snapshots that may be blocking this operation.
                  </p>
                </div>
              </div>
            ),
            confirmText: 'Close',
            hideCancelButton: true,
            type: 'warning',
            onConfirm: () => {}
          });
        } finally {
          setOperationLoading(prev => ({ ...prev, rollback: false }));
          setLockedGroupId(null);
        }
      }
    });
  };

  const handleCleanupSnapshot = async (snapshot) => {
    showConfirmation({
      title: 'Cleanup Invalid Snapshot',
      message: (
        <div>
          <p>Are you sure you want to cleanup snapshot</p>
          <p className="font-bold text-lg text-center my-2">"{snapshot.displayName}"</p>
          <p>This will remove the valid and invalid snapshot databases and related files from SQL Server. This action cannot be undone.</p>
        </div>
      ),
      confirmText: 'Cleanup',
      cancelText: 'Cancel',
      type: 'warning',
      onConfirm: async () => {
        setOperationLoading(prev => ({ ...prev, cleanup: true }));
        setLockedGroupId(snapshot.groupId);
        try {
          const data = await api.post(`/api/snapshots/${snapshot.id}/cleanup`);

          // Handle structured API response
          if (data.success) {
            showSuccess(data.message || `Snapshot "${snapshot.displayName}" cleaned up successfully!`);
            await fetchSnapshots(snapshot.groupId, false, true);
          } else {
            showError(data.message || 'Failed to cleanup snapshot. Please try again.');
          }
        } catch (error) {
          console.error('Error cleaning up snapshot:', error);
          showError('Failed to cleanup snapshot. Please try again.');
        } finally {
          setOperationLoading(prev => ({ ...prev, cleanup: false }));
          setLockedGroupId(null);
        }
      }
    });
  };

  // Verification functions
  const runVerification = async () => {
    setIsVerifying(true);
    setVerificationResults(null);

    try {
      // Verify all groups - collect results from each
      let allOrphaned = [];
      let allStale = [];
      let allVerified = true;

      for (const group of groups) {
        const response = await api.post('/api/snapshots/verify', { groupId: group.id });
        console.log('Verify response for group', group.id, ':', JSON.stringify(response));
        // Backend returns { success, verified, issues, orphanedInSQL, missingInSQL, inaccessibleSnapshots }
        // The response is already the parsed JSON, fields are at top level
        const result = response;
        console.log('Verify result:', JSON.stringify(result));
        console.log('Verify result fields:', {
          verified: result.verified,
          issues: result.issues,
          orphanedInSQL: result.orphanedInSQL,
          missingInSQL: result.missingInSQL
        });

        if (!result.verified) {
          allVerified = false;
        }
        // Backend returns orphanedInSQL and missingInSQL
        // Also check for Rust field names: orphanedSnapshots -> orphanedInSQL, staleMetadata -> missingInSQL
        if (result.orphanedInSQL?.length > 0) {
          allOrphaned.push(...result.orphanedInSQL);
        } else if (result.orphanedSnapshots?.length > 0) {
          // Fallback for Rust/Tauri field names
          allOrphaned.push(...result.orphanedSnapshots);
        }
        if (result.missingInSQL?.length > 0) {
          allStale.push(...result.missingInSQL);
        } else if (result.staleMetadata?.length > 0) {
          // Fallback for Rust/Tauri field names
          allStale.push(...result.staleMetadata);
        }
      }
      console.log('Verify totals:', { allOrphaned, allStale, allVerified });

      // Build issues array for display
      const issues = [];
      if (allOrphaned.length > 0) {
        issues.push(`${allOrphaned.length} external snapshot${allOrphaned.length === 1 ? '' : 's'} found on SQL Server`);
      }
      if (allStale.length > 0) {
        issues.push(`${allStale.length} stale metadata entr${allStale.length === 1 ? 'y' : 'ies'} (snapshots no longer on server)`);
      }

      const verifyData = {
        verified: allVerified,
        issues,
        orphanedInSQL: allOrphaned,
        missingInSQL: allStale,
        inaccessibleSnapshots: allStale // Same as stale for cleanup purposes
      };

      if (allVerified) {
        showSuccess('All snapshots are consistent with our data.');
        setVerificationResults({
          type: 'consistency',
          endpoint: '/api/snapshots/verify',
          data: verifyData,
          timestamp: new Date().toISOString()
        });
      } else {
        setVerificationResults({
          type: 'consistency',
          endpoint: '/api/snapshots/verify',
          data: verifyData,
          timestamp: new Date().toISOString()
        });
        setShowVerificationModal(true);
      }

    } catch (error) {
      console.error('Error running verification:', error);
      showError(`Failed to run verification: ${error.message}`);
      setVerificationResults({
        type: 'consistency',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const runCleanupAction = async (actionType) => {
    setIsVerifying(true);

    try {
      let endpoint;
      let useGet = false;

      switch (actionType) {
        case 'orphaned':
          endpoint = '/api/snapshots/cleanup-orphaned';
          break;
        case 'json':
          endpoint = '/api/snapshots/cleanup-metadata';
          break;
        case 'files':
          endpoint = '/api/snapshots/files-to-cleanup';
          useGet = true;
          break;
        default:
          throw new Error('Unknown cleanup action');
      }

      const data = useGet ? await api.get(endpoint) : await api.post(endpoint);

      // Update verification results with cleanup results
      setVerificationResults(prev => ({
        ...prev,
        cleanupResults: {
          ...prev.cleanupResults,
          [actionType]: {
            data,
            timestamp: new Date().toISOString()
          }
        }
      }));

      // Show success notification
      const successMessage = getVerificationSuccessMessage(actionType, data);
      showSuccess(successMessage);

      // Refresh groups to update the UI
      await fetchGroups();

    } catch (error) {
      console.error(`Error running ${actionType} cleanup:`, error);
      showError(`Failed to run ${actionType} cleanup: ${error.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const getActionDisplayName = (actionType) => {
    switch (actionType) {
      case 'orphaned':
        return 'Clean Orphaned Snapshots';
      case 'json':
        return 'Clean Stale Data';
      case 'files':
        return 'Check Orphaned Files';
      default:
        return actionType;
    }
  };

  const getVerificationSuccessMessage = (type, data) => {
    switch (type) {
      case 'consistency':
        return data.verified ?
          'All snapshots are consistent with our data.' :
          `Found ${data.issues?.length || 0} consistency issues.`;
      case 'orphaned':
        return data.cleaned > 0 ?
          `Cleaned up ${data.cleaned} orphaned snapshot${data.cleaned === 1 ? '' : 's'}.` :
          'No orphaned snapshots found.';
      case 'json':
        return data.cleaned > 0 ?
          `Cleaned up ${data.cleaned} stale data entr${data.cleaned === 1 ? 'y' : 'ies'}.` :
          'Our data is consistent with SQL Server.';
      case 'files':
        return `Found ${data.totalFiles || 0} orphaned file${data.totalFiles === 1 ? '' : 's'} and ${data.managedFiles?.length || 0} managed file${data.managedFiles?.length === 1 ? '' : 's'}.`;
      default:
        return 'Verification completed successfully.';
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Banner - shown inline, doesn't block UI */}
      {connectionStatus === 'needs_config' && (
        <div
          onClick={onNavigateSettings}
          className="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg p-6 text-center cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
        >
          <Settings className="w-12 h-12 text-primary-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-primary-800 dark:text-primary-200 mb-2">
            Setup Required
          </h3>
          <p className="text-primary-600 dark:text-primary-300">
            Click here to configure your first connection profile
          </p>
        </div>
      )}

      {connectionStatus === 'connecting' && (
        <div className="bg-secondary-100 dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg p-4 flex items-center justify-center space-x-3">
          <LoadingSpinner size="sm" />
          <span className="text-secondary-700 dark:text-secondary-300">
            Connecting to {activeProfileName || 'SQL Server'}...
          </span>
        </div>
      )}

      {connectionStatus === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <WifiOff className="w-6 h-6 text-red-500" />
              <div>
                <h3 className="font-semibold text-red-800 dark:text-red-200">
                  Connection unavailable{activeProfileName ? ` for "${activeProfileName}"` : ''}
                </h3>
                <p className="text-sm text-red-600 dark:text-red-300">
                  {connectionError || 'Unable to connect to SQL Server'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {activeProfileId && (
                <button
                  onClick={handleEditActiveProfile}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              )}
              <button
                onClick={handleReconnect}
                className="btn-primary flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - always visible */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Database Groups
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400">
            Organize your databases and manage snapshots
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <LoadingButton
            onClick={runVerification}
            className="btn-secondary flex items-center space-x-2"
            aria-label="Verify snapshot consistency"
            loading={isVerifying}
            loadingText="Verifying..."
            disabled={connectionStatus !== 'connected'}
          >
            <Shield className="w-4 h-4" aria-hidden="true" />
            <span>Verify</span>
          </LoadingButton>
          <LoadingButton
            onClick={() => setIsCreatingGroup(true)}
            className="btn-primary flex items-center space-x-2"
            aria-label="Create new database group"
            loading={isLoading}
            loadingText="Loading..."
            disabled={connectionStatus !== 'connected'}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>New Group</span>
          </LoadingButton>
        </div>
      </div>

      {/* Create Group Modal */}
      {isCreatingGroup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
        >
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <h3 id="create-group-title" className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Create New Group
            </h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <FormInput
                label="Group Name"
                value={groupForm.values.name}
                onChange={(value) => groupForm.setValue('name', value)}
                onBlur={() => groupForm.setFieldTouched('name')}
                error={groupForm.errors.name}
                touched={groupForm.touched.name}
                placeholder="Enter group name"
                required
              />

              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Select Databases <span className="text-red-500">*</span>
                </label>
                <DatabaseSelector
                  selectedDatabases={selectedDatabases}
                  onSelectionChange={setSelectedDatabases}
                  existingGroups={groups}
                  clearFiltersOnMount={true}
                />
              </div>

              <div className="flex space-x-3">
                <LoadingButton
                  type="submit"
                  className="btn-primary flex-1"
                  loading={isLoading}
                  loadingText="Creating..."
                  disabled={selectedDatabases.length === 0}
                >
                  Create Group
                </LoadingButton>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingGroup(false);
                    groupForm.reset();
                    setSelectedDatabases([]);
                  }}
                  className="btn-secondary flex-1"
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editingGroup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-group-title"
        >
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <h3 id="edit-group-title" className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Edit Group
            </h3>
            <form onSubmit={handleUpdateGroup} className="space-y-4">
              <FormInput
                label="Group Name"
                value={groupForm.values.name}
                onChange={(value) => groupForm.setValue('name', value)}
                onBlur={() => groupForm.setFieldTouched('name')}
                error={groupForm.errors.name}
                touched={groupForm.touched.name}
                placeholder="Enter group name"
                required
              />

              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Select Databases <span className="text-red-500">*</span>
                </label>
                <DatabaseSelector
                  selectedDatabases={selectedDatabases}
                  onSelectionChange={setSelectedDatabases}
                  existingGroups={groups}
                  currentGroupId={editingGroup.id}
                  clearFiltersOnMount={true}
                />
              </div>

              <div className="flex space-x-3">
                <LoadingButton
                  type="submit"
                  className="btn-primary flex-1"
                  loading={isLoading}
                  loadingText="Updating..."
                  disabled={selectedDatabases.length === 0}
                >
                  Update Group
                </LoadingButton>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroup(null);
                    groupForm.reset();
                    setSelectedDatabases([]);
                  }}
                  className="btn-secondary flex-1"
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups List */}
      <div className="relative">
        {/* Blur overlay when connection is unavailable and there are groups */}
        {connectionStatus === 'error' && groups.length > 0 && (
          <div className="absolute inset-0 z-10 backdrop-blur-sm bg-white/60 dark:bg-secondary-900/60 rounded-lg flex items-center justify-center">
            <div className="text-center p-6 bg-white dark:bg-secondary-800 rounded-xl shadow-lg">
              <WifiOff className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-secondary-700 dark:text-secondary-300 font-medium">
                Connection unavailable
              </p>
              <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                Use the Retry button above or check your profile settings
              </p>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${connectionStatus === 'error' ? 'pointer-events-none select-none' : ''}`}>
        {groups.map((group) => (
          <div key={group.id} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Database className="w-6 h-6 text-primary-600" />
                <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                  {group.name}
                </h3>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditGroup(group)}
                  disabled={lockedGroupId === group.id}
                  className={`p-2 rounded-lg transition-colors ${
                    lockedGroupId === group.id
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-secondary-100 dark:hover:bg-secondary-700'
                  }`}
                  aria-label={`Edit group ${group.name}`}
                >
                  <Edit className="w-4 h-4 text-secondary-600 dark:text-secondary-400" aria-hidden="true" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  disabled={lockedGroupId === group.id}
                  className={`p-2 rounded-lg transition-colors ${
                    lockedGroupId === group.id
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-red-100 dark:hover:bg-red-900'
                  }`}
                  aria-label={`Delete group ${group.name}`}
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                Databases ({group.databases.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.databases.map((db, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-xs rounded-md"
                  >
                    {db}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {/* Show operation status text when any operation is running */}
              {(operationLoading.delete || operationLoading.rollback || operationLoading.cleanup || operationLoading.createSnapshot) ? (
                <div className="w-full h-20 flex items-center justify-center bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-2 mb-1">
                      <div className="animate-spin rounded-full border-2 border-secondary-300 border-t-primary-600 w-4 h-4"></div>
                      <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                        {operationLoading.delete ? "Deleting snapshot..." :
                         operationLoading.rollback ? "Rolling back to snapshot..." :
                         operationLoading.cleanup ? "Cleaning up snapshots..." :
                         operationLoading.createSnapshot ? "Creating snapshot..." :
                         "Please wait..."}
                      </span>
                    </div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400">
                      This may take a few moments
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <LoadingButton
                    onClick={() => {
                      showInputModal({
                        title: 'Create Snapshot',
                        label: 'Snapshot Name',
                        placeholder: 'Enter snapshot name',
                        submitText: 'Create',
                        cancelText: 'Cancel',
                        required: true,
                        onSubmit: (snapshotName) => {
                          handleCreateSnapshot(group.id, snapshotName);
                        }
                      });
                    }}
                    className="w-full btn-primary flex items-center justify-center space-x-2"
                    loading={false}
                    disabled={lockedGroupId === group.id}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Create Snapshot</span>
                  </LoadingButton>

                  <LoadingButton
                    onClick={() => fetchSnapshots(group.id, true)}
                    className="w-full btn-secondary flex items-center justify-center space-x-2"
                    loading={refreshingGroups.has(group.id)}
                    loadingText="Refreshing..."
                    disabled={lockedGroupId === group.id}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Refresh Snapshots</span>
                  </LoadingButton>
                </>
              )}
            </div>

            {/* Snapshots Loading Indicator */}
            {refreshingGroups.has(group.id) && (!snapshots[group.id] || snapshots[group.id].length === 0) && (
              <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                <div className="flex items-center space-x-2 text-secondary-500 dark:text-secondary-400">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm">Loading snapshots...</span>
                </div>
              </div>
            )}

            {/* Snapshots List */}
            {snapshots[group.id] && snapshots[group.id].length > 0 && (
              <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Snapshots ({snapshots[group.id].length})
                  {refreshingGroups.has(group.id) && <LoadingSpinner size="sm" className="inline-block ml-2" />}
                </h4>
                <div className="space-y-2">
                  {(expandedSnapshots.has(group.id) ? snapshots[group.id] : snapshots[group.id].slice(0, 2)).map((snapshot, index) => {
                    const createdDate = new Date(snapshot.createdAt);

                    return (
                      <div
                        key={snapshot.id}
                        className="flex items-center justify-between p-2 bg-secondary-50 dark:bg-secondary-700 rounded"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-mono font-medium text-secondary-900 dark:text-white">
                              {snapshot.sequence}:
                            </span>
                            <span className="text-sm font-medium text-secondary-900 dark:text-white">
                              {snapshot.displayName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-secondary-500 dark:text-secondary-400">
                            <span className="font-mono">
                              {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            <span>•</span>
                            <TimeAgo datetime={snapshot.createdAt} />
                          </div>
                        </div>

                        {/* Action buttons based on snapshot success status */}
                        <div className="flex items-center space-x-2">
                          {snapshot.databaseSnapshots.some(db => db.success) ? (
                            // Snapshot has at least one successful database - show Delete and Rollback buttons
                            <>
                              <button
                                onClick={() => handleDeleteSnapshot(snapshot)}
                                disabled={lockedGroupId === group.id}
                                className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors ${
                                  lockedGroupId === group.id
                                    ? 'bg-red-400 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700'
                                }`}
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => handleRollbackSnapshot(snapshot)}
                                disabled={lockedGroupId === group.id}
                                className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors ${
                                  lockedGroupId === group.id
                                    ? 'bg-green-400 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700'
                                }`}
                              >
                                Rollback
                              </button>
                            </>
                          ) : (
                            // No successful databases - show cleanup option
                            <button
                              onClick={() => handleCleanupSnapshot(snapshot)}
                              disabled={lockedGroupId === group.id}
                              className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors ${
                                lockedGroupId === group.id
                                  ? 'bg-yellow-400 cursor-not-allowed'
                                  : 'bg-yellow-600 hover:bg-yellow-700'
                              }`}
                            >
                              Cleanup
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Show All link when there are more than 2 snapshots */}
                  {snapshots[group.id].length > 2 && !expandedSnapshots.has(group.id) && (
                    <div className="text-center pt-2">
                      <button
                        onClick={() => setExpandedSnapshots(prev => new Set(prev).add(group.id))}
                        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
                      >
                        Show All ({snapshots[group.id].length} snapshots)
                      </button>
                    </div>
                  )}

                  {/* Show Less link when expanded */}
                  {snapshots[group.id].length > 2 && expandedSnapshots.has(group.id) && (
                    <div className="text-center pt-2">
                      <button
                        onClick={() => setExpandedSnapshots(prev => {
                          const newSet = new Set(prev);
                          newSet.delete(group.id);
                          return newSet;
                        })}
                        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
                      >
                        Show Less
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>

      {groups.length === 0 && connectionStatus === 'connected' && (
        <div className="text-center py-12">
          <Database className="w-16 h-16 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">
            No groups yet
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
            Create your first database group to start managing snapshots
          </p>
          <button
            onClick={() => setIsCreatingGroup(true)}
            className="btn-primary"
          >
            Create Your First Group
          </button>
        </div>
      )}

      {groups.length === 0 && connectionStatus === 'error' && (
        <div className="text-center py-12">
          <WifiOff className="w-16 h-16 text-red-300 dark:text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">
            Connection unavailable
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
            Restore your connection to your server to view and manage groups
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

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={hideConfirmation}
        onConfirm={handleConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
        hideCancelButton={confirmModal.hideCancelButton}
        dismissOnEnter={confirmModal.dismissOnEnter}
      />

      {/* Input Modal */}
      <InputModal
        isOpen={inputModal.isOpen}
        onClose={hideInputModal}
        onSubmit={handleSubmit}
        title={inputModal.title}
        label={inputModal.label}
        placeholder={inputModal.placeholder}
        submitText={inputModal.submitText}
        cancelText={inputModal.cancelText}
        initialValue={inputModal.initialValue}
        required={inputModal.required}
      />

      {/* Verification Modal */}
      {showVerificationModal && verificationResults && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-title"
        >
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 id="verification-title" className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Snapshot Issues Found
            </h3>

            <div className="space-y-4">
              {/* Issues Summary */}
              {verificationResults.data?.issues && verificationResults.data.issues.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Issues Detected
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                    {verificationResults.data.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Show message if no issues but modal is open (shouldn't happen, but handle gracefully) */}
              {(!verificationResults.data?.issues || verificationResults.data.issues.length === 0) &&
               (!verificationResults.data?.orphanedInSQL || verificationResults.data.orphanedInSQL.length === 0) &&
               (!verificationResults.data?.missingInSQL || verificationResults.data.missingInSQL.length === 0) && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    No issues detected. All snapshots are consistent.
                  </p>
                </div>
              )}

              {/* Detailed Issues */}
              {verificationResults.data?.orphanedInSQL && verificationResults.data.orphanedInSQL.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                    External Snapshots ({verificationResults.data.orphanedInSQL.length})
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    These snapshots were not created by SQL Parrot. To remove them manually, run:
                  </p>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 font-mono text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                    {verificationResults.data.orphanedInSQL.map((name, idx) => (
                      <div key={idx}>DROP DATABASE [{name}];</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const sql = verificationResults.data.orphanedInSQL
                        .map(name => `DROP DATABASE [${name}];`)
                        .join('\n');
                      navigator.clipboard.writeText(sql);
                      showSuccess('SQL copied to clipboard');
                    }}
                    className="mt-2 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 underline"
                  >
                    Copy to clipboard
                  </button>
                </div>
              )}

              {verificationResults.data?.missingInSQL && verificationResults.data.missingInSQL.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                  <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                    Missing Snapshots ({verificationResults.data.missingInSQL.length})
                  </h4>
                  <div className="text-sm text-orange-700 dark:text-orange-300">
                    {verificationResults.data.missingInSQL.slice(0, 5).join(', ')}
                    {verificationResults.data.missingInSQL.length > 5 && ` and ${verificationResults.data.missingInSQL.length - 5} more...`}
                  </div>
                </div>
              )}

              {verificationResults.data?.inaccessibleSnapshots && verificationResults.data.inaccessibleSnapshots.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-2">
                    Inaccessible Snapshots ({verificationResults.data.inaccessibleSnapshots.length}):
                  </h4>
                  <div className="text-sm text-purple-700 dark:text-purple-300">
                    {verificationResults.data.inaccessibleSnapshots.slice(0, 5).join(', ')}
                    {verificationResults.data.inaccessibleSnapshots.length > 5 && ` and ${verificationResults.data.inaccessibleSnapshots.length - 5} more...`}
                  </div>
                </div>
              )}

              {/* Cleanup Options - only show if there's something we can actually clean */}
              {(verificationResults.data?.inaccessibleSnapshots?.length > 0 || verificationResults.data?.missingInSQL?.length > 0) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-3">
                    Available Cleanup Actions
                  </h4>
                  <div className="flex flex-col gap-3">
                    {verificationResults.data?.inaccessibleSnapshots?.length > 0 && (
                      <LoadingButton
                        onClick={() => runCleanupAction('orphaned')}
                        className="btn-primary w-full flex items-center justify-center space-x-2"
                        loading={isVerifying}
                        loadingText="Cleaning..."
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Clean Inaccessible Snapshots</span>
                      </LoadingButton>
                    )}

                    {verificationResults.data?.missingInSQL?.length > 0 && (
                      <LoadingButton
                        onClick={() => runCleanupAction('json')}
                        className="btn-secondary w-full flex items-center justify-center space-x-2"
                        loading={isVerifying}
                        loadingText="Cleaning..."
                      >
                        <Database className="w-4 h-4" />
                        <span>Clean Stale Metadata</span>
                      </LoadingButton>
                    )}
                  </div>
                </div>
              )}

              {/* Cleanup Results */}
              {verificationResults.cleanupResults && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                    Cleanup Results
                  </h4>
                  <div className="space-y-2 text-sm text-green-700 dark:text-green-300">
                    {Object.entries(verificationResults.cleanupResults).map(([action, result]) => (
                      <div key={action}>
                        <strong>{getActionDisplayName(action)}:</strong> {getVerificationSuccessMessage(action, result.data)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowVerificationModal(false);
                  setVerificationResults(null);
                }}
                className="btn-primary"
                disabled={isVerifying}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal - opens in-place when connection fails */}
      <ProfileManagementModal
        isOpen={isEditingProfile}
        onClose={() => {
          setIsEditingProfile(false);
          setEditingProfileData(null);
        }}
        onSave={handleProfileEditSave}
        editingProfile={editingProfileData}
      />
    </div>
  );
};

GroupsManager.propTypes = {
  onNavigateSettings: PropTypes.func,
  onGroupsChanged: PropTypes.func
};

export default GroupsManager;
