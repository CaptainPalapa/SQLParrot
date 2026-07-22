// ABOUTME: ESLint flat config for repo-root Node code (tests, scripts, jest config)
// ABOUTME: frontend/ and backend/ have their own configs and are ignored here

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'frontend/**',
      'backend/**',
      'src-tauri/**',
      'coverage/**',
      'dist/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
