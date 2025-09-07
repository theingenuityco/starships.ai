/**
 * Native API Key Service - Layer 4
 *
 * Contains business logic for native API key management.
 * Follows the layered architecture pattern established by other services.
 */

import { NotFoundError, ValidationError } from '@starships/errors';
import { NativeToolApiKeyRepository, StarshipRepository } from '@starships/models';
import type { StarshipModel } from '@starships/protocol';

export class NativeApiKeyService {
  private apiKeyRepository: NativeToolApiKeyRepository;
  private starshipRepository: StarshipRepository;

  constructor() {
    this.apiKeyRepository = new NativeToolApiKeyRepository();
    this.starshipRepository = new StarshipRepository();
  }

  // ============================================================================
  // BUSINESS LOGIC METHODS
  // ============================================================================

  /**
   * Validate starship exists and user has access
   */
  async validateStarshipAccess(starshipId: string, userId: string): Promise<StarshipModel> {
    const starship = await this.starshipRepository.findById(starshipId);

    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    if (starship.ownerId !== userId) {
      throw new ValidationError('Access denied to this starship', 'starshipId');
    }

    return starship;
  }

  /**
   * Get all API keys for a starship (returns masked keys for security)
   */
  async getStarshipApiKeys(starshipId: string, userId: string): Promise<Record<string, string>> {
    // Validate starship access first
    await this.validateStarshipAccess(starshipId, userId);

    // Get API keys (returns decrypted keys)
    const apiKeys = await this.apiKeyRepository.getAllApiKeys(starshipId);

    // Return keys with masked values for security
    const maskedKeys: Record<string, string> = {};
    for (const [tool, key] of Object.entries(apiKeys)) {
      const keyStr = String(key || '');
      if (keyStr && keyStr.length > 8) {
        maskedKeys[tool] = `${keyStr.slice(0, 4)}${'*'.repeat(keyStr.length - 8)}${keyStr.slice(-4)}`;
      } else {
        maskedKeys[tool] = keyStr ? '*'.repeat(keyStr.length) : '';
      }
    }

    return maskedKeys;
  }

  /**
   * Save or update a native tool API key
   */
  async saveApiKey(starshipId: string, userId: string, toolName: string, apiKey: string): Promise<void> {
    // Business validation
    if (!toolName?.trim()) {
      throw new ValidationError('Tool name is required', 'toolName');
    }

    if (!apiKey?.trim()) {
      throw new ValidationError('API key is required', 'apiKey');
    }

    // Validate starship access first
    await this.validateStarshipAccess(starshipId, userId);

    // Save the API key (it will be encrypted)
    await this.apiKeyRepository.saveApiKey(starshipId, toolName.trim(), apiKey.trim());
  }

  /**
   * Delete a native tool API key
   */
  async deleteApiKey(starshipId: string, userId: string, toolName: string): Promise<void> {
    // Business validation
    if (!toolName?.trim()) {
      throw new ValidationError('Tool name is required', 'toolName');
    }

    // Validate starship access first
    await this.validateStarshipAccess(starshipId, userId);

    // Delete the API key
    await this.apiKeyRepository.deleteApiKey(starshipId, toolName.trim());
  }
}
