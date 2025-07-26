/**
 * FeatureFlagService - Manages feature flags for MCP deployment options
 */

import { setHttpBridgeEnabled } from './DockerServiceTemplate';

export interface FeatureFlags {
  httpBridgeEnabled: boolean;
}

/**
 * Initialize feature flags from environment variables
 */
export function initializeFeatureFlags(env?: { MCP_HTTP_BRIDGE_ENABLED?: boolean }): FeatureFlags {
  // Default to HTTP bridge enabled
  const httpBridgeEnabled = env?.MCP_HTTP_BRIDGE_ENABLED !== undefined 
    ? env.MCP_HTTP_BRIDGE_ENABLED 
    : true;

  // Set the global feature flag
  setHttpBridgeEnabled(httpBridgeEnabled);

  console.log(`[FeatureFlags] HTTP Bridge enabled: ${httpBridgeEnabled}`);

  return {
    httpBridgeEnabled
  };
}

/**
 * Toggle HTTP bridge feature flag at runtime
 */
export function toggleHttpBridge(enabled: boolean): void {
  setHttpBridgeEnabled(enabled);
  console.log(`[FeatureFlags] HTTP Bridge toggled to: ${enabled}`);
}

/**
 * Get current feature flag status
 */
export function getFeatureFlags(): FeatureFlags {
  // This would be dynamically read from the template system
  return {
    httpBridgeEnabled: true // This will be read from the actual template system
  };
}