import { EnvironmentEntity } from '@/entities/EnvironmentEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { EnvironmentModel, EnvironmentSummary } from '@starships/protocol';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export class EnvironmentRepository extends BaseRepository {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  constructor(connection?: Neo4jConnection) {
    super('EnvironmentRepository', connection);
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
    const masterKey = process.env.ENCRYPTION_KEY;
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
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: EnvironmentModel }>(
          'MATCH (e:Environment) WHERE e.starshipId = $starshipId RETURN e ORDER BY e.key',
          { starshipId }
        );

        return result.map((record) => {
          const env = fromDatabase(EnvironmentEntity, record.e);
          // Return summary without encrypted value
          return {
            id: env.id,
            starshipId: env.starshipId,
            key: env.key,
            description: env.description,
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
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: EnvironmentModel }>(
          'MATCH (e:Environment) WHERE e.starshipId = $starshipId AND e.key = $key RETURN e',
          { starshipId, key }
        );

        const env = result[0]?.e || null;
        return env ? fromDatabase(EnvironmentEntity, env) : null;
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
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy,
        };

        await EnvironmentEntity.validate(envData, 'create');

        const environment = await this.createEntityWithAutoId<EnvironmentModel>(
          'Environment',
          toDatabase(toEntityInstance(EnvironmentEntity, envData))
        );

        return fromDatabase(EnvironmentEntity, environment);
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
      updatedBy: string;
    }
  ): Promise<EnvironmentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Get existing environment to get starshipId for encryption
        const existing = await connection.executeQuery<{ e: EnvironmentModel }>('MATCH (e:Environment) WHERE e.id = $id RETURN e', { id });

        if (!existing[0]?.e) {
          return null;
        }

        const updateProps: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };

        if (updates.value !== undefined) {
          updateProps.encryptedValue = this.encrypt(updates.value, existing[0].e.starshipId);
        }

        if (updates.description !== undefined) {
          updateProps.description = updates.description;
        }

        await EnvironmentEntity.validate(updateProps, 'update');

        const result = await connection.executeWrite<{ e: EnvironmentModel }>(
          'MATCH (e:Environment) WHERE e.id = $id SET e += $updates RETURN e',
          { id, updates: updateProps }
        );

        const env = result[0]?.e || null;
        return env ? fromDatabase(EnvironmentEntity, env) : null;
      },
      'update',
      'Environment',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (e:Environment) WHERE e.id = $id DELETE e RETURN count(e) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Environment',
      id
    );
  }

  async deleteByStarshipAndKey(starshipId: string, key: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (e:Environment) WHERE e.starshipId = $starshipId AND e.key = $key DELETE e RETURN count(e) as deletedCount',
          { starshipId, key }
        );

        return result[0]?.deletedCount > 0;
      },
      'deleteByStarshipAndKey',
      'Environment'
    );
  }

  /**
   * Get decrypted environment variables as a Record for use in execution context
   */
  async getDecryptedEnvironment(starshipId: string): Promise<Record<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ e: EnvironmentModel }>(
          'MATCH (e:Environment) WHERE e.starshipId = $starshipId RETURN e',
          { starshipId }
        );

        const env: Record<string, string> = {};

        for (const record of result) {
          const environment = fromDatabase(EnvironmentEntity, record.e);
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
