import type { WidgetModel, CreateWidgetRequest, UpdateWidgetRequest, WidgetSearchParams } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { WidgetEntity } from '@/entities/WidgetEntity';
import { NotFoundError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateUniqueWidgetSlug } from '@/utils/slugGenerator';

/**
 * Widget Repository
 * Manages widget CRUD operations using PostgreSQL client pattern
 */
export class WidgetRepository extends BaseRepository {
  constructor() {
    super('WidgetRepository');
  }

  /**
   * Create a new widget
   */
  async create(data: CreateWidgetRequest): Promise<WidgetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const id = nanoid();
        const slug = data.slug || (await generateUniqueWidgetSlug(data.starshipId, this));
        const now = new Date().toISOString();

        const widgetData: WidgetModel = {
          id,
          name: data.name,
          slug,
          description: data.description,
          widgetType: data.widgetType,
          props: data.props,
          starshipId: data.starshipId,
          createdAt: now,
          updatedAt: now,
        };

        // Validate entity
        await WidgetEntity.validate(widgetData, 'create');

        // Create entity instance and convert to database format
        const widgetEntity = toEntityInstance(WidgetEntity, widgetData as unknown as Record<string, unknown>);
        const databaseFormat = toDatabase(widgetEntity);

        // Insert into database
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `INSERT INTO widgets (
            id, name, slug, description, widget_type, props,
            starship_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            databaseFormat.id,
            databaseFormat.name,
            databaseFormat.slug,
            databaseFormat.description,
            databaseFormat.widget_type,
            JSON.stringify(databaseFormat.props),
            databaseFormat.starship_id,
            databaseFormat.created_at,
            databaseFormat.updated_at,
          ]
        );

        return fromDatabase(WidgetEntity, result[0]);
      },
      'create',
      'Widget'
    );
  }

  /**
   * Find widget by ID
   */
  async findById(id: string): Promise<WidgetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<Record<string, unknown>>('SELECT * FROM widgets WHERE id = $1', [id]);

        if (!record) {
          return null;
        }

        return fromDatabase(WidgetEntity, record);
      },
      'findById',
      'Widget',
      id
    );
  }

  /**
   * Update an existing widget
   */
  async update(id: string, data: UpdateWidgetRequest): Promise<WidgetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) {
          throw new NotFoundError('Widget', id);
        }

        const updatedData: Partial<WidgetModel> = {
          ...data,
          updatedAt: new Date().toISOString(),
        };

        // Validate update
        await WidgetEntity.validate(updatedData, 'update');

        // Build dynamic update query
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(data.name);
        }
        // Slug should not be updated on existing widgets
        if (data.description !== undefined) {
          updates.push(`description = $${paramIndex++}`);
          values.push(data.description);
        }
        if (data.props !== undefined) {
          // Merge props with existing props
          const mergedProps = { ...existing.props, ...data.props };
          updates.push(`props = $${paramIndex++}`);
          values.push(JSON.stringify(mergedProps));
        }

        updates.push(`updated_at = $${paramIndex++}`);
        values.push(updatedData.updatedAt);
        values.push(id);

        const connection = this.getConnection();
        await connection.query(`UPDATE widgets SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

        return (await this.findById(id)) as WidgetModel;
      },
      'update',
      'Widget',
      id
    );
  }

  /**
   * Find widget by slug within a starship
   */
  async findBySlug(slug: string, starshipId: string): Promise<WidgetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM widgets WHERE slug = $1 AND starship_id = $2',
          [slug, starshipId]
        );

        if (!record) {
          return null;
        }

        return fromDatabase(WidgetEntity, record);
      },
      'findBySlug',
      'Widget',
      slug
    );
  }

  /**
   * Search widgets with filters
   */
  async search(params: WidgetSearchParams): Promise<WidgetModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const conditions: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (params.starshipId) {
          conditions.push(`starship_id = $${paramIndex++}`);
          values.push(params.starshipId);
        }

        if (params.name) {
          conditions.push(`name ILIKE $${paramIndex++}`);
          values.push(`%${params.name}%`);
        }

        if (params.slug) {
          conditions.push(`slug = $${paramIndex++}`);
          values.push(params.slug);
        }

        if (params.widgetType) {
          conditions.push(`widget_type = $${paramIndex++}`);
          values.push(params.widgetType);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = params.limit ? `LIMIT ${params.limit}` : '';
        const offsetClause = params.offset ? `OFFSET ${params.offset}` : '';

        const connection = this.getConnection();
        const records = await connection.query<Record<string, unknown>>(
          `SELECT * FROM widgets ${whereClause} ORDER BY created_at DESC ${limitClause} ${offsetClause}`,
          values
        );

        return fromDatabaseArray(WidgetEntity, records);
      },
      'search',
      'Widget'
    );
  }

  /**
   * Delete widget by ID
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('widgets', id);
      },
      'delete',
      'Widget',
      id
    );
  }

  /**
   * Find all widgets for a starship
   */
  async findByStarshipId(starshipId: string): Promise<WidgetModel[]> {
    return this.search({ starshipId });
  }
}
