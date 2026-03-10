import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentRepository, AgentSpriteAssetRepository } from '@starships/models';
import crypto from 'crypto';

const router: Router = Router();

function sha13(input: string): string {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex').slice(0, 13);
}

function deriveAppearanceKey(args: { agentId: string; avatarAttachmentId?: string | null; styleId: string; modelVersion: string; generatorVersion: string }): string {
  const agentId = String(args.agentId || '').trim();
  const avatar = String(args.avatarAttachmentId || '').trim();
  const styleId = String(args.styleId || 'default').trim() || 'default';
  const modelVersion = String(args.modelVersion || 'unknown').trim() || 'unknown';
  const generatorVersion = String(args.generatorVersion || 'v1').trim() || 'v1';
  return sha13(`${agentId}:${avatar}:${styleId}:${modelVersion}:${generatorVersion}`);
}

const GenerateSchema = z
  .object({
    styleId: z.string().trim().min(1).max(128).optional(),
    modelVersion: z.string().trim().min(1).max(128).optional(),
    generatorVersion: z.string().trim().min(1).max(128).optional(),
    appearanceKey: z.string().trim().min(1).max(255).optional(),
    staticBasePath: z.string().trim().min(1).max(1000).nullable().optional(),
  })
  .strict();

const PublishSchema = z
  .object({
    spritesheetAttachmentId: z.string().trim().min(1).max(255).nullable().optional(),
    atlasAttachmentId: z.string().trim().min(1).max(255).nullable().optional(),
    staticBasePath: z.string().trim().min(1).max(1000).nullable().optional(),
  })
  .strict();

/**
 * GET /api/v1/agents/:agentId/sprite-assets
 */
router.get('/agents/:agentId/sprite-assets', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ agentId: IdSchema }), req.params, res, 'agent parameter');
    if (!params) return;
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const agentRepo = new AgentRepository();
    const agent = await agentRepo.findById(params.agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { agentId: params.agentId });
      return;
    }
    if (!(await verifyStarshipAccess(agent.starshipId, userId, res))) return;

    const repo = new AgentSpriteAssetRepository();
    const items = await repo.listByAgent(agent.id);
    sendSuccess(res, { agentId: agent.id, items }, 200);
  } catch (error) {
    handleError(error, res, 'list agent sprite assets');
  }
});

/**
 * POST /api/v1/agents/:agentId/sprite-assets/generate
 *
 * Creates (or returns) a draft registry row for the agent's current avatar-derived appearanceKey.
 * Asset bytes are produced offline (script) and then published via `/publish`.
 */
router.post('/agents/:agentId/sprite-assets/generate', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ agentId: IdSchema }), req.params, res, 'agent parameter');
    if (!params) return;
    const body = validateData(GenerateSchema, req.body, res, 'generate sprite asset');
    if (!body) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const agentRepo = new AgentRepository();
    const agent = await agentRepo.findById(params.agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { agentId: params.agentId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(agent.starshipId, userId, res))) return;

    const styleId = String(body.styleId || 'default');
    const modelVersion = String(body.modelVersion || 'unknown');
    const generatorVersion = String(body.generatorVersion || 'v1');
    const avatarAttachmentId = agent.avatarAttachmentId ?? null;

    const computedAppearanceKey = deriveAppearanceKey({ agentId: agent.id, avatarAttachmentId, styleId, modelVersion, generatorVersion });
    const appearanceKey = String(body.appearanceKey || computedAppearanceKey).trim();
    const staticBasePath = body.staticBasePath === undefined ? `/static-assets/game/agents/${appearanceKey}` : body.staticBasePath;

    const repo = new AgentSpriteAssetRepository();
    const asset = await repo.upsertDraftForAppearance({
      agentId: agent.id,
      appearanceKey,
      avatarAttachmentId,
      styleId,
      modelVersion,
      generatorVersion,
      staticBasePath,
    });

    sendSuccess(
      res,
      {
        asset,
        offlineHint: {
          appearanceKey,
          defaultStaticBasePath: staticBasePath,
          expectedFiles: ['spritesheet.png', 'atlas.json'],
        },
      },
      200
    );
  } catch (error) {
    handleError(error, res, 'generate agent sprite asset');
  }
});

/**
 * POST /api/v1/agents/:agentId/sprite-assets/:assetId/publish
 */
router.post('/agents/:agentId/sprite-assets/:assetId/publish', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ agentId: IdSchema, assetId: IdSchema }), req.params, res, 'agent sprite asset parameter');
    if (!params) return;
    const body = validateData(PublishSchema, req.body, res, 'publish sprite asset');
    if (!body) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const agentRepo = new AgentRepository();
    const agent = await agentRepo.findById(params.agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { agentId: params.agentId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(agent.starshipId, userId, res))) return;

    const repo = new AgentSpriteAssetRepository();
    const updated = await repo.publish(params.assetId, {
      spritesheetAttachmentId: body.spritesheetAttachmentId ?? undefined,
      atlasAttachmentId: body.atlasAttachmentId ?? undefined,
      staticBasePath: body.staticBasePath ?? undefined,
    });
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Sprite asset not found', 404, { assetId: params.assetId });
      return;
    }
    sendSuccess(res, { asset: updated }, 200);
  } catch (error) {
    handleError(error, res, 'publish agent sprite asset');
  }
});

/**
 * POST /api/v1/agents/:agentId/sprite-assets/:assetId/reject
 */
router.post('/agents/:agentId/sprite-assets/:assetId/reject', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ agentId: IdSchema, assetId: IdSchema }), req.params, res, 'agent sprite asset parameter');
    if (!params) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const agentRepo = new AgentRepository();
    const agent = await agentRepo.findById(params.agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { agentId: params.agentId });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(agent.starshipId, userId, res))) return;

    const repo = new AgentSpriteAssetRepository();
    const updated = await repo.setStatus(params.assetId, 'rejected');
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Sprite asset not found', 404, { assetId: params.assetId });
      return;
    }
    sendSuccess(res, { asset: updated }, 200);
  } catch (error) {
    handleError(error, res, 'reject agent sprite asset');
  }
});

export default router;

