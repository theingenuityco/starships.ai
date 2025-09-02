/**
 * Lean Error Handling System for Starships.ai
 *
 * Contains only the core error classes that are actually needed.
 */

/**
 * Error categories for classification
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
 * Base error interface
 */
export interface ErrorDetails {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  path?: string;
  statusCode: number;
  category: ErrorCategory;
  field?: string;
  entityType?: string;
  entityId?: string;
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
 * Not Found Error (404)
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
 * Authentication Error (401)
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
 * Conflict Error (409)
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
 * Database Error (500)
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
 * Network Error (503)
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
 * Internal Server Error (500)
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
 * Rate Limit Error (429)
 */
export class RateLimitError extends BaseError {
  public readonly limit?: number;
  public readonly retryAfter?: number;
  public readonly remainingAttempts?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    limit?: number,
    retryAfter?: number,
    remainingAttempts?: number,
    details?: any,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'RATE_LIMIT_ERROR',
      429,
      ErrorCategory.RATE_LIMIT,
      details,
      requestId,
      path
    );
    this.limit = limit;
    this.retryAfter = retryAfter;
    this.remainingAttempts = remainingAttempts;
  }

  toResponse(): ErrorDetails {
    return {
      ...super.toResponse(),
      details: {
        ...this.details,
        limit: this.limit,
        retryAfter: this.retryAfter,
        remainingAttempts: this.remainingAttempts,
      },
    };
  }
}

/**
 * Service Unavailable Error (503)
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
    if (error?.name === 'ValidationError' || error?.type === 'validation') {
      return new ValidationError(
        error.message || 'Validation failed',
        error.field,
        { originalError: error },
        requestId,
        path
      );
    }

    if (error?.name === 'UnauthorizedError' || error?.status === 401) {
      return new AuthenticationError(
        error.message || 'Authentication failed',
        { originalError: error },
        requestId,
        path
      );
    }

    if (error?.name === 'ForbiddenError' || error?.status === 403) {
      return new AuthorizationError(
        error.message || 'Access denied',
        undefined, // requiredPermission
        undefined, // userRole
        { originalError: error },
        requestId,
        path
      );
    }

    if (error?.name === 'NotFoundError' || error?.status === 404) {
      return new NotFoundError(
        error.message || 'Resource not found',
        'Resource',
        'unknown',
        { originalError: error },
        requestId,
        path
      );
    }

    if (error?.name === 'ConflictError' || error?.status === 409) {
      return new ConflictError(
        error.message || 'Conflict occurred',
        undefined,
        { originalError: error },
        requestId,
        path
      );
    }

    // Handle database errors
    if (
      error?.name === 'DatabaseError' ||
      error?.code?.startsWith('ER_') ||
      error?.code?.startsWith('SQLITE_')
    ) {
      return new DatabaseError(
        error.message || 'Database operation failed',
        'database_operation',
        undefined,
        { originalError: error },
        requestId,
        path
      );
    }

    // Handle network/HTTP errors
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
      return new NetworkError(
        error.message || 'Network operation failed',
        'external_service',
        undefined,
        { originalError: error },
        requestId,
        path
      );
    }

    // Handle rate limit errors
    if (error?.status === 429 || error?.name === 'TooManyRequestsError') {
      return new RateLimitError(
        error.message || 'Rate limit exceeded',
        error.limit,
        error.retryAfter,
        error.remainingAttempts,
        { originalError: error },
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
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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