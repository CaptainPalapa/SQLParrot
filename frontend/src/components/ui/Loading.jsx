import React from 'react';
import PropTypes from 'prop-types';

const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-secondary-300 border-t-primary-600 ${sizeClasses[size]} ${className}`} />
  );
};

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  className: PropTypes.string,
};

const LoadingButton = ({
  children,
  loading = false,
  loadingText = 'Loading...',
  disabled = false,
  className = '',
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${className} ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
    >
      {loading ? (
        <div className="flex items-center justify-center space-x-2">
          <LoadingSpinner size="sm" />
          <span>{loadingText}</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};

LoadingButton.propTypes = {
  children: PropTypes.node.isRequired,
  loading: PropTypes.bool,
  loadingText: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

const LoadingCard = ({ children, loading = false, className = '' }) => {
  if (loading) {
    return (
      <div className={`card p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4"></div>
          <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2"></div>
          <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return <div className={`card p-6 ${className}`}>{children}</div>;
};

LoadingCard.propTypes = {
  children: PropTypes.node.isRequired,
  loading: PropTypes.bool,
  className: PropTypes.string,
};

const LoadingOverlay = ({ loading = false, children, className = '' }) => {
  return (
    <div className={`relative ${className}`}>
      {children}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 dark:bg-secondary-900 dark:bg-opacity-75 flex items-center justify-center z-10">
          <div className="flex flex-col items-center space-y-2">
            <LoadingSpinner size="lg" />
            <span className="text-sm text-secondary-600 dark:text-secondary-400">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

LoadingOverlay.propTypes = {
  loading: PropTypes.bool,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

const LoadingPage = ({ message = 'Loading...' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900">
      <div className="flex flex-col items-center space-y-4">
        <LoadingSpinner size="xl" />
        <p className="text-lg text-secondary-600 dark:text-secondary-400">{message}</p>
      </div>
    </div>
  );
};

LoadingPage.propTypes = {
  message: PropTypes.string,
};

export {
  LoadingSpinner,
  LoadingButton,
  LoadingCard,
  LoadingOverlay,
  LoadingPage,
};
