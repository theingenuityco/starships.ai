import { getConnection } from '../connection';
import { Channel, ChannelRepository as ChannelRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ChannelRepository implements ChannelRepositoryInterface {
  async findAll(): Promise<Channel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Channel }>(
      'MATCH (c:Channel) RETURN c ORDER BY c.createdAt DESC'
    );
    return result.map(record => record.c);
  }

  async findById(id: string): Promise<Channel | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Channel }>(
      'MATCH (c:Channel) WHERE c.id = $id RETURN c',
      { id: id }
    );
    return result.length > 0 ? result[0].c : null;
  }

  async findByGuild(guildId: string): Promise<Channel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Channel }>(
      'MATCH (c:Channel) WHERE c.guildId = $guildId RETURN c ORDER BY c.createdAt DESC',
      { guildId: guildId }
    );
    return result.map(record => record.c);
  }

  async findByType(type: string): Promise<Channel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Channel }>(
      'MATCH (c:Channel) WHERE c.type = $type RETURN c ORDER BY c.createdAt DESC',
      { type: type }
    );
    return result.map(record => record.c);
  }

  async create(entity: Omit<Channel, 'id' | 'createdAt'>): Promise<Channel> {
    const connection = getConnection();
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    const result = await connection.executeWrite<{ c: Channel }>(
      `CREATE (c:Channel {
        id: $id,
        name: $name,
        type: $type,
        guildId: $guildId,
        createdAt: $createdAt
      }) RETURN c`,
      { id: id, createdAt: createdAt, name: entity.name, type: entity.type, guildId: entity.guildId }
    );
    
    return result[0].c;
  }

  async update(id: string, updates: Partial<Channel>): Promise<Channel | null> {
    const connection = getConnection();
    
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `c.${key} = $${key}`)
      .join(', ');
    
    if (!setClause) {
      return this.findById(id);
    }

    const result = await connection.executeWrite<{ c: Channel }>(
      `MATCH (c:Channel) WHERE c.id = $id
       SET ${setClause}
       RETURN c`,
      { id: id, name: updates.name, type: updates.type, guildId: updates.guildId }
    );
    
    return result.length > 0 ? result[0].c : null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:Channel) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
      { id: id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 