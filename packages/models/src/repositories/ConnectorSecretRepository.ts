import { ConnectorSecretEntity } from '@/entities/ConnectorSecretEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConnectorSecretModel, ConnectorSecretSummary } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export class ConnectorSecretRepository extends BaseRepository {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  constructor() {
    super('ConnectorSecretRepository');
  }

  /**
   * Encrypt value using AES-256-GCM
   */
  private encrypt(value: string, starshipId: string): string {
    const key = this.getEncryptionKey(starshipId);
    const iv = randomBytes(ConnectorSecretRepository.IV_LENGTH);
    const cipher = createCipheriv(ConnectorSecretRepository.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypt value using AES-256-GCM
   */
  private decrypt(encryptedValue: string, starshipId: string): string {
    const key = this.getEncryptionKey(starshipId);
    const data = Buffer.from(encryptedValue, 'base64');

    const iv = data.subarray(0, ConnectorSecretRepository.IV_LENGTH);
    const tag = data.subarray(
      ConnectorSecretRepository.IV_LENGTH,
      ConnectorSecretRepository.IV_LENGTH + ConnectorSecretRepository.TAG_LENGTH
    );
    const encrypted = data.subarray(ConnectorSecretRepository.IV_LENGTH + ConnectorSecretRepository.TAG_LENGTH);

    const decipher = createDecipheriv(ConnectorSecretRepository.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  }

  /**
   * Get starship-specific encryption key derived from master key
   */
  private getEncryptionKey(starshipId: string): Buffer {
    const envConfig = getEnvConfig();
    const masterKey = envConfig.ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // Simple key derivation - in production, consider using PBKDF2 or similar
    return createHash('sha256')
      .update(masterKey + starshipId)
      .digest();
  }

  async findByStarship(starshipId: string): Promise<ConnectorSecretSummary[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM connector_secrets WHERE starship_id = $1 ORDER BY key',
          [starshipId]
        );

        return result.map((record) => {
          const secret = fromDatabase(ConnectorSecretEntity, record);
          // Return summary without encrypted value
          return {
            id: secret.id,
            starshipId: secret.starshipId,
            key: secret.key,
            description: secret.description,
            connectorId: secret.connectorId,
            createdAt: secret.createdAt,
            updatedAt: secret.updatedAt,
            createdBy: secret.createdBy,
          };
        });
      },
      'findByStarship',
      'ConnectorSecret'
    );
  }

  async findByStarshipAndKey(starshipId: string, key: string): Promise<ConnectorSecretModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim() || !key?.trim()) {
          throw new Error('starshipId and key are required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM connector_secrets WHERE starship_id = $1 AND key = $2',
          [starshipId, key]
        );

        return result ? fromDatabase(ConnectorSecretEntity, result) : null;
      },
      'findByStarshipAndKey',
      'ConnectorSecret'
    );
  }

  async create(data: {
    starshipId: string;
    key: string;
    value: string;
    description?: string;
    createdBy: string;
    connectorId?: string;
  }): Promise<ConnectorSecretModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const encryptedValue = this.encrypt(data.value, data.starshipId);

        const secretData = {
          starshipId: data.starshipId,
          key: data.key,
          encryptedValue,
          description: data.description,
          connectorId: data.connectorId,
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy,
        };

        await ConnectorSecretEntity.validate(secretData, 'create');

        const entity = toEntityInstance(ConnectorSecretEntity, secretData);
        const databaseFormat = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('connector_secrets', databaseFormat);

        return fromDatabase(ConnectorSecretEntity, result);
      },
      'create',
      'ConnectorSecret'
    );
  }

  async update(
    id: string,
    updates: {
      value?: string;
      description?: string;
      connectorId?: string;
      updatedBy: string;
    }
  ): Promise<ConnectorSecretModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for update operation');
        }

        const connection = this.getConnection();

        // Get existing secret to get starshipId for encryption
        const existing = await connection.queryOne<Record<string, unknown>>('SELECT * FROM connector_secrets WHERE id = $1', [id]);

        if (!existing) {
          return null;
        }

        const existingSecret = fromDatabase(ConnectorSecretEntity, existing);
        const updateProps: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };

        if (updates.value !== undefined) {
          updateProps.encryptedValue = this.encrypt(updates.value, existingSecret.starshipId);
        }

        if (updates.description !== undefined) {
          updateProps.description = updates.description;
        }

        if (updates.connectorId !== undefined) {
          updateProps.connectorId = updates.connectorId;
        }

        await ConnectorSecretEntity.validate(updateProps, 'update');

        const updateData = toDatabase(toEntityInstance(ConnectorSecretEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return existingSecret;
        }

        const result = await this.updateEntity<Record<string, unknown>>('connector_secrets', id, filteredUpdateData);
        return result ? fromDatabase(ConnectorSecretEntity, result) : null;
      },
      'update',
      'ConnectorSecret',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for delete operation');
        }

        return await this.deleteEntity('connector_secrets', id);
      },
      'delete',
      'ConnectorSecret',
      id
    );
  }

  async deleteByStarshipAndKey(starshipId: string, key: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim() || !key?.trim()) {
          throw new Error('starshipId and key are required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'DELETE FROM connector_secrets WHERE starship_id = $1 AND key = $2 RETURNING id',
          [starshipId, key]
        );

        return result.length > 0;
      },
      'deleteByStarshipAndKey',
      'ConnectorSecret'
    );
  }

  async deleteByConnectorId(connectorId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        if (!connectorId?.trim()) {
          throw new Error('connectorId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'DELETE FROM connector_secrets WHERE connector_id = $1 RETURNING id',
          [connectorId]
        );

        return result.length;
      },
      'deleteByConnectorId',
      'ConnectorSecret',
      connectorId
    );
  }

  /**
   * Get decrypted connector secrets for a specific connector.
   */
  async getDecryptedSecretsByConnector(connectorId: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        if (!connectorId?.trim()) {
          throw new Error('connectorId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM connector_secrets WHERE connector_id = $1', [
          connectorId,
        ]);

        const secrets: Record<string, string> = {};

        for (const record of result) {
          const secret = fromDatabase(ConnectorSecretEntity, record);
          try {
            secrets[secret.key] = this.decrypt(secret.encryptedValue, secret.starshipId);
          } catch (error) {
            console.error(`Failed to decrypt connector secret ${secret.key}:`, error);
          }
        }

        return secrets;
      },
      'getDecryptedSecretsByConnector',
      'ConnectorSecret',
      connectorId
    );
  }

  /**
   * Get decrypted connector secrets as a Record for use in execution context
   */
  async getDecryptedSecrets(starshipId: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM connector_secrets WHERE starship_id = $1', [
          starshipId,
        ]);

        const secrets: Record<string, string> = {};

        for (const record of result) {
          const secret = fromDatabase(ConnectorSecretEntity, record);
          try {
            secrets[secret.key] = this.decrypt(secret.encryptedValue, starshipId);
          } catch (error) {
            console.error(`Failed to decrypt connector secret ${secret.key}:`, error);
            // Skip invalid encrypted values
          }
        }

        return secrets;
      },
      'getDecryptedSecrets',
      'ConnectorSecret'
    );
  }
}
