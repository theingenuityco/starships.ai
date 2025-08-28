import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, ChatSourceType } from '@starships/protocol';

export class ChatSessionRepository extends BaseRepository {
  constructor() {
    super('ChatSessionRepository');
  }

  /**
   * Create a new chat session
   */
  async create(data: {
    source: ChatSourceType;
    created_by: string;
    starship_id?: string;
    agent_id?: string;
  }): Promise<ChatSession> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(data, ['source', 'created_by'], 'create');
      this.validateEnums(data, { source: ['sibil', 'agent'] }, 'create');

      const connection = getConnection();
      const id = uuidv4();
      const now = new Date().toISOString();

      const sessionData = {
        id,
        source: data.source,
        created_by: data.created_by,
        created_at: now,
        last_activity_at: now,
        total_tokens: 0
      };

      await connection.executeWrite(
        'CREATE (s:ChatSession $props) RETURN s',
        { props: sessionData }
      );

      return {
        ...sessionData,
        starship_id: data.starship_id,
        agent_id: data.agent_id
      } as ChatSession;
    }, 'create', 'ChatSession');
  }

  /**
   * Find chat session by ID
   */
  async findById(id: string): Promise<ChatSession | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');

      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        'MATCH (s:ChatSession {id: $id}) RETURN s',
        { id }
      );

      return result[0]?.s || null;
    }, 'findById', 'ChatSession', id);
  }

  /**
   * Find sessions by user ID
   */
  async findByUser(userId: string, limit: number = 50): Promise<ChatSession[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ userId }, ['userId'], 'findByUser');

      const connection = getConnection();
      const result = await connection.executeQuery<{ s: any }>(
        `MATCH (s:ChatSession {created_by: $userId})
         RETURN s
         ORDER BY s.last_activity_at DESC
         LIMIT $limit`,
        { userId, limit: Math.floor(Number(limit)) }
      );

      return result.map(record => record.s as ChatSession);
    }, 'findByUser', 'ChatSession');
  }

  /**
   * Find sessions by starship ID
   */
  async findByStarship(starshipId: string, userId?: string, limit: number = 50): Promise<ChatSession[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ starshipId }, ['starshipId'], 'findByStarship');

      const connection = getConnection();
      
      // Build query with optional user filter
      const userFilter = userId ? 'AND s.created_by = $userId' : '';
      const params: any = { starshipId, limit: Math.floor(Number(limit)) };
      if (userId) params.userId = userId;

      const result = await connection.executeQuery<{ s: any, st: any, a: any }>(
        `MATCH (s:ChatSession)-[:BELONGS_TO]->(st:Starship {id: $starshipId})
         WHERE 1=1 ${userFilter}
         OPTIONAL MATCH (s)-[:USES_AGENT]->(a:Agent)
         RETURN s, st, a
         ORDER BY s.last_activity_at DESC
         LIMIT $limit`,
        params
      );

      return result.map(record => ({
        ...record.s,
        starship_id: starshipId,
        agent_id: record.a?.id
      } as ChatSession));
    }, 'findByStarship', 'ChatSession');
  }

  /**
   * Update last activity and token count
   */
  async updateActivity(sessionId: string, tokensUsed: number = 0): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'updateActivity');

      const connection = getConnection();
      const result = await connection.executeWrite<{ count: number }>(
        `MATCH (s:ChatSession {id: $sessionId})
         SET s.total_tokens = s.total_tokens + $tokensUsed,
             s.last_activity_at = $timestamp
         RETURN count(s) as count`,
        {
          sessionId,
          tokensUsed,
          timestamp: new Date().toISOString()
        }
      );

      return result[0]?.count > 0;
    }, 'updateActivity', 'ChatSession', sessionId);
  }
}