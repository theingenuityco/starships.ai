import { getConnection, Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel } from '@starships/protocol';
import { StarshipModel } from '@starships/protocol';

export class StarshipRepository extends BaseRepository {
  private connection: Neo4jConnection;

  constructor(connection?: Neo4jConnection) {
    super('StarshipRepository');
    this.connection = connection || getConnection();
  }

  /** Validate UUID format */
  private validateUUID(id: string, fieldName: string): void {
    if (!id || typeof id !== 'string') {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} is required and must be a string` }]);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} must be a valid UUID format` }]);
    }
  }

  async findAll(): Promise<StarshipModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: StarshipModel }>('MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC');
        return result.map((record) => record.s);
      },
      'findAll',
      'Starship'
    );
  }

  async findById(id: string): Promise<StarshipModel | null> {
    this.validateRequired({ id }, ['id'], 'findById');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: StarshipModel }>('MATCH (s:Starship) WHERE s.id = $id RETURN s', { id });
        return result[0]?.s || null;
      },
      'findById',
      'Starship',
      id
    );
  }

  async findBySlug(slug: string, ownerId: string): Promise<StarshipModel | null> {
    this.validateRequired({ slug, ownerId }, ['slug', 'ownerId'], 'findBySlug');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: StarshipModel }>(
          'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
          { slug, ownerId }
        );
        return result[0]?.s || null;
      },
      'findBySlug',
      'Starship',
      slug
    );
  }

  async findByOwner(ownerId: string): Promise<StarshipModel[]> {
    this.validateRequired({ ownerId }, ['ownerId'], 'findByOwner');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
        const result = await connection.executeQuery<{ s: StarshipModel }>(
          'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
          { ownerId }
        );
        return result.map((record) => record.s);
      },
      'findByOwner',
      'Starship'
    );
  }

  async create(
    entity: Omit<StarshipModel, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & { slug?: string }
  ): Promise<StarshipModel> {
    this.validateRequired(entity, ['name', 'ownerId', 'class'], 'create');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;

        // Set maxAgents based on class (Scout: 3, Cruiser: 5, Draught: 10)
        const maxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;

        // Set maxActiveMissions based on class (Scout: 3, Cruiser: 6, Draught: 10)
        const maxActiveMissions = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 6 : 10;

        // Generate unique slug if not provided
        const slug = entity.slug || (await this.generateUniqueSlug(entity.name, entity.ownerId));

        const starshipProps = {
          ...entity,
          slug,
          maxAgents,
          maxActiveMissions,
          status: entity.status || 'active', // Default to active
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Use Neo4j auto-generated ID
        const starship = await this.createEntityWithAutoId<StarshipModel>('Starship', starshipProps, this.connection);

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

        return starship;
      },
      'create',
      'Starship'
    );
  }

  async update(id: string, updates: Partial<StarshipModel>): Promise<StarshipModel | null> {
    this.validateRequired({ id }, ['id'], 'update');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;

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

        return result[0]?.s || null;
      },
      'update',
      'Starship',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    this.validateRequired({ id }, ['id'], 'delete');

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.connection;
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

    const connection = this.connection;
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

    const connection = this.connection;

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

    const connection = this.connection;
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

    const connection = this.connection;
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
    const connection = this.connection;
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

    const connection = this.connection;

    let query = 'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId';
    const params: Record<string, any> = { slug, ownerId };

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
    const connection = this.connection;
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
    const connection = this.connection;
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
    const connection = this.connection;
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (user:User {id: $userId})-[:OWNS]->(starship:Starship {plan: 'scout'})
       RETURN count(starship) as count`,
      { userId }
    );

    return result[0]?.count || 0;
  }

  /** Check if a Stripe webhook event has already been processed */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const connection = this.connection;
    const result = await connection.executeQuery('MATCH (e:StripeEvent {eventId: $eventId}) RETURN e LIMIT 1', { eventId });
    return result.length > 0;
  }

  /** Mark a Stripe webhook event as processed */
  async markEventProcessed(eventId: string, eventType?: string): Promise<void> {
    const connection = this.connection;
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
    const connection = this.connection;
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id}) 
       SET s.stripeCustomerId = $customerId,
           s.updatedAt = datetime()`,
      { id: starshipId, customerId: stripeCustomerId }
    );
  }

  /** Find Starship by Stripe Customer ID */
  async findByStripeCustomerId(customerId: string): Promise<StarshipModel | null> {
    const connection = this.connection;
    const result = await connection.executeQuery<{ s: StarshipModel }>(
      'MATCH (s:Starship {stripeCustomerId: $customerId}) RETURN s LIMIT 1',
      { customerId }
    );
    return result[0]?.s || null;
  }

  /** Find all pending payment starships older than specified hours */
  async findAbandonedPendingStarships(hours: number = 24): Promise<StarshipModel[]> {
    const connection = this.connection;
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
    const connection = this.connection;
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
    const connection = this.connection;
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
  async getMemories(starshipId: string): Promise<any[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.connection;
    const result = await connection.executeQuery<{ m: any }>(
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

    const connection = this.connection;
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

    const connection = this.connection;
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory {id: $memoryId})
       DETACH DELETE m
       RETURN count(m) as deletedCount`,
      { starshipId, memoryId }
    );

    return result[0]?.deletedCount > 0;
  }

  /** Get all sessions for a starship using Neo4j relationships */
  async getSessions(starshipId: string): Promise<any[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.connection;
    const result = await connection.executeQuery<{ s: any }>(
      `MATCH (starship:Starship {id: $starshipId})-[:HAS_SESSION]->(s:Session)
       RETURN s ORDER BY s.lastActivityAt DESC`,
      { starshipId }
    );

    return result.map((record) => record.s);
  }

  /**
   * Get session count for a starship
   * @param starshipId - The starship ID
   * @returns Number of sessions
   */
  async getSessionCount(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.connection;
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_SESSION]->(session:Session)
       RETURN count(session) as count`,
      { starshipId }
    );

    return Number(result[0]?.count || 0);
  }

  /**
   * Get active sessions for a starship
   * @param starshipId - The starship ID
   * @returns Array of active sessions
   */
  async getActiveSessions(starshipId: string): Promise<any[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = this.connection;
    const result = await connection.executeQuery<{ s: any }>(
      `MATCH (starship:Starship {id: $starshipId})-[:HAS_SESSION]->(s:Session)
       WHERE s.status = 'active'
       RETURN s ORDER BY s.lastActivityAt DESC`,
      { starshipId }
    );

    return result.map((record) => record.s);
  }

  /**
   * Remove a specific session from a starship (deletes the relationship)
   * @param starshipId - The starship ID
   * @param sessionId - The session ID
   * @returns Success boolean
   */
  async removeSession(starshipId: string, sessionId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const connection = this.connection;
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})-[r:HAS_SESSION]->(session:Session {id: $sessionId})
       DELETE r
       RETURN count(r) as deletedCount`,
      { starshipId, sessionId }
    );

    return result[0]?.deletedCount > 0;
  }
}
