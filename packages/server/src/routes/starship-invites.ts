import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { getEnvConfig } from '@starships/env';
import { StarshipInviteTokenRepository, StarshipMemberRepository, getConnection } from '@starships/models';
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
  // Invite links must be rooted at the canonical PUBLIC origin users visit.
  // This should be the same origin that serves `/accept-invite` in the browser.
  // (In local dev, that's the reverse proxy; in prod, that's the public domain.)
  const publicUrl = String(env.PUBLIC_URL || '').trim();
  const clientUrl = String(env.CLIENT_URL || '').trim();
  const base = publicUrl || clientUrl;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/server/src/routes/starship-invites.ts:buildClientInviteUrl',message:'buildClientInviteUrl called',data:{publicUrlBase:publicUrl?publicUrl.replace(/\?.*$/,''):'',clientUrlBase:clientUrl?clientUrl.replace(/\?.*$/,''):'',chosenBase:base?base.replace(/\?.*$/,''):'',chosenSource:publicUrl?'PUBLIC_URL':(clientUrl?'CLIENT_URL':'none'),tokenLen:typeof token==='string'?token.length:null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  try {
    const u = new URL('/accept-invite', base);
    u.searchParams.set('invite', token);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/server/src/routes/starship-invites.ts:buildClientInviteUrl',message:'buildClientInviteUrl success',data:{inviteUrlOrigin:u.origin,inviteUrlPath:u.pathname,hasQuery:u.search.length>0},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return u.toString();
  } catch {
    // Fallback (best-effort)
    const out = `${base.replace(/\/+$/g, '')}/accept-invite?invite=${encodeURIComponent(token)}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/server/src/routes/starship-invites.ts:buildClientInviteUrl',message:'buildClientInviteUrl fallback',data:{outHasAcceptInvite:out.includes('/accept-invite'),outLen:out.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return out;
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

    const connection = getConnection();
    const [memberRows, inviteRows, ownerRow] = await Promise.all([
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
                COALESCE(NULLIF(u.avatar, ''), oa.oauth_avatar) as avatar
           FROM starship_members m
           JOIN users u ON u.id = m.user_id
            LEFT JOIN LATERAL (
              SELECT (profile_data->>'avatar') as oauth_avatar
                FROM oauth_accounts
               WHERE user_id = u.id
               ORDER BY updated_at DESC
               LIMIT 1
            ) oa ON true
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
      connection.queryOne<{
        email: string | null;
        display_name: string | null;
        avatar: string | null;
      }>(
        `SELECT u.email,
                u.display_name,
                COALESCE(NULLIF(u.avatar, ''), oa.oauth_avatar) as avatar
           FROM users u
           LEFT JOIN LATERAL (
             SELECT (profile_data->>'avatar') as oauth_avatar
               FROM oauth_accounts
              WHERE user_id = u.id
              ORDER BY updated_at DESC
              LIMIT 1
           ) oa ON true
          WHERE u.id = $1`,
        [starship.ownerId]
      ),
    ]);

    const owner = {
      userId: starship.ownerId,
      role: 'owner' as const,
      createdAt: starship.createdAt,
      email: ownerRow?.email ?? null,
      displayName: ownerRow?.display_name ?? null,
      avatar: ownerRow?.avatar ?? null,
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

// DELETE /starships/:id/members/:memberUserId - remove a member (owner-only)
router.delete('/starships/:id/members/:memberUserId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ id: IdSchema, memberUserId: IdSchema }), req.params, res, 'member removal');
    if (!params) return;
    const starshipId = params.id;
    const memberUserId = params.memberUserId;

    // Authorization: owner-only
    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId });
      return;
    }

    // Never allow removing the owner via this endpoint.
    if (memberUserId === starship.ownerId) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot remove the starship owner', 400);
      return;
    }

    const memberRepo = new StarshipMemberRepository();
    const removed = await memberRepo.removeMember(starshipId, memberUserId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'removing starship member');
  }
});

// DELETE /starships/:id/invites?email=... - revoke pending invite(s) for email (owner-only)
router.delete('/starships/:id/invites', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.id;

    const query = validateData(
      z.object({
        email: z.string().email().max(255),
      }),
      req.query,
      res,
      'invite revoke'
    );
    if (!query) return;

    // Authorization: owner-only
    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

    const inviteRepo = new StarshipInviteTokenRepository();
    const revokedCount = await inviteRepo.cancelOutstandingInvitesForEmail(starshipId, query.email).catch(() => 0);

    sendSuccess(res, { revokedCount }, 200);
  } catch (error) {
    handleError(error, res, 'revoking starship invite');
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/server/src/routes/starship-invites.ts:/starships/:id/invites',message:'created inviteUrl',data:{publicUrl:(env.PUBLIC_URL||'').trim(),inviteUrlOrigin:(()=>{try{return new URL(inviteUrl).origin}catch{return 'invalid'}})(),hostHeader:String(req.headers?.host||'')},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

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

// POST /starship-invites/preview - preview invite context without consuming (public)
router.post('/starship-invites/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(
      z.object({
        token: z.string().min(1),
      }),
      req.body,
      res,
      'invite preview'
    );
    if (!body) return;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/server/src/routes/starship-invites.ts:/starship-invites/preview',message:'preview endpoint hit',data:{tokenLen:typeof body.token==='string'?body.token.length:null,hostHeader:String(req.headers?.host||''),xForwardedHost:String(req.headers?.['x-forwarded-host']||''),xForwardedProto:String(req.headers?.['x-forwarded-proto']||''),originalUrl:String((req as any).originalUrl||'')},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

    const inviteRepo = new StarshipInviteTokenRepository();
    // NOTE: `@starships/models` is imported via its built `dist` types in this repo.
    // In local/dev test runs, that `dist` may lag behind source edits. Use a narrow
    // type assertion so server type-checking doesn't block on package build order.
    const invite = await (
      inviteRepo as unknown as StarshipInviteTokenRepository & {
        getValidInviteByToken: (token: string) => Promise<{
          starshipId: string;
          invitedEmail: string;
          invitedByUserId: string | null;
          role: 'admin' | 'collaborator';
          expiresAt: string;
        } | null>;
      }
    ).getValidInviteByToken(body.token);
    if (!invite) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid or expired invite token', 400);
      return;
    }

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(invite.starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId: invite.starshipId });
      return;
    }

    sendSuccess(
      res,
      {
        invitedEmail: invite.invitedEmail,
        role: invite.role,
        expiresAt: invite.expiresAt,
        starship: {
          id: starship.id,
          slug: starship.slug,
          name: starship.name,
        },
      },
      200
    );
  } catch (error) {
    handleError(error, res, 'previewing starship invite');
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

