/**
 * Test Setup Configuration
 * 
 * Global setup for Jest tests including mocks and environment configuration
 */

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';
process.env.POSTGRES_DATABASE = 'test';
process.env.SERVER_PORT = '3001';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.PUBLIC_URL = 'http://localhost:3002';
process.env.APP_URL = 'http://localhost:3003';
process.env.SERVER_URL = 'http://localhost:3001';
process.env.DOCS_URL = 'http://localhost:3002';
// Stripe is instantiated at module import time in some services; provide a dummy key for tests.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

// Global test timeout
jest.setTimeout(10000);

// Console suppression for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console.error and console.warn during tests unless NODE_ENV=debug
  if (process.env.NODE_ENV !== 'debug') {
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});