/**
 * Connector Secrets Types
 *
 * Types for managing encrypted connector secrets at the starship level.
 *
 * NOTE: This is a DB-backed encrypted store (formerly the "environments" table).
 * It is NOT related to process environment variables.
 */

// ============================================================================
// CONNECTOR SECRETS TYPES
// ============================================================================

/**
 * Core connector secret entity (encrypted at rest)
 */
export interface ConnectorSecretModel {
  id: string;
  starshipId: string;
  key: string;
  encryptedValue: string;
  description?: string;
  /**
   * Optional foreign key to the connector that manages this secret (if any)
   */
  connectorId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Connector secret for API responses (excludes encryptedValue)
 */
export interface ConnectorSecretSummary {
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

export interface CreateConnectorSecretRequest {
  key: string;
  value: string;
  description?: string;
}

export interface UpdateConnectorSecretRequest {
  value?: string;
  description?: string;
}

export interface ConnectorSecretResponse {
  connectorSecret: ConnectorSecretSummary;
}

export interface ConnectorSecretListResponse {
  starshipId: string;
  secrets: ConnectorSecretSummary[];
}
