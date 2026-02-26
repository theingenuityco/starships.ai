import type {
  CreateViewRequest,
  UpdateViewRequest,
  ViewModel,
  ViewRuntimeConfig,
  ViewSearchParams,
  WidgetInstanceNode,
} from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { ViewEntity } from '@/entities/ViewEntity';
import { NotFoundError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { ViewWidgetRepository } from './ViewWidgetRepository';
import {
  collectStructureNodeIds,
  dehydrateViewRoot,
  hydrateViewRoot,
  isFullWidgetNode,
  isStructureNode,
  type ViewWidgetRow,
} from '@/utils/viewRootWidgets';
import type { PoolClient } from 'pg';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeRuntimeConfig(input: unknown): ViewRuntimeConfig {
  if (!isRecord(input)) return {};
  return input as unknown as ViewRuntimeConfig;
}

function normalizeRoot(input: unknown, opts?: { maxDepth?: number; maxNodes?: number }): WidgetInstanceNode {
  const maxDepth = typeof opts?.maxDepth === 'number' && opts.maxDepth > 0 ? Math.floor(opts.maxDepth) : 32;
  const maxNodes = typeof opts?.maxNodes === 'number' && opts.maxNodes > 0 ? Math.floor(opts.maxNodes) : 2_000;

  let seen = 0;

  function norm(node: unknown, depth: number): WidgetInstanceNode {
    if (depth > maxDepth) {
      return { id: nanoid(), type: 'Box', props: { error: 'max_depth_exceeded' }, children: [] };
    }
    if (seen++ > maxNodes) {
      return { id: nanoid(), type: 'Box', props: { error: 'max_nodes_exceeded' }, children: [] };
    }
    const rec = isRecord(node) ? node : {};
    const idRaw = rec.id;
    const typeRaw = rec.type;
    const propsRaw = rec.props;
    const childrenRaw = rec.children;

    const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : nanoid();
    const type = typeof typeRaw === 'string' && typeRaw.trim() ? typeRaw.trim() : 'Box';
    const props = isRecord(propsRaw) ? propsRaw : {};
    const children = Array.isArray(childrenRaw) ? childrenRaw.map((c) => norm(c, depth + 1)) : undefined;

    const out: WidgetInstanceNode = {
      id,
      type,
      props,
      ...(children ? { children } : null),
    };

    if (isRecord(rec.bindings)) (out as unknown as { bindings: Record<string, unknown> }).bindings = rec.bindings;
    if (isRecord(rec.handlers)) (out as unknown as { handlers: Record<string, unknown> }).handlers = rec.handlers;
    if (isRecord(rec.permissions)) (out as unknown as { permissions: Record<string, unknown> }).permissions = rec.permissions;

    return out;
  }

  return norm(input, 0);
}

export class ViewRepository extends BaseRepository {
  constructor() {
    super('ViewRepository');
  }

  /**
   * Returns the persisted `views.root` value as stored in the database (structure-only after migration 132).
   * This does not hydrate from view_widgets.
   */
  async getPersistedRootById(id: string): Promise<unknown | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<{ root: unknown }>('SELECT root FROM views WHERE id = $1', [id]);
        return record ? record.root : null;
      },
      'getPersistedRootById',
      'View',
      id
    );
  }

  /**
   * Persist a structure-only root (id + children) and clean up view_widgets that are no longer referenced.
   * Returns a hydrated ViewModel (full WidgetInstanceNode root).
   */
  async updateStructureRoot(id: string, structureRoot: unknown): Promise<ViewModel> {
    return this.executeWithErrorHandling(
      async () => {
        if (!isStructureNode(structureRoot)) {
          throw new Error('structureRoot must be { id, children? }');
        }
        const keepIds = collectStructureNodeIds(structureRoot);
        const connection = this.getConnection();
        const viewWidgetRepo = new ViewWidgetRepository();

        await connection.transaction(async (client: PoolClient) => {
          const res = await client.query(
            `UPDATE views
                SET root = $1::jsonb,
                    version = version + 1,
                    updated_at = NOW()
              WHERE id = $2`,
            [JSON.stringify(structureRoot), id]
          );
          if ((res.rowCount ?? 0) === 0) throw new NotFoundError('View', id);
          await viewWidgetRepo.deleteNotIn(id, keepIds, client);
        });

        const view = await this.findById(id);
        if (!view) throw new NotFoundError('View', id);
        return view;
      },
      'updateStructureRoot',
      'View',
      id
    );
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

        const root = normalizeRoot(data.root ?? { id: 'root', type: 'Box', props: {}, children: [] });
        const runtimeConfig = normalizeRuntimeConfig(data.runtimeConfig);
        const version = 1;

        const viewData: ViewModel = {
          id,
          name: data.name,
          slug,
          description: data.description,
          root,
          runtimeConfig,
          version,
          starshipId: data.starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await ViewEntity.validate(viewData, 'create');

        const viewEntity = toEntityInstance(ViewEntity, viewData as unknown as Record<string, unknown>);
        const databaseFormat = toDatabase(viewEntity);

        const { structureRoot, widgets } = dehydrateViewRoot(root);

        const connection = this.getConnection();
        const viewWidgetRepo = new ViewWidgetRepository();

        await connection.transaction(async (client: PoolClient) => {
          await client.query(
            `INSERT INTO views (
              id, name, slug, description, root, runtime_config, version,
              starship_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
            [
              databaseFormat.id,
              databaseFormat.name,
              databaseFormat.slug,
              databaseFormat.description,
              JSON.stringify(structureRoot),
              JSON.stringify(databaseFormat.runtime_config),
              databaseFormat.version,
              databaseFormat.starship_id,
              databaseFormat.created_at,
              databaseFormat.updated_at,
            ]
          );
          await viewWidgetRepo.upsertMany(id, widgets, client);
        });

        // Return the full view shape the client expects (hydrated root).
        return viewData;
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
        const view = fromDatabase(ViewEntity, record);
        const rootAny: unknown = (view as unknown as { root: unknown }).root;
        if (isFullWidgetNode(rootAny)) return view;
        if (!isStructureNode(rootAny)) return view;

        try {
          const viewWidgetRepo = new ViewWidgetRepository();
          const widgets = await viewWidgetRepo.listByView(view.id);
          const map = new Map<string, ViewWidgetRow>();
          for (const w of widgets) {
            map.set(w.nodeId, {
              nodeId: w.nodeId,
              type: w.type,
              props: w.props || {},
              ...(w.bindings ? { bindings: w.bindings } : null),
              ...(w.handlers ? { handlers: w.handlers } : null),
              ...(w.permissions ? { permissions: w.permissions } : null),
            });
          }
          (view as unknown as { root: unknown }).root = hydrateViewRoot(rootAny, map);
        } catch (e: unknown) {
          // If the view_widgets table doesn't exist yet, keep existing root as-is.
          const code = (e as { code?: string } | null | undefined)?.code;
          if (code !== '42P01') throw e;
        }

        return view;
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
        const record = await connection.queryOne<Record<string, unknown>>('SELECT * FROM views WHERE slug = $1 AND starship_id = $2', [
          slug,
          starshipId,
        ]);
        if (!record) return null;
        const view = fromDatabase(ViewEntity, record);
        const rootAny: unknown = (view as unknown as { root: unknown }).root;
        if (isFullWidgetNode(rootAny)) return view;
        if (!isStructureNode(rootAny)) return view;

        try {
          const viewWidgetRepo = new ViewWidgetRepository();
          const widgets = await viewWidgetRepo.listByView(view.id);
          const map = new Map<string, ViewWidgetRow>();
          for (const w of widgets) {
            map.set(w.nodeId, {
              nodeId: w.nodeId,
              type: w.type,
              props: w.props || {},
              ...(w.bindings ? { bindings: w.bindings } : null),
              ...(w.handlers ? { handlers: w.handlers } : null),
              ...(w.permissions ? { permissions: w.permissions } : null),
            });
          }
          (view as unknown as { root: unknown }).root = hydrateViewRoot(rootAny, map);
        } catch (e: unknown) {
          const code = (e as { code?: string } | null | undefined)?.code;
          if (code !== '42P01') throw e;
        }

        return view;
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
        // IMPORTANT: Always parameterize to avoid SQL injection patterns (even when validated upstream).
        // Preserve legacy behavior: only apply LIMIT/OFFSET when > 0 (ignore 0).
        const limit = params.limit == null ? null : Math.max(0, toFiniteInt(params.limit, 0));
        const offset = params.offset == null ? null : Math.max(0, toFiniteInt(params.offset, 0));

        const limitClause = typeof limit === 'number' && limit > 0 ? `LIMIT $${paramIndex++}` : '';
        if (typeof limit === 'number' && limit > 0) values.push(limit);

        const offsetClause = typeof offset === 'number' && offset > 0 ? `OFFSET $${paramIndex++}` : '';
        if (typeof offset === 'number' && offset > 0) values.push(offset);

        const connection = this.getConnection();
        const records = await connection.query<Record<string, unknown>>(
          `SELECT * FROM views ${whereClause} ORDER BY created_at DESC ${limitClause} ${offsetClause}`,
          values
        );

        const views = fromDatabaseArray(ViewEntity, records);
        const needsHydration = views.filter((v) => {
          const r: unknown = (v as unknown as { root: unknown }).root;
          return isStructureNode(r) && !isFullWidgetNode(r);
        });
        if (needsHydration.length === 0) return views;

        try {
          const viewWidgetRepo = new ViewWidgetRepository();
          const viewIds = needsHydration.map((v) => v.id);
          const widgets = await viewWidgetRepo.listByViews(viewIds);
          const byViewId = new Map<string, ViewWidgetRow[]>();
          for (const w of widgets) {
            const arr = byViewId.get(w.viewId) ?? [];
            arr.push({
              nodeId: w.nodeId,
              type: w.type,
              props: w.props || {},
              ...(w.bindings ? { bindings: w.bindings } : null),
              ...(w.handlers ? { handlers: w.handlers } : null),
              ...(w.permissions ? { permissions: w.permissions } : null),
            });
            byViewId.set(w.viewId, arr);
          }

          for (const v of needsHydration) {
            const rootAny: unknown = (v as unknown as { root: unknown }).root;
            if (!isStructureNode(rootAny)) continue;
            const rows = byViewId.get(v.id) ?? [];
            const map = new Map<string, ViewWidgetRow>();
            for (const r of rows) map.set(r.nodeId, r);
            (v as unknown as { root: unknown }).root = hydrateViewRoot(rootAny, map);
          }
        } catch (e: unknown) {
          const code = (e as { code?: string } | null | undefined)?.code;
          if (code !== '42P01') throw e;
        }

        return views;
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
        const updatedAt = new Date().toISOString();
        const root = data.root !== undefined ? normalizeRoot(data.root) : undefined;
        const runtimeConfig = data.runtimeConfig !== undefined ? normalizeRuntimeConfig(data.runtimeConfig) : undefined;
        const version = data.version !== undefined ? Math.max(1, toFiniteInt(data.version, 1)) : undefined;

        const updatedData: Partial<ViewModel> = {
          ...(data.name !== undefined ? { name: data.name } : null),
          ...(data.description !== undefined ? { description: data.description } : null),
          ...(root !== undefined ? { root } : null),
          ...(runtimeConfig !== undefined ? { runtimeConfig } : null),
          ...(version !== undefined ? { version } : null),
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
        let dehydrate: { structureRoot: unknown; widgets: ViewWidgetRow[]; keepIds: string[] } | null = null;
        if (root !== undefined) {
          const d = dehydrateViewRoot(root);
          dehydrate = { structureRoot: d.structureRoot, widgets: d.widgets, keepIds: collectStructureNodeIds(d.structureRoot) };
          updates.push(`root = $${paramIndex++}`);
          values.push(JSON.stringify(d.structureRoot));
        }
        if (runtimeConfig !== undefined) {
          updates.push(`runtime_config = $${paramIndex++}`);
          values.push(JSON.stringify(runtimeConfig));
        }
        if (version !== undefined) {
          updates.push(`version = $${paramIndex++}`);
          values.push(version);
        }

        updates.push(`updated_at = $${paramIndex++}`);
        values.push(updatedAt);
        values.push(id);

        const connection = this.getConnection();
        const viewWidgetRepo = new ViewWidgetRepository();

        const updatedView = await connection.transaction(async (client: PoolClient) => {
          const res = await client.query(`UPDATE views SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values);
          const record = res.rows?.[0] as Record<string, unknown> | undefined;
          if (!record) throw new NotFoundError('View', id);

          if (dehydrate) {
            await viewWidgetRepo.upsertMany(id, dehydrate.widgets, client);
            await viewWidgetRepo.deleteNotIn(id, dehydrate.keepIds, client);
          }

          return fromDatabase(ViewEntity, record);
        });

        // Ensure callers always see the hydrated root.
        if (root !== undefined) {
          (updatedView as unknown as { root: unknown }).root = root;
        }
        return updatedView;
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
