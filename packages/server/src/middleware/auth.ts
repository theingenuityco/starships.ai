import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { UserService } from '../services/UserService';
import { getEnvConfig } from '@starships/env';

const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET || 'starships-jwt-secret-key-change-in-production');
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

/**
 * Authentication middleware that validates JWT tokens
 * and resolves the user from the database
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // TESTING BACKDOOR: Only activate when explicitly enabled via environment variable
    const enableTestingBackdoor = process.env.ENABLE_AUTH_TESTING_BACKDOOR === 'true';

    if (enableTestingBackdoor) {
      console.log(`[AUTH] Testing backdoor activated for ${req.method} ${req.path}`);

      // Create a mock user for testing
      const mockUser = {
        id: 'test-user-1',
        email: 'test@starships.ai',
        displayName: 'Test User',
        username: 'test-user',
        avatar: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      req.user = mockUser;

      console.log(`[AUTH] Mock user attached: ${mockUser.id} (${mockUser.displayName})`);
      next();
      return;
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[AUTH] Missing or invalid Authorization header for ${req.method} ${req.path}`);
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Basic token validation
    if (!token || token.length < 10) {
      console.log(`[AUTH] Invalid token format for ${req.method} ${req.path}`);
      res.status(401).json({ error: 'Invalid token format' });
      return;
    }

    console.log(
      `[AUTH] Validating token for request to ${req.method} ${req.path} - token length: ${token.length}`
    );

    // TESTING BACKDOOR: Check for test token when explicitly enabled
    if (enableTestingBackdoor && token === 'test-auth-token') {
      console.log(`[AUTH] Test token detected for testing backdoor`);
      // Reuse the same mock user from the backdoor above
      const mockUser = {
        id: 'test-user-1',
        email: 'test@starships.ai',
        displayName: 'Test User',
        username: 'test-user',
        avatar: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      req.user = mockUser;

      console.log(`[AUTH] Test token validated: ${mockUser.id} (${mockUser.displayName})`);
      next();
      return;
    }

    // Verify JWT token
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    console.log(`[AUTH] Token validated for user: ${payload.sub}`);

    // Look up user in database by ID
    let user;
    try {
      console.log(`[AUTH] Attempting database lookup for user ID: ${payload.sub}`);
      user = await UserService.getUserById(payload.sub as string);
      console.log(
        `[AUTH] Database lookup completed for user ID: ${payload.sub}, result: ${user ? 'found' : 'not found'}`
      );
    } catch (dbError: any) {
      console.error(`[AUTH] Database error when looking up user: ${payload.sub}`);
      console.error(`[AUTH] Error type: ${dbError?.constructor?.name}`);
      console.error(`[AUTH] Error message: ${dbError?.message}`);
      console.error(`[AUTH] Error stack:`, dbError?.stack);
      console.error(`[AUTH] Full error object:`, dbError);
      res.status(500).json({ error: 'Database error during authentication' });
      return;
    }

    if (!user) {
      console.error(`[AUTH] User not found in database for user ID: ${payload.sub}`);
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Attach user info to request for use in route handlers
    req.user = user;

    console.log(`[AUTH] User resolved: ${user.id} (${user.displayName || user.username})`);

    next();
  } catch (error: any) {
    console.error('[AUTH] Token validation failed:', error);

    // Provide more specific error messages
    if (error?.name === 'JWTExpired') {
      res.status(401).json({ error: 'Token expired' });
    } else if (error?.name === 'JWTInvalid') {
      res.status(401).json({ error: 'Invalid token' });
    } else if (error?.message?.includes('signature verification failed')) {
      res.status(401).json({ error: 'Token signature verification failed' });
    } else {
      res.status(500).json({
        error: 'Authentication service error',
        details: error?.message || 'Unknown auth error',
      });
    }
    return;
  }
};
