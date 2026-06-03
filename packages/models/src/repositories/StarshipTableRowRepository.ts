import type { StarshipDatasetColumn } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { nanoid } from 'nanoid';
import type { PostgresConnection } from '@/helpers/database';
import { qualifiedTable, quoteIdent } from '@/helpers/starship-tables/identifiers';

type DbRow = Record<string, unknown>;

/** Everything a row operation needs to target a starship's physical Table. */
export interface TableRef {
  starshipId: string;
  physicalTable: string;
  columns: StarshipDatasetColumn[];
  primaryKey: string | null;
}

export interface TableRowModel {
  id: string;
  rowKey: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type TableRowFilterOp =
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

export interface TableRowFilter {
  column: string;
  op?: TableRowFilterOp;
  value?: unknown;
}

const ROW_KEY_ALIASES = new Set(['rowKey', '__rowKey', '_rowKey']);

function toFiniteInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : new Date(String(value)).toISOString();
}

/** Cast suffix for a typed comparison based on a column's logical type. */
function comparisonCast(type: StarshipDatasetColumn['type']): string {
  switch (type) {
    case 'number':
      return '::double precision';
    case 'date':
      return '::date';
    case 'datetime':
      return '::timestamptz';
    default:
      return '';
  }
}

export class StarshipTableRowRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('StarshipTableRowRepository', connection);
  }

  /** Map a filter/search request to a parameterized WHERE clause over real columns. */
  private buildWhere(ref: TableRef, opts?: { search?: string | null; filters?: TableRowFilter[] | null }): {
    whereSql: string;
    params: unknown[];
    nextIndex: number;
  } {
    const byName = new Map(ref.columns.filter((c) => c && c.name).map((c) => [c.name, c]));
    const params: unknown[] = [];
    const clauses: string[] = [];
    let i = 1;

    // Resolve a requested filter column to a quoted SQL column + its logical type.
    const resolve = (column: string): { sql: string; type: StarshipDatasetColumn['type'] } | null => {
      if (ROW_KEY_ALIASES.has(column)) return { sql: quoteIdent('__row_key'), type: 'string' };
      const col = byName.get(column);
      if (!col) return null;
      return { sql: quoteIdent(col.name), type: col.type ?? 'string' };
    };

    const search = typeof opts?.search === 'string' ? opts.search.trim() : '';
    if (search) {
      const like = `%${search}%`;
      const searchable = [quoteIdent('__row_key'), ...ref.columns.filter((c) => c && c.name).map((c) => quoteIdent(c.name))];
      const ors = searchable.map((sql) => {
        params.push(like);
        return `CAST(${sql} AS text) ILIKE $${i++}`;
      });
      if (ors.length) clauses.push(`(${ors.join(' OR ')})`);
    }

    for (const f of Array.isArray(opts?.filters) ? opts!.filters! : []) {
      if (!f || typeof f !== 'object') continue;
      const target = resolve(typeof f.column === 'string' ? f.column.trim() : '');
      if (!target) continue;
      const op: TableRowFilterOp = f.op || 'eq';
      const { sql } = target;

      if (op === 'isNull') {
        clauses.push(`(${sql} IS NULL)`);
        continue;
      }
      if (op === 'isNotNull') {
        clauses.push(`(${sql} IS NOT NULL)`);
        continue;
      }
      if (op === 'in') {
        const arr = Array.isArray(f.value) ? f.value : [];
        const items = arr.map((v) => (v == null ? '' : String(v))).filter((s) => s.length > 0);
        if (!items.length) continue;
        params.push(items);
        clauses.push(`(CAST(${sql} AS text) = ANY($${i++}::text[]))`);
        continue;
      }

      const raw = f.value;
      const valStr = raw == null ? '' : String(raw).trim();
      if (!valStr) continue;

      if (op === 'contains') {
        params.push(`%${valStr}%`);
        clauses.push(`(CAST(${sql} AS text) ILIKE $${i++})`);
      } else if (op === 'startsWith') {
        params.push(`${valStr}%`);
        clauses.push(`(CAST(${sql} AS text) ILIKE $${i++})`);
      } else if (op === 'endsWith') {
        params.push(`%${valStr}`);
        clauses.push(`(CAST(${sql} AS text) ILIKE $${i++})`);
      } else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
        const cmp = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<=';
        const cast = comparisonCast(target.type);
        params.push(valStr);
        clauses.push(`(${sql}${cast} ${cmp} $${i++}${cast})`);
      } else if (op === 'neq') {
        params.push(valStr);
        clauses.push(`(COALESCE(CAST(${sql} AS text), '') <> $${i++})`);
      } else {
        // eq (default)
        params.push(valStr);
        clauses.push(`(CAST(${sql} AS text) = $${i++})`);
      }
    }

    return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params, nextIndex: i };
  }

  /** SELECT list: hidden bookkeeping columns + every user column. */
  private selectList(ref: TableRef): string {
    const userCols = ref.columns.filter((c) => c && c.name).map((c) => quoteIdent(c.name));
    return [quoteIdent('__id'), quoteIdent('__row_key'), quoteIdent('__created_at'), quoteIdent('__updated_at'), ...userCols].join(', ');
  }

  private mapRow(ref: TableRef, row: DbRow): TableRowModel {
    const data: Record<string, unknown> = {};
    for (const col of ref.columns) {
      if (col && col.name && col.name in row) data[col.name] = row[col.name];
    }
    return {
      id: String(row['__id']),
      rowKey: row['__row_key'] == null ? null : String(row['__row_key']),
      data,
      createdAt: toIso(row['__created_at']),
      updatedAt: toIso(row['__updated_at']),
    };
  }

  async countByDataset(ref: TableRef, opts?: { search?: string | null; filters?: TableRowFilter[] | null }): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const { whereSql, params } = this.buildWhere(ref, opts);
        const table = qualifiedTable(ref.starshipId, ref.physicalTable);
        const row = await this.getConnection().queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table} ${whereSql}`, params);
        return toFiniteInt(row?.count, 0);
      },
      'countByDataset',
      'StarshipTableRow',
      ref.physicalTable
    );
  }

  async listByDataset(
    ref: TableRef,
    opts?: { limit?: number; offset?: number; order?: 'asc' | 'desc'; search?: string | null; filters?: TableRowFilter[] | null }
  ): Promise<TableRowModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = typeof opts?.limit === 'number' ? Math.max(0, Math.min(200, Math.floor(opts.limit))) : 50;
        const offset = typeof opts?.offset === 'number' ? Math.max(0, Math.floor(opts.offset)) : 0;
        const order = opts?.order === 'asc' ? 'ASC' : 'DESC';
        const { whereSql, params, nextIndex } = this.buildWhere(ref, opts);
        params.push(limit, offset);
        const table = qualifiedTable(ref.starshipId, ref.physicalTable);
        const rows = await this.getConnection().query<DbRow>(
          `SELECT ${this.selectList(ref)} FROM ${table} ${whereSql}
           ORDER BY ${quoteIdent('__created_at')} ${order}, ${quoteIdent('__id')} ${order}
           LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
          params
        );
        return rows.map((r) => this.mapRow(ref, r));
      },
      'listByDataset',
      'StarshipTableRow',
      ref.physicalTable
    );
  }

  /** Resolve the row_key for a row: explicit rowKey, else the primaryKey column value. */
  private rowKeyFor(ref: TableRef, row: { rowKey?: string | null; data: Record<string, unknown> }): string | null {
    if (typeof row.rowKey === 'string' && row.rowKey.length > 0) return row.rowKey;
    if (ref.primaryKey && row.data && row.data[ref.primaryKey] != null) return String(row.data[ref.primaryKey]);
    return null;
  }

  async appendMany(ref: TableRef, rows: Array<{ rowKey?: string | null; data: Record<string, unknown> }>): Promise<{ inserted: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const safe = Array.isArray(rows) ? rows : [];
        if (safe.length === 0) return { inserted: 0 };
        const known = new Set(ref.columns.filter((c) => c && c.name).map((c) => c.name));
        const table = qualifiedTable(ref.starshipId, ref.physicalTable);
        let inserted = 0;

        await this.getConnection().transaction(async (client) => {
          for (const r of safe) {
            const data = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};
            const provided = Object.keys(data).filter((k) => known.has(k));
            const id = nanoid();
            const rowKey = this.rowKeyFor(ref, { rowKey: r?.rowKey, data });

            const cols = [quoteIdent('__id'), quoteIdent('__row_key'), ...provided.map((k) => quoteIdent(k))];
            const params: unknown[] = [id, rowKey, ...provided.map((k) => data[k])];
            const placeholders = params.map((_, idx) => `$${idx + 1}`);
            await client.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, params);
            inserted++;
          }
        });
        return { inserted };
      },
      'appendMany',
      'StarshipTableRow',
      ref.physicalTable
    );
  }

  async upsertManyByRowKey(ref: TableRef, rows: Array<{ rowKey: string; data: Record<string, unknown> }>): Promise<{ inserted: number; updated: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const safe = Array.isArray(rows) ? rows : [];
        if (safe.length === 0) return { inserted: 0, updated: 0 };
        const known = new Set(ref.columns.filter((c) => c && c.name).map((c) => c.name));
        const table = qualifiedTable(ref.starshipId, ref.physicalTable);
        let inserted = 0;
        let updated = 0;

        await this.getConnection().transaction(async (client) => {
          for (const r of safe) {
            const data = r?.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};
            const rowKey = String(r.rowKey ?? '').trim();
            const provided = Object.keys(data).filter((k) => known.has(k));
            const id = nanoid();

            const cols = [quoteIdent('__id'), quoteIdent('__row_key'), ...provided.map((k) => quoteIdent(k))];
            const params: unknown[] = [id, rowKey, ...provided.map((k) => data[k])];
            const placeholders = params.map((_, idx) => `$${idx + 1}`);
            const setClause = [
              ...provided.map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`),
              `${quoteIdent('__updated_at')} = now()`,
            ].join(', ');

            const res = await client.query<{ inserted: boolean }>(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
               ON CONFLICT (${quoteIdent('__row_key')}) DO UPDATE SET ${setClause}
               RETURNING (xmax = 0) AS inserted`,
              params
            );
            const wasInserted = Array.isArray(res) ? Boolean(res[0]?.inserted) : false;
            if (wasInserted) inserted++;
            else updated++;
          }
        });
        return { inserted, updated };
      },
      'upsertManyByRowKey',
      'StarshipTableRow',
      ref.physicalTable
    );
  }

  async deleteByRowKey(ref: TableRef, rowKey: string): Promise<{ deleted: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const rk = String(rowKey || '').trim();
        if (!rk) return { deleted: false };
        const table = qualifiedTable(ref.starshipId, ref.physicalTable);
        const res = await this.getConnection().queryWithResult(`DELETE FROM ${table} WHERE ${quoteIdent('__row_key')} = $1`, [rk]);
        return { deleted: (res.rowCount ?? 0) > 0 };
      },
      'deleteByRowKey',
      'StarshipTableRow',
      ref.physicalTable
    );
  }
}

export default StarshipTableRowRepository;
