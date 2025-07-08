module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration-setup.ts'],
  testTimeout: 60000, // Longer timeout for real database operations
  maxWorkers: 1, // Sequential execution for database tests
  globalSetup: '<rootDir>/tests/helpers/neo4j-setup.ts',
  globalTeardown: '<rootDir>/tests/helpers/neo4j-teardown.ts',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};