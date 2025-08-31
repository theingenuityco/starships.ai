import { getConnection } from '../helpers/database';
import { WorkflowModel } from '../types/workflow';
import { BaseRepository } from './BaseRepository';
import { convertNeo4jIntsInArray, convertNeo4jIntsInObject } from '../helpers/database';
import { v4 as uuidv4 } from 'uuid';
import { Blueprint } from '@starships/autopilot';

/**
 * WorkflowRepository - Database operations for workflows
 */
export class WorkflowRepository extends BaseRepository {
  constructor() {
    super('WorkflowRepository');
  }

  /**
   * Safe value getter with null/undefined/empty object handling
   */
  private getSafeValue<T>(value: T | {} | null | undefined, defaultValue: T): T {
    if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as any).length === 0)) {
      return defaultValue;
    }
    return value as T;
  }

  /**
   * Serialize complex fields for Neo4j storage
   */
  private serializeComplexFields(workflow: WorkflowModel): any {
    return {
      ...workflow,
      blueprint: workflow.blueprint ? JSON.stringify(workflow.blueprint) : null,
      tags: workflow.tags || [],
      allowedStarshipClasses: workflow.allowedStarshipClasses || []
    };
  }

  /**
   * Deserialize complex fields from Neo4j
   */
  private deserializeComplexFields(workflow: any): WorkflowModel {
    try {
      return {
        ...workflow,
        blueprint: workflow.blueprint ? JSON.parse(workflow.blueprint) : null,
        tags: workflow.tags || [],
        allowedStarshipClasses: workflow.allowedStarshipClasses || []
      };
    } catch (error) {
      console.warn('Failed to deserialize workflow fields:', error);
      return workflow;
    }
  }

  async findAll(): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ w: WorkflowModel }>(
        'MATCH (w:Workflow) RETURN w ORDER BY w.createdAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => record.w));
    }, 'findAll', 'Workflow');
  }

  async findById(id: string): Promise<WorkflowModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ w: WorkflowModel }>(
        'MATCH (w:Workflow) WHERE w.id = $id RETURN w',
        { id }
      );
      const workflow = result[0]?.w || null;
      return workflow ? convertNeo4jIntsInObject(workflow) : null;
    }, 'findById', 'Workflow', id);
  }

  async findByUser(userId: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN w',
      { userId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.w)));
  }

  async findByStarship(starshipId: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN w ORDER BY w.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.w)));
  }

  // NEW: FK-based query methods for starshipId relationship
  async findByStarshipId(starshipId: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE w.starshipId = $starshipId RETURN w ORDER BY w.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.w)));
  }

  /**
   * Update workflow's starship assignment (FK field + Neo4j relationship)
   */
  async updateStarshipId(workflowId: string, starshipId: string): Promise<void> {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = getConnection();
    const timestamp = new Date().toISOString();

    // Update workflow's starshipId
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (w:Workflow) WHERE w.id = $workflowId
       SET w.starshipId = $starshipId, w.updatedAt = $timestamp
       RETURN count(w) as count`,
      { workflowId, starshipId, timestamp }
    );

    if (!result[0] || result[0].count === 0) {
      this.handleNotFound('Workflow', workflowId, 'updateStarshipId');
    }

    // Update Neo4j relationship for backward compatibility
    try {
      // Remove existing DEPLOYED_ON relationships
      await connection.executeWrite(
        'MATCH (w:Workflow {id: $workflowId})-[r:DEPLOYED_ON]->() DELETE r',
        { workflowId }
      );
      
      // Create new DEPLOYED_ON relationship
      await connection.executeWrite(
        `MATCH (s:Starship {id: $starshipId}), (w:Workflow {id: $workflowId})
         CREATE (w)-[:DEPLOYED_ON {
           deployedAt: $timestamp,
           deployedBy: 'system'
         }]->(s)`,
        { starshipId, workflowId, timestamp }
      );
    } catch (error) {
      console.warn('Failed to update Neo4j relationship for workflow deployment:', error);
    }
  }

  async findUndeployedWorkflows(): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE w.starshipId IS NULL OR w.starshipId = "" RETURN w ORDER BY w.createdAt DESC',
      {}
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async create(
    entity: Omit<WorkflowModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<WorkflowModel> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(entity, ['name', 'authorId'], 'create');

      const connection = getConnection();
      const id = uuidv4();
      const now = new Date().toISOString();

      // Create default blueprint if none provided
      const defaultBlueprint: Blueprint = {
        nodes: [],
        edges: [],
        metadata: {}
      };

      // Create workflow with only essential fields from WorkflowNodeParameters + database fields
      const workflow: WorkflowModel = {
        // Core WorkflowNodeParameters fields
        blueprint: (entity.blueprint && typeof entity.blueprint === 'object' && 'nodes' in entity.blueprint)
          ? entity.blueprint as Blueprint
          : defaultBlueprint,
        timeout: this.getSafeValue(entity.timeout, 30000) as number,
        
        // Database fields
        id,
        createdAt: now,
        updatedAt: now,
        authorId: entity.authorId as string,
        starshipId: entity.starshipId as string | undefined,
        version: this.getSafeValue(entity.version, '1.0.0') as string,
        category: entity.category as WorkflowModel['category'],
        usageCount: 0,
        isPublic: this.getSafeValue(entity.isPublic, false) as boolean,
        tags: entity.tags as string[] || [],
        rating: entity.rating as number | undefined,
        executionMode: (entity.executionMode as 'simple' | 'workflow') || 'workflow',
        allowedStarshipClasses: entity.allowedStarshipClasses as string[] | undefined
      };

      const workflowForStorage = this.serializeComplexFields(workflow);

      await connection.executeWrite('CREATE (w:Workflow $props) RETURN w', { props: workflowForStorage });

      // For backward compatibility, also create Neo4j relationship during transition
      if (workflow.starshipId) {
        try {
          await connection.executeWrite(
            `MATCH (s:Starship {id: $starshipId}), (w:Workflow {id: $workflowId})
             CREATE (w)-[:DEPLOYED_ON {
               deployedAt: $timestamp,
               deployedBy: 'system'
             }]->(s)`,
            { starshipId: workflow.starshipId, workflowId: workflow.id, timestamp: now }
          );
        } catch (error) {
          console.warn('Failed to create Neo4j relationship for new workflow:', error);
        }
      }

      return convertNeo4jIntsInObject(workflow);
    }, 'create', 'Workflow');
  }

  async update(id: string, updates: Partial<WorkflowModel>): Promise<WorkflowModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'update');

      const connection = getConnection();
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const result = await connection.executeWrite<{ w: WorkflowModel }>(
        'MATCH (w:Workflow) WHERE w.id = $id SET w += $updates RETURN w',
        { id, updates: updateProps }
      );

      const workflow = result[0]?.w || null;
      return workflow ? convertNeo4jIntsInObject(workflow) : null;
    }, 'update', 'Workflow', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (w:Workflow) WHERE w.id = $id DETACH DELETE w RETURN count(w) as deletedCount',
        { id }
      );
      return result[0]?.deletedCount > 0;
    }, 'delete', 'Workflow', id);
  }

  // ADD: New enhanced query methods
  async findByAuthor(authorId: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE w.authorId = $authorId RETURN w ORDER BY w.updatedAt DESC',
      { authorId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async findByCategory(category: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE w.category = $category RETURN w ORDER BY w.name',
      { category }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async findByTags(tags: string[]): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE ANY(tag IN $tags WHERE tag IN w.tags) RETURN w ORDER BY w.name',
      { tags }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel }>(
      'MATCH (w:Workflow) WHERE w.isPublic = true RETURN w ORDER BY w.usageCount DESC, w.rating DESC SKIP $offset LIMIT $limit',
      {
        limit: (limit),
        offset: (offset)
      }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async searchWorkflows(query: string): Promise<WorkflowModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ w: WorkflowModel; score: number }>(
      'CALL db.index.fulltext.queryNodes("workflowSearch", $query) YIELD node as w, score RETURN w, score ORDER BY score DESC LIMIT 20',
      { query }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }

  async incrementUsageCount(id: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      'MATCH (w:Workflow) WHERE w.id = $id SET w.usageCount = w.usageCount + 1, w.updatedAt = $timestamp',
      { id, timestamp: new Date().toISOString() }
    );
  }

  async updateRating(id: string, rating: number): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      'MATCH (w:Workflow) WHERE w.id = $id SET w.rating = $rating, w.updatedAt = $timestamp',
      { id, rating, timestamp: new Date().toISOString() }
    );
  }

  async findWithFilters(filters: {
    category?: string;
    authorId?: string;
    isPublic?: boolean;
    tags?: string[];
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<WorkflowModel[]> {
    const connection = getConnection();
    let query = 'MATCH (w:Workflow) WHERE 1=1';
    const params: any = {};

    if (filters.category) {
      query += ' AND w.category = $category';
      params.category = filters.category;
    }

    if (filters.authorId) {
      query += ' AND w.authorId = $authorId';
      params.authorId = filters.authorId;
    }

    if (filters.isPublic !== undefined) {
      query += ' AND w.isPublic = $isPublic';
      params.isPublic = filters.isPublic;
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ' AND ANY(tag IN $tags WHERE tag IN w.tags)';
      params.tags = filters.tags;
    }

    if (filters.starshipClass) {
      query += ' AND $starshipClass IN w.allowedStarshipClasses';
      params.starshipClass = filters.starshipClass;
    }

    query += ' RETURN w ORDER BY w.usageCount DESC, w.rating DESC';

    const result = await connection.executeQuery<{ w: WorkflowModel }>(query, params);
    return convertNeo4jIntsInArray(result.map((record) => record.w));
  }
}