import { publicEnvConfig } from '@starships/env/public';

export function isIndexingEnabled(): boolean {
  // Default OFF for safety across multiple instances (staging/preview).
  // Enable explicitly per environment: ENABLE_INDEXING=true
  return String(publicEnvConfig.ENABLE_INDEXING || '').toLowerCase() === 'true';
}
