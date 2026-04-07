import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, Conversation, ConversationModel, MessageModel, StarshipModel } from '@starships/protocol';
import { AgentEntity } from '../entities/AgentEntity';
import { ConversationEntity } from '../entities/ConversationEntity';
import { MessageEntity } from '../entities/MessageEntity';
import { StarshipEntity } from '../entities/StarshipEntity';
import type { PostgresConnection } from '@/helpers/database';

export class ConversationRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('ConversationRepository', connection);
  }

  async findAll(): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('conversations', 'created_at DESC');
        return fromDatabaseArray(ConversationEntity, result);
      },
      'findAll',
      'Conversation'
    );
  }

  async findById(id: string): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('conversations', id);
        return result ? fromDatabase(ConversationEntity, result) : null;
      },
      'findById',
      'Conversation',
      id
    );
  }

  async create(entity: Conversation & { starshipId: string; agentId?: string; parentConversationId?: string }): Promise<ConversationModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare conversation data with defaults - include starshipId for validation
        const conversationData = {
          title: entity.title,
          status: entity.status || 'active',
          starshipId: entity.starshipId,
          ...(entity.parentConversationId ? { parentConversationId: entity.parentConversationId } : {}),
          createdAt: now,
          updatedAt: now,
        };

        // Validate with starshipId included
        await ConversationEntity.validate(conversationData, 'create');

        // Create entity instance from plain object, then serialize
        const conversationEntity = toEntityInstance(ConversationEntity, conversationData);
        const result = await this.createEntity<Record<string, unknown>>('conversations', toDatabase(conversationEntity));
        const conversation = fromDatabase(ConversationEntity, result);

        // Create junction table relationship with agent if provided
        if (entity.agentId) {
          await this.linkToAgent(conversation.id, entity.agentId);
        }

        return conversation;
      },
      'create',
      'Conversation'
    );
  }

  async update(id: string, updates: Partial<ConversationModel>): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from ConversationEntity for updates
        await ConversationEntity.validate(updates, 'update');

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(ConversationEntity, updateProps));

        // Filter out protected fields (id, createdAt, starship_id)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, starship_id: _starshipId, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('conversations', id, filteredUpdateData);
        if (!result) {
          this.handleNotFound('Conversation', id);
        }
        return fromDatabase(ConversationEntity, result);
      },
      'update',
      'Conversation',
      id
    );
  }

  /**
   * Atomically merge a partial state patch into conversation.state (JSONB) in the database.
   *
   * This avoids race conditions where multiple processes read-modify-write `state` concurrently
   * (e.g. multiple processes persisting different execution state keys concurrently).
   *
   * Note: This performs a shallow JSONB merge at the top level: `state = state || patch`.
   */
  async mergeState(conversationId: string, patch: Record<string, unknown>): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          throw new Error('State patch must be an object');
        }

        const connection = this.getConnection();
        // Pass JSON as text and cast to jsonb for deterministic typing.
        const patchJson = JSON.stringify(patch);

        const result = await connection.queryOne<Record<string, unknown>>(
          `
            UPDATE conversations
            SET state = COALESCE(state, '{}'::jsonb) || $2::jsonb,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [conversationId, patchJson]
        );

        if (!result) {
          this.handleNotFound('Conversation', conversationId);
        }

        return result ? fromDatabase(ConversationEntity, result) : null;
      },
      'mergeState',
      'Conversation',
      conversationId
    );
  }

  /**
   * Acquire a conversation-scoped "turn guard" by atomically setting `state.turnActive=true`
   * only if it is not already true.
   *
   * Why this exists:
   * - We bill credits *before* the async turn worker starts. If a client retries/double-submits
   *   the same "send message" action while a turn is starting, we must reject the duplicate
   *   request *before billing*.
   * - In-memory guards (per server replica) are not sufficient; this must be DB-backed.
   *
   * The guard is represented by a caller-provided `turnGuardId` that is stored in state.
   * Callers that own the guard can pass `turnGuardId` downstream so the turn runner can
   * distinguish "my guard" vs "someone else's active turn".
   */
  async acquireTurnGuard(conversationId: string, turnGuardId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!conversationId?.trim()) throw new Error('conversationId is required');
        if (!turnGuardId?.trim()) throw new Error('turnGuardId is required');

        const connection = this.getConnection();
        const patch = JSON.stringify({ turnActive: true, turnGuardId, turnGuardAt: new Date().toISOString() });

        const row = await connection.queryOne<{ id: string }>(
          `
            UPDATE conversations
               SET state = COALESCE(state, '{}'::jsonb) || $2::jsonb,
                   updated_at = NOW()
             WHERE id = $1
               AND COALESCE((state ->> 'turnActive')::boolean, false) = false
            RETURNING id
          `,
          [conversationId, patch]
        );

        // If row is null, either conversation doesn't exist or a turn is already active.
        // Callers that already verified existence should treat this as "guard not acquired".
        return Boolean(row?.id);
      },
      'acquireTurnGuard',
      'Conversation',
      conversationId
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // Use standard deleteEntity method like other repositories
        // CASCADE constraints will handle related records automatically
        return await this.deleteEntity('conversations', id);
      },
      'delete',
      'Conversation',
      id
    );
  }

  /**
   * Find all conversations for a specific starship using foreign key
   */
  async findByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM conversations WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(ConversationEntity, result);
      },
      'findByStarship',
      'Conversation'
    );
  }

  /**
   * Find all conversations for a starship, including linked agents.
   *
   * This is used to avoid client-side N+1 fetches when rendering conversation lists.
   */
  async findByStarshipWithAgents(
    starshipId: string,
    options?: { includeActiveTurn?: boolean }
  ): Promise<Array<ConversationModel & { agents: AgentModel[]; hasActiveTurn?: boolean }>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        const convRows = await connection.query<Record<string, unknown>>(
          'SELECT * FROM conversations WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        const conversations = fromDatabaseArray(ConversationEntity, convRows);
        const conversationIds = conversations.map((c) => c.id).filter((id) => typeof id === 'string' && id.trim().length > 0);

        if (conversationIds.length === 0) {
          return conversations.map((c) => ({ ...c, agents: [], hasActiveTurn: false }));
        }

        // Fetch all linked agents for these conversations in one query.
        const agentRows = await connection.query<Record<string, unknown>>(
          `SELECT cp.conversation_id, a.*
           FROM conversation_participants cp
           INNER JOIN agents a ON a.id = cp.agent_id
           WHERE cp.agent_id IS NOT NULL
             AND cp.conversation_id = ANY($1::text[])
           ORDER BY a.name`,
          [conversationIds]
        );

        const agentsByConversationId = new Map<string, AgentModel[]>();
        for (const row of agentRows) {
          const rawConversationId = (row as Record<string, unknown>)['conversation_id'];
          const conversationId = typeof rawConversationId === 'string' ? rawConversationId : '';
          if (!conversationId) continue;

          // Drop the join column before entity conversion.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { conversation_id: _conversationId, ...agentRow } = row as Record<string, unknown> & { conversation_id?: unknown };
          const agent = fromDatabase(AgentEntity, agentRow);
          const list = agentsByConversationId.get(conversationId) || [];
          list.push(agent);
          agentsByConversationId.set(conversationId, list);
        }

        // Optionally fetch which conversations have an in-progress turn.
        // Skip this query for callers that don't need hasActiveTurn to avoid
        // an unconditional extra round-trip on every list fetch.
        let activeConversationIds = new Set<string>();
        if (options?.includeActiveTurn) {
          const activeTurnRows = await connection.query<{ conversation_id: string }>(
            `SELECT DISTINCT conversation_id
             FROM turns
             WHERE conversation_id = ANY($1::text[])
               AND status IN ('active', 'waiting_for_tools')`,
            [conversationIds]
          );
          activeConversationIds = new Set(activeTurnRows.map((r) => r.conversation_id));
        }

        return conversations.map((c) => ({
          ...c,
          agents: agentsByConversationId.get(c.id) || [],
          hasActiveTurn: options?.includeActiveTurn ? activeConversationIds.has(c.id) : undefined,
        }));
      },
      'findByStarshipWithAgents',
      'Conversation'
    );
  }

  /**
   * Keyset-paginated child conversations for a parent conversation, including linked agents.
   *
   * Returns newest children first (by updated_at DESC, id DESC).
   * Cursor is (beforeUpdatedAt, beforeId), both required together when provided.
   */
  async findChildrenWithAgentsPage(args: {
    parentConversationId: string;
    limit: number;
    beforeUpdatedAt?: string;
    beforeId?: string;
  }): Promise<{ conversations: Array<ConversationModel & { agents: AgentModel[] }>; hasMoreBefore: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
        const pageSize = limit + 1;

        const useCursor =
          typeof args.beforeUpdatedAt === 'string' &&
          typeof args.beforeId === 'string' &&
          args.beforeUpdatedAt.trim().length > 0 &&
          args.beforeId.trim().length > 0;

        const convRows = await connection.query<Record<string, unknown>>(
          useCursor
            ? `
              SELECT *
              FROM conversations
              WHERE parent_conversation_id = $1
                AND (
                  updated_at < $2::timestamptz
                  OR (updated_at = $2::timestamptz AND id < $3::text)
                )
              ORDER BY updated_at DESC, id DESC
              LIMIT $4
            `
            : `
              SELECT *
              FROM conversations
              WHERE parent_conversation_id = $1
              ORDER BY updated_at DESC, id DESC
              LIMIT $2
            `,
          useCursor ? [args.parentConversationId, args.beforeUpdatedAt, args.beforeId, pageSize] : [args.parentConversationId, pageSize]
        );

        const hasMoreBefore = convRows.length > limit;
        const trimmed = convRows.slice(0, limit);
        const conversations = fromDatabaseArray(ConversationEntity, trimmed);
        const conversationIds = conversations.map((c) => c.id).filter((id) => typeof id === 'string' && id.trim().length > 0);

        if (conversationIds.length === 0) {
          return { conversations: conversations.map((c) => ({ ...c, agents: [] })), hasMoreBefore };
        }

        const agentRows = await connection.query<Record<string, unknown>>(
          `SELECT cp.conversation_id, a.*
           FROM conversation_participants cp
           INNER JOIN agents a ON a.id = cp.agent_id
           WHERE cp.agent_id IS NOT NULL
             AND cp.conversation_id = ANY($1::text[])
           ORDER BY a.name`,
          [conversationIds]
        );

        const agentsByConversationId = new Map<string, AgentModel[]>();
        for (const row of agentRows) {
          const rawConversationId = (row as Record<string, unknown>)['conversation_id'];
          const conversationId = typeof rawConversationId === 'string' ? rawConversationId : '';
          if (!conversationId) continue;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { conversation_id: _conversationId, ...agentRow } = row as Record<string, unknown> & { conversation_id?: unknown };
          const agent = fromDatabase(AgentEntity, agentRow);
          const list = agentsByConversationId.get(conversationId) || [];
          list.push(agent);
          agentsByConversationId.set(conversationId, list);
        }

        return {
          conversations: conversations.map((c) => ({ ...c, agents: agentsByConversationId.get(c.id) || [] })),
          hasMoreBefore,
        };
      },
      'findChildrenWithAgentsPage',
      'Conversation',
      args.parentConversationId
    );
  }

  /**
   * Get the starship associated with a conversation using JOIN
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT s.* FROM starships s
           INNER JOIN conversations c ON s.id = c.starship_id
           WHERE c.id = $1`,
          [conversationId]
        );
        return result ? fromDatabase(StarshipEntity, result) : null;
      },
      'getConversationStarship',
      'Conversation'
    );
  }

  /**
   * Update conversation's starship assignment (foreign key)
   */
  async linkToStarship(conversationId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE conversations SET starship_id = $1, updated_at = NOW() WHERE id = $2', [starshipId, conversationId]);
      },
      'linkToStarship',
      'Conversation'
    );
  }

  /**
   * Remove starship assignment from conversation
   */
  async unlinkFromStarship(conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE conversations SET starship_id = NULL, updated_at = NOW() WHERE id = $1', [conversationId]);
      },
      'unlinkFromStarship',
      'Conversation'
    );
  }

  /**
   * Get messages for a conversation using foreign key
   */
  async getConversationMessages(conversationId: string, orderDirection: 'asc' | 'desc' = 'asc'): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const direction = orderDirection.toUpperCase();
        const validDirection = direction === 'DESC' ? 'DESC' : 'ASC';

        const result = await connection.query<Record<string, unknown>>(
          `
          SELECT
            m.*,
            COALESCE(r.reactions, '{}'::jsonb) AS reactions
          FROM messages m
          LEFT JOIN (
            SELECT
              message_id,
              jsonb_object_agg(emoji, user_ids) AS reactions
            FROM (
              SELECT
                message_id,
                emoji,
                jsonb_agg(user_id ORDER BY created_at ASC) AS user_ids
              FROM message_reactions
              GROUP BY message_id, emoji
            ) per_emoji
            GROUP BY message_id
          ) r ON r.message_id = m.id
          WHERE m.conversation_id = $1
          ORDER BY m.created_at ${validDirection}
          `,
          [conversationId]
        );

        return fromDatabaseArray(MessageEntity, result);
      },
      'getConversationMessages',
      'Conversation'
    );
  }

  /**
   * Keyset-paginated message history for a conversation.
   *
   * Returns the newest messages first (bounded by `limit`), but the returned array is
   * in chronological order (oldest → newest) for easy rendering.
   */
  async getConversationMessagesPage(args: {
    conversationId: string;
    limit: number;
    beforeCreatedAt?: string;
    beforeId?: string;
  }): Promise<{ messages: MessageModel[]; hasMoreBefore: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
        const pageSize = limit + 1;

        const useCursor =
          typeof args.beforeCreatedAt === 'string' && typeof args.beforeId === 'string' && args.beforeCreatedAt && args.beforeId;

        const rows = await connection.query<Record<string, unknown>>(
          useCursor
            ? `
              WITH page AS (
                SELECT *
                FROM messages
                WHERE conversation_id = $1
                  AND (
                    created_at < $2::timestamptz
                    OR (created_at = $2::timestamptz AND id < $3::text)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT $4
              ),
              reactions_by_message AS (
                SELECT
                  message_id,
                  jsonb_object_agg(emoji, user_ids) AS reactions
                FROM (
                  SELECT
                    message_id,
                    emoji,
                    jsonb_agg(user_id ORDER BY created_at ASC) AS user_ids
                  FROM message_reactions
                  WHERE message_id IN (SELECT id FROM page)
                  GROUP BY message_id, emoji
                ) per_emoji
                GROUP BY message_id
              )
              SELECT
                page.*,
                COALESCE(reactions_by_message.reactions, '{}'::jsonb) AS reactions
              FROM page
              LEFT JOIN reactions_by_message ON reactions_by_message.message_id = page.id
              ORDER BY page.created_at DESC, page.id DESC
            `
            : `
              WITH page AS (
                SELECT *
                FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT $2
              ),
              reactions_by_message AS (
                SELECT
                  message_id,
                  jsonb_object_agg(emoji, user_ids) AS reactions
                FROM (
                  SELECT
                    message_id,
                    emoji,
                    jsonb_agg(user_id ORDER BY created_at ASC) AS user_ids
                  FROM message_reactions
                  WHERE message_id IN (SELECT id FROM page)
                  GROUP BY message_id, emoji
                ) per_emoji
                GROUP BY message_id
              )
              SELECT
                page.*,
                COALESCE(reactions_by_message.reactions, '{}'::jsonb) AS reactions
              FROM page
              LEFT JOIN reactions_by_message ON reactions_by_message.message_id = page.id
              ORDER BY page.created_at DESC, page.id DESC
            `,
          useCursor ? [args.conversationId, args.beforeCreatedAt, args.beforeId, pageSize] : [args.conversationId, pageSize]
        );

        const hasMoreBefore = rows.length > limit;
        const trimmed = rows.slice(0, limit);
        const chronological = trimmed.slice().reverse();
        return { messages: fromDatabaseArray(MessageEntity, chronological), hasMoreBefore };
      },
      'getConversationMessagesPage',
      'Conversation',
      args.conversationId
    );
  }

  /**
   * Tail-offset message history for a conversation.
   *
   * Semantics:
   * - `offset` is counted from the most recent message (newest). `offset = 0` returns the latest page.
   * - `offset = N` skips the N most recent messages, then returns the next `limit` older messages.
   *
   * Returns the selected messages in chronological order (oldest → newest).
   *
   * This is useful for agent "rolling memory" scenarios where the model prompt is capped
   * to the latest N messages, but a tool can fetch older messages by offset.
   */
  async getConversationMessagesTailOffsetPage(args: {
    conversationId: string;
    limit: number;
    offset: number;
  }): Promise<{ messages: MessageModel[]; hasMoreBefore: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
        const offset = Math.max(0, Math.min(100_000, Number(args.offset || 0)));

        // Fast path: latest page.
        if (offset === 0) {
          return await this.getConversationMessagesPage({ conversationId: args.conversationId, limit });
        }

        // Find the cursor message that represents the last skipped message.
        // Example: offset=1 skips newest message => cursor is newest message (OFFSET 0).
        const cursorRow = await connection.queryOne<{ created_at: unknown; id: unknown }>(
          `
            SELECT created_at, id
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at DESC, id DESC
            OFFSET $2
            LIMIT 1
          `,
          [args.conversationId, offset - 1]
        );

        if (!cursorRow || !cursorRow.id || !cursorRow.created_at) {
          return { messages: [], hasMoreBefore: false };
        }

        const beforeId = String(cursorRow.id);
        const beforeCreatedAt =
          cursorRow.created_at instanceof Date ? cursorRow.created_at.toISOString() : new Date(String(cursorRow.created_at)).toISOString();

        // Reuse the keyset pagination implementation to fetch older messages before the cursor.
        return await this.getConversationMessagesPage({
          conversationId: args.conversationId,
          limit,
          beforeCreatedAt,
          beforeId,
        });
      },
      'getConversationMessagesTailOffsetPage',
      'Conversation',
      args.conversationId
    );
  }

  /**
   * Keyset-paginated message history within an optional cursor range.
   *
   * Returns the oldest messages first (created_at ASC, id ASC).
   *
   * - `after*` sets a lower bound (exclusive by default, or inclusive when `afterInclusive` is true)
   * - `before*` sets an upper bound (always exclusive)
   *
   * This is useful for incremental processing jobs that need to resume from a cursor and
   * process the next N messages without scanning the entire history.
   */
  async getConversationMessagesRangePage(args: {
    conversationId: string;
    limit: number;
    afterCreatedAt?: string;
    afterId?: string;
    afterInclusive?: boolean;
    beforeCreatedAt?: string;
    beforeId?: string;
  }): Promise<{ messages: MessageModel[]; hasMoreAfter: boolean; nextCursor: { createdAt: string; id: string } | null }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
        const pageSize = limit + 1;

        const afterCursorValid =
          typeof args.afterCreatedAt === 'string' &&
          typeof args.afterId === 'string' &&
          args.afterCreatedAt.trim().length > 0 &&
          args.afterId.trim().length > 0;

        const beforeCursorValid =
          typeof args.beforeCreatedAt === 'string' &&
          typeof args.beforeId === 'string' &&
          args.beforeCreatedAt.trim().length > 0 &&
          args.beforeId.trim().length > 0;

        const params: unknown[] = [args.conversationId];
        const where: string[] = ['conversation_id = $1'];
        const afterInclusive = args.afterInclusive === true;

        if (afterCursorValid) {
          params.push(args.afterCreatedAt, args.afterId);
          // IMPORTANT: SQL placeholders are 1-based, but params array is 0-based.
          // afterCreatedAt is the second-to-last param, afterId is the last param.
          const createdIdx = params.length - 1; // placeholder index for afterCreatedAt
          const atIdx = params.length; // placeholder index for afterId
          where.push(
            afterInclusive
              ? `(created_at > $${createdIdx}::timestamptz OR (created_at = $${createdIdx}::timestamptz AND id >= $${atIdx}::text))`
              : `(created_at > $${createdIdx}::timestamptz OR (created_at = $${createdIdx}::timestamptz AND id > $${atIdx}::text))`
          );
        }

        if (beforeCursorValid) {
          params.push(args.beforeCreatedAt, args.beforeId);
          const createdIdx = params.length - 1; // placeholder index for beforeCreatedAt
          const idIdx = params.length; // placeholder index for beforeId
          where.push(`(created_at < $${createdIdx}::timestamptz OR (created_at = $${createdIdx}::timestamptz AND id < $${idIdx}::text))`);
        }

        params.push(pageSize);
        const limitIdx = params.length;

        const rows = await connection.query<Record<string, unknown>>(
          `
            SELECT *
            FROM messages
            WHERE ${where.join(' AND ')}
            ORDER BY created_at ASC, id ASC
            LIMIT $${limitIdx}
          `,
          params
        );

        const hasMoreAfter = rows.length > limit;
        const trimmed = rows.slice(0, limit);
        const messages = fromDatabaseArray(MessageEntity, trimmed);

        const next = hasMoreAfter ? fromDatabase(MessageEntity, rows[limit] as Record<string, unknown>) : null;
        const nextCursor =
          next && typeof next.createdAt === 'string' && typeof next.id === 'string' ? { createdAt: next.createdAt, id: next.id } : null;

        return { messages, hasMoreAfter, nextCursor };
      },
      'getConversationMessagesRangePage',
      'Conversation',
      args.conversationId
    );
  }

  /**
   * Create relationship between conversation and agent
   */
  async linkToAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `INSERT INTO conversation_participants (conversation_id, agent_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (conversation_id, agent_id) DO NOTHING`,
          [conversationId, agentId]
        );
      },
      'linkToAgent',
      'Conversation'
    );
  }

  /**
   * Remove relationship between conversation and agent
   */
  async unlinkFromAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('DELETE FROM conversation_participants WHERE conversation_id = $1 AND agent_id = $2', [
          conversationId,
          agentId,
        ]);
      },
      'unlinkFromAgent',
      'Conversation'
    );
  }

  /**
   * Get all agents involved in a conversation using junction table
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT a.* FROM agents a
           INNER JOIN conversation_participants cp ON a.id = cp.agent_id
           WHERE cp.conversation_id = $1
             AND cp.agent_id IS NOT NULL
           ORDER BY a.name`,
          [conversationId]
        );

        return fromDatabaseArray(AgentEntity, result);
      },
      'getConversationAgents',
      'Conversation'
    );
  }
}
