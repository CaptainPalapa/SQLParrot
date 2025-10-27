import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

// Toast Notification Component
export const Toast = ({ message, type = 'info', isVisible, onClose, duration = 5000 }) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200';
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm w-full bg-white dark:bg-secondary-800 border rounded-lg shadow-lg p-4 ${getStyles()}`}>
      <div className="flex items-start space-x-3">
        {getIcon()}
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 hover:bg-black hover:bg-opacity-10 rounded-full transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Confirmation Modal Component
export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning'
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      default:
        return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const getConfirmButtonStyle = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 text-white';
      default:
        return 'bg-primary-600 hover:bg-primary-700 text-white';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center space-x-3 mb-4">
          {getIcon()}
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            {title}
          </h3>
        </div>

        <div className="text-secondary-600 dark:text-secondary-400 mb-6">
          {typeof message === 'string' ? message : message}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex-1 ${getConfirmButtonStyle()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Input Modal Component
export const InputModal = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  label,
  placeholder,
  submitText = 'Submit',
  cancelText = 'Cancel',
  initialValue = '',
  required = false
}) => {
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (required && !value.trim()) return;
    onSubmit(value.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">
          {title}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              {label}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input w-full"
              placeholder={placeholder}
              required={required}
              autoFocus
            />
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={required && !value.trim()}
            >
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Generic Modal Component (default export)
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md'
}) => {
  if (!isOpen) return null;

  const getSizeClass = () => {
    switch (size) {
      case 'sm':
        return 'max-w-sm';
      case 'lg':
        return 'max-w-lg';
      case 'xl':
        return 'max-w-xl';
      case '2xl':
        return 'max-w-2xl';
      default:
        return 'max-w-md';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white dark:bg-secondary-800 rounded-lg shadow-xl p-6 w-full ${getSizeClass()} mx-4`}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;
