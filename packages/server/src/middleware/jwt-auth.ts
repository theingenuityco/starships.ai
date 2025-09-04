/**
 * JWT Authentication Middleware
 *
 * JWT-based authentication system for secure user authentication
 */

import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { UserService } from '@/services/UserService';
import { getEnvConfig } from '@starships/env';
import { sendError } from '@/utils/responseHelpers';

const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(
  env.JWT_SECRET || 'starships-jwt-secret-key-change-in-production'
);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

/**
 * JWT Authentication middleware that validates JWT tokens
 * and resolves the user from the database
 */
export const jwtAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(
        `[JWT-AUTH] Missing or invalid Authorization header for ${req.method} ${req.path}`
      );
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Missing or invalid Authorization header', 401);
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Basic token validation
    if (!token || token.length < 10) {
      console.log(`[JWT-AUTH] Invalid token format for ${req.method} ${req.path}`);
      sendError(res, 'TOKEN_INVALID', 'Invalid token format', 401);
      return;
    }

    console.log(
      `[JWT-AUTH] Validating token for request to ${req.method} ${req.path} - token length: ${token.length}`
    );

    // Verify JWT token
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    console.log(`[JWT-AUTH] Token validated for user: ${payload.sub}`);

    // Look up user in database by ID
    let user;
    try {
      console.log(`[JWT-AUTH] Attempting database lookup for user ID: ${payload.sub}`);
      user = await UserService.getUserById(payload.sub as string);
      console.log(
        `[JWT-AUTH] Database lookup completed for user ID: ${payload.sub}, result: ${user ? 'found' : 'not found'}`
      );
    } catch (dbError: any) {
      console.error(`[JWT-AUTH] Database error when looking up user: ${payload.sub}`);
      console.error(`[JWT-AUTH] Error message: ${dbError?.message}`);
      sendError(res, 'DATABASE_ERROR', 'Database error during authentication', 500);
      return;
    }

    if (!user) {
      console.log(`[JWT-AUTH] User not found in database for ID: ${payload.sub}`);
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    // Attach user info to request for use in route handlers
    req.user = user;

    console.log(`[JWT-AUTH] User resolved: ${user.id} (${user.displayName || user.username})`);

    next();
  } catch (error: any) {
    console.error('[JWT-AUTH] Token validation failed:', error);

    // Provide more specific error messages
    if (error?.name === 'JWTExpired') {
      sendError(res, 'TOKEN_EXPIRED', 'Token expired', 401);
    } else if (error?.name === 'JWTInvalid') {
      sendError(res, 'TOKEN_INVALID', 'Invalid token', 401);
    } else {
      sendError(res, 'AUTHENTICATION_FAILED', 'Authentication failed', 401);
    }
    return;
  }
};

/**
 * Optional JWT middleware - allows unauthenticated requests but attaches user if token is provided
 */
export const optionalJwtAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without user
    next();
    return;
  }

  // Token provided, validate it
  try {
    await jwtAuthMiddleware(req, res, next);
  } catch (error) {
    // If token validation fails, continue without user instead of rejecting
    console.log('[JWT-AUTH] Optional auth failed, continuing without user');
    next();
  }
};
