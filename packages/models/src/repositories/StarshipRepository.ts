import { getConnection } from '../connection';
import { Starship, StarshipRepository as StarshipRepositoryInterface, Agent } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository implements StarshipRepositoryInterface {
  async findAll(): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
    );
    return result.map(record => record.s);
  }

  async findById(id: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id RETURN s',
      { id }
    );
    return result[0]?.s || null;
  }

  async findBySlug(slug: string, ownerId: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
      { slug, ownerId }
    );
    return result[0]?.s || null;
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
      { ownerId }
    );
    return result.map(record => record.s);
  }

  async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship> {
    const connection = getConnection();
    
    // Set maxAgents based on class
    const maxAgents = entity.class === 'scout' ? 3 : 6;
    
    // Set default maxActiveExpeditions based on class if not provided
    const maxActiveExpeditions = entity.maxActiveExpeditions ?? (entity.class === 'scout' ? 2 : 4);
    
    // Generate unique slug if not provided
    const slug = entity.slug || await this.generateUniqueSlug(entity.name, entity.ownerId);
    
    // Validate status - only allow 'active' | 'inactive'
    if (entity.status && !['active', 'inactive'].includes(entity.status)) {
      throw new Error(`Invalid status: ${entity.status}. Must be 'active' or 'inactive'`);
    }
    
    const starship: Starship = {
      ...entity,
      id: uuidv4(),
      slug,
      maxAgents,
      maxActiveExpeditions,
      status: entity.status || 'active', // Default to active
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (s:Starship $props) RETURN s',
      { props: starship }
    );

    // Create relationship with owner
    await connection.executeWrite(
      `MATCH (u:User {id: $ownerId}), (s:Starship {id: $starshipId})
       CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)`,
      {
        ownerId: starship.ownerId,
        starshipId: starship.id,
        timestamp: starship.createdAt
      }
    );

    return starship;
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    const connection = getConnection();
    
    // Handle slug updates
    if (updates.name && !updates.slug) {
      const existingStarship = await this.findById(id);
      if (existingStarship) {
        updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
      }
    }
    
    // Validate status - only allow 'active' | 'inactive'
    if (updates.status && !['active', 'inactive'].includes(updates.status)) {
      throw new Error(`Invalid status: ${updates.status}. Must be 'active' or 'inactive'`);
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
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }

  async getDeployedAgents(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { starshipId }
    );
    return result.map(record => record.a);
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    
    // Check if starship has available slots
    const availableSlots = await this.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new Error('No available agent slots on this starship');
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
        timestamp: new Date().toISOString() 
      }
    );

    return true;
  }

  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
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
    const connection = getConnection();
    const result = await connection.executeQuery<{ 
      maxAgents: number, 
      deployedCount: number 
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.maxAgents as maxAgents, count(a) as deployedCount`,
      { starshipId }
    );

    const { maxAgents, deployedCount } = result[0] || { maxAgents: 0, deployedCount: 0 };
    return maxAgents - Number(deployedCount);
  }

  async updateMaxActiveExpeditions(starshipId: string, maxActiveExpeditions: number): Promise<boolean> {
    const connection = getConnection();
    
    // Validate maxActiveExpeditions is a positive number
    if (maxActiveExpeditions < 0) {
      throw new Error('maxActiveExpeditions must be a positive number');
    }
    
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (s:Starship) WHERE s.id = $starshipId
       SET s.maxActiveExpeditions = $maxActiveExpeditions, s.updatedAt = $timestamp
       RETURN count(s) as count`,
      {
        starshipId,
        maxActiveExpeditions,
        timestamp: new Date().toISOString()
      }
    );
    
    return result[0]?.count > 0;
  }

  async getMaxActiveExpeditions(starshipId: string): Promise<number | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ maxActiveExpeditions: number }>(
      'MATCH (s:Starship) WHERE s.id = $starshipId RETURN s.maxActiveExpeditions as maxActiveExpeditions',
      { starshipId }
    );
    
    return result[0]?.maxActiveExpeditions ?? null;
  }

  async updateStatus(starshipId: string, status: 'active' | 'inactive'): Promise<boolean> {
    const connection = getConnection();
    
    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be 'active' or 'inactive'`);
    }
    
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
    const uuidSuffix = require('uuid').v4().substring(0, 8);
    const fallbackSlug = `${baseSlug}-${uuidSuffix}`;
    
    console.log('[STARSHIP-SLUG] Using fallback slug:', fallbackSlug);
    return fallbackSlug;
  }

  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    const connection = getConnection();
    
    let query = 'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId';
    const params: any = { slug, ownerId };
    
    if (excludeId) {
      query += ' AND s.id <> $excludeId';
      params.excludeId = excludeId;
    }
    
    query += ' RETURN count(s) as count';
    
    const result = await connection.executeQuery<{ count: number }>(query, params);
    return result[0]?.count === 0;
  }

  private createSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  // ============================================================================
  // EXPEDITION INTEGRATION METHODS
  // ============================================================================

  /**
   * Update active expeditions count for a starship
   */
  async updateActiveExpeditionsCount(starshipId: string, increment: boolean = true): Promise<void> {
    const connection = getConnection();
    const operation = increment ? '+' : '-';
    
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})
       SET s.activeExpeditions = s.activeExpeditions ${operation} 1,
           s.updatedAt = $timestamp`,
      {
        starshipId,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Get expedition capacity information for a starship
   */
  async getExpeditionCapacity(starshipId: string): Promise<{
    maxConcurrentExpeditions: number;
    currentActiveExpeditions: number;
    availableExpeditionSlots: number;
    maxAgentsPerExpedition: number;
    totalDeployedAgents: number;
    availableAgents: number;
  }> {
    const connection = getConnection();
    const result = await connection.executeQuery<{
      starshipClass: 'scout' | 'cruiser';
      maxAgents: number;
      activeExpeditions: number;
      deployedAgents: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.class as starshipClass, s.maxAgents as maxAgents,
              s.activeExpeditions as activeExpeditions, count(a) as deployedAgents`,
      { starshipId }
    );

    const data = result[0];
    if (!data) {
      throw new Error('Starship not found');
    }

    // Define capacity limits based on starship class
    const maxConcurrentExpeditions = data.starshipClass === 'scout' ? 2 : 5;
    const maxAgentsPerExpedition = data.starshipClass === 'scout' ? 2 : 4;

    return {
      maxConcurrentExpeditions,
      currentActiveExpeditions: data.activeExpeditions,
      availableExpeditionSlots: Math.max(0, maxConcurrentExpeditions - data.activeExpeditions),
      maxAgentsPerExpedition,
      totalDeployedAgents: data.deployedAgents,
      availableAgents: Math.max(0, data.maxAgents - data.deployedAgents)
    };
  }

  /**
   * Check if starship can start a new expedition
   */
  async canStartNewExpedition(starshipId: string): Promise<{
    canStart: boolean;
    reason?: string;
    capacity: {
      maxConcurrentExpeditions: number;
      currentActiveExpeditions: number;
      availableExpeditionSlots: number;
    };
  }> {
    const capacity = await this.getExpeditionCapacity(starshipId);
    
    const canStart = capacity.availableExpeditionSlots > 0;
    const reason = canStart ? undefined : 'Maximum concurrent expeditions reached';

    return {
      canStart,
      reason,
      capacity: {
        maxConcurrentExpeditions: capacity.maxConcurrentExpeditions,
        currentActiveExpeditions: capacity.currentActiveExpeditions,
        availableExpeditionSlots: capacity.availableExpeditionSlots
      }
    };
  }

  /**
   * Get agent availability for expeditions
   */
  async getAgentAvailabilityForExpeditions(starshipId: string): Promise<Array<{
    agentId: string;
    agentName: string;
    category: string;
    tags: string[];
    availability: 'available' | 'busy' | 'offline';
    currentExpeditions: string[];
    workload: 'light' | 'moderate' | 'heavy';
  }>> {
    const connection = getConnection();
    const result = await connection.executeQuery<{
      agentId: string;
      agentName: string;
      category: string;
      tags: string[];
      currentExpeditions: string[];
    }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(e:Expedition)
       WHERE e.status IN ['planning', 'in-progress', 'review']
       RETURN a.id as agentId, a.name as agentName, a.category as category,
              a.tags as tags, collect(DISTINCT e.id) as currentExpeditions`,
      { starshipId }
    );

    return result.map(agent => {
      const expeditionCount = agent.currentExpeditions.length;
      let availability: 'available' | 'busy' | 'offline' = 'available';
      let workload: 'light' | 'moderate' | 'heavy' = 'light';

      if (expeditionCount >= 3) {
        availability = 'busy';
        workload = 'heavy';
      } else if (expeditionCount >= 2) {
        workload = 'moderate';
      }

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        category: agent.category,
        tags: agent.tags || [],
        availability,
        currentExpeditions: agent.currentExpeditions || [],
        workload
      };
    });
  }

  /**
   * Get starship expedition statistics
   */
  async getExpeditionStats(starshipId: string, days: number = 30): Promise<{
    expeditions: {
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      averageDuration: number;
      successRate: number;
    };
    tasks: {
      total: number;
      completed: number;
      failed: number;
      averageDuration: number;
      successRate: number;
    };
    topPerformingAgents: Array<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      successRate: number;
    }>;
  }> {
    const connection = getConnection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    // Get expedition stats
    const expeditionStats = await connection.executeQuery<{
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      avgDuration: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       WHERE e.createdAt >= $cutoffDate
       WITH count(e) as total,
            count(CASE WHEN e.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN e.status = 'failed' THEN 1 END) as failed,
            count(CASE WHEN e.status = 'cancelled' THEN 1 END) as cancelled,
            avg(CASE WHEN e.actualDuration IS NOT NULL THEN e.actualDuration ELSE 0 END) as avgDuration
       RETURN total, completed, failed, cancelled, avgDuration`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    // Get task stats
    const taskStats = await connection.executeQuery<{
      total: number;
      completed: number;
      failed: number;
      avgDuration: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)-[:HAS_TASK]->(t:ExpeditionTask)
       WHERE e.createdAt >= $cutoffDate
       WITH count(t) as total,
            count(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN t.status = 'failed' THEN 1 END) as failed,
            avg(CASE WHEN t.actualEffort IS NOT NULL THEN t.actualEffort ELSE 0 END) as avgDuration
       RETURN total, completed, failed, avgDuration`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    // Get top performing agents
    const agentStats = await connection.executeQuery<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      totalTasks: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       MATCH (a)-[:ASSIGNED_TO]->(t:ExpeditionTask)
       MATCH (t)<-[:HAS_TASK]-(e:Expedition)
       WHERE e.createdAt >= $cutoffDate
       WITH a.id as agentId, a.name as agentName,
            count(t) as totalTasks,
            count(CASE WHEN t.status = 'completed' THEN 1 END) as tasksCompleted
       WHERE totalTasks > 0
       RETURN agentId, agentName, tasksCompleted, totalTasks
       ORDER BY tasksCompleted DESC, (toFloat(tasksCompleted) / totalTasks) DESC
       LIMIT 10`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    const rawExpStats = expeditionStats[0];
    const rawTskStats = taskStats[0];

    // Handle expedition stats
    let expeditionSuccessRate = 0;
    let expStatsConverted = { total: 0, completed: 0, failed: 0, cancelled: 0, avgDuration: 0 };
    
    if (rawExpStats) {
      const expTotal = Number(rawExpStats.total);
      const expCompleted = Number(rawExpStats.completed);
      const expFailed = Number(rawExpStats.failed);
      const expCancelled = Number(rawExpStats.cancelled);
      const expAvgDuration = Number(rawExpStats.avgDuration || 0);
      
      expeditionSuccessRate = expTotal > 0 ? (expCompleted / expTotal) * 100 : 0;
      expStatsConverted = {
        total: expTotal,
        completed: expCompleted,
        failed: expFailed,
        cancelled: expCancelled,
        avgDuration: expAvgDuration
      };
    }

    // Handle task stats
    let taskSuccessRate = 0;
    let tskStatsConverted = { total: 0, completed: 0, failed: 0, avgDuration: 0 };
    
    if (rawTskStats) {
      const tskTotal = Number(rawTskStats.total);
      const tskCompleted = Number(rawTskStats.completed);
      const tskFailed = Number(rawTskStats.failed);
      const tskAvgDuration = Number(rawTskStats.avgDuration || 0);
      
      taskSuccessRate = tskTotal > 0 ? (tskCompleted / tskTotal) * 100 : 0;
      tskStatsConverted = {
        total: tskTotal,
        completed: tskCompleted,
        failed: tskFailed,
        avgDuration: tskAvgDuration
      };
    }

    return {
      expeditions: {
        total: expStatsConverted.total,
        completed: expStatsConverted.completed,
        failed: expStatsConverted.failed,
        cancelled: expStatsConverted.cancelled,
        averageDuration: Math.round(expStatsConverted.avgDuration),
        successRate: Math.round(expeditionSuccessRate * 100) / 100
      },
      tasks: {
        total: tskStatsConverted.total,
        completed: tskStatsConverted.completed,
        failed: tskStatsConverted.failed,
        averageDuration: Math.round(tskStatsConverted.avgDuration),
        successRate: Math.round(taskSuccessRate * 100) / 100
      },
      topPerformingAgents: agentStats.map(agent => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        tasksCompleted: Number(agent.tasksCompleted),
        successRate: Math.round((Number(agent.tasksCompleted) / Number(agent.totalTasks)) * 10000) / 100
      }))
    };
  }
}