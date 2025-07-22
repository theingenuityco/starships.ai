module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.integration.test.ts', '**/integration/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@starships/(.*)$': '<rootDir>/../$1/src',
  },
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  // Database integration testing configurations
  maxWorkers: 1, // Sequential execution for database tests to avoid conflicts
  testTimeout: 60000, // 60 second timeout for database operations
  detectOpenHandles: true,
  forceExit: true,
  // Coverage thresholds for integration tests (focused on critical paths)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};