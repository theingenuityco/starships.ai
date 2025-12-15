/**
 * Platform Secret Types
 *
 * Types for managing encrypted platform-wide secrets (instance-level),
 * intended for instance admins only.
 *
 * IMPORTANT: API responses must never include decrypted secret values.
 */

// ============================================================================
// PLATFORM SECRET TYPES
// ============================================================================

export interface PlatformSecretSummary {
  id: string;
  key: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface PlatformSecretListResponse {
  secrets: PlatformSecretSummary[];
}

export interface PlatformSecretResponse {
  secret: PlatformSecretSummary;
}

export interface CreatePlatformSecretRequest {
  key: string;
  value: string;
  description?: string;
}

export interface UpdatePlatformSecretRequest {
  value?: string;
  description?: string;
}

