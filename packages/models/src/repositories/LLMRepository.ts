import { getConnection } from '../helpers/database';
import { LLM } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

export class LLMRepository extends BaseRepository {
  
  constructor() {
    super('LLMRepository');
  }
  
  private normalizeNumericFields(llm: LLM): LLM {
    // Ensure numeric fields are properly typed (Neo4j may return them as different types)
    return {
      ...llm,
      maxTokens: typeof llm.maxTokens === 'number' ? llm.maxTokens : 
                 typeof llm.maxTokens === 'string' ? parseInt(llm.maxTokens, 10) : 
                 llm.maxTokens, // Keep original if already undefined
      temperature: typeof llm.temperature === 'number' ? llm.temperature : 
                   typeof llm.temperature === 'string' ? parseFloat(llm.temperature) : 
                   llm.temperature, // Keep original if already undefined
      costPer1kTokens: typeof llm.costPer1kTokens === 'number' ? llm.costPer1kTokens : 
                       typeof llm.costPer1kTokens === 'string' ? parseFloat(llm.costPer1kTokens) : 
                       llm.costPer1kTokens, // Keep original if already undefined
    };
  }
  async findAll(): Promise<LLM[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ l: LLM }>(
        'MATCH (l:LLM) RETURN l ORDER BY l.name ASC'
      );
      return result.map(record => this.normalizeNumericFields(record.l));
    }, 'findAll', 'LLM');
  }

  async findById(id: string): Promise<LLM | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');
      
      const connection = getConnection();
      const result = await connection.executeQuery<{ l: LLM }>(
        'MATCH (l:LLM) WHERE l.id = $id RETURN l',
        { id }
      );
      
      if (result.length === 0) return null;
      
      return this.normalizeNumericFields(result[0].l);
    }, 'findById', 'LLM', id);
  }

  async findByProvider(provider: string): Promise<LLM[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ provider }, ['provider'], 'findByProvider');
      
      const connection = getConnection();
      const result = await connection.executeQuery<{ l: LLM }>(
        'MATCH (l:LLM) WHERE l.provider = $provider RETURN l ORDER BY l.name ASC',
        { provider }
      );
      return result.map(record => this.normalizeNumericFields(record.l));
    }, 'findByProvider', 'LLM');
  }

  async create(entity: Omit<LLM, 'id'>): Promise<LLM> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(entity, ['name', 'provider', 'createdAt'], 'create');
      
      const connection = getConnection();
      const id = uuidv4();
      
      const result = await connection.executeWrite<{ l: LLM }>(
        `CREATE (l:LLM {
          id: $id,
          name: $name,
          provider: $provider,
          maxTokens: $maxTokens,
          temperature: $temperature,
          supportsStreaming: $supportsStreaming,
          supportsTools: $supportsTools,
          costPer1kTokens: $costPer1kTokens,
          createdAt: $createdAt
        }) RETURN l`,
        {
          id,
          name: entity.name,
          provider: entity.provider,
          maxTokens: entity.maxTokens,
          temperature: entity.temperature,
          supportsStreaming: entity.supportsStreaming,
          supportsTools: entity.supportsTools,
          costPer1kTokens: entity.costPer1kTokens,
          createdAt: entity.createdAt
        }
      );
      
      return this.normalizeNumericFields(result[0].l);
    }, 'create', 'LLM');
  }

  async update(id: string, updates: Partial<LLM>): Promise<LLM | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'update');
      
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
          id,
          name: updates.name,
          provider: updates.provider,
          maxTokens: updates.maxTokens,
          temperature: updates.temperature,
          supportsStreaming: updates.supportsStreaming,
          supportsTools: updates.supportsTools,
          costPer1kTokens: updates.costPer1kTokens
        }
      );
      
      const llm = result.length > 0 ? result[0].l : null;
      return llm ? this.normalizeNumericFields(llm) : null;
    }, 'update', 'LLM', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'delete');
      
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (l:LLM) WHERE l.id = $id DETACH DELETE l RETURN count(l) as deletedCount',
        { id }
      );
      
      return result[0]?.deletedCount > 0;
    }, 'delete', 'LLM', id);
  }
} 