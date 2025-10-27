import React, { createContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { themes } from '../constants/themes';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('blue'); // Default theme
  const [userName, setUserName] = useState(null);

  // Fetch the userName from the backend
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          const envUserName = settings.environment?.userName || 'default';
          setUserName(envUserName);

          // Load theme for this environment
          const themeKey = `sql-parrot-theme-${envUserName}`;
          const savedTheme = localStorage.getItem(themeKey) || 'blue';
          setCurrentTheme(savedTheme);
        }
      } catch (error) {
        console.error('Failed to fetch userName:', error);
        // Fallback to default behavior
        const savedTheme = localStorage.getItem('sql-parrot-theme') || 'blue';
        setCurrentTheme(savedTheme);
      }
    };

    fetchUserName();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);

    // Save theme with environment-specific key
    if (userName) {
      const themeKey = `sql-parrot-theme-${userName}`;
      localStorage.setItem(themeKey, currentTheme);
    } else {
      // Fallback to old key if userName not available yet
      localStorage.setItem('sql-parrot-theme', currentTheme);
    }
  }, [currentTheme, userName]);

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
  };

  const getCurrentThemeData = () => {
    return themes.find(theme => theme.id === currentTheme) || themes[0];
  };

  const contextValue = {
    currentTheme,
    changeTheme,
    getCurrentThemeData,
    themes
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
