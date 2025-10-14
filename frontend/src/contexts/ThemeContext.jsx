import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const themes = [
  { id: 'blue', name: 'Ocean Blue', colors: { primary: '#3b82f6', secondary: '#64748b' } },
  { id: 'emerald', name: 'Forest Emerald', colors: { primary: '#10b981', secondary: '#64748b' } },
  { id: 'purple', name: 'Royal Purple', colors: { primary: '#a855f7', secondary: '#64748b' } },
  { id: 'rose', name: 'Sunset Rose', colors: { primary: '#f43f5e', secondary: '#64748b' } },
  { id: 'orange', name: 'Autumn Orange', colors: { primary: '#f97316', secondary: '#64748b' } },
  { id: 'teal', name: 'Ocean Teal', colors: { primary: '#14b8a6', secondary: '#64748b' } },
  { id: 'dark', name: 'Midnight Dark', colors: { primary: '#d1d5db', secondary: '#1f2937' } },
];

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

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
