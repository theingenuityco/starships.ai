import { useJwtAuth } from './useJwtAuth';

/**
 * Main authentication hook - wrapper around JWT auth
 * This provides a consistent interface for all components
 */
export function useAuth() {
  return useJwtAuth();
}