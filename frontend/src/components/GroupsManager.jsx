import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Camera, RotateCcw, Database } from 'lucide-react';

const GroupsManager = () => {
  const [groups, setGroups] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({ name: '', databases: [] });
  const [snapshots, setSnapshots] = useState({});

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/groups');
      const data = await response.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchSnapshots = async (groupId) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/snapshots`);
      const data = await response.json();
      setSnapshots(prev => ({ ...prev, [groupId]: data }));
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup)
      });

      if (response.ok) {
        await fetchGroups();
        setNewGroup({ name: '', databases: [] });
        setIsCreatingGroup(false);
      }
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        const response = await fetch(`/api/groups/${groupId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          await fetchGroups();
        }
      } catch (error) {
        console.error('Error deleting group:', error);
      }
    }
  };

  const handleCreateSnapshot = async (groupId, snapshotName) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotName })
      });

      if (response.ok) {
        await fetchSnapshots(groupId);
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
    }
  };

  return (
    <div className="space-y-6">
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
        <button
          onClick={() => setIsCreatingGroup(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Group</span>
        </button>
      </div>

      {/* Create Group Modal */}
      {isCreatingGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
              Create New Group
            </h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="input"
                  placeholder="Enter group name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Databases (comma-separated)
                </label>
                <textarea
                  value={newGroup.databases.join(', ')}
                  onChange={(e) => setNewGroup({
                    ...newGroup,
                    databases: e.target.value.split(',').map(db => db.trim()).filter(db => db)
                  })}
                  className="input"
                  placeholder="database1, database2, database3"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3">
                <button type="submit" className="btn-primary flex-1">
                  Create Group
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingGroup(false)}
                  className="btn-secondary flex-1"
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
                  onClick={() => setEditingGroup(group)}
                  className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4 text-secondary-600 dark:text-secondary-400" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
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
              <button
                onClick={() => {
                  const snapshotName = prompt('Enter snapshot name:');
                  if (snapshotName) {
                    handleCreateSnapshot(group.id, snapshotName);
                  }
                }}
                className="w-full btn-primary flex items-center justify-center space-x-2"
              >
                <Camera className="w-4 h-4" />
                <span>Create Snapshot</span>
              </button>

              <button
                onClick={() => fetchSnapshots(group.id)}
                className="w-full btn-secondary flex items-center justify-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Refresh Snapshots</span>
              </button>
            </div>

            {/* Snapshots List */}
            {snapshots[group.id] && (
              <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
                <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Snapshots ({snapshots[group.id].length})
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {snapshots[group.id].map((snapshot, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-secondary-50 dark:bg-secondary-700 rounded"
                    >
                      <div>
                        <div className="text-sm font-medium text-secondary-900 dark:text-white">
                          {snapshot.name}
                        </div>
                        <div className="text-xs text-secondary-500 dark:text-secondary-400">
                          {new Date(snapshot.create_date).toLocaleDateString()} • {snapshot.size_mb}MB
                        </div>
                      </div>
                    </div>
                  ))}
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
    </div>
  );
};

export default GroupsManager;
