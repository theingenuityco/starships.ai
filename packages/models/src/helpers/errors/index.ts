/**
 * Comprehensive Error Handling System for Starships.ai
 *
 * This module provides a standardized error hierarchy with proper categorization,
 * error codes, and structured error responses for consistent error handling
 * across all layers of the application.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Base error interface for all application errors
 */
export interface ErrorDetails {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  path?: string;
  field?: string;
  entityType?: string;
  entityId?: string;
  constraintType?: string;
  statusCode: number;
  category: ErrorCategory;
}

/**
 * Error categories for classification and monitoring
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  DATABASE = 'database',
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  INTERNAL = 'internal',
}

/**
 * Base application error class
 */
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly category: ErrorCategory;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly path?: string;
  public readonly details?: any;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    category: ErrorCategory,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.category = category;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
    this.path = path;
    this.details = details;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert error to standardized response format
   */
  toResponse(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      path: this.path,
      statusCode: this.statusCode,
      category: this.category,
    };
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      timestamp: this.timestamp,
      requestId: this.requestId,
      path: this.path,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Validation Error (400)
 * Used for input validation failures, malformed requests, etc.
 */
export class ValidationError extends BaseError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: any, requestId?: string, path?: string) {
    super(message, 'VALIDATION_ERROR', 400, ErrorCategory.VALIDATION, details, requestId, path);
    this.field = field;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      field: this.field,
    };
  }
}

/**
 * Authentication Error (401)
 * Used for authentication failures, invalid tokens, etc.
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string = 'Authentication required',
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'AUTHENTICATION_ERROR',
      401,
      ErrorCategory.AUTHENTICATION,
      details,
      requestId,
      path
    );
  }
}

/**
 * Authorization Error (403)
 * Used for permission/access control failures
 */
export class AuthorizationError extends BaseError {
  public readonly requiredPermission?: string;
  public readonly userRole?: string;

  constructor(
    message: string = 'Access denied',
    requiredPermission?: string,
    userRole?: string,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'AUTHORIZATION_ERROR',
      403,
      ErrorCategory.AUTHORIZATION,
      details,
      requestId,
      path
    );
    this.requiredPermission = requiredPermission;
    this.userRole = userRole;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        requiredPermission: this.requiredPermission,
        userRole: this.userRole,
      },
    };
  }
}

/**
 * Not Found Error (404)
 * Used when requested resources don't exist
 */
export class NotFoundError extends BaseError {
  public readonly entityType: string;
  public readonly entityId: string;

  constructor(
    message: string,
    entityType: string,
    entityId: string,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'NOT_FOUND_ERROR', 404, ErrorCategory.NOT_FOUND, details, requestId, path);
    this.entityType = entityType;
    this.entityId = entityId;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      entityType: this.entityType,
      entityId: this.entityId,
    };
  }
}

/**
 * Conflict Error (409)
 * Used for resource conflicts, duplicate entries, etc.
 */
export class ConflictError extends BaseError {
  public readonly conflictType?: string;

  constructor(
    message: string,
    conflictType?: string,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'CONFLICT_ERROR', 409, ErrorCategory.CONFLICT, details, requestId, path);
    this.conflictType = conflictType;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        conflictType: this.conflictType,
      },
    };
  }
}

/**
 * Constraint Violation Error (400/409)
 * Used for database constraint violations
 */
export class ConstraintViolationError extends BaseError {
  public readonly constraintType: 'unique' | 'foreign_key' | 'check';

  constructor(
    message: string,
    constraintType: 'unique' | 'foreign_key' | 'check',
    details?: any,
    requestId?: string,
    path?: string
  ) {
    const statusCode = constraintType === 'unique' ? 409 : 400;
    super(
      message,
      'CONSTRAINT_VIOLATION_ERROR',
      statusCode,
      ErrorCategory.CONFLICT,
      details,
      requestId,
      path
    );
    this.constraintType = constraintType;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      constraintType: this.constraintType,
    };
  }
}

/**
 * Database Error (500)
 * Used for database connection issues, query failures, etc.
 */
export class DatabaseError extends BaseError {
  public readonly operation?: string;
  public readonly query?: string;

  constructor(
    message: string,
    operation?: string,
    query?: string,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'DATABASE_ERROR', 500, ErrorCategory.DATABASE, details, requestId, path);
    this.operation = operation;
    this.query = query;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        operation: this.operation,
        // Don't expose query in production for security
        ...(process.env.NODE_ENV !== 'production' && { query: this.query }),
      },
    };
  }
}

/**
 * Network Error (502/503)
 * Used for external service communication failures
 */
export class NetworkError extends BaseError {
  public readonly service?: string;
  public readonly endpoint?: string;

  constructor(
    message: string,
    service?: string,
    endpoint?: string,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'NETWORK_ERROR', 503, ErrorCategory.NETWORK, details, requestId, path);
    this.service = service;
    this.endpoint = endpoint;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        service: this.service,
        endpoint: this.endpoint,
      },
    };
  }
}

/**
 * Rate Limit Error (429)
 * Used when rate limits are exceeded
 */
export class RateLimitError extends BaseError {
  public readonly limit: number;
  public readonly resetTime?: Date;

  constructor(
    message: string = 'Rate limit exceeded',
    limit: number,
    resetTime?: Date,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, ErrorCategory.RATE_LIMIT, details, requestId, path);
    this.limit = limit;
    this.resetTime = resetTime;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        limit: this.limit,
        resetTime: this.resetTime?.toISOString(),
      },
    };
  }
}

/**
 * Service Unavailable Error (503)
 * Used when services are temporarily unavailable
 */
export class ServiceUnavailableError extends BaseError {
  public readonly service?: string;
  public readonly retryAfter?: number;

  constructor(
    message: string = 'Service temporarily unavailable',
    service?: string,
    retryAfter?: number,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'SERVICE_UNAVAILABLE_ERROR',
      503,
      ErrorCategory.SERVICE_UNAVAILABLE,
      details,
      requestId,
      path
    );
    this.service = service;
    this.retryAfter = retryAfter;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        service: this.service,
        retryAfter: this.retryAfter,
      },
    };
  }
}

/**
 * Internal Server Error (500)
 * Used for unexpected internal errors
 */
export class InternalServerError extends BaseError {
  constructor(
    message: string = 'Internal server error',
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(message, 'INTERNAL_SERVER_ERROR', 500, ErrorCategory.INTERNAL, details, requestId, path);
  }
}

/**
 * Error factory for creating errors with context
 */
export class ErrorFactory {
  /**
   * Create error with request context
   */
  static createWithContext(
    ErrorClass: new (...args: any[]) => BaseError,
    message: string,
    requestId?: string,
    path?: string,
    ...additionalArgs: any[]
  ): BaseError {
    return new ErrorClass(message, ...additionalArgs, requestId, path);
  }

  /**
   * Create validation error with field context
   */
  static validation(
    message: string,
    field?: string,
    requestId?: string,
    path?: string
  ): ValidationError {
    return new ValidationError(message, field, undefined, requestId, path);
  }

  /**
   * Create not found error with entity context
   */
  static notFound(
    entityType: string,
    entityId: string,
    requestId?: string,
    path?: string
  ): NotFoundError {
    return new NotFoundError(
      `${entityType} with ID ${entityId} not found`,
      entityType,
      entityId,
      undefined,
      requestId,
      path
    );
  }

  /**
   * Create database error with operation context
   */
  static database(
    message: string,
    operation?: string,
    query?: string,
    requestId?: string,
    path?: string
  ): DatabaseError {
    return new DatabaseError(message, operation, query, undefined, requestId, path);
  }
}

/**
 * Error utilities for common operations
 */
export class ErrorUtils {
  /**
   * Check if error is a known application error
   */
  static isApplicationError(error: any): error is BaseError {
    return error instanceof BaseError;
  }

  /**
   * Convert unknown error to application error
   */
  static normalize(error: any, requestId?: string, path?: string): BaseError {
    if (ErrorUtils.isApplicationError(error)) {
      return error;
    }

    // Handle specific error types
    if (error?.name === 'ValidationError') {
      return new ValidationError(error.message, error.field, undefined, requestId, path);
    }

    if (error?.name === 'CastError' || error?.name === 'TypeError') {
      return new ValidationError(
        'Invalid data format',
        undefined,
        { originalError: error.message },
        requestId,
        path
      );
    }

    // Default to internal server error
    return new InternalServerError(
      error?.message || 'An unexpected error occurred',
      { originalError: error },
      requestId,
      path
    );
  }

  /**
   * Generate correlation ID for request tracking
   */
  static generateRequestId(): string {
    return uuidv4();
  }

  /**
   * Extract error details for logging
   */
  static extractLogDetails(error: BaseError): Record<string, any> {
    return {
      errorName: error.name,
      errorCode: error.code,
      errorMessage: error.message,
      statusCode: error.statusCode,
      category: error.category,
      timestamp: error.timestamp,
      requestId: error.requestId,
      path: error.path,
      details: error.details,
      stack: error.stack,
    };
  }
}

// Re-export legacy error classes for backward compatibility
export {
  ValidationError as LegacyValidationError,
  ConstraintViolationError as LegacyConstraintViolationError,
  NotFoundError as LegacyNotFoundError,
};