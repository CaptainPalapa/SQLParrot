import React, { createContext, useContext, useState, useEffect } from 'react';

const ApiStatusContext = createContext();

export const useApiStatus = () => {
  const context = useContext(ApiStatusContext);
  if (!context) {
    throw new Error('useApiStatus must be used within an ApiStatusProvider');
  }
  return context;
};

export const ApiStatusProvider = ({ children }) => {
  const initialStatus = {
    status: 'checking',
    message: 'Checking N8N API status...',
    timestamp: null,
    configured: false,
    reachable: false
  };
  const [n8nStatus, setN8nStatus] = useState(initialStatus);
  const [isChecking, setIsChecking] = useState(false);

  const checkN8nStatus = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/health/n8n');
      const data = await response.json();
      setN8nStatus(data);
    } catch (error) {
      const errorStatus = {
        status: 'error',
        message: `Failed to check N8N API: ${error.message}`,
        timestamp: new Date().toISOString(),
        configured: false,
        reachable: false
      };
      setN8nStatus(errorStatus);
    } finally {
      setIsChecking(false);
    }
  };

  // Check status on mount and every 30 seconds
  useEffect(() => {
    checkN8nStatus();
    const interval = setInterval(checkN8nStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const contextValue = {
    n8nStatus,
    isChecking,
    checkN8nStatus
  };

  return (
    <ApiStatusContext.Provider value={contextValue}>
      {children}
    </ApiStatusContext.Provider>
  );
};
