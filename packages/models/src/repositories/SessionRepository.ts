import { getConnection } from '../helpers/database';
import { SessionModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

export class SessionRepository extends BaseRepository {
  constructor() {
    super('SessionRepository');
  }

  async findAll(): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: SessionModel }>(
        'MATCH (s:SessionModel) RETURN s ORDER BY s.last_activity_at DESC'
      );
      return result.map(record => this.mapToSession(record.s));
    }, 'findAll', 'Session');
  }

  async findById(id: string): Promise<SessionModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:SessionModel) WHERE s.id = $id RETURN s',
        { id }
      );
      return result.length > 0 ? this.mapToSession(result[0].s) : null;
    }, 'findById', 'Session', id);
  }

  async findByUserId(userId: string): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:SessionModel) WHERE s.created_by = $userId RETURN s ORDER BY s.last_activity_at DESC',
        { userId }
      );
      return result.map(record => this.mapToSession(record.s));
    }, 'findByUserId', 'Session', userId);
  }

  async findByStarshipId(starshipId: string): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:SessionModel) WHERE s.starship_id = $starshipId RETURN s ORDER BY s.last_activity_at DESC',
        { starshipId }
      );
      return result.map(record => this.mapToSession(record.s));
    }, 'findByStarshipId', 'Session', starshipId);
  }

  async findByAgentId(agentId: string): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:SessionModel) WHERE s.agent_id = $agentId RETURN s ORDER BY s.last_activity_at DESC',
        { agentId }
      );
      return result.map(record => this.mapToSession(record.s));
    }, 'findByAgentId', 'Session', agentId);
  }

  async findActiveByUser(userId: string): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:SessionModel) WHERE s.created_by = $userId AND s.status = $status RETURN s ORDER BY s.last_activity_at DESC',
        { userId, status: 'active' }
      );
      return result.map(record => this.mapToSession(record.s));
    }, 'findActiveByUser', 'Session', userId);
  }

  async create(entity: Omit<SessionModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionModel> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(entity, ['source', 'userId'], 'create');
      
      const connection = getConnection();
      const id = uuidv4();
      const now = new Date().toISOString();
      
      const result = await connection.executeWrite<{ s: any }>(
        `CREATE (s:SessionModel {
          id: $id,
          source: $source,
          created_by: $userId,
          starship_id: $starshipId,
          agent_id: $agentId,
          created_at: $createdAt,
          last_activity_at: $lastActivityAt,
          message_count: $messageCount,
          total_tokens: $totalTokens,
          status: $status,
          metadata: $metadata
        })
        RETURN s`,
        { 
          id,
          source: entity.source,
          userId: entity.userId,
          starshipId: entity.starshipId,
          agentId: entity.agentId,
          createdAt: now,
          lastActivityAt: entity.lastActivityAt || now,
          messageCount: entity.messageCount || 0,
          totalTokens: entity.totalTokens || 0,
          status: entity.status || 'active',
          metadata: entity.metadata ? JSON.stringify(entity.metadata) : null
        }
      );
      
      return this.mapToSession(result[0].s);
    }, 'create', 'Session');
  }

  async update(id: string, updates: Partial<SessionModel>): Promise<SessionModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      
      const setFields = [];
      const params: any = { id };
      
      // Handle updatable fields
      if (updates.lastActivityAt !== undefined) {
        setFields.push('s.last_activity_at = $lastActivityAt');
        params.lastActivityAt = updates.lastActivityAt;
      }
      if (updates.messageCount !== undefined) {
        setFields.push('s.message_count = $messageCount');
        params.messageCount = updates.messageCount;
      }
      if (updates.totalTokens !== undefined) {
        setFields.push('s.total_tokens = $totalTokens');
        params.totalTokens = updates.totalTokens;
      }
      if (updates.status !== undefined) {
        setFields.push('s.status = $status');
        params.status = updates.status;
      }
      if (updates.metadata !== undefined) {
        setFields.push('s.metadata = $metadata');
        params.metadata = updates.metadata ? JSON.stringify(updates.metadata) : null;
      }
      
      if (setFields.length === 0) {
        return this.findById(id);
      }

      // Always update the updatedAt field
      setFields.push('s.updated_at = $updatedAt');
      params.updatedAt = new Date().toISOString();

      const result = await connection.executeWrite<{ s: any }>(
        `MATCH (s:SessionModel) WHERE s.id = $id
         SET ${setFields.join(', ')}
         RETURN s`,
        params
      );
      
      if (result.length === 0) {
        this.handleNotFound('Session', id, 'update');
      }
      
      return this.mapToSession(result[0].s);
    }, 'update', 'Session', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (s:SessionModel) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
        { id }
      );
      
      return result[0]?.deletedCount > 0;
    }, 'delete', 'Session', id);
  }

  async updateActivity(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      await connection.executeWrite(
        'MATCH (s:SessionModel) WHERE s.id = $id SET s.last_activity_at = $timestamp',
        { id, timestamp: new Date().toISOString() }
      );
    }, 'updateActivity', 'Session', id);
  }

  async incrementMessageCount(id: string, increment: number = 1): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      await connection.executeWrite(
        'MATCH (s:SessionModel) WHERE s.id = $id SET s.message_count = s.message_count + $increment, s.last_activity_at = $timestamp',
        { id, increment, timestamp: new Date().toISOString() }
      );
    }, 'incrementMessageCount', 'Session', id);
  }

  async updateTokenCount(id: string, tokens: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      await connection.executeWrite(
        'MATCH (s:SessionModel) WHERE s.id = $id SET s.total_tokens = s.total_tokens + $tokens, s.last_activity_at = $timestamp',
        { id, tokens, timestamp: new Date().toISOString() }
      );
    }, 'updateTokenCount', 'Session', id);
  }

  async markAsCompleted(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      await connection.executeWrite(
        'MATCH (s:SessionModel) WHERE s.id = $id SET s.status = $status, s.last_activity_at = $timestamp',
        { id, status: 'completed', timestamp: new Date().toISOString() }
      );
    }, 'markAsCompleted', 'Session', id);
  }

  async archiveSession(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      await connection.executeWrite(
        'MATCH (s:SessionModel) WHERE s.id = $id SET s.status = $status, s.last_activity_at = $timestamp',
        { id, status: 'archived', timestamp: new Date().toISOString() }
      );
    }, 'archiveSession', 'Session', id);
  }

  /**
   * Map database SessionModel to Session domain model
   */
  private mapToSession(sessionModel: any): SessionModel {
    return {
      id: sessionModel.id,
      source: sessionModel.source,
      agentId: sessionModel.agent_id,
      userId: sessionModel.created_by,
      starshipId: sessionModel.starship_id,
      createdAt: sessionModel.created_at,
      updatedAt: sessionModel.updated_at || sessionModel.created_at,
      lastActivityAt: sessionModel.last_activity_at,
      messageCount: sessionModel.message_count || 0,
      totalTokens: sessionModel.total_tokens || 0,
      status: sessionModel.status || 'active',
      metadata: sessionModel.metadata ? JSON.parse(sessionModel.metadata) : undefined
    };
  }
}