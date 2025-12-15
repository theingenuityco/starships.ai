import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { noXSS, XSS_ERROR_MESSAGE, IdSchema } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { ConnectorSecretListResponse, ConnectorSecretResponse, ConnectorSecretSummary } from '@starships/protocol';
import { ConnectorSecretRepository } from '@starships/models';

const router: Router = Router();

// Auth + ownership check for all starship connector-secret endpoints.
router.use('/starships/:starshipId/connector-secrets', jwtAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const starshipId = req.params.starshipId;
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return;
  }

  const ok = await verifyStarshipAccess(starshipId, userId, res);
  if (!ok) return;

  next();
});

const ConnectorSecretKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  // Restrict to env-var style keys to avoid injection/XSS edge cases.
  .regex(/^[A-Z0-9_]+$/, 'Key must be uppercase letters, numbers, and underscores only');

const CreateConnectorSecretSchema = z.object({
  key: ConnectorSecretKeySchema,
  value: z.string().min(1, 'Value is required').max(20000, 'Value is too long'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
});

const UpdateConnectorSecretSchema = z
  .object({
    value: z.string().max(20000, 'Value is too long').optional(),
    description: z
      .string()
      .max(500, 'Description must be at most 500 characters')
      .optional()
      .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  })
  .refine((body) => body.value !== undefined || body.description !== undefined, {
    message: 'At least one of value or description must be provided',
  });

function toSummary(entity: {
  id: string;
  starshipId: string;
  key: string;
  description?: string;
  connectorId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}): ConnectorSecretSummary {
  return {
    id: entity.id,
    starshipId: entity.starshipId,
    key: entity.key,
    description: entity.description,
    connectorId: entity.connectorId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
  };
}

// ============================================================================
// STARSHIP CONNECTOR SECRETS
// ============================================================================

// GET /starships/:starshipId/connector-secrets - List connector secrets (no values returned)
router.get('/starships/:starshipId/connector-secrets', async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const repo = new ConnectorSecretRepository();
    const secrets = await repo.findByStarship(starshipId);

    const payload: ConnectorSecretListResponse = {
      starshipId,
      secrets,
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'listing connector secrets');
  }
});

// GET /starships/:starshipId/connector-secrets/:secretId - Get a single connector secret (no value returned)
router.get('/starships/:starshipId/connector-secrets/:secretId', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(
      z.object({
        starshipId: IdSchema,
        secretId: IdSchema,
      }),
      req.params,
      res,
      'connector secret params'
    );
    if (!params) return;

    const repo = new ConnectorSecretRepository();
    const secrets = await repo.findByStarship(params.starshipId);
    const found = secrets.find((s) => s.id === params.secretId);
    if (!found) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector secret not found', 404, { id: params.secretId });
      return;
    }

    const payload: ConnectorSecretResponse = {
      connectorSecret: found,
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'fetching connector secret');
  }
});

// POST /starships/:starshipId/connector-secrets - Create a new connector secret
router.post('/starships/:starshipId/connector-secrets', async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const body = validateData(CreateConnectorSecretSchema, req.body, res, 'connector secret');
    if (!body) return;

    const repo = new ConnectorSecretRepository();

    // Enforce "create" semantics (avoid silently overwriting).
    const existing = await repo.findByStarshipAndKey(starshipId, body.key);
    if (existing) {
      sendError(res, 'RESOURCE_ALREADY_EXISTS', `Connector secret already exists: ${body.key}`, 409);
      return;
    }

    const created = await repo.create({
      starshipId,
      key: body.key,
      value: body.value,
      description: body.description,
      createdBy: req.user!.id,
    });

    const payload: ConnectorSecretResponse = {
      connectorSecret: toSummary(created),
    };

    sendSuccess(res, payload, 201);
  } catch (error) {
    handleError(error, res, 'creating connector secret');
  }
});

// PUT /starships/:starshipId/connector-secrets/:secretId - Update a connector secret (value and/or description)
router.put('/starships/:starshipId/connector-secrets/:secretId', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(
      z.object({
        starshipId: IdSchema,
        secretId: IdSchema,
      }),
      req.params,
      res,
      'connector secret params'
    );
    if (!params) return;

    const body = validateData(UpdateConnectorSecretSchema, req.body, res, 'connector secret update');
    if (!body) return;

    const repo = new ConnectorSecretRepository();

    // Verify it belongs to the starship (avoid cross-starship updates by id).
    const secrets = await repo.findByStarship(params.starshipId);
    const belongs = secrets.find((s) => s.id === params.secretId);
    if (!belongs) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector secret not found', 404, { id: params.secretId });
      return;
    }

    const updated = await repo.update(params.secretId, {
      value: body.value,
      description: body.description,
      updatedBy: req.user!.id,
    });

    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector secret not found', 404, { id: params.secretId });
      return;
    }

    const payload: ConnectorSecretResponse = {
      connectorSecret: toSummary(updated),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'updating connector secret');
  }
});

// DELETE /starships/:starshipId/connector-secrets/:secretId - Delete a connector secret
router.delete('/starships/:starshipId/connector-secrets/:secretId', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(
      z.object({
        starshipId: IdSchema,
        secretId: IdSchema,
      }),
      req.params,
      res,
      'connector secret params'
    );
    if (!params) return;

    const repo = new ConnectorSecretRepository();

    // Verify it belongs to the starship (avoid cross-starship deletes by id).
    const secrets = await repo.findByStarship(params.starshipId);
    const belongs = secrets.find((s) => s.id === params.secretId);
    if (!belongs) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector secret not found', 404, { id: params.secretId });
      return;
    }

    const deleted = await repo.delete(params.secretId);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector secret not found', 404, { id: params.secretId });
      return;
    }

    sendSuccess(res, { message: 'Connector secret deleted' });
  } catch (error) {
    handleError(error, res, 'deleting connector secret');
  }
});

export default router;
