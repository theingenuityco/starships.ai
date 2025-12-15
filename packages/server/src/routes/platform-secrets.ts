import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type { AuthUser, PlatformSecretListResponse, PlatformSecretResponse } from '@starships/protocol';
import { PlatformSecretRepository } from '@starships/models';

const router: Router = Router();

const PlatformSecretKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  // Restrict to env-var style keys to avoid injection/XSS edge cases.
  .regex(/^[A-Z0-9_]+$/, 'Key must be uppercase letters, numbers, and underscores only');

const CreatePlatformSecretSchema = z.object({
  key: PlatformSecretKeySchema,
  value: z.string().min(1, 'Value is required').max(20000, 'Value is too long'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
});

const UpdatePlatformSecretSchema = z
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
  key: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    id: entity.id,
    key: entity.key,
    description: entity.description,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
  };
}

// ============================================================================
// ADMIN PLATFORM SECRETS (INSTANCE ADMIN ONLY)
// ============================================================================

// GET /admin/platform-secrets - List platform secrets (no values returned)
router.get('/admin/platform-secrets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can view platform secrets', 403);
      return;
    }

    const repo = new PlatformSecretRepository();
    const secrets = await repo.list();

    const payload: PlatformSecretListResponse = {
      secrets: secrets.map(toSummary),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'listing platform secrets');
  }
});

// POST /admin/platform-secrets - Create a new platform secret
router.post('/admin/platform-secrets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can create platform secrets', 403);
      return;
    }

    const body = validateData(CreatePlatformSecretSchema, req.body, res, 'platform secret');
    if (!body) return;

    const repo = new PlatformSecretRepository();

    // Enforce "create" semantics (avoid silently overwriting).
    const existing = await repo.findByKey(body.key);
    if (existing) {
      sendError(res, 'CONFLICT', `Platform secret already exists: ${body.key}`, 409);
      return;
    }

    const created = await repo.upsertSecret({
      key: body.key,
      value: body.value,
      description: body.description,
      updatedBy: req.user!.id,
    });

    const payload: PlatformSecretResponse = {
      secret: toSummary(created),
    };

    sendSuccess(res, payload, 201);
  } catch (error) {
    handleError(error, res, 'creating platform secret');
  }
});

// PUT /admin/platform-secrets/:key - Update a platform secret (value and/or description)
router.put('/admin/platform-secrets/:key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can update platform secrets', 403);
      return;
    }

    const params = validateData(z.object({ key: PlatformSecretKeySchema }), req.params, res, 'platform secret key');
    if (!params) return;

    const body = validateData(UpdatePlatformSecretSchema, req.body, res, 'platform secret update');
    if (!body) return;

    const repo = new PlatformSecretRepository();
    const updated = await repo.updateSecretByKey({
      key: params.key,
      value: body.value,
      description: body.description,
      updatedBy: req.user!.id,
    });

    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Platform secret not found', 404, { key: params.key });
      return;
    }

    const payload: PlatformSecretResponse = {
      secret: toSummary(updated),
    };

    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'updating platform secret');
  }
});

// DELETE /admin/platform-secrets/:key - Delete a platform secret
router.delete('/admin/platform-secrets/:key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can delete platform secrets', 403);
      return;
    }

    const params = validateData(z.object({ key: PlatformSecretKeySchema }), req.params, res, 'platform secret key');
    if (!params) return;

    const repo = new PlatformSecretRepository();
    const deleted = await repo.deleteByKey(params.key);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Platform secret not found', 404, { key: params.key });
      return;
    }

    sendSuccess(res, { message: 'Platform secret deleted' });
  } catch (error) {
    handleError(error, res, 'deleting platform secret');
  }
});

export default router;
