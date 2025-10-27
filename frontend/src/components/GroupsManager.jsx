import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit, Trash2, Camera, RotateCcw, Database, Shield } from 'lucide-react';
import { Toast, ConfirmationModal, InputModal } from './ui/Modal';
import FormInput from './ui/FormInput';
import DatabaseSelector from './DatabaseSelector';
import { LoadingButton, LoadingPage } from './ui/Loading';
import { useNotification } from '../hooks/useNotification';
import { useConfirmationModal, useInputModal } from '../hooks/useModal';
import { useFormValidation, validators } from '../utils/validation';

const GroupsManager = () => {
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

  // Separate loading states for different operations
  const [operationLoading, setOperationLoading] = useState({
    delete: false,
    rollback: false,
    createSnapshot: false
  });

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

  useEffect(() => {
    fetchGroups();
    fetchSettings();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Component cleanup
    };
  }, []);

  // Refresh snapshots when groups change (new group created)
  useEffect(() => {
    if (groups.length > 0) {
      groups.forEach(group => {
        fetchSnapshots(group.id, true);
      });
    }
  }, [groups]);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/groups');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();

      // Handle both old and new response formats
      const groups = responseData.data?.groups || responseData.groups || [];
      setGroups(groups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      showError('Failed to load groups. Please try again.');
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [showError]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSettings(data);
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
      const response = await fetch(`/api/groups/${groupId}/snapshots`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Extract snapshots from standardized response format
      const snapshots = data.data;

      setSnapshots(prev => ({ ...prev, [groupId]: snapshots }));

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

      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup)
      });

      const responseData = await response.json();

      // Handle structured API response
      if (responseData.success) {
        showSuccess(responseData.messages.success?.[0] || 'Group created successfully!');
        await fetchGroups();
        groupForm.reset();
        setSelectedDatabases([]);
        setIsCreatingGroup(false);
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

      const response = await fetch(`/api/groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGroup)
      });

      const responseData = await response.json();

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
    showConfirmation({
      title: 'Delete Group',
      message: `Are you sure you want to delete the group "${group?.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/groups/${groupId}`, {
            method: 'DELETE'
          });

          const responseData = await response.json();

          // Handle structured API response
          if (responseData.success) {
            showSuccess(responseData.messages.success?.[0] || 'Group deleted successfully!');
            await fetchGroups();
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
      const response = await fetch(`/api/groups/${groupId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotName })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error && errorData.error.includes('Maximum of 9 snapshots')) {
          showError(errorData.error);
          return;
        }
        // Show specific error message from server
        showError(errorData.error || `HTTP error! status: ${response.status}`);
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Extract snapshot from standardized response format
        const snapshot = data.data.snapshot;
        await fetchSnapshots(groupId, false, true);
        showSuccess(`Snapshot "${snapshot.displayName}" created successfully!`);
      } else {
        // Show specific error message from server response
        const errorMessage = data.error || data.message || 'Failed to create snapshot. Please try again.';
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
          <p>This will permanently remove this snapshot and associated database entries and files. This action cannot be undone.</p>
        </div>
      ),
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setOperationLoading(prev => ({ ...prev, delete: true }));
        try {
          const response = await fetch(`/api/snapshots/${snapshot.id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

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
        }
      }
    });
  };

  // Helper function to format time ago
  const getTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  const handleRollbackSnapshot = async (snapshot) => {
    const group = groups.find(g => g.id === snapshot.groupId);
    const createdDate = new Date(snapshot.createdAt);
    const timeAgo = getTimeAgo(createdDate);

    showConfirmation({
      title: 'Rollback to Snapshot',
      message: (
        <div>
          <p>Are you sure you want to rollback all databases in group "{group?.name || 'Unknown'}" to snapshot</p>
          <p className="font-bold text-lg text-center my-2">"{snapshot.displayName}"</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            This snapshot was created {timeAgo} ({createdDate.toLocaleDateString()} at {createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}).
          </p>
          <p className="mb-3">This will restore all databases to their state at the time this snapshot was created. This action cannot be undone.</p>
          <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
            Restoring this snapshot will immediately invalidate all remaining snapshots in this group, and their associated files will need to be cleaned up.
          </p>
        </div>
      ),
      confirmText: 'Rollback',
      cancelText: 'Cancel',
      type: 'success',
      onConfirm: async () => {
        setOperationLoading(prev => ({ ...prev, rollback: true }));
        try {
          const response = await fetch(`/api/snapshots/${snapshot.id}/rollback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          // Handle structured API response
          if (data.success) {
            showSuccess(data.message || `Successfully rolled back to snapshot "${snapshot.displayName}"!`);
            await fetchSnapshots(snapshot.groupId, false, true);
          } else {
            showError(data.message || 'Failed to rollback snapshot. Please try again.');
          }
        } catch (error) {
          console.error('Error rolling back snapshot:', error);
          showError('Failed to rollback snapshot. Please try again.');
        } finally {
          setOperationLoading(prev => ({ ...prev, rollback: false }));
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
        setIsLoading(true);
        try {
          const response = await fetch(`/api/snapshots/${snapshot.id}/cleanup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

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
          setIsLoading(false);
        }
      }
    });
  };

  // Verification functions
  const runVerification = async () => {
    setIsVerifying(true);
    setVerificationResults(null);

    try {
      // First run consistency check to see if there are any issues
      const response = await fetch('/api/snapshots/verify', { method: 'POST' });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.verified) {
        // Everything is consistent, show success
        showSuccess('All snapshots are consistent with our data.');
        setVerificationResults({
          type: 'consistency',
          endpoint: '/api/snapshots/verify',
          data,
          timestamp: new Date().toISOString()
        });
      } else {
        // Issues found, show dialog with cleanup options
        setVerificationResults({
          type: 'consistency',
          endpoint: '/api/snapshots/verify',
          data,
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
      let method = 'POST';

      switch (actionType) {
        case 'orphaned':
          endpoint = '/api/snapshots/cleanup-orphaned';
          break;
        case 'json':
          endpoint = '/api/snapshots/cleanup-metadata';
          break;
        case 'files':
          endpoint = '/api/snapshots/files-to-cleanup';
          method = 'GET';
          break;
        default:
          throw new Error('Unknown cleanup action');
      }

      const response = await fetch(endpoint, { method });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

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
      {isInitialLoading ? (
        <LoadingPage message="Loading database groups..." />
      ) : (
        <>
          {/* Header */}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                  aria-label={`Edit group ${group.name}`}
                >
                  <Edit className="w-4 h-4 text-secondary-600 dark:text-secondary-400" aria-hidden="true" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
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
                  >
                    <Camera className="w-4 h-4" />
                    <span>Create Snapshot</span>
                  </LoadingButton>

                  <LoadingButton
                    onClick={() => fetchSnapshots(group.id, true)}
                    className="w-full btn-secondary flex items-center justify-center space-x-2"
                    loading={refreshingGroups.has(group.id)}
                    loadingText="Refreshing..."
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Refresh Snapshots</span>
                  </LoadingButton>
                </>
              )}
            </div>

            {/* Snapshots List */}
            {snapshots[group.id] && snapshots[group.id].length > 0 && (
              <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Snapshots ({snapshots[group.id].length})
                </h4>
                <div className="space-y-2">
                  {(expandedSnapshots.has(group.id) ? snapshots[group.id] : snapshots[group.id].slice(0, 2)).map((snapshot, index) => {
                    const createdDate = new Date(snapshot.createdAt);
                    const now = new Date();
                    const diffMs = now - createdDate;
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);

                    let timeAgo = '';
                    if (diffMins < 1) {
                      timeAgo = 'just now';
                    } else if (diffMins < 60) {
                      timeAgo = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
                    } else if (diffHours < 24) {
                      timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                    } else if (diffDays === 1) {
                      timeAgo = 'yesterday';
                    } else if (diffDays < 7) {
                      timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                    } else {
                      timeAgo = `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
                    }

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
                            <span className="text-xs text-secondary-500 dark:text-secondary-400">
                              [{snapshot.databaseCount}]
                            </span>
                            {/* Hash code display */}
                            <span className="text-xs font-mono text-secondary-400 dark:text-secondary-500 opacity-70" title="Snapshot hash">
                              {snapshot.id.split('_').pop()}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-secondary-500 dark:text-secondary-400">
                            <span className="font-mono">
                              {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            <span>•</span>
                            <span>{timeAgo}</span>
                          </div>
                        </div>

                        {/* Action buttons based on snapshot success status */}
                        <div className="flex items-center space-x-2">
                          {snapshot.databaseSnapshots.some(db => db.success) ? (
                            // Snapshot has at least one successful database - show Delete and Rollback buttons
                            <>
                              <button
                                onClick={() => handleDeleteSnapshot(snapshot)}
                                className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => handleRollbackSnapshot(snapshot)}
                                className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                              >
                                Rollback
                              </button>
                            </>
                          ) : (
                            // No successful databases - show cleanup option
                            <button
                              onClick={() => handleCleanupSnapshot(snapshot)}
                              className="px-3 py-1 text-xs font-medium text-white bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
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

      {groups.length === 0 && (
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
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  Issues Detected
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                  {verificationResults.data?.issues?.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </div>

              {/* Detailed Issues */}
              {verificationResults.data?.orphanedInSQL && verificationResults.data.orphanedInSQL.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                    Orphaned Snapshots ({verificationResults.data.orphanedInSQL.length})
                  </h4>
                  <div className="text-sm text-red-700 dark:text-red-300">
                    {verificationResults.data.orphanedInSQL.slice(0, 5).join(', ')}
                    {verificationResults.data.orphanedInSQL.length > 5 && ` and ${verificationResults.data.orphanedInSQL.length - 5} more...`}
                  </div>
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

              {/* Cleanup Options */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-3">
                  Available Cleanup Actions
                </h4>
                <div className="flex flex-col gap-3">
                  {(verificationResults.data?.orphanedInSQL?.length > 0 || verificationResults.data?.inaccessibleSnapshots?.length > 0) && (
                    <LoadingButton
                      onClick={() => runCleanupAction('orphaned')}
                      className="btn-primary w-full flex items-center justify-center space-x-2"
                      loading={isVerifying}
                      loadingText="Cleaning..."
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clean Orphaned Snapshots</span>
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
                      <span>Clean Stale Data</span>
                    </LoadingButton>
                  )}
                </div>
              </div>

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

      {/* Footer */}
        </>
      )}
    </div>
  );
};

export default GroupsManager;
