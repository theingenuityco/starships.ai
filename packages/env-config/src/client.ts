import { ClientEnvironmentConfig } from './types';

/**
 * Parses and validates client environment configuration
 * This function is safe to run in browser environments
 */
export function loadClientEnvironment(): ClientEnvironmentConfig {
  const env = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  };

  return env;
}