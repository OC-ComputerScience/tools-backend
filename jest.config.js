export default {
  // Use ES modules
  preset: null,
  testEnvironment: 'node',
  
  // Transform ES modules
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Disable coverage for now to focus on getting tests running
  collectCoverageFrom: [
    'app/**/*.js',
    '!app/models/index.js',
    '!**/node_modules/**'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Module name mapping for ES modules
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Globals for ES modules
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Verbose output
  verbose: false,
  
  // Test timeout
  testTimeout: 10000
};
