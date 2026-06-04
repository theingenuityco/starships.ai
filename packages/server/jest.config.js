module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          types: ['jest', 'node'],
          module: 'commonjs',
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
        },
        diagnostics: {
          // Monorepo packages can surface TS rootDir noise during tests; tests assert runtime behavior.
          warnOnly: true,
          ignoreCodes: [6059],
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    // Allow mocking ESM-only nanoid without touching jose.
    '^nanoid$': '<rootDir>/tests/mocks/nanoid.ts',
    // Some workspace packages use local "@/..." aliases internally.
    // Map these packages to their built dist so tsconfig path aliases are already rewritten.
    '^@starships/env$': '<rootDir>/../env/dist/index.js',
    '^@starships/env/(.*)$': '<rootDir>/../env/dist/$1',
    // Avoid ts-jest compiling @starships/models src into the server program (rootDir mismatch)
    '^@starships/models$': '<rootDir>/../models/dist/index.js',
    '^@starships/models/(.*)$': '<rootDir>/../models/dist/$1',
    '^@starships/errors$': '<rootDir>/../errors/dist/index.js',
    '^@starships/errors/(.*)$': '<rootDir>/../errors/dist/$1',
    '^@starships/protocol$': '<rootDir>/../protocol/dist/index.js',
    '^@starships/protocol/(.*)$': '<rootDir>/../protocol/dist/$1',
    // @starships/models depends on autopilot; map it to dist to avoid pulling autopilot src into server tests.
    '^@starships/autopilot$': '<rootDir>/../autopilot/dist/index.js',
    '^@starships/autopilot/(.*)$': '<rootDir>/../autopilot/dist/$1',
    // autopilot-cli's source uses internal "@/" aliases; map to dist so they're already rewritten
    // (its dist is built by the type-check step's build deps before tests run). Its connectors
    // dep uses only relative imports, so the catch-all -> src below loads it fine.
    '^@starships/autopilot-cli$': '<rootDir>/../autopilot-cli/dist/index.js',
    '^@starships/autopilot-cli/(.*)$': '<rootDir>/../autopilot-cli/dist/$1',
    '^@starships/(.*)$': '<rootDir>/../$1/src',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/'],
};
