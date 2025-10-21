import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ApiStatusContext = createContext();

export const useApiStatus = () => {
  const context = useContext(ApiStatusContext);
  if (!context) {
    throw new Error('useApiStatus must be used within an ApiStatusProvider');
  }
  return context;
};

export const ApiStatusProvider = ({ children }) => {
  const [n8nStatus, setN8nStatus] = useState({
    status: 'checking',
    message: 'Checking N8N API status...',
    timestamp: null,
    configured: false,
    reachable: false
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkN8nStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/health/n8n');
      const data = await response.json();
      setN8nStatus(data);
    } catch (error) {
      setN8nStatus({
        status: 'error',
        message: `Failed to check N8N API: ${error.message}`,
        timestamp: new Date().toISOString(),
        configured: false,
        reachable: false
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check status on mount and every 30 seconds
  useEffect(() => {
    checkN8nStatus();
    const interval = setInterval(checkN8nStatus, 30000);
    return () => clearInterval(interval);
  }, [checkN8nStatus]);

  const value = {
    n8nStatus,
    isChecking,
    checkN8nStatus
  };

  return (
    <ApiStatusContext.Provider value={value}>
      {children}
    </ApiStatusContext.Provider>
  );
};
