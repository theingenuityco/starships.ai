/**
 * Rate Limiting Middleware - Email verification protection
 * 
 * Provides targeted rate limiting for email-related endpoints to prevent:
 * - Email bombing attacks
 * - Registration spam
 * - Verification email abuse
 */

import { rateLimit } from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Rate limit for email verification endpoints
 * Prevents email bombing attacks on verification/registration endpoints
 * 
 * Configuration:
 * - 5 requests per 15 minutes per IP for registration
 * - 3 requests per 5 minutes per IP for resend verification
 * - 429 status code with descriptive error message
 */
export const emailVerificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: {
    error: {
      message: 'Too many verification attempts. Please try again in 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
      type: 'RATE_LIMIT_ERROR'
    }
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use IP address as the key - fail secure if IP unavailable
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!ip) {
      throw new Error('Cannot determine client IP address for rate limiting');
    }
    return ip;
  },
  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many verification attempts. Please try again in 15 minutes.',
        code: 'RATE_LIMIT_EXCEEDED',
        type: 'RATE_LIMIT_ERROR'
      }
    });
  },
  // Skip successful requests (only count failed attempts)
  skipSuccessfulRequests: false,
  // Skip failed requests to not double-penalize
  skipFailedRequests: false,
});

/**
 * Stricter rate limit for resend verification endpoint
 * More restrictive to prevent email bombing specifically
 * 
 * Configuration:
 * - 3 requests per 5 minutes per IP for resend operations
 * - 429 status code with specific resend error message
 */
export const resendVerificationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 requests per window per IP
  message: {
    error: {
      message: 'Too many resend requests. Please check your email or try again in 5 minutes.',
      code: 'RESEND_RATE_LIMIT_EXCEEDED',
      type: 'RATE_LIMIT_ERROR'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!ip) {
      throw new Error('Cannot determine client IP address for rate limiting');
    }
    return ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many resend requests. Please check your email or try again in 5 minutes.',
        code: 'RESEND_RATE_LIMIT_EXCEEDED',
        type: 'RATE_LIMIT_ERROR'
      }
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * General registration rate limit
 * Prevents rapid registration attempts while allowing legitimate use
 * 
 * Configuration:
 * - 10 requests per hour per IP for registration attempts
 * - Allows for legitimate retry scenarios
 */
export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registration attempts per hour per IP
  message: {
    error: {
      message: 'Too many registration attempts. Please try again in an hour.',
      code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
      type: 'RATE_LIMIT_ERROR'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!ip) {
      throw new Error('Cannot determine client IP address for rate limiting');
    }
    return ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many registration attempts. Please try again in an hour.',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        type: 'RATE_LIMIT_ERROR'
      }
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Password reset rate limit
 * Prevents email bombing attacks on password reset endpoint
 * 
 * Configuration:
 * - 5 requests per 15 minutes per IP for password reset attempts
 * - 429 status code with descriptive error message
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: {
    error: {
      message: 'Too many password reset attempts. Please try again in 15 minutes.',
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
      type: 'RATE_LIMIT_ERROR'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!ip) {
      throw new Error('Cannot determine client IP address for rate limiting');
    }
    return ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many password reset attempts. Please try again in 15 minutes.',
        code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
        type: 'RATE_LIMIT_ERROR'
      }
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});