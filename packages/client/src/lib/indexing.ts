import { getPublicEnvConfig } from '@starships/env/public'

export function isIndexingEnabled(): boolean {
  // Default OFF for safety across multiple instances (staging/preview).
  // Enable explicitly per environment: ENABLE_INDEXING=true
  const { ENABLE_INDEXING } = getPublicEnvConfig()
  return String(ENABLE_INDEXING || '').toLowerCase() === 'true'
}
