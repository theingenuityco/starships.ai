module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Transform files with ts-jest
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Disable verbose output for faster execution
  verbose: false,
  
  // Disable coverage collection for faster execution by default
  collectCoverage: false,
  
  // Increase test timeout for slow tests
  testTimeout: 10000,
  
  // Run tests in parallel for better performance
  maxWorkers: '50%',
  
  // Cache transformation results for faster subsequent runs
  cache: true,
  cacheDirectory: '.jest-cache'
};