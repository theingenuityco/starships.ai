/**
 * Standardized Error Classes
 * 
 * Provides comprehensive error classes for consistent error handling
 * across the entire expedition system.
 */

import {
  StandardErrorCode,
  ErrorCategory,
  ErrorSeverity,
  ErrorInfo,
  ErrorContext,
  ErrorResponse,
  ValidationErrorDetail,
  DatabaseErrorDetail,
  NetworkErrorDetail,
  getHttpStatusCode,
  getErrorCategory,
  getErrorSeverity,
  generateCorrelationId,
  isRetryableError
} from './errors';

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base standardized error class for the expedition system
 */
export class StandardError extends Error {
  public readonly code: StandardErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly httpStatusCode: number;
  public readonly details?: Record<string, any>;
  public readonly context?: ErrorContext;
  public readonly timestamp: string;
  public readonly correlationId: string;
  public readonly isRetryable: boolean;
  public readonly userId?: string;
  public readonly requestId?: string;

  constructor(
    code: StandardErrorCode,
    message?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    correlationId?: string,
    userId?: string,
    requestId?: string
  ) {
    super(message || code);
    
    this.name = 'StandardError';
    this.code = code;
    this.category = getErrorCategory(code);
    this.severity = getErrorSeverity(code);
    this.httpStatusCode = getHttpStatusCode(code);
    this.details = details;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.correlationId = correlationId || generateCorrelationId();
    this.isRetryable = isRetryableError(code);
    this.userId = userId;
    this.requestId = requestId;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, StandardError.prototype);
  }

  /**
   * Convert error to ErrorInfo format
   */
  toErrorInfo(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      userId: this.userId,
      requestId: this.requestId
    };
  }

  /**
   * Convert error to API response format
   */
  toErrorResponse(meta?: { version: string; environment: string; service: string }): ErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        category: this.category,
        severity: this.severity,
        details: this.details,
        timestamp: this.timestamp,
        correlationId: this.correlationId,
        requestId: this.requestId
      },
      meta
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
      category: this.category,
      severity: this.severity,
      httpStatusCode: this.httpStatusCode,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      isRetryable: this.isRetryable,
      userId: this.userId,
      requestId: this.requestId,
      stack: this.stack
    };
  }

  /**
   * Create a StandardError from a generic Error
   */
  static fromError(
    error: Error,
    code: StandardErrorCode = 'UNKNOWN_ERROR',
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): StandardError {
    const standardError = new StandardError(
      code,
      error.message,
      { originalError: error.name },
      {
        ...context,
        stackTrace: error.stack
      },
      undefined,
      userId,
      requestId
    );

    // Preserve original stack trace
    if (error.stack) {
      standardError.stack = error.stack;
    }

    return standardError;
  }
}

// ============================================================================
// SPECIALIZED ERROR CLASSES
// ============================================================================

/**
 * Validation error with detailed field information
 */
export class ValidationError extends StandardError {
  public readonly validationErrors: ValidationErrorDetail[];

  constructor(
    message: string,
    validationErrors: ValidationErrorDetail[],
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      'VALIDATION_ERROR',
      message,
      { validationErrors },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Create validation error from field errors
   */
  static fromFields(
    fieldErrors: Array<{ field: string; message: string; value?: any }>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): ValidationError {
    const validationErrors: ValidationErrorDetail[] = fieldErrors.map(error => ({
      field: error.field,
      message: error.message,
      value: error.value
    }));

    return new ValidationError(
      `Validation failed for ${fieldErrors.length} field(s)`,
      validationErrors,
      context,
      userId,
      requestId
    );
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends StandardError {
  constructor(
    code: 'AUTHENTICATION_REQUIRED' | 'AUTHENTICATION_FAILED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' = 'AUTHENTICATION_FAILED',
    message?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(code, message, details, context, undefined, userId, requestId);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends StandardError {
  constructor(
    code: 'ACCESS_DENIED' | 'INSUFFICIENT_PERMISSIONS' | 'FORBIDDEN_OPERATION' = 'ACCESS_DENIED',
    message?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(code, message, details, context, undefined, userId, requestId);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends StandardError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(
    resourceType: string,
    resourceId?: string,
    message?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    const defaultMessage = resourceId 
      ? `${resourceType} with ID '${resourceId}' not found`
      : `${resourceType} not found`;

    super(
      'RESOURCE_NOT_FOUND',
      message || defaultMessage,
      { resourceType, resourceId },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Resource conflict error
 */
export class ConflictError extends StandardError {
  public readonly resourceType: string;
  public readonly conflictReason: string;

  constructor(
    resourceType: string,
    conflictReason: string,
    message?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      'RESOURCE_CONFLICT',
      message || `${resourceType} conflict: ${conflictReason}`,
      { resourceType, conflictReason },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'ConflictError';
    this.resourceType = resourceType;
    this.conflictReason = conflictReason;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Database error with detailed information
 */
export class DatabaseError extends StandardError {
  public readonly databaseDetails: DatabaseErrorDetail;

  constructor(
    code: StandardErrorCode,
    message: string,
    databaseDetails: DatabaseErrorDetail,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(code, message, { database: databaseDetails }, context, undefined, userId, requestId);
    this.name = 'DatabaseError';
    this.databaseDetails = databaseDetails;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }

  /**
   * Create database error from generic database error
   */
  static fromDatabaseError(
    error: Error,
    operation?: string,
    table?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): DatabaseError {
    const databaseDetails: DatabaseErrorDetail = {
      operation,
      table,
      originalError: error.message
    };

    return new DatabaseError(
      'DATABASE_ERROR',
      `Database operation failed: ${error.message}`,
      databaseDetails,
      {
        ...context,
        stackTrace: error.stack
      },
      userId,
      requestId
    );
  }
}

/**
 * Network error with request details
 */
export class NetworkError extends StandardError {
  public readonly networkDetails: NetworkErrorDetail;

  constructor(
    code: StandardErrorCode,
    message: string,
    networkDetails: NetworkErrorDetail,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(code, message, { network: networkDetails }, context, undefined, userId, requestId);
    this.name = 'NetworkError';
    this.networkDetails = networkDetails;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  /**
   * Create network error from HTTP request failure
   */
  static fromHttpError(
    error: any,
    url?: string,
    method?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): NetworkError {
    const networkDetails: NetworkErrorDetail = {
      url,
      method,
      statusCode: error.response?.status,
      timeout: error.timeout
    };

    const code: StandardErrorCode = error.code === 'ECONNABORTED' 
      ? 'REQUEST_TIMEOUT' 
      : 'NETWORK_ERROR';

    return new NetworkError(
      code,
      `Network request failed: ${error.message}`,
      networkDetails,
      context,
      userId,
      requestId
    );
  }
}

/**
 * Business logic error for domain-specific rules
 */
export class BusinessLogicError extends StandardError {
  public readonly businessRule: string;

  constructor(
    code: StandardErrorCode,
    businessRule: string,
    message?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      code,
      message || `Business rule violation: ${businessRule}`,
      { ...details, businessRule },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'BusinessLogicError';
    this.businessRule = businessRule;
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

// ============================================================================
// DOMAIN-SPECIFIC ERROR CLASSES
// ============================================================================

/**
 * Expedition-specific error
 */
export class ExpeditionError extends StandardError {
  public readonly expeditionId?: string;

  constructor(
    code: StandardErrorCode,
    message?: string,
    expeditionId?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      code,
      message,
      { ...details, expeditionId },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'ExpeditionError';
    this.expeditionId = expeditionId;
    Object.setPrototypeOf(this, ExpeditionError.prototype);
  }
}

/**
 * Starship-specific error
 */
export class StarshipError extends StandardError {
  public readonly starshipId?: string;

  constructor(
    code: StandardErrorCode,
    message?: string,
    starshipId?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      code,
      message,
      { ...details, starshipId },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'StarshipError';
    this.starshipId = starshipId;
    Object.setPrototypeOf(this, StarshipError.prototype);
  }
}

/**
 * Task-specific error
 */
export class TaskError extends StandardError {
  public readonly taskId?: string;
  public readonly expeditionId?: string;

  constructor(
    code: StandardErrorCode,
    message?: string,
    taskId?: string,
    expeditionId?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      code,
      message,
      { ...details, taskId, expeditionId },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'TaskError';
    this.taskId = taskId;
    this.expeditionId = expeditionId;
    Object.setPrototypeOf(this, TaskError.prototype);
  }
}

/**
 * Agent-specific error
 */
export class AgentError extends StandardError {
  public readonly agentId?: string;

  constructor(
    code: StandardErrorCode,
    message?: string,
    agentId?: string,
    details?: Record<string, any>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ) {
    super(
      code,
      message,
      { ...details, agentId },
      context,
      undefined,
      userId,
      requestId
    );
    
    this.name = 'AgentError';
    this.agentId = agentId;
    Object.setPrototypeOf(this, AgentError.prototype);
  }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Factory functions for creating common errors
 */
export const ErrorFactory = {
  /**
   * Create a validation error
   */
  validation: (
    fieldErrors: Array<{ field: string; message: string; value?: any }>,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): ValidationError => {
    return ValidationError.fromFields(fieldErrors, context, userId, requestId);
  },

  /**
   * Create a not found error
   */
  notFound: (
    resourceType: string,
    resourceId?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): NotFoundError => {
    return new NotFoundError(resourceType, resourceId, undefined, context, userId, requestId);
  },

  /**
   * Create an authentication error
   */
  authentication: (
    message?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): AuthenticationError => {
    return new AuthenticationError('AUTHENTICATION_FAILED', message, undefined, context, userId, requestId);
  },

  /**
   * Create an authorization error
   */
  authorization: (
    message?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): AuthorizationError => {
    return new AuthorizationError('ACCESS_DENIED', message, undefined, context, userId, requestId);
  },

  /**
   * Create a conflict error
   */
  conflict: (
    resourceType: string,
    conflictReason: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): ConflictError => {
    return new ConflictError(resourceType, conflictReason, undefined, context, userId, requestId);
  },

  /**
   * Create a business logic error
   */
  businessLogic: (
    code: StandardErrorCode,
    businessRule: string,
    message?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): BusinessLogicError => {
    return new BusinessLogicError(code, businessRule, message, undefined, context, userId, requestId);
  },

  /**
   * Create an expedition error
   */
  expedition: (
    code: StandardErrorCode,
    message?: string,
    expeditionId?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): ExpeditionError => {
    return new ExpeditionError(code, message, expeditionId, undefined, context, userId, requestId);
  },

  /**
   * Create a starship error
   */
  starship: (
    code: StandardErrorCode,
    message?: string,
    starshipId?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): StarshipError => {
    return new StarshipError(code, message, starshipId, undefined, context, userId, requestId);
  },

  /**
   * Create a task error
   */
  task: (
    code: StandardErrorCode,
    message?: string,
    taskId?: string,
    expeditionId?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): TaskError => {
    return new TaskError(code, message, taskId, expeditionId, undefined, context, userId, requestId);
  },

  /**
   * Create an agent error
   */
  agent: (
    code: StandardErrorCode,
    message?: string,
    agentId?: string,
    context?: ErrorContext,
    userId?: string,
    requestId?: string
  ): AgentError => {
    return new AgentError(code, message, agentId, undefined, context, userId, requestId);
  }
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an error is a StandardError
 */
export function isStandardError(error: any): error is StandardError {
  return error instanceof StandardError;
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: any): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if an error is an AuthenticationError
 */
export function isAuthenticationError(error: any): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is an AuthorizationError
 */
export function isAuthorizationError(error: any): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

/**
 * Type guard to check if an error is a NotFoundError
 */
export function isNotFoundError(error: any): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * Type guard to check if an error is a ConflictError
 */
export function isConflictError(error: any): error is ConflictError {
  return error instanceof ConflictError;
}

/**
 * Type guard to check if an error is a DatabaseError
 */
export function isDatabaseError(error: any): error is DatabaseError {
  return error instanceof DatabaseError;
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: any): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if an error is a BusinessLogicError
 */
export function isBusinessLogicError(error: any): error is BusinessLogicError {
  return error instanceof BusinessLogicError;
}