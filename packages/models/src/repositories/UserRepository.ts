import { UserEntity } from '@/entities/UserEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { UserModel } from '@starships/protocol';

export class UserRepository extends BaseRepository {
  constructor() {
    super('UserRepository');
  }

  async findAll(): Promise<UserModel[]> {
    return this.executeWithErrorHandling(async () => {
      const result = await super.findAllEntities<Record<string, unknown>>('users');
      return fromDatabaseArray(UserEntity, result);
    }, 'findAll');
  }

  async findById(id: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(async () => {
      const result = await super.findEntityById<Record<string, unknown>>('users', id);
      return result ? fromDatabase(UserEntity, result) : null;
    }, 'findById');
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM users WHERE email = $1', [email]);
      return result ? fromDatabase(UserEntity, result) : null;
    }, 'findByEmail');
  }

  async create(entity: Omit<UserModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity
      await UserEntity.validate(entity, 'create');

      // Prepare entity data with timestamps
      const entityData = {
        ...entity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Convert entity to database format (camelCase → snake_case automatically)
      const databaseFormat = toDatabase(toEntityInstance(UserEntity, entityData));

      // Create entity in database
      const result = await this.createEntity<Record<string, unknown>>('users', databaseFormat);

      // Convert back to entity format (snake_case → camelCase automatically)
      return fromDatabase(UserEntity, result);
    }, 'create');
  }

  async update(id: string, updates: Partial<UserModel>): Promise<UserModel | null> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity
      if (Object.keys(updates).length > 0) {
        await UserEntity.validate(updates, 'update');
      }

      // Prepare update data
      const updateData = toDatabase(toEntityInstance(UserEntity, updates));

      // Filter out protected fields (id, createdAt)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

      if (Object.keys(filteredUpdateData).length === 0) {
        return await this.findById(id);
      }

      // Update entity in database (camelCase → snake_case handled automatically)
      const result = await this.updateEntity<Record<string, unknown>>('users', id, filteredUpdateData);

      // Convert back to entity format (snake_case → camelCase automatically)
      return result ? fromDatabase(UserEntity, result) : null;
    }, 'update');
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      return await this.deleteEntity('users', id);
    }, 'delete');
  }

  // Stripe integration methods
  async findByStripeCustomerId(stripeCustomerId: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM users WHERE stripe_customer_id = $1', [
        stripeCustomerId,
      ]);
      return result ? fromDatabase(UserEntity, result) : null;
    }, 'findByStripeCustomerId');
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      // Validate required parameters
      if (!userId) {
        throw new Error('userId is required for updateStripeCustomerId');
      }
      if (!stripeCustomerId) {
        throw new Error('stripeCustomerId is required for updateStripeCustomerId');
      }

      const connection = this.getConnection();
      await connection.query('UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2', [stripeCustomerId, userId]);
    }, 'updateStripeCustomerId');
  }

  // Auth-specific methods
  async findByEmailWithPassword(email: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(async () => {
      return await this.findByEmail(email);
    }, 'findByEmailWithPassword');
  }

  async createWithPassword(userData: { email: string; password: string; name?: string; displayName?: string }): Promise<UserModel> {
    return this.executeWithErrorHandling(async () => {
      const entityData = {
        email: userData.email,
        displayName: userData.displayName || userData.name,
        password: userData.password,
      };

      return await this.create(entityData);
    }, 'createWithPassword');
  }
}
