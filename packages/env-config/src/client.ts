import { ClientEnvironmentConfig } from './types';

/**
 * Parses and validates client environment configuration
 * This function is safe to run in browser environments
 */
export function loadClientEnvironment(): ClientEnvironmentConfig {
  const env = {
    SERVER_URL: process.env.SERVER_URL,
  };

  return env;
}