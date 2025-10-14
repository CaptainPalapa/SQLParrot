import React, { useState } from 'react';
import { Palette, Check, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeSelector = ({ isOpen, onClose }) => {
  const { currentTheme, changeTheme, themes } = useTheme();
  const [previewTheme, setPreviewTheme] = useState(null);

  const handleThemeSelect = (themeId) => {
    changeTheme(themeId);
    onClose();
  };

  const handlePreview = (themeId) => {
    setPreviewTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
  };

  const handlePreviewEnd = () => {
    setPreviewTheme(null);
    document.documentElement.setAttribute('data-theme', currentTheme);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center space-x-2">
            <Palette className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-secondary-900 dark:text-white">
              Choose Your Theme
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {themes.map((theme) => (
              <div
                key={theme.id}
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                  currentTheme === theme.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900'
                    : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-600'
                }`}
                onClick={() => handleThemeSelect(theme.id)}
                onMouseEnter={() => handlePreview(theme.id)}
                onMouseLeave={handlePreviewEnd}
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

                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Primary: {theme.colors.primary}
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
              Your theme preference will be remembered for future visits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;
