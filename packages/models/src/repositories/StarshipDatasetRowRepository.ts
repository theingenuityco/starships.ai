import type { StarshipDatasetRowModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { StarshipDatasetRowEntity } from '@/entities/StarshipDatasetRowEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { nanoid } from 'nanoid';

type DbRow = Record<string, unknown>;

function toFiniteInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export class StarshipDatasetRowRepository extends BaseRepository {
  constructor() {
    super('StarshipDatasetRowRepository');
  }

  async countByDataset(datasetId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM starship_dataset_rows WHERE dataset_id = $1',
          [datasetId]
        );
        return toFiniteInt(row?.count, 0);
      },
      'countByDataset',
      'StarshipDatasetRow',
      datasetId
    );
  }

  async listByDataset(
    datasetId: string,
    opts?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
  ): Promise<StarshipDatasetRowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = typeof opts?.limit === 'number' ? Math.max(0, Math.min(200, Math.floor(opts.limit))) : 50;
        const offset = typeof opts?.offset === 'number' ? Math.max(0, Math.floor(opts.offset)) : 0;
        const order = opts?.order === 'asc' ? 'ASC' : 'DESC';

        const connection = this.getConnection();
        const records = await connection.query<DbRow>(
          `
            SELECT
              id,
              dataset_id,
              row_key,
              data_json AS data,
              created_at,
              updated_at
            FROM starship_dataset_rows
            WHERE dataset_id = $1
            ORDER BY created_at ${order}, id ${order}
            LIMIT $2 OFFSET $3
          `,
          [datasetId, limit, offset]
        );
        return fromDatabaseArray(StarshipDatasetRowEntity, records);
      },
      'listByDataset',
      'StarshipDatasetRow',
      datasetId
    );
  }

  async appendMany(
    datasetId: string,
    rows: Array<{ rowKey?: string | null; data: Record<string, unknown> }>
  ): Promise<{ inserted: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const safe = Array.isArray(rows) ? rows : [];
        if (safe.length === 0) return { inserted: 0 };

        const values: unknown[] = [];
        const tuples: string[] = [];
        let i = 1;

        const now = new Date().toISOString();
        for (const r of safe) {
          const id = nanoid();
          const rowKey = typeof r?.rowKey === 'string' ? r.rowKey : r?.rowKey === null ? null : null;
          const data = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};

          tuples.push(`($${i++},$${i++},$${i++},$${i++}::jsonb,$${i++},$${i++})`);
          values.push(id, datasetId, rowKey, JSON.stringify(data), now, now);
        }

        const connection = this.getConnection();
        const res = await connection.queryWithResult(
          `
            INSERT INTO starship_dataset_rows (id, dataset_id, row_key, data_json, created_at, updated_at)
            VALUES ${tuples.join(', ')}
          `,
          values
        );
        return { inserted: res.rowCount ?? safe.length };
      },
      'appendMany',
      'StarshipDatasetRow',
      datasetId
    );
  }

  async upsertManyByRowKey(
    datasetId: string,
    rows: Array<{ rowKey: string; data: Record<string, unknown> }>
  ): Promise<{ inserted: number; updated: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const safe = Array.isArray(rows) ? rows : [];
        if (safe.length === 0) return { inserted: 0, updated: 0 };

        const values: unknown[] = [];
        const tuples: string[] = [];
        let i = 1;

        const now = new Date().toISOString();
        for (const r of safe) {
          const id = nanoid();
          const rowKey = String(r.rowKey ?? '').trim();
          const data = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};

          tuples.push(`($${i++},$${i++},$${i++},$${i++}::jsonb,$${i++},$${i++})`);
          values.push(id, datasetId, rowKey, JSON.stringify(data), now, now);
        }

        const connection = this.getConnection();
        const res = await connection.query<{ inserted: boolean }>(
          `
            INSERT INTO starship_dataset_rows (id, dataset_id, row_key, data_json, created_at, updated_at)
            VALUES ${tuples.join(', ')}
            ON CONFLICT (dataset_id, row_key)
            DO UPDATE SET
              data_json = EXCLUDED.data_json,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `,
          values
        );

        let inserted = 0;
        let updated = 0;
        for (const row of res) {
          if (row.inserted) inserted++;
          else updated++;
        }
        return { inserted, updated };
      },
      'upsertManyByRowKey',
      'StarshipDatasetRow',
      datasetId
    );
  }
}

export default StarshipDatasetRowRepository;
