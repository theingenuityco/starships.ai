/**
 * Lean Error Mappings for Starships.ai
 *
 * Simple utility functions for error handling - no complex mappings needed.
 * The lean error system automatically infers categories from HTTP status codes.
 */

/**
 * Check if HTTP status indicates a retryable error
 */
export function isRetryableStatus(statusCode: number): boolean {
  // Network errors, timeouts, and server errors (5xx) are generally retryable
  return statusCode >= 500 || statusCode === 408 || statusCode === 429;
}

/**
 * Check if error should be logged (server errors only)
 */
export function shouldLogError(statusCode: number): boolean {
  return statusCode >= 500;
}

/**
 * Get error category from HTTP status code
 */
export function getCategoryFromStatus(statusCode: number): string {
  if (statusCode >= 400 && statusCode < 500) return 'client';
  if (statusCode >= 500) return 'server';
  return 'unknown';
}

/**
 * Common HTTP status codes for reference
 */
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;
