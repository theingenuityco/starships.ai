/**
 * Jest setup file for errors package tests
 */

import { ErrorCategory } from '@starships/protocol';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  InternalServerError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  ValidationError,
} from '../index';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// Global test utilities for creating mock errors
(global as any).createMockValidationError = (message = 'Validation failed', field = 'testField') => new ValidationError(message, field);

(global as any).createMockNotFoundError = (entityType = 'TestEntity', entityId = 'test-123') =>
  new NotFoundError(`${entityType} not found`, entityType, entityId);

(global as any).createMockAuthenticationError = (message = 'Authentication required') => new AuthenticationError(message);

(global as any).createMockAuthorizationError = (message = 'Access denied', requiredPermission = 'read', userRole = 'user') =>
  new AuthorizationError(message, requiredPermission, userRole);

(global as any).createMockConflictError = (message = 'Resource conflict', conflictType = 'duplicate') =>
  new ConflictError(message, conflictType);

(global as any).createMockDatabaseError = (message = 'Database operation failed', operation = 'query', query = 'SELECT * FROM test') =>
  new DatabaseError(message, operation, query);

(global as any).createMockNetworkError = (message = 'Network operation failed', service = 'TestService', endpoint = '/api/test') =>
  new NetworkError(message, service, endpoint);

(global as any).createMockInternalServerError = (message = 'Internal server error') => new InternalServerError(message);

(global as any).createMockRateLimitError = (message = 'Rate limit exceeded', limit = 100, retryAfter = 60, remainingAttempts = 0) =>
  new RateLimitError(message, limit, retryAfter, remainingAttempts);

(global as any).createMockServiceUnavailableError = (message = 'Service unavailable', service = 'TestService', retryAfter = 120) =>
  new ServiceUnavailableError(message, service, retryAfter);

// Mock error with minimal required properties for testing normalization
(global as any).createMockGenericError = (name = 'GenericError', message = 'Something went wrong', status?: number) => {
  const error = new Error(message);
  error.name = name;
  if (status !== undefined) {
    (error as any).status = status;
  }
  return error;
};

// Mock database-like error
(global as any).createMockDatabaseLikeError = (code = 'ER_SOME_ERROR', message = 'Database constraint violation') => {
  const error = new Error(message);
  (error as any).code = code;
  error.name = 'DatabaseError';
  return error;
};

// Mock network-like error
(global as any).createMockNetworkLikeError = (code = 'ECONNREFUSED', message = 'Connection refused') => {
  const error = new Error(message);
  (error as any).code = code;
  return error;
};

// Common test constants
(global as any).TEST_CONSTANTS = {
  REQUEST_ID: 'test-req-123',
  PATH: '/api/test',
  TIMESTAMP_REGEX: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  NANOID_REGEX: /^[A-Za-z0-9_-]{21}$/,
};

// Helper to validate error response structure
(global as any).validateErrorResponse = (response: any) => {
  expect(response).toHaveProperty('code');
  expect(response).toHaveProperty('message');
  expect(response).toHaveProperty('timestamp');
  expect(response).toHaveProperty('statusCode');
  expect(response).toHaveProperty('category');
  expect(typeof response.code).toBe('string');
  expect(typeof response.message).toBe('string');
  expect(typeof response.statusCode).toBe('number');
  expect(Object.values(ErrorCategory)).toContain(response.category);
  expect(response.timestamp).toMatch((global as any).TEST_CONSTANTS.TIMESTAMP_REGEX);
};

// Helper to validate error JSON structure
(global as any).validateErrorJSON = (json: any) => {
  expect(json).toHaveProperty('name');
  expect(json).toHaveProperty('code');
  expect(json).toHaveProperty('message');
  expect(json).toHaveProperty('statusCode');
  expect(json).toHaveProperty('category');
  expect(json).toHaveProperty('timestamp');
  expect(json).toHaveProperty('stack');
  expect(typeof json.name).toBe('string');
  expect(typeof json.code).toBe('string');
  expect(typeof json.message).toBe('string');
  expect(typeof json.statusCode).toBe('number');
  expect(Object.values(ErrorCategory)).toContain(json.category);
  expect(json.timestamp).toMatch((global as any).TEST_CONSTANTS.TIMESTAMP_REGEX);
};

// Setup common test timeouts
jest.setTimeout(10000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';

// Mock nanoid generation for predictable testing
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'a1b2c3d4e5f67890abcdef1234567890'),
}));

// Mock Date.now for consistent timestamp testing
const mockDate = new Date('2024-01-01T00:00:00.000Z');
global.Date = class extends Date {
  constructor() {
    super();
    return mockDate;
  }

  static now() {
    return mockDate.getTime();
  }
} as any;
