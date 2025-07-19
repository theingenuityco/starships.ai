// Jest setup file for server tests
process.env.NODE_ENV = 'test';
process.env.ENABLE_AUTH_TESTING_BACKDOOR = 'true';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
