import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Server, Check, Database } from 'lucide-react';
import { api } from '../api/client';

/**
 * ProfileSelector - Header dropdown for switching between connection profiles
 * Only shows when there are 2+ profiles
 * Displays group count [n] next to each profile name
 */
const ProfileSelector = forwardRef(({ onProfileChange }, ref) => {
  const [profiles, setProfiles] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef(null);

  // Expose refresh method to parent
  useImperativeHandle(ref, () => ({
    refresh: fetchProfiles
  }));

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const response = await api.getProfiles();
      if (response.success) {
        setProfiles(response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetActive = async (profileId) => {
    try {
      const response = await api.setActiveProfile(profileId);
      if (response.success) {
        // Refresh profiles to get updated active state
        await fetchProfiles();
        setIsOpen(false);
        // Notify parent component to refresh data
        if (onProfileChange) {
          onProfileChange(profileId);
        }
      }
    } catch (error) {
      console.error('Failed to set active profile:', error);
    }
  };

  // Don't render if loading, no profiles, or only 1 profile
  if (isLoading || profiles.length <= 1) {
    return null;
  }

  const activeProfile = profiles.find(p => p.isActive);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
        title="Switch Profile"
      >
        <Server className="w-4 h-4 text-secondary-600 dark:text-secondary-400" />
        <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300 max-w-[120px] truncate">
          {activeProfile?.name || 'Select Profile'}
        </span>
        {activeProfile?.groupCount > 0 && (
          <span className="text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded-full font-medium">
            {activeProfile.groupCount}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-secondary-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-secondary-800 rounded-lg shadow-xl border border-secondary-200 dark:border-secondary-700 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-secondary-200 dark:border-secondary-700">
            <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
              Connection Profiles
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleSetActive(profile.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors ${
                  profile.isActive ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <Server className={`w-4 h-4 flex-shrink-0 ${
                    profile.isActive ? 'text-primary-600 dark:text-primary-400' : 'text-secondary-400'
                  }`} />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-medium truncate ${
                        profile.isActive
                          ? 'text-primary-700 dark:text-primary-300'
                          : 'text-secondary-700 dark:text-secondary-300'
                      }`}>
                        {profile.name}
                      </span>
                      {profile.groupCount > 0 && (
                        <span className={`flex items-center space-x-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          profile.isActive
                            ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200'
                            : 'bg-secondary-100 dark:bg-secondary-600 text-secondary-600 dark:text-secondary-300'
                        }`}>
                          <Database className="w-3 h-3" />
                          <span>{profile.groupCount}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary-500 dark:text-secondary-400 truncate">
                      {profile.host}:{profile.port}
                    </p>
                  </div>
                </div>
                {profile.isActive && (
                  <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 ml-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ProfileSelector.displayName = 'ProfileSelector';

ProfileSelector.propTypes = {
  onProfileChange: PropTypes.func,
};

export default ProfileSelector;

