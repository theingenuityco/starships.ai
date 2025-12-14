import { EnvironmentEntity } from '@/entities/EnvironmentEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { EnvironmentModel, EnvironmentSummary } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export class EnvironmentRepository extends BaseRepository {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  constructor() {
    super('EnvironmentRepository');
  }

  /**
   * Encrypt value using AES-256-GCM
   */
  private encrypt(value: string, starshipId: string): string {
    const key = this.getEncryptionKey(starshipId);
    const iv = randomBytes(EnvironmentRepository.IV_LENGTH);
    const cipher = createCipheriv(EnvironmentRepository.ALGORITHM, key, iv);

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

    const iv = data.subarray(0, EnvironmentRepository.IV_LENGTH);
    const tag = data.subarray(EnvironmentRepository.IV_LENGTH, EnvironmentRepository.IV_LENGTH + EnvironmentRepository.TAG_LENGTH);
    const encrypted = data.subarray(EnvironmentRepository.IV_LENGTH + EnvironmentRepository.TAG_LENGTH);

    const decipher = createDecipheriv(EnvironmentRepository.ALGORITHM, key, iv);
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

  async findByStarship(starshipId: string): Promise<EnvironmentSummary[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM environments WHERE starship_id = $1 ORDER BY key', [
          starshipId,
        ]);

        return result.map((record) => {
          const env = fromDatabase(EnvironmentEntity, record);
          // Return summary without encrypted value
          return {
            id: env.id,
            starshipId: env.starshipId,
            key: env.key,
            description: env.description,
            connectorId: env.connectorId,
            createdAt: env.createdAt,
            updatedAt: env.updatedAt,
            createdBy: env.createdBy,
          };
        });
      },
      'findByStarship',
      'Environment'
    );
  }

  async findByStarshipAndKey(starshipId: string, key: string): Promise<EnvironmentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim() || !key?.trim()) {
          throw new Error('starshipId and key are required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM environments WHERE starship_id = $1 AND key = $2',
          [starshipId, key]
        );

        return result ? fromDatabase(EnvironmentEntity, result) : null;
      },
      'findByStarshipAndKey',
      'Environment'
    );
  }

  async create(data: {
    starshipId: string;
    key: string;
    value: string;
    description?: string;
    createdBy: string;
    connectorId?: string;
  }): Promise<EnvironmentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const encryptedValue = this.encrypt(data.value, data.starshipId);

        const envData = {
          starshipId: data.starshipId,
          key: data.key,
          encryptedValue,
          description: data.description,
          connectorId: data.connectorId,
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy,
        };

        await EnvironmentEntity.validate(envData, 'create');

        // Create entity instance from plain object, then serialize
        const environmentEntity = toEntityInstance(EnvironmentEntity, envData);
        const databaseFormat = toDatabase(environmentEntity);
        const result = await this.createEntity<Record<string, unknown>>('environments', databaseFormat);

        return fromDatabase(EnvironmentEntity, result);
      },
      'create',
      'Environment'
    );
  }

  async update(
    id: string,
    updates: {
      value?: string;
      description?: string;
      /**
       * Optional connector owner to associate this env var with.
       * Used by connector-managed env vars so they can be cleaned up without
       * needing template-managed key lists.
       */
      connectorId?: string;
      updatedBy: string;
    }
  ): Promise<EnvironmentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for update operation');
        }

        const connection = this.getConnection();

        // Get existing environment to get starshipId for encryption
        const existing = await connection.queryOne<Record<string, unknown>>('SELECT * FROM environments WHERE id = $1', [id]);

        if (!existing) {
          return null;
        }

        const existingEnv = fromDatabase(EnvironmentEntity, existing);
        const updateProps: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };

        if (updates.value !== undefined) {
          updateProps.encryptedValue = this.encrypt(updates.value, existingEnv.starshipId);
        }

        if (updates.description !== undefined) {
          updateProps.description = updates.description;
        }

        if (updates.connectorId !== undefined) {
          updateProps.connectorId = updates.connectorId;
        }

        await EnvironmentEntity.validate(updateProps, 'update');

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(EnvironmentEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return existingEnv;
        }

        const result = await this.updateEntity<Record<string, unknown>>('environments', id, filteredUpdateData);
        return result ? fromDatabase(EnvironmentEntity, result) : null;
      },
      'update',
      'Environment',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for delete operation');
        }

        return await this.deleteEntity('environments', id);
      },
      'delete',
      'Environment',
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
          'DELETE FROM environments WHERE starship_id = $1 AND key = $2 RETURNING id',
          [starshipId, key]
        );

        return result.length > 0;
      },
      'deleteByStarshipAndKey',
      'Environment'
    );
  }

  async deleteByConnectorId(connectorId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        if (!connectorId?.trim()) {
          throw new Error('connectorId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('DELETE FROM environments WHERE connector_id = $1 RETURNING id', [
          connectorId,
        ]);

        return result.length;
      },
      'deleteByConnectorId',
      'Environment',
      connectorId
    );
  }

  /**
   * Get decrypted env vars for a specific connector.
   *
   * Connector-managed env vars are linked via environments.connector_id, so we
   * can safely snapshot secrets for refresh/test flows without relying on
   * connector_templates.required_env_keys / optional_env_keys.
   */
  async getDecryptedEnvironmentByConnector(connectorId: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        if (!connectorId?.trim()) {
          throw new Error('connectorId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM environments WHERE connector_id = $1', [connectorId]);

        const env: Record<string, string> = {};

        for (const record of result) {
          const environment = fromDatabase(EnvironmentEntity, record);
          try {
            env[environment.key] = this.decrypt(environment.encryptedValue, environment.starshipId);
          } catch (error) {
            console.error(`Failed to decrypt environment variable ${environment.key}:`, error);
          }
        }

        return env;
      },
      'getDecryptedEnvironmentByConnector',
      'Environment',
      connectorId
    );
  }

  /**
   * Get decrypted environment variables as a Record for use in execution context
   */
  async getDecryptedEnvironment(starshipId: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM environments WHERE starship_id = $1', [starshipId]);

        const env: Record<string, string> = {};

        for (const record of result) {
          const environment = fromDatabase(EnvironmentEntity, record);
          try {
            env[environment.key] = this.decrypt(environment.encryptedValue, starshipId);
          } catch (error) {
            console.error(`Failed to decrypt environment variable ${environment.key}:`, error);
            // Skip invalid encrypted values
          }
        }

        return env;
      },
      'getDecryptedEnvironment',
      'Environment'
    );
  }
}
