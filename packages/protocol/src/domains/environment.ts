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
