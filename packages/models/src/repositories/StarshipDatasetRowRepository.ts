import type { StarshipDatasetRowModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { StarshipDatasetRowEntity } from '@/entities/StarshipDatasetRowEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { nanoid } from 'nanoid';
import type { PostgresConnection } from '@/helpers/database';

type DbRow = Record<string, unknown>;

function toFiniteInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export type DatasetRowFilterOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'isNull'
  | 'isNotNull';

export type DatasetRowFilter = {
  /**
   * Column name (dataset schema column name) OR 'rowKey' to target the row_key column.
   */
  column: string;
  op?: DatasetRowFilterOp;
  value?: unknown;
  /**
   * Optional type hint from dataset schema to enable safer comparisons.
   */
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'enum' | 'reference' | 'formula';
};

function buildDatasetRowsWhereClause(args: {
  datasetId: string;
  search?: string | null;
  filters?: DatasetRowFilter[] | null;
}): { whereSql: string; params: unknown[] } {
  const datasetId = String(args.datasetId || '').trim();
  const params: unknown[] = [datasetId];
  const clauses: string[] = ['dataset_id = $1'];
  let i = 2;

  const search = typeof args.search === 'string' ? args.search.trim() : '';
  if (search) {
    const like = `%${search}%`;
    params.push(like);
    const p = `$${i++}`;
    // Search row_key + top-level json scalar values.
    clauses.push(`(row_key ILIKE ${p} OR EXISTS (SELECT 1 FROM jsonb_each_text(data_json) kv WHERE kv.value ILIKE ${p}))`);
  }

  const filters = Array.isArray(args.filters) ? args.filters : [];
  for (const f of filters) {
    if (!f || typeof f !== 'object') continue;
    const column = typeof f.column === 'string' ? f.column.trim() : '';
    if (!column) continue;
    const op: DatasetRowFilterOp = (f.op as DatasetRowFilterOp) || 'eq';
    const type = f.type;

    const isRowKey = column === 'rowKey' || column === '__rowKey' || column === '_rowKey';

    const keyParam = isRowKey ? null : `$${i++}`;
    if (!isRowKey) params.push(column);

    const jsonTextExpr = isRowKey ? 'row_key' : `(data_json ->> ${keyParam})`;

    if (op === 'isNull') {
      clauses.push(`(${jsonTextExpr} IS NULL)`);
      continue;
    }
    if (op === 'isNotNull') {
      clauses.push(`(${jsonTextExpr} IS NOT NULL)`);
      continue;
    }

    if (op === 'in') {
      const raw = f.value;
      const arr = Array.isArray(raw) ? raw : [];
      const items = arr
        .map((v) => (v === null || v === undefined ? '' : String(v)))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length === 0) continue;
      const pArr = `$${i++}`;
      params.push(items);
      clauses.push(`(${jsonTextExpr} = ANY(${pArr}::text[]))`);
      continue;
    }

    const rawVal = f.value;
    const valStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
    const trimmed = valStr.trim();
    if (!trimmed) continue;

    // Comparison helpers
    const addTextParam = (): string => {
      const p = `$${i++}`;
      params.push(trimmed);
      return p;
    };
    const addLikeParam = (): string => {
      const p = `$${i++}`;
      params.push(`%${trimmed}%`);
      return p;
    };

    // Type-aware comparisons (best-effort)
    if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
      const cmp = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<=';

      if (type === 'number') {
        const p = `$${i++}`;
        const n = Number(trimmed);
        if (!Number.isFinite(n)) continue;
        params.push(n);
        // Guard cast with a simple numeric regex to avoid runtime errors.
        clauses.push(`(${jsonTextExpr} ~ '^-?\\\\d+(\\\\.\\\\d+)?$' AND (${jsonTextExpr})::double precision ${cmp} ${p}::double precision)`);
        continue;
      }

      if (type === 'date') {
        const p = addTextParam();
        clauses.push(`(${jsonTextExpr} ~ '^\\\\d{4}-\\\\d{2}-\\\\d{2}$' AND (${jsonTextExpr})::date ${cmp} ${p}::date)`);
        continue;
      }

      if (type === 'datetime') {
        const p = addTextParam();
        clauses.push(`(${jsonTextExpr} ~ '^\\\\d{4}-\\\\d{2}-\\\\d{2}T' AND (${jsonTextExpr})::timestamptz ${cmp} ${p}::timestamptz)`);
        continue;
      }

      // Fallback: lexical compare
      const p = addTextParam();
      clauses.push(`(${jsonTextExpr} ${cmp} ${p})`);
      continue;
    }

    if (op === 'contains') {
      const p = addLikeParam();
      clauses.push(`(${jsonTextExpr} ILIKE ${p})`);
      continue;
    }
    if (op === 'startsWith') {
      const p = `$${i++}`;
      params.push(`${trimmed}%`);
      clauses.push(`(${jsonTextExpr} ILIKE ${p})`);
      continue;
    }
    if (op === 'endsWith') {
      const p = `$${i++}`;
      params.push(`%${trimmed}`);
      clauses.push(`(${jsonTextExpr} ILIKE ${p})`);
      continue;
    }

    if (op === 'neq') {
      const p = addTextParam();
      clauses.push(`(COALESCE(${jsonTextExpr}, '') <> ${p})`);
      continue;
    }

    // eq (default)
    const p = addTextParam();
    clauses.push(`(${jsonTextExpr} = ${p})`);
  }

  return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export class StarshipDatasetRowRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('StarshipDatasetRowRepository', connection);
  }

  async countByDataset(datasetId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const { whereSql, params } = buildDatasetRowsWhereClause({ datasetId });
        const connection = this.getConnection();
        const row = await connection.queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM starship_dataset_rows ${whereSql}`, params);
        return toFiniteInt(row?.count, 0);
      },
      'countByDataset',
      'StarshipDatasetRow',
      datasetId
    );
  }

  async countByDatasetWithQuery(
    datasetId: string,
    opts?: { search?: string | null; filters?: DatasetRowFilter[] | null }
  ): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const { whereSql, params } = buildDatasetRowsWhereClause({ datasetId, search: opts?.search ?? null, filters: opts?.filters ?? null });
        const connection = this.getConnection();
        const row = await connection.queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM starship_dataset_rows ${whereSql}`, params);
        return toFiniteInt(row?.count, 0);
      },
      'countByDatasetWithQuery',
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

        const { whereSql, params } = buildDatasetRowsWhereClause({ datasetId });
        params.push(limit, offset);
        const pLimit = `$${params.length - 1}`;
        const pOffset = `$${params.length}`;

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
            ${whereSql}
            ORDER BY created_at ${order}, id ${order}
            LIMIT ${pLimit} OFFSET ${pOffset}
          `,
          params
        );
        return fromDatabaseArray(StarshipDatasetRowEntity, records);
      },
      'listByDataset',
      'StarshipDatasetRow',
      datasetId
    );
  }

  async listByDatasetWithQuery(
    datasetId: string,
    opts?: { limit?: number; offset?: number; order?: 'asc' | 'desc'; search?: string | null; filters?: DatasetRowFilter[] | null }
  ): Promise<StarshipDatasetRowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = typeof opts?.limit === 'number' ? Math.max(0, Math.min(200, Math.floor(opts.limit))) : 50;
        const offset = typeof opts?.offset === 'number' ? Math.max(0, Math.floor(opts.offset)) : 0;
        const order = opts?.order === 'asc' ? 'ASC' : 'DESC';

        const { whereSql, params } = buildDatasetRowsWhereClause({ datasetId, search: opts?.search ?? null, filters: opts?.filters ?? null });
        params.push(limit, offset);
        const pLimit = `$${params.length - 1}`;
        const pOffset = `$${params.length}`;

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
            ${whereSql}
            ORDER BY created_at ${order}, id ${order}
            LIMIT ${pLimit} OFFSET ${pOffset}
          `,
          params
        );
        return fromDatabaseArray(StarshipDatasetRowEntity, records);
      },
      'listByDatasetWithQuery',
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
