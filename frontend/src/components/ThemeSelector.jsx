import React from 'react';
import PropTypes from 'prop-types';
import { Palette, Check, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const ThemeSelector = ({ isOpen, onClose }) => {
  const { currentTheme, changeTheme, themes, isDarkMode, toggleDarkMode } = useTheme();

  const handleThemeSelect = (themeId) => {
    changeTheme(themeId);
    onClose();
  };

  const handlePreview = (themeId) => {
    document.documentElement.setAttribute('data-theme', themeId);
  };

  const handlePreviewEnd = () => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-selector-title"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center space-x-2">
            <Palette className="w-6 h-6 text-primary-600" />
            <h2 id="theme-selector-title" className="text-xl font-semibold text-secondary-900 dark:text-white">
              Appearance
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
            aria-label="Close theme selector"
          >
            <X className="w-5 h-5 text-secondary-600 dark:text-secondary-400" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Light/Dark Mode Toggle */}
          <div className="mb-6 p-4 bg-secondary-50 dark:bg-secondary-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {isDarkMode ? (
                  <Moon className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                ) : (
                  <Sun className="w-5 h-5 text-yellow-500" />
                )}
                <div>
                  <h3 className="font-medium text-secondary-900 dark:text-white">
                    {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                  </h3>
                  <p className="text-sm text-secondary-500 dark:text-secondary-400">
                    {isDarkMode ? 'Easy on the eyes' : 'Bright and clear'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isDarkMode ? 'bg-primary-600' : 'bg-secondary-300'
                }`}
                role="switch"
                aria-checked={isDarkMode}
                aria-label="Toggle dark mode"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isDarkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Theme Grid */}
          <h3 className="font-medium text-secondary-900 dark:text-white mb-3">
            Accent Color
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {themes.map((theme) => (
              <div
                key={theme.id}
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                  currentTheme === theme.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-600'
                }`}
                onClick={() => handleThemeSelect(theme.id)}
                onMouseEnter={() => handlePreview(theme.id)}
                onMouseLeave={handlePreviewEnd}
                role="button"
                tabIndex={0}
                aria-label={`Select ${theme.name} theme`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleThemeSelect(theme.id);
                  }
                }}
              >
                {currentTheme === theme.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-5 h-5 text-primary-600" />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                    <h3 className="font-medium text-secondary-900 dark:text-white">
                      {theme.name}
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <div className="flex space-x-1">
                      <div
                        className="w-8 h-8 rounded"
                        style={{ backgroundColor: theme.colors.primary }}
                      />
                      <div
                        className="w-8 h-8 rounded"
                        style={{ backgroundColor: theme.colors.secondary }}
                      />
                      <div className="w-8 h-8 rounded bg-secondary-200 dark:bg-secondary-600" />
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-secondary-50 dark:bg-secondary-700 rounded-lg">
            <h4 className="font-medium text-secondary-900 dark:text-white mb-2">
              Preview Tips
            </h4>
            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              Hover over any theme to preview it instantly. Click to apply and save your choice.
              Your preferences will be remembered for future visits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

ThemeSelector.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ThemeSelector;
