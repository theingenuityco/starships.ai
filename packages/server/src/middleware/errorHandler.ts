/**
 * Standardized Error Handler Middleware
 *
 * Provides centralized error handling for Express routes with consistent
 * error responses, logging, and monitoring integration.
 */

import { Request, Response, NextFunction } from 'express';
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
  ErrorFactory,
  isStandardError,
} from '@starships/protocol';

import {
  StandardErrorCode,
  ErrorSeverity,
  ErrorResponse,
} from '@starships/protocol';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique correlation ID for tracking errors
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Determine if an error should be logged based on severity
 */
function shouldLogError(severity: ErrorSeverity): boolean {
  return severity === 'high' || severity === 'critical';
}

// ============================================================================
// CONFIGURATION AND TYPES
// ============================================================================

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  includeStackTrace: boolean;
  logErrors: boolean;
  enableMetrics: boolean;
  environment: 'development' | 'production' | 'test';
  service: string;
  version: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  includeStackTrace: process.env.NODE_ENV === 'development',
  logErrors: true,
  enableMetrics: true,
  environment: (process.env.NODE_ENV as any) || 'development',
  service: 'starships-api',
  version: process.env.npm_package_version || '1.0.0',
};

/**
 * Error metrics for monitoring
 */
interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Record<string, number>;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
}

// Global error metrics (in production, this would be replaced with proper metrics service)
const errorMetrics: ErrorMetrics = {
  totalErrors: 0,
  errorsByCode: {},
  errorsByCategory: {},
  errorsBySeverity: {},
  errorsByEndpoint: {},
};

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Enhanced error logger
 */
class ErrorLogger {
  private static instance: ErrorLogger;
  private config: ErrorHandlerConfig;

  private constructor(config: ErrorHandlerConfig) {
    this.config = config;
  }

  static getInstance(config: ErrorHandlerConfig = DEFAULT_CONFIG): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger(config);
    }
    return ErrorLogger.instance;
  }

  /**
   * Log error with structured format
   */
  logError(error: StandardError, req: Request, additionalContext?: Record<string, any>): void {
    if (!this.config.logErrors) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: this.getSeverityLogLevel(error.severity),
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        category: error.category,
        severity: error.severity,
        correlationId: error.correlationId,
        httpStatusCode: error.httpStatusCode,
        isRetryable: error.isRetryable,
      },
      request: {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers),
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: error.userId || (req as any).user?.id,
        requestId: error.requestId || req.get('X-Request-ID'),
      },
      context: {
        ...error.context,
        ...additionalContext,
      },
      details: error.details,
      stack: this.config.includeStackTrace ? error.stack : undefined,
    };

    // Use appropriate log level based on severity
    switch (error.severity) {
      case 'critical':
        console.error('[CRITICAL ERROR]', JSON.stringify(logEntry, null, 2));
        break;
      case 'high':
        console.error('[HIGH ERROR]', JSON.stringify(logEntry, null, 2));
        break;
      case 'medium':
        console.warn('[MEDIUM ERROR]', JSON.stringify(logEntry, null, 2));
        break;
      case 'low':
        console.info('[LOW ERROR]', JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.error('[ERROR]', JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * Log unhandled errors
   */
  logUnhandledError(error: Error, req: Request): void {
    const standardError = StandardError.fromError(
      error,
      'INTERNAL_SERVER_ERROR',
      {
        service: this.config.service,
        method: req.method,
        resource: req.path,
        operation: 'unhandled_error',
      },
      (req as any).user?.id,
      req.get('X-Request-ID')
    );

    this.logError(standardError, req, { unhandled: true });
  }

  private getSeverityLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'error';
    }
  }

  private sanitizeHeaders(headers: any): Record<string, any> {
    const sanitized = { ...headers };

    // Remove sensitive headers
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    sensitiveHeaders.forEach((header) => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}

// ============================================================================
// METRICS UTILITIES
// ============================================================================

/**
 * Update error metrics
 */
function updateErrorMetrics(error: StandardError, req: Request): void {
  if (!DEFAULT_CONFIG.enableMetrics) return;

  errorMetrics.totalErrors++;

  // Count by error code
  errorMetrics.errorsByCode[error.code] = (errorMetrics.errorsByCode[error.code] || 0) + 1;

  // Count by category
  errorMetrics.errorsByCategory[error.category] =
    (errorMetrics.errorsByCategory[error.category] || 0) + 1;

  // Count by severity
  errorMetrics.errorsBySeverity[error.severity] =
    (errorMetrics.errorsBySeverity[error.severity] || 0) + 1;

  // Count by endpoint
  const endpoint = `${req.method} ${req.path}`;
  errorMetrics.errorsByEndpoint[endpoint] = (errorMetrics.errorsByEndpoint[endpoint] || 0) + 1;
}

/**
 * Get current error metrics
 */
export function getErrorMetrics(): ErrorMetrics {
  return { ...errorMetrics };
}

/**
 * Reset error metrics (useful for testing)
 */
export function resetErrorMetrics(): void {
  errorMetrics.totalErrors = 0;
  errorMetrics.errorsByCode = {};
  errorMetrics.errorsByCategory = {};
  errorMetrics.errorsBySeverity = {};
  errorMetrics.errorsByEndpoint = {};
}

// ============================================================================
// ERROR CONVERSION UTILITIES
// ============================================================================

/**
 * Convert various error types to StandardError
 */
function convertToStandardError(error: any, req: Request): StandardError {
  // If already a StandardError, return as-is
  if (isStandardError(error)) {
    return error;
  }

  const userId = (req as any).user?.id;
  const requestId = req.get('X-Request-ID');
  const context = {
    service: DEFAULT_CONFIG.service,
    method: req.method,
    resource: req.path,
    operation: 'error_conversion',
  };

  // Handle specific error types
  if (error.name === 'ValidationError' || error.type === 'validation') {
    return ErrorFactory.validation(
      error.errors || [{ field: 'unknown', message: error.message }],
      context,
      userId,
      requestId
    );
  }

  if (error.name === 'UnauthorizedError' || error.status === 401) {
    return ErrorFactory.authentication(error.message, context, userId, requestId);
  }

  if (error.name === 'ForbiddenError' || error.status === 403) {
    return ErrorFactory.authorization(error.message, context, userId, requestId);
  }

  if (error.name === 'NotFoundError' || error.status === 404) {
    return ErrorFactory.notFound('Resource', undefined, context, userId, requestId);
  }

  if (error.name === 'ConflictError' || error.status === 409) {
    return ErrorFactory.conflict(
      'Resource',
      error.message || 'Conflict occurred',
      context,
      userId,
      requestId
    );
  }

  // Handle database errors
  if (
    error.name === 'DatabaseError' ||
    error.code?.startsWith('ER_') ||
    error.code?.startsWith('SQLITE_')
  ) {
    return ErrorFactory.businessLogic(
      'DATABASE_ERROR',
      'Database operation failed',
      error.message,
      context,
      userId,
      requestId
    );
  }

  // Handle network/HTTP errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return ErrorFactory.businessLogic(
      'NETWORK_ERROR',
      'Network operation failed',
      error.message,
      context,
      userId,
      requestId
    );
  }

  // Default to internal server error
  return StandardError.fromError(error, 'INTERNAL_SERVER_ERROR', context, userId, requestId);
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Main error handler middleware
 */
export function errorHandler(config: Partial<ErrorHandlerConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = ErrorLogger.getInstance(finalConfig);

  return (error: any, req: Request, res: Response, next: NextFunction): void => {
    // Convert to StandardError if needed
    const standardError = convertToStandardError(error, req);

    // Add request ID if not present
    if (!standardError.requestId && req.get('X-Request-ID')) {
      (standardError as any).requestId = req.get('X-Request-ID');
    }

    // Add user ID if not present
    if (!standardError.userId && (req as any).user?.id) {
      (standardError as any).userId = (req as any).user.id;
    }

    // Log error if it should be logged
    if (shouldLogError(standardError.severity)) {
      logger.logError(standardError, req);
    }

    // Update metrics
    updateErrorMetrics(standardError, req);

    // Create error response
    const errorResponse: ErrorResponse = standardError.toErrorResponse({
      version: finalConfig.version,
      environment: finalConfig.environment,
      service: finalConfig.service,
    });

    // Add stack trace in development
    if (finalConfig.includeStackTrace && standardError.stack) {
      (errorResponse.error as any).stack = standardError.stack;
    }

    // Send error response
    res.status(standardError.httpStatusCode).json(errorResponse);
  };
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler middleware
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = ErrorFactory.notFound(
    'Endpoint',
    `${req.method} ${req.path}`,
    {
      service: DEFAULT_CONFIG.service,
      method: req.method,
      resource: req.path,
      operation: 'not_found',
    },
    (req as any).user?.id,
    req.get('X-Request-ID')
  );

  next(error);
}

/**
 * Request timeout handler
 */
export function timeoutHandler(timeout: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const error = ErrorFactory.businessLogic(
          'REQUEST_TIMEOUT',
          'Request timeout',
          `Request timed out after ${timeout}ms`,
          {
            service: DEFAULT_CONFIG.service,
            method: req.method,
            resource: req.path,
            operation: 'timeout',
            metadata: { timeout },
          },
          (req as any).user?.id,
          req.get('X-Request-ID')
        );
        next(error);
      }
    }, timeout);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

/**
 * Rate limit error handler
 */
export function rateLimitErrorHandler(req: Request, res: Response, next: NextFunction): void {
  const error = ErrorFactory.businessLogic(
    'RATE_LIMIT_EXCEEDED',
    'Rate limit exceeded',
    'Too many requests, please try again later',
    {
      service: DEFAULT_CONFIG.service,
      method: req.method,
      resource: req.path,
      operation: 'rate_limit',
    },
    (req as any).user?.id,
    req.get('X-Request-ID')
  );

  next(error);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a standardized error response manually
 */
export function createErrorResponse(
  code: StandardErrorCode,
  message?: string,
  details?: Record<string, any>,
  req?: Request
): ErrorResponse {
  const error = new StandardError(
    code,
    message,
    details,
    req
      ? {
          service: DEFAULT_CONFIG.service,
          method: req.method,
          resource: req.path,
        }
      : undefined,
    undefined,
    req ? (req as any).user?.id : undefined,
    req ? req.get('X-Request-ID') : undefined
  );

  return error.toErrorResponse({
    version: DEFAULT_CONFIG.version,
    environment: DEFAULT_CONFIG.environment,
    service: DEFAULT_CONFIG.service,
  });
}

/**
 * Middleware to add request ID to all requests
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.get('X-Request-ID')) {
    const requestId = generateCorrelationId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
  }
  next();
}

/**
 * Health check endpoint for error handler
 */
export function healthCheck(req: Request, res: Response): void {
  res.json({
    success: true,
    service: DEFAULT_CONFIG.service,
    version: DEFAULT_CONFIG.version,
    environment: DEFAULT_CONFIG.environment,
    timestamp: new Date().toISOString(),
    metrics: getErrorMetrics(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ErrorLogger, DEFAULT_CONFIG as defaultErrorHandlerConfig };

// Export error classes for convenience
export {
  ErrorFactory,
  DatabaseError,
  StandardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  NetworkError,
  BusinessLogicError,
} from '@starships/protocol';

// Create ServiceUnavailableError as an alias for BusinessLogicError
export class ServiceUnavailableError extends BusinessLogicError {
  constructor(
    message: string,
    service: string,
    retryAfter?: number,
    context?: Record<string, any>,
    requestId?: string,
    resource?: string
  ) {
    super(
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
      message,
      {
        service,
        retryAfter,
        ...context,
      },
      undefined,
      requestId
    );
  }

  toResponse() {
    return this.toErrorResponse();
  }
}

// Create ErrorHandlerUtils as a utility class
export class ErrorHandlerUtils {
  static database(message: string, operation: string, req: any) {
    return ErrorFactory.businessLogic(
      'DATABASE_ERROR',
      'Database operation failed',
      message,
      {
        service: 'starships-api',
        method: req.method,
        resource: req.path,
        operation,
      },
      req.user?.id,
      req.get?.('X-Request-ID')
    );
  }
}
