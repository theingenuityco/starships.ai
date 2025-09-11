import { StarshipEntity } from '@/entities/StarshipEntity';
import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel } from '@starships/protocol';
import { StarshipModel } from '@starships/protocol';

export class StarshipRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('StarshipRepository', connection);
  }

  async findAll(): Promise<StarshipModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ s: StarshipModel }>('MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC');
        return result.map((record) => StarshipEntity.deserialize(record.s as unknown as Record<string, unknown>));
      },
      'findAll',
      'Starship'
    );
  }

  async findById(id: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ s: StarshipModel }>('MATCH (s:Starship) WHERE s.id = $id RETURN s', { id });
        const starship = result[0]?.s || null;
        return starship ? StarshipEntity.deserialize(starship as unknown as Record<string, unknown>) : null;
      },
      'findById',
      'Starship',
      id
    );
  }

  async findBySlug(slug: string, ownerId: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ s: StarshipModel }>(
          'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
          { slug, ownerId }
        );
        const starship = result[0]?.s || null;
        return starship ? StarshipEntity.deserialize(starship as unknown as Record<string, unknown>) : null;
      },
      'findBySlug',
      'Starship',
      slug
    );
  }

  async findByOwner(ownerId: string): Promise<StarshipModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ s: StarshipModel }>(
          'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
          { ownerId }
        );
        return result.map((record) => StarshipEntity.deserialize(record.s as unknown as Record<string, unknown>));
      },
      'findByOwner',
      'Starship'
    );
  }

  async create(
    entity: Omit<StarshipModel, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & { slug?: string }
  ): Promise<StarshipModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using Entity
        await StarshipEntity.validate(entity, 'create');

        const connection = this.getConnection();
        const now = new Date().toISOString();

        // Set maxAgents based on class (Scout: 3, Cruiser: 5, Draught: 10)
        const maxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;

        // Set maxActiveMissions based on class (Scout: 3, Cruiser: 6, Draught: 10)
        const maxActiveMissions = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 6 : 10;

        // Generate unique slug if not provided
        const slug = entity.slug || (await this.generateUniqueSlug(entity.name, entity.ownerId));

        const starshipData = {
          ...entity,
          slug,
          maxAgents,
          maxActiveMissions,
          status: entity.status || 'active', // Default to active
          createdAt: now,
          updatedAt: now,
        };

        // Transform using Entity
        const starshipEntity = StarshipEntity.deserialize(starshipData);

        // Use base repository for database operation
        const starship = await this.createEntityWithAutoId<StarshipModel>('Starship', starshipEntity.serialize());

        // Create relationship with owner
        await connection.executeWrite(
          `MATCH (u:User {id: $ownerId}), (s:Starship {id: $starshipId})
         CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)`,
          {
            ownerId: starship.ownerId,
            starshipId: starship.id,
            timestamp: starship.createdAt,
          }
        );

        return StarshipEntity.deserialize(starship as unknown as Record<string, unknown>);
      },
      'create',
      'Starship'
    );
  }

  async update(id: string, updates: Partial<StarshipModel>): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from StarshipEntity for updates
        await StarshipEntity.validate(updates, 'update');

        const connection = this.getConnection();

        // Handle slug updates
        if (updates.name && !updates.slug) {
          const existingStarship = await this.findById(id);
          if (existingStarship) {
            updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
          }
        }

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const result = await connection.executeWrite<{ s: StarshipModel }>(
          'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
          { id, updates: updateProps }
        );

        const starship = result[0]?.s || null;
        return starship ? StarshipEntity.deserialize(starship as unknown as Record<string, unknown>) : null;
      },
      'update',
      'Starship',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Starship',
      id
    );
  }

  async getDeployedAgents(starshipId: string): Promise<AgentModel[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { starshipId }
    );
    return result.map((record) => record.a);
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    const connection = this.getConnection();

    // Check if starship has available slots
    const availableSlots = await this.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new Error('No available slots on this starship');
    }

    // Check if agent is already deployed
    const existingDeployment = await connection.executeQuery(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       RETURN r`,
      { starshipId, agentId }
    );

    if (existingDeployment.length > 0) {
      throw new Error('Agent is already deployed on this starship');
    }

    // Deploy agent
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
       CREATE (a)-[:DEPLOYED_ON {
         deployedAt: $timestamp,
         isActive: true
       }]->(s)`,
      {
        starshipId,
        agentId,
        timestamp: new Date().toISOString(),
      }
    );

    return true;
  }

  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       DELETE r
       RETURN count(r) as deletedCount`,
      { starshipId, agentId }
    );

    return result[0]?.deletedCount > 0;
  }

  async getAvailableSlots(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{
      maxAgents: number;
      deployedCount: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:AgentModel)
       RETURN s.maxAgents as maxAgents, count(a) as deployedCount`,
      { starshipId }
    );

    const { maxAgents, deployedCount } = result[0] || { maxAgents: 0, deployedCount: 0 };
    return Number(maxAgents) - Number(deployedCount);
  }

  async updateStatus(starshipId: string, status: StarshipModel['status']): Promise<boolean> {
    const connection = this.getConnection();
    // Database constraints will validate the status values
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (s:Starship) WHERE s.id = $starshipId
       SET s.status = $status, s.updatedAt = $timestamp
       RETURN count(s) as count`,
      {
        starshipId,
        status,
        timestamp: new Date().toISOString(),
      }
    );

    return result[0]?.count > 0;
  }

  async generateUniqueSlug(name: string, ownerId: string): Promise<string> {
    if (!name) {
      throw new Error('Name parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    console.log('[STARSHIP-SLUG] Starting slug generation for name:', name, 'ownerId:', ownerId);

    // Create base slug from name
    const baseSlug = this.createSlugFromName(name);
    console.log('[STARSHIP-SLUG] Base slug created:', baseSlug);

    // Check if base slug is available
    console.log('[STARSHIP-SLUG] Checking if base slug is available...');
    if (await this.isSlugAvailable(baseSlug, ownerId)) {
      console.log('[STARSHIP-SLUG] Base slug is available, returning:', baseSlug);
      return baseSlug;
    }

    console.log('[STARSHIP-SLUG] Base slug not available, using optimized generation...');

    // OPTIMIZED: Use random suffix instead of sequential to avoid collisions
    const timestamp = Date.now().toString(36); // Base36 timestamp
    const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 random chars
    const optimizedSlug = `${baseSlug}-${timestamp}-${randomSuffix}`;

    // Double-check the optimized slug is available
    if (await this.isSlugAvailable(optimizedSlug, ownerId)) {
      console.log('[STARSHIP-SLUG] Optimized slug available:', optimizedSlug);
      return optimizedSlug;
    }

    // FALLBACK: If somehow still collides, use timestamp-based fallback
    const fallbackSuffix = `${timestamp}-${Math.random().toString(36).substring(2, 12)}`;
    const fallbackSlug = `${baseSlug}-${fallbackSuffix}`;

    console.log('[STARSHIP-SLUG] Using fallback slug:', fallbackSlug);
    return fallbackSlug;
  }

  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    if (!slug) {
      throw new Error('Slug parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    const connection = this.getConnection();

    let query = 'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId';
    const params: Record<string, unknown> = { slug, ownerId };

    if (excludeId) {
      query += ' AND s.id <> $excludeId';
      params.excludeId = excludeId;
    }

    query += ' RETURN count(s) as count';

    const result = await connection.executeQuery<{ count: number }>(query, params);
    return result[0]?.count === 0;
  }

  createSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  async findBySubscriptionId(subscriptionId: string): Promise<StarshipModel | null> {
    const connection = this.getConnection();
    const result = await connection.executeQuery<{ starship: StarshipModel }>(
      `MATCH (starship:Starship {subscriptionId: $subscriptionId})
       RETURN starship`,
      { subscriptionId }
    );

    return result[0]?.starship || null;
  }

  async updateSubscription(
    starshipId: string,
    updates: {
      subscriptionId?: string;
      status?: 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';
      plan?: 'scout' | 'cruiser' | 'draught';
      billingPeriod?: 'monthly' | 'yearly';
    }
  ): Promise<void> {
    const connection = this.getConnection();
    const setClause = Object.entries(updates)
      .map(([key]) => `starship.${key} = $${key}`)
      .join(', ');

    await connection.executeWrite(
      `MATCH (starship:Starship {id: $starshipId})
       SET ${setClause}, starship.updatedAt = $timestamp`,
      { starshipId, ...updates, timestamp: new Date().toISOString() }
    );
  }

  async countFreeStarships(userId: string): Promise<number> {
    const connection = this.getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (user:User {id: $userId})-[:OWNS]->(starship:Starship {plan: 'scout'})
       RETURN count(starship) as count`,
      { userId }
    );

    return result[0]?.count || 0;
  }

  /** Check if a Stripe webhook event has already been processed */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const connection = this.getConnection();
    const result = await connection.executeQuery('MATCH (e:StripeEvent {eventId: $eventId}) RETURN e LIMIT 1', { eventId });
    return result.length > 0;
  }

  /** Mark a Stripe webhook event as processed */
  async markEventProcessed(eventId: string, eventType?: string): Promise<void> {
    const connection = this.getConnection();
    await connection.executeWrite(
      `CREATE (e:StripeEvent {
        eventId: $eventId, 
        eventType: $eventType,
        processedAt: datetime()
      })`,
      { eventId, eventType: eventType || 'unknown' }
    );
  }

  /** Update Starship with Stripe Customer ID */
  async updateStripeCustomer(starshipId: string, stripeCustomerId: string): Promise<void> {
    const connection = this.getConnection();
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id}) 
       SET s.stripeCustomerId = $customerId,
           s.updatedAt = datetime()`,
      { id: starshipId, customerId: stripeCustomerId }
    );
  }

  /** Find Starship by Stripe Customer ID */
  async findByStripeCustomerId(customerId: string): Promise<StarshipModel | null> {
    const connection = this.getConnection();
    const result = await connection.executeQuery<{ s: StarshipModel }>(
      'MATCH (s:Starship {stripeCustomerId: $customerId}) RETURN s LIMIT 1',
      { customerId }
    );
    return result[0]?.s || null;
  }

  /** Find all pending payment starships older than specified hours */
  async findAbandonedPendingStarships(hours: number = 24): Promise<StarshipModel[]> {
    const connection = this.getConnection();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const result = await connection.executeQuery<{ s: StarshipModel }>(
      `MATCH (s:Starship)
       WHERE s.status = 'pending_payment' 
       AND s.createdAt < $cutoffTime
       RETURN s
       ORDER BY s.createdAt DESC`,
      { cutoffTime }
    );

    return result.map((record) => record.s);
  }

  /** Clean up abandoned pending starships */
  async cleanupAbandonedStarship(starshipId: string): Promise<void> {
    const connection = this.getConnection();
    // Delete the starship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})
       DELETE s`,
      { starshipId }
    );
  }

  /** Update starship payment status */
  async updatePaymentStatus(
    starshipId: string,
    status: 'active' | 'restricted' | 'disabled' | 'pending_payment',
    additionalFields?: Partial<StarshipModel>
  ): Promise<void> {
    const connection = this.getConnection();
    const updates = {
      status,
      ...additionalFields,
      updatedAt: new Date().toISOString(),
    };

    await connection.executeWrite(
      `MATCH (s:Starship {id: $id})
       SET s += $updates`,
      { id: starshipId, updates }
    );
  }

  /** Get all memories for a starship using Neo4j relationships */
  async getMemories(starshipId: string): Promise<Record<string, unknown>[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ m: Record<string, unknown> }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)
       RETURN m ORDER BY m.createdAt DESC`,
      { starshipId }
    );
    return result.map((record) => record.m);
  }

  /**
   * Get memory count for a starship
   * @param starshipId - The starship ID
   * @returns Number of memories
   */
  async getMemoryCount(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory)
       RETURN count(m) as count`,
      { starshipId }
    );

    return Number(result[0]?.count || 0);
  }

  /**
   * Remove a specific memory from a starship (deletes the memory and relationship)
   * @param starshipId - The starship ID
   * @param memoryId - The memory ID
   * @returns True if memory was removed
   */
  async removeMemory(starshipId: string, memoryId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!memoryId) {
      throw new Error('Memory ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory {id: $memoryId})
       DETACH DELETE m
       RETURN count(m) as deletedCount`,
      { starshipId, memoryId }
    );

    return result[0]?.deletedCount > 0;
  }

  /** Get all conversations for a starship using Neo4j relationships */
  async getConversations(starshipId: string): Promise<Record<string, unknown>[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ c: Record<string, unknown> }>(
      `MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)
       RETURN c ORDER BY c.lastActivityAt DESC`,
      { starshipId }
    );

    return result.map((record) => record.c);
  }

  /**
   * Get conversation count for a starship
   * @param starshipId - The starship ID
   * @returns Number of conversations
   */
  async getConversationCount(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(conversation:Conversation)
       RETURN count(conversation) as count`,
      { starshipId }
    );

    return Number(result[0]?.count || 0);
  }

  /**
   * Get active conversations for a starship
   * @param starshipId - The starship ID
   * @returns Array of active conversations
   */
  async getActiveConversations(starshipId: string): Promise<Record<string, unknown>[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeQuery<{ c: Record<string, unknown> }>(
      `MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)
       WHERE c.status = 'active'
       RETURN c ORDER BY c.lastActivityAt DESC`,
      { starshipId }
    );

    return result.map((record) => record.c);
  }

  /**
   * Remove a specific conversation from a starship (deletes the relationship)
   * @param starshipId - The starship ID
   * @param conversationId - The conversation ID
   * @returns Success boolean
   */
  async removeConversation(starshipId: string, conversationId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    const connection = this.getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})-[r:HAS_CONVERSATION]->(conversation:Conversation {id: $conversationId})
       DELETE r
       RETURN count(r) as deletedCount`,
      { starshipId, conversationId }
    );

    return result[0]?.deletedCount > 0;
  }
}
