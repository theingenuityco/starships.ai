import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { AgentRepository, AgentTokenRepository } from '@starships/models';
import { createHash, randomBytes } from 'crypto';

const router: Router = Router();

/** sha256 hex of a token secret. We only ever persist the hash. */
function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function mintSecret(): string {
  return `sk-ship-${randomBytes(24).toString('base64url')}`;
}

function publicToken(t: { id: string; agentId: string; name?: string | null; lastUsedAt?: string | null; expiresAt?: string | null; revokedAt?: string | null; createdAt: string }) {
  // Never expose tokenHash.
  return {
    id: t.id,
    agentId: t.agentId,
    name: t.name ?? null,
    lastUsedAt: t.lastUsedAt ?? null,
    expiresAt: t.expiresAt ?? null,
    revokedAt: t.revokedAt ?? null,
    createdAt: t.createdAt,
  };
}

// GET /starships/:starshipId/agent-tokens - List tokens (metadata only)
router.get('/starships/:starshipId/agent-tokens', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, req.user!.id, res))) return;

    const tokens = await new AgentTokenRepository().listByStarship(params.starshipId);
    sendSuccess(res, tokens.map(publicToken));
  } catch (error) {
    handleError(error, res, 'listing agent tokens');
  }
});

// POST /starships/:starshipId/agent-tokens - Mint a token for an agent (owner only)
// Returns the raw secret ONCE; only its hash is stored.
router.post('/starships/:starshipId/agent-tokens', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    if (!(await verifyStarshipOwnerAccess(params.starshipId, req.user!.id, res))) return;

    const body = validateData(
      z.object({
        agentId: IdSchema,
        name: z.string().max(255).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
        expiresAt: z.string().datetime().optional(),
      }),
      req.body,
      res,
      'mint token'
    );
    if (!body) return;

    // Agent must belong to this starship.
    const agent = await new AgentRepository().findById(body.agentId);
    if (!agent || String(agent.starshipId) !== String(params.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Agent not found in this starship', 400, { agentId: body.agentId });
      return;
    }

    const secret = mintSecret();
    const record = await new AgentTokenRepository().create({
      agentId: body.agentId,
      starshipId: params.starshipId,
      tokenHash: hashToken(secret),
      name: body.name ?? null,
      expiresAt: body.expiresAt ?? null,
      createdByUserId: req.user!.id,
    });

    // The secret is returned exactly once.
    sendSuccess(res, { token: secret, record: publicToken(record) }, 201);
  } catch (error) {
    handleError(error, res, 'minting agent token');
  }
});

// DELETE /agent-tokens/:id - Revoke a token (owner only)
router.delete('/agent-tokens/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'token parameter');
    if (!params) return;

    const repo = new AgentTokenRepository();
    const token = await repo.findById(params.id);
    if (!token) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Token not found', 404, { id: params.id });
      return;
    }
    if (!(await verifyStarshipOwnerAccess(token.starshipId, req.user!.id, res))) return;

    const revoked = await repo.revoke(params.id);
    sendSuccess(res, { revoked });
  } catch (error) {
    handleError(error, res, 'revoking agent token');
  }
});

export default router;
