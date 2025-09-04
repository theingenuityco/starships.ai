module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Handle multiple projects at once
  projects: [
    {
      displayName: 'autopilot',
      testMatch: ['<rootDir>/packages/autopilot/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/autopilot/src/tests/setup.ts'],
    },
    {
      displayName: 'errors', 
      testMatch: ['<rootDir>/packages/errors/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/errors/src/__tests__/setup.ts'],
    },
    {
      displayName: 'models',
      testMatch: ['<rootDir>/packages/models/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/models/src/tests/setup.ts'],
    },
  ],

  // Simple workspace package resolution
  moduleNameMapper: {
    '^@starships/(.+)$': '<rootDir>/packages/$1/src',
  },

  // Global settings
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
    '!packages/*/src/scripts/**/*.ts',
  ],
  
  testTimeout: 10000,
  clearMocks: true,
};