import { getConnection } from '../connection';
import {
  Starship,
  StarshipRepository as StarshipRepositoryInterface,
  Agent,
} from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository extends BaseRepository implements StarshipRepositoryInterface {
  constructor() {
    super('StarshipRepository');
  }

  /**
   * Validate UUID format
   */
  private validateUUID(id: string, fieldName: string): void {
    if (!id || typeof id !== 'string') {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} is required and must be a string` }]);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} must be a valid UUID format` }]);
    }
  }

  /**
   * Validate starship class
   */
  private validateStarshipClass(starshipClass: Starship['class']): void {
    const validClasses: Starship['class'][] = ['scout', 'cruiser', 'draught'];
    if (!validClasses.includes(starshipClass)) {
      this.handleValidationError([{ 
        field: 'class', 
        message: `Starship class must be one of: ${validClasses.join(', ')}. Got: ${starshipClass}`,
        value: starshipClass
      }]);
    }
  }

  /**
   * Validate starship status
   */
  private validateStarshipStatus(status: Starship['status']): void {
    const validStatuses: Starship['status'][] = ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];
    if (!validStatuses.includes(status)) {
      this.handleValidationError([{ 
        field: 'status', 
        message: `Starship status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
        value: status
      }]);
    }
  }


  async findAll(): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
      );
      return result.map((record) => record.s);
    }, 'findAll', 'Starship');
  }

  async findById(id: string): Promise<Starship | null> {
    this.validateRequired({ id }, ['id'], 'findById');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.id = $id RETURN s',
        { id }
      );
      return result[0]?.s || null;
    }, 'findById', 'Starship', id);
  }

  async findBySlug(slug: string, ownerId: string): Promise<Starship | null> {
    this.validateRequired({ slug, ownerId }, ['slug', 'ownerId'], 'findBySlug');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
        { slug, ownerId }
      );
      return result[0]?.s || null;
    }, 'findBySlug', 'Starship', slug);
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    this.validateRequired({ ownerId }, ['ownerId'], 'findByOwner');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
        { ownerId }
      );
      return result.map((record) => record.s);
    }, 'findByOwner', 'Starship');
  }

  async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship> {
    this.validateRequired(entity, ['name', 'ownerId', 'class'], 'create');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();

      // Set maxAgents based on class (Scout: 3, Cruiser: 5, Draught: 10)
      const maxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;
      
      // Set maxActiveMissions based on class (Scout: 3, Cruiser: 6, Draught: 10)
      const maxActiveMissions = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 6 : 10;
      
      // Generate unique slug if not provided
      const slug = entity.slug || await this.generateUniqueSlug(entity.name, entity.ownerId);
      
      // Validate status using the validation method
      if (entity.status) {
        this.validateStarshipStatus(entity.status);
      }
      
      const starship: Starship = {
        ...entity,
        id: uuidv4(),
        slug,
        maxAgents,
        maxActiveMissions,
        status: entity.status || 'active', // Default to active
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await connection.executeWrite('CREATE (s:Starship $props) RETURN s', { props: starship });

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
    }, 'create', 'Starship');
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    this.validateRequired({ id }, ['id'], 'update');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();

      // Handle slug updates
      if (updates.name && !updates.slug) {
        const existingStarship = await this.findById(id);
        if (existingStarship) {
          updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
        }
      }
      
      // Validate status using the validation method
      if (updates.status) {
        this.validateStarshipStatus(updates.status);
      }
      
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const result = await connection.executeWrite<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
        { id, updates: updateProps }
      );

      return result[0]?.s || null;
    }, 'update', 'Starship', id);
  }

  async delete(id: string): Promise<boolean> {
    this.validateRequired({ id }, ['id'], 'delete');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'Starship', id);
  }

  async getDeployedAgents(starshipId: string): Promise<Agent[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
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

    const connection = getConnection();

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

    const connection = getConnection();
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

    const connection = getConnection();
    const result = await connection.executeQuery<{
      maxAgents: number;
      deployedCount: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.maxAgents as maxAgents, count(a) as deployedCount`,
      { starshipId }
    );

    const { maxAgents, deployedCount } = result[0] || { maxAgents: 0, deployedCount: 0 };
    return maxAgents - Number(deployedCount);
  }


  async updateStatus(starshipId: string, status: Starship['status']): Promise<boolean> {
    const connection = getConnection();
    
    // Validate status using the validation method
    this.validateStarshipStatus(status);
    
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (s:Starship) WHERE s.id = $starshipId
       SET s.status = $status, s.updatedAt = $timestamp
       RETURN count(s) as count`,
      {
        starshipId,
        status,
        timestamp: new Date().toISOString()
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

    // FALLBACK: If somehow still collides, use UUID suffix
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const uuidSuffix = require('uuid').v4().substring(0, 8);
    const fallbackSlug = `${baseSlug}-${uuidSuffix}`;

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

    const connection = getConnection();

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


  // ============================================================================
  // STRIPE INTEGRATION METHODS
  // ============================================================================

  async findBySubscriptionId(subscriptionId: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ starship: Starship }>(
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
    const connection = getConnection();
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
    const connection = getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (user:User {id: $userId})-[:OWNS]->(starship:Starship {plan: 'scout'})
       RETURN count(starship) as count`,
      { userId }
    );
    
    return result[0]?.count || 0;
  }

  // ============================================================================
  // WEBHOOK IDEMPOTENCY METHODS
  // ============================================================================

  /**
   * Check if a Stripe webhook event has already been processed
   * @param eventId - The Stripe event ID
   * @returns true if event was already processed
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeQuery(
      'MATCH (e:StripeEvent {eventId: $eventId}) RETURN e LIMIT 1',
      { eventId }
    );
    return result.length > 0;
  }

  /**
   * Mark a Stripe webhook event as processed
   * @param eventId - The Stripe event ID
   * @param eventType - The type of Stripe event
   */
  async markEventProcessed(eventId: string, eventType?: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `CREATE (e:StripeEvent {
        eventId: $eventId, 
        eventType: $eventType,
        processedAt: datetime()
      })`,
      { eventId, eventType: eventType || 'unknown' }
    );
  }

  /**
   * Update Starship with Stripe Customer ID
   * @param starshipId - The Starship ID
   * @param stripeCustomerId - The Stripe Customer ID
   */
  async updateStripeCustomer(
    starshipId: string, 
    stripeCustomerId: string
  ): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id}) 
       SET s.stripeCustomerId = $customerId,
           s.updatedAt = datetime()`,
      { id: starshipId, customerId: stripeCustomerId }
    );
  }

  /**
   * Find Starship by Stripe Customer ID
   * @param customerId - The Stripe Customer ID
   */
  async findByStripeCustomerId(customerId: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship {stripeCustomerId: $customerId}) RETURN s LIMIT 1',
      { customerId }
    );
    return result[0]?.s || null;
  }

  /**
   * Find all pending payment starships older than specified hours
   * @param hours - Number of hours to consider a starship abandoned
   * @returns Array of abandoned starships
   */
  async findAbandonedPendingStarships(hours: number = 24): Promise<Starship[]> {
    const connection = getConnection();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const result = await connection.executeQuery<{ s: Starship }>(
      `MATCH (s:Starship)
       WHERE s.status = 'pending_payment' 
       AND s.createdAt < $cutoffTime
       RETURN s
       ORDER BY s.createdAt DESC`,
      { cutoffTime }
    );
    
    return result.map(record => record.s);
  }

  /**
   * Clean up abandoned pending starships
   * @param starshipId - The starship ID to clean up
   */
  async cleanupAbandonedStarship(starshipId: string): Promise<void> {
    const connection = getConnection();
    
    // Delete associated vision first
    await connection.executeWrite(
      `MATCH (v:Vision {starshipId: $starshipId})
       DELETE v`,
      { starshipId }
    );
    
    // Then delete the starship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})
       DELETE s`,
      { starshipId }
    );
  }

  /**
   * Update starship payment status
   * @param starshipId - The starship ID
   * @param status - New status
   * @param additionalFields - Additional fields to update
   */
  async updatePaymentStatus(
    starshipId: string, 
    status: 'active' | 'restricted' | 'disabled' | 'pending_payment',
    additionalFields?: Partial<Starship>
  ): Promise<void> {
    const connection = getConnection();
    const updates = {
      status,
      ...additionalFields,
      updatedAt: new Date().toISOString()
    };
    
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id})
       SET s += $updates`,
      { id: starshipId, updates }
    );
  }
}
