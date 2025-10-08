/**
 * OAuth Account Repository - Layer 3 (Data Access)
 * CRITICAL: Follows BaseRepository + Entity pattern for architectural compliance
 */

import { OAuthAccountEntity } from '@/entities/OAuthAccountEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { OAuthAccountModel } from '@starships/protocol';

export class OAuthAccountRepository extends BaseRepository {
  constructor() {
    super('OAuthAccountRepository');
  }

  /**
   * Create OAuth account - follows entity validation pattern
   */
  async create(entity: Omit<OAuthAccountModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<OAuthAccountModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity (Layer 2)
      await OAuthAccountEntity.validate(entity, 'create');

      // Prepare entity data with timestamps
      const entityData = {
        ...entity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Convert entity to database format (camelCase → snake_case automatically)
      const databaseFormat = toDatabase(toEntityInstance(OAuthAccountEntity, entityData));

      // Create entity in database (Layer 3 → Database)
      const result = await this.createEntity<Record<string, unknown>>('oauth_accounts', databaseFormat);

      // Convert back to entity format (snake_case → camelCase automatically)
      return fromDatabase(OAuthAccountEntity, result);
    }, 'create');
  }

  /**
   * Find all OAuth accounts - follows repository pattern
   */
  async findAll(): Promise<OAuthAccountModel[]> {
    return this.executeWithErrorHandling(async () => {
      const result = await super.findAllEntities<Record<string, unknown>>('oauth_accounts');
      return fromDatabaseArray(OAuthAccountEntity, result);
    }, 'findAll');
  }

  /**
   * Find OAuth account by ID - follows repository pattern
   */
  async findById(id: string): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      const result = await super.findEntityById<Record<string, unknown>>('oauth_accounts', id);
      return result ? fromDatabase(OAuthAccountEntity, result) : null;
    }, 'findById');
  }

  /**
   * Find OAuth account by provider and provider user ID
   */
  async findByProviderAndUser(provider: string, providerUserId: string): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.queryOne<Record<string, unknown>>(
        'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        [provider, providerUserId]
      );
      return result ? fromDatabase(OAuthAccountEntity, result) : null;
    }, 'findByProviderAndUser');
  }

  /**
   * Find all OAuth accounts for a user
   */
  async findByUserId(userId: string): Promise<OAuthAccountModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const results = await connection.query<Record<string, unknown>>('SELECT * FROM oauth_accounts WHERE user_id = $1', [userId]);
      return fromDatabaseArray(OAuthAccountEntity, results);
    }, 'findByUserId');
  }

  /**
   * Find OAuth account by email
   */
  async findByEmail(email: string): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM oauth_accounts WHERE email = $1', [email]);
      return result ? fromDatabase(OAuthAccountEntity, result) : null;
    }, 'findByEmail');
  }

  /**
   * Update OAuth account - follows entity pattern
   */
  async update(id: string, updates: Partial<OAuthAccountModel>): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity
      if (Object.keys(updates).length > 0) {
        await OAuthAccountEntity.validate(updates, 'update');
      }

      // Prepare update data
      const updateData = toDatabase(toEntityInstance(OAuthAccountEntity, updates));

      // Filter out protected fields (id, createdAt)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

      if (Object.keys(filteredUpdateData).length === 0) {
        return await this.findById(id);
      }

      // Update entity in database (camelCase → snake_case handled automatically)
      const result = await this.updateEntity<Record<string, unknown>>('oauth_accounts', id, filteredUpdateData);

      // Convert back to entity format (snake_case → camelCase automatically)
      if (!result) {
        this.handleNotFound('OAuth Account', id);
      }

      return fromDatabase(OAuthAccountEntity, result);
    }, 'update');
  }

  /**
   * Delete OAuth account
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      return await this.deleteEntity('oauth_accounts', id);
    }, 'delete');
  }

  /**
   * Delete OAuth account by provider and user
   */
  async deleteByProviderAndUser(provider: string, userId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.query('DELETE FROM oauth_accounts WHERE provider = $1 AND user_id = $2', [provider, userId]);
      return (result as unknown as { rowCount: number }).rowCount > 0;
    }, 'deleteByProviderAndUser');
  }
}