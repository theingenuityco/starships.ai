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