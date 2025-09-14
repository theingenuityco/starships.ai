import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { WorkflowModel } from '@starships/protocol';
import { WorkflowEntity } from '../entities/WorkflowEntity';

export class WorkflowRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('WorkflowRepository', connection);
  }

  async findAll(): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>('MATCH (w:Workflow) RETURN w ORDER BY w.createdAt DESC');
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findAll',
      'Workflow'
    );
  }

  async findById(id: string): Promise<WorkflowModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>('MATCH (w:Workflow) WHERE w.id = $id RETURN w', { id });
        return result.length > 0 ? WorkflowEntity.fromDatabaseRecord(result[0].w as unknown as Record<string, unknown>) : null;
      },
      'findById',
      'Workflow',
      id
    );
  }

  async create(entity: Omit<WorkflowModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<WorkflowModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use WorkflowEntity validation
        await WorkflowEntity.validate(entity, 'create');

        const now = new Date().toISOString();

        // Prepare workflow data with defaults and validation
        const workflowEntity = WorkflowEntity.createFromRequest({
          ...entity,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
          version: entity.version || '1.0.0',
          category: entity.category || 'general',
          isPublic: entity.isPublic ?? false,
          tags: entity.tags || [],
          executionMode: entity.executionMode || 'workflow',
          timeout: entity.timeout ?? 30000,
          // Ensure blueprint has default structure
          blueprint: entity.blueprint || {
            nodes: [],
            edges: [],
            metadata: {},
          },
        });

        const workflowData = workflowEntity.toDatabaseFormat();
        // Remove id since it will be auto-generated
        delete workflowData.id;

        // Use BaseRepository serialization
        const result = await this.createEntityWithAutoId<WorkflowModel>('Workflow', workflowData);

        // Create relationship with starship if starshipId is provided
        if (result.starshipId) {
          await this.linkToStarship(result.id, result.starshipId);
        }

        // Use WorkflowEntity for consistent mapping
        return WorkflowEntity.fromDatabaseRecord(result as unknown as Record<string, unknown>);
      },
      'create',
      'Workflow'
    );
  }

  async update(id: string, updates: Partial<WorkflowModel>): Promise<WorkflowModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use WorkflowEntity validation for updates
        await WorkflowEntity.validate(updates, 'update');

        const connection = this.getConnection();
        const setFields = [];
        const params: Record<string, unknown> = { id };

        // Handle updatable fields with proper serialization
        if (updates.name !== undefined) {
          setFields.push('w.name = $name');
          params.name = updates.name;
        }
        if (updates.description !== undefined) {
          setFields.push('w.description = $description');
          params.description = updates.description;
        }
        if (updates.category !== undefined) {
          setFields.push('w.category = $category');
          params.category = updates.category;
        }
        if (updates.version !== undefined) {
          setFields.push('w.version = $version');
          params.version = updates.version;
        }
        if (updates.isPublic !== undefined) {
          setFields.push('w.isPublic = $isPublic');
          params.isPublic = updates.isPublic;
        }
        if (updates.tags !== undefined) {
          setFields.push('w.tags = $tags');
          params.tags = updates.tags;
        }
        if (updates.rating !== undefined) {
          setFields.push('w.rating = $rating');
          params.rating = updates.rating;
        }
        if (updates.executionMode !== undefined) {
          setFields.push('w.executionMode = $executionMode');
          params.executionMode = updates.executionMode;
        }
        if (updates.allowedStarshipClasses !== undefined) {
          setFields.push('w.allowedStarshipClasses = $allowedStarshipClasses');
          params.allowedStarshipClasses = updates.allowedStarshipClasses;
        }
        if (updates.timeout !== undefined) {
          setFields.push('w.timeout = $timeout');
          params.timeout = updates.timeout;
        }
        if (updates.blueprint !== undefined) {
          setFields.push('w.blueprint = $blueprint');
          // Use WorkflowEntity to handle blueprint serialization
          const tempEntity = WorkflowEntity.createFromRequest({ blueprint: updates.blueprint });
          const serialized = tempEntity.toDatabaseFormat();
          params.blueprint = serialized.blueprint;
        }
        if (updates.starshipId !== undefined) {
          setFields.push('w.starshipId = $starshipId');
          params.starshipId = updates.starshipId;
        }

        if (setFields.length === 0) {
          return this.findById(id);
        }

        // Always update the updatedAt field
        setFields.push('w.updatedAt = $updatedAt');
        params.updatedAt = new Date().toISOString();

        const result = await connection.executeWrite<{ w: WorkflowModel }>(
          `MATCH (w:Workflow) WHERE w.id = $id
           SET ${setFields.join(', ')}
           RETURN w`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Workflow', id);
        }

        // Use WorkflowEntity for consistent mapping
        return WorkflowEntity.fromDatabaseRecord(result[0].w as unknown as Record<string, unknown>);
      },
      'update',
      'Workflow',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (w:Workflow) WHERE w.id = $id DETACH DELETE w RETURN count(w) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Workflow',
      id
    );
  }

  async findByAuthor(authorId: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          'MATCH (w:Workflow) WHERE w.authorId = $authorId RETURN w ORDER BY w.updatedAt DESC',
          { authorId }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findByAuthor',
      'Workflow'
    );
  }

  async findByCategory(category: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          'MATCH (w:Workflow) WHERE w.category = $category RETURN w ORDER BY w.name',
          { category }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findByCategory',
      'Workflow'
    );
  }

  async findByStarshipId(starshipId: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          'MATCH (w:Workflow) WHERE w.starshipId = $starshipId RETURN w ORDER BY w.name',
          { starshipId }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findByStarshipId',
      'Workflow'
    );
  }

  async findByTags(tags: string[]): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          'MATCH (w:Workflow) WHERE ANY(tag IN $tags WHERE tag IN w.tags) RETURN w ORDER BY w.name',
          { tags }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findByTags',
      'Workflow'
    );
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          'MATCH (w:Workflow) WHERE w.isPublic = true RETURN w ORDER BY w.usageCount DESC, w.rating DESC SKIP $offset LIMIT $limit',
          { limit, offset }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findPublic',
      'Workflow'
    );
  }

  async searchWorkflows(query: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Simple text search if full-text index is not available
        const result = await connection.executeQuery<{ w: WorkflowModel }>(
          `MATCH (w:Workflow) 
           WHERE toLower(w.name) CONTAINS toLower($query) 
              OR toLower(w.description) CONTAINS toLower($query)
           RETURN w ORDER BY w.usageCount DESC LIMIT 20`,
          { query }
        );
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'searchWorkflows',
      'Workflow'
    );
  }

  async findWithFilters(filters: {
    category?: string;
    authorId?: string;
    isPublic?: boolean;
    tags?: string[];
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'MATCH (w:Workflow) WHERE 1=1';
        const params: Record<string, unknown> = {};

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
        return result.map((record) => WorkflowEntity.fromDatabaseRecord(record.w as unknown as Record<string, unknown>));
      },
      'findWithFilters',
      'Workflow'
    );
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (w:Workflow) WHERE w.id = $id 
           SET w.usageCount = COALESCE(w.usageCount, 0) + 1,
               w.updatedAt = $updatedAt`,
          {
            id,
            updatedAt: new Date().toISOString(),
          }
        );
      },
      'incrementUsageCount',
      'Workflow',
      id
    );
  }

  async updateRating(id: string, rating: number): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite('MATCH (w:Workflow) WHERE w.id = $id SET w.rating = $rating, w.updatedAt = $timestamp', {
          id,
          rating,
          timestamp: new Date().toISOString(),
        });
      },
      'updateRating',
      'Workflow',
      id
    );
  }

  /**
   * Create relationship between existing workflow and starship
   */
  async linkToStarship(workflowId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (w:Workflow {id: $workflowId})
           CREATE (w)-[:DEPLOYED_ON {
             deployedAt: $timestamp,
             deployedBy: 'system'
           }]->(s)`,
          {
            starshipId,
            workflowId,
            timestamp: new Date().toISOString(),
          }
        );
      },
      'linkToStarship',
      'Workflow'
    );
  }

  /**
   * Update workflow's starship assignment
   */
  async updateStarshipId(workflowId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const timestamp = new Date().toISOString();

        // Update workflow's starshipId
        const result = await connection.executeWrite<{ count: number }>(
          `MATCH (w:Workflow) WHERE w.id = $workflowId
           SET w.starshipId = $starshipId, w.updatedAt = $timestamp
           RETURN count(w) as count`,
          { workflowId, starshipId, timestamp }
        );

        if (!result[0] || result[0].count === 0) {
          this.handleNotFound('Workflow', workflowId);
        }

        // Update Neo4j relationship for backward compatibility
        try {
          // Remove existing DEPLOYED_ON relationships
          await connection.executeWrite('MATCH (w:Workflow {id: $workflowId})-[r:DEPLOYED_ON]->() DELETE r', { workflowId });

          // Create new DEPLOYED_ON relationship
          await this.linkToStarship(workflowId, starshipId);
        } catch (error) {
          console.warn('Failed to update Neo4j relationship for workflow deployment:', error);
        }
      },
      'updateStarshipId',
      'Workflow'
    );
  }
}
