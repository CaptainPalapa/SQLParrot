// ABOUTME: ESLint flat config for the backend (Node.js, CommonJS)
// ABOUTME: Shares the repo's ESLint 9 baseline; no React, Node globals only

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['coverage', 'node_modules'] },
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
          // Allow `const { secret, ...rest } = obj` to strip a field without
          // flagging the intentionally-discarded binding.
          ignoreRestSiblings: true,
          // Don't require naming a caught error that isn't used. Silently
          // swallowed errors are still caught by no-empty (empty catch blocks).
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
