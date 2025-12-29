import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import FormInput from './ui/FormInput';
import { usePassword } from '../contexts/PasswordContext';

const PasswordGate = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { checkPassword } = usePassword();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLoading(true);
    const result = await checkPassword(password);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Invalid password');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
              <Lock className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
              SQL Parrot
            </h1>
            <p className="text-secondary-600 dark:text-secondary-400">
              Enter your password to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              error={error}
              touched={!!error}
              placeholder="Enter password"
              required
              disabled={isLoading}
              autoFocus
            />

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PasswordGate;

