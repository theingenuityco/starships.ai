import type { CreateStarshipDatasetRequest, StarshipDatasetModel, UpdateStarshipDatasetRequest } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { StarshipDatasetEntity } from '@/entities/StarshipDatasetEntity';
import { NotFoundError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { fromDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';

type DbRow = Record<string, unknown>;

export class StarshipDatasetRepository extends BaseRepository {
  constructor() {
    super('StarshipDatasetRepository');
  }

  async findById(id: string): Promise<StarshipDatasetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<DbRow>(
          `
            SELECT
              id,
              starship_id,
              name,
              slug,
              description,
              columns_json AS columns,
              primary_key,
              archived,
              created_at,
              updated_at
            FROM starship_datasets
            WHERE id = $1
          `,
          [id]
        );
        return record ? fromDatabase(StarshipDatasetEntity, record) : null;
      },
      'findById',
      'StarshipDataset',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<StarshipDatasetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<DbRow>(
          `
            SELECT
              id,
              starship_id,
              name,
              slug,
              description,
              columns_json AS columns,
              primary_key,
              archived,
              created_at,
              updated_at
            FROM starship_datasets
            WHERE starship_id = $1 AND slug = $2
            LIMIT 1
          `,
          [starshipId, slug]
        );
        return record ? fromDatabase(StarshipDatasetEntity, record) : null;
      },
      'findBySlug',
      'StarshipDataset',
      slug
    );
  }

  async listByStarship(starshipId: string, opts?: { includeArchived?: boolean }): Promise<StarshipDatasetModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const includeArchived = Boolean(opts?.includeArchived);
        const connection = this.getConnection();
        const records = await connection.query<DbRow>(
          `
            SELECT
              id,
              starship_id,
              name,
              slug,
              description,
              columns_json AS columns,
              primary_key,
              archived,
              created_at,
              updated_at
            FROM starship_datasets
            WHERE starship_id = $1
              AND ($2::boolean = TRUE OR archived = FALSE)
            ORDER BY archived ASC, created_at DESC
          `,
          [starshipId, includeArchived]
        );
        return fromDatabaseArray(StarshipDatasetEntity, records);
      },
      'listByStarship',
      'StarshipDataset'
    );
  }

  async create(data: CreateStarshipDatasetRequest): Promise<StarshipDatasetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const id = nanoid();
        const now = new Date().toISOString();
        const slug = await generateUniqueSlugIncremental(
          String(data.name || 'dataset'),
          async (candidate: string) => Boolean(await this.findBySlug(candidate, data.starshipId)),
          { fallbackBase: 'dataset', maxLength: 100 }
        );

        const datasetData: StarshipDatasetModel = {
          id,
          starshipId: data.starshipId,
          name: data.name,
          slug,
          description: typeof data.description === 'string' ? data.description : '',
          columns: Array.isArray(data.columns) ? data.columns : [],
          primaryKey: typeof data.primaryKey === 'string' ? data.primaryKey : data.primaryKey === null ? null : undefined,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };

        await StarshipDatasetEntity.validate(datasetData, 'create');

        // Insert explicitly to map columns -> columns_json
        const connection = this.getConnection();
        await connection.query(
          `
            INSERT INTO starship_datasets (
              id, starship_id, name, slug, description, columns_json, primary_key, archived, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
          `,
          [
            datasetData.id,
            datasetData.starshipId,
            datasetData.name,
            datasetData.slug,
            datasetData.description,
            JSON.stringify(datasetData.columns ?? []),
            datasetData.primaryKey ?? null,
            datasetData.archived,
            datasetData.createdAt,
            datasetData.updatedAt,
          ]
        );

        const created = await this.findById(id);
        if (!created) throw new NotFoundError('StarshipDataset', id);
        return created;
      },
      'create',
      'StarshipDataset'
    );
  }

  async update(id: string, updates: UpdateStarshipDatasetRequest): Promise<StarshipDatasetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await StarshipDatasetEntity.validate(updates, 'update');

        const existing = await this.findById(id);
        if (!existing) return null;

        const patch: Partial<StarshipDatasetModel> = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const sets: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        if (patch.name !== undefined) {
          sets.push(`name = $${i++}`);
          values.push(patch.name);
        }
        if (patch.description !== undefined) {
          sets.push(`description = $${i++}`);
          values.push(patch.description);
        }
        if (patch.columns !== undefined) {
          sets.push(`columns_json = $${i++}::jsonb`);
          values.push(JSON.stringify(patch.columns ?? []));
        }
        if (patch.primaryKey !== undefined) {
          sets.push(`primary_key = $${i++}`);
          values.push(patch.primaryKey ?? null);
        }
        if (patch.archived !== undefined) {
          sets.push(`archived = $${i++}`);
          values.push(Boolean(patch.archived));
        }

        sets.push(`updated_at = $${i++}`);
        values.push(patch.updatedAt);

        if (sets.length === 0) return existing;

        values.push(id);
        const connection = this.getConnection();
        await connection.query(`UPDATE starship_datasets SET ${sets.join(', ')} WHERE id = $${i}`, values);
        return await this.findById(id);
      },
      'update',
      'StarshipDataset',
      id
    );
  }

  async archive(id: string): Promise<StarshipDatasetModel | null> {
    return this.update(id, { archived: true });
  }
}

export default StarshipDatasetRepository;

