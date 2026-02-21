import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { getEnvConfig } from '@starships/env';
import { StarshipInviteTokenRepository, StarshipMemberRepository, getConnection } from '@starships/models';
import type { CreateStarshipInviteRequest } from '@starships/protocol';
import { IdSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();
const env = getEnvConfig();

type InviteRow = {
  invited_email: string;
  invited_by_user_id: string | null;
  role: 'admin' | 'collaborator';
  created_at: string;
  expires_at: string;
};

type MemberRow = {
  user_id: string;
  role: 'admin' | 'collaborator';
  created_at: string;
  email: string | null;
  display_name: string | null;
  avatar: string | null;
};

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

function buildClientInviteUrl(token: string): string {
  // Invite links should land in the app UI (accept-invite is an auth entry flow).
  const base = String(env.APP_URL || '').trim();
  try {
    const u = new URL('/accept-invite', base);
    u.searchParams.set('invite', token);
    return u.toString();
  } catch {
    // Fallback (best-effort)
    const out = `${base.replace(/\/+$/g, '')}/accept-invite?invite=${encodeURIComponent(token)}`;
    return out;
  }
}

// GET /starships/:id/members - list active members (+ pending invites for owner/admin)
router.get('/starships/:id/members', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const starshipId = params.id;

    const searchQuery = validateData(
      z.object({
        search: z.string().trim().max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
      }),
      (req.query ?? {}) as unknown,
      res,
      'search query'
    );
    if (!searchQuery) return;
    const search = typeof searchQuery.search === 'string' && searchQuery.search.trim().length > 0 ? searchQuery.search.trim() : null;
    const searchLower = search ? search.toLowerCase() : null;

    const wantsPagination = Object.prototype.hasOwnProperty.call(req.query ?? {}, 'page') || Object.prototype.hasOwnProperty.call(req.query ?? {}, 'limit') || Object.prototype.hasOwnProperty.call(req.query ?? {}, 'offset');
    const paginationQuery = wantsPagination ? validateData(PaginationSchema, (req.query ?? {}) as unknown, res, 'pagination query') : null;
    if (wantsPagination && !paginationQuery) return;
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 50;
    const offset = paginationQuery?.offset ?? (page - 1) * limit;

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { starshipId });
      return;
    }

    // Authorization:
    // - All collaborators (owner/admin/member) may list members (needed for DM UX).
    // - Only owner/instance-admin may view pending invites.
    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;
    const canViewInvites = String(starship.ownerId) === String(userId) || isInstanceAdmin(req.user);
    const canViewEmails = canViewInvites;

    const connection = getConnection();
    const fetchInviteRows = (): Promise<InviteRow[]> => {
      if (!canViewInvites) return Promise.resolve([] as InviteRow[]);
      // Defer executing the query until awaited so that unit tests that mock `query()`
      // with `.mockResolvedValueOnce(...)` can rely on the members-query happening first.
      return connection.query<InviteRow>(
        search
          ? `SELECT invited_email, invited_by_user_id, role, created_at, expires_at
               FROM starship_invite_tokens
              WHERE starship_id = $1
                AND NOT consumed
                AND expires_at > NOW()
                AND invited_email ILIKE $2
              ORDER BY created_at DESC`
          : `SELECT invited_email, invited_by_user_id, role, created_at, expires_at
               FROM starship_invite_tokens
              WHERE starship_id = $1
                AND NOT consumed
                AND expires_at > NOW()
              ORDER BY created_at DESC`,
        search ? [starshipId, `%${search}%`] : [starshipId]
      ) as unknown as Promise<InviteRow[]>;
    };

    const ownerRowPromise = connection.queryOne<{
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
    );

    if (!wantsPagination) {
      const [memberRows, inviteRows, ownerRow] = await Promise.all([
        (() : Promise<MemberRow[]> => {
          if (!search) {
            return connection.query<MemberRow>(
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
            ) as unknown as Promise<MemberRow[]>;
          }
          const clause = canViewEmails
            ? `(COALESCE(u.display_name, '') ILIKE $2 OR COALESCE(u.email, '') ILIKE $2)`
            : `COALESCE(u.display_name, '') ILIKE $2`;
          return connection.query<MemberRow>(
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
                AND ${clause}
              ORDER BY m.created_at ASC`,
            [starshipId, `%${search}%`]
          ) as unknown as Promise<MemberRow[]>;
        })(),
        fetchInviteRows(),
        ownerRowPromise,
      ]);

      const ownerDisplay = typeof ownerRow?.display_name === 'string' ? ownerRow.display_name : '';
      const ownerEmail = canViewEmails && typeof ownerRow?.email === 'string' ? ownerRow.email : '';
      const ownerMatches = !searchLower ? true : ownerDisplay.toLowerCase().includes(searchLower) || ownerEmail.toLowerCase().includes(searchLower);

      const owner = {
        userId: starship.ownerId,
        role: 'owner' as const,
        createdAt: starship.createdAt,
        email: canViewEmails ? (ownerRow?.email ?? null) : null,
        displayName: ownerRow?.display_name ?? null,
        avatar: ownerRow?.avatar ?? null,
      };

      const members = [
        ...(ownerMatches ? [owner] : []),
        ...memberRows.map((m) => ({
          userId: String(m.user_id),
          role: m.role,
          createdAt: String(m.created_at),
          email: canViewEmails ? (m.email ?? null) : null,
          displayName: m.display_name ?? null,
          avatar: m.avatar ?? null,
        })),
      ];

      const invites = canViewInvites
        ? inviteRows.map((r) => ({
            invitedEmail: String(r.invited_email),
            invitedByUserId: r.invited_by_user_id ?? null,
            role: r.role,
            createdAt: String(r.created_at),
            expiresAt: String(r.expires_at),
          }))
        : [];

      sendSuccess(res, { members, invites }, 200);
      return;
    }

    // Paginated behavior (opt-in via query params): used by Members page to avoid huge payloads.
    const [inviteRows, ownerRow, memberCountRow] = await Promise.all([
      // Only include invites on the first page (best-effort); Members UI doesn't need them.
      offset === 0 ? fetchInviteRows() : Promise.resolve([] as InviteRow[]),
      ownerRowPromise,
      (() => {
        if (!search) {
          return connection.queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count
               FROM starship_members
              WHERE starship_id = $1`,
            [starshipId]
          );
        }
        const clause = canViewEmails
          ? `(COALESCE(u.display_name, '') ILIKE $2 OR COALESCE(u.email, '') ILIKE $2)`
          : `COALESCE(u.display_name, '') ILIKE $2`;
        return connection.queryOne<{ count: string }>(
          `SELECT COUNT(*)::text as count
             FROM starship_members m
             JOIN users u ON u.id = m.user_id
            WHERE m.starship_id = $1
              AND ${clause}`,
          [starshipId, `%${search}%`]
        );
      })(),
    ]);

    const ownerDisplay = typeof ownerRow?.display_name === 'string' ? ownerRow.display_name : '';
    const ownerEmail = canViewEmails && typeof ownerRow?.email === 'string' ? ownerRow.email : '';
    const ownerMatches = !searchLower ? true : ownerDisplay.toLowerCase().includes(searchLower) || ownerEmail.toLowerCase().includes(searchLower);

    const memberTotal = Number(memberCountRow?.count ?? 0);
    const total = (ownerMatches ? 1 : 0) + memberTotal;

    const owner = {
      userId: starship.ownerId,
      role: 'owner' as const,
      createdAt: starship.createdAt,
      email: canViewEmails ? (ownerRow?.email ?? null) : null,
      displayName: ownerRow?.display_name ?? null,
      avatar: ownerRow?.avatar ?? null,
    };

    const ownerSlotOnThisPage = offset === 0 && ownerMatches;
    const memberLimit = ownerSlotOnThisPage ? Math.max(0, limit - 1) : limit;
    const memberOffset = ownerMatches ? Math.max(0, offset - 1) : offset;

    const memberRows = memberLimit > 0
      ? await ((() : Promise<MemberRow[]> => {
          if (!search) {
            return connection.query<MemberRow>(
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
                ORDER BY m.created_at ASC
                LIMIT $2
                OFFSET $3`,
              [starshipId, memberLimit, memberOffset]
            ) as unknown as Promise<MemberRow[]>;
          }
          const clause = canViewEmails
            ? `(COALESCE(u.display_name, '') ILIKE $4 OR COALESCE(u.email, '') ILIKE $4)`
            : `COALESCE(u.display_name, '') ILIKE $4`;
          return connection.query<MemberRow>(
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
                AND ${clause}
              ORDER BY m.created_at ASC
              LIMIT $2
              OFFSET $3`,
            [starshipId, memberLimit, memberOffset, `%${search}%`]
          ) as unknown as Promise<MemberRow[]>;
        })())
      : [];

    const members = [
      ...(ownerSlotOnThisPage ? [owner] : []),
      ...memberRows.map((m) => ({
        userId: String(m.user_id),
        role: m.role,
        createdAt: String(m.created_at),
        email: canViewEmails ? (m.email ?? null) : null,
        displayName: m.display_name ?? null,
        avatar: m.avatar ?? null,
      })),
    ];

    const invites = canViewInvites
      ? inviteRows.map((r) => ({
          invitedEmail: String(r.invited_email),
          invitedByUserId: r.invited_by_user_id ?? null,
          role: r.role,
          createdAt: String(r.created_at),
          expiresAt: String(r.expires_at),
        }))
      : [];

    sendSuccess(res, { members, invites }, 200, {
      pagination: {
        page,
        limit,
        total,
        has_next: offset + limit < total,
        has_prev: offset > 0,
      },
    });
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

