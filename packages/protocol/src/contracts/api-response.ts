/**
 * Standard API Response Contracts
 *
 * These contracts define the standard response format for all API endpoints
 * to ensure consistency across server and client implementations.
 */

import type { StandardErrorCode } from '@/contracts/errors';

// Standard success response structure
export interface ApiResponse<T = unknown> {
  data: T;
  meta?: ApiResponseMeta;
}

// Metadata structure for API responses
export interface ApiResponseMeta {
  pagination?: PaginationMeta;
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
}

// Pagination metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
  has_prev: boolean;
}

// Standard error response structure
export interface ApiErrorResponse {
  error: {
    code: StandardErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
