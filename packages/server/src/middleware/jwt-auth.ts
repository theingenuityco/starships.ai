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
import { logger } from '@/utils/logger';

const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

/**
 * JWT Authentication middleware that validates JWT tokens
 * and resolves the user from the database
 */
export const jwtAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Missing or invalid Authorization header', 401);
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Basic token validation
    if (!token || token.length < 10) {
      sendError(res, 'TOKEN_INVALID', 'Invalid token format', 401);
      return;
    }

    // Verify JWT token
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Look up user in database by ID
    let user;
    try {
      user = await UserService.getUserById(payload.sub as string);
    } catch (dbError: any) {
      logger.error('[JWT-AUTH] Database error during user lookup', {
        userId: payload.sub,
        error: dbError?.message,
        operation: 'user_lookup',
      });
      sendError(res, 'DATABASE_ERROR', 'Database error during authentication', 500);
      return;
    }

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    // Attach user info to request for use in route handlers
    req.user = user;

    // Attach authenticated context (user + optional agent/starship) for downstream attribution
    try {
      const agentId = typeof (payload as any).agentId === 'string' ? (payload as any).agentId : undefined;
      const starshipId = typeof (payload as any).starshipId === 'string' ? (payload as any).starshipId : undefined;
      (req as any).authContext = {
        userId: user.id,
        agentId,
        starshipId,
      };
    } catch {
      // Non-fatal: if we cannot derive authContext, continue with user-only context.
    }

    next();
  } catch (error: any) {
    logger.error('[JWT-AUTH] Token validation failed', {
      error: error?.message,
      operation: 'token_validation',
    });

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
export const optionalJwtAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without user
    next();
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  // IMPORTANT: This middleware is intentionally "best effort".
  // If a token is present but invalid/expired/unresolvable, we treat the request as anonymous.
  // This is required for public APIs (e.g. agent-templates) to work even when clients send stale tokens.
  if (!token || token.length < 10) {
    next();
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const userId = payload.sub as string | undefined;
    if (!userId || !userId.trim()) {
      next();
      return;
    }

    let user = null;
    try {
      user = await UserService.getUserById(userId);
    } catch (dbError: any) {
      // Best-effort: on DB issues, don't block public endpoints.
      logger.warn('[OPTIONAL-JWT-AUTH] Database error during user lookup (continuing anonymous)', {
        userId,
        error: dbError?.message,
        operation: 'user_lookup',
      });
      next();
      return;
    }

    if (!user) {
      next();
      return;
    }

    req.user = user;

    // Attach authenticated context (user + optional agent/starship) for downstream attribution
    try {
      const agentId = typeof (payload as any).agentId === 'string' ? (payload as any).agentId : undefined;
      const starshipId = typeof (payload as any).starshipId === 'string' ? (payload as any).starshipId : undefined;
      (req as any).authContext = {
        userId: user.id,
        agentId,
        starshipId,
      };
    } catch {
      // Non-fatal: if we cannot derive authContext, continue with user-only context.
    }

    next();
  } catch (error: any) {
    // Best-effort: invalid/expired tokens should not cause a 401 here.
    logger.debug('[OPTIONAL-JWT-AUTH] Token validation failed (continuing anonymous)', {
      error: error?.message,
      operation: 'token_validation',
    });
    next();
  }
};
