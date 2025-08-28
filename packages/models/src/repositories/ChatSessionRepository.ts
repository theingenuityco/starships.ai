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

      // Build query to create session and relationships
      let query = 'CREATE (s:ChatSession $props)';
      const params: any = { props: sessionData };

      // Add starship relationship if provided
      if (data.starship_id) {
        query += `
          WITH s
          MATCH (st:Starship {id: $starshipId})
          CREATE (s)-[:BELONGS_TO]->(st)`;
        params.starshipId = data.starship_id;
      }

      // Add agent relationship if provided
      if (data.agent_id) {
        query += `
          WITH s
          MATCH (a:Agent {id: $agentId})
          CREATE (s)-[:USES_AGENT]->(a)`;
        params.agentId = data.agent_id;
      }

      query += ' RETURN s';

      await connection.executeWrite(query, params);

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
   * Find sessions by starship ID (no user filtering)
   */
  async findByStarship(starshipId: string, userId?: string, limit: number = 50): Promise<ChatSession[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ starshipId }, ['starshipId'], 'findByStarship');

      const connection = getConnection();
      const params: any = { starshipId, limit: Math.floor(Number(limit)) };

      console.log('🔍 [ChatSessionRepository] findByStarship query params (no user filter):', {
        starshipId,
        limit,
        params
      });

      const query = `MATCH (s:ChatSession)-[:BELONGS_TO]->(st:Starship {id: $starshipId})
         OPTIONAL MATCH (s)-[:USES_AGENT]->(a:Agent)
         RETURN s, st, a
         ORDER BY s.last_activity_at DESC
         LIMIT $limit`;

      console.log('🔍 [ChatSessionRepository] Executing query:', query);

      const result = await connection.executeQuery<{ s: any, st: any, a: any }>(query, params);

      console.log('🔍 [ChatSessionRepository] Raw query result:', {
        resultCount: result.length,
        results: result.map(r => ({
          sessionId: r.s?.id,
          sessionSource: r.s?.source,
          sessionCreatedBy: r.s?.created_by,
          starshipId: r.st?.id,
          agentId: r.a?.id
        }))
      });

      const mappedResults = result.map(record => ({
        ...record.s,
        starship_id: starshipId,
        agent_id: record.a?.id
      } as ChatSession));

      console.log('🔍 [ChatSessionRepository] Mapped results:', {
        mappedCount: mappedResults.length,
        sessions: mappedResults.map(s => ({
          id: s.id,
          source: s.source,
          created_by: s.created_by,
          starship_id: s.starship_id,
          agent_id: s.agent_id
        }))
      });

      return mappedResults;
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