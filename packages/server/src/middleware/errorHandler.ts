/**
 * Centralized Error Handling Middleware for Starships.ai Server
 *
 * This middleware provides comprehensive error handling with standardized
 * error responses, logging, monitoring, and request correlation.
 */

import { Request, Response, NextFunction } from 'express';
import {
  BaseError,
  ErrorUtils,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ConstraintViolationError,
  DatabaseError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
  InternalServerError,
  ErrorDetails,
} from '@starships/models/src/errors';
import {
  logger,
  LogContext,
  RequestContext,
  PerformanceMonitor,
} from '@starships/models/src/logging';

/**
 * Extended Express Request interface with error handling context
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
      context?: LogContext;
    }
  }
}

/**
 * Request ID middleware - adds correlation ID to all requests
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate or extract request ID
  req.requestId = (req.headers['x-request-id'] as string) || ErrorUtils.generateRequestId();

  // Set response header for client tracking
  res.setHeader('X-Request-ID', req.requestId);

  // Create request context
  req.context = RequestContext.create(req.requestId, {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    metadata: {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      createdAt: Date.now(),
    },
  });

  // Start performance monitoring
  req.startTime = Date.now();
  PerformanceMonitor.start(req.requestId);

  next();
};

/**
 * Request logging middleware - logs incoming requests
 */
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  logger.info(`Incoming request: ${req.method} ${req.path}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    component: 'http',
    metadata: {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      query: req.query,
      // Don't log sensitive data
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
    },
  });

  next();
};

/**
 * Response logging middleware - logs outgoing responses
 */
export const responseLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Capture original end method
  const originalEnd = res.end;

  res.end = function (chunk?: any, encoding?: any, cb?: () => void): Response {
    // Calculate request duration
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    // End performance monitoring
    if (req.requestId) {
      PerformanceMonitor.end(
        req.requestId,
        `${req.method} ${req.path}`,
        res.statusCode < 400,
        res.statusCode >= 400 ? `HTTP_${res.statusCode}` : undefined,
        {
          statusCode: res.statusCode,
          method: req.method,
          path: req.path,
          userId: req.user?.id,
        }
      );
    }

    // Log response
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[logLevel](`Response: ${req.method} ${req.path} - ${res.statusCode}`, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      component: 'http',
    });

    // Cleanup request context
    if (req.requestId) {
      RequestContext.remove(req.requestId);
    }

    // Call original end method with proper return
    return originalEnd.call(res, chunk, encoding, cb);
  } as any;

  next();
};

/**
 * Main error handling middleware
 */
export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  // Skip if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Normalize error to application error
  const normalizedError = ErrorUtils.normalize(error, req.requestId, req.path);

  // Update request context with error details
  if (req.requestId && req.context) {
    RequestContext.update(req.requestId, {
      ...req.context,
      metadata: {
        ...req.context.metadata,
        error: {
          code: normalizedError.code,
          category: normalizedError.category,
          statusCode: normalizedError.statusCode,
        },
      },
    });
  }

  // Log error with context
  const logContext: LogContext = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    component: 'error-handler',
    statusCode: normalizedError.statusCode,
    operation: `${req.method} ${req.path}`,
  };

  if (normalizedError.statusCode >= 500) {
    logger.error(`Server error: ${normalizedError.message}`, logContext, normalizedError);
  } else if (normalizedError.statusCode >= 400) {
    logger.warn(`Client error: ${normalizedError.message}`, logContext, normalizedError);
  }

  // Create error response
  const errorResponse = createErrorResponse(normalizedError, req);

  // Set appropriate headers
  res.status(normalizedError.statusCode);
  res.setHeader('Content-Type', 'application/json');

  // Add rate limit headers if applicable
  if (normalizedError instanceof RateLimitError) {
    if (normalizedError.resetTime) {
      res.setHeader(
        'Retry-After',
        Math.ceil((normalizedError.resetTime.getTime() - Date.now()) / 1000)
      );
    }
    res.setHeader('X-RateLimit-Limit', normalizedError.limit);
  }

  // Send error response
  res.json({ error: errorResponse });
};

/**
 * Create standardized error response
 */
function createErrorResponse(error: BaseError, req: Request): ErrorDetails {
  const response = error.toResponse();

  // Add request context
  response.requestId = req.requestId;
  response.path = req.path;

  // Sanitize error details for production
  if (process.env.NODE_ENV === 'production') {
    // Remove sensitive information in production
    if (error instanceof DatabaseError) {
      delete response.details?.query;
    }

    if (error instanceof InternalServerError) {
      response.message = 'An internal server error occurred';
      response.details = undefined;
    }
  }

  return response;
}

/**
 * 404 Not Found handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(
    `Route not found: ${req.method} ${req.path}`,
    'Route',
    req.path,
    undefined,
    req.requestId,
    req.path
  );

  next(error);
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error helper
 */
export const createValidationError = (
  message: string,
  field?: string,
  req?: Request
): ValidationError => {
  return new ValidationError(message, field, undefined, req?.requestId, req?.path);
};

/**
 * Authorization error helper
 */
export const createAuthorizationError = (
  message: string = 'Access denied',
  requiredPermission?: string,
  req?: Request
): AuthorizationError => {
  return new AuthorizationError(
    message,
    requiredPermission,
    req?.user?.id,
    undefined,
    req?.requestId,
    req?.path
  );
};

/**
 * Not found error helper
 */
export const createNotFoundError = (
  entityType: string,
  entityId: string,
  req?: Request
): NotFoundError => {
  return new NotFoundError(
    `${entityType} with ID ${entityId} not found`,
    entityType,
    entityId,
    undefined,
    req?.requestId,
    req?.path
  );
};

/**
 * Conflict error helper
 */
export const createConflictError = (
  message: string,
  conflictType?: string,
  req?: Request
): ConflictError => {
  return new ConflictError(message, conflictType, undefined, req?.requestId, req?.path);
};

/**
 * Database error helper
 */
export const createDatabaseError = (
  message: string,
  operation?: string,
  req?: Request
): DatabaseError => {
  return new DatabaseError(message, operation, undefined, undefined, req?.requestId, req?.path);
};

/**
 * Rate limit error helper
 */
export const createRateLimitError = (
  limit: number,
  resetTime?: Date,
  req?: Request
): RateLimitError => {
  return new RateLimitError(
    'Rate limit exceeded',
    limit,
    resetTime,
    undefined,
    req?.requestId,
    req?.path
  );
};

/**
 * Service unavailable error helper
 */
export const createServiceUnavailableError = (
  service: string,
  retryAfter?: number,
  req?: Request
): ServiceUnavailableError => {
  return new ServiceUnavailableError(
    `Service ${service} is temporarily unavailable`,
    service,
    retryAfter,
    undefined,
    req?.requestId,
    req?.path
  );
};

/**
 * Error handling utilities for route handlers
 */
export const ErrorHandlerUtils = {
  validation: createValidationError,
  authorization: createAuthorizationError,
  notFound: createNotFoundError,
  conflict: createConflictError,
  database: createDatabaseError,
  rateLimit: createRateLimitError,
  serviceUnavailable: createServiceUnavailableError,

  /**
   * Handle repository errors with proper conversion
   */
  handleRepositoryError: (error: any, req?: Request): never => {
    if (ErrorUtils.isApplicationError(error)) {
      throw error;
    }

    // Convert common repository errors
    if (error?.message?.includes('not found')) {
      throw createNotFoundError('Resource', 'unknown', req);
    }

    if (error?.message?.includes('already exists')) {
      throw createConflictError('Resource already exists', 'duplicate', req);
    }

    if (error?.message?.includes('constraint')) {
      throw new ConstraintViolationError(
        error.message,
        'check',
        undefined,
        req?.requestId,
        req?.path
      );
    }

    // Default to database error
    throw createDatabaseError(error?.message || 'Database operation failed', 'unknown', req);
  },
};
