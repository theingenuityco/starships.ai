/**
 * Client-side environment configuration
 * This file provides type-safe access to environment variables in the client package.
 * 
 * Environment variables are loaded through:
 * 1. @starships/env-config package in next.config.js (build time)
 * 2. Next.js env config makes them available at runtime
 * 3. This file provides typed access to those variables
 */

import { getServerConfig, getClientConfig } from '@starships/env-config';

// Server-side environment (for API routes and build time)
let serverEnv: any = null;
let clientEnv: any = null;

try {
  // Only import on server-side (build time or API routes)
  if (typeof window === 'undefined') {
    serverEnv = getServerConfig();
    clientEnv = getClientConfig();
  }
} catch (error) {
  // Env config not available - this is expected in browser environment
}

/**
 * Type-safe environment variables for the client
 * All variables are loaded from @starships/env-config and exposed via Next.js
 */
export const env = {
  // Server-side variables (available in API routes and build time)
  server: serverEnv,
  
  // Client-side variables (available in browser via Next.js env config)
  client: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  
  // Kinde variables (available server-side through Next.js env config)
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
  // In browser, use NEXT_PUBLIC_API_URL or default to empty (proxy)
  if (typeof window !== 'undefined') {
    return env.client.NEXT_PUBLIC_API_URL || '';
  }
  
  // On server, can access server config if available
  if (serverEnv) {
    return clientEnv?.NEXT_PUBLIC_API_URL || `http://localhost:${serverEnv.PORT}`;
  }
  
  return '';
}

/**
 * Type definitions for environment variables
 */
export type ClientEnv = typeof env; 