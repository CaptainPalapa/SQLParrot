import React, { createContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { themes } from '../constants/themes';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('sql-parrot-theme') || 'blue';
  });

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

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      changeTheme,
      getCurrentThemeData,
      themes
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
