import React, { useState } from 'react';
import { Lock, AlertTriangle, X } from 'lucide-react';
import FormInput from './ui/FormInput';
import FormCheckbox from './ui/FormCheckbox';
import { usePassword } from '../contexts/PasswordContext';

const PasswordSetup = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setPassword: setPasswordAction, skipPassword } = usePassword();

  const validatePassword = () => {
    if (!password) {
      setError('Password is required');
      return false;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return false;
    }

    if (!understood) {
      setError('Please confirm that you understand the password recovery implications');
      return false;
    }

    return true;
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!validatePassword()) {
      return;
    }

    setIsLoading(true);
    const result = await setPasswordAction(password, confirm);
    setIsLoading(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Failed to set password');
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    const result = await skipPassword();
    setIsLoading(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Failed to skip password');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
              <Lock className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
              Password Protection
            </h2>
            <p className="text-secondary-600 dark:text-secondary-400">
              Protect SQL Parrot with a password (optional)
            </p>
          </div>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <FormInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter password (minimum 6 characters)"
              required
              disabled={isLoading}
            />

            <FormInput
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Confirm password"
              required
              disabled={isLoading}
            />

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                    Important: Password Recovery
                  </h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    If you forget your password, you will need to reset your SQL Parrot configuration.
                    This will delete all database connection profiles, groups, snapshot metadata,
                    operation history, and application settings.
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-2">
                    <strong>Please remember your password or store it securely.</strong>
                  </p>
                </div>
              </div>
            </div>

            <FormCheckbox
              label="I understand that I must remember this password or risk losing all configuration data"
              checked={understood}
              onChange={setUnderstood}
              disabled={isLoading}
            />

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <X className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoading}
                className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={isLoading || !password || !confirm || !understood}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Setting...' : 'Set Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PasswordSetup;

