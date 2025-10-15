import { useState, useCallback } from 'react';

export const useNotification = () => {
  const [notification, setNotification] = useState({
    isVisible: false,
    message: '',
    type: 'info'
  });

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({
      isVisible: true,
      message,
      type
    });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isVisible: false }));
  }, []);

  const showSuccess = useCallback((message) => {
    showNotification(message, 'success');
  }, [showNotification]);

  const showError = useCallback((message) => {
    showNotification(message, 'error');
  }, [showNotification]);

  const showWarning = useCallback((message) => {
    showNotification(message, 'warning');
  }, [showNotification]);

  return {
    notification,
    showNotification,
    hideNotification,
    showSuccess,
    showError,
    showWarning
  };
};
