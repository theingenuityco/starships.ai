import type { Client } from 'pg';

type ViewRow = { id: string; root: unknown };

type FullNode = {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  children?: FullNode[];
  bindings?: Record<string, unknown>;
  handlers?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

type StructureNode = { id: string; children?: StructureNode[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function parseJsonIfString(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

function isFullWidgetNode(root: unknown): boolean {
  const r = parseJsonIfString(root);
  if (!isRecord(r)) return false;
  return typeof r.type === 'string' && isRecord(r.props);
}

function toStructure(node: FullNode): StructureNode {
  const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : 'root';
  const children = Array.isArray(node.children) ? node.children.map(toStructure) : undefined;
  return { id, ...(children && children.length > 0 ? { children } : null) };
}

function walk(node: FullNode, out: Array<{ nodeId: string; type: string; props: unknown; bindings?: unknown; handlers?: unknown; permissions?: unknown }>) {
  const nodeId = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : 'root';
  const type = typeof node.type === 'string' && node.type.trim() ? node.type.trim() : 'Box';
  const props = isRecord(node.props) ? node.props : {};
  const bindings = isRecord(node.bindings) ? node.bindings : undefined;
  const handlers = isRecord(node.handlers) ? node.handlers : undefined;
  const permissions = isRecord(node.permissions) ? node.permissions : undefined;

  out.push({ nodeId, type, props, ...(bindings ? { bindings } : null), ...(handlers ? { handlers } : null), ...(permissions ? { permissions } : null) });

  if (Array.isArray(node.children)) {
    for (const c of node.children) walk(c, out);
  }
}

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

async function upsertWidgets(client: Client, viewId: string, rows: Array<{ nodeId: string; type: string; props: unknown; bindings?: unknown; handlers?: unknown; permissions?: unknown }>) {
  const chunkSize = 250;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk
      .map((r, idx) => {
        const base = idx * 7;
        values.push(viewId, r.nodeId, r.type, JSON.stringify(r.props ?? {}), JSON.stringify(r.bindings ?? null), JSON.stringify(r.handlers ?? null), JSON.stringify(r.permissions ?? null));
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4}::jsonb,$${base + 5}::jsonb,$${base + 6}::jsonb,$${base + 7}::jsonb)`;
      })
      .join(',');

    await client.query(
      `
        INSERT INTO view_widgets (view_id, node_id, type, props, bindings, handlers, permissions)
        VALUES ${tuples}
        ON CONFLICT (view_id, node_id) DO UPDATE SET
          type = EXCLUDED.type,
          props = EXCLUDED.props,
          bindings = EXCLUDED.bindings,
          handlers = EXCLUDED.handlers,
          permissions = EXCLUDED.permissions,
          updated_at = NOW()
      `,
      values
    );
  }
}

/**
 * Migration 132: Backfill view_widgets from existing views.root
 *
 * Converts each view.root from a full widget tree to a structure-only tree:
 * - views.root: { id, children[] }
 * - view_widgets: one row per node containing { type, props, bindings, handlers, permissions }
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Update default root to structure-only for new rows.
    await client.query(`ALTER TABLE views ALTER COLUMN root SET DEFAULT '{"id":"root","children":[]}'::jsonb;`);

    const viewsRes = await client.query('SELECT id, root FROM views ORDER BY created_at ASC');
    const views = toRows<ViewRow>(viewsRes);
    for (const v of views) {
      const rootRaw = parseJsonIfString(v.root);
      if (!isFullWidgetNode(rootRaw)) {
        // Already structure-only (or invalid) — skip.
        continue;
      }
      const full = rootRaw as FullNode;
      const widgetRows: Array<{ nodeId: string; type: string; props: unknown; bindings?: unknown; handlers?: unknown; permissions?: unknown }> = [];
      walk(full, widgetRows);
      await upsertWidgets(client, v.id, widgetRows);

      const structure: StructureNode = toStructure(full);
      await client.query(`UPDATE views SET root = $1::jsonb, updated_at = NOW() WHERE id = $2;`, [JSON.stringify(structure), v.id]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  // Non-destructive down: we don't attempt to rebuild the full root tree.
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

