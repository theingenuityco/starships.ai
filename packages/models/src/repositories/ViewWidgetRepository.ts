import { BaseRepository } from './BaseRepository';
import type { PoolClient } from 'pg';
import type { ViewWidgetRow } from '@/utils/viewRootWidgets';

type DbRow = {
  view_id: string;
  node_id: string;
  type: string;
  props: Record<string, unknown>;
  bindings: Record<string, unknown> | null;
  handlers: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ViewWidgetModel = {
  viewId: string;
  nodeId: string;
  type: string;
  props: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  handlers?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function fromDb(r: DbRow): ViewWidgetModel {
  return {
    viewId: r.view_id,
    nodeId: r.node_id,
    type: r.type,
    props: r.props || {},
    ...(r.bindings ? { bindings: r.bindings } : null),
    ...(r.handlers ? { handlers: r.handlers } : null),
    ...(r.permissions ? { permissions: r.permissions } : null),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mergeProps(existing: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(existing || {}), ...(patch || {}) };
}

export class ViewWidgetRepository extends BaseRepository {
  constructor() {
    super('ViewWidgetRepository');
  }

  async listByView(viewId: string, client?: PoolClient): Promise<ViewWidgetModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const sql = 'SELECT * FROM view_widgets WHERE view_id = $1 ORDER BY node_id ASC';
        const conn = this.getConnection();
        const rows = client ? ((await client.query(sql, [viewId])).rows as DbRow[]) : await conn.query<DbRow>(sql, [viewId]);
        return rows.map(fromDb);
      },
      'listByView',
      'ViewWidget',
      viewId
    );
  }

  async listByViews(viewIds: string[], client?: PoolClient): Promise<ViewWidgetModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!Array.isArray(viewIds) || viewIds.length === 0) return [];
        const sql = 'SELECT * FROM view_widgets WHERE view_id = ANY($1::text[])';
        const conn = this.getConnection();
        const rows = client ? ((await client.query(sql, [viewIds])).rows as DbRow[]) : await conn.query<DbRow>(sql, [viewIds]);
        return rows.map(fromDb);
      },
      'listByViews',
      'ViewWidget'
    );
  }

  async upsertMany(viewId: string, widgets: ViewWidgetRow[], client?: PoolClient): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!Array.isArray(widgets) || widgets.length === 0) return;
        const chunkSize = 250;
        const conn = this.getConnection();
        for (let i = 0; i < widgets.length; i += chunkSize) {
          const chunk = widgets.slice(i, i + chunkSize);
          const values: unknown[] = [];
          const tuples = chunk
            .map((w, idx) => {
              const base = idx * 7;
              values.push(
                viewId,
                w.nodeId,
                w.type,
                JSON.stringify(w.props || {}),
                JSON.stringify(w.bindings ?? null),
                JSON.stringify(w.handlers ?? null),
                JSON.stringify(w.permissions ?? null)
              );
              return `($${base + 1},$${base + 2},$${base + 3},$${base + 4}::jsonb,$${base + 5}::jsonb,$${base + 6}::jsonb,$${base + 7}::jsonb)`;
            })
            .join(',');

          const sql = `
          INSERT INTO view_widgets (view_id, node_id, type, props, bindings, handlers, permissions)
          VALUES ${tuples}
          ON CONFLICT (view_id, node_id) DO UPDATE SET
            type = EXCLUDED.type,
            props = EXCLUDED.props,
            bindings = EXCLUDED.bindings,
            handlers = EXCLUDED.handlers,
            permissions = EXCLUDED.permissions,
            updated_at = NOW()
        `;
          if (client) {
            await client.query(sql, values);
          } else {
            await conn.query(sql, values);
          }
        }
      },
      'upsertMany',
      'ViewWidget',
      viewId
    );
  }

  async get(viewId: string, nodeId: string, client?: PoolClient): Promise<ViewWidgetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const sql = 'SELECT * FROM view_widgets WHERE view_id = $1 AND node_id = $2';
        const conn = this.getConnection();
        const row = client
          ? ((await client.query(sql, [viewId, nodeId])).rows[0] as DbRow | undefined)
          : await conn.queryOne<DbRow>(sql, [viewId, nodeId]);
        return row ? fromDb(row) : null;
      },
      'get',
      'ViewWidget'
    );
  }

  /**
   * Upsert a single widget node; merges props when updating.
   */
  async upsertOne(
    viewId: string,
    nodeId: string,
    data: {
      type?: string;
      props?: Record<string, unknown>;
      bindings?: Record<string, unknown> | null;
      handlers?: Record<string, unknown> | null;
      permissions?: Record<string, unknown> | null;
    },
    client?: PoolClient
  ): Promise<ViewWidgetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.get(viewId, nodeId, client);
        const nextType = typeof data.type === 'string' && data.type.trim() ? data.type.trim() : existing?.type || 'Box';
        const nextProps = data.props ? mergeProps(existing?.props || {}, data.props) : existing?.props || {};
        const nextBindings = data.bindings !== undefined ? data.bindings : (existing?.bindings ?? null);
        const nextHandlers = data.handlers !== undefined ? data.handlers : (existing?.handlers ?? null);
        const nextPermissions = data.permissions !== undefined ? data.permissions : (existing?.permissions ?? null);

        const sql = `
        INSERT INTO view_widgets (view_id, node_id, type, props, bindings, handlers, permissions)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)
        ON CONFLICT (view_id, node_id) DO UPDATE SET
          type = EXCLUDED.type,
          props = EXCLUDED.props,
          bindings = EXCLUDED.bindings,
          handlers = EXCLUDED.handlers,
          permissions = EXCLUDED.permissions,
          updated_at = NOW()
        RETURNING *
      `;
        const params = [
          viewId,
          nodeId,
          nextType,
          JSON.stringify(nextProps),
          JSON.stringify(nextBindings),
          JSON.stringify(nextHandlers),
          JSON.stringify(nextPermissions),
        ];
        const rows = client ? ((await client.query(sql, params)).rows as DbRow[]) : await this.getConnection().query<DbRow>(sql, params);
        if (!rows || rows.length === 0) {
          throw new Error('Failed to upsert view widget');
        }
        return fromDb(rows[0]);
      },
      'upsertOne',
      'ViewWidget'
    );
  }

  async delete(viewId: string, nodeId: string, client?: PoolClient): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const sql = 'DELETE FROM view_widgets WHERE view_id = $1 AND node_id = $2';
        const conn = this.getConnection();
        if (client) {
          const res = await client.query(sql, [viewId, nodeId]);
          return (res.rowCount ?? 0) > 0;
        }
        const res = await conn.queryWithResult(sql, [viewId, nodeId]);
        return (res.rowCount ?? 0) > 0;
      },
      'delete',
      'ViewWidget'
    );
  }

  async deleteNotIn(viewId: string, keepNodeIds: string[], client?: PoolClient): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const ids = Array.isArray(keepNodeIds) ? keepNodeIds.filter((s) => typeof s === 'string' && s.trim()) : [];
        const conn = this.getConnection();
        const sql =
          ids.length > 0
            ? 'DELETE FROM view_widgets WHERE view_id = $1 AND node_id <> ALL($2::text[])'
            : 'DELETE FROM view_widgets WHERE view_id = $1';
        const params = ids.length > 0 ? [viewId, ids] : [viewId];
        if (client) {
          const res = await client.query(sql, params);
          return res.rowCount ?? 0;
        }
        const res = await conn.queryWithResult(sql, params);
        return res.rowCount ?? 0;
      },
      'deleteNotIn',
      'ViewWidget',
      viewId
    );
  }
}
