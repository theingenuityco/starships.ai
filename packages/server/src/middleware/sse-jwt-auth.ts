/**
 * SSE JWT Authentication Middleware
 *
 * Special JWT middleware for Server-Sent Events that supports tokens via query parameters
 * since EventSource API cannot send custom headers
 */

import { UserService } from '@/services/UserService';
import { sendError } from '@/utils/responseHelpers';
import { getEnvConfig } from '@starships/env';
import { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';

const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

/**
 * SSE JWT Authentication middleware that validates JWT tokens from:
 * 1. Authorization header (Bearer token)
 * 2. Query parameter 'token'
 */
export const sseJwtAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    }

    // If no header token, try query parameter
    if (!token && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Missing or invalid Authorization header', 401);
      return;
    }

    // Basic token validation
    if (token.length < 10) {
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
      console.error(`[SSE-JWT-AUTH] Database error when looking up user: ${payload.sub}`);
      console.error(`[SSE-JWT-AUTH] Error message: ${dbError?.message}`);
      sendError(res, 'DATABASE_ERROR', 'Database error during authentication', 500);
      return;
    }

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    // Attach user info to request for use in route handlers
    req.user = user;

    next();
  } catch (error: any) {
    console.error('[SSE-JWT-AUTH] Token validation failed:', error);

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
