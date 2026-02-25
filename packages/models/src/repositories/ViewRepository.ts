import type { CreateViewRequest, UpdateViewRequest, ViewModel, ViewSearchParams, ViewLayout } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { ViewEntity } from '@/entities/ViewEntity';
import { NotFoundError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeLayout(input: unknown): ViewLayout {
  if (!isRecord(input)) return { cols: 3, items: [] };
  const cols = Math.max(1, toFiniteInt(input.cols, 3));
  const itemsRaw = input.items;
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  // Ensure each item has an id (nanoid) for stable client rendering.
  const normalizedItems = items
    .map((item) => {
      if (!isRecord(item)) return null;
      const idRaw = item.id;
      const widgetIdRaw = item.widgetId;
      const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : nanoid();
      const widgetId = typeof widgetIdRaw === 'string' ? widgetIdRaw : '';
      const col = Math.max(0, toFiniteInt(item.col, 0));
      const row = Math.max(0, toFiniteInt(item.row, 0));

      const colSpanVal = item.colSpan;
      const rowSpanVal = item.rowSpan;
      const colSpan = colSpanVal == null ? undefined : Math.max(1, toFiniteInt(colSpanVal, 1));
      const rowSpan = rowSpanVal == null ? undefined : Math.max(1, toFiniteInt(rowSpanVal, 1));

      return {
        id,
        widgetId,
        col,
        row,
        ...(colSpan !== undefined ? { colSpan } : null),
        ...(rowSpan !== undefined ? { rowSpan } : null),
      };
    })
    .filter((it): it is ViewLayout['items'][number] => Boolean(it))
    // Keep only items with a plausible widgetId; deeper validation happens at API boundary.
    .filter((it) => typeof it.widgetId === 'string' && it.widgetId.trim().length > 0);

  return { cols, items: normalizedItems };
}

export class ViewRepository extends BaseRepository {
  constructor() {
    super('ViewRepository');
  }

  async create(data: CreateViewRequest): Promise<ViewModel> {
    return this.executeWithErrorHandling(
      async () => {
        const id = nanoid();
        const now = new Date().toISOString();

        const slug = data.slug
          ? String(data.slug)
          : await generateUniqueSlugIncremental(
              String(data.name || 'view'),
              async (candidate: string) => Boolean(await this.findBySlug(candidate, data.starshipId)),
              { fallbackBase: 'view', maxLength: 100 }
            );

        const layout = normalizeLayout(data.layout);

        const viewData: ViewModel = {
          id,
          name: data.name,
          slug,
          description: data.description,
          layout,
          starshipId: data.starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await ViewEntity.validate(viewData, 'create');

        const viewEntity = toEntityInstance(ViewEntity, viewData as unknown as Record<string, unknown>);
        const databaseFormat = toDatabase(viewEntity);

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `INSERT INTO views (
            id, name, slug, description, layout,
            starship_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            databaseFormat.id,
            databaseFormat.name,
            databaseFormat.slug,
            databaseFormat.description,
            JSON.stringify(databaseFormat.layout),
            databaseFormat.starship_id,
            databaseFormat.created_at,
            databaseFormat.updated_at,
          ]
        );

        return fromDatabase(ViewEntity, result[0]);
      },
      'create',
      'View'
    );
  }

  async findById(id: string): Promise<ViewModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<Record<string, unknown>>('SELECT * FROM views WHERE id = $1', [id]);
        if (!record) return null;
        return fromDatabase(ViewEntity, record);
      },
      'findById',
      'View',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<ViewModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM views WHERE slug = $1 AND starship_id = $2',
          [slug, starshipId]
        );
        if (!record) return null;
        return fromDatabase(ViewEntity, record);
      },
      'findBySlug',
      'View',
      slug
    );
  }

  async search(params: ViewSearchParams): Promise<ViewModel[]> {
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

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = params.limit ? `LIMIT ${params.limit}` : '';
        const offsetClause = params.offset ? `OFFSET ${params.offset}` : '';

        const connection = this.getConnection();
        const records = await connection.query<Record<string, unknown>>(
          `SELECT * FROM views ${whereClause} ORDER BY created_at DESC ${limitClause} ${offsetClause}`,
          values
        );

        return fromDatabaseArray(ViewEntity, records);
      },
      'search',
      'View'
    );
  }

  async findByStarshipId(starshipId: string): Promise<ViewModel[]> {
    return this.search({ starshipId });
  }

  async update(id: string, data: UpdateViewRequest): Promise<ViewModel> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) {
          throw new NotFoundError('View', id);
        }

        const updatedAt = new Date().toISOString();
        const layout = data.layout !== undefined ? normalizeLayout(data.layout) : undefined;

        const updatedData: Partial<ViewModel> = {
          ...(data.name !== undefined ? { name: data.name } : null),
          ...(data.description !== undefined ? { description: data.description } : null),
          ...(layout !== undefined ? { layout } : null),
          updatedAt,
        };

        await ViewEntity.validate(updatedData, 'update');

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(data.name);
        }
        if (data.description !== undefined) {
          updates.push(`description = $${paramIndex++}`);
          values.push(data.description);
        }
        if (layout !== undefined) {
          updates.push(`layout = $${paramIndex++}`);
          values.push(JSON.stringify(layout));
        }

        updates.push(`updated_at = $${paramIndex++}`);
        values.push(updatedAt);
        values.push(id);

        const connection = this.getConnection();
        await connection.query(`UPDATE views SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

        return (await this.findById(id)) as ViewModel;
      },
      'update',
      'View',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('views', id);
      },
      'delete',
      'View',
      id
    );
  }
}

