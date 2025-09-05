import { getConnection, Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import { SessionModel } from '@starships/protocol';

export class SessionRepository extends BaseRepository {
  private connection: Neo4jConnection;

  constructor(connection?: Neo4jConnection) {
    super('SessionRepository');
    this.connection = connection || getConnection();
  }

  async findAll(): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ s: SessionModel }>('MATCH (s:Session) RETURN s ORDER BY s.lastActivityAt DESC');
        return result.map((record) => this.mapToSession(record.s));
      },
      'findAll',
      'Session'
    );
  }

  async findById(id: string): Promise<SessionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: SessionModel }>('MATCH (s:Session) WHERE s.id = $id RETURN s', { id });
        return result.length > 0 ? this.mapToSession(result[0].s) : null;
      },
      'findById',
      'Session',
      id
    );
  }

  async create(entity: Omit<SessionModel, 'id' | 'createdAt' | 'updatedAt'>, starshipId?: string): Promise<SessionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const now = this.getCurrentTimestamp();

        const sessionData = {
          createdAt: now,
          lastActivityAt: entity.lastActivityAt || now,
          messageCount: entity.messageCount || 0,
          totalTokens: entity.totalTokens || 0,
          status: entity.status || 'active',
          metadata: this.safeJsonStringify(entity.metadata),
        };

        const result = await this.createEntityWithAutoId<SessionModel>('Session', sessionData, this.connection);

        // Create relationship with starship if starshipId is provided
        if (starshipId) {
          await this.linkToStarship(result.id, starshipId);
        }

        return this.mapToSession(result);
      },
      'create',
      'Session'
    );
  }

  async update(id: string, updates: Partial<SessionModel>): Promise<SessionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;

        const setFields = [];
        const params: Record<string, unknown> = { id };

        // Handle updatable fields
        if (updates.lastActivityAt !== undefined) {
          setFields.push('s.lastActivityAt = $lastActivityAt');
          params.lastActivityAt = updates.lastActivityAt;
        }
        if (updates.messageCount !== undefined) {
          setFields.push('s.messageCount = $messageCount');
          params.messageCount = updates.messageCount;
        }
        if (updates.totalTokens !== undefined) {
          setFields.push('s.totalTokens = $totalTokens');
          params.totalTokens = updates.totalTokens;
        }
        if (updates.status !== undefined) {
          setFields.push('s.status = $status');
          params.status = updates.status;
        }
        if (updates.metadata !== undefined) {
          setFields.push('s.metadata = $metadata');
          params.metadata = this.safeJsonStringify(updates.metadata);
        }

        if (setFields.length === 0) {
          return this.findById(id);
        }

        // Always update the updatedAt field
        setFields.push('s.updatedAt = $updatedAt');
        params.updatedAt = this.getCurrentTimestamp();

        const result = await connection.executeWrite<{ s: SessionModel }>(
          `MATCH (s:Session) WHERE s.id = $id
         SET ${setFields.join(', ')}
         RETURN s`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Session', id, 'update');
        }

        return this.mapToSession(result[0].s);
      },
      'update',
      'Session',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (s:Session) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Session',
      id
    );
  }

  async updateActivity(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite('MATCH (s:Session) WHERE s.id = $id SET s.lastActivityAt = $timestamp', {
          id,
          timestamp: this.getCurrentTimestamp(),
        });
      },
      'updateActivity',
      'Session',
      id
    );
  }

  async incrementMessageCount(id: string, increment: number = 1): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite(
          'MATCH (s:Session) WHERE s.id = $id SET s.messageCount = s.messageCount + $increment, s.lastActivityAt = $timestamp',
          { id, increment, timestamp: this.getCurrentTimestamp() }
        );
      },
      'incrementMessageCount',
      'Session',
      id
    );
  }

  async updateTokenCount(id: string, tokens: number): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite(
          'MATCH (s:Session) WHERE s.id = $id SET s.totalTokens = s.totalTokens + $tokens, s.lastActivityAt = $timestamp',
          { id, tokens, timestamp: this.getCurrentTimestamp() }
        );
      },
      'updateTokenCount',
      'Session',
      id
    );
  }

  async markAsCompleted(id: string): Promise<void> {
    return this.updateStatus(id, 'completed', 'markAsCompleted');
  }

  async archiveSession(id: string): Promise<void> {
    return this.updateStatus(id, 'archived', 'archiveSession');
  }

  /**
   * Common method to update session status and activity timestamp
   */
  private async updateStatus(id: string, status: string, methodName: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite('MATCH (s:Session) WHERE s.id = $id SET s.status = $status, s.lastActivityAt = $timestamp', {
          id,
          status,
          timestamp: this.getCurrentTimestamp(),
        });
      },
      methodName,
      'Session',
      id
    );
  }

  /**
   * Find all sessions for a specific starship using Neo4j relationships
   */
  async findByStarship(starshipId: string): Promise<SessionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: SessionModel }>(
          `MATCH (starship:Starship {id: $starshipId})-[:HAS_SESSION]->(s:Session)
           RETURN s ORDER BY s.lastActivityAt DESC`,
          { starshipId }
        );
        return result.map((record) => this.mapToSession(record.s));
      },
      'findByStarship',
      'Session'
    );
  }

  /**
   * Get the starship associated with a session using Neo4j relationships
   */
  async getSessionStarship(sessionId: string): Promise<{ id: string; name: string; slug: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ starship: { id: string; name: string; slug: string } }>(
          `MATCH (starship:Starship)-[:HAS_SESSION]->(s:Session {id: $sessionId})
           RETURN starship`,
          { sessionId }
        );
        return result.length > 0
          ? {
              id: result[0].starship.id,
              name: result[0].starship.name,
              slug: result[0].starship.slug,
            }
          : null;
      },
      'getSessionStarship',
      'Session'
    );
  }

  /**
   * Create relationship between existing session and starship
   */
  async linkToStarship(sessionId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (session:Session {id: $sessionId})
           CREATE (s)-[:HAS_SESSION {key: $key}]->(session)`,
          {
            starshipId,
            sessionId,
            key: `${starshipId}_${sessionId}`,
          }
        );
      },
      'linkToStarship',
      'Session'
    );
  }

  /**
   * Remove relationship between session and starship
   */
  async unlinkFromStarship(sessionId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        await connection.executeWrite(
          `MATCH (s:Starship)-[r:HAS_SESSION]->(session:Session {id: $sessionId})
           DELETE r`,
          { sessionId }
        );
      },
      'unlinkFromStarship',
      'Session'
    );
  }

  /**
   * Map database SessionModel to Session domain model
   */
  private mapToSession(sessionModel: any): SessionModel {
    if (!sessionModel) return sessionModel;

    const mapped = {
      id: sessionModel.id,
      createdAt: sessionModel.createdAt,
      updatedAt: sessionModel.updatedAt,
      lastActivityAt: sessionModel.lastActivityAt,
      messageCount: sessionModel.messageCount || 0,
      totalTokens: sessionModel.totalTokens || 0,
      status: sessionModel.status || 'active',
      metadata: sessionModel.metadata,
    };

    // Handle metadata JSON parsing and conversion to undefined for null/invalid JSON
    if (mapped.metadata === null) {
      mapped.metadata = undefined;
    } else if (typeof mapped.metadata === 'string') {
      try {
        mapped.metadata = JSON.parse(mapped.metadata);
      } catch (e) {
        // For invalid JSON, set to undefined as tests expect
        mapped.metadata = undefined;
      }
    }

    return mapped as SessionModel;
  }

  /**
   * Get current timestamp in ISO format
   */
  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}
