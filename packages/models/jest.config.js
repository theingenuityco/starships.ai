// Simple config using shared preset
const baseConfig = require('../../jest.preset.js');

module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  // Map monorepo packages:
  // - Resolve local "@/..." to this package's src
  // - Resolve @starships/autopilot to its built dist so ChildProcessRunner can find dist/scripts/child-entry.js
  // - Resolve other @starships/* to their src (ts-jest will transpile them on the fly)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@starships/autopilot$': '<rootDir>/../autopilot/dist',
    '^@starships/autopilot/src/(.*)$': '<rootDir>/../autopilot/src/$1',
    '^@starships/autopilot/(.*)$': '<rootDir>/../autopilot/dist/$1',
    '^@starships/(.+)$': '<rootDir>/../$1/src',
  },
  // Override transform to handle TypeScript compilation for TS sources
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
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
