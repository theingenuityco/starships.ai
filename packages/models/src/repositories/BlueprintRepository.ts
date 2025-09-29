/**
 * BlueprintRepository - Repository for autopilot blueprints
 *
 * Handles CRUD operations for Blueprint entities with JSONB storage for nodes and edges
 * following BaseRepository patterns and PostgreSQL JSONB patterns.
 */

import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { BlueprintModel, CreateBlueprintRequest, UpdateBlueprintRequest } from '@starships/protocol';
import { BlueprintEntity } from '../entities/BlueprintEntity';

export class BlueprintRepository extends BaseRepository {
  constructor() {
    super('BlueprintRepository');
  }

  async createBlueprint(request: CreateBlueprintRequest): Promise<BlueprintModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare blueprint data with proper transformation
        const blueprintData = {
          ...request,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
          nodes: request.nodes || [],
          edges: request.edges || [],
          metadata: request.metadata || {},
        };

        // Use BlueprintEntity validation
        await BlueprintEntity.validate(blueprintData, 'create');

        if (!Array.isArray(blueprintData.nodes) || blueprintData.nodes.length === 0) {
          this.handleValidationError([
            {
              field: 'nodes',
              message: 'At least one node is required',
              value: blueprintData.nodes,
            },
          ]);
        }

        if (!Array.isArray(blueprintData.edges)) {
          this.handleValidationError([
            {
              field: 'edges',
              message: 'Edges array is required',
              value: blueprintData.edges,
            },
          ]);
        }

        // Convert entity to database format and create
        const databaseFormat = toDatabase(toEntityInstance(BlueprintEntity, blueprintData));
        const result = await this.createEntity<Record<string, unknown>>('blueprints', databaseFormat);

        return fromDatabase(BlueprintEntity, result);
      },
      'createBlueprint',
      'Blueprint'
    );
  }

  async getBlueprintById(blueprintId: string): Promise<BlueprintModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!blueprintId) {
          throw new Error('Blueprint ID is required');
        }

        const result = await super.findEntityById<Record<string, unknown>>('blueprints', blueprintId);
        return result ? fromDatabase(BlueprintEntity, result) : null;
      },
      'getBlueprintById',
      'Blueprint',
      blueprintId
    );
  }

  async getAllBlueprints(): Promise<BlueprintModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>('SELECT * FROM blueprints ORDER BY created_at DESC');

        return result.map((record) => fromDatabase(BlueprintEntity, record));
      },
      'getAllBlueprints',
      'Blueprint'
    );
  }

  async updateBlueprint(blueprintId: string, updates: UpdateBlueprintRequest): Promise<BlueprintModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!blueprintId) {
          throw new Error('Blueprint ID is required');
        }

        // Use BlueprintEntity validation for updates
        await BlueprintEntity.validate(updates, 'update');

        if (!updates || Object.keys(updates).length === 0) {
          this.handleValidationError([
            {
              field: 'updates',
              message: 'At least one field must be provided for update',
            },
          ]);
        }

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(BlueprintEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.getBlueprintById(blueprintId);
        }

        const result = await this.updateEntity<Record<string, unknown>>('blueprints', blueprintId, filteredUpdateData);
        return result ? fromDatabase(BlueprintEntity, result) : null;
      },
      'updateBlueprint',
      'Blueprint',
      blueprintId
    );
  }

  async incrementUsageCount(blueprintId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!blueprintId) {
          throw new Error('Blueprint ID is required');
        }

        const connection = this.getConnection();
        await connection.query(
          `UPDATE blueprints
           SET usage_count = COALESCE(usage_count, 0) + 1,
               updated_at = $2
           WHERE id = $1`,
          [blueprintId, new Date().toISOString()]
        );
      },
      'incrementUsageCount',
      'Blueprint',
      blueprintId
    );
  }

  async deleteBlueprint(blueprintId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!blueprintId) {
          throw new Error('Blueprint ID is required');
        }

        await this.deleteEntity('blueprints', blueprintId);
      },
      'deleteBlueprint',
      'Blueprint',
      blueprintId
    );
  }

  async getBlueprintsByCategory(category: string): Promise<BlueprintModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!category) {
          throw new Error('Category is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM blueprints WHERE category = $1 ORDER BY usage_count DESC, created_at DESC',
          [category]
        );

        return result.map((record) => fromDatabase(BlueprintEntity, record));
      },
      'getBlueprintsByCategory',
      'Blueprint'
    );
  }
}
