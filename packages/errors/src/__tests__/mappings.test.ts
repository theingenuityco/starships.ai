/**
 * Tests for error mappings and utilities
 */

import { ERROR_HTTP_STATUS_MAP, ERROR_CATEGORY_MAP, ErrorMappingUtils } from '../mappings';
import { ErrorCategory } from '@starships/protocol';
import type { StandardErrorCode } from '@starships/protocol';

describe('ERROR_HTTP_STATUS_MAP', () => {
  it('should map validation errors to 400', () => {
    expect(ERROR_HTTP_STATUS_MAP['VALIDATION_ERROR']).toBe(400);
    expect(ERROR_HTTP_STATUS_MAP['INVALID_INPUT']).toBe(400);
    expect(ERROR_HTTP_STATUS_MAP['MISSING_REQUIRED_FIELD']).toBe(400);
    expect(ERROR_HTTP_STATUS_MAP['INVALID_FORMAT']).toBe(400);
  });

  it('should map authentication errors to 401', () => {
    expect(ERROR_HTTP_STATUS_MAP['AUTHENTICATION_REQUIRED']).toBe(401);
    expect(ERROR_HTTP_STATUS_MAP['AUTHENTICATION_FAILED']).toBe(401);
    expect(ERROR_HTTP_STATUS_MAP['TOKEN_EXPIRED']).toBe(401);
    expect(ERROR_HTTP_STATUS_MAP['TOKEN_INVALID']).toBe(401);
  });

  it('should map authorization errors to 403', () => {
    expect(ERROR_HTTP_STATUS_MAP['ACCESS_DENIED']).toBe(403);
    expect(ERROR_HTTP_STATUS_MAP['INSUFFICIENT_PERMISSIONS']).toBe(403);
    expect(ERROR_HTTP_STATUS_MAP['FORBIDDEN_OPERATION']).toBe(403);
  });

  it('should map not found errors to 404', () => {
    expect(ERROR_HTTP_STATUS_MAP['RESOURCE_NOT_FOUND']).toBe(404);
    expect(ERROR_HTTP_STATUS_MAP['EXPEDITION_NOT_FOUND']).toBe(404);
    expect(ERROR_HTTP_STATUS_MAP['STARSHIP_NOT_FOUND']).toBe(404);
    expect(ERROR_HTTP_STATUS_MAP['TASK_NOT_FOUND']).toBe(404);
  });

  it('should map conflict errors to 409', () => {
    expect(ERROR_HTTP_STATUS_MAP['RESOURCE_ALREADY_EXISTS']).toBe(409);
    expect(ERROR_HTTP_STATUS_MAP['RESOURCE_CONFLICT']).toBe(409);
    expect(ERROR_HTTP_STATUS_MAP['EXPEDITION_ALREADY_STARTED']).toBe(409);
  });

  it('should map locked errors to 423', () => {
    expect(ERROR_HTTP_STATUS_MAP['RESOURCE_LOCKED']).toBe(423);
    expect(ERROR_HTTP_STATUS_MAP['STARSHIP_MAINTENANCE']).toBe(423);
  });

  it('should map rate limit errors to 429', () => {
    expect(ERROR_HTTP_STATUS_MAP['RATE_LIMIT_EXCEEDED']).toBe(429);
    expect(ERROR_HTTP_STATUS_MAP['QUOTA_EXCEEDED']).toBe(429);
    expect(ERROR_HTTP_STATUS_MAP['CONCURRENT_LIMIT_EXCEEDED']).toBe(429);
  });

  it('should map internal server errors to 500', () => {
    expect(ERROR_HTTP_STATUS_MAP['INTERNAL_SERVER_ERROR']).toBe(500);
    expect(ERROR_HTTP_STATUS_MAP['DATABASE_ERROR']).toBe(500);
    expect(ERROR_HTTP_STATUS_MAP['CONFIGURATION_ERROR']).toBe(500);
  });

  it('should map network errors to 502', () => {
    expect(ERROR_HTTP_STATUS_MAP['NETWORK_ERROR']).toBe(502);
    expect(ERROR_HTTP_STATUS_MAP['CONNECTION_FAILED']).toBe(502);
    expect(ERROR_HTTP_STATUS_MAP['SERVICE_UNREACHABLE']).toBe(502);
  });

  it('should map service unavailable errors to 503', () => {
    expect(ERROR_HTTP_STATUS_MAP['SERVICE_UNAVAILABLE']).toBe(503);
    expect(ERROR_HTTP_STATUS_MAP['AGENT_NOT_AVAILABLE']).toBe(503);
  });

  it('should map timeout errors to 504', () => {
    expect(ERROR_HTTP_STATUS_MAP['TIMEOUT_ERROR']).toBe(504);
    expect(ERROR_HTTP_STATUS_MAP['REQUEST_TIMEOUT']).toBe(504);
    expect(ERROR_HTTP_STATUS_MAP['DATABASE_TIMEOUT']).toBe(504);
  });
});

describe('ERROR_CATEGORY_MAP', () => {
  it('should categorize validation errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['VALIDATION_ERROR']).toBe(ErrorCategory.VALIDATION);
    expect(ERROR_CATEGORY_MAP['INVALID_INPUT']).toBe(ErrorCategory.VALIDATION);
    expect(ERROR_CATEGORY_MAP['MESSAGE_INVALID_TYPE']).toBe(ErrorCategory.VALIDATION);
    expect(ERROR_CATEGORY_MAP['RESULT_VALIDATION_FAILED']).toBe(ErrorCategory.VALIDATION);
  });

  it('should categorize authentication errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['AUTHENTICATION_REQUIRED']).toBe(ErrorCategory.AUTHENTICATION);
    expect(ERROR_CATEGORY_MAP['AUTHENTICATION_FAILED']).toBe(ErrorCategory.AUTHENTICATION);
    expect(ERROR_CATEGORY_MAP['TOKEN_EXPIRED']).toBe(ErrorCategory.AUTHENTICATION);
  });

  it('should categorize authorization errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['ACCESS_DENIED']).toBe(ErrorCategory.AUTHORIZATION);
    expect(ERROR_CATEGORY_MAP['INSUFFICIENT_PERMISSIONS']).toBe(ErrorCategory.AUTHORIZATION);
    expect(ERROR_CATEGORY_MAP['EXPEDITION_ACCESS_DENIED']).toBe(ErrorCategory.AUTHORIZATION);
  });

  it('should categorize not found errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['RESOURCE_NOT_FOUND']).toBe(ErrorCategory.NOT_FOUND);
    expect(ERROR_CATEGORY_MAP['EXPEDITION_NOT_FOUND']).toBe(ErrorCategory.NOT_FOUND);
    expect(ERROR_CATEGORY_MAP['RESOURCE_EXPIRED']).toBe(ErrorCategory.NOT_FOUND);
  });

  it('should categorize conflict errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['RESOURCE_ALREADY_EXISTS']).toBe(ErrorCategory.CONFLICT);
    expect(ERROR_CATEGORY_MAP['EXPEDITION_CANNOT_MODIFY']).toBe(ErrorCategory.CONFLICT);
    expect(ERROR_CATEGORY_MAP['RESOURCE_LOCKED']).toBe(ErrorCategory.CONFLICT);
  });

  it('should categorize rate limit errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['RATE_LIMIT_EXCEEDED']).toBe(ErrorCategory.RATE_LIMIT);
    expect(ERROR_CATEGORY_MAP['QUOTA_EXCEEDED']).toBe(ErrorCategory.RATE_LIMIT);
    expect(ERROR_CATEGORY_MAP['CONCURRENT_LIMIT_EXCEEDED']).toBe(ErrorCategory.RATE_LIMIT);
  });

  it('should categorize database errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['DATABASE_ERROR']).toBe(ErrorCategory.DATABASE);
    expect(ERROR_CATEGORY_MAP['DATABASE_CONNECTION_FAILED']).toBe(ErrorCategory.DATABASE);
    expect(ERROR_CATEGORY_MAP['DATABASE_TIMEOUT']).toBe(ErrorCategory.DATABASE);
  });

  it('should categorize network errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['NETWORK_ERROR']).toBe(ErrorCategory.NETWORK);
    expect(ERROR_CATEGORY_MAP['CONNECTION_FAILED']).toBe(ErrorCategory.NETWORK);
    expect(ERROR_CATEGORY_MAP['SERVICE_UNREACHABLE']).toBe(ErrorCategory.NETWORK);
  });

  it('should categorize internal errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['INTERNAL_SERVER_ERROR']).toBe(ErrorCategory.INTERNAL);
    expect(ERROR_CATEGORY_MAP['CONFIGURATION_ERROR']).toBe(ErrorCategory.INTERNAL);
    expect(ERROR_CATEGORY_MAP['UNKNOWN_ERROR']).toBe(ErrorCategory.INTERNAL);
  });

  it('should categorize service unavailable errors correctly', () => {
    expect(ERROR_CATEGORY_MAP['SERVICE_UNAVAILABLE']).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(ERROR_CATEGORY_MAP['AGENT_NOT_AVAILABLE']).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
  });
});

describe('ErrorMappingUtils', () => {
  describe('getHttpStatusCode', () => {
    it('should return correct status code for known error codes', () => {
      expect(ErrorMappingUtils.getHttpStatusCode('VALIDATION_ERROR')).toBe(400);
      expect(ErrorMappingUtils.getHttpStatusCode('AUTHENTICATION_REQUIRED')).toBe(401);
      expect(ErrorMappingUtils.getHttpStatusCode('ACCESS_DENIED')).toBe(403);
      expect(ErrorMappingUtils.getHttpStatusCode('RESOURCE_NOT_FOUND')).toBe(404);
      expect(ErrorMappingUtils.getHttpStatusCode('RESOURCE_ALREADY_EXISTS')).toBe(409);
      expect(ErrorMappingUtils.getHttpStatusCode('RATE_LIMIT_EXCEEDED')).toBe(429);
      expect(ErrorMappingUtils.getHttpStatusCode('INTERNAL_SERVER_ERROR')).toBe(500);
    });

    it('should return 500 for unknown error codes', () => {
      expect(ErrorMappingUtils.getHttpStatusCode('UNKNOWN_CODE' as StandardErrorCode)).toBe(500);
    });
  });

  describe('getErrorCategory', () => {
    it('should return correct category for known error codes', () => {
      expect(ErrorMappingUtils.getErrorCategory('VALIDATION_ERROR')).toBe(ErrorCategory.VALIDATION);
      expect(ErrorMappingUtils.getErrorCategory('AUTHENTICATION_REQUIRED')).toBe(
        ErrorCategory.AUTHENTICATION
      );
      expect(ErrorMappingUtils.getErrorCategory('ACCESS_DENIED')).toBe(ErrorCategory.AUTHORIZATION);
      expect(ErrorMappingUtils.getErrorCategory('RESOURCE_NOT_FOUND')).toBe(
        ErrorCategory.NOT_FOUND
      );
      expect(ErrorMappingUtils.getErrorCategory('RESOURCE_ALREADY_EXISTS')).toBe(
        ErrorCategory.CONFLICT
      );
      expect(ErrorMappingUtils.getErrorCategory('DATABASE_ERROR')).toBe(ErrorCategory.DATABASE);
    });

    it('should return INTERNAL category for unknown error codes', () => {
      expect(ErrorMappingUtils.getErrorCategory('UNKNOWN_CODE' as StandardErrorCode)).toBe(
        ErrorCategory.INTERNAL
      );
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(ErrorMappingUtils.isRetryableError('TIMEOUT_ERROR')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('REQUEST_TIMEOUT')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('OPERATION_TIMEOUT')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('DATABASE_TIMEOUT')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('NETWORK_ERROR')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('CONNECTION_FAILED')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('SERVICE_UNREACHABLE')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('SERVICE_UNAVAILABLE')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('RATE_LIMIT_EXCEEDED')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('DATABASE_CONNECTION_FAILED')).toBe(true);
      expect(ErrorMappingUtils.isRetryableError('INTERNAL_SERVER_ERROR')).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(ErrorMappingUtils.isRetryableError('VALIDATION_ERROR')).toBe(false);
      expect(ErrorMappingUtils.isRetryableError('AUTHENTICATION_REQUIRED')).toBe(false);
      expect(ErrorMappingUtils.isRetryableError('ACCESS_DENIED')).toBe(false);
      expect(ErrorMappingUtils.isRetryableError('RESOURCE_NOT_FOUND')).toBe(false);
      expect(ErrorMappingUtils.isRetryableError('RESOURCE_ALREADY_EXISTS')).toBe(false);
    });
  });

  describe('shouldLogError', () => {
    it('should log server errors (5xx)', () => {
      expect(ErrorMappingUtils.shouldLogError(500)).toBe(true);
      expect(ErrorMappingUtils.shouldLogError(502)).toBe(true);
      expect(ErrorMappingUtils.shouldLogError(503)).toBe(true);
      expect(ErrorMappingUtils.shouldLogError(504)).toBe(true);
    });

    it('should not log client errors (4xx)', () => {
      expect(ErrorMappingUtils.shouldLogError(400)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(401)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(403)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(404)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(409)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(429)).toBe(false);
    });

    it('should not log success responses (2xx, 3xx)', () => {
      expect(ErrorMappingUtils.shouldLogError(200)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(201)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(301)).toBe(false);
      expect(ErrorMappingUtils.shouldLogError(302)).toBe(false);
    });
  });

  describe('getErrorCodesByCategory', () => {
    it('should return all validation error codes', () => {
      const validationCodes = ErrorMappingUtils.getErrorCodesByCategory(ErrorCategory.VALIDATION);

      expect(validationCodes).toContain('VALIDATION_ERROR');
      expect(validationCodes).toContain('INVALID_INPUT');
      expect(validationCodes).toContain('MISSING_REQUIRED_FIELD');
      expect(validationCodes).toContain('INVALID_FORMAT');
      expect(validationCodes).toContain('MESSAGE_INVALID_TYPE');
      expect(validationCodes).toContain('RESULT_VALIDATION_FAILED');

      // Should not contain codes from other categories
      expect(validationCodes).not.toContain('AUTHENTICATION_REQUIRED');
      expect(validationCodes).not.toContain('RESOURCE_NOT_FOUND');
    });

    it('should return all authentication error codes', () => {
      const authCodes = ErrorMappingUtils.getErrorCodesByCategory(ErrorCategory.AUTHENTICATION);

      expect(authCodes).toContain('AUTHENTICATION_REQUIRED');
      expect(authCodes).toContain('AUTHENTICATION_FAILED');
      expect(authCodes).toContain('TOKEN_EXPIRED');
      expect(authCodes).toContain('TOKEN_INVALID');

      // Should not contain codes from other categories
      expect(authCodes).not.toContain('VALIDATION_ERROR');
      expect(authCodes).not.toContain('ACCESS_DENIED');
    });

    it('should return all database error codes', () => {
      const dbCodes = ErrorMappingUtils.getErrorCodesByCategory(ErrorCategory.DATABASE);

      expect(dbCodes).toContain('DATABASE_ERROR');
      expect(dbCodes).toContain('DATABASE_CONNECTION_FAILED');
      expect(dbCodes).toContain('DATABASE_QUERY_FAILED');
      expect(dbCodes).toContain('DATABASE_CONSTRAINT_VIOLATION');
      expect(dbCodes).toContain('DATABASE_TRANSACTION_FAILED');
      expect(dbCodes).toContain('DATABASE_TIMEOUT');
    });

    it('should return empty array for category with no codes', () => {
      // This shouldn't happen with current mappings, but tests the edge case
      const codes = ErrorMappingUtils.getErrorCodesByCategory('NON_EXISTENT' as ErrorCategory);
      expect(codes).toEqual([]);
    });
  });

  describe('getErrorCodesByStatusCode', () => {
    it('should return all 400 error codes', () => {
      const badRequestCodes = ErrorMappingUtils.getErrorCodesByStatusCode(400);

      expect(badRequestCodes).toContain('VALIDATION_ERROR');
      expect(badRequestCodes).toContain('INVALID_INPUT');
      expect(badRequestCodes).toContain('MISSING_REQUIRED_FIELD');
      expect(badRequestCodes).toContain('EXPEDITION_CANNOT_MODIFY');

      // Should not contain codes with different status codes
      expect(badRequestCodes).not.toContain('AUTHENTICATION_REQUIRED'); // 401
      expect(badRequestCodes).not.toContain('RESOURCE_NOT_FOUND'); // 404
    });

    it('should return all 404 error codes', () => {
      const notFoundCodes = ErrorMappingUtils.getErrorCodesByStatusCode(404);

      expect(notFoundCodes).toContain('RESOURCE_NOT_FOUND');
      expect(notFoundCodes).toContain('EXPEDITION_NOT_FOUND');
      expect(notFoundCodes).toContain('STARSHIP_NOT_FOUND');
      expect(notFoundCodes).toContain('TASK_NOT_FOUND');
      expect(notFoundCodes).toContain('AGENT_NOT_FOUND');

      // Should not contain codes with different status codes
      expect(notFoundCodes).not.toContain('VALIDATION_ERROR'); // 400
      expect(notFoundCodes).not.toContain('INTERNAL_SERVER_ERROR'); // 500
    });

    it('should return all 500 error codes', () => {
      const serverErrorCodes = ErrorMappingUtils.getErrorCodesByStatusCode(500);

      expect(serverErrorCodes).toContain('INTERNAL_SERVER_ERROR');
      expect(serverErrorCodes).toContain('DATABASE_ERROR');
      expect(serverErrorCodes).toContain('CONFIGURATION_ERROR');
      expect(serverErrorCodes).toContain('EXPEDITION_WORKFLOW_FAILED');

      // Should not contain codes with different status codes
      expect(serverErrorCodes).not.toContain('VALIDATION_ERROR'); // 400
      expect(serverErrorCodes).not.toContain('NETWORK_ERROR'); // 502
    });

    it('should return empty array for status code with no mapped errors', () => {
      const codes = ErrorMappingUtils.getErrorCodesByStatusCode(418); // I'm a teapot
      expect(codes).toEqual([]);
    });
  });
});

describe('StandardErrorCode type', () => {
  it('should include all expected error codes', () => {
    // Test that our mappings include all the standard error codes
    // This is more of a compile-time check but ensures completeness
    const allErrorCodes: StandardErrorCode[] = [
      'VALIDATION_ERROR',
      'INVALID_INPUT',
      'AUTHENTICATION_REQUIRED',
      'ACCESS_DENIED',
      'RESOURCE_NOT_FOUND',
      'RESOURCE_ALREADY_EXISTS',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_SERVER_ERROR',
      'DATABASE_ERROR',
      'NETWORK_ERROR',
      'SERVICE_UNAVAILABLE',
      'TIMEOUT_ERROR',
    ];

    // Verify each code has both HTTP status and category mappings
    allErrorCodes.forEach((code) => {
      expect(ERROR_HTTP_STATUS_MAP[code]).toBeDefined();
      expect(typeof ERROR_HTTP_STATUS_MAP[code]).toBe('number');
      expect(ERROR_CATEGORY_MAP[code]).toBeDefined();
      expect(Object.values(ErrorCategory)).toContain(ERROR_CATEGORY_MAP[code]);
    });
  });
});
