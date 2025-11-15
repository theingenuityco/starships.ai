/**
 * JWT Utility Functions
 * 
 * Centralized JWT token generation and validation utilities
 * Extracted from duplicate code in auth routes to eliminate technical debt
 */

import { SignJWT, jwtVerify } from 'jose';
import { getEnvConfig } from '@starships/env';
import crypto from 'crypto';
import { OAuthAuthCodeRepository } from '@starships/models';

const env = getEnvConfig();
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

export interface JWTUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Generate JWT token for authenticated user (EXTRACTED FROM DUPLICATE CODE)
 */
export async function generateJWT(user: JWTUser): Promise<string> {
  return await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name || user.email?.split('@')[0],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Generate OAuth state token for CSRF protection
 */
export async function generateOAuthState(
  isLinking: boolean = false,
  userId?: string,
  context?: Record<string, unknown>,
): Promise<string> {
  const payload: any = {
    purpose: 'oauth_state',
    nonce: crypto.randomBytes(16).toString('hex'),
    isLinking,
  };
  
  // If linking, include the authenticated user ID for security
  if (isLinking && userId) {
    payload.userId = userId;
  }

  if (context && typeof context === 'object') {
    payload.context = context;
  }
  
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setExpirationTime('10m')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Validate OAuth state token
 */
export async function validateOAuthState(
  state: string,
): Promise<{ valid: boolean; isLinking?: boolean; userId?: string; context?: Record<string, unknown> }> {
  try {
    const { payload } = await jwtVerify(state, JWT_SECRET, { issuer: JWT_ISSUER });
    if (payload.purpose === 'oauth_state') {
      return { 
        valid: true, 
        isLinking: payload.isLinking as boolean,
        userId: payload.userId as string | undefined,
        context: (payload as any).context as Record<string, unknown> | undefined,
      };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Verify JWT token (for middleware use)
 */
export async function verifyJWT(token: string) {
  return await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

// Initialize repository for OAuth auth codes
const oauthCodeRepo = new OAuthAuthCodeRepository();

/**
 * Generate secure authorization code for OAuth token exchange
 * Database-backed, production-ready implementation
 */
export async function generateAuthCode(userId: string, email: string): Promise<string> {
  return await oauthCodeRepo.generateCode(userId, email);
}

/**
 * Validate and consume authorization code (one-time use)
 * Atomic database operation prevents race conditions
 */
export async function validateAndConsumeAuthCode(authCode: string): Promise<{
  userId: string;
  email: string;
} | null> {
  return await oauthCodeRepo.validateAndConsumeCode(authCode);
}

// Database automatically handles cleanup via expires_at constraint - no manual cleanup needed