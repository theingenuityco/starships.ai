import { getServerConfig, ServerEnvironmentConfig } from '@starships/env-config';
import { initializeFeatureFlags } from '@starships/core/src/services/mcp/FeatureFlagService';

/**
 * Validated environment configuration
 * Re-exported for backward compatibility
 */
export const env: ServerEnvironmentConfig = getServerConfig();

/**
 * Initialize MCP feature flags based on environment configuration
 */
initializeFeatureFlags(env);

// Legacy export for backward compatibility
export interface EnvironmentConfig extends ServerEnvironmentConfig {} 