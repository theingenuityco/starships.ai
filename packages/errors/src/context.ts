/**
 * Simple Error Context for Starships.ai
 *
 * Provides basic context tracking for debugging without the ceremonious overhead.
 * Focus on practical information developers actually need.
 */

/**
 * Simple context for error tracking
 */
export interface ErrorContext {
  /** Where the error occurred (e.g., 'UserService.create', 'api/users') */
  location?: string;

  /** What operation was being performed */
  operation?: string;

  /** User ID if available */
  userId?: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Any additional context data */
  metadata?: Record<string, any>;
}

/**
 * Create error context with sensible defaults
 */
export function createContext(
  location: string,
  options?: {
    operation?: string;
    userId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  }
): ErrorContext {
  return {
    location,
    operation: options?.operation,
    userId: options?.userId,
    requestId: options?.requestId,
    metadata: options?.metadata,
  };
}

/**
 * Generate a simple request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract safe user ID from request or context
 */
export function extractUserId(req?: any): string | undefined {
  return req?.user?.id || req?.userId || undefined;
}

/**
 * Create context from HTTP request
 */
export function fromRequest(req: any, operation?: string): ErrorContext {
  return {
    location: `${req.method} ${req.path || req.url}`,
    operation,
    userId: extractUserId(req),
    requestId: req.id || req.requestId || generateRequestId(),
    metadata: {
      userAgent: req.get?.('user-agent'),
      ip: req.ip || req.connection?.remoteAddress,
    },
  };
}
