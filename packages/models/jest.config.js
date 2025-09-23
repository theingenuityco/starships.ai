// Simple config using shared preset
const baseConfig = require('../../jest.preset.js');

module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  // Map monorepo packages and force '@/...' to point to autopilot/src for cross-package imports
  // This mirrors how autopilot resolves '@/...' internally and avoids needing a custom resolver
  moduleNameMapper: {
    '^@starships/(.+)$': '<rootDir>/../$1/src',
    '^@/(.*)$': '<rootDir>/../autopilot/src/$1',
  },
  // Override transform to handle TypeScript compilation for TS sources
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
        diagnostics: {
          warnOnly: true,
          ignoreCodes: [2307, 7006],
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts', '!src/scripts/**/*.ts', '!src/migrations/**/*.ts'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
