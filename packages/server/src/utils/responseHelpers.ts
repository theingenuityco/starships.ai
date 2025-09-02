/**
 * Response helpers for consistent API responses following OpenAPI standards
 */

import type { Response } from 'express';
import { BaseError, ErrorUtils } from '@starships/errors';

// Standard response interfaces
export interface ApiResponse<T = any> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
    filters?: Record<string, any>;
    sort?: Record<string, any>;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// Error code constants
export const ERROR_CODES = {
  // Validation errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_VALUE: 'INVALID_VALUE',
  
  // Authentication/Authorization (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Resource errors (4xx)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_CONSTRAINT_VIOLATION: 'RESOURCE_CONSTRAINT_VIOLATION',
  
  // Business logic errors (4xx)
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // System errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

/**
 * Send standardized success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: ApiResponse<T>['meta']
): void {
  const response: ApiResponse<T> = { data };
  if (meta) {
    response.meta = meta;
  }
  res.status(statusCode).json(response);
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 500,
  details?: Record<string, any>
): void {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
  res.status(statusCode).json(response);
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): ApiResponse['meta'] {
  return {
    pagination: {
      page,
      limit,
      total,
      has_next: (page * limit) < total,
      has_prev: page > 1,
    },
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page?: string, limit?: string): {
  page: number;
  limit: number;
  error?: { code: string; message: string };
} {
  const pageNum = page ? parseInt(page, 10) : 1;
  const limitNum = limit ? parseInt(limit, 10) : 50;

  if (isNaN(pageNum) || pageNum < 1) {
    return {
      page: 1,
      limit: 50,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Page must be a positive integer',
      },
    };
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    return {
      page: pageNum,
      limit: 50,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Limit must be between 1 and 200',
      },
    };
  }

  return { page: pageNum, limit: limitNum };
}

/**
 * UUID validation helper
 */
export function validateUUID(id: string, fieldName: string): { 
  isValid: boolean; 
  error?: { code: string; message: string; details?: any } 
} {
  if (!id || typeof id !== 'string') {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.REQUIRED_FIELD_MISSING,
        message: `${fieldName} is required and must be a string`,
        details: { field: fieldName },
      },
    };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.INVALID_FORMAT,
        message: `${fieldName} must be a valid UUID format`,
        details: { field: fieldName, provided: id },
      },
    };
  }

  return { isValid: true };
}

/**
 * Handle common errors and convert to standardized responses
 */
export function handleCommonError(error: any, res: Response, context: string): boolean {
  console.error(`Error in ${context}:`, error);

  // Check if it's already a structured error from @starships/errors
  if (ErrorUtils.isApplicationError(error)) {
    const response = error.toResponse();
    sendError(res, response.code, response.message, response.statusCode, response.details);
    return true;
  }

  // Handle known error types by name for backward compatibility
  if (error.name === 'ValidationError' || error.constructor.name === 'ValidationError') {
    sendError(res, ERROR_CODES.VALIDATION_ERROR, error.message, 400, {
      field: error.field,
    });
    return true;
  }

  if (error.name === 'NotFoundError' || error.constructor.name === 'NotFoundError') {
    sendError(res, ERROR_CODES.RESOURCE_NOT_FOUND, error.message, 404, {
      entityType: error.entityType,
      entityId: error.entityId,
    });
    return true;
  }

  if (error.name === 'ConflictError' || error.constructor.name === 'ConflictError') {
    sendError(res, ERROR_CODES.RESOURCE_CONFLICT, error.message, 409, {
      conflictType: error.conflictType,
    });
    return true;
  }

  // Return false if not handled - caller should handle generic error
  return false;
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}