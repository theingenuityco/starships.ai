/**
 * Error Classes Tests for @starships/protocol
 * 
 * Tests for error class hierarchy, factory functions, and error handling.
 */

import {
  StandardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  BusinessLogicError,
  ExpeditionError,
  StarshipError,
  TaskError,
  AgentError,
  ErrorFactory,
  isStandardError,
  isValidationError,
  isAuthenticationError,
  isAuthorizationError,
  isNotFoundError,
  isConflictError,
  isDatabaseError,
  isNetworkError,
  isBusinessLogicError
} from '../src/types/error-classes';

import {
  StandardErrorCode,
  ErrorCategory,
  ErrorSeverity,
  getHttpStatusCode,
  getErrorCategory,
  getErrorSeverity,
  isRetryableError,
  shouldLogError,
  generateCorrelationId
} from '../src/types/errors';

import { ValidationUtils } from './setup';

describe('Error Classes', () => {
  describe('StandardError', () => {
    it('should create StandardError with basic properties', () => {
      const error = new StandardError('VALIDATION_ERROR', 'Test validation error');
      
      expect(error.name).toBe('StandardError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Test validation error');
      expect(error.category).toBe('validation');
      expect(error.severity).toBe('low');
      expect(error.httpStatusCode).toBe(400);
      expect(error.isRetryable).toBe(false);
      expect(ValidationUtils.isValidTimestamp(error.timestamp)).toBe(true);
      expect(error.correlationId).toBeTruthy();
      expect(error.correlationId.startsWith('err_')).toBe(true);
    });

    it('should create StandardError with optional fields', () => {
      const details = { field: 'testField', value: 'testValue' };
      const context = { service: 'test-service', method: 'testMethod' };
      const userId = 'user-123';
      const requestId = 'req-456';
      const correlationId = 'custom-correlation-123';
      
      const error = new StandardError(
        'AUTHENTICATION_FAILED',
        'Custom authentication error',
        details,
        context,
        correlationId,
        userId,
        requestId
      );
      
      expect(error.details).toEqual(details);
      expect(error.context).toEqual(context);
      expect(error.userId).toBe(userId);
      expect(error.requestId).toBe(requestId);
      expect(error.correlationId).toBe(correlationId);
    });

    it('should convert to ErrorInfo format', () => {
      const error = new StandardError('DATABASE_ERROR', 'Test database error');
      const errorInfo = error.toErrorInfo();
      
      expect(errorInfo.code).toBe('DATABASE_ERROR');
      expect(errorInfo.message).toBe('Test database error');
      expect(errorInfo.category).toBe('database');
      expect(errorInfo.severity).toBe('critical');
      expect(errorInfo.timestamp).toBe(error.timestamp);
      expect(errorInfo.correlationId).toBe(error.correlationId);
    });

    it('should convert to ErrorResponse format', () => {
      const error = new StandardError('NOT_FOUND', 'Test not found error');
      const meta = { version: '1.0.0', environment: 'test', service: 'protocol' };
      const errorResponse = error.toErrorResponse(meta);
      
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe('NOT_FOUND');
      expect(errorResponse.error.message).toBe('Test not found error');
      expect(errorResponse.meta).toEqual(meta);
    });

    it('should convert to JSON for logging', () => {
      const error = new StandardError('TIMEOUT_ERROR', 'Test timeout error');
      const json = error.toJSON();
      
      expect(json.name).toBe('StandardError');
      expect(json.code).toBe('TIMEOUT_ERROR');
      expect(json.message).toBe('Test timeout error');
      expect(json.category).toBe('network');
      expect(json.severity).toBe('high');
      expect(json.isRetryable).toBe(true);
    });

    it('should create StandardError from generic Error', () => {
      const genericError = new Error('Generic error message');
      const standardError = StandardError.fromError(genericError, 'NETWORK_ERROR');
      
      expect(standardError.code).toBe('NETWORK_ERROR');
      expect(standardError.message).toBe('Generic error message');
      expect(standardError.details?.originalError).toBe('Error');
      expect(standardError.context?.stackTrace).toBe(genericError.stack);
    });

    it('should be serializable', () => {
      const error = new StandardError('VALIDATION_ERROR', 'Test error');
      expect(ValidationUtils.isSerializable(error.toJSON())).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with validation details', () => {
      const validationErrors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format', value: 'invalid-email' }
      ];
      
      const error = new ValidationError(
        'Validation failed',
        validationErrors
      );
      
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.details?.validationErrors).toEqual(validationErrors);
    });

    it('should create ValidationError from field errors', () => {
      const fieldErrors = [
        { field: 'username', message: 'Username must be at least 3 characters' },
        { field: 'password', message: 'Password is required' }
      ];
      
      const error = ValidationError.fromFields(fieldErrors);
      
      expect(error.message).toBe('Validation failed for 2 field(s)');
      expect(error.validationErrors).toHaveLength(2);
      expect(error.validationErrors[0].field).toBe('username');
    });
  });

  describe('Domain-Specific Errors', () => {
    it('should create ExpeditionError with expedition context', () => {
      const error = new ExpeditionError(
        'EXPEDITION_NOT_FOUND',
        'Expedition not found',
        'expedition-123'
      );
      
      expect(error.name).toBe('ExpeditionError');
      expect(error.code).toBe('EXPEDITION_NOT_FOUND');
      expect(error.expeditionId).toBe('expedition-123');
      expect(error.details?.expeditionId).toBe('expedition-123');
    });

    it('should create StarshipError with starship context', () => {
      const error = new StarshipError(
        'STARSHIP_MAINTENANCE',
        'Starship is under maintenance',
        'starship-456'
      );
      
      expect(error.name).toBe('StarshipError');
      expect(error.code).toBe('STARSHIP_MAINTENANCE');
      expect(error.starshipId).toBe('starship-456');
    });

    it('should create TaskError with task and expedition context', () => {
      const error = new TaskError(
        'TASK_ALREADY_ASSIGNED',
        'Task is already assigned',
        'task-789',
        'expedition-123'
      );
      
      expect(error.name).toBe('TaskError');
      expect(error.taskId).toBe('task-789');
      expect(error.expeditionId).toBe('expedition-123');
    });

    it('should create AgentError with agent context', () => {
      const error = new AgentError(
        'AGENT_NOT_AVAILABLE',
        'Agent is not available',
        'agent-321'
      );
      
      expect(error.name).toBe('AgentError');
      expect(error.agentId).toBe('agent-321');
    });
  });

  describe('ErrorFactory', () => {
    it('should create validation errors', () => {
      const fieldErrors = [
        { field: 'title', message: 'Title is required' }
      ];
      
      const error = ErrorFactory.validation(fieldErrors);
      
      expect(isValidationError(error)).toBe(true);
      expect(error.validationErrors).toHaveLength(1);
    });

    it('should create not found errors', () => {
      const error = ErrorFactory.notFound('Expedition', 'exp-123');
      
      expect(isNotFoundError(error)).toBe(true);
      expect(error.resourceType).toBe('Expedition');
      expect(error.resourceId).toBe('exp-123');
      expect(error.message).toBe("Expedition with ID 'exp-123' not found");
    });

    it('should create authentication errors', () => {
      const error = ErrorFactory.authentication('Invalid credentials');
      
      expect(isAuthenticationError(error)).toBe(true);
      expect(error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should create authorization errors', () => {
      const error = ErrorFactory.authorization('Insufficient permissions');
      
      expect(isAuthorizationError(error)).toBe(true);
      expect(error.code).toBe('ACCESS_DENIED');
    });

    it('should create conflict errors', () => {
      const error = ErrorFactory.conflict('Agent', 'already exists');
      
      expect(isConflictError(error)).toBe(true);
      expect(error.resourceType).toBe('Agent');
      expect(error.conflictReason).toBe('already exists');
    });

    it('should create business logic errors', () => {
      const error = ErrorFactory.businessLogic(
        'EXPEDITION_CANNOT_MODIFY',
        'expedition-completed-rule',
        'Cannot modify completed expedition'
      );
      
      expect(isBusinessLogicError(error)).toBe(true);
      expect(error.businessRule).toBe('expedition-completed-rule');
    });

    it('should create expedition errors', () => {
      const error = ErrorFactory.expedition(
        'EXPEDITION_WORKFLOW_FAILED',
        'Workflow execution failed',
        'expedition-123'
      );
      
      expect(error.name).toBe('ExpeditionError');
      expect(error.expeditionId).toBe('expedition-123');
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify StandardError', () => {
      const standardError = new StandardError('UNKNOWN_ERROR');
      const genericError = new Error('Generic error');
      
      expect(isStandardError(standardError)).toBe(true);
      expect(isStandardError(genericError)).toBe(false);
    });

    it('should correctly identify specialized error types', () => {
      const validationError = new ValidationError('Validation failed', []);
      const authError = new AuthenticationError();
      const notFoundError = new NotFoundError('Resource');
      
      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(authError)).toBe(false);
      
      expect(isAuthenticationError(authError)).toBe(true);
      expect(isAuthenticationError(validationError)).toBe(false);
      
      expect(isNotFoundError(notFoundError)).toBe(true);
      expect(isNotFoundError(authError)).toBe(false);
    });
  });

  describe('Error Utility Functions', () => {
    it('should get correct HTTP status codes', () => {
      expect(getHttpStatusCode('VALIDATION_ERROR')).toBe(400);
      expect(getHttpStatusCode('AUTHENTICATION_FAILED')).toBe(401);
      expect(getHttpStatusCode('ACCESS_DENIED')).toBe(403);
      expect(getHttpStatusCode('RESOURCE_NOT_FOUND')).toBe(404);
      expect(getHttpStatusCode('RESOURCE_CONFLICT')).toBe(409);
      expect(getHttpStatusCode('RATE_LIMIT_EXCEEDED')).toBe(429);
      expect(getHttpStatusCode('INTERNAL_SERVER_ERROR')).toBe(500);
    });

    it('should get correct error categories', () => {
      expect(getErrorCategory('VALIDATION_ERROR')).toBe('validation');
      expect(getErrorCategory('AUTHENTICATION_FAILED')).toBe('authentication');
      expect(getErrorCategory('ACCESS_DENIED')).toBe('authorization');
      expect(getErrorCategory('RESOURCE_NOT_FOUND')).toBe('not_found');
      expect(getErrorCategory('DATABASE_ERROR')).toBe('database');
      expect(getErrorCategory('NETWORK_ERROR')).toBe('network');
    });

    it('should get correct error severities', () => {
      expect(getErrorSeverity('VALIDATION_ERROR')).toBe('low');
      expect(getErrorSeverity('ACCESS_DENIED')).toBe('medium');
      expect(getErrorSeverity('RATE_LIMIT_EXCEEDED')).toBe('high');
      expect(getErrorSeverity('DATABASE_ERROR')).toBe('critical');
    });

    it('should identify retryable errors', () => {
      expect(isRetryableError('TIMEOUT_ERROR')).toBe(true);
      expect(isRetryableError('NETWORK_ERROR')).toBe(true);
      expect(isRetryableError('SERVICE_UNAVAILABLE')).toBe(true);
      expect(isRetryableError('RATE_LIMIT_EXCEEDED')).toBe(true);
      
      expect(isRetryableError('VALIDATION_ERROR')).toBe(false);
      expect(isRetryableError('ACCESS_DENIED')).toBe(false);
      expect(isRetryableError('RESOURCE_NOT_FOUND')).toBe(false);
    });

    it('should identify errors that should be logged', () => {
      expect(shouldLogError('critical')).toBe(true);
      expect(shouldLogError('high')).toBe(true);
      expect(shouldLogError('medium')).toBe(false);
      expect(shouldLogError('low')).toBe(false);
    });

    it('should generate valid correlation IDs', () => {
      const correlationId = generateCorrelationId();
      
      expect(correlationId).toMatch(/^err_\d+_[a-z0-9]+$/);
      expect(correlationId.length).toBeGreaterThan(10);
      
      // Should generate unique IDs
      const secondId = generateCorrelationId();
      expect(correlationId).not.toBe(secondId);
    });
  });

  describe('DatabaseError', () => {
    it('should create DatabaseError with database details', () => {
      const databaseDetails = {
        operation: 'SELECT',
        table: 'expeditions',
        query: 'SELECT * FROM expeditions WHERE id = ?',
        originalError: 'Connection timeout'
      };
      
      const error = new DatabaseError(
        'DATABASE_TIMEOUT',
        'Database query timed out',
        databaseDetails
      );
      
      expect(error.name).toBe('DatabaseError');
      expect(error.databaseDetails).toEqual(databaseDetails);
      expect(error.details?.database).toEqual(databaseDetails);
    });

    it('should create DatabaseError from generic database error', () => {
      const dbError = new Error('Connection lost');
      const error = DatabaseError.fromDatabaseError(
        dbError,
        'INSERT',
        'agents'
      );
      
      expect(error.databaseDetails.operation).toBe('INSERT');
      expect(error.databaseDetails.table).toBe('agents');
      expect(error.databaseDetails.originalError).toBe('Connection lost');
    });
  });

  describe('NetworkError', () => {
    it('should create NetworkError with network details', () => {
      const networkDetails = {
        url: 'https://api.example.com/agents',
        method: 'POST',
        statusCode: 502,
        timeout: 5000,
        retryCount: 2
      };
      
      const error = new NetworkError(
        'SERVICE_UNREACHABLE',
        'Service is unreachable',
        networkDetails
      );
      
      expect(error.name).toBe('NetworkError');
      expect(error.networkDetails).toEqual(networkDetails);
    });

    it('should create NetworkError from HTTP error', () => {
      const httpError = {
        message: 'Request failed with status code 500',
        response: { status: 500 },
        timeout: 3000
      };
      
      const error = NetworkError.fromHttpError(
        httpError,
        'https://api.example.com/test',
        'GET'
      );
      
      expect(error.networkDetails.url).toBe('https://api.example.com/test');
      expect(error.networkDetails.method).toBe('GET');
      expect(error.networkDetails.statusCode).toBe(500);
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should handle timeout errors correctly', () => {
      const timeoutError = {
        message: 'Request timeout',
        code: 'ECONNABORTED',
        timeout: 5000
      };
      
      const error = NetworkError.fromHttpError(timeoutError);
      
      expect(error.code).toBe('REQUEST_TIMEOUT');
    });
  });
});