// ABOUTME: Displays a blurred overlay when SQL Server connection is lost or reconnecting
// ABOUTME: Provides visual feedback and reconnect button for connection state changes

import React from 'react';
import PropTypes from 'prop-types';
import { RefreshCw, WifiOff, Settings } from 'lucide-react';
import { LoadingSpinner } from './Loading';

const ConnectionOverlay = ({
  status = 'connected',
  message = '',
  onRetry,
  onNavigateSettings,
  retryCount = 0,
  maxRetries = 3,
  children
}) => {
  const isVisible = status !== 'connected';

  const getStatusConfig = () => {
    switch (status) {
      case 'connecting':
        return {
          icon: <LoadingSpinner size="xl" />,
          title: 'Connecting...',
          defaultMessage: 'Establishing connection to SQL Server',
          showRetry: false
        };
      case 'reconnecting':
        return {
          icon: <LoadingSpinner size="xl" />,
          title: 'Reconnecting...',
          defaultMessage: retryCount > 0
            ? `Attempt ${retryCount} of ${maxRetries}`
            : 'Re-establishing connection to SQL Server',
          showRetry: false
        };
      case 'error':
        return {
          icon: <WifiOff className="w-12 h-12 text-red-400" />,
          title: 'Connection Lost',
          defaultMessage: 'Unable to connect to SQL Server',
          showRetry: true
        };
      case 'needs_config':
        return {
          icon: <Settings className="w-12 h-12 text-primary-400" />,
          title: 'Setup Required',
          defaultMessage: 'Click here to configure your connection profile',
          showRetry: false,
          showSettings: true,
          clickable: true
        };
      case 'loading':
        return {
          icon: <LoadingSpinner size="xl" />,
          title: 'Loading...',
          defaultMessage: 'Loading configuration and data',
          showRetry: false
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();

  if (!isVisible || !config) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content behind */}
      <div className="filter blur-sm pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-secondary-900/70 backdrop-blur-sm flex items-center justify-center z-50">
        <div
          className={`bg-secondary-800 border border-secondary-600 rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center ${
            config.clickable && onNavigateSettings ? 'cursor-pointer hover:border-primary-500 transition-colors' : ''
          }`}
          onClick={config.clickable && onNavigateSettings ? onNavigateSettings : undefined}
        >
          {/* Icon */}
          <div className="flex justify-center mb-4">
            {config.icon}
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-white mb-2">
            {config.title}
          </h3>

          {/* Message */}
          <p className="text-secondary-300 mb-4">
            {message || config.defaultMessage}
          </p>

          {/* Retry button */}
          {config.showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="btn-primary flex items-center justify-center space-x-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reconnect</span>
            </button>
          )}

          {/* Retry count indicator */}
          {status === 'reconnecting' && retryCount > 0 && (
            <div className="mt-3 flex justify-center">
              <div className="flex space-x-1">
                {Array.from({ length: maxRetries }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < retryCount
                        ? 'bg-primary-500'
                        : 'bg-secondary-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

ConnectionOverlay.propTypes = {
  status: PropTypes.oneOf(['connected', 'connecting', 'reconnecting', 'error', 'loading', 'needs_config']),
  message: PropTypes.string,
  onRetry: PropTypes.func,
  onNavigateSettings: PropTypes.func,
  retryCount: PropTypes.number,
  maxRetries: PropTypes.number,
  children: PropTypes.node.isRequired
};

export default ConnectionOverlay;
