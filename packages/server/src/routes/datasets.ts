import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { sendError, sendSuccess, handleError } from '@/utils/responseHelpers';

import {
  StarshipDatasetRepository,
  StarshipDatasetRowRepository,
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

const DatasetColumnSchema: z.ZodType<StarshipDatasetColumn> = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_]+$/, 'Column name must be alphanumeric/underscore'),
    format: z.enum(['text', 'number', 'currency', 'date', 'percentage']).optional(),
    type: z.enum(['string', 'number', 'boolean', 'date', 'json']).optional(),
  })
  .strict();

const CreateDatasetSchema = z.object({
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
}).strict();

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
  .strict();

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

async function requireDatasetInStarship(args: {
  datasetId: string;
  starshipId: string;
  datasetRepo: StarshipDatasetRepository;
  res: Response;
}): Promise<{ dataset: StarshipDatasetModel } | null> {
  const { datasetId, starshipId, datasetRepo, res } = args;
  const dataset = await datasetRepo.findById(datasetId);
  if (!dataset) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Dataset not found', 404, { datasetId });
    return null;
  }
  if (dataset.starshipId !== starshipId) {
    sendError(res, 'ACCESS_DENIED', 'Dataset does not belong to this starship', 403, { datasetId, starshipId });
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
 * GET /api/v1/starships/:starshipId/datasets/:datasetId
 * Get dataset details
 */
router.get('/starships/:starshipId/datasets/:datasetId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema, datasetId: IdSchema }), req.params, res, 'dataset params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const datasetRepo = new StarshipDatasetRepository();
    const required = await requireDatasetInStarship({
      datasetId: params.datasetId,
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
 * PATCH /api/v1/starships/:starshipId/datasets/:datasetId
 * Update dataset
 */
router.patch('/starships/:starshipId/datasets/:datasetId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const params = validateData(z.object({ starshipId: IdSchema, datasetId: IdSchema }), req.params, res, 'dataset params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

  const body = validateData(UpdateDatasetSchema, req.body, res, 'update dataset body');
  if (!body) return;

  try {
    const datasetRepo = new StarshipDatasetRepository();
    const required = await requireDatasetInStarship({
      datasetId: params.datasetId,
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

    const updates: UpdateStarshipDatasetRequest = body as unknown as UpdateStarshipDatasetRequest;
    const updated = await datasetRepo.update(params.datasetId, updates);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Dataset not found', 404, { datasetId: params.datasetId });
      return;
    }
    const resp: StarshipDatasetDetailsResponse = { dataset: updated };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'update dataset');
  }
});

/**
 * GET /api/v1/starships/:starshipId/datasets/:datasetId/rows?limit&offset
 * List dataset rows (paginated)
 */
router.get('/starships/:starshipId/datasets/:datasetId/rows', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema, datasetId: IdSchema }), req.params, res, 'dataset rows params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListRowsQuerySchema, req.query, res, 'list dataset rows query') || {};
    const limit = typeof (q as any).limit === 'number' ? (q as any).limit : 50;
    const offset = typeof (q as any).offset === 'number' ? (q as any).offset : 0;

    const datasetRepo = new StarshipDatasetRepository();
    const rowRepo = new StarshipDatasetRowRepository();
    const required = await requireDatasetInStarship({
      datasetId: params.datasetId,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    const total = await rowRepo.countByDataset(params.datasetId);
    const rows = await rowRepo.listByDataset(params.datasetId, { limit, offset, order: 'desc' });

    const resp: StarshipDatasetRowsPageResponse = {
      columns: required.dataset.columns ?? [],
      data: (rows as StarshipDatasetRowModel[]).map((r: StarshipDatasetRowModel) =>
        isPlainObject(r.data) ? (r.data as Record<string, unknown>) : {}
      ),
      pagination: { limit, offset, total },
    };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'list dataset rows');
  }
});

/**
 * POST /api/v1/starships/:starshipId/datasets/:datasetId/rows:upsert
 * Append or upsert rows.
 */
router.post('/starships/:starshipId/datasets/:datasetId/rows:upsert', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const params = validateData(z.object({ starshipId: IdSchema, datasetId: IdSchema }), req.params, res, 'dataset rows params');
  if (!params) return;
  if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

  const body = validateData(UpsertRowsSchema, req.body, res, 'upsert dataset rows body');
  if (!body) return;

  try {
    const datasetRepo = new StarshipDatasetRepository();
    const rowRepo = new StarshipDatasetRowRepository();
    const required = await requireDatasetInStarship({
      datasetId: params.datasetId,
      starshipId: params.starshipId,
      datasetRepo,
      res,
    });
    if (!required) return;

    const mode: UpsertStarshipDatasetRowsRequest['mode'] = (body.mode as any) ?? 'append';
    const rows = body.rows;

    const primaryKey = (required.dataset.primaryKey ?? null) as string | null;

    if (mode === 'upsert') {
      if (!primaryKey || !primaryKey.trim()) {
        sendError(res, 'VALIDATION_ERROR', 'Dataset primaryKey is required for upsert mode', 400, { mode, primaryKey });
        return;
      }

      const toUpsert: Array<{ rowKey: string; data: Record<string, unknown> }> = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        if (!isPlainObject(r)) {
          sendError(res, 'VALIDATION_ERROR', 'Each row must be an object', 400, { index: idx });
          return;
        }
        const pkVal = (r as any)[primaryKey];
        if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) {
          sendError(res, 'VALIDATION_ERROR', `Row is missing primary key field: ${primaryKey}`, 400, { index: idx, primaryKey });
          return;
        }
        toUpsert.push({ rowKey: String(pkVal), data: r });
      }

      const result = await rowRepo.upsertManyByRowKey(params.datasetId, toUpsert);
      const resp: UpsertStarshipDatasetRowsResponse = { inserted: result.inserted, updated: result.updated };
      sendSuccess(res, resp, 200);
      return;
    }

    // append
    const toAppend: Array<{ rowKey?: string | null; data: Record<string, unknown> }> = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      if (!isPlainObject(r)) {
        sendError(res, 'VALIDATION_ERROR', 'Each row must be an object', 400, { index: idx });
        return;
      }
      let rowKey: string | null = null;
      if (primaryKey && primaryKey.trim()) {
        const pkVal = (r as any)[primaryKey];
        if (pkVal !== null && pkVal !== undefined && String(pkVal).trim().length > 0) {
          rowKey = String(pkVal);
        }
      }
      toAppend.push({ rowKey, data: r });
    }

    const inserted = await rowRepo.appendMany(params.datasetId, toAppend);
    const resp: UpsertStarshipDatasetRowsResponse = { inserted: inserted.inserted, updated: 0 };
    sendSuccess(res, resp, 200);
  } catch (error) {
    handleError(error, res, 'upsert dataset rows');
  }
});

export default router;

