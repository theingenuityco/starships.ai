import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from '../services/UserService';

// Kinde JWKS endpoint for token verification
const kindeIssuerUrl = process.env.KINDE_ISSUER_URL || 'https://starships.kinde.com';
const JWKS = createRemoteJWKSet(new URL(`${kindeIssuerUrl}/.well-known/jwks`));

/**
 * Authentication middleware that validates Kinde JWT tokens
 * and resolves the user from the database
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // DEVELOPMENT BYPASS: Allow requests without auth when Kinde is not configured
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    const hasKindeConfig = process.env.KINDE_CLIENT_ID && process.env.KINDE_ISSUER_URL;
    
    console.log(`[AUTH] Environment check: NODE_ENV=${process.env.NODE_ENV}, isDevelopment=${isDevelopment}, hasKindeConfig=${hasKindeConfig}`);
    
    if (isDevelopment && !hasKindeConfig) {
      console.log(`[AUTH] Development bypass activated for ${req.method} ${req.path}`);
      
      // Create a mock user for development
      const mockUser = {
        id: 'dev-user-1',
        email: 'dev@starships.ai',
        displayName: 'Development User',
        username: 'dev-user',
        avatar: null,
        kindeId: 'dev-user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      req.user = mockUser;
      req.kindeId = 'dev-user-1';
      
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

    // DEVELOPMENT BYPASS: Check for mock token
    if (isDevelopment && !hasKindeConfig && token === 'mock-development-token') {
      console.log(`[AUTH] Mock token detected for development bypass`);
      // Reuse the same mock user from the bypass above
      const mockUser = {
        id: 'dev-user-1',
        email: 'dev@starships.ai',
        displayName: 'Development User',
        username: 'dev-user',
        avatar: null,
        kindeId: 'dev-user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      req.user = mockUser;
      req.kindeId = 'dev-user-1';
      
      console.log(`[AUTH] Mock token validated: ${mockUser.id} (${mockUser.displayName})`);
      next();
      return;
    }

    // Verify JWT token using Kinde's public keys
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: kindeIssuerUrl,
      // Note: Kinde tokens may have empty audience, so we skip audience validation
    });

    console.log(`[AUTH] Token validated for user: ${payload.sub}`);

    // Look up user in database by Kinde ID
    let user;
    try {
      user = await UserService.getUserByKindeId(payload.sub as string);
    } catch (dbError) {
      console.error(`[AUTH] Database error when looking up user: ${payload.sub}`, dbError);
      res.status(500).json({ error: 'Database error during authentication' });
      return;
    }

    if (!user) {
      console.log(
        `[AUTH] User not found in database for Kinde ID: ${payload.sub}, attempting auto-sync`
      );

      // Auto-sync user if they don't exist
      try {
        user = await UserService.syncUser({
          kindeId: payload.sub as string,
          email: (payload.email as string) || `user-${payload.sub}@unknown.com`,
          name: (payload.given_name as string) || (payload.name as string),
          avatar: payload.picture as string,
        });
        console.log(`[AUTH] User auto-synced: ${user.id} (${user.displayName || user.username})`);
      } catch (syncError: any) {
        console.error(`[AUTH] Failed to auto-sync user for Kinde ID: ${payload.sub}`, syncError);
        res
          .status(500)
          .json({
            error: 'Failed to sync user',
            details: syncError?.message || 'Unknown sync error',
          });
        return;
      }
    }

    // Attach user info to request for use in route handlers
    req.user = user;
    req.kindeId = payload.sub as string;

    console.log(`[AUTH] User resolved: ${user.id} (${user.displayName || user.username})`);

    next();
  } catch (error: any) {
    console.error('[AUTH] Token validation failed:', error);

    // Provide more specific error messages
    if (error?.name === 'JWTExpired') {
      res.status(401).json({ error: 'Token expired' });
    } else if (error?.name === 'JWTInvalid') {
      res.status(401).json({ error: 'Invalid token' });
    } else if (error?.message?.includes('JWKSNoMatchingKey')) {
      res.status(401).json({ error: 'Token signature verification failed' });
    } else {
      res
        .status(500)
        .json({
          error: 'Authentication service error',
          details: error?.message || 'Unknown auth error',
        });
    }
    return;
  }
};
