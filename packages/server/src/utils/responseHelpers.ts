/**
 * Response helpers for consistent API responses following OpenAPI standards
 */

import { isAppError } from '@starships/errors';
import type { ApiErrorResponse, ApiResponse, ApiResponseMeta, StandardErrorCode } from '@starships/protocol';
import type { Response } from 'express';

/**
 * Send standardized success response
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200, meta?: ApiResponseMeta): void {
  const response: ApiResponse<T> = { data };
  if (meta) {
    response.meta = meta;
  }
  res.status(statusCode).json(response);
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(page: number, limit: number, total: number): ApiResponseMeta {
  return {
    pagination: {
      page,
      limit,
      total,
      has_next: page * limit < total,
      has_prev: page > 1,
    },
  };
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  code: StandardErrorCode,
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>
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
 * Handle all errors and convert to standardized responses
 * Handles both AppErrors and generic errors - unified with sendError for consistency
 */
export function handleError(error: unknown, res: Response, context: string, fallbackMessage?: string): void {
  console.error(`Error in ${context}:`, error);

  // Check if it's already a structured error from @starships/errors
  if (isAppError(error)) {
    const response = error.toResponse();
    sendError(
      res,
      response.error.code as StandardErrorCode,
      response.error.message,
      error.statusCode,
      response.error.details as Record<string, unknown> | undefined
    );
    return;
  }

  // Handle generic errors with a fallback message
  const message = fallbackMessage || `Failed to ${context}`;
  sendError(res, 'INTERNAL_SERVER_ERROR', message, 500);
}
