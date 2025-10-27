module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000, // 30 seconds for database operations
  verbose: true,
  collectCoverage: false,
  forceExit: true,
  detectOpenHandles: true
};
