import React, { createContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { themes } from '../constants/themes';
import { api } from '../api';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('blue'); // Default theme
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [userName, setUserName] = useState(null);

  // Fetch the userName from the backend
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const result = await api.get('/api/settings');
        if (result.success && result.data) {
          const envUserName = result.data.environment?.userName || 'default';
          setUserName(envUserName);

          // Load theme for this environment
          const themeKey = `sql-parrot-theme-${envUserName}`;
          const modeKey = `sql-parrot-mode-${envUserName}`;
          const savedTheme = localStorage.getItem(themeKey) || 'blue';
          const savedMode = localStorage.getItem(modeKey);

          setCurrentTheme(savedTheme);
          // Default to dark if no preference saved
          setIsDarkMode(savedMode === null ? true : savedMode === 'dark');
        } else {
          // API returned but no success - use fallback
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error('Failed to fetch userName:', error);
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      const savedTheme = localStorage.getItem('sql-parrot-theme') || 'blue';
      const savedMode = localStorage.getItem('sql-parrot-mode');
      setCurrentTheme(savedTheme);
      setIsDarkMode(savedMode === null ? true : savedMode === 'dark');
    };

    fetchUserName();
  }, []);

  // Apply theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);

    // Save theme with environment-specific key
    if (userName) {
      const themeKey = `sql-parrot-theme-${userName}`;
      localStorage.setItem(themeKey, currentTheme);
    } else {
      localStorage.setItem('sql-parrot-theme', currentTheme);
    }
  }, [currentTheme, userName]);

  // Apply dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Save mode with environment-specific key
    if (userName) {
      const modeKey = `sql-parrot-mode-${userName}`;
      localStorage.setItem(modeKey, isDarkMode ? 'dark' : 'light');
    } else {
      localStorage.setItem('sql-parrot-mode', isDarkMode ? 'dark' : 'light');
    }
  }, [isDarkMode, userName]);

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const getCurrentThemeData = () => {
    return themes.find(theme => theme.id === currentTheme) || themes[0];
  };

  const contextValue = {
    currentTheme,
    changeTheme,
    getCurrentThemeData,
    themes,
    isDarkMode,
    toggleDarkMode
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
