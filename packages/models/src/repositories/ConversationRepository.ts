import { getConnection, Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import { ConversationModel } from '@starships/protocol';

export class ConversationRepository extends BaseRepository {
  private connection: Neo4jConnection | null = null;

  constructor(connection?: Neo4jConnection) {
    super('ConversationRepository');
    this.connection = connection || null;
  }

  private getConnection(): Neo4jConnection {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  async findAll(): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>(
          'MATCH (c:Conversation) RETURN c ORDER BY c.lastActivityAt DESC'
        );
        return result.map((record) =>
          this.mapFromDatabaseRecord<ConversationModel>(record.c, {
            jsonFields: ['metadata'],
            defaultValues: {
              messageCount: 0,
              totalTokens: 0,
              status: 'active',
            },
          })
        );
      },
      'findAll',
      'Conversation'
    );
  }

  async findById(id: string): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>('MATCH (c:Conversation) WHERE c.id = $id RETURN c', { id });
        return result.length > 0
          ? this.mapFromDatabaseRecord<ConversationModel>(result[0].c, {
              jsonFields: ['metadata'],
              defaultValues: {
                messageCount: 0,
                totalTokens: 0,
                status: 'active',
              },
            })
          : null;
      },
      'findById',
      'Conversation',
      id
    );
  }

  async create(entity: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'>, starshipId?: string): Promise<ConversationModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate required fields using BaseRepository validation
        this.validateRequired(entity, ['lastActivityAt', 'messageCount', 'status'], 'create');

        // Validate field types
        this.validateTypes(
          entity,
          {
            lastActivityAt: 'string',
            messageCount: 'number',
            status: 'string',
            totalTokens: 'number',
          },
          'create'
        );

        // Validate enum values (status)
        this.validateEnums(
          entity,
          {
            status: ['active', 'paused', 'completed', 'archived'],
          },
          'create'
        );

        // Validate string lengths
        this.validateStringLengths(
          entity,
          {
            status: { min: 1, max: 50 },
          },
          'create'
        );

        const connection = this.getConnection();
        const now = this.getCurrentTimestamp();

        // Prepare conversation data with defaults and validation
        const conversationData = {
          createdAt: now,
          lastActivityAt: entity.lastActivityAt || now,
          messageCount: entity.messageCount || 0,
          totalTokens: entity.totalTokens || 0,
          status: entity.status || 'active',
          metadata: this.safeJsonStringify(entity.metadata),
        };

        // Use BaseRepository serialization (the conversationData is already properly prepared)
        const result = await this.createEntityWithAutoId<ConversationModel>('Conversation', conversationData, connection);

        // Create relationship with starship if starshipId is provided
        if (starshipId) {
          await this.linkToStarship(result.id, starshipId);
        }

        // Use consistent mapping from database record
        return this.mapFromDatabaseRecord<ConversationModel>(result, {
          jsonFields: ['metadata'],
          defaultValues: {
            messageCount: 0,
            totalTokens: 0,
            status: 'active',
          },
        });
      },
      'create',
      'Conversation'
    );
  }

  async update(id: string, updates: Partial<ConversationModel>): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate updates using BaseRepository validation
        if (updates.status !== undefined) {
          this.validateEnums(
            updates,
            {
              status: ['active', 'paused', 'completed', 'archived'],
            },
            'update'
          );
        }

        if (updates.messageCount !== undefined || updates.totalTokens !== undefined) {
          this.validateTypes(
            updates,
            {
              messageCount: 'number',
              totalTokens: 'number',
            },
            'update'
          );
        }

        const connection = this.getConnection();
        const setFields = [];
        const params: Record<string, unknown> = { id };

        // Handle updatable fields with proper serialization
        if (updates.lastActivityAt !== undefined) {
          setFields.push('c.lastActivityAt = $lastActivityAt');
          params.lastActivityAt = updates.lastActivityAt;
        }
        if (updates.messageCount !== undefined) {
          setFields.push('c.messageCount = $messageCount');
          params.messageCount = updates.messageCount;
        }
        if (updates.totalTokens !== undefined) {
          setFields.push('c.totalTokens = $totalTokens');
          params.totalTokens = updates.totalTokens;
        }
        if (updates.status !== undefined) {
          setFields.push('c.status = $status');
          params.status = updates.status;
        }
        if (updates.metadata !== undefined) {
          setFields.push('c.metadata = $metadata');
          params.metadata = this.safeJsonStringify(updates.metadata);
        }

        if (setFields.length === 0) {
          return this.findById(id);
        }

        // Always update the updatedAt field
        setFields.push('c.updatedAt = $updatedAt');
        params.updatedAt = this.getCurrentTimestamp();

        const result = await connection.executeWrite<{ c: ConversationModel }>(
          `MATCH (c:Conversation) WHERE c.id = $id
         SET ${setFields.join(', ')}
         RETURN c`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Conversation', id, 'update');
        }

        // Use consistent mapping from database record
        return this.mapFromDatabaseRecord<ConversationModel>(result[0].c, {
          jsonFields: ['metadata'],
          defaultValues: {
            messageCount: 0,
            totalTokens: 0,
            status: 'active',
          },
        });
      },
      'update',
      'Conversation',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (c:Conversation) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Conversation',
      id
    );
  }

  async updateActivity(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite('MATCH (c:Conversation) WHERE c.id = $id SET c.lastActivityAt = $timestamp', {
          id,
          timestamp: this.getCurrentTimestamp(),
        });
      },
      'updateActivity',
      'Conversation',
      id
    );
  }

  async incrementMessageCount(id: string, increment: number = 1): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          'MATCH (c:Conversation) WHERE c.id = $id SET c.messageCount = c.messageCount + $increment, c.lastActivityAt = $timestamp',
          { id, increment, timestamp: this.getCurrentTimestamp() }
        );
      },
      'incrementMessageCount',
      'Conversation',
      id
    );
  }

  async updateTokenCount(id: string, tokens: number): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          'MATCH (c:Conversation) WHERE c.id = $id SET c.totalTokens = c.totalTokens + $tokens, c.lastActivityAt = $timestamp',
          { id, tokens, timestamp: this.getCurrentTimestamp() }
        );
      },
      'updateTokenCount',
      'Conversation',
      id
    );
  }

  async markAsCompleted(id: string): Promise<void> {
    return this.updateStatus(id, 'completed', 'markAsCompleted');
  }

  async archiveConversation(id: string): Promise<void> {
    return this.updateStatus(id, 'archived', 'archiveConversation');
  }

  /**
   * Common method to update conversation status and activity timestamp
   */
  private async updateStatus(id: string, status: string, methodName: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite('MATCH (c:Conversation) WHERE c.id = $id SET c.status = $status, c.lastActivityAt = $timestamp', {
          id,
          status,
          timestamp: this.getCurrentTimestamp(),
        });
      },
      methodName,
      'Conversation',
      id
    );
  }

  /**
   * Find all conversations for a specific starship using Neo4j relationships
   */
  async findByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>(
          `MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)
           RETURN c ORDER BY c.lastActivityAt DESC`,
          { starshipId }
        );
        return result.map((record) =>
          this.mapFromDatabaseRecord<ConversationModel>(record.c, {
            jsonFields: ['metadata'],
            defaultValues: {
              messageCount: 0,
              totalTokens: 0,
              status: 'active',
            },
          })
        );
      },
      'findByStarship',
      'Conversation'
    );
  }

  /**
   * Get the starship associated with a conversation using Neo4j relationships
   */
  async getConversationStarship(conversationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ starship: { id: string; name: string; slug: string } }>(
          `MATCH (starship:Starship)-[:HAS_CONVERSATION]->(c:Conversation {id: $conversationId})
           RETURN starship`,
          { conversationId }
        );
        return result.length > 0
          ? {
              id: result[0].starship.id,
              name: result[0].starship.name,
              slug: result[0].starship.slug,
            }
          : null;
      },
      'getConversationStarship',
      'Conversation'
    );
  }

  /**
   * Create relationship between existing conversation and starship
   */
  async linkToStarship(conversationId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (conversation:Conversation {id: $conversationId})
           CREATE (s)-[:HAS_CONVERSATION {key: $key}]->(conversation)`,
          {
            starshipId,
            conversationId,
            key: `${starshipId}_${conversationId}`,
          }
        );
      },
      'linkToStarship',
      'Conversation'
    );
  }

  /**
   * Remove relationship between conversation and starship
   */
  async unlinkFromStarship(conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship)-[r:HAS_CONVERSATION]->(conversation:Conversation {id: $conversationId})
           DELETE r`,
          { conversationId }
        );
      },
      'unlinkFromStarship',
      'Conversation'
    );
  }

  /**
   * Get current timestamp in ISO format
   */
  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}
