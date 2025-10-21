import React, { createContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { themes } from '../constants/themes';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const getInitialTheme = () => {
    return localStorage.getItem('sql-parrot-theme') || 'blue';
  };
  const [currentTheme, setCurrentTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('sql-parrot-theme', currentTheme);
  }, [currentTheme]);

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
