import { getServerConfig, ServerEnvironmentConfig } from '@starships/env-config';

/**
 * Validated environment configuration
 * Re-exported for backward compatibility
 */
export const env: ServerEnvironmentConfig = getServerConfig();

// Legacy export for backward compatibility
export interface EnvironmentConfig extends ServerEnvironmentConfig {} 