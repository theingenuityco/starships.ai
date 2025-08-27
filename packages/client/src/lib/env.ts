/**
 * Client-side environment configuration
 * This file provides type-safe access to environment variables in the client package.
 * 
 * Environment variables are loaded through:
 * 1. @starships/env-config package in next.config.js (build time)
 * 2. Next.js env config makes them available at runtime
 * 3. This file provides typed access to those variables
 */

import { loadClientEnvironment } from '@starships/env-config/client';

/**
 * Type-safe environment variables for the client
 * All variables are loaded from Next.js environment configuration
 */
export const env = {
  // Client-side variables (available in browser via Next.js env config)
  client: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  
  // Kinde variables (available through Next.js env config)
  kinde: {
    CLIENT_ID: process.env.KINDE_CLIENT_ID,
    CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET,
    ISSUER_URL: process.env.KINDE_ISSUER_URL,
    SITE_URL: process.env.KINDE_SITE_URL,
    POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
    POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
    DEBUG_MODE: process.env.KINDE_DEBUG_MODE === 'true',
  }
};

/**
 * Get API base URL with fallback logic
 */
export function getApiBaseUrl(): string {
  // Use NEXT_PUBLIC_API_URL or default to server URL in development
  if (env.client.NEXT_PUBLIC_API_URL) {
    return env.client.NEXT_PUBLIC_API_URL;
  }
  
  // In development, point to the server directly
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:4000';
  }
  
  // In production, use empty string for Next.js proxy
  return '';
}

/**
 * Get server configuration (server-side only)
 * This function will throw an error if called in the browser
 */
export async function getServerConfig() {
  if (typeof window !== 'undefined') {
    throw new Error('Server config not available in browser environment');
  }
  
  // Dynamic import to prevent bundling in browser
  const { getServerConfig } = await import('@starships/env-config');
  return getServerConfig();
}

/**
 * Type definitions for environment variables
 */
export type ClientEnv = typeof env;