import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CheckCircle, Server, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { useNotification } from '../hooks/useNotification';
import ProfileManagementModal from './ProfileManagementModal';
import { Toast } from './ui/Modal';

const ProfilesPanel = () => {
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const { notification, showSuccess, showError, hideNotification } = useNotification();

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const response = await api.getProfiles();
      if (response.success) {
        setProfiles(response.data || []);
      } else {
        showError('Failed to load profiles');
      }
    } catch (error) {
      showError('Failed to load profiles: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProfile = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEditProfile = (profile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleDeleteProfile = async (profileId) => {
    if (!window.confirm('Are you sure you want to delete this profile? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await api.deleteProfile(profileId);
      if (response.success) {
        showSuccess('Profile deleted successfully');
        await fetchProfiles();
      } else {
        showError(response.messages?.error?.[0] || 'Failed to delete profile');
      }
    } catch (error) {
      showError('Failed to delete profile: ' + error.message);
    }
  };

  const handleSetActive = async (profileId) => {
    try {
      const response = await api.setActiveProfile(profileId);
      if (response.success) {
        showSuccess('Active profile updated');
        await fetchProfiles();
      } else {
        showError(response.messages?.error?.[0] || 'Failed to set active profile');
      }
    } catch (error) {
      showError('Failed to set active profile: ' + error.message);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingProfile(null);
  };

  const handleModalSave = async () => {
    await fetchProfiles();
    setIsModalOpen(false);
    setEditingProfile(null);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Connection Profiles
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400">
            Manage database connection profiles
          </p>
        </div>
        <button
          onClick={handleAddProfile}
          className="btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Profile</span>
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="w-16 h-16 text-secondary-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">
            No Profiles
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
            Get started by creating your first connection profile.
          </p>
          <button
            onClick={handleAddProfile}
            className="btn-primary"
          >
            Add Profile
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={`card p-6 ${profile.isActive ? 'ring-2 ring-primary-500' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                      {profile.name}
                    </h3>
                    {profile.isActive && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-secondary-500 dark:text-secondary-400">Platform:</span>
                      <p className="font-medium text-secondary-900 dark:text-white">
                        {profile.platformType}
                      </p>
                    </div>
                    <div>
                      <span className="text-secondary-500 dark:text-secondary-400">Host:</span>
                      <p className="font-medium text-secondary-900 dark:text-white">
                        {profile.host}:{profile.port}
                      </p>
                    </div>
                    <div>
                      <span className="text-secondary-500 dark:text-secondary-400">Username:</span>
                      <p className="font-medium text-secondary-900 dark:text-white">
                        {profile.username}
                      </p>
                    </div>
                    <div>
                      <span className="text-secondary-500 dark:text-secondary-400">Snapshot Path:</span>
                      <p className="font-medium text-secondary-900 dark:text-white font-mono text-xs">
                        {profile.snapshotPath}
                      </p>
                    </div>
                  </div>

                  {profile.description && (
                    <div className="mt-3">
                      <span className="text-secondary-500 dark:text-secondary-400 text-sm">Description:</span>
                      <p className="text-secondary-700 dark:text-secondary-300 text-sm mt-1">
                        {profile.description}
                      </p>
                    </div>
                  )}

                  {profile.notes && (
                    <div className="mt-2">
                      <span className="text-secondary-500 dark:text-secondary-400 text-sm">Notes:</span>
                      <p className="text-secondary-700 dark:text-secondary-300 text-sm mt-1 whitespace-pre-wrap">
                        {profile.notes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {!profile.isActive && (
                    <button
                      onClick={() => handleSetActive(profile.id)}
                      className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                      title="Set as Active"
                    >
                      <CheckCircle className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEditProfile(profile)}
                    className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
                    title="Edit Profile"
                  >
                    <Edit className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                    title="Delete Profile"
                  >
                    <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileManagementModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        editingProfile={editingProfile}
      />

      <Toast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default ProfilesPanel;

