module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Only test TypeScript source files, ignore compiled dist
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  
  // Simple workspace package resolution - one line handles all!
  moduleNameMapper: {
    '^@starships/(.+)$': '<rootDir>/../$1/src',
  },
  
  transformIgnorePatterns: [
    'node_modules/(?!(@starships)/)',
  ],
  
  testTimeout: 10000,
  clearMocks: true,
};