/**
 * Client-side environment configuration
 * This file provides type-safe access to environment variables in the client package.
 *
 * Environment variables are loaded through:
 * 1. @starships/env package in next.config.js (build time)
 * 2. Next.js env config makes them available at runtime
 * 3. This file provides typed access to those variables
 */

import { getEnvConfig } from '@starships/env'

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
 * Get server configuration (server-side only)
 * This function will throw an error if called in the browser
 */
export function getServerConfig() {
  if (typeof window !== 'undefined') {
    throw new Error('Server config not available in browser environment')
  }

  return getEnvConfig()
}

/**
 * Type definitions for environment variables
 */
export type ClientEnv = typeof env
