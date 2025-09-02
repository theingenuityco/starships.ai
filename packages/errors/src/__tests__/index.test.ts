/**
 * Tests for error classes and utilities
 */

import {
  BaseError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  NetworkError,
  InternalServerError,
  RateLimitError,
  ServiceUnavailableError,
  ErrorCategory,
  ErrorUtils,
  ErrorDetails
} from '../index';

describe('BaseError', () => {
  it('should create error with required properties', () => {
    class TestError extends BaseError {
      constructor(message: string) {
        super(message, 'VALIDATION_ERROR', 400, ErrorCategory.VALIDATION);
      }
    }

    const error = new TestError('Test message');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.name).toBe('TestError');
    expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should create error with optional properties', () => {
    class TestError extends BaseError {
      constructor() {
        super(
          'Test message',
          'VALIDATION_ERROR',
          400,
          ErrorCategory.VALIDATION,
          { extra: 'data' },
          'req-123',
          '/api/test'
        );
      }
    }

    const error = new TestError();
    
    expect(error.details).toEqual({ extra: 'data' });
    expect(error.requestId).toBe('req-123');
    expect(error.path).toBe('/api/test');
  });

  it('should convert to response format', () => {
    class TestError extends BaseError {
      constructor() {
        super(
          'Test message',
          'VALIDATION_ERROR',
          400,
          ErrorCategory.VALIDATION,
          { extra: 'data' },
          'req-123',
          '/api/test'
        );
      }
    }

    const error = new TestError();
    const response = error.toResponse();

    (global as any).validateErrorResponse(response);
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.message).toBe('Test message');
    expect(response.statusCode).toBe(400);
    expect(response.category).toBe(ErrorCategory.VALIDATION);
    expect(response.details).toEqual({ extra: 'data' });
    expect(response.requestId).toBe('req-123');
    expect(response.path).toBe('/api/test');
  });

  it('should convert to JSON format', () => {
    class TestError extends BaseError {
      constructor() {
        super('Test message', 'VALIDATION_ERROR', 400, ErrorCategory.VALIDATION);
      }
    }

    const error = new TestError();
    const json = error.toJSON();

    (global as any).validateErrorJSON(json);
    expect(json.name).toBe('TestError');
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.message).toBe('Test message');
    expect(json.statusCode).toBe(400);
    expect(json.category).toBe(ErrorCategory.VALIDATION);
    expect(typeof json.stack).toBe('string');
  });
});

describe('ValidationError', () => {
  it('should create with message only', () => {
    const error = new ValidationError('Invalid input');
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.field).toBeUndefined();
  });

  it('should create with field', () => {
    const error = new ValidationError('Invalid email', 'email');
    
    expect(error.field).toBe('email');
  });

  it('should create with all parameters', () => {
    const error = new ValidationError(
      'Invalid email',
      'email',
      { pattern: 'email' },
      'req-123',
      '/api/users'
    );
    
    expect(error.field).toBe('email');
    expect(error.details).toEqual({ pattern: 'email' });
    expect(error.requestId).toBe('req-123');
    expect(error.path).toBe('/api/users');
  });

  it('should include field in response', () => {
    const error = new ValidationError('Invalid email', 'email');
    const response = error.toResponse();
    
    expect(response.field).toBe('email');
  });
});

describe('NotFoundError', () => {
  it('should create with required parameters', () => {
    const error = new NotFoundError('User not found', 'User', 'user-123');
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('User not found');
    expect(error.code).toBe('RESOURCE_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.category).toBe(ErrorCategory.NOT_FOUND);
    expect(error.entityType).toBe('User');
    expect(error.entityId).toBe('user-123');
  });

  it('should create with all parameters', () => {
    const error = new NotFoundError(
      'User not found',
      'User',
      'user-123',
      { query: 'SELECT * FROM users' },
      'req-123',
      '/api/users/user-123'
    );
    
    expect(error.details).toEqual({ query: 'SELECT * FROM users' });
    expect(error.requestId).toBe('req-123');
    expect(error.path).toBe('/api/users/user-123');
  });

  it('should include entity details in response', () => {
    const error = new NotFoundError('User not found', 'User', 'user-123');
    const response = error.toResponse();
    
    expect(response.entityType).toBe('User');
    expect(response.entityId).toBe('user-123');
  });
});

describe('AuthenticationError', () => {
  it('should create with default message', () => {
    const error = new AuthenticationError();
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(error.statusCode).toBe(401);
    expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
  });

  it('should create with custom message', () => {
    const error = new AuthenticationError('Invalid credentials');
    
    expect(error.message).toBe('Invalid credentials');
  });

  it('should create with all parameters', () => {
    const error = new AuthenticationError(
      'Token expired',
      { token: 'jwt-token' },
      'req-123',
      '/api/protected'
    );
    
    expect(error.message).toBe('Token expired');
    expect(error.details).toEqual({ token: 'jwt-token' });
    expect(error.requestId).toBe('req-123');
    expect(error.path).toBe('/api/protected');
  });
});

describe('AuthorizationError', () => {
  it('should create with default message', () => {
    const error = new AuthorizationError();
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Access denied');
    expect(error.code).toBe('ACCESS_DENIED');
    expect(error.statusCode).toBe(403);
    expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
    expect(error.requiredPermission).toBeUndefined();
    expect(error.userRole).toBeUndefined();
  });

  it('should create with custom message and permissions', () => {
    const error = new AuthorizationError('Insufficient permissions', 'admin', 'user');
    
    expect(error.message).toBe('Insufficient permissions');
    expect(error.requiredPermission).toBe('admin');
    expect(error.userRole).toBe('user');
  });

  it('should create with all parameters', () => {
    const error = new AuthorizationError(
      'Admin access required',
      'admin',
      'user',
      { resource: 'users' },
      'req-123',
      '/api/admin/users'
    );
    
    expect(error.details).toEqual({ resource: 'users' });
    expect(error.requestId).toBe('req-123');
    expect(error.path).toBe('/api/admin/users');
  });

  it('should include permission details in response', () => {
    const error = new AuthorizationError('Admin required', 'admin', 'user');
    const response = error.toResponse();
    
    expect(response.details).toEqual({
      requiredPermission: 'admin',
      userRole: 'user'
    });
  });
});

describe('ConflictError', () => {
  it('should create with message only', () => {
    const error = new ConflictError('Resource already exists');
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Resource already exists');
    expect(error.code).toBe('RESOURCE_CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.category).toBe(ErrorCategory.CONFLICT);
    expect(error.conflictType).toBeUndefined();
  });

  it('should create with conflict type', () => {
    const error = new ConflictError('Email already exists', 'duplicate_email');
    
    expect(error.conflictType).toBe('duplicate_email');
  });

  it('should include conflict type in response', () => {
    const error = new ConflictError('Email exists', 'duplicate_email');
    const response = error.toResponse();
    
    expect(response.details).toEqual({
      conflictType: 'duplicate_email'
    });
  });
});

describe('DatabaseError', () => {
  it('should create with message only', () => {
    const error = new DatabaseError('Database connection failed');
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Database connection failed');
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.category).toBe(ErrorCategory.DATABASE);
    expect(error.operation).toBeUndefined();
    expect(error.query).toBeUndefined();
  });

  it('should create with operation and query', () => {
    const error = new DatabaseError(
      'Query failed',
      'SELECT',
      'SELECT * FROM users'
    );
    
    expect(error.operation).toBe('SELECT');
    expect(error.query).toBe('SELECT * FROM users');
  });

  it('should include operation in response but hide query in production', () => {
    const originalEnv = process.env.NODE_ENV;
    
    // Test in development (query included)
    process.env.NODE_ENV = 'development';
    const devError = new DatabaseError('Query failed', 'SELECT', 'SELECT * FROM users');
    const devResponse = devError.toResponse();
    expect(devResponse.details).toEqual({
      operation: 'SELECT',
      query: 'SELECT * FROM users'
    });
    
    // Test in production (query hidden)
    process.env.NODE_ENV = 'production';
    const prodError = new DatabaseError('Query failed', 'SELECT', 'SELECT * FROM users');
    const prodResponse = prodError.toResponse();
    expect(prodResponse.details).toEqual({
      operation: 'SELECT'
    });
    
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });
});

describe('NetworkError', () => {
  it('should create with message only', () => {
    const error = new NetworkError('Network connection failed');
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Network connection failed');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.statusCode).toBe(503);
    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.service).toBeUndefined();
    expect(error.endpoint).toBeUndefined();
  });

  it('should create with service and endpoint', () => {
    const error = new NetworkError(
      'API call failed',
      'UserService',
      '/api/users'
    );
    
    expect(error.service).toBe('UserService');
    expect(error.endpoint).toBe('/api/users');
  });

  it('should include service details in response', () => {
    const error = new NetworkError('API failed', 'UserService', '/api/users');
    const response = error.toResponse();
    
    expect(response.details).toEqual({
      service: 'UserService',
      endpoint: '/api/users'
    });
  });
});

describe('InternalServerError', () => {
  it('should create with default message', () => {
    const error = new InternalServerError();
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Internal server error');
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.category).toBe(ErrorCategory.INTERNAL);
  });

  it('should create with custom message', () => {
    const error = new InternalServerError('Something went wrong');
    
    expect(error.message).toBe('Something went wrong');
  });
});

describe('RateLimitError', () => {
  it('should create with default message', () => {
    const error = new RateLimitError();
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.statusCode).toBe(429);
    expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(error.limit).toBeUndefined();
    expect(error.retryAfter).toBeUndefined();
    expect(error.remainingAttempts).toBeUndefined();
  });

  it('should create with rate limit details', () => {
    const error = new RateLimitError('Too many requests', 100, 60, 0);
    
    expect(error.limit).toBe(100);
    expect(error.retryAfter).toBe(60);
    expect(error.remainingAttempts).toBe(0);
  });

  it('should include rate limit details in response', () => {
    const error = new RateLimitError('Too many requests', 100, 60, 0);
    const response = error.toResponse();
    
    expect(response.details).toEqual({
      limit: 100,
      retryAfter: 60,
      remainingAttempts: 0
    });
  });
});

describe('ServiceUnavailableError', () => {
  it('should create with default message', () => {
    const error = new ServiceUnavailableError();
    
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Service temporarily unavailable');
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.statusCode).toBe(503);
    expect(error.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(error.service).toBeUndefined();
    expect(error.retryAfter).toBeUndefined();
  });

  it('should create with service details', () => {
    const error = new ServiceUnavailableError('Database unavailable', 'Database', 120);
    
    expect(error.service).toBe('Database');
    expect(error.retryAfter).toBe(120);
  });

  it('should include service details in response', () => {
    const error = new ServiceUnavailableError('DB down', 'Database', 120);
    const response = error.toResponse();
    
    expect(response.details).toEqual({
      service: 'Database',
      retryAfter: 120
    });
  });
});

describe('ErrorUtils', () => {
  describe('isApplicationError', () => {
    it('should identify application errors', () => {
      const appError = new ValidationError('Test');
      const genericError = new Error('Test');
      
      expect(ErrorUtils.isApplicationError(appError)).toBe(true);
      expect(ErrorUtils.isApplicationError(genericError)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should return application errors as-is', () => {
      const appError = new ValidationError('Test');
      const normalized = ErrorUtils.normalize(appError);
      
      expect(normalized).toBe(appError);
    });

    it('should normalize validation errors', () => {
      const error = (global as any).createMockGenericError('ValidationError', 'Validation failed');
      error.field = 'email';
      error.type = 'validation';
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.message).toBe('Validation failed');
    });

    it('should normalize authentication errors', () => {
      const error = (global as any).createMockGenericError('UnauthorizedError', 'Auth failed', 401);
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(AuthenticationError);
      expect(normalized.message).toBe('Auth failed');
    });

    it('should normalize authorization errors', () => {
      const error = (global as any).createMockGenericError('ForbiddenError', 'Access denied', 403);
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(AuthorizationError);
      expect(normalized.message).toBe('Access denied');
    });

    it('should normalize not found errors', () => {
      const error = (global as any).createMockGenericError('NotFoundError', 'Resource not found', 404);
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(NotFoundError);
      expect(normalized.message).toBe('Resource not found');
    });

    it('should normalize conflict errors', () => {
      const error = (global as any).createMockGenericError('ConflictError', 'Conflict occurred', 409);
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(ConflictError);
      expect(normalized.message).toBe('Conflict occurred');
    });

    it('should normalize database errors', () => {
      const error = (global as any).createMockDatabaseLikeError('ER_DUP_ENTRY', 'Duplicate entry');
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(DatabaseError);
      expect(normalized.message).toBe('Duplicate entry');
    });

    it('should normalize network errors', () => {
      const error = (global as any).createMockNetworkLikeError('ECONNREFUSED', 'Connection refused');
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(NetworkError);
      expect(normalized.message).toBe('Connection refused');
    });

    it('should normalize rate limit errors', () => {
      const error = (global as any).createMockGenericError('TooManyRequestsError', 'Too many requests', 429);
      error.limit = 100;
      error.retryAfter = 60;
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(RateLimitError);
      expect(normalized.message).toBe('Too many requests');
    });

    it('should default to internal server error', () => {
      const error = new Error('Unknown error');
      
      const normalized = ErrorUtils.normalize(error);
      
      expect(normalized).toBeInstanceOf(InternalServerError);
      expect(normalized.message).toBe('Unknown error');
    });

    it('should include requestId and path when provided', () => {
      const error = new Error('Test error');
      
      const normalized = ErrorUtils.normalize(error, 'req-123', '/api/test');
      
      expect(normalized.requestId).toBe('req-123');
      expect(normalized.path).toBe('/api/test');
    });
  });

  describe('generateRequestId', () => {
    it('should generate a request ID', () => {
      const requestId = ErrorUtils.generateRequestId();
      
      expect(typeof requestId).toBe('string');
      expect(requestId).toMatch(/^req_\d+_[a-z0-9]{9}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = ErrorUtils.generateRequestId();
      const id2 = ErrorUtils.generateRequestId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractLogDetails', () => {
    it('should extract log details from error', () => {
      const error = new ValidationError('Test error', 'email', { extra: 'data' }, 'req-123', '/api/test');
      
      const details = ErrorUtils.extractLogDetails(error);
      
      expect(details).toEqual({
        errorName: 'ValidationError',
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Test error',
        statusCode: 400,
        category: ErrorCategory.VALIDATION,
        timestamp: error.timestamp,
        requestId: 'req-123',
        path: '/api/test',
        details: { extra: 'data' },
        stack: error.stack
      });
    });
  });
});