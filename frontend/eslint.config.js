// ABOUTME: ESLint flat config for the frontend (React + Vite, ESLint 9)
// ABOUTME: Replaces the legacy .eslintrc.cjs and sets the repo-wide ESLint 9 baseline

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat['recommended-latest'],
  { settings: { react: { version: '18.2' } } },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/prop-types': 'off',
      // Off pending a dedicated refactor PR. This React Compiler rule flags
      // setState inside effects across working forms/modals; fixing it changes
      // UI behavior and belongs in its own change, not the lint-enablement PR.
      // Tracked in TODO.md.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      '**/*.test.{js,jsx}',
      '**/__tests__/**/*.{js,jsx}',
      '**/setupTests.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        global: 'readonly',
        vi: 'readonly',
      },
    },
  },
]
