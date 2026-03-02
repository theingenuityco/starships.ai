import type { StarshipDatasetColumn, StarshipDatasetModel } from '@starships/protocol';
import { getConnection, StarshipDatasetRepository } from '@starships/models';
import { coerceBoolean as toBool, isPlainObject, toIsoDateOnly, toIsoInstant } from '@/utils/value-coercion';

type RefValue =
  | { kind: 'dataset_row'; datasetIdOrSlug: string; key: string; label?: string; url?: string }
  | { kind: 'task_card'; cardId: string; label?: string; url?: string };

function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      return isPlainObject(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isRefValue(value: unknown): value is RefValue {
  if (!isPlainObject(value)) return false;
  const rec = value as Record<string, unknown>;
  const kind = typeof rec['kind'] === 'string' ? rec['kind'].trim() : '';
  if (kind === 'dataset_row') {
    return typeof rec['datasetIdOrSlug'] === 'string' && typeof rec['key'] === 'string';
  }
  if (kind === 'task_card') {
    return typeof rec['cardId'] === 'string';
  }
  return false;
}

type Op = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '!';

type Token =
  | { t: 'number'; v: number }
  | { t: 'string'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: Op }
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
    // Two-char operators
    const two = s.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      out.push({ t: 'op', v: two as Op });
      i += 2;
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
    // One-char operators
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '<' || c === '>' || c === '!') {
      out.push({ t: 'op', v: c as Op });
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
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'var'; n: string }
  | { k: 'bin'; op: Exclude<Op, '!'>; l: Ast; r: Ast }
  | { k: 'call'; fn: string; args: Ast[] }
  | { k: 'neg'; e: Ast }
  | { k: 'not'; e: Ast };

type BinOp = Extract<Ast, { k: 'bin' }>['op'];

function parse(expr: string): Ast {
  const tokens = tokenize(expr);
  if (tokens.length > 10_000) throw new Error('Expression too complex');
  let pos = 0;
  let depth = 0;
  const MAX_PARSE_DEPTH = 300;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (t: Token['t']) => {
    const tok = take();
    if (!tok || tok.t !== t) throw new Error(`Expected ${t}`);
    return tok;
  };

  function parsePrimary(): Ast {
    depth += 1;
    if (depth > MAX_PARSE_DEPTH) throw new Error('Expression too deeply nested');
    try {
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
        if (ident === 'true') return { k: 'bool', v: true };
        if (ident === 'false') return { k: 'bool', v: false };
        if (ident === 'null') return { k: 'null' };
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
      if (tok.t === 'op' && tok.v === '!') {
        take();
        return { k: 'not', e: parsePrimary() };
      }
      throw new Error('Unexpected token');
    } finally {
      depth -= 1;
    }
  }

  function parseMulDiv(): Ast {
    let node = parsePrimary();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '*' && tok.v !== '/' && tok.v !== '%')) break;
      take();
      node = { k: 'bin', op: tok.v as BinOp, l: node, r: parsePrimary() };
    }
    return node;
  }

  function parseAddSub(): Ast {
    let node = parseMulDiv();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '+' && tok.v !== '-')) break;
      take();
      node = { k: 'bin', op: tok.v, l: node, r: parseMulDiv() };
    }
    return node;
  }

  function parseRelational(): Ast {
    let node = parseAddSub();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '<' && tok.v !== '<=' && tok.v !== '>' && tok.v !== '>=')) break;
      take();
      node = { k: 'bin', op: tok.v as BinOp, l: node, r: parseAddSub() };
    }
    return node;
  }

  function parseEquality(): Ast {
    let node = parseRelational();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '==' && tok.v !== '!=')) break;
      take();
      node = { k: 'bin', op: tok.v as BinOp, l: node, r: parseRelational() };
    }
    return node;
  }

  function parseAnd(): Ast {
    let node = parseEquality();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || tok.v !== '&&') break;
      take();
      node = { k: 'bin', op: '&&', l: node, r: parseEquality() };
    }
    return node;
  }

  function parseOr(): Ast {
    let node = parseAnd();
    while (true) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || tok.v !== '||') break;
      take();
      node = { k: 'bin', op: '||', l: node, r: parseAnd() };
    }
    return node;
  }

  function parseExpr(): Ast {
    return parseOr();
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

function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function toTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v !== 0 : false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

type FormulaResultType = NonNullable<StarshipDatasetColumn['formula']>['resultType'];

function coerceFormulaResultType(value: unknown, resultType: FormulaResultType | undefined): unknown {
  if (!resultType) return value;
  if (value === null || value === undefined) return null;
  if (resultType === 'string') return String(value);
  if (resultType === 'number') return toNumberish(value);
  if (resultType === 'boolean') return toBool(value);
  if (resultType === 'date') return toIsoDateOnly(value);
  if (resultType === 'datetime') return toIsoInstant(value);
  if (resultType === 'json') return value;
  if (resultType === 'enum') return String(value);
  return value;
}

class LookupCache {
  private readonly starshipId: string;
  private readonly datasetRepo: StarshipDatasetRepository;
  private datasetIdByIdOrSlug = new Map<string, { id: string; primaryKey: string | null } | null>();
  private rowCache = new Map<string, Record<string, unknown> | null>(); // key = `${datasetId}:${rowKey}`
  private taskCache = new Map<string, Record<string, unknown> | null>(); // key = cardId
  private pendingDatasetRowKeysByDatasetId = new Map<string, Set<string>>();

  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly NANOID_RE = /^[a-z0-9_-]{6,64}$/i;

  constructor(starshipId: string) {
    this.starshipId = starshipId;
    this.datasetRepo = new StarshipDatasetRepository();
  }

  async resolveDatasetId(datasetIdOrSlug: string): Promise<{ id: string; primaryKey: string | null } | null> {
    const key = String(datasetIdOrSlug || '').trim();
    if (!key) return null;
    if (this.datasetIdByIdOrSlug.has(key)) return this.datasetIdByIdOrSlug.get(key) ?? null;

    // Slugs often match our nanoid-shaped ID regex, so attempt ID first,
    // then fall back to slug lookup when not found.
    const looksLikeId = LookupCache.UUID_RE.test(key) || LookupCache.NANOID_RE.test(key);
    let ds = looksLikeId ? await this.datasetRepo.findById(key) : null;
    if (!ds) ds = await this.datasetRepo.findBySlug(key, this.starshipId);
    if (!ds || String(ds.starshipId) !== String(this.starshipId)) {
      this.datasetIdByIdOrSlug.set(key, null);
      return null;
    }
    const val = { id: ds.id, primaryKey: (ds.primaryKey ?? null) as string | null };
    this.datasetIdByIdOrSlug.set(key, val);
    return val;
  }

  async queueDatasetRowPrefetch(datasetIdOrSlug: string, rowKey: string): Promise<void> {
    const resolved = await this.resolveDatasetId(datasetIdOrSlug);
    if (!resolved) return;
    if (!resolved.primaryKey || !String(resolved.primaryKey).trim()) return;
    const rk = String(rowKey || '').trim();
    if (!rk) return;
    const set = this.pendingDatasetRowKeysByDatasetId.get(resolved.id) ?? new Set<string>();
    set.add(rk);
    this.pendingDatasetRowKeysByDatasetId.set(resolved.id, set);
  }

  async flushQueuedDatasetRowPrefetch(): Promise<void> {
    if (this.pendingDatasetRowKeysByDatasetId.size === 0) return;
    const conn = getConnection();
    const entries = Array.from(this.pendingDatasetRowKeysByDatasetId.entries());
    this.pendingDatasetRowKeysByDatasetId.clear();

    for (const [dsId, keySet] of entries) {
      const keys = Array.from(keySet).filter(Boolean);
      if (keys.length === 0) continue;
      const rows = await conn.query<{ row_key: string; data: unknown }>(
        `
          SELECT row_key, data_json AS data
          FROM starship_dataset_rows
          WHERE dataset_id = $1 AND row_key = ANY($2::text[])
        `,
        [dsId, keys]
      );

      for (const r of rows) {
        const rk = String(r.row_key || '').trim();
        if (!rk) continue;
        const cacheKey = `${dsId}:${rk}`;
        if (this.rowCache.has(cacheKey)) continue;
        this.rowCache.set(cacheKey, coerceJsonRecord(r.data));
      }

      // Cache misses as null so subsequent lookups don't re-query.
      for (const rk of keys) {
        const cacheKey = `${dsId}:${rk}`;
        if (!this.rowCache.has(cacheKey)) this.rowCache.set(cacheKey, null);
      }
    }
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
      const r = await conn.queryOne<{ data: unknown }>(
        `SELECT data_json AS data FROM starship_dataset_rows WHERE dataset_id = $1 AND row_key = $2 LIMIT 1`,
        [dsId, rk]
      );
      this.rowCache.set(cacheKey, coerceJsonRecord(r?.data));
    }
    const rec = this.rowCache.get(cacheKey);
    if (!rec) return null;
    const f = String(fieldName || '').trim();
    return f ? rec[f] : null;
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
    return f ? rec[f] : null;
  }
}

async function evalAst(
  ast: Ast,
  ctx: Record<string, unknown>,
  lookup: LookupCache,
  opts?: { allowDbLookups?: boolean }
): Promise<unknown> {
  const allowDbLookups = opts?.allowDbLookups !== false;

  const e = async (node: Ast): Promise<unknown> => {
    if (node.k === 'num') return node.v;
    if (node.k === 'str') return node.v;
    if (node.k === 'bool') return node.v;
    if (node.k === 'null') return null;
    if (node.k === 'var') return ctx[node.n];
    if (node.k === 'neg') {
      const v = await e(node.e);
      const n = toNumberish(v);
      return n === null ? null : -n;
    }
    if (node.k === 'not') {
      const v = await e(node.e);
      return !toTruthy(v);
    }
    if (node.k === 'bin') {
      if (node.op === '&&') {
        const l = await e(node.l);
        if (!toTruthy(l)) return false;
        const r = await e(node.r);
        return toTruthy(r);
      }
      if (node.op === '||') {
        const l = await e(node.l);
        if (toTruthy(l)) return true;
        const r = await e(node.r);
        return toTruthy(r);
      }

      const l = await e(node.l);
      const r = await e(node.r);

      if (node.op === '==' || node.op === '!=') {
        const ln = toNumberish(l);
        const rn = toNumberish(r);
        const eq =
          ln !== null && rn !== null
            ? ln === rn
            : String(l ?? '').trim().toLowerCase() === String(r ?? '').trim().toLowerCase();
        return node.op === '==' ? eq : !eq;
      }

      if (node.op === '<' || node.op === '<=' || node.op === '>' || node.op === '>=') {
        const ln = toNumberish(l);
        const rn = toNumberish(r);
        if (ln !== null && rn !== null) {
          if (node.op === '<') return ln < rn;
          if (node.op === '<=') return ln <= rn;
          if (node.op === '>') return ln > rn;
          if (node.op === '>=') return ln >= rn;
        }
        const ls = String(l ?? '');
        const rs = String(r ?? '');
        if (node.op === '<') return ls < rs;
        if (node.op === '<=') return ls <= rs;
        if (node.op === '>') return ls > rs;
        if (node.op === '>=') return ls >= rs;
      }

      const ln = toNumberish(l);
      const rn = toNumberish(r);
      if (ln === null || rn === null) return null;
      if (node.op === '+') return ln + rn;
      if (node.op === '-') return ln - rn;
      if (node.op === '*') return ln * rn;
      if (node.op === '/') return rn === 0 ? null : ln / rn;
      if (node.op === '%') return rn === 0 ? null : ln % rn;
      return null;
    }
    if (node.k === 'call') {
      const fn = String(node.fn || '').trim();
      if (fn === 'coalesce') {
        for (const a of node.args) {
          const v = await e(a);
          if (!isBlankValue(v)) return v;
        }
        return null;
      }
      if (fn === 'isNull') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return v === null || v === undefined;
      }
      if (fn === 'isBlank') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return isBlankValue(v);
      }
      if (fn === 'if') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const cond = await e(a0);
        if (toTruthy(cond)) return await e(a1);
        const a2 = node.args[2];
        return a2 ? await e(a2) : null;
      }
      if (fn === 'not') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return !toTruthy(v);
      }
      if (fn === 'and') {
        for (const a of node.args) {
          const v = await e(a);
          if (!toTruthy(v)) return false;
        }
        return true;
      }
      if (fn === 'or') {
        for (const a of node.args) {
          const v = await e(a);
          if (toTruthy(v)) return true;
        }
        return false;
      }
      if (fn === 'toNumber') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return toNumberish(v);
      }
      if (fn === 'toString') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return v === null || v === undefined ? null : String(v);
      }
      if (fn === 'toBoolean') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        return toBool(v);
      }
      if (fn === 'abs') {
        const a0 = node.args[0];
        if (!a0) return null;
        const x = toNumberish(await e(a0));
        return x === null ? null : Math.abs(x);
      }
      if (fn === 'ceil') {
        const a0 = node.args[0];
        if (!a0) return null;
        const x = toNumberish(await e(a0));
        return x === null ? null : Math.ceil(x);
      }
      if (fn === 'floor') {
        const a0 = node.args[0];
        if (!a0) return null;
        const x = toNumberish(await e(a0));
        return x === null ? null : Math.floor(x);
      }
      if (fn === 'round') {
        const a0 = node.args[0];
        if (!a0) return null;
        const x = toNumberish(await e(a0));
        const a1 = node.args[1];
        const digits = a1 ? toNumberish(await e(a1)) ?? 0 : 0;
        if (x === null) return null;
        const d = Math.max(0, Math.min(20, Math.floor(digits)));
        const p = Math.pow(10, d);
        return Math.round(x * p) / p;
      }
      if (fn === 'sqrt') {
        const a0 = node.args[0];
        if (!a0) return null;
        const x = toNumberish(await e(a0));
        return x === null || x < 0 ? null : Math.sqrt(x);
      }
      if (fn === 'pow') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const a = toNumberish(await e(a0));
        const b = toNumberish(await e(a1));
        if (a === null || b === null) return null;
        const v = Math.pow(a, b);
        return Number.isFinite(v) ? v : null;
      }
      if (fn === 'min') {
        const nums: number[] = [];
        for (const a of node.args) {
          const n = toNumberish(await e(a));
          if (n === null) continue;
          nums.push(n);
        }
        return nums.length > 0 ? Math.min(...nums) : null;
      }
      if (fn === 'max') {
        const nums: number[] = [];
        for (const a of node.args) {
          const n = toNumberish(await e(a));
          if (n === null) continue;
          nums.push(n);
        }
        return nums.length > 0 ? Math.max(...nums) : null;
      }
      if (fn === 'clamp') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        const a2 = node.args[2];
        if (!a0 || !a1 || !a2) return null;
        const x = toNumberish(await e(a0));
        const lo = toNumberish(await e(a1));
        const hi = toNumberish(await e(a2));
        if (x === null || lo === null || hi === null) return null;
        return Math.min(hi, Math.max(lo, x));
      }
      if (fn === 'sum') {
        let acc = 0;
        let any = false;
        for (const a of node.args) {
          const n = toNumberish(await e(a));
          if (n === null) continue;
          any = true;
          acc += n;
        }
        return any ? acc : null;
      }
      if (fn === 'avg') {
        let acc = 0;
        let cnt = 0;
        for (const a of node.args) {
          const n = toNumberish(await e(a));
          if (n === null) continue;
          acc += n;
          cnt += 1;
        }
        return cnt > 0 ? acc / cnt : null;
      }
      if (fn === 'length') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        return String(v).length;
      }
      if (fn === 'lower') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        return String(v).toLowerCase();
      }
      if (fn === 'upper') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        return String(v).toUpperCase();
      }
      if (fn === 'trim') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        return String(v).trim();
      }
      if (fn === 'concat') {
        const parts: string[] = [];
        for (const a of node.args) {
          const v = await e(a);
          if (v === null || v === undefined) continue;
          parts.push(String(v));
        }
        return parts.join('');
      }
      if (fn === 'substring') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        const s = String(v);
        const start = toNumberish(await e(a1)) ?? 0;
        const a2 = node.args[2];
        const len = a2 ? toNumberish(await e(a2)) : null;
        const st = Math.max(0, Math.floor(start));
        if (len === null) return s.slice(st);
        return s.slice(st, st + Math.max(0, Math.floor(len)));
      }
      if (fn === 'replace') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        const a2 = node.args[2];
        if (!a0 || !a1 || !a2) return null;
        const v = await e(a0);
        if (v === null || v === undefined) return null;
        const s = String(v);
        const from = String((await e(a1)) ?? '');
        const to = String((await e(a2)) ?? '');
        if (!from) return s;
        return s.split(from).join(to);
      }
      if (fn === 'startsWith') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const s = await e(a0);
        const prefix = await e(a1);
        if (s === null || s === undefined) return null;
        return String(s).startsWith(String(prefix ?? ''));
      }
      if (fn === 'endsWith') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const s = await e(a0);
        const suffix = await e(a1);
        if (s === null || s === undefined) return null;
        return String(s).endsWith(String(suffix ?? ''));
      }
      if (fn === 'includes') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const s = await e(a0);
        const part = await e(a1);
        if (s === null || s === undefined) return null;
        return String(s).includes(String(part ?? ''));
      }
      if (fn === 'now') return Date.now();
      if (fn === 'toMs') {
        const a0 = node.args[0];
        if (!a0) return null;
        const v = await e(a0);
        const d = new Date(String(v ?? ''));
        return Number.isNaN(d.getTime()) ? null : d.getTime();
      }
      if (fn === 'diffDays') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const a = new Date(String((await e(a0)) ?? ''));
        const b = new Date(String((await e(a1)) ?? ''));
        if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
        const ms = b.getTime() - a.getTime();
        return ms / (1000 * 60 * 60 * 24);
      }
      if (fn === 'lookupDataset') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        const a2 = node.args[2];
        if (!a0 || !a1 || !a2) return null;
        const ds = String((await e(a0)) ?? '');
        const key = String((await e(a1)) ?? '');
        const field = String((await e(a2)) ?? '');
        if (!allowDbLookups) {
          await lookup.queueDatasetRowPrefetch(ds, key);
          return null;
        }
        return await lookup.lookupDatasetField(ds, key, field);
      }
      if (fn === 'lookupTask') {
        const a0 = node.args[0];
        const a1 = node.args[1];
        if (!a0 || !a1) return null;
        const cardId = String((await e(a0)) ?? '');
        const field = String((await e(a1)) ?? '');
        return await lookup.lookupTaskField(cardId, field);
      }
      throw new Error(`Unknown function: ${fn}`);
    }
    return null;
  };

  return await e(ast);
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

    const formulaSpecs: Array<{
      name: string;
      resultType: FormulaResultType | undefined;
      ast: Ast | null;
    }> = [];
    for (const c of cols) {
      if (c?.type !== 'formula') continue;
      const name = String(c.name || '').trim();
      const expr = String(c.formula?.expr || '').trim();
      if (!name || !expr) continue;
      try {
        formulaSpecs.push({ name, resultType: c.formula?.resultType, ast: parse(expr) });
      } catch {
        formulaSpecs.push({ name, resultType: c.formula?.resultType, ast: null });
      }
    }

    // Collect refs for optional hydration.
    const datasetRowRefs: Array<{ datasetIdOrSlug: string; key: string; labelColumn?: string }> = [];
    const taskRefs: Array<{ cardId: string }> = [];
    if (expandRefs) {
      for (const row of args.rows) {
        for (const c of cols) {
          if (c?.type !== 'reference') continue;
          const name = String(c.name || '').trim();
          if (!name) continue;
          const v = row[name];
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
          const rows = await conn.query<{ row_key: string; data: unknown }>(
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
            const data = coerceJsonRecord(r.data) ?? {};
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
          const v = row[name];
          if (!isRefValue(v)) continue;
          if (v.kind === 'task_card') {
            const m = taskLabel.get(String(v.cardId || '').trim());
            if (m?.label) v.label = m.label;
          }
          if (v.kind === 'dataset_row') {
            const m = datasetRowLabel.get(`${String(v.datasetIdOrSlug || '').trim()}:${String(v.key || '').trim()}`);
            if (m?.label) v.label = m.label;
          }
        }
      }

      out.push(row);
    }

    if (formulaSpecs.length > 0) {
      // Pass 1: queue dataset rows referenced by lookupDataset(...) without issuing per-row DB queries.
      for (const ctx of out) {
        for (const f of formulaSpecs) {
          if (!f.ast) continue;
          try {
            await evalAst(f.ast, ctx, lookup, { allowDbLookups: false });
          } catch {
            // best-effort prefetch only
          }
        }
      }
      await lookup.flushQueuedDatasetRowPrefetch();

      // Pass 2: compute formulas (now mostly served from cache).
      for (const ctx of out) {
        for (const f of formulaSpecs) {
          try {
            if (!f.ast) {
              ctx[f.name] = null;
              continue;
            }
            const v = await evalAst(f.ast, ctx, lookup, { allowDbLookups: true });
            const coerced = coerceFormulaResultType(v, f.resultType);
            ctx[f.name] = coerced === undefined ? null : coerced;
          } catch {
            ctx[f.name] = null;
          }
        }
      }
    }

    return out;
  }
}

export default DatasetRowProjector;

