/**
 * Unified Error Context System for Starships.ai
 *
 * A single, lean ErrorContext interface that works across all layers
 * while leveraging native JavaScript Error APIs where possible.
 */

/**
 * Error layer types for organizing error context
 */
export enum ErrorLayer {
  API = 'api',
  SERVICE = 'service',
  REPOSITORY = 'repository',
  DATABASE = 'database',
  CLIENT = 'client',
  EXTERNAL = 'external',
}

/**
 * Unified error context for all layers - compatible with native JS Error patterns
 */
export interface ErrorContext {
  /** Component where error occurred (e.g., 'UserRepository', 'MissionService') */
  component: string;

  /** Operation being performed (e.g., 'create', 'findById', 'handleMessage') */
  operation: string;

  /** Layer where the error occurred */
  layer?: ErrorLayer;

  /** Optional resource type (e.g., 'User', 'Agent', 'Mission') */
  resource?: string;

  /** Optional resource ID */
  resourceId?: string;

  /** Optional user ID for context */
  userId?: string;

  /** Optional request ID for tracing */
  requestId?: string;

  /** Timestamp when context was created */
  timestamp: Date;

  /** User agent for client-side errors */
  userAgent?: string;

  /** Any additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Repository-specific error context (extends base ErrorContext)
 */
export interface RepositoryErrorContext extends ErrorContext {
  layer: ErrorLayer.REPOSITORY;
}

/**
 * Simple context creation utility
 */
export function createErrorContext(
  component: string,
  operation: string,
  options?: {
    layer?: ErrorLayer;
    resource?: string;
    resourceId?: string;
    userId?: string;
    requestId?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }
): ErrorContext {
  return {
    component,
    operation,
    layer: options?.layer,
    resource: options?.resource,
    resourceId: options?.resourceId,
    userId: options?.userId,
    requestId: options?.requestId,
    userAgent: options?.userAgent,
    timestamp: new Date(),
    metadata: options?.metadata,
  };
}

/**
 * Error Context Utilities - lean factory methods for common scenarios
 */
export class ErrorContextUtils {
  /**
   * Create repository error context
   */
  static repository(
    component: string,
    operation: string,
    options?: {
      resource?: string;
      resourceId?: string;
      userId?: string;
      requestId?: string;
      metadata?: Record<string, any>;
    }
  ): RepositoryErrorContext {
    return {
      ...createErrorContext(component, operation, {
        ...options,
        layer: ErrorLayer.REPOSITORY,
      }),
      layer: ErrorLayer.REPOSITORY,
    };
  }

  /**
   * Create service error context
   */
  static service(
    component: string,
    operation: string,
    options?: {
      resource?: string;
      resourceId?: string;
      userId?: string;
      requestId?: string;
      metadata?: Record<string, any>;
    }
  ): ErrorContext {
    return createErrorContext(component, operation, {
      ...options,
      layer: ErrorLayer.SERVICE,
    });
  }

  /**
   * Create API error context
   */
  static api(
    component: string,
    operation: string,
    options?: {
      resource?: string;
      resourceId?: string;
      userId?: string;
      requestId?: string;
      metadata?: Record<string, any>;
    }
  ): ErrorContext {
    return createErrorContext(component, operation, {
      ...options,
      layer: ErrorLayer.API,
    });
  }

  /**
   * Create client error context
   */
  static client(
    component: string,
    operation: string,
    options?: {
      resource?: string;
      resourceId?: string;
      userId?: string;
      requestId?: string;
      userAgent?: string;
      metadata?: Record<string, any>;
    }
  ): ErrorContext {
    // Safely get user agent - handle server-side environments
    let userAgent = options?.userAgent;
    if (!userAgent && typeof globalThis !== 'undefined' && 'navigator' in globalThis) {
      userAgent = (globalThis as any).navigator?.userAgent;
    }

    return createErrorContext(component, operation, {
      ...options,
      layer: ErrorLayer.CLIENT,
      userAgent,
    });
  }

  /**
   * Generate request ID using native crypto if available, fallback to timestamp + random
   */
  static generateRequestId(): string {
    // Check for crypto.randomUUID (Node 16.7+ and modern browsers)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return `req_${globalThis.crypto.randomUUID()}`;
    }

    // Fallback for environments without crypto.randomUUID
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enhance native Error with context - leverages modern Error patterns
   */
  static enhanceNativeError(
    error: Error,
    context: ErrorContext,
    options?: {
      preserveStack?: boolean;
    }
  ): Error {
    // Create new error with same message and name
    const enhanced = new Error(error.message);
    enhanced.name = error.name;
    enhanced.stack = options?.preserveStack ? error.stack : enhanced.stack;

    // Add original error as cause if supported (modern Error API)
    if ('cause' in Error.prototype || 'cause' in enhanced) {
      (enhanced as any).cause = error;
    }

    // Add context as non-enumerable property
    Object.defineProperty(enhanced, 'context', {
      value: context,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    return enhanced;
  }
}

/**
 * Convert context to log-friendly string
 */
export function contextToString(context: ErrorContext): string {
  const parts = [context.component, context.operation];

  if (context.layer) {
    parts.splice(0, 0, context.layer);
  }

  if (context.resource) {
    parts.push(`${context.resource}${context.resourceId ? `:${context.resourceId}` : ''}`);
  }

  if (context.requestId) {
    parts.push(`(${context.requestId})`);
  }

  return parts.join(' ');
}
