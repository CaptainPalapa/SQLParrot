import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Camera, RotateCcw, Database } from 'lucide-react';
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
  const [unmanagedSnapshotCount, setUnmanagedSnapshotCount] = useState(0);

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
    fetchUnmanagedSnapshots();
  }, []);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/groups');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      showError('Failed to load groups. Please try again.');
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [showError]);

  const fetchUnmanagedSnapshots = useCallback(async () => {
    try {
      // Add cache-busting parameter to ensure fresh data
      const response = await fetch(`/api/snapshots/unmanaged?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Unmanaged snapshots data:', data);
      setUnmanagedSnapshotCount(data.unmanagedCount || 0);
    } catch (error) {
      console.error('Error fetching unmanaged snapshots:', error);
      // Don't show error to user for this background operation
    }
  }, []);

  const fetchSnapshots = async (groupId) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/snapshots`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSnapshots(prev => ({ ...prev, [groupId]: data }));
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      showError('Failed to load snapshots. Please try again.');
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

    // Check for overlapping databases
    const overlappingDatabases = [];
    groups.forEach(group => {
      group.databases.forEach(dbName => {
        if (selectedDatabases.includes(dbName)) {
          overlappingDatabases.push({ database: dbName, group: group.name });
        }
      });
    });

    if (overlappingDatabases.length > 0) {
      const overlappingList = overlappingDatabases
        .map(item => `${item.database} (in "${item.group}")`)
        .join(', ');
      showError(`Cannot create group: The following databases are already in use: ${overlappingList}`);
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await fetchGroups();
      groupForm.reset();
      setSelectedDatabases([]);
      setIsCreatingGroup(false);
      showSuccess('Group created successfully!');
    } catch (error) {
      console.error('Error creating group:', error);
      showError('Failed to create group. Please try again.');
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

    // Check for overlapping databases (excluding current group)
    const overlappingDatabases = [];
    groups.forEach(group => {
      if (group.id === editingGroup.id) return; // Skip current group
      group.databases.forEach(dbName => {
        if (selectedDatabases.includes(dbName)) {
          overlappingDatabases.push({ database: dbName, group: group.name });
        }
      });
    });

    if (overlappingDatabases.length > 0) {
      const overlappingList = overlappingDatabases
        .map(item => `${item.database} (in "${item.group}")`)
        .join(', ');
      showError(`Cannot update group: The following databases are already in use: ${overlappingList}`);
      return;
    }

    // Check if changes were made
    const nameChanged = originalGroupData.name !== groupForm.values.name;
    const databasesChanged = JSON.stringify(originalGroupData.databases.sort()) !== JSON.stringify(selectedDatabases.sort());
    const hasChanges = nameChanged || databasesChanged;

    if (!hasChanges) {
      // No changes made, just close the modal
      setEditingGroup(null);
      groupForm.reset();
      setSelectedDatabases([]);
      setOriginalGroupData(null);
      return;
    }

    // Check if snapshots exist and need confirmation
    const groupSnapshots = snapshots[editingGroup.id] || [];
    if (groupSnapshots.length > 0) {
      const totalSnapshots = groupSnapshots.length * originalGroupData.databases.length;
      showConfirmation({
        title: 'Confirm Group Modification',
        message: `Modifying this group will delete all ${groupSnapshots.length} snapshots for ${originalGroupData.databases.length} databases (${totalSnapshots} total snapshots). This action cannot be undone.`,
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

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.requiresConfirmation) {
          showError('Group modifications require snapshot deletion confirmation.');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await fetchGroups();
      await fetchUnmanagedSnapshots();
      groupForm.reset();
      setSelectedDatabases([]);
      setEditingGroup(null);
      setOriginalGroupData(null);
      showSuccess('Group updated successfully!');
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

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          await fetchGroups();
          showSuccess('Group deleted successfully!');
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
    setIsLoading(true);
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        await fetchSnapshots(groupId);
        showSuccess(`Snapshot "${data.snapshot.displayName}" created successfully!`);
      } else {
        showError('Failed to create snapshot. Please try again.');
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      showError('Failed to create snapshot. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanupSnapshots = async () => {
    showConfirmation({
      title: 'Clean Up Orphaned Snapshots',
      message: 'This will drop all orphaned snapshot databases from SQL Server (databases that exist but have missing files). This action cannot be undone.',
      confirmText: 'Clean Up',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/snapshots/cleanup-orphaned', {
            method: 'POST'
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          await fetchUnmanagedSnapshots();
          showSuccess(`Cleaned up ${data.deletedCount} orphaned snapshots!`);
        } catch (error) {
          console.error('Error cleaning up snapshots:', error);
          showError('Failed to clean up snapshots. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    });
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
              {unmanagedSnapshotCount > 0 && (
                <LoadingButton
                  onClick={handleCleanupSnapshots}
                  className="btn-warning flex items-center space-x-2"
                  aria-label="Clean up existing snapshots"
                  loading={isLoading}
                  loadingText="Cleaning..."
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>Clean Up ({unmanagedSnapshotCount})</span>
                </LoadingButton>
              )}
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
                loading={isLoading}
                loadingText="Creating..."
              >
                <Camera className="w-4 h-4" />
                <span>Create Snapshot</span>
              </LoadingButton>

              <LoadingButton
                onClick={() => fetchSnapshots(group.id)}
                className="w-full btn-secondary flex items-center justify-center space-x-2"
                loading={isLoading}
                loadingText="Refreshing..."
              >
                <RotateCcw className="w-4 h-4" />
                <span>Refresh Snapshots</span>
              </LoadingButton>
            </div>

            {/* Snapshots List */}
            {snapshots[group.id] && snapshots[group.id].length > 0 && (
              <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Snapshots ({snapshots[group.id].length})
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {snapshots[group.id].map((snapshot, index) => {
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
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-secondary-500 dark:text-secondary-400">
                            <span className="font-mono">
                              {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            <span>•</span>
                            <span>{timeAgo}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

      {/* Footer with unmanaged snapshot count */}
      {unmanagedSnapshotCount > 0 && (
        <div className="fixed bottom-4 right-4 bg-orange-100 dark:bg-orange-900 border border-orange-300 dark:border-orange-700 rounded-lg px-3 py-2 text-sm text-orange-800 dark:text-orange-200">
          {unmanagedSnapshotCount} Unmanaged Snapshots
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default GroupsManager;
