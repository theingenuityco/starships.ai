import { getConnection } from '../connection';
import {
  Expedition,
  ExpeditionRepository as ExpeditionRepositoryInterface,
  ExpeditionStatus,
  ExpeditionPriority,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
  ExpeditionWorkflowState,
  Agent
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';

/**
 * Neo4j-based expedition repository
 * 
 * Handles all database operations for expeditions including CRUD operations,
 * agent assignments, workflow state management, and advanced querying.
 */
export class ExpeditionRepository implements ExpeditionRepositoryInterface {
  
  /**
   * Find all expeditions (admin use only)
   */
  async findAll(): Promise<Expedition[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ e: Expedition }>(
      'MATCH (e:Expedition) RETURN e ORDER BY e.createdAt DESC'
    );
    return result.map(record => record.e);
  }

  /**
   * Find expedition by ID
   */
  async findById(id: string): Promise<Expedition | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ e: Expedition }>(
      'MATCH (e:Expedition) WHERE e.id = $id RETURN e',
      { id }
    );
    return result[0]?.e || null;
  }

  /**
   * Find all expeditions for a specific starship
   */
  async findByStarship(starshipId: string): Promise<Expedition[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ e: Expedition }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       RETURN e ORDER BY e.createdAt DESC`,
      { starshipId }
    );
    return result.map(record => record.e);
  }

  /**
   * Find expeditions by status for a starship
   */
  async findByStatus(starshipId: string, status: ExpeditionStatus): Promise<Expedition[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ e: Expedition }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       WHERE e.status = $status
       RETURN e ORDER BY e.createdAt DESC`,
      { starshipId, status }
    );
    return result.map(record => record.e);
  }

  /**
   * Find expeditions by priority for a starship
   */
  async findByPriority(starshipId: string, priority: ExpeditionPriority): Promise<Expedition[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ e: Expedition }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       WHERE e.priority = $priority
       RETURN e ORDER BY e.createdAt DESC`,
      { starshipId, priority }
    );
    return result.map(record => record.e);
  }

  /**
   * Advanced filtering with pagination and sorting
   */
  async findWithFilters(
    starshipId: string,
    filters: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions
  ): Promise<{ expeditions: Expedition[]; total: number }> {
    const connection = getConnection();
    
    // Debug logging
    console.log('[DEBUG] findWithFilters called with:', {
      starshipId,
      filters,
      sort,
      pagination,
      paginationType: typeof pagination,
      paginationLimit: pagination?.limit,
      paginationLimitType: typeof pagination?.limit
    });
    
    // Build dynamic query
    let whereClause = 'WHERE 1=1';
    const params: any = { starshipId };
    
    if (filters.status && filters.status.length > 0) {
      whereClause += ' AND e.status IN $statuses';
      params.statuses = filters.status;
    }
    
    if (filters.priority && filters.priority.length > 0) {
      whereClause += ' AND e.priority IN $priorities';
      params.priorities = filters.priority;
    }
    
    if (filters.tags && filters.tags.length > 0) {
      whereClause += ' AND ANY(tag IN $tags WHERE tag IN e.tags)';
      params.tags = filters.tags;
    }
    
    if (filters.createdBy) {
      whereClause += ' AND e.createdBy = $createdBy';
      params.createdBy = filters.createdBy;
    }
    
    if (filters.assignedAgent) {
      whereClause += ' AND $assignedAgent IN e.assignedAgents';
      params.assignedAgent = filters.assignedAgent;
    }
    
    if (filters.dateRange) {
      whereClause += ' AND e.createdAt >= $startDate AND e.createdAt <= $endDate';
      params.startDate = filters.dateRange.start;
      params.endDate = filters.dateRange.end;
    }
    
    if (filters.search) {
      whereClause += ' AND (toLower(e.title) CONTAINS toLower($search) OR toLower(e.description) CONTAINS toLower($search))';
      params.search = filters.search;
    }
    
    // Build sort clause
    let orderClause = 'ORDER BY e.createdAt DESC';
    if (sort) {
      const direction = sort.direction.toUpperCase();
      orderClause = `ORDER BY e.${sort.field} ${direction}`;
    }
    
    // Build pagination clause
    let limitClause = '';
    if (pagination) {
      const skip = (pagination.page - 1) * pagination.limit;
      limitClause = `SKIP $skip LIMIT $limit`;
      params.skip = int(skip);
      params.limit = int(pagination.limit);
      
      // Debug logging
      console.log('[DEBUG] Pagination values:', {
        originalPage: pagination.page,
        originalLimit: pagination.limit,
        skip: params.skip,
        limit: params.limit,
        skipType: typeof params.skip,
        limitType: typeof params.limit
      });
    }
    
    // Get total count (without pagination parameters)
    const { skip, limit, ...countParams } = params;
    
    const countQuery = `
      MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
      ${whereClause}
      RETURN count(e) as total
    `;
    
    // Debug logging for count query
    console.log('[DEBUG] Count query params:', JSON.stringify(countParams, null, 2));
    
    const countResult = await connection.executeQuery<{ total: number }>(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    
    // Get filtered expeditions
    const expeditionsQuery = `
      MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
      ${whereClause}
      RETURN e
      ${orderClause}
      ${limitClause}
    `;
    
    const expeditionsResult = await connection.executeQuery<{ e: Expedition }>(expeditionsQuery, params);
    const expeditions = expeditionsResult.map(record => record.e);
    
    return { expeditions, total };
  }

  /**
   * Create a new expedition
   */
  async create(entity: Omit<Expedition, 'id' | 'createdAt'>): Promise<Expedition> {
    const connection = getConnection();
    const now = new Date().toISOString();
    
    const expedition: Expedition = {
      ...entity,
      id: uuidv4(),
      createdAt: now,
      updatedAt: entity.updatedAt || now,
      assignedAgents: entity.assignedAgents || [],
      tags: entity.tags || [],
      status: entity.status || 'draft'
    };

    // Create expedition node
    await connection.executeWrite(
      'CREATE (e:Expedition $props) RETURN e',
      { props: expedition }
    );

    // Create relationship with starship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (e:Expedition {id: $expeditionId})
       CREATE (s)-[:HAS_EXPEDITION {createdAt: $timestamp}]->(e)`,
      {
        starshipId: expedition.starshipId,
        expeditionId: expedition.id,
        timestamp: expedition.createdAt
      }
    );

    return expedition;
  }

  /**
   * Update an expedition
   */
  async update(id: string, updates: Partial<Expedition>): Promise<Expedition | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const result = await connection.executeWrite<{ e: Expedition }>(
      'MATCH (e:Expedition) WHERE e.id = $id SET e += $updates RETURN e',
      { id, updates: updateProps }
    );

    return result[0]?.e || null;
  }

  /**
   * Update expedition status
   */
  async updateStatus(id: string, status: ExpeditionStatus): Promise<Expedition | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ e: Expedition }>(
      `MATCH (e:Expedition) WHERE e.id = $id 
       SET e.status = $status, e.updatedAt = $timestamp 
       RETURN e`,
      { 
        id, 
        status, 
        timestamp: new Date().toISOString() 
      }
    );

    return result[0]?.e || null;
  }

  /**
   * Update expedition workflow state
   */
  async updateWorkflowState(id: string, state: ExpeditionWorkflowState): Promise<Expedition | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ e: Expedition }>(
      `MATCH (e:Expedition) WHERE e.id = $id 
       SET e.workflowState = $state, e.updatedAt = $timestamp 
       RETURN e`,
      { 
        id, 
        state, 
        timestamp: new Date().toISOString() 
      }
    );

    return result[0]?.e || null;
  }

  /**
   * Delete an expedition
   */
  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (e:Expedition) WHERE e.id = $id 
       DETACH DELETE e 
       RETURN count(e) as deletedCount`,
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Assign an agent to an expedition
   */
  async assignAgent(expeditionId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    
    // Check if agent is already assigned
    const expedition = await this.findById(expeditionId);
    if (!expedition) {
      throw new Error('Expedition not found');
    }
    
    if (expedition.assignedAgents.includes(agentId)) {
      return true; // Already assigned
    }
    
    // Add agent to assignedAgents array
    const updatedAgents = [...expedition.assignedAgents, agentId];
    
    await connection.executeWrite(
      `MATCH (e:Expedition {id: $expeditionId}), (a:Agent {id: $agentId})
       SET e.assignedAgents = $assignedAgents, e.updatedAt = $timestamp
       CREATE (a)-[:ASSIGNED_TO {
         assignedAt: $timestamp,
         role: 'crew_member'
       }]->(e)`,
      {
        expeditionId,
        agentId,
        assignedAgents: updatedAgents,
        timestamp: new Date().toISOString()
      }
    );

    return true;
  }

  /**
   * Remove an agent from an expedition
   */
  async removeAgent(expeditionId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    
    // Get current expedition
    const expedition = await this.findById(expeditionId);
    if (!expedition) {
      throw new Error('Expedition not found');
    }
    
    // Remove agent from assignedAgents array
    const updatedAgents = expedition.assignedAgents.filter(id => id !== agentId);
    
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (e:Expedition {id: $expeditionId})<-[r:ASSIGNED_TO]-(a:Agent {id: $agentId})
       SET e.assignedAgents = $assignedAgents, e.updatedAt = $timestamp
       DELETE r
       RETURN count(r) as deletedCount`,
      {
        expeditionId,
        agentId,
        assignedAgents: updatedAgents,
        timestamp: new Date().toISOString()
      }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Get all agents assigned to an expedition
   */
  async getAssignedAgents(expeditionId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (e:Expedition {id: $expeditionId})<-[:ASSIGNED_TO]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { expeditionId }
    );
    return result.map(record => record.a);
  }

  /**
   * Get expedition statistics for a starship
   */
  async getExpeditionStats(starshipId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    failed: number;
    averageDuration: number;
    successRate: number;
  }> {
    const connection = getConnection();
    
    const result = await connection.executeQuery<{
      total: number;
      active: number;
      completed: number;
      failed: number;
      avgDuration: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       WITH count(e) as total,
            count(CASE WHEN e.status IN ['planning', 'in-progress', 'review'] THEN 1 END) as active,
            count(CASE WHEN e.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN e.status IN ['failed', 'cancelled'] THEN 1 END) as failed,
            avg(CASE WHEN e.actualDuration IS NOT NULL THEN e.actualDuration ELSE 0 END) as avgDuration
       RETURN total, active, completed, failed, avgDuration`,
      { starshipId }
    );

    const stats = result[0] || { total: 0, active: 0, completed: 0, failed: 0, avgDuration: 0 };
    const successRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

    return {
      total: stats.total,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      averageDuration: Math.round(stats.avgDuration || 0),
      successRate: Math.round(successRate * 100) / 100
    };
  }
}