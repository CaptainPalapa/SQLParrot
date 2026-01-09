import React, { useState, useEffect } from 'react';
import { X, Lock, AlertTriangle } from 'lucide-react';
import FormInput from './ui/FormInput';
import { usePassword } from '../contexts/PasswordContext';

const PasswordManagementModal = ({ isOpen, onClose }) => {
  const { passwordStatus, changePassword, removePassword, setPassword, refreshStatus } = usePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeCurrentPassword, setRemoveCurrentPassword] = useState('');

  const passwordSet = passwordStatus?.passwordSet || false;

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRemoveCurrentPassword('');
      setError('');
      setSuccess('');
      setShowConfirm(false);
      setShowRemoveConfirm(false);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    // Show confirm field when new password has content
    setShowConfirm(newPassword.length > 0);
  }, [newPassword]);

  const validatePassword = () => {
    if (!newPassword) {
      setError('Password is required');
      return false;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    if (passwordSet && !currentPassword) {
      setError('Current password is required');
      return false;
    }

    return true;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validatePassword()) {
      return;
    }

    setIsLoading(true);
    let result;
    if (passwordSet) {
      // Change existing password
      result = await changePassword(currentPassword, newPassword, confirmPassword);
    } else {
      // Set initial password
      result = await setPassword(newPassword, confirmPassword);
    }

    setIsLoading(false);

    if (result.success) {
      setSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowConfirm(false);
      await refreshStatus();
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 1500);
    } else {
      setError(result.error || 'Failed to update password');
    }
  };

  const handleRemovePassword = async () => {
    if (!removeCurrentPassword) {
      setError('Current password is required');
      return;
    }

    setIsLoading(true);
    const result = await removePassword(removeCurrentPassword);
    setIsLoading(false);

    if (result.success) {
      setSuccess('Password protection removed');
      setRemoveCurrentPassword('');
      setShowRemoveConfirm(false);
      await refreshStatus();
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 1500);
    } else {
      setError(result.error || 'Failed to remove password');
    }
  };

  const handleCancel = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowConfirm(false);
  };

  const getStatusText = () => {
    if (passwordStatus?.status === 'set') return 'Enabled';
    if (passwordStatus?.status === 'skipped') return 'Disabled';
    return 'Not Configured';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-full">
                <Lock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-secondary-900 dark:text-white">
                  Password Protection
                </h2>
                <p className="text-sm text-secondary-600 dark:text-secondary-400">
                  Status: {getStatusText()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
            </button>
          </div>

          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200 text-sm">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {!showRemoveConfirm ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordSet && (
                <FormInput
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Enter current password"
                  required={passwordSet}
                  disabled={isLoading}
                />
              )}

              <FormInput
                label="New Password"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password (minimum 6 characters)"
                disabled={isLoading}
              />

              {showConfirm && (
                <FormInput
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm new password"
                  disabled={isLoading}
                />
              )}

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Passwords do not match
                </p>
              )}

              {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Password must be at least 6 characters
                </p>
              )}

              {newPassword && confirmPassword &&
               newPassword === confirmPassword &&
               newPassword.length >= 6 &&
               (!passwordSet || currentPassword) && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : passwordSet ? 'Change Password' : 'Set Password'}
                </button>
              )}

              {newPassword && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="w-full btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
              )}

              {passwordSet && (
                <div className="pt-4 border-t border-secondary-200 dark:border-secondary-700">
                  <button
                    type="button"
                    onClick={() => setShowRemoveConfirm(true)}
                    disabled={isLoading}
                    className="w-full btn-danger disabled:opacity-50"
                  >
                    Remove Password Protection
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                      Remove Password Protection?
                    </h3>
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      Removing password protection will allow anyone to access SQL Parrot without authentication.
                    </p>
                  </div>
                </div>
              </div>

              <FormInput
                label="Current Password"
                type="password"
                value={removeCurrentPassword}
                onChange={setRemoveCurrentPassword}
                placeholder="Enter current password to confirm"
                required
                disabled={isLoading}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRemovePassword}
                  disabled={isLoading || !removeCurrentPassword}
                  className="flex-1 btn-danger disabled:opacity-50"
                >
                  {isLoading ? 'Removing...' : 'Remove Protection'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRemoveConfirm(false);
                    setRemoveCurrentPassword('');
                    setError('');
                  }}
                  disabled={isLoading}
                  className="flex-1 btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PasswordManagementModal;

