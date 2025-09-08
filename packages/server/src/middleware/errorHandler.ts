/**
 * Lean Error Handler Middleware
 *
 * Simplified error handling using @starships/errors package
 */

import { AppError, NotFoundError, wrapError } from '@starships/errors';
import { NextFunction, Request, Response } from 'express';

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  includeStackTrace?: boolean;
  environment?: string;
  service?: string;
  version?: string;
}

/**
 * Default configuration with generic values
 */
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  includeStackTrace: false,
  environment: 'development',
  service: 'api',
};

/**
 * Error response format
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    category: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    stack?: string;
  };
  meta: {
    version: string;
    environment: string;
    service: string;
  };
}

/**
 * Generate request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Simple error logging
 */
function logError(error: AppError, req: Request): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
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
      requestId: req.get('X-Request-ID'),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: (req as any).user?.id,
    },
    details: error.details,
  };

  if (error.statusCode >= 500) {
    console.error('[ERROR]', JSON.stringify(logEntry, null, 2));
  } else if (process.env.NODE_ENV === 'development') {
    console.warn('[CLIENT ERROR]', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Main error handler middleware
 */
export function errorHandler(config: ErrorHandlerConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return (error: any, req: Request, res: Response, next: NextFunction): void => {
    // Use wrapError from @starships/errors to convert error
    const standardError = wrapError(error, req.path || 'unknown route');

    // Log server errors
    if (standardError.statusCode >= 500) {
      logError(standardError, req);
    }

    // Create standardized response using AppError.toResponse()
    const baseResponse = standardError.toResponse();
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: baseResponse.error.code,
        message: baseResponse.error.message,
        category: standardError.category,
        details: baseResponse.error.details,
        timestamp: new Date().toISOString(),
        requestId: req.get('X-Request-ID'),
        ...(finalConfig.includeStackTrace && standardError.stack && { stack: standardError.stack }),
      },
      meta: {
        version: finalConfig.version || '1.0.0',
        environment: finalConfig.environment!,
        service: finalConfig.service!,
      },
    };

    res.status(standardError.statusCode).json(errorResponse);
  };
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(fn: (req: T, res: U, next: NextFunction) => Promise<any>) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler middleware
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new NotFoundError('Endpoint', `${req.method} ${req.path}`);

  next(error);
}

/**
 * Request ID middleware
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.get('X-Request-ID')) {
    const requestId = generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
  }
  next();
}
