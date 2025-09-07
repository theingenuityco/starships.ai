/**
 * Lean Error Handling System for Starships.ai
 *
 * A simple, dev-friendly error system focused on practical usage.
 * Eliminates ceremonious constructors and complex mappings in favor of
 * clear messages and easy-to-use patterns developers actually adopt.
 */

/**
 * Base application error with only essential properties
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly category: string;
  readonly details?: any;
  readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    options?: {
      details?: any;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.category = this.inferCategory(statusCode);
    this.details = options?.details;
    this.cause = options?.cause;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Automatically categorize errors based on HTTP status code
   */
  private inferCategory(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) return 'client';
    if (statusCode >= 500) return 'server';
    return 'unknown';
  }

  /**
   * Convert to JSON for API responses and logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      category: this.category,
      details: this.details,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Convert to API response format
   */
  toResponse(): { error: { code: string; message: string; details?: any } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// =============================================================================
// COMMON ERROR TYPES - Simple constructors with dev-friendly defaults
// =============================================================================

/**
 * Validation Error (400) - For input validation failures
 */
export class ValidationError extends AppError {
  readonly field?: string;

  constructor(message: string, field?: string, details?: any, cause?: Error) {
    super(message, 'VALIDATION_ERROR', 400, { details, cause });
    this.field = field;
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        field: this.field,
        details: this.details,
      },
    };
  }
}

/**
 * Not Found Error (404) - For missing resources
 */
export class NotFoundError extends AppError {
  readonly resource: string;
  readonly id: string;

  constructor(resource: string, id: string, cause?: Error) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { cause });
    this.resource = resource;
    this.id = id;
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        resource: this.resource,
        id: this.id,
      },
    };
  }
}

/**
 * Authentication Error (401) - For auth failures
 */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication failed', cause?: Error) {
    super(message, 'AUTH_ERROR', 401, { cause });
  }
}

/**
 * Authorization Error (403) - For permission failures
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', cause?: Error) {
    super(message, 'FORBIDDEN', 403, { cause });
  }
}

/**
 * Conflict Error (409) - For resource conflicts
 */
export class ConflictError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFLICT', 409, { cause });
  }
}

/**
 * Rate Limit Error (429) - For rate limiting
 */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number, cause?: Error) {
    super(message, 'RATE_LIMIT', 429, { details: { retryAfter }, cause });
    this.retryAfter = retryAfter;
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryAfter: this.retryAfter,
      },
    };
  }
}

/**
 * Database Error (500) - For database failures
 */
export class DatabaseError extends AppError {
  readonly operation: string;

  constructor(operation: string, cause?: Error) {
    super(`Database ${operation} failed`, 'DATABASE_ERROR', 500, {
      details: { operation },
      cause,
    });
    this.operation = operation;
  }
}

/**
 * Network Error (502) - For external service failures
 */
export class NetworkError extends AppError {
  readonly service?: string;
  readonly endpoint?: string;

  constructor(service?: string, endpoint?: string, cause?: Error) {
    const message = service ? `Network error connecting to ${service}${endpoint ? ` at ${endpoint}` : ''}` : 'Network error occurred';

    super(message, 'NETWORK_ERROR', 502, {
      details: { service, endpoint },
      cause,
    });
    this.service = service;
    this.endpoint = endpoint;
  }
}

/**
 * Service Error (503) - For temporary service issues
 */
export class ServiceError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', cause?: Error) {
    super(message, 'SERVICE_ERROR', 503, { cause });
  }
}

// =============================================================================
// UTILITY FUNCTIONS - Simple patterns developers will actually use
// =============================================================================

/**
 * Create a generic error with automatic categorization
 */
export function createError(message: string, statusCode = 500, details?: any): AppError {
  const code = statusCode < 500 ? 'CLIENT_ERROR' : 'SERVER_ERROR';
  return new AppError(message, code, statusCode, { details });
}

/**
 * Wrap unknown errors into our error system
 */
export function wrapError(error: unknown, context?: string): AppError {
  if (error instanceof AppError) return error;

  const message = getErrorMessage(error);
  const contextMessage = context ? `${context}: ${message}` : message;

  return new AppError(contextMessage, 'WRAPPED_ERROR', 500, {
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Create validation error from field issues
 */
export function validationError(field: string, message: string): ValidationError {
  return new ValidationError(`Invalid ${field}: ${message}`, field);
}

/**
 * Create not found error for resources
 */
export function notFound(resource: string, id: string): NotFoundError {
  return new NotFoundError(resource, id);
}

/**
 * Extract safe error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}

/**
 * Check if error is an application error
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

/**
 * Extract error for API response
 */
export function toApiError(error: unknown): { error: { code: string; message: string; details?: any } } {
  if (error instanceof AppError) {
    return error.toResponse();
  }

  const message = getErrorMessage(error);
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message,
    },
  };
}

/**
 * Create error from HTTP response
 */
export function fromApiResponse(response: any): AppError {
  const errorData = response?.data?.error || response?.error;
  const message = errorData?.message || 'API request failed';
  const statusCode = response?.status || 500;
  const code = errorData?.code || 'API_ERROR';

  return new AppError(message, code, statusCode, {
    details: errorData?.details,
  });
}

// Legacy compatibility exports - maintain imports but mark as deprecated
/** @deprecated Use AppError instead */
export const BaseError = AppError;

/** @deprecated Use wrapError instead */
export class ErrorUtils {
  /** @deprecated Use isAppError instead */
  static isApplicationError = isAppError;

  /** @deprecated Use wrapError instead */
  static normalize = wrapError;
}
