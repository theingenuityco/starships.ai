import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { sendError, sendSuccess, handleError } from '@/utils/responseHelpers';
import { DatasetRowProjector } from '@/services/DatasetRowProjector';

import {
  StarshipDatasetRepository,
  StarshipDatasetRowRepository,
  getConnection,
} from '@starships/models';
import type {
  CreateStarshipDatasetRequest,
  StarshipDatasetColumn,
  StarshipDatasetDetailsResponse,
  StarshipDatasetListResponse,
  StarshipDatasetModel,
  StarshipDatasetRowsPageResponse,
  StarshipDatasetRowModel,
  UpsertStarshipDatasetRowsRequest,
  UpsertStarshipDatasetRowsResponse,
  UpdateStarshipDatasetRequest,
} from '@starships/protocol';

const router: Router = Router();

function requireAuthUserId(req: Request, res: Response): string | null {
  const userId = (req.user as any)?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type RowIssue = { index: number; column?: string; code: string; message: string };

function isIsoInstantString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  // Require an explicit offset or Z (to avoid ambiguous local-time strings).
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(s);
}

function toIsoDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toIsoInstant(value: unknown): string | null {
  if (!isIsoInstantString(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  }
  return null;
}

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

function wantsAutoincrement(col: StarshipDatasetColumn): boolean {
  return Boolean((col as any)?.constraints?.autoincrement);
}

async function allocateAutoincrementBlock(args: {
  datasetId: string;
  columnName: string;
  count: number;
}): Promise<bigint> {
  const count = Math.max(0, Math.floor(args.count));
  if (count <= 0) throw new Error('count must be > 0');

  const conn = getConnection();
  const row = await conn.queryOne<{ start_value: string | number | bigint }>(
    `
      INSERT INTO starship_dataset_autoincrement (dataset_id, column_name, next_value, updated_at)
      VALUES ($1, $2, $3::bigint + 1, NOW())
      ON CONFLICT (dataset_id, column_name)
      DO UPDATE SET next_value = starship_dataset_autoincrement.next_value + $3::bigint, updated_at = NOW()
      RETURNING (next_value - $3::bigint) AS start_value
    `,
    [args.datasetId, args.columnName, count]
  );
  if (!row || row.start_value === null || row.start_value === undefined) throw new Error('Failed to allocate autoincrement block');
  const v = row.start_value;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v)) throw new Error('Invalid autoincrement start_value');
    return BigInt(v);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) throw new Error('Invalid autoincrement start_value');
    return BigInt(s);
  }
  throw new Error('Invalid autoincrement start_value');
}

function toSafeJsNumber(v: bigint): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  if (v > max || v < min) return null;
  return Number(v);
}

function normalizeReferenceValue(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const kind = String((value as any).kind || '').trim();
  if (kind === 'dataset_row') {
    const datasetIdOrSlug = String((value as any).datasetIdOrSlug || '').trim();
    const key = String((value as any).key || '').trim();
    if (!datasetIdOrSlug || !key) return null;
    return { kind: 'dataset_row', datasetIdOrSlug, key };
  }
  if (kind === 'task_card') {
    const cardId = String((value as any).cardId || '').trim();
    if (!cardId) return null;
    return { kind: 'task_card', cardId };
  }
  return null;
}

function coerceValidateRow(args: {
  index: number;
  row: Record<string, unknown>;
  columns: StarshipDatasetColumn[];
}): { ok: true; data: Record<string, unknown> } | { ok: false; issues: RowIssue[] } {
  const { index, row, columns } = args;
  const issues: RowIssue[] = [];
  const out: Record<string, unknown> = { ...row };

  for (const col of columns) {
    const name = String((col as any)?.name || '').trim();
    if (!name) continue;
    const type = (col as any)?.type as string | undefined;
    const constraints = ((col as any)?.constraints || {}) as Record<string, unknown>;

    if (type === 'formula') {
      // Computed on read; ignore any provided value.
      if (Object.prototype.hasOwnProperty.call(out, name)) delete out[name];
      continue;
    }

    // Defaults
    if (!Object.prototype.hasOwnProperty.call(out, name) && Object.prototype.hasOwnProperty.call(constraints, 'default')) {
      out[name] = (constraints as any).default;
    }

    const required = Boolean((constraints as any).required);
    const autoincrement = wantsAutoincrement(col);
    const nullable = Boolean((constraints as any).nullable);

    const has = Object.prototype.hasOwnProperty.call(out, name);
    const value = has ? out[name] : undefined;

    if (required && isEmptyValue(value) && !autoincrement) {
      issues.push({ index, column: name, code: 'REQUIRED', message: 'Value is required' });
      continue;
    }

    if (value === null) {
      if (!nullable) {
        issues.push({ index, column: name, code: 'NULL_NOT_ALLOWED', message: 'Null is not allowed' });
      }
      continue;
    }

    if (value === undefined) continue;

    if (type === 'string') {
      out[name] = String(value);
      const minLength = (constraints as any).minLength;
      const maxLength = (constraints as any).maxLength;
      if (typeof minLength === 'number' && String(out[name]).length < minLength) {
        issues.push({ index, column: name, code: 'MIN_LENGTH', message: `Must be at least ${minLength} characters` });
      }
      if (typeof maxLength === 'number' && String(out[name]).length > maxLength) {
        issues.push({ index, column: name, code: 'MAX_LENGTH', message: `Must be at most ${maxLength} characters` });
      }
      const pattern = (constraints as any).pattern;
      if (typeof pattern === 'string' && pattern.trim()) {
        try {
          const re = new RegExp(pattern);
          if (!re.test(String(out[name]))) {
            issues.push({ index, column: name, code: 'PATTERN', message: 'Does not match required pattern' });
          }
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
      const min = (constraints as any).min;
      const max = (constraints as any).max;
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
      const opts = (col as any)?.enum?.options;
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
      const normalized = normalizeReferenceValue(value);
      if (!normalized) {
        issues.push({ index, column: name, code: 'TYPE', message: 'Expected reference object' });
        continue;
      }
      out[name] = normalized;
      continue;
    }

    // json or unknown types: accept as-is
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: out };
}

const DatasetColumnSchema: z.ZodType<StarshipDatasetColumn> = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_]+$/, 'Column name must be alphanumeric/underscore'),
    description: z
      .string()
      .max(2000)
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    format: z.enum(['text', 'number', 'currency', 'date', 'datetime', 'percentage']).optional(),
    type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum', 'reference', 'formula']).optional(),
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
        maxLength: z.number().int().min(0).max(1_000_000).optional(),
        pattern: z.string().min(1).max(10_000).optional(),
      })
      .strict()
      .optional(),
    enum: z
      .object({
        options: z.array(z.string().trim().min(1).max(500)).min(1).max(500),
      })
      .strict()
      .optional(),
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
    formula: z
      .object({
        expr: z.string().trim().min(1).max(50_000),
        resultType: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function validateColumnsConstraints(cols: StarshipDatasetColumn[], ctx: z.RefinementCtx) {
  const names: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    const n = String(cols[i]?.name || '').trim();
    if (!n) continue;
    names.push(n);
  }

  // Duplicate names
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate column name: ${n}`, path: ['columns'] });
      break;
    }
    seen.add(n);
  }

  // Ensure config blocks match `type`
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const t = c?.type;
    if (c?.enum && t !== 'enum') ctx.addIssue({ code: 'custom', message: '`enum` config requires type=enum', path: ['columns', i, 'enum'] });
    if (c?.reference && t !== 'reference')
      ctx.addIssue({ code: 'custom', message: '`reference` config requires type=reference', path: ['columns', i, 'reference'] });
    if (c?.formula && t !== 'formula') ctx.addIssue({ code: 'custom', message: '`formula` config requires type=formula', path: ['columns', i, 'formula'] });

    if (t === 'enum') {
      if (!c.enum || !Array.isArray(c.enum.options) || c.enum.options.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'enum columns require enum.options', path: ['columns', i, 'enum'] });
      }
    }
    if (t === 'reference') {
      if (!c.reference?.target) ctx.addIssue({ code: 'custom', message: 'reference columns require reference.target', path: ['columns', i, 'reference'] });
    }
    if (t === 'formula') {
      if (!c.formula?.expr || !String(c.formula.expr).trim()) {
        ctx.addIssue({ code: 'custom', message: 'formula columns require formula.expr', path: ['columns', i, 'formula', 'expr'] });
      }
    }

    if (wantsAutoincrement(c)) {
      if (t !== 'number') {
        ctx.addIssue({ code: 'custom', message: 'constraints.autoincrement is only supported for number columns', path: ['columns', i, 'constraints', 'autoincrement'] });
      }
      if (c?.constraints && Object.prototype.hasOwnProperty.call(c.constraints as any, 'default')) {
        ctx.addIssue({ code: 'custom', message: 'constraints.autoincrement cannot be combined with constraints.default', path: ['columns', i, 'constraints', 'default'] });
      }
    }
  }
}

function validatePrimaryKeyAgainstColumns(args: { cols: StarshipDatasetColumn[]; primaryKey?: string | null; ctx: z.RefinementCtx }) {
  const { cols, primaryKey, ctx } = args;
  if (primaryKey === undefined) return;
  const pk = primaryKey;
  if (pk === null) return;
  const s = String(pk || '').trim();
  if (!s) return;
  const ok = cols.some((c) => String(c?.name || '') === s);
  if (!ok) ctx.addIssue({ code: 'custom', message: 'primaryKey must match an existing column name', path: ['primaryKey'] });
}

function validateUniqueConstraints(args: { cols: StarshipDatasetColumn[]; primaryKey?: string | null; ctx: z.RefinementCtx }) {
  const { cols, primaryKey, ctx } = args;
  const pk = typeof primaryKey === 'string' ? primaryKey.trim() : '';
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const wantsUnique = Boolean((c as any)?.constraints?.unique);
    if (!wantsUnique) continue;
    const name = String(c?.name || '').trim();
    if (!name) continue;
    if (!pk || pk !== name) {
      ctx.addIssue({
        code: 'custom',
        message: 'constraints.unique is currently only supported for the dataset primaryKey column',
        path: ['columns', i, 'constraints', 'unique'],
      });
    }
  }
}

function validateAutoincrementConstraints(args: { cols: StarshipDatasetColumn[]; primaryKey?: string | null; ctx: z.RefinementCtx }) {
  const { cols, primaryKey, ctx } = args;
  const autoCols = cols
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => wantsAutoincrement(c));

  if (autoCols.length === 0) return;
  if (autoCols.length > 1) {
    ctx.addIssue({ code: 'custom', message: 'Only one autoincrement column is supported per dataset', path: ['columns'] });
    return;
  }

  const only = autoCols[0]!;
  const name = String(only.c?.name || '').trim();
  const pk = typeof primaryKey === 'string' ? primaryKey.trim() : '';

  if (!pk) {
    ctx.addIssue({ code: 'custom', message: 'autoincrement requires dataset primaryKey to be set', path: ['primaryKey'] });
    return;
  }
  if (name !== pk) {
    ctx.addIssue({ code: 'custom', message: 'autoincrement is only supported for the dataset primaryKey column', path: ['columns', only.idx, 'constraints', 'autoincrement'] });
  }
}

const CreateDatasetSchema = z
  .object({
    name: z.string().trim().min(1).max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }),
    description: z
      .string()
      .max(2000)
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    columns: z.array(DatasetColumnSchema).default([]),
    primaryKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    validateColumnsConstraints(v.columns ?? [], ctx);
    validatePrimaryKeyAgainstColumns({ cols: v.columns ?? [], primaryKey: v.primaryKey, ctx });
    validateUniqueConstraints({ cols: v.columns ?? [], primaryKey: v.primaryKey, ctx });
    validateAutoincrementConstraints({ cols: v.columns ?? [], primaryKey: v.primaryKey, ctx });
  });

const UpdateDatasetSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    description: z
      .string()
      .max(2000)
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
    columns: z.array(DatasetColumnSchema).optional(),
    primaryKey: z.string().trim().min(1).max(100).optional().nullable(),
    archived: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.columns) validateColumnsConstraints(v.columns, ctx);
    if (v.columns && Object.prototype.hasOwnProperty.call(v, 'primaryKey')) {
      validatePrimaryKeyAgainstColumns({ cols: v.columns, primaryKey: v.primaryKey, ctx });
      validateUniqueConstraints({ cols: v.columns, primaryKey: v.primaryKey, ctx });
    }
  });

const ListDatasetsQuerySchema = z.object({
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
  limit: z.coerce.number().int().min(0).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
});

const UpsertRowsSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1),
    mode: z.enum(['append', 'upsert']).optional(),
  })
  .strict();

const DatasetIdOrSlugSchema = z.union([IdSchema, SlugSchema.max(100)]);

async function requireDatasetInStarship(args: {
  datasetIdOrSlug: string;
  starshipId: string;
  datasetRepo: StarshipDatasetRepository;
  res: Response;
}): Promise<{ dataset: StarshipDatasetModel } | null> {
  const { datasetIdOrSlug, starshipId, datasetRepo, res } = args;
  const key = String(datasetIdOrSlug || '').trim();
  let dataset: StarshipDatasetModel | null = null;

  // Slugs often satisfy IdSchema (both allow lowercase + hyphens), so we must
  // fall back to slug lookup when an ID-shaped value isn't found by ID.
  if (IdSchema.safeParse(key).success) dataset = await datasetRepo.findById(key);
  if (!dataset) dataset = await datasetRepo.findBySlug(key, starshipId);
  if (!dataset) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Dataset not found', 404, { datasetIdOrSlug });
    return null;
  }
  if (dataset.starshipId !== starshipId) {
    sendError(res, 'ACCESS_DENIED', 'Dataset does not belong to this starship', 403, { datasetIdOrSlug, starshipId });
    return null;
  }
  return { dataset };
}

/**
 * GET /api/v1/starships/:starshipId/datasets
 * List datasets for a starship
 */
router.get('/starships/:starshipId/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'datasets params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListDatasetsQuerySchema, req.query, res, 'datasets query') || {};
    const datasetRepo = new StarshipDatasetRepository();
    const datasets = await datasetRepo.listByStarship(params.starshipId, { includeArchived: Boolean((q as any).includeArchived) });

    const payload: StarshipDatasetListResponse = { datasets };
    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'list datasets');
  }
});

/**
 * POST /api/v1/starships/:starshipId/datasets
 * Create a dataset
 */
router.post('/starships/:starshipId/datasets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'datasets params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

  const body = validateData(CreateDatasetSchema, req.body, res, 'create dataset body');
  if (!body) return;

  try {
    const datasetRepo = new StarshipDatasetRepository();

    const payload: CreateStarshipDatasetRequest = {
      starshipId: params.starshipId,
      name: body.name,
      ...(body.description ? { description: body.description } : null),
      columns: body.columns ?? [],
      ...(body.primaryKey !== undefined ? { primaryKey: body.primaryKey } : null),
    };

    const created = await datasetRepo.create(payload);
    const resp: StarshipDatasetDetailsResponse = { dataset: created };
    sendSuccess(res, resp, 201);
  } catch (error) {
    handleError(error, res, 'create dataset');
  }
});

/**
 * GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug
 * Get dataset details
 */
router.get('/starships/:starshipId/datasets/:datasetIdOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(
      z.object({ starshipId: IdSchema, datasetIdOrSlug: DatasetIdOrSlugSchema }),
      req.params,
      res,
      'dataset params'
    );
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const datasetRepo = new StarshipDatasetRepository();
    const required = await requireDatasetInStarship({
      datasetIdOrSlug: params.datasetIdOrSlug,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    const resp: StarshipDatasetDetailsResponse = { dataset: required.dataset };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'get dataset');
  }
});

/**
 * PATCH /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug
 * Update dataset
 */
router.patch('/starships/:starshipId/datasets/:datasetIdOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const params = validateData(
    z.object({ starshipId: IdSchema, datasetIdOrSlug: DatasetIdOrSlugSchema }),
    req.params,
    res,
    'dataset params'
  );
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

  const body = validateData(UpdateDatasetSchema, req.body, res, 'update dataset body');
  if (!body) return;

  try {
    const datasetRepo = new StarshipDatasetRepository();
    const required = await requireDatasetInStarship({
      datasetIdOrSlug: params.datasetIdOrSlug,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    // Guardrail: if primaryKey changes, require it to either be null or exist in columns.
    if (Object.prototype.hasOwnProperty.call(body, 'primaryKey')) {
      const pk = body.primaryKey;
      if (typeof pk === 'string' && pk.trim()) {
        const cols: StarshipDatasetColumn[] = ((body.columns ?? required.dataset.columns) || []) as StarshipDatasetColumn[];
        const ok = cols.some((c: StarshipDatasetColumn) => String((c as any)?.name || '') === pk);
        if (!ok) {
          sendError(res, 'VALIDATION_ERROR', 'primaryKey must match an existing column name', 400, { primaryKey: pk });
          return;
        }
      }
    }

    // Guardrail: constraints.unique is currently only supported for the primaryKey column.
    {
      const nextCols: StarshipDatasetColumn[] = ((body.columns ?? required.dataset.columns) || []) as StarshipDatasetColumn[];
      const nextPk: string =
        Object.prototype.hasOwnProperty.call(body, 'primaryKey')
          ? typeof body.primaryKey === 'string'
            ? body.primaryKey.trim()
            : ''
          : typeof required.dataset.primaryKey === 'string'
            ? required.dataset.primaryKey.trim()
            : '';

      for (let i = 0; i < nextCols.length; i++) {
        const c = nextCols[i] as any;
        const wantsUnique = Boolean(c?.constraints?.unique);
        if (!wantsUnique) continue;
        const name = String(c?.name || '').trim();
        if (!name) continue;
        if (!nextPk || nextPk !== name) {
          sendError(
            res,
            'VALIDATION_ERROR',
            'constraints.unique is currently only supported for the dataset primaryKey column',
            400,
            { column: name, primaryKey: nextPk || null }
          );
          return;
        }
      }

      // Guardrail: autoincrement is only supported for the primaryKey column.
      const autoCols = nextCols.filter((c) => wantsAutoincrement(c));
      if (autoCols.length > 1) {
        sendError(res, 'VALIDATION_ERROR', 'Only one autoincrement column is supported per dataset', 400);
        return;
      }
      if (autoCols.length === 1) {
        const name = String(autoCols[0]?.name || '').trim();
        if (!nextPk) {
          sendError(res, 'VALIDATION_ERROR', 'autoincrement requires dataset primaryKey to be set', 400);
          return;
        }
        if (name !== nextPk) {
          sendError(res, 'VALIDATION_ERROR', 'autoincrement is only supported for the dataset primaryKey column', 400, { column: name, primaryKey: nextPk });
          return;
        }
      }
    }

    const updates: UpdateStarshipDatasetRequest = body as unknown as UpdateStarshipDatasetRequest;
    const updated = await datasetRepo.update(required.dataset.id, updates);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Dataset not found', 404, { datasetIdOrSlug: params.datasetIdOrSlug });
      return;
    }
    const resp: StarshipDatasetDetailsResponse = { dataset: updated };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'update dataset');
  }
});

/**
 * GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows?limit&offset
 * List dataset rows (paginated)
 */
router.get('/starships/:starshipId/datasets/:datasetIdOrSlug/rows', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(
      z.object({ starshipId: IdSchema, datasetIdOrSlug: DatasetIdOrSlugSchema }),
      req.params,
      res,
      'dataset rows params'
    );
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListRowsQuerySchema, req.query, res, 'list dataset rows query') || {};
    const limit = typeof (q as any).limit === 'number' ? (q as any).limit : 50;
    const offset = typeof (q as any).offset === 'number' ? (q as any).offset : 0;
    const expand = typeof (req.query as any)?.expand === 'string' ? String((req.query as any).expand) : '';
    const expandRefs = expand
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes('refs');

    const datasetRepo = new StarshipDatasetRepository();
    const rowRepo = new StarshipDatasetRowRepository();
    const required = await requireDatasetInStarship({
      datasetIdOrSlug: params.datasetIdOrSlug,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    const datasetId = required.dataset.id;
    const total = await rowRepo.countByDataset(datasetId);
    const rows = await rowRepo.listByDataset(datasetId, { limit, offset, order: 'desc' });

    const projector = new DatasetRowProjector();
    const projected = await projector.project({
      starshipId: params.starshipId,
      dataset: required.dataset,
      rows: (rows as StarshipDatasetRowModel[]).map((r: StarshipDatasetRowModel) => (isPlainObject(r.data) ? (r.data as Record<string, unknown>) : {})),
      expandRefs,
    });

    const resp: StarshipDatasetRowsPageResponse = {
      columns: required.dataset.columns ?? [],
      data: projected,
      pagination: { limit, offset, total },
    };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'list dataset rows');
  }
});

/**
 * POST /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert
 * Append or upsert rows.
 */
router.post(
  '/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const params = validateData(
    z.object({ starshipId: IdSchema, datasetIdOrSlug: DatasetIdOrSlugSchema }),
    req.params,
    res,
    'dataset rows params'
  );
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

  const body = validateData(UpsertRowsSchema, req.body, res, 'upsert dataset rows body');
  if (!body) return;

  try {
    const datasetRepo = new StarshipDatasetRepository();
    const rowRepo = new StarshipDatasetRowRepository();
    const required = await requireDatasetInStarship({
      datasetIdOrSlug: params.datasetIdOrSlug,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    const mode: UpsertStarshipDatasetRowsRequest['mode'] = (body.mode as any) ?? 'append';
    const rows = body.rows;

    const primaryKey = (required.dataset.primaryKey ?? null) as string | null;
    const datasetId = required.dataset.id;

    const schemaColumns: StarshipDatasetColumn[] = (required.dataset.columns ?? []) as StarshipDatasetColumn[];

    const pkCol = primaryKey ? schemaColumns.find((c) => String(c?.name || '') === primaryKey) : null;
    const pkAutoincrement = Boolean(primaryKey && pkCol && pkCol.type === 'number' && wantsAutoincrement(pkCol));

    if (mode === 'upsert') {
      if (!primaryKey || !primaryKey.trim()) {
        sendError(res, 'VALIDATION_ERROR', 'Dataset primaryKey is required for upsert mode', 400, { mode, primaryKey });
        return;
      }

      const issues: RowIssue[] = [];
      const validatedRows: Array<{ index: number; data: Record<string, unknown>; needsAuto: boolean }> = [];
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
        const needsAuto = pkAutoincrement && isEmptyValue(pkVal);
        if (!needsAuto && (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0)) {
          issues.push({ index: idx, column: primaryKey, code: 'REQUIRED', message: `Row is missing primary key field: ${primaryKey}` });
          continue;
        }
        validatedRows.push({ index: idx, data: validated.data, needsAuto });
      }

      if (pkAutoincrement) {
        const needs = validatedRows.filter((r) => r.needsAuto);
        if (needs.length > 0) {
          const start = await allocateAutoincrementBlock({ datasetId, columnName: primaryKey, count: needs.length });
          for (let i = 0; i < needs.length; i++) {
            const val = start + BigInt(i);
            const n = toSafeJsNumber(val);
            if (n === null) {
              issues.push({ index: needs[i]!.index, column: primaryKey, code: 'AUTOINCREMENT_OVERFLOW', message: 'Autoincrement value exceeds JS safe integer range' });
              continue;
            }
            needs[i]!.data[primaryKey] = n;
          }
        }
      }

      const toUpsert: Array<{ rowKey: string; data: Record<string, unknown> }> = [];
      for (const vr of validatedRows) {
        const pkVal = vr.data[primaryKey];
        if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) continue; // errored
        toUpsert.push({ rowKey: String(pkVal), data: vr.data });
      }

      const result = toUpsert.length > 0 ? await rowRepo.upsertManyByRowKey(datasetId, toUpsert) : { inserted: 0, updated: 0 };
      const resp: UpsertStarshipDatasetRowsResponse = {
        inserted: result.inserted,
        updated: result.updated,
        ...(issues.length > 0 ? { errors: issues } : null),
      };
      sendSuccess(res, resp, 200);
      return;
    }

    // append
    const issues: RowIssue[] = [];
    const toAppend: Array<{ rowKey?: string | null; data: Record<string, unknown> }> = [];
    const needsAuto: Array<{ inputIndex: number; appendIndex: number }> = [];
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

      if (pkAutoincrement && primaryKey) {
        const pkVal = validated.data[primaryKey];
        if (isEmptyValue(pkVal)) needsAuto.push({ inputIndex: idx, appendIndex: toAppend.length });
      }

      let rowKey: string | null = null;
      if (primaryKey && primaryKey.trim()) {
        const pkVal = validated.data[primaryKey];
        if (pkVal !== null && pkVal !== undefined && String(pkVal).trim().length > 0) {
          rowKey = String(pkVal);
        }
      }
      toAppend.push({ rowKey, data: validated.data });
    }

    if (pkAutoincrement && primaryKey) {
      const count = needsAuto.length;
      if (count > 0) {
        const start = await allocateAutoincrementBlock({ datasetId, columnName: primaryKey, count });
        for (let i = 0; i < needsAuto.length; i++) {
          const entry = needsAuto[i]!;
          const arrIdx = entry.appendIndex;
          const val = start + BigInt(i);
          const n = toSafeJsNumber(val);
          if (n === null) {
            issues.push({
              index: entry.inputIndex,
              column: primaryKey,
              code: 'AUTOINCREMENT_OVERFLOW',
              message: 'Autoincrement value exceeds JS safe integer range',
            });
            continue;
          }
          toAppend[arrIdx]!.data[primaryKey] = n;
          toAppend[arrIdx]!.rowKey = String(n);
        }
      }
    }

    const finalToAppend =
      pkAutoincrement && primaryKey
        ? toAppend.filter((r) => !isEmptyValue(r.data[primaryKey]))
        : toAppend;

    const inserted = finalToAppend.length > 0 ? await rowRepo.appendMany(datasetId, finalToAppend) : { inserted: 0 };
    const resp: UpsertStarshipDatasetRowsResponse = {
      inserted: inserted.inserted,
      updated: 0,
      ...(issues.length > 0 ? { errors: issues } : null),
    };
    sendSuccess(res, resp, 200);
  } catch (error) {
    handleError(error, res, 'upsert dataset rows');
  }
  }
);

/**
 * POST /api/v1/starships/:starshipId/datasets/refs:resolve
 * Resolve dataset row references and task card references (batch).
 */
router.post('/starships/:starshipId/datasets/refs:resolve', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'datasets refs params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const BodySchema = z
      .object({
        datasetRowRefs: z
          .array(
            z
              .object({
                datasetIdOrSlug: z.string().trim().min(1).max(255),
                key: z.string().trim().min(1).max(500),
                labelColumn: z.string().trim().min(1).max(100).optional(),
              })
              .strict()
          )
          .max(500)
          .optional()
          .default([]),
        taskCardRefs: z
          .array(
            z
              .object({
                cardId: IdSchema,
              })
              .strict()
          )
          .max(500)
          .optional()
          .default([]),
      })
      .strict();

    const body = validateData(BodySchema, req.body, res, 'datasets refs body');
    if (!body) return;

    const resolved: Record<string, { label?: string; url?: string; data?: Record<string, unknown> }> = {};

    // Resolve task cards (batch) scoped to starship via task board join.
    if (body.taskCardRefs.length > 0) {
      const ids = Array.from(new Set(body.taskCardRefs.map((r) => String(r.cardId || '').trim()).filter(Boolean)));
      if (ids.length > 0) {
        const conn = getConnection();
        const rows = await conn.query<{ id: string; title: string; description: string | null; priority: number | null }>(
          `
            SELECT c.id, c.title, c.description, c.priority
            FROM task_cards c
            JOIN task_boards b ON b.id = c.board_id
            WHERE c.id = ANY($1::text[]) AND b.starship_id = $2
          `,
          [ids, params.starshipId]
        );
        for (const r of rows) {
          const id = String(r.id || '').trim();
          if (!id) continue;
          resolved[`task_card:${id}`] = {
            label: String(r.title || '').trim() || id,
            data: { id, title: r.title, description: r.description ?? '', priority: r.priority ?? null },
          };
        }
      }
    }

    // Resolve dataset rows (group by target dataset)
    if (body.datasetRowRefs.length > 0) {
      const datasetRepo = new StarshipDatasetRepository();
      const groups = new Map<string, { datasetIdOrSlug: string; datasetId: string; keys: Set<string>; labelColumns: Map<string, string | undefined> }>();

      for (const ref of body.datasetRowRefs) {
        const dsKey = String(ref.datasetIdOrSlug || '').trim();
        const rowKey = String(ref.key || '').trim();
        if (!dsKey || !rowKey) continue;

        const dataset = IdSchema.safeParse(dsKey).success
          ? await datasetRepo.findById(dsKey)
          : await datasetRepo.findBySlug(dsKey, params.starshipId);
        if (!dataset) continue;
        if (String(dataset.starshipId) !== String(params.starshipId)) continue;
        if (!dataset.primaryKey || !String(dataset.primaryKey).trim()) continue;

        const groupKey = dataset.id;
        const g =
          groups.get(groupKey) ??
          {
            datasetIdOrSlug: dsKey,
            datasetId: dataset.id,
            keys: new Set<string>(),
            labelColumns: new Map<string, string | undefined>(),
          };
        g.keys.add(rowKey);
        g.labelColumns.set(rowKey, ref.labelColumn);
        groups.set(groupKey, g);
      }

      const conn = getConnection();
      for (const g of groups.values()) {
        const keys = Array.from(g.keys);
        if (keys.length === 0) continue;
        const rows = await conn.query<{ row_key: string; data: any }>(
          `
            SELECT row_key, data_json AS data
            FROM starship_dataset_rows
            WHERE dataset_id = $1 AND row_key = ANY($2::text[])
          `,
          [g.datasetId, keys]
        );
        for (const r of rows) {
          const rk = String(r.row_key || '').trim();
          if (!rk) continue;
          const data = isPlainObject(r.data) ? (r.data as Record<string, unknown>) : {};
          const labelCol = String(g.labelColumns.get(rk) || '').trim();
          const label =
            labelCol && data[labelCol] !== undefined && data[labelCol] !== null ? String(data[labelCol]) : rk;
          resolved[`dataset_row:${g.datasetIdOrSlug}:${rk}`] = { label, data };
        }
      }
    }

    sendSuccess(res, { resolved });
  } catch (error) {
    handleError(error, res, 'resolve dataset refs');
  }
});

export default router;

