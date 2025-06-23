import { getConnection } from '../connection';
import { LLM, LLMRepository as LLMRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class LLMRepository implements LLMRepositoryInterface {
  async findAll(): Promise<LLM[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ l: LLM }>(
      'MATCH (l:LLM) RETURN l ORDER BY l.name ASC'
    );
    return result.map(record => record.l);
  }

  async findById(id: string): Promise<LLM | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ l: LLM }>(
      'MATCH (l:LLM) WHERE l.id = $id RETURN l',
      { id: id }
    );
    return result.length > 0 ? result[0].l : null;
  }

  async findByProvider(provider: string): Promise<LLM[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ l: LLM }>(
      'MATCH (l:LLM) WHERE l.provider = $provider RETURN l ORDER BY l.name ASC',
      { provider: provider }
    );
    return result.map(record => record.l);
  }

  async create(entity: Omit<LLM, 'id'>): Promise<LLM> {
    const connection = getConnection();
    const id = uuidv4();
    
    const result = await connection.executeWrite<{ l: LLM }>(
      `CREATE (l:LLM {
        id: $id,
        name: $name,
        provider: $provider,
        maxTokens: $maxTokens,
        temperature: $temperature,
        embeddingModel: $embeddingModel,
        supportsStreaming: $supportsStreaming,
        supportsTools: $supportsTools,
        costPer1kTokens: $costPer1kTokens
      }) RETURN l`,
      { 
        id: id, 
        name: entity.name, 
        provider: entity.provider, 
        maxTokens: entity.maxTokens, 
        temperature: entity.temperature,
        embeddingModel: entity.embeddingModel,
        supportsStreaming: entity.supportsStreaming,
        supportsTools: entity.supportsTools,
        costPer1kTokens: entity.costPer1kTokens
      }
    );
    
    return result[0].l;
  }

  async update(id: string, updates: Partial<LLM>): Promise<LLM | null> {
    const connection = getConnection();
    
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `l.${key} = $${key}`)
      .join(', ');
    
    if (!setClause) {
      return this.findById(id);
    }

    const result = await connection.executeWrite<{ l: LLM }>(
      `MATCH (l:LLM) WHERE l.id = $id
       SET ${setClause}
       RETURN l`,
      { 
        id: id, 
        name: updates.name, 
        provider: updates.provider, 
        maxTokens: updates.maxTokens, 
        temperature: updates.temperature,
        embeddingModel: updates.embeddingModel,
        supportsStreaming: updates.supportsStreaming,
        supportsTools: updates.supportsTools,
        costPer1kTokens: updates.costPer1kTokens
      }
    );
    
    return result.length > 0 ? result[0].l : null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (l:LLM) WHERE l.id = $id DETACH DELETE l RETURN count(l) as deletedCount',
      { id: id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 