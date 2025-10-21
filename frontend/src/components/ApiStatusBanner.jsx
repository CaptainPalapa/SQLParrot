import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useApiStatus } from '../contexts/ApiStatusContext';

const ApiStatusBanner = () => {
  const { n8nStatus, isChecking, checkN8nStatus } = useApiStatus();

  // Only show banner if N8N is configured but not reachable
  if (!n8nStatus.configured || n8nStatus.status === 'healthy') {
    return null;
  }

  const getStatusColor = () => {
    switch (n8nStatus.status) {
      case 'error':
        return 'bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200';
      case 'not_configured':
        return 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200';
      default:
        return 'bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200';
    }
  };

  const getStatusIcon = () => {
    switch (n8nStatus.status) {
      case 'not_configured':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusMessage = () => {
    switch (n8nStatus.status) {
      case 'not_configured':
        return 'N8N API Not Configured';
      case 'error':
        return 'N8N Webhook Unreachable';
      default:
        return 'N8N API Issue';
    }
  };

  return (
    <div className={`border-l-4 px-4 py-2 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="font-medium">{getStatusMessage()}</span>
          <span className="text-sm opacity-90">
            {n8nStatus.status === 'not_configured'
              ? 'File verification and cleanup unavailable'
              : 'File verification and cleanup unavailable - check N8N container'
            }
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={checkN8nStatus}
            disabled={isChecking}
            className="p-1 hover:bg-red-200 dark:hover:bg-red-800 rounded transition-colors disabled:opacity-50"
            title="Refresh N8N status"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiStatusBanner;
