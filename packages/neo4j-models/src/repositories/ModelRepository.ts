import { getConnection } from '../connection';
import { Model, ModelRepository as ModelRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ModelRepository implements ModelRepositoryInterface {
  async findAll(): Promise<Model[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: Model }>(
      'MATCH (m:Model) RETURN m ORDER BY m.name ASC'
    );
    return result.map(record => record.m);
  }

  async findById(id: string): Promise<Model | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: Model }>(
      'MATCH (m:Model) WHERE m.id = $id RETURN m',
      { id: id }
    );
    return result.length > 0 ? result[0].m : null;
  }

  async findByProvider(provider: string): Promise<Model[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: Model }>(
      'MATCH (m:Model) WHERE m.provider = $provider RETURN m ORDER BY m.name ASC',
      { provider: provider }
    );
    return result.map(record => record.m);
  }

  async create(entity: Omit<Model, 'id'>): Promise<Model> {
    const connection = getConnection();
    const id = uuidv4();
    
    const result = await connection.executeWrite<{ m: Model }>(
      `CREATE (m:Model {
        id: $id,
        name: $name,
        provider: $provider,
        maxTokens: $maxTokens,
        temperature: $temperature
      }) RETURN m`,
      { id: id, name: entity.name, provider: entity.provider, maxTokens: entity.maxTokens, temperature: entity.temperature }
    );
    
    return result[0].m;
  }

  async update(id: string, updates: Partial<Model>): Promise<Model | null> {
    const connection = getConnection();
    
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `m.${key} = $${key}`)
      .join(', ');
    
    if (!setClause) {
      return this.findById(id);
    }

    const result = await connection.executeWrite<{ m: Model }>(
      `MATCH (m:Model) WHERE m.id = $id
       SET ${setClause}
       RETURN m`,
      { id: id, name: updates.name, provider: updates.provider, maxTokens: updates.maxTokens, temperature: updates.temperature }
    );
    
    return result.length > 0 ? result[0].m : null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (m:Model) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
      { id: id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 