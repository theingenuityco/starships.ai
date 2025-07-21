/**
 * Error Handling System Tests
 *
 * Tests for the comprehensive error handling system including
 * error classes, middleware, logging, and health checks.
 */

import request from 'supertest';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ErrorUtils,
  ErrorFactory,
} from '@starships/models/src/errors';
import { logger } from '@starships/models/src/logging';

describe('Error Handling System', () => {
  describe('Error Classes', () => {
    test('ValidationError should create proper error response', () => {
      const error = new ValidationError('Invalid input', 'email');
      const response = error.toResponse();

      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.message).toBe('Invalid input');
      expect(response.field).toBe('email');
      expect(response.statusCode).toBe(400);
      expect(response.category).toBe('validation');
      expect(response.timestamp).toBeDefined();
    });

    test('AuthenticationError should create proper error response', () => {
      const error = new AuthenticationError('Token expired');
      const response = error.toResponse();

      expect(response.code).toBe('AUTHENTICATION_ERROR');
      expect(response.message).toBe('Token expired');
      expect(response.statusCode).toBe(401);
      expect(response.category).toBe('authentication');
    });

    test('NotFoundError should create proper error response', () => {
      const error = new NotFoundError('User not found', 'User', 'user-123');
      const response = error.toResponse();

      expect(response.code).toBe('NOT_FOUND_ERROR');
      expect(response.message).toBe('User not found');
      expect(response.entityType).toBe('User');
      expect(response.entityId).toBe('user-123');
      expect(response.statusCode).toBe(404);
      expect(response.category).toBe('not_found');
    });

    test('DatabaseError should create proper error response', () => {
      const error = new DatabaseError('Connection failed', 'connect');
      const response = error.toResponse();

      expect(response.code).toBe('DATABASE_ERROR');
      expect(response.message).toBe('Connection failed');
      expect(response.statusCode).toBe(500);
      expect(response.category).toBe('database');
      expect(response.details?.operation).toBe('connect');
    });
  });

  describe('Error Factory', () => {
    test('should create validation error with context', () => {
      const error = ErrorFactory.validation('Invalid email', 'email', 'req-123', '/api/users');

      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.requestId).toBe('req-123');
      expect(error.path).toBe('/api/users');
    });

    test('should create not found error with context', () => {
      const error = ErrorFactory.notFound('User', 'user-123', 'req-456', '/api/users/user-123');

      expect(error.message).toBe('User with ID user-123 not found');
      expect(error.entityType).toBe('User');
      expect(error.entityId).toBe('user-123');
      expect(error.requestId).toBe('req-456');
      expect(error.path).toBe('/api/users/user-123');
    });
  });

  describe('Error Utils', () => {
    test('should identify application errors', () => {
      const appError = new ValidationError('Test error');
      const genericError = new Error('Generic error');

      expect(ErrorUtils.isApplicationError(appError)).toBe(true);
      expect(ErrorUtils.isApplicationError(genericError)).toBe(false);
    });

    test('should normalize unknown errors', () => {
      const genericError = new Error('Something went wrong');
      const normalized = ErrorUtils.normalize(genericError, 'req-123', '/api/test');

      expect(normalized.code).toBe('INTERNAL_SERVER_ERROR');
      expect(normalized.message).toBe('Something went wrong');
      expect(normalized.statusCode).toBe(500);
      expect(normalized.requestId).toBe('req-123');
      expect(normalized.path).toBe('/api/test');
    });

    test('should generate request IDs', () => {
      const requestId1 = ErrorUtils.generateRequestId();
      const requestId2 = ErrorUtils.generateRequestId();

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
      expect(requestId1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Error Serialization', () => {
    test('should serialize error to JSON for logging', () => {
      const error = new ValidationError(
        'Invalid input',
        'email',
        undefined,
        'req-123',
        '/api/users'
      );
      const json = error.toJSON();

      expect(json.name).toBe('ValidationError');
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.message).toBe('Invalid input');
      expect(json.statusCode).toBe(400);
      expect(json.category).toBe('validation');
      expect(json.requestId).toBe('req-123');
      expect(json.path).toBe('/api/users');
      expect(json.stack).toBeDefined();
    });

    test('should extract log details from error', () => {
      const error = new DatabaseError(
        'Query failed',
        'select',
        undefined,
        undefined,
        'req-456',
        '/api/data'
      );
      const logDetails = ErrorUtils.extractLogDetails(error);

      expect(logDetails.errorName).toBe('DatabaseError');
      expect(logDetails.errorCode).toBe('DATABASE_ERROR');
      expect(logDetails.errorMessage).toBe('Query failed');
      expect(logDetails.statusCode).toBe(500);
      expect(logDetails.category).toBe('database');
      expect(logDetails.requestId).toBe('req-456');
      expect(logDetails.path).toBe('/api/data');
      expect(logDetails.stack).toBeDefined();
    });
  });

  describe('Error Inheritance', () => {
    test('should maintain proper prototype chain', () => {
      const validationError = new ValidationError('Test');
      const authError = new AuthenticationError('Test');
      const notFoundError = new NotFoundError('Test', 'Entity', 'id');

      expect(validationError instanceof ValidationError).toBe(true);
      expect(validationError instanceof Error).toBe(true);

      expect(authError instanceof AuthenticationError).toBe(true);
      expect(authError instanceof Error).toBe(true);

      expect(notFoundError instanceof NotFoundError).toBe(true);
      expect(notFoundError instanceof Error).toBe(true);
    });

    test('should have correct error names', () => {
      const validationError = new ValidationError('Test');
      const authError = new AuthenticationError('Test');
      const conflictError = new ConflictError('Test');

      expect(validationError.name).toBe('ValidationError');
      expect(authError.name).toBe('AuthenticationError');
      expect(conflictError.name).toBe('ConflictError');
    });
  });

  describe('Production Error Sanitization', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('should sanitize database errors in production', () => {
      process.env.NODE_ENV = 'production';

      const error = new DatabaseError('Connection failed', 'connect', 'SELECT * FROM users');
      const response = error.toResponse();

      // Query should not be exposed in production
      expect(response.details?.query).toBeUndefined();
      expect(response.details?.operation).toBe('connect');
    });

    test('should expose query details in development', () => {
      process.env.NODE_ENV = 'development';

      const error = new DatabaseError('Connection failed', 'connect', 'SELECT * FROM users');
      const response = error.toResponse();

      // Query should be exposed in development
      expect(response.details?.query).toBe('SELECT * FROM users');
      expect(response.details?.operation).toBe('connect');
    });
  });
});

describe('Logging System', () => {
  describe('Logger', () => {
    test('should create log entries with proper structure', () => {
      // Mock console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      logger.info('Test message', {
        requestId: 'req-123',
        userId: 'user-456',
        component: 'test',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle error logging', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const testError = new Error('Test error');

      logger.error(
        'Error occurred',
        {
          requestId: 'req-123',
          component: 'test',
        },
        testError
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
