module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 30000,
  
  // Coverage Thresholds - 80% requirement for AI/ML packages
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Component-specific thresholds for critical AI components
    './src/first-officer/TaskExecutor.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/memory/langchain-memory.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/first-officer/FirstOfficerAgent.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/first-officer/AgentSelector.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // AI/ML Testing Enhancements
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  maxWorkers: 2, // Limit workers for AI operations to prevent resource exhaustion
  slowTestThreshold: 10, // AI tests may be slower than typical unit tests
  
  // Enhanced error handling for complex AI workflows
  errorOnDeprecated: true,
  verbose: true
};