/**
 * Tests for the lean error system
 */

import {
  AppError,
  AuthError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  createError,
  getErrorMessage,
  isAppError,
  notFound,
  toApiError,
  validationError,
  wrapError,
} from '../index';

describe('Lean Error System', () => {
  describe('AppError (Base Class)', () => {
    it('should create error with automatic categorization', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe('client'); // Auto-categorized from 400 status
      expect(error.name).toBe('AppError');
    });

    it('should handle 500+ status codes as server errors', () => {
      const error = new AppError('Server error', 'SERVER_ERROR', 500);
      expect(error.category).toBe('server');
    });

    it('should include cause and details', () => {
      const cause = new Error('Original error');
      const error = new AppError('Wrapped error', 'WRAP_ERROR', 500, {
        details: { extra: 'info' },
        cause,
      });

      expect(error.details).toEqual({ extra: 'info' });
      expect(error.cause).toBe(cause);
    });

    it('should convert to JSON correctly', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400);
      const json = error.toJSON();

      expect(json.name).toBe('AppError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.statusCode).toBe(400);
      expect(json.category).toBe('client');
    });

    it('should convert to API response format', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400);
      const response = error.toResponse();

      expect(response).toEqual({
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
          details: undefined,
        },
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field', () => {
      const error = new ValidationError('Email is required', 'email');

      expect(error.message).toBe('Email is required');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('email');
    });

    it('should include field in response', () => {
      const error = new ValidationError('Invalid format', 'email');
      const response = error.toResponse();

      expect(response.error.field).toBe('email');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource info', () => {
      const error = new NotFoundError('User', '123');

      expect(error.message).toBe('User not found: 123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.resource).toBe('User');
      expect(error.id).toBe('123');
    });
  });

  describe('Utility Functions', () => {
    describe('createError', () => {
      it('should create generic error with defaults', () => {
        const error = createError('Something went wrong');

        expect(error.message).toBe('Something went wrong');
        expect(error.code).toBe('SERVER_ERROR');
        expect(error.statusCode).toBe(500);
      });

      it('should create client error for 4xx status', () => {
        const error = createError('Bad request', 400);

        expect(error.code).toBe('CLIENT_ERROR');
        expect(error.statusCode).toBe(400);
      });
    });

    describe('wrapError', () => {
      it('should wrap unknown error', () => {
        const original = new Error('Original error');
        const wrapped = wrapError(original, 'Operation failed');

        expect(wrapped.message).toBe('Operation failed: Original error');
        expect(wrapped.cause).toBe(original);
      });

      it('should return AppError unchanged', () => {
        const appError = new AppError('App error', 'APP_ERROR', 400);
        const wrapped = wrapError(appError);

        expect(wrapped).toBe(appError);
      });

      it('should handle non-Error objects', () => {
        const wrapped = wrapError('string error', 'Context');

        expect(wrapped.message).toBe('Context: string error');
        expect(wrapped.cause).toBeUndefined();
      });
    });

    describe('Factory functions', () => {
      it('should create validation error', () => {
        const error = validationError('email', 'Invalid format');

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toBe('Invalid email: Invalid format');
        expect(error.field).toBe('email');
      });

      it('should create not found error', () => {
        const error = notFound('User', '123');

        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.resource).toBe('User');
        expect(error.id).toBe('123');
      });
    });

    describe('getErrorMessage', () => {
      it('should extract message from Error', () => {
        const error = new Error('Test message');
        expect(getErrorMessage(error)).toBe('Test message');
      });

      it('should handle string errors', () => {
        expect(getErrorMessage('String error')).toBe('String error');
      });

      it('should handle unknown errors', () => {
        expect(getErrorMessage({ unknown: 'object' })).toBe('Unknown error occurred');
      });
    });

    describe('isAppError', () => {
      it('should identify AppError instances', () => {
        const appError = new AppError('Test', 'TEST', 500);
        const regularError = new Error('Test');

        expect(isAppError(appError)).toBe(true);
        expect(isAppError(regularError)).toBe(false);
      });
    });

    describe('toApiError', () => {
      it('should convert AppError to API format', () => {
        const error = new ValidationError('Invalid input', 'email');
        const apiError = toApiError(error);

        expect(apiError.error.code).toBe('VALIDATION_ERROR');
        expect(apiError.error.message).toBe('Invalid input');
      });

      it('should handle unknown errors', () => {
        const unknownError = new Error('Unknown');
        const apiError = toApiError(unknownError);

        expect(apiError.error.code).toBe('UNKNOWN_ERROR');
        expect(apiError.error.message).toBe('Unknown');
      });
    });
  });

  describe('Specific Error Types', () => {
    it('should create auth error', () => {
      const error = new AuthError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });

    it('should create forbidden error', () => {
      const error = new ForbiddenError('Admin only');

      expect(error.message).toBe('Admin only');
      expect(error.statusCode).toBe(403);
    });

    it('should create database error', () => {
      const error = new DatabaseError('create');

      expect(error.message).toBe('Database create failed');
      expect(error.operation).toBe('create');
      expect(error.statusCode).toBe(500);
    });
  });
});
