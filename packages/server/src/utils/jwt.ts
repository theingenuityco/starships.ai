/**
 * JWT Utility Functions
 * 
 * Centralized JWT token generation and validation utilities
 * Extracted from duplicate code in auth routes to eliminate technical debt
 */

import { SignJWT, jwtVerify } from 'jose';
import { getEnvConfig } from '@starships/env';
import crypto from 'crypto';

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
export async function generateOAuthState(): Promise<string> {
  return await new SignJWT({
    purpose: 'oauth_state',
    nonce: crypto.randomBytes(16).toString('hex'),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setExpirationTime('10m')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Validate OAuth state token
 */
export async function validateOAuthState(state: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload.purpose === 'oauth_state';
  } catch {
    return false;
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