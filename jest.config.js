module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.spec.js',
    '**/backend/**/__tests__/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000, // 30 seconds for database operations
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  forceExit: true,
  detectOpenHandles: true,
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/target/',
    '/frontend/'  // Frontend tests use Vitest, not Jest
  ]
};
