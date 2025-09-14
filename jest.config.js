module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Handle multiple projects at once
  projects: [
    {
      displayName: 'autopilot',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/autopilot/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/autopilot/src/tests/setup.ts'],
      moduleNameMapper: {
        '^@starships/(.+)$': '<rootDir>/packages/$1/src',
        '^@/(.*)$': '<rootDir>/packages/autopilot/src/$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            isolatedModules: true,
          },
        ],
      },
    },
    {
      displayName: 'errors',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/errors/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/errors/src/__tests__/setup.ts'],
      moduleNameMapper: {
        '^@starships/(.+)$': '<rootDir>/packages/$1/src',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            isolatedModules: true,
          },
        ],
      },
    },
    {
      displayName: 'models',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/models/src/**/__tests__/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/packages/models/src/tests/setup.ts'],
      moduleNameMapper: {
        '^@starships/(.+)$': '<rootDir>/packages/$1/src',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            isolatedModules: true,
          },
        ],
      },
    },
  ],

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
