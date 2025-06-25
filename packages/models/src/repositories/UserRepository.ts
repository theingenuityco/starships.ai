import { getConnection } from '../connection';
import { User, UserRepository as UserRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class UserRepository implements UserRepositoryInterface {
  async findAll(): Promise<User[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ u: User }>(
      'MATCH (u:User) RETURN u ORDER BY u.createdAt DESC'
    );
    return result.map(record => record.u);
  }

  async findById(id: string): Promise<User | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ u: User }>(
      'MATCH (u:User) WHERE u.id = $id RETURN u',
      { id: id }
    );
    return result.length > 0 ? result[0].u : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ u: User }>(
      'MATCH (u:User) WHERE u.email = $email RETURN u',
      { email: email }
    );
    return result.length > 0 ? result[0].u : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ u: User }>(
      'MATCH (u:User) WHERE u.username = $username RETURN u',
      { username: username }
    );
    return result.length > 0 ? result[0].u : null;
  }

  async findByKindeId(kindeId: string): Promise<User | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ u: User }>(
      'MATCH (u:User) WHERE u.kindeId = $kindeId RETURN u',
      { kindeId: kindeId }
    );
    return result.length > 0 ? result[0].u : null;
  }

  async create(entity: Omit<User, 'id' | 'createdAt'>): Promise<User> {
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
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
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
    
    return result.length > 0 ? result[0].u : null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (u:User) WHERE u.id = $id DETACH DELETE u RETURN count(u) as deletedCount',
      { id: id }
    );
    
    return result[0]?.deletedCount > 0;
  }



  async joinChannel(userId: string, channelId: string, role?: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (u:User), (c:Channel)
       WHERE u.id = $userId AND c.id = $channelId
       MERGE (u)-[r:ACTIVE_IN]->(c)
       SET r.joinedAt = $joinedAt, r.role = $role`,
      { userId: userId, channelId: channelId, joinedAt: new Date().toISOString(), role: role }
    );
  }
} 