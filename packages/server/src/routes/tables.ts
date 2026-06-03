import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { verifyStarshipAccess, verifyStarshipAdminAccess } from '@/middleware/verify-starship-access';
import { sendError, sendSuccess, handleError } from '@/utils/responseHelpers';
import { coerceBoolean, isPlainObject, toIsoDateOnly, toIsoInstantWithOffset as toIsoInstant } from '@/utils/value-coercion';

import { StarshipTableRepository, StarshipTableRowRepository, getConnection } from '@starships/models';
import type { StarshipTableRecord, TableRef, TableRowFilter } from '@starships/models';
import type { StarshipDatasetColumn } from '@starships/protocol';

const router: Router = Router();

function requireAuthUserId(req: Request, res: Response): string | null {
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

type RowIssue = { index: number; column?: string; code: string; message: string };

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  return false;
}

const MAX_SCHEMA_REGEX_LENGTH = 256;
const MAX_SCHEMA_REGEX_TEST_INPUT_LENGTH = 10_000;

function isProbablyUnsafeRegex(pattern: string): boolean {
  const p = String(pattern ?? '');
  if (!p.trim()) return true;
  if (p.length > MAX_SCHEMA_REGEX_LENGTH) return true;
  if (p.includes('(?')) return true;
  if (/\\\d/.test(p)) return true;
  if (/\((?:[^()\\]|\\.)*?[+*{](?:[^()\\]|\\.)*?\)\s*(?:[+*?]|\{\s*\d+)/.test(p)) return true;
  if (/[+*?}]\s*(?:[+*?]|\{\s*\d+)/.test(p)) return true;
  return false;
}

function wantsAutoincrement(col: StarshipDatasetColumn): boolean {
  return Boolean(col?.constraints?.autoincrement);
}

/** Extract the soft-reference key (text) to store from an API reference value. */
function referenceKeyFor(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isPlainObject(value)) return null;
  const rec = value as Record<string, unknown>;
  const kind = String(rec['kind'] || '').trim();
  if (kind === 'task_card') {
    const cardId = String(rec['cardId'] || '').trim();
    return cardId || null;
  }
  // dataset_row or unspecified: use `key`.
  const key = String(rec['key'] || '').trim();
  return key || null;
}

/**
 * Light coercion + validation. The real table enforces types/NOT NULL/CHECK, but
 * we coerce JSON strings to typed values and surface friendly per-row errors.
 * References are stored as their soft text key. Formula columns no longer exist.
 */
function coerceValidateRow(args: {
  index: number;
  row: Record<string, unknown>;
  columns: StarshipDatasetColumn[];
}): { ok: true; data: Record<string, unknown> } | { ok: false; issues: RowIssue[] } {
  const { index, row, columns } = args;
  const issues: RowIssue[] = [];
  const out: Record<string, unknown> = { ...row };

  for (const col of columns) {
    const name = String(col?.name || '').trim();
    if (!name) continue;
    const type = col?.type;
    const constraints = (col?.constraints || {}) as Record<string, unknown>;

    if (!Object.prototype.hasOwnProperty.call(out, name) && Object.prototype.hasOwnProperty.call(constraints, 'default')) {
      out[name] = constraints['default'];
    }

    const required = Boolean(constraints['required']);
    const autoincrement = wantsAutoincrement(col);
    const nullable = Boolean(constraints['nullable']);

    const has = Object.prototype.hasOwnProperty.call(out, name);
    const value = has ? out[name] : undefined;

    if (required && isEmptyValue(value) && !autoincrement) {
      issues.push({ index, column: name, code: 'REQUIRED', message: 'Value is required' });
      continue;
    }
    if (value === null) {
      if (!nullable) issues.push({ index, column: name, code: 'NULL_NOT_ALLOWED', message: 'Null is not allowed' });
      continue;
    }
    if (value === undefined) continue;

    if (type === 'string' || type === undefined) {
      out[name] = String(value);
      const minLength = constraints['minLength'];
      const maxLength = constraints['maxLength'];
      if (typeof minLength === 'number' && String(out[name]).length < minLength)
        issues.push({ index, column: name, code: 'MIN_LENGTH', message: `Must be at least ${minLength} characters` });
      if (typeof maxLength === 'number' && String(out[name]).length > maxLength)
        issues.push({ index, column: name, code: 'MAX_LENGTH', message: `Must be at most ${maxLength} characters` });
      const pattern = constraints['pattern'];
      if (typeof pattern === 'string' && pattern.trim()) {
        try {
          if (isProbablyUnsafeRegex(pattern)) {
            issues.push({ index, column: name, code: 'PATTERN_INVALID', message: 'Unsafe pattern' });
            continue;
          }
          const re = new RegExp(pattern);
          if (!re.test(String(out[name]).slice(0, MAX_SCHEMA_REGEX_TEST_INPUT_LENGTH)))
            issues.push({ index, column: name, code: 'PATTERN', message: 'Does not match required pattern' });
        } catch {
          issues.push({ index, column: name, code: 'PATTERN_INVALID', message: 'Invalid pattern' });
        }
      }
      continue;
    }

    if (type === 'number') {
      const n = coerceNumber(value);
      if (n === null) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected number' });
        continue;
      }
      const min = constraints['min'];
      const max = constraints['max'];
      if (typeof min === 'number' && n < min) issues.push({ index, column: name, code: 'MIN', message: `Must be >= ${min}` });
      if (typeof max === 'number' && n > max) issues.push({ index, column: name, code: 'MAX', message: `Must be <= ${max}` });
      out[name] = n;
      continue;
    }

    if (type === 'boolean') {
      const b = coerceBoolean(value);
      if (b === null) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected boolean' });
        continue;
      }
      out[name] = b;
      continue;
    }

    if (type === 'date') {
      const iso = toIsoDateOnly(value);
      if (!iso) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected ISO date or datetime' });
        continue;
      }
      out[name] = iso;
      continue;
    }

    if (type === 'datetime') {
      const iso = toIsoInstant(value);
      if (!iso) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected ISO8601 datetime with offset or Z' });
        continue;
      }
      out[name] = iso;
      continue;
    }

    if (type === 'enum') {
      const opts = col?.enum?.options;
      const s = String(value);
      if (!Array.isArray(opts) || opts.length === 0) {
        issues.push({ index, column: name, code: 'SCHEMA', message: 'Enum options are not configured' });
        continue;
      }
      if (!opts.includes(s)) {
        issues.push({ index, column: name, code: 'ENUM', message: 'Value is not in enum options' });
        continue;
      }
      out[name] = s;
      continue;
    }

    if (type === 'reference') {
      const key = referenceKeyFor(value);
      if (key === null) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected reference value' });
        continue;
      }
      out[name] = key;
      continue;
    }

    // json or unknown types: accept as-is
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: out };
}

/** Reconstruct stored soft-reference keys back into reference objects for the client. */
function reconstructRow(columns: StarshipDatasetColumn[], data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const col of columns) {
    if (col?.type !== 'reference' || !col.name) continue;
    const stored = out[col.name];
    if (stored == null) continue;
    const target = col.reference?.target;
    if (target?.kind === 'task_card') {
      out[col.name] = { kind: 'task_card', cardId: String(stored) };
    } else if (target?.kind === 'dataset_row') {
      out[col.name] = { kind: 'dataset_row', datasetIdOrSlug: target.datasetIdOrSlug, key: String(stored) };
    }
  }
  return out;
}

function tableRefOf(record: StarshipTableRecord): TableRef {
  return { starshipId: record.starshipId, physicalTable: record.physicalTable, columns: record.columns, primaryKey: record.primaryKey };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TableColumnSchema: z.ZodType<StarshipDatasetColumn> = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .regex(/^[a-zA-Z0-9_]+$/, 'Column name must be alphanumeric/underscore')
      .refine((n) => !n.startsWith('__'), { message: 'Column name may not start with "__"' }),
    description: z
      .string()
      .max(2000)
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    format: z.enum(['text', 'number', 'currency', 'date', 'datetime', 'percentage']).optional(),
    type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum', 'reference']).optional(),
    constraints: z
      .object({
        required: z.boolean().optional(),
        nullable: z.boolean().optional(),
        unique: z.boolean().optional(),
        autoincrement: z.boolean().optional(),
        default: z.unknown().optional(),
        min: z.number().finite().optional(),
        max: z.number().finite().optional(),
        minLength: z.number().int().min(0).max(1_000_000).optional(),
        maxLength: z.number().int().min(0).max(63).optional(),
        pattern: z.string().min(1).max(10_000).optional(),
      })
      .strict()
      .optional(),
    enum: z.object({ options: z.array(z.string().trim().min(1).max(500)).min(1).max(500) }).strict().optional(),
    reference: z
      .object({
        target: z.union([
          z.object({ kind: z.literal('dataset_row'), datasetIdOrSlug: z.string().trim().min(1).max(255) }).strict(),
          z.object({ kind: z.literal('task_card') }).strict(),
        ]),
        labelColumn: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict() as z.ZodType<StarshipDatasetColumn>;

function validateColumnsConstraints(cols: StarshipDatasetColumn[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  for (const c of cols) {
    const n = String(c?.name || '').trim();
    if (!n) continue;
    if (seen.has(n)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate column name: ${n}`, path: ['columns'] });
      break;
    }
    seen.add(n);
  }
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const t = c?.type;
    if (c?.enum && t !== 'enum') ctx.addIssue({ code: 'custom', message: '`enum` config requires type=enum', path: ['columns', i, 'enum'] });
    if (c?.reference && t !== 'reference')
      ctx.addIssue({ code: 'custom', message: '`reference` config requires type=reference', path: ['columns', i, 'reference'] });
    if (t === 'enum' && (!c.enum || !Array.isArray(c.enum.options) || c.enum.options.length === 0))
      ctx.addIssue({ code: 'custom', message: 'enum columns require enum.options', path: ['columns', i, 'enum'] });
    if (t === 'reference' && !c.reference?.target)
      ctx.addIssue({ code: 'custom', message: 'reference columns require reference.target', path: ['columns', i, 'reference'] });
    if (wantsAutoincrement(c) && t !== 'number')
      ctx.addIssue({ code: 'custom', message: 'autoincrement is only supported for number columns', path: ['columns', i, 'constraints', 'autoincrement'] });
  }
}

function validatePkAndUnique(cols: StarshipDatasetColumn[], primaryKey: string | null | undefined, ctx: z.RefinementCtx) {
  const pk = typeof primaryKey === 'string' ? primaryKey.trim() : '';
  if (pk && !cols.some((c) => String(c?.name || '') === pk))
    ctx.addIssue({ code: 'custom', message: 'primaryKey must match an existing column name', path: ['primaryKey'] });

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const name = String(c?.name || '').trim();
    if (Boolean(c?.constraints?.unique) && name && (!pk || pk !== name))
      ctx.addIssue({ code: 'custom', message: 'constraints.unique is only supported for the primaryKey column', path: ['columns', i, 'constraints', 'unique'] });
  }

  const autoCols = cols.filter((c) => wantsAutoincrement(c));
  if (autoCols.length > 1) ctx.addIssue({ code: 'custom', message: 'Only one autoincrement column is supported', path: ['columns'] });
  if (autoCols.length === 1) {
    const name = String(autoCols[0]?.name || '').trim();
    if (!pk) ctx.addIssue({ code: 'custom', message: 'autoincrement requires primaryKey to be set', path: ['primaryKey'] });
    else if (name !== pk)
      ctx.addIssue({ code: 'custom', message: 'autoincrement is only supported for the primaryKey column', path: ['primaryKey'] });
  }
}

const CreateTableSchema = z
  .object({
    name: z.string().trim().min(1).max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }),
    description: z.string().max(2000).optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    columns: z.array(TableColumnSchema).default([]),
    primaryKey: z.string().trim().min(1).max(63).optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    validateColumnsConstraints(v.columns ?? [], ctx);
    validatePkAndUnique(v.columns ?? [], v.primaryKey, ctx);
  });

const UpdateTableSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    description: z.string().max(2000).optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    columns: z.array(TableColumnSchema).optional(),
    primaryKey: z.string().trim().min(1).max(63).optional().nullable(),
    archived: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.columns) {
      validateColumnsConstraints(v.columns, ctx);
      if (Object.prototype.hasOwnProperty.call(v, 'primaryKey')) validatePkAndUnique(v.columns, v.primaryKey, ctx);
    }
  });

const ListTablesQuerySchema = z.object({
  includeArchived: z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      const s = v.trim().toLowerCase();
      if (!s) return undefined;
      return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }, z.boolean().optional())
    .optional(),
});

const ListRowsQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(5000).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  search: z.string().trim().max(2000).optional(),
  q: z.string().trim().max(2000).optional(),
  filters: z.string().trim().max(50_000).optional(),
  filter: z.string().trim().max(50_000).optional(),
});

const RowKeySchema = z.string().trim().min(1).max(500);
const UpsertRowsSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1), mode: z.enum(['append', 'upsert']).optional() }).strict();
const TableIdOrSlugSchema = z.union([IdSchema, SlugSchema.max(100)]);

async function requireTableInStarship(args: {
  tableIdOrSlug: string;
  starshipId: string;
  tableRepo: StarshipTableRepository;
  res: Response;
}): Promise<{ table: StarshipTableRecord } | null> {
  const { tableIdOrSlug, starshipId, tableRepo, res } = args;
  const key = String(tableIdOrSlug || '').trim();
  let table: StarshipTableRecord | null = null;
  if (IdSchema.safeParse(key).success) table = await tableRepo.findById(key);
  if (!table) table = await tableRepo.findBySlug(key, starshipId);
  if (!table) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Table not found', 404, { tableIdOrSlug });
    return null;
  }
  if (table.starshipId !== starshipId) {
    sendError(res, 'ACCESS_DENIED', 'Table does not belong to this starship', 403, { tableIdOrSlug, starshipId });
    return null;
  }
  return { table };
}

// ---------------------------------------------------------------------------
// Routes (served on /datasets paths during the transition; renamed in a later step)
// ---------------------------------------------------------------------------

router.get('/starships/:starshipId/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'tables params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListTablesQuerySchema, req.query, res, 'tables query') || {};
    const tableRepo = new StarshipTableRepository();
    const tables = await tableRepo.listByStarship(params.starshipId, { includeArchived: Boolean((q as { includeArchived?: boolean }).includeArchived) });
    sendSuccess(res, { datasets: tables });
  } catch (error) {
    handleError(error, res, 'list tables');
  }
});

router.post('/starships/:starshipId/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;
  const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'tables params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;
  const body = validateData(CreateTableSchema, req.body, res, 'create table body');
  if (!body) return;

  try {
    const tableRepo = new StarshipTableRepository();
    const created = await tableRepo.create({
      starshipId: params.starshipId,
      name: body.name,
      ...(body.description ? { description: body.description } : null),
      columns: body.columns ?? [],
      ...(body.primaryKey !== undefined ? { primaryKey: body.primaryKey } : null),
    });
    sendSuccess(res, { dataset: created }, 201);
  } catch (error) {
    handleError(error, res, 'create table');
  }
});

router.get('/starships/:starshipId/datasets/:datasetIdOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const tableRepo = new StarshipTableRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;
    sendSuccess(res, { dataset: required.table });
  } catch (error) {
    handleError(error, res, 'get table');
  }
});

router.patch('/starships/:starshipId/datasets/:datasetIdOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;
  const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;
  const body = validateData(UpdateTableSchema, req.body, res, 'update table body');
  if (!body) return;

  try {
    const tableRepo = new StarshipTableRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;

    const updated = await tableRepo.update(required.table.id, body);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Table not found', 404, { datasetIdOrSlug: params.datasetIdOrSlug });
      return;
    }
    sendSuccess(res, { dataset: updated });
  } catch (error) {
    handleError(error, res, 'update table');
  }
});

router.post('/starships/:starshipId/datasets/:datasetIdOrSlug/archive', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table archive params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const tableRepo = new StarshipTableRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;
    const updated = await tableRepo.update(required.table.id, { archived: true });
    sendSuccess(res, { dataset: updated });
  } catch (error) {
    handleError(error, res, 'archive table');
  }
});

router.delete('/starships/:starshipId/datasets/:datasetIdOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table delete params');
    if (!params) return;
    if (!(await verifyStarshipAdminAccess(params.starshipId, userId, res))) return;

    const tableRepo = new StarshipTableRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;

    const ok = await tableRepo.delete(required.table.id);
    if (!ok) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Table not found', 404, { datasetIdOrSlug: params.datasetIdOrSlug });
      return;
    }
    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'delete table');
  }
});

router.get('/starships/:starshipId/datasets/:datasetIdOrSlug/rows', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table rows params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListRowsQuerySchema, req.query, res, 'list table rows query');
    if (!q) return;
    const limit = typeof q.limit === 'number' ? q.limit : 50;
    const offset = typeof q.offset === 'number' ? q.offset : 0;
    const searchRaw = typeof q.search === 'string' ? q.search : typeof q.q === 'string' ? q.q : '';
    const search = searchRaw.trim().length > 0 ? searchRaw.trim() : null;
    const filtersRaw = typeof q.filters === 'string' ? q.filters : typeof q.filter === 'string' ? q.filter : '';

    const tableRepo = new StarshipTableRepository();
    const rowRepo = new StarshipTableRowRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;
    const ref = tableRefOf(required.table);

    // Parse filters: array of {column,op,value} or object map (implies eq). Map primaryKey -> rowKey.
    let filters: TableRowFilter[] | null = null;
    if (filtersRaw && filtersRaw.trim()) {
      try {
        const parsed = JSON.parse(filtersRaw.trim()) as unknown;
        const out: TableRowFilter[] = [];
        const pk = typeof required.table.primaryKey === 'string' ? required.table.primaryKey.trim() : '';
        const push = (f: TableRowFilter) => {
          const column = String(f.column || '').trim();
          if (!column) return;
          out.push(pk && column === pk ? { ...f, column: 'rowKey' } : f);
        };
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const rec = item as Record<string, unknown>;
            push({
              column: typeof rec.column === 'string' ? rec.column : '',
              ...(typeof rec.op === 'string' ? { op: rec.op as TableRowFilter['op'] } : null),
              ...(Object.prototype.hasOwnProperty.call(rec, 'value') ? { value: rec.value } : null),
            });
          }
        } else if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) push({ column: k, op: 'eq', value: v });
        } else {
          sendError(res, 'VALIDATION_ERROR', 'filters must be a JSON array or object', 400);
          return;
        }
        filters = out;
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'filters must be valid JSON', 400);
        return;
      }
    }

    const total = await rowRepo.countByDataset(ref, { search, filters });
    const rows = await rowRepo.listByDataset(ref, { limit, offset, order: 'desc', search, filters });
    const data = rows.map((r) => reconstructRow(required.table.columns, isPlainObject(r.data) ? r.data : {}));

    sendSuccess(res, { columns: required.table.columns ?? [], data, pagination: { limit, offset, total } });
  } catch (error) {
    handleError(error, res, 'list table rows');
  }
});

router.delete('/starships/:starshipId/datasets/:datasetIdOrSlug/rows/:rowKey', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(
      z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema, rowKey: RowKeySchema }),
      req.params,
      res,
      'table row delete params'
    );
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const tableRepo = new StarshipTableRepository();
    const rowRepo = new StarshipTableRowRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;

    const result = await rowRepo.deleteByRowKey(tableRefOf(required.table), params.rowKey);
    if (!result.deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Row not found', 404, { rowKey: params.rowKey });
      return;
    }
    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'delete table row');
  }
});

router.post('/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;
  const params = validateData(z.object({ starshipId: IdSchema, datasetIdOrSlug: TableIdOrSlugSchema }), req.params, res, 'table rows params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;
  const body = validateData(UpsertRowsSchema, req.body, res, 'upsert table rows body');
  if (!body) return;

  try {
    const tableRepo = new StarshipTableRepository();
    const rowRepo = new StarshipTableRowRepository();
    const required = await requireTableInStarship({ tableIdOrSlug: params.datasetIdOrSlug, starshipId: params.starshipId, tableRepo, res });
    if (!required) return;
    const ref = tableRefOf(required.table);

    const mode = body.mode ?? 'append';
    const rows = body.rows;
    const primaryKey = required.table.primaryKey;
    const schemaColumns = required.table.columns;
    const issues: RowIssue[] = [];

    if (mode === 'upsert') {
      if (!primaryKey || !primaryKey.trim()) {
        sendError(res, 'VALIDATION_ERROR', 'Table primaryKey is required for upsert mode', 400, { mode, primaryKey });
        return;
      }
      const toUpsert: Array<{ rowKey: string; data: Record<string, unknown> }> = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        if (!isPlainObject(r)) {
          sendError(res, 'VALIDATION_ERROR', 'Each row must be an object', 400, { index: idx });
          return;
        }
        const validated = coerceValidateRow({ index: idx, row: r, columns: schemaColumns });
        if (!validated.ok) {
          issues.push(...validated.issues);
          continue;
        }
        const pkVal = validated.data[primaryKey];
        if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) {
          issues.push({ index: idx, column: primaryKey, code: 'REQUIRED', message: `Row is missing primary key field: ${primaryKey}` });
          continue;
        }
        toUpsert.push({ rowKey: String(pkVal), data: validated.data });
      }
      const result = toUpsert.length > 0 ? await rowRepo.upsertManyByRowKey(ref, toUpsert) : { inserted: 0, updated: 0 };
      sendSuccess(res, { inserted: result.inserted, updated: result.updated, ...(issues.length > 0 ? { errors: issues } : null) }, 200);
      return;
    }

    // append: autoincrement PK omitted -> let the DB IDENTITY allocate it.
    const toAppend: Array<{ rowKey?: string | null; data: Record<string, unknown> }> = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      if (!isPlainObject(r)) {
        sendError(res, 'VALIDATION_ERROR', 'Each row must be an object', 400, { index: idx });
        return;
      }
      const validated = coerceValidateRow({ index: idx, row: r, columns: schemaColumns });
      if (!validated.ok) {
        issues.push(...validated.issues);
        continue;
      }
      let rowKey: string | null = null;
      if (primaryKey && primaryKey.trim()) {
        const pkVal = validated.data[primaryKey];
        if (pkVal !== null && pkVal !== undefined && String(pkVal).trim().length > 0) rowKey = String(pkVal);
      }
      toAppend.push({ rowKey, data: validated.data });
    }
    const inserted = toAppend.length > 0 ? await rowRepo.appendMany(ref, toAppend) : { inserted: 0 };
    sendSuccess(res, { inserted: inserted.inserted, updated: 0, ...(issues.length > 0 ? { errors: issues } : null) }, 200);
  } catch (error) {
    handleError(error, res, 'upsert table rows');
  }
});

router.post('/starships/:starshipId/datasets/refs:resolve', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'tables refs params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const BodySchema = z
      .object({
        datasetRowRefs: z
          .array(z.object({ datasetIdOrSlug: z.string().trim().min(1).max(255), key: z.string().trim().min(1).max(500), labelColumn: z.string().trim().min(1).max(100).optional() }).strict())
          .max(500)
          .optional()
          .default([]),
        taskCardRefs: z.array(z.object({ cardId: IdSchema }).strict()).max(500).optional().default([]),
      })
      .strict();
    const body = validateData(BodySchema, req.body, res, 'tables refs body');
    if (!body) return;

    const resolved: Record<string, { label?: string; url?: string; data?: Record<string, unknown> }> = {};

    if (body.taskCardRefs.length > 0) {
      const ids = Array.from(new Set(body.taskCardRefs.map((r) => String(r.cardId || '').trim()).filter(Boolean)));
      if (ids.length > 0) {
        const conn = getConnection();
        const rows = await conn.query<{ id: string; title: string; description: string | null; priority: number | null }>(
          `SELECT c.id, c.title, c.description, c.priority FROM task_cards c JOIN task_boards b ON b.id = c.board_id
           WHERE c.id = ANY($1::text[]) AND b.starship_id = $2`,
          [ids, params.starshipId]
        );
        for (const r of rows) {
          const id = String(r.id || '').trim();
          if (!id) continue;
          resolved[`task_card:${id}`] = { label: String(r.title || '').trim() || id, data: { id, title: r.title, description: r.description ?? '', priority: r.priority ?? null } };
        }
      }
    }

    if (body.datasetRowRefs.length > 0) {
      const tableRepo = new StarshipTableRepository();
      const rowRepo = new StarshipTableRowRepository();
      // Group by target table.
      const groups = new Map<string, { dsKey: string; table: StarshipTableRecord; refs: Array<{ key: string; labelColumn?: string }> }>();
      for (const ref of body.datasetRowRefs) {
        const dsKey = String(ref.datasetIdOrSlug || '').trim();
        const rowKey = String(ref.key || '').trim();
        if (!dsKey || !rowKey) continue;
        const table = IdSchema.safeParse(dsKey).success ? await tableRepo.findById(dsKey) : await tableRepo.findBySlug(dsKey, params.starshipId);
        if (!table || table.starshipId !== params.starshipId || !table.primaryKey) continue;
        const g = groups.get(table.id) ?? { dsKey, table, refs: [] };
        g.refs.push({ key: rowKey, labelColumn: ref.labelColumn });
        groups.set(table.id, g);
      }

      for (const g of groups.values()) {
        const keys = Array.from(new Set(g.refs.map((r) => r.key)));
        if (keys.length === 0) continue;
        const found = await rowRepo.listByDataset(tableRefOf(g.table), { limit: 200, filters: [{ column: 'rowKey', op: 'in', value: keys }] });
        const byKey = new Map(found.map((row) => [String(row.rowKey), row.data]));
        for (const r of g.refs) {
          const data = byKey.get(r.key);
          if (!data) continue;
          const labelCol = String(r.labelColumn || '').trim();
          const label = labelCol && data[labelCol] != null ? String(data[labelCol]) : r.key;
          resolved[`dataset_row:${g.dsKey}:${r.key}`] = { label, data };
        }
      }
    }

    sendSuccess(res, { resolved });
  } catch (error) {
    handleError(error, res, 'resolve table refs');
  }
});

export default router;
