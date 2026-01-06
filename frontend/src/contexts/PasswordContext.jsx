import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const PasswordContext = createContext();

export const usePassword = () => {
  const context = useContext(PasswordContext);
  if (!context) {
    throw new Error('usePassword must be used within PasswordProvider');
  }
  return context;
};

export const PasswordProvider = ({ children }) => {
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check password status on mount
  useEffect(() => {
    checkPasswordStatus();
  }, []);

  const checkPasswordStatus = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/auth/password-status');

      if (response.success) {
        setPasswordStatus(response.data);

        // If password is skipped or not set, user is authenticated
        if (response.data.status === 'skipped' || response.data.status === 'not-set') {
          setIsAuthenticated(true);
          // Clear any stale session token when password is not set/skipped
          sessionStorage.removeItem('sessionToken');
        } else if (response.data.status === 'set') {
          // Password is set - check if we have a valid session token
          const sessionToken = sessionStorage.getItem('sessionToken');
          if (sessionToken) {
            // Validate token by making a lightweight API call that requires auth
            // This ensures the token is still valid (e.g., backend didn't restart)
            const validationResponse = await api.get('/api/settings');
            if (validationResponse.requiresAuth || !validationResponse.success) {
              // Token is invalid (401 or other error) - clear it and require re-auth
              sessionStorage.removeItem('sessionToken');
              setIsAuthenticated(false);
            } else {
              // Token is valid - user is authenticated
              setIsAuthenticated(true);
            }
          } else {
            // No token - user needs to authenticate
            setIsAuthenticated(false);
          }
        }
      } else {
        setPasswordStatus({ status: 'not-set', passwordSet: false, passwordSkipped: false });
        setIsAuthenticated(true); // Default to authenticated if check fails
        sessionStorage.removeItem('sessionToken'); // Clear stale token on error
      }
    } catch (error) {
      console.error('Error checking password status:', error);
      setPasswordStatus({ status: 'not-set', passwordSet: false, passwordSkipped: false });
      setIsAuthenticated(true); // Default to authenticated on error
      sessionStorage.removeItem('sessionToken'); // Clear stale token on error
    } finally {
      setIsLoading(false);
    }
  };

  const checkPassword = async (password) => {
    try {
      const response = await api.post('/api/auth/check-password', { password });

      // Handle both formats:
      // - Node.js: { success: true, data: { authenticated: true, sessionToken: "..." } }
      // - Tauri: { success: true, data: true } (just a boolean)
      const isAuthenticated = response.success && (
        response.data?.authenticated === true ||
        response.data === true
      );

      if (isAuthenticated) {
        // Store session token if provided (Node.js only, Tauri doesn't use sessions)
        if (response.data?.sessionToken) {
          sessionStorage.setItem('sessionToken', response.data.sessionToken);
        }
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return {
          success: false,
          error: response.messages?.error?.[0] || 'Invalid password'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Password verification failed'
      };
    }
  };

  const setPassword = async (password, confirm) => {
    try {
      const response = await api.post('/api/auth/set-password', { password, confirm });

      if (response.success) {
        // After setting password, user needs to authenticate
        setIsAuthenticated(false);
        sessionStorage.removeItem('sessionToken');
        await checkPasswordStatus();
        return { success: true };
      } else {
        return {
          success: false,
          error: response.messages?.error?.[0] || 'Failed to set password'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to set password'
      };
    }
  };

  const changePassword = async (currentPassword, newPassword, confirm) => {
    try {
      const response = await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
        confirm
      });

      if (response.success) {
        await checkPasswordStatus();
        return { success: true };
      } else {
        return {
          success: false,
          error: response.messages?.error?.[0] || 'Failed to change password'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to change password'
      };
    }
  };

  const removePassword = async (currentPassword) => {
    try {
      const response = await api.post('/api/auth/remove-password', { currentPassword });

      if (response.success) {
        sessionStorage.removeItem('sessionToken');
        setIsAuthenticated(true);
        await checkPasswordStatus();
        return { success: true };
      } else {
        return {
          success: false,
          error: response.messages?.error?.[0] || 'Failed to remove password'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to remove password'
      };
    }
  };

  const skipPassword = async () => {
    try {
      const response = await api.post('/api/auth/skip-password', {});

      if (response.success) {
        setIsAuthenticated(true);
        await checkPasswordStatus();
        return { success: true };
      } else {
        return {
          success: false,
          error: response.messages?.error?.[0] || 'Failed to skip password'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to skip password'
      };
    }
  };

  const logout = () => {
    sessionStorage.removeItem('sessionToken');
    setIsAuthenticated(false);
  };

  const value = {
    passwordStatus,
    isAuthenticated,
    isLoading,
    checkPassword,
    setPassword,
    changePassword,
    removePassword,
    skipPassword,
    logout,
    refreshStatus: checkPasswordStatus
  };

  return (
    <PasswordContext.Provider value={value}>
      {children}
    </PasswordContext.Provider>
  );
};

