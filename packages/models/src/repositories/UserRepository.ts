import { UserEntity } from '@/entities/UserEntity';
import { getConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { UserModel } from '@starships/protocol';

export class UserRepository extends BaseRepository {
  constructor() {
    super('UserRepository');
  }
  async findAll(): Promise<UserModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>('MATCH (u:User) RETURN u ORDER BY u.createdAt DESC');
        return result.map((record) => UserEntity.deserialize(record.u));
      },
      'findAll',
      'User'
    );
  }

  async findById(id: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>('MATCH (u:User) WHERE u.id = $id RETURN u', { id: id });
        const user = result[0]?.u || null;
        return user ? UserEntity.deserialize(user) : null;
      },
      'findById',
      'User',
      id
    );
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>('MATCH (u:User) WHERE u.email = $email RETURN u', { email: email });
        const user = result[0]?.u || null;
        return user ? UserEntity.deserialize(user) : null;
      },
      'findByEmail',
      'User',
      email
    );
  }

  async findByUsername(username: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>('MATCH (u:User) WHERE u.username = $username RETURN u', {
          username: username,
        });
        const user = result[0]?.u || null;
        return user ? UserEntity.deserialize(user) : null;
      },
      'findByUsername',
      'User',
      username
    );
  }

  async create(entity: Omit<UserModel, 'id' | 'createdAt'>): Promise<UserModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using Entity
        await UserEntity.validate(entity, 'create');

        const now = new Date().toISOString();

        // Transform using Entity
        const userEntity = UserEntity.deserialize({
          ...entity,
          createdAt: now,
        });

        // Use email as unique identifier for merge operation
        const user = await this.mergeEntityWithAutoId<UserModel>(
          'User',
          { email: entity.email },
          userEntity.serialize(),
          userEntity.serialize()
        );

        return UserEntity.deserialize(user);
      },
      'create',
      'User'
    );
  }

  async update(id: string, updates: Partial<UserModel>): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using Entity
        if (Object.keys(updates).length > 0) {
          await UserEntity.validate(updates, 'update');
        }

        const connection = getConnection();
        const now = new Date().toISOString();

        // Transform using Entity
        const updateEntity = UserEntity.deserialize({
          ...updates,
          updatedAt: now, // Add updatedAt timestamp
        });

        const updateData = updateEntity.serialize();
        const setClause = Object.keys(updateData)
          .filter((key) => key !== 'id' && key !== 'createdAt' && updateData[key] !== undefined)
          .map((key) => `u.${key} = $${key}`)
          .join(', ');

        if (!setClause) {
          return this.findById(id);
        }

        const params = {
          id: id,
          ...updateData,
        };

        const result = await connection.executeWrite<{ u: UserModel }>(
          `MATCH (u:User) WHERE u.id = $id
         SET ${setClause}
         RETURN u`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('User', id, 'update');
        }

        return UserEntity.deserialize(result[0].u);
      },
      'update',
      'User',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (u:User) WHERE u.id = $id DETACH DELETE u RETURN count(u) as deletedCount',
          { id: id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'User',
      id
    );
  }

  // Stripe integration methods
  async findByStripeCustomerId(stripeCustomerId: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ user: UserModel }>(
          `MATCH (user:User {stripeCustomerId: $stripeCustomerId})
         RETURN user`,
          { stripeCustomerId }
        );

        const user = result[0]?.user || null;
        return user ? UserEntity.deserialize(user) : null;
      },
      'findByStripeCustomerId',
      'User',
      stripeCustomerId
    );
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate required parameters
        if (!userId) {
          throw new Error('userId is required for updateStripeCustomerId');
        }
        if (!stripeCustomerId) {
          throw new Error('stripeCustomerId is required for updateStripeCustomerId');
        }

        const connection = getConnection();
        await connection.executeWrite(
          `MATCH (user:User {id: $userId})
         SET user.stripeCustomerId = $stripeCustomerId`,
          { userId, stripeCustomerId }
        );
      },
      'updateStripeCustomerId',
      'User',
      userId
    );
  }

  // Auth-specific methods
  async findByEmailWithPassword(email: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>('MATCH (u:User) WHERE u.email = $email RETURN u', { email: email });
        const user = result[0]?.u || null;
        return user ? UserEntity.deserialize(user) : null;
      },
      'findByEmailWithPassword',
      'User',
      email
    );
  }

  async createWithPassword(userData: {
    email: string;
    password: string;
    name?: string;
    displayName?: string;
    username?: string;
  }): Promise<UserModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const username = userData.username || UserEntity.generateUsernameFromEmail(userData.email);

        const entityData = {
          username: username,
          email: userData.email,
          displayName: userData.displayName || userData.name,
          password: userData.password,
          createdAt: now,
        };

        // Validate using Entity
        await UserEntity.validate(entityData, 'create');

        // Transform using Entity
        const userEntity = UserEntity.deserialize(entityData);

        const user = await this.mergeEntityWithAutoId<UserModel>(
          'User',
          { email: userData.email },
          userEntity.serialize(),
          userEntity.serialize()
        );

        return UserEntity.deserialize(user);
      },
      'createWithPassword',
      'User'
    );
  }
}
