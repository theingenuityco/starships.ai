import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { WorkflowModel } from '@starships/protocol';
import { WorkflowEntity } from '../entities/WorkflowEntity';

export class WorkflowRepository extends BaseRepository {
  constructor() {
    super('WorkflowRepository');
  }

  async findAll(): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('workflows', 'created_at DESC');
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findAll',
      'Workflow'
    );
  }

  async findById(id: string): Promise<WorkflowModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('workflows', id);
        return result ? fromDatabase(WorkflowEntity, result) : null;
      },
      'findById',
      'Workflow',
      id
    );
  }

  async create(entity: Omit<WorkflowModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<WorkflowModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare workflow data with defaults and validation
        const workflowData = {
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
        };

        // Validate using WorkflowEntity
        await WorkflowEntity.validate(workflowData, 'create');

        // Convert entity to database format and create
        const databaseFormat = toDatabase(toEntityInstance(WorkflowEntity, workflowData));
        const result = await this.createEntity<Record<string, unknown>>('workflows', databaseFormat);

        return fromDatabase(WorkflowEntity, result);
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

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(WorkflowEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('workflows', id, filteredUpdateData);
        return result ? fromDatabase(WorkflowEntity, result) : null;
      },
      'update',
      'Workflow',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('workflows', id);
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
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM workflows WHERE author_id = $1 ORDER BY updated_at DESC',
          [authorId]
        );
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findByAuthor',
      'Workflow'
    );
  }

  async findByCategory(category: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM workflows WHERE category = $1 ORDER BY name', [
          category,
        ]);
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findByCategory',
      'Workflow'
    );
  }

  async findByStarshipId(starshipId: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM workflows WHERE starship_id = $1 ORDER BY name', [
          starshipId,
        ]);
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findByStarshipId',
      'Workflow'
    );
  }

  async findByTags(tags: string[]): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM workflows WHERE tags && $1 ORDER BY name', [tags]);
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findByTags',
      'Workflow'
    );
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM workflows WHERE is_public = true ORDER BY usage_count DESC, rating DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        );
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findPublic',
      'Workflow'
    );
  }

  async searchWorkflows(query: string): Promise<WorkflowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Using PostgreSQL full-text search
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM workflows
           WHERE LOWER(name) LIKE LOWER($1)
              OR LOWER(description) LIKE LOWER($1)
           ORDER BY usage_count DESC LIMIT 20`,
          [`%${query}%`]
        );
        return fromDatabaseArray(WorkflowEntity, result);
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
        let query = 'SELECT * FROM workflows WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.category) {
          query += ` AND category = $${paramIndex++}`;
          params.push(filters.category);
        }

        if (filters.authorId) {
          query += ` AND author_id = $${paramIndex++}`;
          params.push(filters.authorId);
        }

        if (filters.isPublic !== undefined) {
          query += ` AND is_public = $${paramIndex++}`;
          params.push(filters.isPublic);
        }

        if (filters.tags && filters.tags.length > 0) {
          query += ` AND tags && $${paramIndex++}`;
          params.push(filters.tags);
        }

        if (filters.starshipClass) {
          query += ` AND $${paramIndex++} = ANY(allowed_starship_classes)`;
          params.push(filters.starshipClass);
        }

        query += ' ORDER BY usage_count DESC, rating DESC';

        const result = await connection.query<Record<string, unknown>>(query, params);
        return fromDatabaseArray(WorkflowEntity, result);
      },
      'findWithFilters',
      'Workflow'
    );
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `UPDATE workflows
           SET usage_count = COALESCE(usage_count, 0) + 1,
               updated_at = $2
           WHERE id = $1`,
          [id, new Date().toISOString()]
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
        await connection.query('UPDATE workflows SET rating = $2, updated_at = $3 WHERE id = $1', [id, rating, new Date().toISOString()]);
      },
      'updateRating',
      'Workflow',
      id
    );
  }

  /**
   * Create relationship between existing workflow and starship
   * In PostgreSQL, this is handled by the starship_id foreign key
   */
  async linkToStarship(workflowId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `UPDATE workflows
           SET starship_id = $2, updated_at = $3
           WHERE id = $1`,
          [workflowId, starshipId, new Date().toISOString()]
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
        const result = await connection.query(
          `UPDATE workflows
           SET starship_id = $2, updated_at = $3
           WHERE id = $1`,
          [workflowId, starshipId, timestamp]
        );

        if ((result as unknown as { rowCount: number }).rowCount === 0) {
          this.handleNotFound('Workflow', workflowId);
        }
      },
      'updateStarshipId',
      'Workflow'
    );
  }
}
