import { getConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import crypto from 'crypto';

export class NativeToolApiKeyRepository extends BaseRepository {
  private algorithm = 'aes-256-gcm';
  private secretKey: Buffer;

  constructor() {
    super('NativeToolApiKeyRepository');
    // Use environment variable or generate a key (in production, use a proper key management service)
    const secret = process.env.API_KEY_ENCRYPTION_SECRET || 'default-secret-change-in-production';
    this.secretKey = crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypt an API key
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Cast to any to access getAuthTag method
    const authTag = (cipher as any).getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt an API key
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
    // Cast to any to access setAuthTag method
    (decipher as any).setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Save or update an API key for a starship and tool
   */
  async saveApiKey(starshipId: string, toolName: string, apiKey: string): Promise<void> {
    // Basic validation - entities handle detailed validation
    if (!starshipId || !toolName || !apiKey) {
      this.handleValidationError([{ field: 'parameters', message: 'starshipId, toolName, and apiKey are all required' }], 'saveApiKey');
    }

    return this.executeWithErrorHandling(
      async () => {
        const encryptedApiKey = this.encrypt(apiKey);
        const connection = getConnection();

        await connection.executeWrite(
          `
        MERGE (k:NativeToolApiKey {starshipId: $starshipId, toolName: $toolName})
        SET k.encryptedApiKey = $encryptedApiKey,
            k.updatedAt = datetime(),
            k.id = CASE WHEN k.id IS NULL THEN randomUUID() ELSE k.id END,
            k.createdAt = CASE WHEN k.createdAt IS NULL THEN datetime() ELSE k.createdAt END
        `,
          { starshipId, toolName, encryptedApiKey }
        );
      },
      'saveApiKey',
      'NativeToolApiKey',
      `${starshipId}:${toolName}`
    );
  }

  /**
   * Get an API key for a starship and tool
   */
  async getApiKey(starshipId: string, toolName: string): Promise<string | null> {
    // Basic validation - entities handle detailed validation
    if (!starshipId || !toolName) {
      this.handleValidationError([{ field: 'parameters', message: 'starshipId and toolName are required' }], 'getApiKey');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ encryptedApiKey: string }>(
          `
        MATCH (k:NativeToolApiKey {starshipId: $starshipId, toolName: $toolName})
        RETURN k.encryptedApiKey as encryptedApiKey
        `,
          { starshipId, toolName }
        );

        if (result.length === 0) {
          return null;
        }

        const encryptedApiKey = result[0].encryptedApiKey;
        return this.decrypt(encryptedApiKey);
      },
      'getApiKey',
      'NativeToolApiKey',
      `${starshipId}:${toolName}`
    );
  }

  /**
   * Get all API keys for a starship
   */
  async getAllApiKeys(starshipId: string): Promise<Record<string, string>> {
    // Basic validation - entities handle detailed validation
    if (!starshipId) {
      this.handleValidationError([{ field: 'starshipId', message: 'starshipId is required' }], 'getAllApiKeys');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ toolName: string; encryptedApiKey: string }>(
          `
        MATCH (k:NativeToolApiKey {starshipId: $starshipId})
        RETURN k.toolName as toolName, k.encryptedApiKey as encryptedApiKey
        `,
          { starshipId }
        );

        const apiKeys: Record<string, string> = {};

        for (const record of result) {
          const toolName = record.toolName;
          const encryptedApiKey = record.encryptedApiKey;
          if (encryptedApiKey) {
            apiKeys[toolName] = this.decrypt(encryptedApiKey);
          }
        }

        return apiKeys;
      },
      'getAllApiKeys',
      'NativeToolApiKey',
      starshipId
    );
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(starshipId: string, toolName: string): Promise<void> {
    // Basic validation - entities handle detailed validation
    if (!starshipId || !toolName) {
      this.handleValidationError([{ field: 'parameters', message: 'starshipId and toolName are required' }], 'deleteApiKey');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        await connection.executeWrite(
          `
        MATCH (k:NativeToolApiKey {starshipId: $starshipId, toolName: $toolName})
        DELETE k
        `,
          { starshipId, toolName }
        );
      },
      'deleteApiKey',
      'NativeToolApiKey',
      `${starshipId}:${toolName}`
    );
  }

  /**
   * Check if a starship has a specific API key
   */
  async hasApiKey(starshipId: string, toolName: string): Promise<boolean> {
    // Basic validation - entities handle detailed validation
    if (!starshipId || !toolName) {
      this.handleValidationError([{ field: 'parameters', message: 'starshipId and toolName are required' }], 'hasApiKey');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ hasKey: boolean }>(
          `
        MATCH (k:NativeToolApiKey {starshipId: $starshipId, toolName: $toolName})
        RETURN count(k) > 0 as hasKey
        `,
          { starshipId, toolName }
        );

        return result[0]?.hasKey || false;
      },
      'hasApiKey',
      'NativeToolApiKey',
      `${starshipId}:${toolName}`
    );
  }
}

// Export singleton instance
export const nativeToolApiKeyRepository = new NativeToolApiKeyRepository();
