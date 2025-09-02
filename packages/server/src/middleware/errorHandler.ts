/**
 * Standardized Error Handler Middleware
 *
 * Provides centralized error handling for Express routes with consistent
 * error responses, logging, and monitoring integration.
 */

import { Request, Response, NextFunction } from 'express';
import {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  InternalServerError,
  ServiceUnavailableError,
  StandardErrorCode,
} from '@starships/errors';

// Define local types that were previously imported from protocol
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    category: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
  meta: {
    version: string;
    environment: string;
    service: string;
  };
}

// StandardErrorCode now imported from @starships/errors

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique correlation ID for tracking errors
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
  logError(error: BaseError, req: Request, additionalContext?: Record<string, any>): void {
    if (!this.config.logErrors) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error', // Default log level since severity is not available
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        category: error.category,
        statusCode: error.statusCode,
      },
      request: {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers),
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: (req as any).user?.id,
        requestId: error.requestId || req.get('X-Request-ID'),
      },
      context: {
        // Context would be in error.details if needed
        ...additionalContext,
      },
      details: error.details,
      stack: this.config.includeStackTrace ? error.stack : undefined,
    };

    // Use appropriate log level based on severity
    // Log based on HTTP status code instead of severity
    if (error.statusCode >= 500) {
      console.error('[SERVER ERROR]', JSON.stringify(logEntry, null, 2));
    } else if (error.statusCode >= 400) {
      console.warn('[CLIENT ERROR]', JSON.stringify(logEntry, null, 2));
    } else {
      console.info('[INFO]', JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * Log unhandled errors
   */
  logUnhandledError(error: Error, req: Request): void {
    const standardError = new InternalServerError(
      error?.message || 'Unhandled error occurred',
      { originalError: error },
      req.get('X-Request-ID'),
      req.path
    );

    this.logError(standardError, req, { unhandled: true });
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
function updateErrorMetrics(error: BaseError, req: Request): void {
  if (!DEFAULT_CONFIG.enableMetrics) return;

  errorMetrics.totalErrors++;

  // Count by error code
  errorMetrics.errorsByCode[error.code] = (errorMetrics.errorsByCode[error.code] || 0) + 1;

  // Count by category
  errorMetrics.errorsByCategory[error.category] =
    (errorMetrics.errorsByCategory[error.category] || 0) + 1;

  // Count by status code range instead of severity
  const statusGroup = error.statusCode >= 500 ? 'server' : error.statusCode >= 400 ? 'client' : 'other';
  errorMetrics.errorsBySeverity[statusGroup] = (errorMetrics.errorsBySeverity[statusGroup] || 0) + 1;

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
 * Local type guard for StandardError
 */
function isStandardError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Convert various error types to StandardError
 */
function convertToStandardError(error: any, req: Request): BaseError {
  // If already a StandardError, return as-is
  if (isStandardError(error)) {
    return error;
  }

  const requestId = req.get('X-Request-ID');
  // Handle specific error types
  if (error.name === 'ValidationError' || error.type === 'validation') {
    return new ValidationError(
      error.message || 'Validation failed',
      error.field,
      { originalError: error },
      requestId,
      req.path
    );
  }

  if (error.name === 'UnauthorizedError' || error.status === 401) {
    return new AuthenticationError(
      error.message || 'Authentication failed',
      { originalError: error },
      requestId,
      req.path
    );
  }

  if (error.name === 'ForbiddenError' || error.status === 403) {
    return new AuthorizationError(
      error.message || 'Access denied',
      undefined, // requiredPermission
      undefined, // userRole
      { originalError: error },
      requestId,
      req.path
    );
  }

  if (error.name === 'NotFoundError' || error.status === 404) {
    return new NotFoundError(
      error.message || 'Resource not found',
      'Resource',
      'unknown',
      { originalError: error },
      requestId,
      req.path
    );
  }

  if (error.name === 'ConflictError' || error.status === 409) {
    return new ConflictError(
      error.message || 'Conflict occurred',
      undefined,
      { originalError: error },
      requestId,
      req.path
    );
  }

  // Handle database errors
  if (
    error.name === 'DatabaseError' ||
    error.code?.startsWith('ER_') ||
    error.code?.startsWith('SQLITE_')
  ) {
    return new DatabaseError(
      error.message || 'Database operation failed',
      'database_operation',
      undefined,
      { originalError: error },
      requestId,
      req.path
    );
  }

  // Handle network/HTTP errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return new NetworkError(
      error.message || 'Network operation failed',
      'external_service',
      undefined,
      { originalError: error },
      requestId,
      req.path
    );
  }

  // Default to internal server error
  return new InternalServerError(
    error?.message || 'Internal server error',
    { originalError: error },
    requestId,
    req.path
  );
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

  return (error: any, req: Request, res: Response): void => {
    // Convert to StandardError if needed
    const standardError = convertToStandardError(error, req);

    // Add request ID if not present
    if (!standardError.requestId && req.get('X-Request-ID')) {
      (standardError as any).requestId = req.get('X-Request-ID');
    }

    // Log error (always log server errors)
    if (standardError.statusCode >= 500) {
      logger.logError(standardError, req);
    }

    // Update metrics
    updateErrorMetrics(standardError, req);

    // Create error response using the BaseError toResponse method
    const baseResponse = standardError.toResponse();
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: baseResponse.code as any,
        message: baseResponse.message,
        category: baseResponse.category as any,
        details: baseResponse.details,
        timestamp: baseResponse.timestamp,
        requestId: baseResponse.requestId,
      },
      meta: {
        version: finalConfig.version,
        environment: finalConfig.environment,
        service: finalConfig.service,
      },
    };

    // Add stack trace in development
    if (finalConfig.includeStackTrace && standardError.stack) {
      (errorResponse.error as any).stack = standardError.stack;
    }

    // Send error response
    res.status(standardError.statusCode).json(errorResponse);
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
  const error = new NotFoundError(
    `${req.method} ${req.path} not found`,
    'Endpoint',
    `${req.method} ${req.path}`,
    undefined,
    req.get('X-Request-ID'),
    req.path
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
        const error = new InternalServerError(
          `Request timed out after ${timeout}ms`,
          { timeout, operation: 'timeout' },
          req.get('X-Request-ID'),
          req.path
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
  const error = new InternalServerError(
    'Too many requests, please try again later',
    { operation: 'rate_limit' },
    req.get('X-Request-ID'),
    req.path
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
  const error = new InternalServerError(
    message || 'Internal server error',
    details,
    req ? req.get('X-Request-ID') : undefined,
    req ? req.path : undefined
  );

  const baseResponse = error.toResponse();
  return {
    success: false,
    error: {
      code: code,
      message: baseResponse.message,
      category: baseResponse.category as any,
      details: baseResponse.details,
      timestamp: baseResponse.timestamp,
      requestId: baseResponse.requestId,
    },
    meta: {
      version: DEFAULT_CONFIG.version,
      environment: DEFAULT_CONFIG.environment,
      service: DEFAULT_CONFIG.service,
    },
  };
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
  DatabaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  NetworkError,
  InternalServerError,
  ServiceUnavailableError,
} from '@starships/errors';

// Create ErrorHandlerUtils as a utility class
export class ErrorHandlerUtils {
  static database(message: string, operation: string, req: any) {
    return new DatabaseError(
      message,
      operation,
      undefined,
      { service: 'starships-api' },
      req.get?.('X-Request-ID'),
      req.path
    );
  }
}
