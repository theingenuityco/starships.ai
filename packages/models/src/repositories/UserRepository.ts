import { getConnection } from '../helpers/database';
import { UserModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';

export class UserRepository extends BaseRepository {
  constructor() {
    super('UserRepository');
  }
  async findAll(): Promise<UserModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>(
          'MATCH (u:User) RETURN u ORDER BY u.createdAt DESC'
        );
        return result.map((record) => record.u);
      },
      'findAll',
      'User'
    );
  }

  async findById(id: string): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ u: UserModel }>(
          'MATCH (u:User) WHERE u.id = $id RETURN u',
          { id: id }
        );
        return result.length > 0 ? result[0].u : null;
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
        const result = await connection.executeQuery<{ u: UserModel }>(
          'MATCH (u:User) WHERE u.email = $email RETURN u',
          { email: email }
        );
        return result.length > 0 ? result[0].u : null;
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
        const result = await connection.executeQuery<{ u: UserModel }>(
          'MATCH (u:User) WHERE u.username = $username RETURN u',
          { username: username }
        );
        return result.length > 0 ? result[0].u : null;
      },
      'findByUsername',
      'User',
      username
    );
  }

  async create(entity: Omit<UserModel, 'id' | 'createdAt'>): Promise<UserModel> {
    return this.executeWithErrorHandling(
      async () => {
        // For new auth system, require email
        this.validateRequired(entity, ['email'], 'create');

        const createdAt = new Date().toISOString();

        // Use email as unique identifier
        const user = await this.mergeEntityWithAutoId<UserModel>(
          'User',
          { email: entity.email },
          {
            ...entity,
            createdAt,
          },
          entity
        );
        return user;
      },
      'create',
      'User'
    );
  }

  async update(id: string, updates: Partial<UserModel>): Promise<UserModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();

        const setClause = Object.keys(updates)
          .filter((key) => key !== 'id' && key !== 'createdAt')
          .map((key) => `u.${key} = $${key}`)
          .join(', ');

        if (!setClause) {
          return this.findById(id);
        }

        const result = await connection.executeWrite<{ u: UserModel }>(
          `MATCH (u:User) WHERE u.id = $id
         SET ${setClause}
         RETURN u`,
          {
            id: id,
            username: updates.username,
            email: updates.email,
            displayName: updates.displayName,
            avatar: updates.avatar,
          }
        );

        if (result.length === 0) {
          this.handleNotFound('User', id, 'update');
        }

        return result[0].u;
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

        return result[0]?.user || null;
      },
      'findByStripeCustomerId',
      'User',
      stripeCustomerId
    );
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired(
          { userId, stripeCustomerId },
          ['userId', 'stripeCustomerId'],
          'updateStripeCustomerId'
        );

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
        const result = await connection.executeQuery<{ u: UserModel }>(
          'MATCH (u:User) WHERE u.email = $email RETURN u',
          { email: email }
        );
        return result.length > 0 ? result[0].u : null;
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
        this.validateRequired(userData, ['email', 'password'], 'createWithPassword');

        const createdAt = new Date().toISOString();
        const username = userData.username || userData.email.split('@')[0];

        const user = await this.mergeEntityWithAutoId<UserModel>(
          'User',
          { email: userData.email },
          {
            username: username,
            email: userData.email,
            displayName: userData.displayName || userData.name,
            password: userData.password,
            createdAt: createdAt,
          },
          {
            displayName: userData.displayName || userData.name || undefined,
            password: userData.password || undefined,
          }
        );

        return user;
      },
      'createWithPassword',
      'User'
    );
  }
}
