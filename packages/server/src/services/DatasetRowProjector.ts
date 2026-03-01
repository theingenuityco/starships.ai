import type { StarshipDatasetColumn, StarshipDatasetModel } from '@starships/protocol';
import { getConnection, StarshipDatasetRepository } from '@starships/models';

type RefValue =
  | { kind: 'dataset_row'; datasetIdOrSlug: string; key: string; label?: string; url?: string }
  | { kind: 'task_card'; cardId: string; label?: string; url?: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isRefValue(value: unknown): value is RefValue {
  if (!isPlainObject(value)) return false;
  const kind = String((value as any).kind || '').trim();
  if (kind === 'dataset_row') {
    return typeof (value as any).datasetIdOrSlug === 'string' && typeof (value as any).key === 'string';
  }
  if (kind === 'task_card') {
    return typeof (value as any).cardId === 'string';
  }
  return false;
}

type Token =
  | { t: 'number'; v: number }
  | { t: 'string'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'comma' };

function tokenize(expr: string): Token[] {
  const s = String(expr ?? '');
  const out: Token[] = [];
  let i = 0;

  const isWs = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t';
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  const isIdent = (c: string) => isIdentStart(c) || isDigit(c);

  while (i < s.length) {
    const c = s[i] as string;
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ t: 'comma' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let buf = '';
      while (i < s.length) {
        const ch = s[i] as string;
        if (ch === '\\') {
          const next = s[i + 1];
          if (next === undefined) break;
          buf += next;
          i += 2;
          continue;
        }
        if (ch === quote) {
          i++;
          break;
        }
        buf += ch;
        i++;
      }
      out.push({ t: 'string', v: buf });
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1] || ''))) {
      let j = i;
      while (j < s.length && (isDigit(s[j] as string) || (s[j] as string) === '.')) j++;
      const raw = s.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error('Invalid number');
      out.push({ t: 'number', v: n });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < s.length && isIdent(s[j] as string)) j++;
      out.push({ t: 'ident', v: s.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character: ${c}`);
  }
  return out;
}

type Ast =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'var'; n: string }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Ast; r: Ast }
  | { k: 'call'; fn: string; args: Ast[] }
  | { k: 'neg'; e: Ast };

function parse(expr: string): Ast {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (t: Token['t']) => {
    const tok = take();
    if (!tok || tok.t !== t) throw new Error(`Expected ${t}`);
    return tok;
  };

  function parsePrimary(): Ast {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end');
    if (tok.t === 'number') {
      take();
      return { k: 'num', v: tok.v };
    }
    if (tok.t === 'string') {
      take();
      return { k: 'str', v: tok.v };
    }
    if (tok.t === 'ident') {
      take();
      const ident = tok.v;
      const next = peek();
      if (next && next.t === 'lparen') {
        take(); // (
        const args: Ast[] = [];
        if (peek() && peek()!.t !== 'rparen') {
          while (true) {
            args.push(parseExpr());
            if (peek() && peek()!.t === 'comma') {
              take();
              continue;
            }
            break;
          }
        }
        expect('rparen');
        return { k: 'call', fn: ident, args };
      }
      if (ident === 'true') return { k: 'num', v: 1 };
      if (ident === 'false') return { k: 'num', v: 0 };
      return { k: 'var', n: ident };
    }
    if (tok.t === 'lparen') {
      take();
      const inner = parseExpr();
      expect('rparen');
      return inner;
    }
    if (tok.t === 'op' && tok.v === '-') {
      take();
      return { k: 'neg', e: parsePrimary() };
    }
    throw new Error('Unexpected token');
  }

  function parseMulDiv(): Ast {
    let node = parsePrimary();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '*' && tok.v !== '/')) break;
      take();
      node = { k: 'bin', op: tok.v, l: node, r: parsePrimary() };
    }
    return node;
  }

  function parseExpr(): Ast {
    let node = parseMulDiv();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '+' && tok.v !== '-')) break;
      take();
      node = { k: 'bin', op: tok.v, l: node, r: parseMulDiv() };
    }
    return node;
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error('Unexpected trailing tokens');
  return ast;
}

function toNumberish(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

class LookupCache {
  private readonly starshipId: string;
  private readonly datasetRepo: StarshipDatasetRepository;
  private datasetIdByIdOrSlug = new Map<string, { id: string; primaryKey: string | null }>();
  private rowCache = new Map<string, Record<string, unknown> | null>(); // key = `${datasetId}:${rowKey}`
  private taskCache = new Map<string, Record<string, unknown> | null>(); // key = cardId

  constructor(starshipId: string) {
    this.starshipId = starshipId;
    this.datasetRepo = new StarshipDatasetRepository();
  }

  async resolveDatasetId(datasetIdOrSlug: string): Promise<{ id: string; primaryKey: string | null } | null> {
    const key = String(datasetIdOrSlug || '').trim();
    if (!key) return null;
    if (this.datasetIdByIdOrSlug.has(key)) return this.datasetIdByIdOrSlug.get(key) as any;

    const ds = /^[a-z0-9_-]{10,30}$/i.test(key) ? await this.datasetRepo.findById(key) : await this.datasetRepo.findBySlug(key, this.starshipId);
    if (!ds || String(ds.starshipId) !== String(this.starshipId)) {
      this.datasetIdByIdOrSlug.set(key, null as any);
      return null;
    }
    const val = { id: ds.id, primaryKey: (ds.primaryKey ?? null) as string | null };
    this.datasetIdByIdOrSlug.set(key, val);
    return val;
  }

  async lookupDatasetField(datasetIdOrSlug: string, rowKey: string, fieldName: string): Promise<unknown> {
    const resolved = await this.resolveDatasetId(datasetIdOrSlug);
    if (!resolved) return null;
    if (!resolved.primaryKey || !String(resolved.primaryKey).trim()) return null;

    const dsId = resolved.id;
    const rk = String(rowKey || '').trim();
    if (!rk) return null;
    const cacheKey = `${dsId}:${rk}`;
    if (!this.rowCache.has(cacheKey)) {
      const conn = getConnection();
      const r = await conn.queryOne<{ data: any }>(
        `SELECT data_json AS data FROM starship_dataset_rows WHERE dataset_id = $1 AND row_key = $2 LIMIT 1`,
        [dsId, rk]
      );
      this.rowCache.set(cacheKey, isPlainObject(r?.data) ? (r?.data as Record<string, unknown>) : null);
    }
    const rec = this.rowCache.get(cacheKey);
    if (!rec) return null;
    const f = String(fieldName || '').trim();
    return f ? (rec as any)[f] : null;
  }

  async lookupTaskField(cardId: string, fieldName: string): Promise<unknown> {
    const id = String(cardId || '').trim();
    if (!id) return null;
    if (!this.taskCache.has(id)) {
      const conn = getConnection();
      const r = await conn.queryOne<Record<string, unknown>>(
        `
          SELECT c.id, c.title, c.description, c.priority, c.column_id, c.board_id
          FROM task_cards c
          JOIN task_boards b ON b.id = c.board_id
          WHERE c.id = $1 AND b.starship_id = $2
          LIMIT 1
        `,
        [id, this.starshipId]
      );
      this.taskCache.set(id, r && typeof r === 'object' ? (r as Record<string, unknown>) : null);
    }
    const rec = this.taskCache.get(id);
    if (!rec) return null;
    const f = String(fieldName || '').trim();
    return f ? (rec as any)[f] : null;
  }
}

async function evalAst(ast: Ast, ctx: Record<string, unknown>, lookup: LookupCache): Promise<unknown> {
  if (ast.k === 'num') return ast.v;
  if (ast.k === 'str') return ast.v;
  if (ast.k === 'var') return (ctx as any)[ast.n];
  if (ast.k === 'neg') {
    const v = await evalAst(ast.e, ctx, lookup);
    const n = toNumberish(v);
    return n === null ? null : -n;
  }
  if (ast.k === 'bin') {
    const l = await evalAst(ast.l, ctx, lookup);
    const r = await evalAst(ast.r, ctx, lookup);
    const ln = toNumberish(l);
    const rn = toNumberish(r);
    if (ln === null || rn === null) return null;
    if (ast.op === '+') return ln + rn;
    if (ast.op === '-') return ln - rn;
    if (ast.op === '*') return ln * rn;
    if (ast.op === '/') return rn === 0 ? null : ln / rn;
    return null;
  }
  if (ast.k === 'call') {
    const fn = ast.fn;
    if (fn === 'coalesce') {
      for (const a of ast.args) {
        const v = await evalAst(a, ctx, lookup);
        if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) return v;
      }
      return null;
    }
    if (fn === 'round') {
      const x = toNumberish(await evalAst(ast.args[0] as any, ctx, lookup));
      const digits = toNumberish(await evalAst(ast.args[1] as any, ctx, lookup)) ?? 0;
      if (x === null) return null;
      const d = Math.max(0, Math.min(20, Math.floor(digits)));
      const p = Math.pow(10, d);
      return Math.round(x * p) / p;
    }
    if (fn === 'nowEpochMs') return Date.now();
    if (fn === 'toEpochMs') {
      const v = await evalAst(ast.args[0] as any, ctx, lookup);
      const d = new Date(String(v ?? ''));
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    if (fn === 'daysBetween') {
      const a = new Date(String(await evalAst(ast.args[0] as any, ctx, lookup) ?? ''));
      const b = new Date(String(await evalAst(ast.args[1] as any, ctx, lookup) ?? ''));
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
      const ms = b.getTime() - a.getTime();
      return ms / (1000 * 60 * 60 * 24);
    }
    if (fn === 'lookupDataset') {
      const ds = String(await evalAst(ast.args[0] as any, ctx, lookup) ?? '');
      const key = String(await evalAst(ast.args[1] as any, ctx, lookup) ?? '');
      const field = String(await evalAst(ast.args[2] as any, ctx, lookup) ?? '');
      return await lookup.lookupDatasetField(ds, key, field);
    }
    if (fn === 'lookupTask') {
      const cardId = String(await evalAst(ast.args[0] as any, ctx, lookup) ?? '');
      const field = String(await evalAst(ast.args[1] as any, ctx, lookup) ?? '');
      return await lookup.lookupTaskField(cardId, field);
    }
    throw new Error(`Unknown function: ${fn}`);
  }
  return null;
}

export class DatasetRowProjector {
  async project(args: {
    starshipId: string;
    dataset: Pick<StarshipDatasetModel, 'id' | 'starshipId' | 'columns' | 'primaryKey'>;
    rows: Array<Record<string, unknown>>;
    expandRefs?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    const expandRefs = Boolean(args.expandRefs);
    const cols = (args.dataset.columns ?? []) as StarshipDatasetColumn[];
    const lookup = new LookupCache(args.starshipId);

    // Collect refs for optional hydration.
    const datasetRowRefs: Array<{ datasetIdOrSlug: string; key: string; labelColumn?: string }> = [];
    const taskRefs: Array<{ cardId: string }> = [];
    if (expandRefs) {
      for (const row of args.rows) {
        for (const c of cols) {
          if (c?.type !== 'reference') continue;
          const name = String(c.name || '').trim();
          if (!name) continue;
          const v = (row as any)[name];
          if (!isRefValue(v)) continue;
          if (v.kind === 'dataset_row') datasetRowRefs.push({ datasetIdOrSlug: v.datasetIdOrSlug, key: v.key, labelColumn: c.reference?.labelColumn });
          if (v.kind === 'task_card') taskRefs.push({ cardId: v.cardId });
        }
      }
    }

    const datasetRowLabel = new Map<string, { label?: string; url?: string }>(); // key `${datasetIdOrSlug}:${rowKey}`
    const taskLabel = new Map<string, { label?: string; url?: string }>(); // key cardId

    if (expandRefs) {
      // Resolve task cards in batch.
      if (taskRefs.length > 0) {
        const ids = Array.from(new Set(taskRefs.map((r) => String(r.cardId || '').trim()).filter(Boolean)));
        if (ids.length > 0) {
          const conn = getConnection();
          const rows = await conn.query<{ id: string; title: string }>(
            `
              SELECT c.id, c.title
              FROM task_cards c
              JOIN task_boards b ON b.id = c.board_id
              WHERE c.id = ANY($1::text[]) AND b.starship_id = $2
            `,
            [ids, args.starshipId]
          );
          for (const r of rows) {
            const id = String(r.id || '').trim();
            if (!id) continue;
            taskLabel.set(id, { label: String(r.title || '').trim() || id });
          }
        }
      }

      // Resolve dataset rows in batch (grouped by resolved dataset id).
      const grouped = new Map<string, { datasetIdOrSlug: string; dsId: string; keys: Set<string>; labelColumn?: string }>();
      for (const r of datasetRowRefs) {
        const dsKey = String(r.datasetIdOrSlug || '').trim();
        const rk = String(r.key || '').trim();
        if (!dsKey || !rk) continue;
        const resolved = await lookup.resolveDatasetId(dsKey);
        if (!resolved) continue;
        // Only hydrate rows for datasets with a primaryKey (so row_key is meaningful).
        if (!resolved.primaryKey || !String(resolved.primaryKey).trim()) continue;
        const gk = `${dsKey}::${resolved.id}`;
        const existing = grouped.get(gk) ?? { datasetIdOrSlug: dsKey, dsId: resolved.id, keys: new Set<string>(), labelColumn: r.labelColumn };
        existing.keys.add(rk);
        if (!existing.labelColumn && r.labelColumn) existing.labelColumn = r.labelColumn;
        grouped.set(gk, existing);
      }

      if (grouped.size > 0) {
        const conn = getConnection();
        for (const g of grouped.values()) {
          const keys = Array.from(g.keys);
          if (keys.length === 0) continue;
          const rows = await conn.query<{ row_key: string; data: any }>(
            `
              SELECT row_key, data_json AS data
              FROM starship_dataset_rows
              WHERE dataset_id = $1 AND row_key = ANY($2::text[])
            `,
            [g.dsId, keys]
          );
          for (const r of rows) {
            const rk = String(r.row_key || '').trim();
            if (!rk) continue;
            const data = isPlainObject(r.data) ? (r.data as Record<string, unknown>) : {};
            const labelField = String(g.labelColumn || '').trim();
            const label =
              labelField && data[labelField] !== undefined && data[labelField] !== null ? String(data[labelField]) : rk;
            datasetRowLabel.set(`${g.datasetIdOrSlug}:${rk}`, { label });
          }
        }
      }
    }

    // Compute formulas + apply hydrated labels.
    const out: Array<Record<string, unknown>> = [];
    for (const raw of args.rows) {
      const row = isPlainObject(raw) ? { ...raw } : {};

      // Hydrate reference labels (non-persisted).
      if (expandRefs) {
        for (const c of cols) {
          if (c?.type !== 'reference') continue;
          const name = String(c.name || '').trim();
          if (!name) continue;
          const v = (row as any)[name];
          if (!isRefValue(v)) continue;
          if (v.kind === 'task_card') {
            const m = taskLabel.get(String(v.cardId || '').trim());
            if (m?.label) (v as any).label = m.label;
          }
          if (v.kind === 'dataset_row') {
            const m = datasetRowLabel.get(`${String(v.datasetIdOrSlug || '').trim()}:${String(v.key || '').trim()}`);
            if (m?.label) (v as any).label = m.label;
          }
        }
      }

      // Evaluate formulas in column order, adding results into the row.
      const ctx: Record<string, unknown> = row;
      for (const c of cols) {
        if (c?.type !== 'formula') continue;
        const name = String(c.name || '').trim();
        const expr = String(c.formula?.expr || '').trim();
        if (!name || !expr) continue;
        try {
          const ast = parse(expr);
          const v = await evalAst(ast, ctx, lookup);
          (ctx as any)[name] = v;
        } catch {
          (ctx as any)[name] = null;
        }
      }

      out.push(ctx);
    }

    return out;
  }
}

export default DatasetRowProjector;

