import { getEnvConfig, EnvironmentConfig } from '@starships/env';

/**
 * Validated environment configuration
 * Re-exported for backward compatibility
 */
export const env: EnvironmentConfig = getEnvConfig();

// Legacy export for backward compatibility
export interface ServerEnvironmentConfig extends EnvironmentConfig {}