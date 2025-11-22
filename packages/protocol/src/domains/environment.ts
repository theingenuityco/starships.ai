/**
 * Environment Types
 *
 * Types for managing encrypted environment variables at the starship level
 */

// ============================================================================
// ENVIRONMENT TYPES
// ============================================================================

/**
 * Core environment variable entity
 */
export interface EnvironmentModel {
  id: string;
  starshipId: string;
  key: string;
  encryptedValue: string;
  description?: string;
  /**
   * Optional foreign key to the connector that manages this env var (if any)
   */
  connectorId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Environment variable for API responses (excludes encryptedValue)
 */
export interface EnvironmentSummary {
  id: string;
  starshipId: string;
  key: string;
  description?: string;
  connectorId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create environment variable
 */
export interface CreateEnvironmentVariableRequest {
  key: string;
  value: string;
  description?: string;
}

/**
 * Request to update environment variable
 */
export interface UpdateEnvironmentVariableRequest {
  value?: string;
  description?: string;
}

/**
 * Environment variable response
 */
export interface EnvironmentVariableResponse {
  environment: EnvironmentSummary;
}

/**
 * Environment variables list response
 */
export interface EnvironmentVariableListResponse {
  starshipId: string;
  variables: EnvironmentSummary[];
}

/**
 * Summary of system-level environment variables that are made available to the
 * Autopilot runtime as non-secret configuration (for example via runtimeEnv).
 */
export interface SystemEnvironmentVariableSummary {
  /**
   * Name of the configuration key available at runtime (e.g. OPEN_ROUTER_KEY, DISCORD_BOT_TOKEN).
   */
  key: string;
  /**
   * Whether this key is currently configured and will be present at runtime.
   */
  present: boolean;
  /**
   * Optional human-readable description of what this key is used for.
   */
  description?: string;
}

/**
 * System environment variables list response
 */
export interface SystemEnvironmentVariableListResponse {
  systemEnv: SystemEnvironmentVariableSummary[];
}
