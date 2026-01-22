import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { getEnvConfig } from '@starships/env';
import { StarshipInviteTokenRepository, StarshipMemberRepository, UserRepository, getConnection } from '@starships/models';
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

// GET /starships/:id/members - list active members + pending invites (owner-only)
router.get('/starships/:id/members', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.id;

    // Authorization: owner-only (members cannot view invite list)
    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId });
      return;
    }

    const userRepo = new UserRepository();

    const connection = getConnection();
    const [memberRows, inviteRows, ownerUser] = await Promise.all([
      connection.query<{
        user_id: string;
        role: 'admin' | 'collaborator';
        created_at: string;
        email: string | null;
        display_name: string | null;
        avatar: string | null;
      }>(
        `SELECT m.user_id,
                m.role,
                m.created_at,
                u.email,
                u.display_name,
                u.avatar
           FROM starship_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.starship_id = $1
          ORDER BY m.created_at ASC`,
        [starshipId]
      ),
      connection.query<{
        invited_email: string;
        invited_by_user_id: string | null;
        role: 'admin' | 'collaborator';
        created_at: string;
        expires_at: string;
      }>(
        `SELECT invited_email, invited_by_user_id, role, created_at, expires_at
           FROM starship_invite_tokens
          WHERE starship_id = $1
            AND NOT consumed
            AND expires_at > NOW()
          ORDER BY created_at DESC`,
        [starshipId]
      ),
      userRepo.findById(starship.ownerId),
    ]);

    const owner = {
      userId: starship.ownerId,
      role: 'owner' as const,
      createdAt: starship.createdAt,
      email: ownerUser?.email ?? null,
      displayName: (ownerUser as any)?.displayName ?? null,
      avatar: (ownerUser as any)?.avatar ?? null,
    };

    const members = [
      owner,
      ...memberRows.map((m) => ({
        userId: String(m.user_id),
        role: m.role,
        createdAt: String(m.created_at),
        email: m.email ?? null,
        displayName: m.display_name ?? null,
        avatar: m.avatar ?? null,
      })),
    ];

    const invites = inviteRows.map((r) => ({
      invitedEmail: String(r.invited_email),
      invitedByUserId: r.invited_by_user_id ?? null,
      role: r.role,
      createdAt: String(r.created_at),
      expiresAt: String(r.expires_at),
    }));

    sendSuccess(res, { members, invites }, 200);
  } catch (error) {
    handleError(error, res, 'listing starship members');
  }
});

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

