// ============================================================================
// NATIVE TOOL API KEY COLLECTION TYPES
// ============================================================================

/**
 * NativeToolApiKeyModel - Encrypted API key storage for native tools per starship
 *
 * Stores encrypted API keys for native tools like web scraping, email, etc.
 * Each starship can have multiple API keys for different tools.
 */
export interface NativeToolApiKeyModel {
  id: string;
  starshipId: string;
  toolName: string;
  encryptedApiKey: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to save or update an API key for a native tool
 */
export interface SaveNativeToolApiKeyRequest {
  starshipId: string;
  toolName: string;
  apiKey: string;
}

/**
 * Request to get an API key for a specific tool
 */
export interface GetNativeToolApiKeyRequest {
  starshipId: string;
  toolName: string;
}

/**
 * Response containing the decrypted API key
 */
export interface NativeToolApiKeyResponse {
  toolName: string;
  hasKey: boolean;
  apiKey?: string;
}

/**
 * Response containing all API keys for a starship
 */
export interface NativeToolApiKeyListResponse {
  starshipId: string;
  apiKeys: Record<string, string>; // toolName -> decrypted apiKey
}

/**
 * Request to delete an API key
 */
export interface DeleteNativeToolApiKeyRequest {
  starshipId: string;
  toolName: string;
}

/**
 * Request to check if an API key exists
 */
export interface CheckNativeToolApiKeyRequest {
  starshipId: string;
  toolName: string;
}

/**
 * Response for checking API key existence
 */
export interface CheckNativeToolApiKeyResponse {
  starshipId: string;
  toolName: string;
  hasKey: boolean;
}
