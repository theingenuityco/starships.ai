import { PlatformSecretEntity } from '@/entities/PlatformSecretEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { getEnvConfig } from '@starships/env';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * PlatformSecretRepository
 *
 * Stores platform-wide secrets encrypted at rest (not per-starship).
 * This is intended for host-only secrets like connector OAuth client secrets.
 */
export class PlatformSecretRepository extends BaseRepository {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly DERIVATION_SALT = 'platform_secrets';

  constructor() {
    super('PlatformSecretRepository');
  }

  private getEncryptionKey(): Buffer {
    const envConfig = getEnvConfig();
    const masterKey = envConfig.ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    return createHash('sha256')
      .update(masterKey + PlatformSecretRepository.DERIVATION_SALT)
      .digest();
  }

  private encrypt(value: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(PlatformSecretRepository.IV_LENGTH);
    const cipher = createCipheriv(PlatformSecretRepository.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  private decrypt(encryptedValue: string): string {
    const key = this.getEncryptionKey();
    const data = Buffer.from(encryptedValue, 'base64');

    const iv = data.subarray(0, PlatformSecretRepository.IV_LENGTH);
    const tag = data.subarray(PlatformSecretRepository.IV_LENGTH, PlatformSecretRepository.IV_LENGTH + PlatformSecretRepository.TAG_LENGTH);
    const encrypted = data.subarray(PlatformSecretRepository.IV_LENGTH + PlatformSecretRepository.TAG_LENGTH);

    const decipher = createDecipheriv(PlatformSecretRepository.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  }

  async list(): Promise<PlatformSecretEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM platform_secrets ORDER BY key ASC');
        return result.map((record) => fromDatabase(PlatformSecretEntity, record));
      },
      'list',
      'PlatformSecret'
    );
  }

  async findByKey(key: string): Promise<PlatformSecretEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!key?.trim()) {
          throw new Error('key is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM platform_secrets WHERE key = $1', [key]);
        return result ? fromDatabase(PlatformSecretEntity, result) : null;
      },
      'findByKey',
      'PlatformSecret',
      key
    );
  }

  async getDecryptedSecret(key: string): Promise<string | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findByKey(key);
        if (!existing) return null;
        try {
          return this.decrypt(existing.encryptedValue);
        } catch (error) {
          console.error(`Failed to decrypt platform secret ${key}:`, error);
          return null;
        }
      },
      'getDecryptedSecret',
      'PlatformSecret',
      key
    );
  }

  /**
   * Create or update a platform secret by key.
   *
   * This is a small helper intended for internal use/bootstrapping.
   */
  async upsertSecret(data: { key: string; value: string; description?: string; updatedBy: string }): Promise<PlatformSecretEntity> {
    return this.executeWithErrorHandling(
      async () => {
        if (!data.key?.trim()) throw new Error('key is required');
        if (data.value === undefined || data.value === null) throw new Error('value is required');

        const connection = this.getConnection();
        const existing = await connection.queryOne<Record<string, unknown>>('SELECT * FROM platform_secrets WHERE key = $1', [data.key]);

        const now = new Date().toISOString();
        const encryptedValue = this.encrypt(data.value);

        if (!existing) {
          const createData = {
            key: data.key,
            encryptedValue,
            description: data.description,
            createdAt: now,
            updatedAt: now,
            createdBy: data.updatedBy,
            updatedBy: data.updatedBy,
          };

          await PlatformSecretEntity.validate(createData, 'create');
          const entity = toEntityInstance(PlatformSecretEntity, createData);
          const databaseFormat = toDatabase(entity);
          const result = await this.createEntity<Record<string, unknown>>('platform_secrets', databaseFormat);
          return fromDatabase(PlatformSecretEntity, result);
        }

        const current = fromDatabase(PlatformSecretEntity, existing);
        const updateProps: Record<string, unknown> = {
          encryptedValue,
          description: data.description ?? current.description,
          updatedAt: now,
          updatedBy: data.updatedBy,
        };

        await PlatformSecretEntity.validate(updateProps, 'update');
        const updateData = toDatabase(toEntityInstance(PlatformSecretEntity, updateProps));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;
        const updated = await this.updateEntity<Record<string, unknown>>('platform_secrets', current.id, filteredUpdateData);
        if (!updated) {
          throw new Error(`Failed to update platform secret: ${data.key}`);
        }
        return fromDatabase(PlatformSecretEntity, updated);
      },
      'upsertSecret',
      'PlatformSecret',
      data.key
    );
  }

  async updateSecretByKey(data: {
    key: string;
    value?: string;
    description?: string;
    updatedBy: string;
  }): Promise<PlatformSecretEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!data.key?.trim()) throw new Error('key is required');
        if (!data.updatedBy?.trim()) throw new Error('updatedBy is required');

        const existing = await this.findByKey(data.key);
        if (!existing) return null;

        const now = new Date().toISOString();
        const updateProps: Record<string, unknown> = {
          updatedAt: now,
          updatedBy: data.updatedBy,
        };

        if (data.value !== undefined) {
          updateProps.encryptedValue = this.encrypt(data.value);
        }

        if (data.description !== undefined) {
          updateProps.description = data.description;
        }

        await PlatformSecretEntity.validate(updateProps, 'update');
        const updateData = toDatabase(toEntityInstance(PlatformSecretEntity, updateProps));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        const updated = await this.updateEntity<Record<string, unknown>>('platform_secrets', existing.id, filteredUpdateData);
        return updated ? fromDatabase(PlatformSecretEntity, updated) : null;
      },
      'updateSecretByKey',
      'PlatformSecret',
      data.key
    );
  }

  async deleteByKey(key: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!key?.trim()) throw new Error('key is required');
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('DELETE FROM platform_secrets WHERE key = $1 RETURNING id', [key]);
        return result.length > 0;
      },
      'deleteByKey',
      'PlatformSecret',
      key
    );
  }
}
