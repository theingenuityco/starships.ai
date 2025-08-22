import { getConnection } from '../connection';
import { User, UserRepository as UserRepositoryInterface } from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

export class UserRepository extends BaseRepository implements UserRepositoryInterface {
  constructor() {
    super('UserRepository');
  }
  async findAll(): Promise<User[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ u: User }>(
        'MATCH (u:User) RETURN u ORDER BY u.createdAt DESC'
      );
      return result.map(record => record.u);
    }, 'findAll', 'User');
  }

  async findById(id: string): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ u: User }>(
        'MATCH (u:User) WHERE u.id = $id RETURN u',
        { id: id }
      );
      return result.length > 0 ? result[0].u : null;
    }, 'findById', 'User', id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ u: User }>(
        'MATCH (u:User) WHERE u.email = $email RETURN u',
        { email: email }
      );
      return result.length > 0 ? result[0].u : null;
    }, 'findByEmail', 'User', email);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ u: User }>(
        'MATCH (u:User) WHERE u.username = $username RETURN u',
        { username: username }
      );
      return result.length > 0 ? result[0].u : null;
    }, 'findByUsername', 'User', username);
  }

  async findByKindeId(kindeId: string): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ u: User }>(
        'MATCH (u:User) WHERE u.kindeId = $kindeId RETURN u',
        { kindeId: kindeId }
      );
      return result.length > 0 ? result[0].u : null;
    }, 'findByKindeId', 'User', kindeId);
  }

  async create(entity: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(entity, ['kindeId', 'email'], 'create');
      
      const connection = getConnection();
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      
      const result = await connection.executeWrite<{ u: User }>(
        `CREATE (u:User {
          id: $id,
          kindeId: $kindeId,
          username: $username,
          email: $email,
          displayName: $displayName,
          avatar: $avatar,
          createdAt: $createdAt
        }) RETURN u`,
        { 
          id: id, 
          createdAt: createdAt, 
          kindeId: entity.kindeId,
          username: entity.username, 
          email: entity.email,
          displayName: entity.displayName,
          avatar: entity.avatar
        }
      );
      
      return result[0].u;
    }, 'create', 'User');
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      
      const setClause = Object.keys(updates)
        .filter(key => key !== 'id' && key !== 'createdAt')
        .map(key => `u.${key} = $${key}`)
        .join(', ');
      
      if (!setClause) {
        return this.findById(id);
      }

      const result = await connection.executeWrite<{ u: User }>(
        `MATCH (u:User) WHERE u.id = $id
         SET ${setClause}
         RETURN u`,
        { 
          id: id, 
          kindeId: updates.kindeId,
          username: updates.username, 
          email: updates.email,
          displayName: updates.displayName,
          avatar: updates.avatar
        }
      );
      
      if (result.length === 0) {
        this.handleNotFound('User', id, 'update');
      }
      
      return result[0].u;
    }, 'update', 'User', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (u:User) WHERE u.id = $id DETACH DELETE u RETURN count(u) as deletedCount',
        { id: id }
      );
      
      return result[0]?.deletedCount > 0;
    }, 'delete', 'User', id);
  }



  async joinChannel(userId: string, channelId: string, role?: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ userId, channelId }, ['userId', 'channelId'], 'joinChannel');
      
      const connection = getConnection();
      await connection.executeWrite(
        `MATCH (u:User), (c:Channel)
         WHERE u.id = $userId AND c.id = $channelId
         MERGE (u)-[r:ACTIVE_IN]->(c)
         SET r.joinedAt = $joinedAt, r.role = $role`,
        { userId: userId, channelId: channelId, joinedAt: new Date().toISOString(), role: role }
      );
    }, 'joinChannel', 'User', userId);
  }

  // Stripe integration methods
  async findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ user: User }>(
        `MATCH (user:User {stripeCustomerId: $stripeCustomerId})
         RETURN user`,
        { stripeCustomerId }
      );
      
      return result[0]?.user || null;
    }, 'findByStripeCustomerId', 'User', stripeCustomerId);
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ userId, stripeCustomerId }, ['userId', 'stripeCustomerId'], 'updateStripeCustomerId');
      
      const connection = getConnection();
      await connection.executeWrite(
        `MATCH (user:User {id: $userId})
         SET user.stripeCustomerId = $stripeCustomerId`,
        { userId, stripeCustomerId }
      );
    }, 'updateStripeCustomerId', 'User', userId);
  }
} 