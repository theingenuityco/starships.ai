module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(test).ts'],
  testPathIgnorePatterns: ['integration'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      isolatedModules: true,
    }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^jose$': '<rootDir>/tests/mocks/jose.ts',
    '^@starships/agent-engine$': '<rootDir>/tests/mocks/@starships/agent-engine.ts',
    '^@starships/models/src/errors$': '<rootDir>/tests/mocks/@starships/protocol.ts',
    '^@starships/models/src/logging$': '<rootDir>/tests/mocks/@starships/models.ts',
    '^@starships/models/src/scripts/seed-mcp-servers$': '<rootDir>/tests/mocks/@starships/models.ts',
    '^@starships/models/src/types$': '<rootDir>/tests/mocks/@starships/models.ts',
    '^@starships/protocol/src/types/error-classes$': '<rootDir>/tests/mocks/@starships/protocol.ts',
    '^@starships/protocol/src/(.*)$': '<rootDir>/tests/mocks/@starships/protocol.ts',
    '^@starships/(.*)$': '<rootDir>/../$1/src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jose|@starships)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  // 85% coverage thresholds for business logic package
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
