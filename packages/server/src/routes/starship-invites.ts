import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { getEnvConfig } from '@starships/env';
import { StarshipInviteTokenRepository, StarshipMemberRepository } from '@starships/models';
import type { CreateStarshipInviteRequest } from '@starships/protocol';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();
const env = getEnvConfig();

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

function buildClientInviteUrl(token: string): string {
  // Invite links should be rooted at PUBLIC_URL (not CLIENT_URL / APP_URL),
  // since deployments may not expose the client separately.
  const base = (env.PUBLIC_URL || '').trim();
  try {
    const u = new URL('/accept-invite', base);
    u.searchParams.set('invite', token);
    return u.toString();
  } catch {
    // Fallback (best-effort)
    return `${base.replace(/\/+$/g, '')}/accept-invite?invite=${encodeURIComponent(token)}`;
  }
}

// POST /starships/:id/invites - create an email invite link (owner-only)
router.post('/starships/:id/invites', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.id;

    const body = validateData(
      z.object({
        email: z.string().email().max(255),
        role: z.enum(['collaborator', 'admin']).optional(),
      }),
      req.body as CreateStarshipInviteRequest,
      res,
      'starship invite'
    );
    if (!body) return;

    // Authorization: owner-only (members cannot invite)
    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId });
      return;
    }

    const inviteRepo = new StarshipInviteTokenRepository();
    // Cancel any previous outstanding invites for this email (best-effort idempotency)
    await inviteRepo.cancelOutstandingInvitesForEmail(starshipId, body.email).catch(() => 0);

    const { token, expiresAt } = await inviteRepo.generateToken({
      starshipId,
      invitedEmail: body.email,
      invitedByUserId: userId,
      role: body.role ?? 'collaborator',
    });

    const inviteUrl = buildClientInviteUrl(token);

    const emailService = new EmailService();
    await emailService.sendStarshipInviteEmail({
      invitedEmail: body.email,
      inviteUrl,
      starshipName: starship.name,
      inviterName: (req.user as unknown as { displayName?: string; email?: string })?.displayName || (req.user as unknown as { email?: string })?.email,
    });

    sendSuccess(res, { ok: true, inviteUrl, expiresAt }, 201);
  } catch (error) {
    handleError(error, res, 'creating starship invite');
  }
});

// POST /starship-invites/accept - accept an invite token (JWT required)
router.post('/starship-invites/accept', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const body = validateData(
      z.object({
        token: z.string().min(1),
      }),
      req.body,
      res,
      'invite acceptance'
    );
    if (!body) return;

    const userEmail = String((req.user as unknown as { email?: string })?.email || '').trim().toLowerCase();
    if (!userEmail) {
      sendError(res, 'VALIDATION_ERROR', 'Your account must have an email address to accept this invite', 400);
      return;
    }

    const inviteRepo = new StarshipInviteTokenRepository();
    const invite = await inviteRepo.validateAndConsumeTokenForEmail(body.token, userEmail);
    if (!invite) {
      // Do not reveal whether token exists vs email mismatch; treat as invalid
      sendError(res, 'VALIDATION_ERROR', 'Invalid or expired invite token', 400);
      return;
    }

    const memberRepo = new StarshipMemberRepository();
    await memberRepo.createOrIgnoreMember({
      starshipId: invite.starshipId,
      userId,
      role: invite.role,
      createdBy: invite.invitedByUserId,
    });

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(invite.starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId: invite.starshipId });
      return;
    }

    sendSuccess(res, { starship }, 200);
  } catch (error) {
    handleError(error, res, 'accepting starship invite');
  }
});

export default router;

