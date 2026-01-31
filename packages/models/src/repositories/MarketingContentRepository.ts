import { MarketingContentEntity } from '@/entities/MarketingContentEntity';
import { fromDatabase, fromDatabaseArray, toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type {
  MarketingContentModel,
  CreateMarketingContentRequest,
  MarketingContentEntityType,
  MarketingContentType,
} from '@starships/protocol';
import { nanoid } from 'nanoid';

export class MarketingContentRepository extends BaseRepository {
  constructor() {
    super('MarketingContentRepository');
  }

  /**
   * Find all active marketing content for an entity
   */
  async findByEntity(
    entityType: MarketingContentEntityType,
    entityId: string
  ): Promise<MarketingContentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM marketing_content 
           WHERE entity_type = $1 AND entity_id = $2 AND is_active = true 
           ORDER BY content_type, created_at DESC`,
          [entityType, entityId]
        );
        return fromDatabaseArray(MarketingContentEntity, result) as MarketingContentModel[];
      },
      'findByEntity',
      'MarketingContent',
      entityId
    );
  }

  /**
   * Find specific content type for an entity
   */
  async findByEntityAndType(
    entityType: MarketingContentEntityType,
    entityId: string,
    contentType: MarketingContentType
  ): Promise<MarketingContentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT * FROM marketing_content 
           WHERE entity_type = $1 AND entity_id = $2 AND content_type = $3 AND is_active = true 
           ORDER BY version DESC 
           LIMIT 1`,
          [entityType, entityId, contentType]
        );
        return result ? (fromDatabase(MarketingContentEntity, result) as MarketingContentModel) : null;
      },
      'findByEntityAndType',
      'MarketingContent',
      entityId
    );
  }

  /**
   * Create or update marketing content (upsert pattern)
   * If content exists, deactivate old version and create new one
   */
  async createOrUpdate(data: CreateMarketingContentRequest): Promise<MarketingContentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Deactivate any existing active content of this type
        const connection = this.getConnection();
        await connection.query(
          `UPDATE marketing_content 
           SET is_active = false, updated_at = $1
           WHERE entity_type = $2 AND entity_id = $3 AND content_type = $4 AND is_active = true`,
          [now, data.entityType, data.entityId, data.contentType]
        );

        // Create new content
        const entity = new MarketingContentEntity();
        Object.assign(entity, {
          id: nanoid(),
          entityType: data.entityType,
          entityId: data.entityId,
          contentType: data.contentType,
          contentFormat: data.contentFormat,
          s3Key: data.s3Key,
          mimeType: data.mimeType,
          textContent: data.textContent,
          textFormat: data.textFormat || 'json',
          generationStatus: 'completed',
          generationCompletedAt: now,
          generationMetadata: data.generationMetadata || {},
          metadata: data.metadata || {},
          version: 1,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

        await MarketingContentEntity.validate(entity, 'create');

        const dbRecord = toDatabase(entity);
        const result = await super.createEntity<Record<string, unknown>>('marketing_content', dbRecord);
        return fromDatabase(MarketingContentEntity, result) as MarketingContentModel;
      },
      'createOrUpdate',
      'MarketingContent'
    );
  }

  /**
   * Queue generation (create pending content)
   */
  async queueGeneration(
    entityType: MarketingContentEntityType,
    entityId: string,
    contentType: MarketingContentType,
    contentFormat: 'image' | 'text',
    metadata?: Record<string, unknown>
  ): Promise<MarketingContentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        const entity = new MarketingContentEntity();
        Object.assign(entity, {
          id: nanoid(),
          entityType,
          entityId,
          contentType,
          contentFormat,
          generationStatus: 'pending',
          generationRequestedAt: now,
          generationMetadata: metadata || {},
          metadata: {},
          version: 1,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

        await MarketingContentEntity.validate(entity, 'create');

        const dbRecord = toDatabase(entity);
        const result = await super.createEntity<Record<string, unknown>>('marketing_content', dbRecord);
        return fromDatabase(MarketingContentEntity, result) as MarketingContentModel;
      },
      'queueGeneration',
      'MarketingContent'
    );
  }

  /**
   * Update generation status
   */
  async updateGenerationStatus(
    id: string,
    status: 'generating' | 'completed' | 'failed',
    updates?: {
      s3Key?: string;
      mimeType?: string;
      textContent?: string;
      generationError?: string;
      generationMetadata?: Record<string, unknown>;
    }
  ): Promise<MarketingContentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const updateData: Record<string, unknown> = {
          generationStatus: status,
          updatedAt: now,
        };

        if (status === 'generating') {
          updateData.generationStartedAt = now;
        } else if (status === 'completed') {
          updateData.generationCompletedAt = now;
        } else if (status === 'failed') {
          updateData.generationError = updates?.generationError;
        }

        if (updates?.s3Key) updateData.s3Key = updates.s3Key;
        if (updates?.mimeType) updateData.mimeType = updates.mimeType;
        if (updates?.textContent) updateData.textContent = updates.textContent;
        if (updates?.generationMetadata) {
          updateData.generationMetadata = updates.generationMetadata;
        }

        const dbRecord = toDatabase(updateData);
        const result = await super.updateEntity<Record<string, unknown>>('marketing_content', id, dbRecord);
        return result ? (fromDatabase(MarketingContentEntity, result) as MarketingContentModel) : null;
      },
      'updateGenerationStatus',
      'MarketingContent',
      id
    );
  }

  /**
   * Find pending generations (for pipeline)
   */
  async findPendingGenerations(limit: number = 10): Promise<MarketingContentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM marketing_content 
           WHERE generation_status IN ('pending', 'generating') AND is_active = true
           ORDER BY generation_requested_at ASC
           LIMIT $1`,
          [limit]
        );
        return fromDatabaseArray(MarketingContentEntity, result) as MarketingContentModel[];
      },
      'findPendingGenerations',
      'MarketingContent'
    );
  }

  /**
   * Delete marketing content (soft delete by setting is_active = false)
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `UPDATE marketing_content 
           SET is_active = false, updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
        return true;
      },
      'delete',
      'MarketingContent',
      id
    );
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<MarketingContentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('marketing_content', id);
        return result ? (fromDatabase(MarketingContentEntity, result) as MarketingContentModel) : null;
      },
      'findById',
      'MarketingContent',
      id
    );
  }
}
