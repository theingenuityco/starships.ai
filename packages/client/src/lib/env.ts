/**
 * Client-side environment configuration
 * This file provides type-safe access to environment variables in the client package.
 *
 * Environment variables are loaded through:
 * 1. @starships/env-config package in next.config.js (build time)
 * 2. Next.js env config makes them available at runtime
 * 3. This file provides typed access to those variables
 */

import { loadClientEnvironment } from '@starships/env-config/client'

/**
 * Type-safe environment variables for the client
 * All variables are loaded from Next.js environment configuration
 */
export const env = {
  // Client-side variables (available in browser via Next.js env config)
  client: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
}

/**
 * Get API base URL - Now uses proxy route for runtime configuration
 * This enables environment-specific URLs without rebuilding
 */
export function getApiBaseUrl(): string {
  // Always use the proxy route which reads runtime configuration
  // This follows the same pattern as Kinde auth routes
  return '/api/backend'
}

/**
 * Get server configuration (server-side only)
 * This function will throw an error if called in the browser
 */
export async function getServerConfig() {
  if (typeof window !== 'undefined') {
    throw new Error('Server config not available in browser environment')
  }

  // Dynamic import to prevent bundling in browser
  const { getServerConfig } = await import('@starships/env-config')
  return getServerConfig()
}

/**
 * Type definitions for environment variables
 */
export type ClientEnv = typeof env
