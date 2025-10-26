/**
 * Centralized Rate Limiting Configuration
 * 
 * Enterprise-grade rate limiting using token bucket algorithm
 * with tiered limits based on endpoint sensitivity and user status.
 */

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { type Request, type Response, type NextFunction } from 'express';
import { sendError } from '@/utils/responseHelpers';
import { logger } from '@/utils/logger';

/**
 * Rate limit tier configurations (lenient limits for good UX)
 * Based on enterprise patterns from Stripe, AWS, and GitHub
 */
const RATE_LIMIT_TIERS = {
  // Authentication endpoints - very lenient for good UX
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per 15 minutes (was 15)
    message: 'Too many authentication attempts, please try again later',
  },
  
  // Sensitive operations (password reset, email verification)
  SENSITIVE: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 attempts per hour (was 10)
    message: 'Too many requests for this operation, please try again later',
  },
  
  // Financial operations - protective but reasonable
  FINANCIAL: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 transactions per hour (was 25)
    message: 'Transaction rate limit exceeded, please try again later',
  },
  
  // Standard API for authenticated users - very generous limits  
  API_AUTHENTICATED: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute (was 120)
    message: 'API rate limit exceeded',
  },
  
  // Unauthenticated API requests - fair and reasonable
  API_UNAUTHENTICATED: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute (was 50)
    message: 'API rate limit exceeded for unauthenticated requests',
  },
  
  // Messaging/streaming endpoints - very high limits for real-time features
  MESSAGING: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute (was 200)
    message: 'Message rate limit exceeded',
  },
  
  // Public endpoints (health checks, docs) - extremely generous
  PUBLIC: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500, // 500 requests per minute (was 300)
    message: 'Too many requests',
  },
} as const;

/**
 * Smart key generator - uses user ID for authenticated requests, IP for others
 */
const createKeyGenerator = (prefix: string = 'global') => {
  return (req: Request): string => {
    // For authenticated users, use their user ID (more reliable)
    if (req.user?.id) {
      return `${prefix}:user:${req.user.id}`;
    }
    
    // For unauthenticated requests, use IP address
    const ip = req.ip || 
                req.headers['x-forwarded-for'] || 
                req.headers['x-real-ip'] || 
                req.connection.remoteAddress ||
                'unknown';
    
    return `${prefix}:ip:${ip}`;
  };
};

/**
 * Standardized error handler using existing error infrastructure
 */
const rateLimitErrorHandler = (req: Request, res: Response): void => {
  logger.warn('[RATE_LIMIT] Rate limit exceeded', {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  sendError(
    res,
    'RATE_LIMIT_EXCEEDED',
    'Too many requests, please slow down',
    429,
    {
      retryAfter: res.getHeader('Retry-After'),
      limit: res.getHeader('X-RateLimit-Limit'),
      remaining: res.getHeader('X-RateLimit-Remaining'),
    }
  );
};

/**
 * Skip function to exclude health checks and certain paths
 */
const skipHealthChecks = (req: Request): boolean => {
  return req.path === '/api/v1/health';
};

/**
 * Factory function to create rate limiters
 */
const createRateLimiter = (
  tierName: keyof typeof RATE_LIMIT_TIERS,
  customOptions?: Partial<Parameters<typeof rateLimit>[0]>
): RateLimitRequestHandler => {
  const tier = RATE_LIMIT_TIERS[tierName];
  
  return rateLimit({
    windowMs: tier.windowMs,
    max: tier.max,
    message: tier.message,
    standardHeaders: true, // Send rate limit info in RateLimit-* headers
    legacyHeaders: false, // Don't send X-RateLimit-* headers
    keyGenerator: createKeyGenerator(tierName.toLowerCase()),
    handler: rateLimitErrorHandler,
    skip: skipHealthChecks,
    ...customOptions,
  });
};

/**
 * Global rate limiter - base protection for all requests (extremely generous)
 */
export const globalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute (was 500)
  message: 'Too many requests from this client',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('global'),
  handler: rateLimitErrorHandler,
  skip: skipHealthChecks,
});

/**
 * Adaptive rate limiter that adjusts based on authentication status
 */
export const adaptiveApiLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const limiter = req.user?.id 
    ? rateLimiters.apiAuthenticated 
    : rateLimiters.apiUnauthenticated;
  
  limiter(req, res, next);
};

/**
 * Pre-configured rate limiters for different use cases
 */
export const rateLimiters = {
  // Authentication endpoints
  auth: createRateLimiter('AUTH'),
  
  // Sensitive operations
  sensitive: createRateLimiter('SENSITIVE'),
  
  // Financial operations
  financial: createRateLimiter('FINANCIAL'),
  
  // Standard API for authenticated users
  apiAuthenticated: createRateLimiter('API_AUTHENTICATED'),
  
  // Standard API for unauthenticated users
  apiUnauthenticated: createRateLimiter('API_UNAUTHENTICATED'),
  
  // Messaging/streaming endpoints
  messaging: createRateLimiter('MESSAGING'),
  
  // Public endpoints
  public: createRateLimiter('PUBLIC'),
  
  // Global adaptive limiter
  adaptive: adaptiveApiLimiter,
} as const;

/**
 * Rate limiter for SSE/WebSocket connections
 */
export const streamingRateLimiter = createRateLimiter('MESSAGING', {
  skipSuccessfulRequests: true, // Only count failed connection attempts
  max: 50, // 50 connection attempts per minute (was 20)
  message: 'Too many connection attempts, please try again later',
});

// Export types for TypeScript support
export type RateLimiterTier = keyof typeof RATE_LIMIT_TIERS;