import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from '../services/UserService';

// Extend Request type to include user info
declare global {
  namespace Express {
    interface Request {
      user?: any;
      kindeId?: string;
    }
  }
}

// Kinde JWKS endpoint for token verification
const kindeIssuerUrl = process.env.KINDE_ISSUER_URL || 'https://starships.kinde.com';
const JWKS = createRemoteJWKSet(new URL(`${kindeIssuerUrl}/.well-known/jwks`));

/**
 * Authentication middleware that validates Kinde JWT tokens
 * and resolves the user from the database
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    
    console.log(`[AUTH] Validating token for request to ${req.path}`);
    
    // Verify JWT token using Kinde's public keys
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: kindeIssuerUrl,
      // Note: Kinde tokens may have empty audience, so we skip audience validation
    });

    console.log(`[AUTH] Token validated for user: ${payload.sub}`);

    // Look up user in database by Kinde ID
    const user = await UserService.getUserByKindeId(payload.sub as string);
    
    if (!user) {
      console.error(`[AUTH] User not found in database for Kinde ID: ${payload.sub}`);
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Attach user info to request for use in route handlers
    req.user = user;
    req.kindeId = payload.sub as string;
    
    console.log(`[AUTH] User resolved: ${user.id} (${user.displayName || user.username})`);
    
    next();
  } catch (error) {
    console.error('[AUTH] Token validation failed:', error);
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}; 