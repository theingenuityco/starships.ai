/**
 * Error Handling System Unit Tests
 */

import {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ConstraintViolationError,
  DatabaseError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
  InternalServerError,
  ErrorFactory,
  ErrorUtils,
  ErrorCategory,
  ErrorDetails
} from '../errors';

describe('Error Handling System', () => {
  describe('BaseError', () => {
    class TestError extends BaseError {
      constructor(message: string) {
        super(message, 'TEST_ERROR', 400, ErrorCategory.VALIDATION);
      }
    }

    it('should create base error with required properties', () => {
      const error = new TestError('Test message');
      
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('TestError');
    });

    it('should create error with optional properties', () => {
      class TestErrorWithContext extends BaseError {
        constructor(message: string, details?: any, requestId?: string, path?: string) {
          super(message, 'TEST_ERROR', 400, ErrorCategory.VALIDATION, details, requestId, path);
        }
      }

      const error = new TestErrorWithContext('Test message', undefined, 'req-123', '/test/path');
      
      expect(error.requestId).toBe('req-123');
      expect(error.path).toBe('/test/path');
    });

    it('should convert to response format', () => {
      class TestErrorWithContext extends BaseError {
        constructor(message: string, details?: any, requestId?: string, path?: string) {
          super(message, 'TEST_ERROR', 400, ErrorCategory.VALIDATION, details, requestId, path);
        }
      }

      const error = new TestErrorWithContext('Test message', { field: 'testField' }, 'req-123', '/test/path');
      
      const response = error.toResponse();
      
      expect(response).toEqual({
        code: 'TEST_ERROR',
        message: 'Test message',
        details: { field: 'testField' },
        timestamp: error.timestamp,
        requestId: 'req-123',
        path: '/test/path',
        statusCode: 400,
        category: ErrorCategory.VALIDATION
      });
    });

    it('should convert to JSON for logging', () => {
      const error = new TestError('Test message');
      const json = error.toJSON();
      
      expect(json).toMatchObject({
        name: 'TestError',
        code: 'TEST_ERROR',
        message: 'Test message',
        statusCode: 400,
        category: ErrorCategory.VALIDATION,
        timestamp: error.timestamp
      });
      expect(json.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field', () => {
      const error = new ValidationError('Invalid email format', 'email');
      
      expect(error.message).toBe('Invalid email format');
      expect(error.field).toBe('email');
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should include field in response', () => {
      const error = new ValidationError('Invalid email', 'email');
      const response = error.toResponse();
      
      expect(response.field).toBe('email');
    });

    it('should work without field', () => {
      const error = new ValidationError('General validation error');
      
      expect(error.field).toBeUndefined();
      expect(error.message).toBe('General validation error');
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid token');
      
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();
      
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should create authorization error with permission details', () => {
      const error = new AuthorizationError(
        'Insufficient permissions', 
        'admin:write', 
        'user'
      );
      
      expect(error.requiredPermission).toBe('admin:write');
      expect(error.userRole).toBe('user');
    });

    it('should include permission details in response', () => {
      const error = new AuthorizationError(
        'Access denied',
        'admin:read',
        'guest'
      );
      const response = error.toResponse();
      
      expect(response.details).toMatchObject({
        requiredPermission: 'admin:read',
        userRole: 'guest'
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User not found', 'User', 'user-123');
      
      expect(error.message).toBe('User not found');
      expect(error.entityType).toBe('User');
      expect(error.entityId).toBe('user-123');
      expect(error.statusCode).toBe(404);
      expect(error.category).toBe(ErrorCategory.NOT_FOUND);
      expect(error.code).toBe('NOT_FOUND_ERROR');
    });

    it('should include entity details in response', () => {
      const error = new NotFoundError('Resource not found', 'Starship', 'ship-456');
      const response = error.toResponse();
      
      expect(response.entityType).toBe('Starship');
      expect(response.entityId).toBe('ship-456');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists', 'duplicate_key');
      
      expect(error.message).toBe('Resource already exists');
      expect(error.conflictType).toBe('duplicate_key');
      expect(error.statusCode).toBe(409);
      expect(error.category).toBe(ErrorCategory.CONFLICT);
      expect(error.code).toBe('CONFLICT_ERROR');
    });

    it('should include conflict type in response', () => {
      const error = new ConflictError('Email already taken', 'unique_constraint');
      const response = error.toResponse();
      
      expect(response.details).toMatchObject({
        conflictType: 'unique_constraint'
      });
    });
  });

  describe('ConstraintViolationError', () => {
    it('should create unique constraint violation error with 409 status', () => {
      const error = new ConstraintViolationError(
        'Duplicate entry',
        'unique'
      );
      
      expect(error.constraintType).toBe('unique');
      expect(error.statusCode).toBe(409);
      expect(error.category).toBe(ErrorCategory.CONFLICT);
    });

    it('should create foreign key constraint violation error with 400 status', () => {
      const error = new ConstraintViolationError(
        'Referenced record does not exist',
        'foreign_key'
      );
      
      expect(error.constraintType).toBe('foreign_key');
      expect(error.statusCode).toBe(400);
    });

    it('should include constraint type in response', () => {
      const error = new ConstraintViolationError('Check constraint failed', 'check');
      const response = error.toResponse();
      
      expect(response.constraintType).toBe('check');
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError(
        'Connection failed',
        'connect',
        'MATCH (n) RETURN n'
      );
      
      expect(error.message).toBe('Connection failed');
      expect(error.operation).toBe('connect');
      expect(error.query).toBe('MATCH (n) RETURN n');
      expect(error.statusCode).toBe(500);
      expect(error.category).toBe(ErrorCategory.DATABASE);
    });

    it('should exclude query in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new DatabaseError('Query failed', 'execute', 'SECRET QUERY');
      const response = error.toResponse();
      
      expect(response.details?.query).toBeUndefined();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include query in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new DatabaseError('Query failed', 'execute', 'SELECT * FROM users');
      const response = error.toResponse();
      
      expect(response.details?.query).toBe('SELECT * FROM users');
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('NetworkError', () => {
    it('should create network error with service details', () => {
      const error = new NetworkError(
        'Service unavailable',
        'auth-service',
        '/api/validate'
      );
      
      expect(error.service).toBe('auth-service');
      expect(error.endpoint).toBe('/api/validate');
      expect(error.statusCode).toBe(503);
      expect(error.category).toBe(ErrorCategory.NETWORK);
    });

    it('should include service details in response', () => {
      const error = new NetworkError('Timeout', 'api-gateway', '/health');
      const response = error.toResponse();
      
      expect(response.details).toMatchObject({
        service: 'api-gateway',
        endpoint: '/health'
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const resetTime = new Date('2024-01-01T12:00:00Z');
      const error = new RateLimitError('Too many requests', 100, resetTime);
      
      expect(error.limit).toBe(100);
      expect(error.resetTime).toBe(resetTime);
      expect(error.statusCode).toBe(429);
      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should use default message', () => {
      const error = new RateLimitError(undefined, 50);
      
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.limit).toBe(50);
    });

    it('should include rate limit details in response', () => {
      const resetTime = new Date('2024-01-01T12:00:00Z');
      const error = new RateLimitError('Limit exceeded', 25, resetTime);
      const response = error.toResponse();
      
      expect(response.details).toMatchObject({
        limit: 25,
        resetTime: '2024-01-01T12:00:00.000Z'
      });
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError(
        'Maintenance in progress',
        'database',
        3600
      );
      
      expect(error.service).toBe('database');
      expect(error.retryAfter).toBe(3600);
      expect(error.statusCode).toBe(503);
      expect(error.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    });

    it('should use default message', () => {
      const error = new ServiceUnavailableError();
      
      expect(error.message).toBe('Service temporarily unavailable');
    });
  });

  describe('InternalServerError', () => {
    it('should create internal server error', () => {
      const error = new InternalServerError('Unexpected error');
      
      expect(error.message).toBe('Unexpected error');
      expect(error.statusCode).toBe(500);
      expect(error.category).toBe(ErrorCategory.INTERNAL);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should use default message', () => {
      const error = new InternalServerError();
      
      expect(error.message).toBe('Internal server error');
    });
  });

  describe('ErrorFactory', () => {
    it('should create validation error', () => {
      const error = ErrorFactory.validation(
        'Invalid input',
        'email',
        'req-123',
        '/api/users'
      );
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.field).toBe('email');
      expect(error.requestId).toBe('req-123');
      expect(error.path).toBe('/api/users');
    });

    it('should create not found error', () => {
      const error = ErrorFactory.notFound(
        'User',
        'user-123',
        'req-456',
        '/api/users/user-123'
      );
      
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.entityType).toBe('User');
      expect(error.entityId).toBe('user-123');
      expect(error.message).toBe('User with ID user-123 not found');
    });

    it('should create database error', () => {
      const error = ErrorFactory.database(
        'Query failed',
        'select',
        'MATCH (n) RETURN n',
        'req-789'
      );
      
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.operation).toBe('select');
      expect(error.query).toBe('MATCH (n) RETURN n');
    });
  });

  describe('ErrorUtils', () => {
    it('should identify application errors', () => {
      const appError = new ValidationError('Test');
      const stdError = new Error('Standard error');
      
      expect(ErrorUtils.isApplicationError(appError)).toBe(true);
      expect(ErrorUtils.isApplicationError(stdError)).toBe(false);
    });

    it('should normalize application errors', () => {
      const error = new ValidationError('Test validation error');
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBe(error);
    });

    it('should normalize validation errors', () => {
      const error = { name: 'ValidationError', message: 'Test error', field: 'email' };
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.message).toBe('Test error');
      expect((normalized as ValidationError).field).toBe('email');
    });

    it('should normalize type errors', () => {
      const error = { name: 'TypeError', message: 'Cannot read property' };
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.message).toBe('Invalid data format');
    });

    it('should normalize unknown errors', () => {
      const error = new Error('Unknown error');
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(InternalServerError);
      expect(normalized.message).toBe('Unknown error');
    });

    it('should generate request ID', () => {
      const requestId = ErrorUtils.generateRequestId();
      
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('should extract log details', () => {
      const error = new ValidationError('Test error', 'field1', undefined, 'req-123');
      
      const details = ErrorUtils.extractLogDetails(error);
      
      expect(details).toMatchObject({
        errorName: 'ValidationError',
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Test error',
        statusCode: 400,
        category: ErrorCategory.VALIDATION,
        requestId: 'req-123'
      });
      expect(details.timestamp).toBeDefined();
      expect(details.stack).toBeDefined();
    });
  });

  describe('Error Categories', () => {
    it('should have all expected categories', () => {
      const categories = Object.values(ErrorCategory);
      
      expect(categories).toContain('validation');
      expect(categories).toContain('authentication');
      expect(categories).toContain('authorization');
      expect(categories).toContain('not_found');
      expect(categories).toContain('conflict');
      expect(categories).toContain('database');
      expect(categories).toContain('network');
      expect(categories).toContain('rate_limit');
      expect(categories).toContain('service_unavailable');
      expect(categories).toContain('internal');
    });
  });

  describe('Error Response Interface', () => {
    it('should match ErrorDetails interface', () => {
      const error = new ValidationError('Test error', 'testField');
      const response: ErrorDetails = error.toResponse();
      
      expect(response.code).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.timestamp).toBeDefined();
      expect(response.statusCode).toBeDefined();
      expect(response.category).toBeDefined();
    });
  });
});