/**
 * JWT Utility Functions
 * 
 * Centralized JWT token generation and validation utilities
 * Extracted from duplicate code in auth routes to eliminate technical debt
 */

import { SignJWT, jwtVerify } from 'jose';
import { getEnvConfig } from '@starships/env';
import crypto from 'crypto';

// In-memory storage for authorization codes (use Redis in production)
const authCodeStorage = new Map<string, {
  userId: string;
  email: string;
  createdAt: number;
  consumed: boolean;
}>();

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

/**
 * Generate secure authorization code for OAuth token exchange
 * This replaces the vulnerable JWT-in-URL pattern
 */
export async function generateAuthCode(userId: string, email: string): Promise<string> {
  // Generate cryptographically secure random code
  const authCode = crypto.randomBytes(32).toString('hex');
  
  // Store with metadata and expiration
  authCodeStorage.set(authCode, {
    userId,
    email,
    createdAt: Date.now(),
    consumed: false,
  });
  
  // Auto-cleanup after 5 minutes
  setTimeout(() => {
    authCodeStorage.delete(authCode);
  }, 5 * 60 * 1000);
  
  return authCode;
}

/**
 * Validate and consume authorization code (one-time use)
 * Returns user data if valid, null if invalid/expired/consumed
 */
export async function validateAndConsumeAuthCode(authCode: string): Promise<{
  userId: string;
  email: string;
} | null> {
  const codeData = authCodeStorage.get(authCode);
  
  if (!codeData) {
    return null; // Code doesn't exist
  }
  
  // Check if already consumed
  if (codeData.consumed) {
    return null; // Code already used
  }
  
  // Check expiration (5 minutes)
  if (Date.now() - codeData.createdAt > 5 * 60 * 1000) {
    authCodeStorage.delete(authCode);
    return null; // Code expired
  }
  
  // Mark as consumed (one-time use)
  codeData.consumed = true;
  
  // Return user data
  return {
    userId: codeData.userId,
    email: codeData.email,
  };
}

/**
 * Clean up expired auth codes (maintenance function)
 */
export function cleanupExpiredAuthCodes(): number {
  let cleanedCount = 0;
  const now = Date.now();
  const expiration = 5 * 60 * 1000; // 5 minutes
  
  for (const [code, data] of authCodeStorage.entries()) {
    if (now - data.createdAt > expiration) {
      authCodeStorage.delete(code);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}