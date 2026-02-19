import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { ConversationReadStateRepository, NotificationRepository, getConnection } from '@starships/models';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { NotificationStreamBus } from '@/services/NotificationStreamBus';

const router: Router = Router();

async function attachThreadContext(starshipId: string, notifications: any[]): Promise<any[]> {
  try {
    const sid = String(starshipId || '').trim();
    if (!sid) return notifications;
    const list = Array.isArray(notifications) ? notifications : [];
    if (list.length === 0) return list;

    const threadIds = Array.from(
      new Set(
        list
          .map((n: any) => (typeof n?.conversationId === 'string' ? String(n.conversationId).trim() : ''))
          .filter(Boolean)
      )
    );
    if (threadIds.length === 0) return list;

    const db = getConnection();
    const rows = await db.query<{ thread_id: string; parent_conversation_id: string; parent_channel_slug: string }>(
      `
      SELECT
        c.id AS thread_id,
        c.parent_conversation_id,
        ch.slug AS parent_channel_slug
      FROM conversations c
      INNER JOIN channels ch
              ON ch.conversation_id = c.parent_conversation_id
             AND ch.starship_id = c.starship_id
      WHERE c.starship_id = $1::text
        AND c.id = ANY($2::text[])
        AND c.parent_conversation_id IS NOT NULL
      `,
      [sid, threadIds]
    );
    if (!rows || rows.length === 0) return list;

    const map = new Map<string, { parentId: string; parentSlug: string }>();
    for (const r of rows) {
      const tid = String(r.thread_id || '').trim();
      const pid = String(r.parent_conversation_id || '').trim();
      const pslug = String(r.parent_channel_slug || '').trim();
      if (tid && pid) map.set(tid, { parentId: pid, parentSlug: pslug });
    }
    if (map.size === 0) return list;

    return list.map((n: any) => {
      const cid = typeof n?.conversationId === 'string' ? String(n.conversationId).trim() : '';
      const hit = cid ? map.get(cid) : null;
      if (!hit) return n;
      return { ...n, threadParentConversationId: hit.parentId, threadParentChannelSlug: hit.parentSlug || null };
    });
  } catch {
    return Array.isArray(notifications) ? notifications : [];
  }
}

/**
 * GET /starships/:starshipId/notifications
 * List notifications for inbox (paged by (created_at, id) cursor).
 */
router.get('/starships/:starshipId/notifications', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const query = validateData(
      z.object({
        limit: z.coerce.number().min(1).max(200).optional(),
        beforeCreatedAt: z.string().datetime().optional(),
        beforeId: IdSchema.optional(),
      }),
      req.query,
      res,
      'notifications query'
    );
    if (!query) return;
    if ((query.beforeCreatedAt && !query.beforeId) || (!query.beforeCreatedAt && query.beforeId)) {
      sendError(res, 'VALIDATION_ERROR', 'beforeCreatedAt and beforeId must be provided together', 400);
      return;
    }
    const limit = query.limit ?? 50;

    if (wantsStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      try {
        res.socket?.setNoDelay(true);
      } catch {
        /* ignore */
      }
      try {
        const maybe = res as unknown as { flushHeaders?: () => void };
        if (typeof maybe.flushHeaders === 'function') maybe.flushHeaders();
      } catch {
        /* ignore */
      }
      try {
        res.write(':ok\n\n');
      } catch {
        /* ignore */
      }

      const bus = NotificationStreamBus.getInstance();
      const redisReader = bus.createReaderClient();
      const repo = new NotificationRepository();

      try {
        await redisReader.connect();
      } catch {
        /* ignore */
      }

      let closed = false;
      res.on('close', () => {
        closed = true;
        try {
          redisReader.disconnect();
        } catch {
          /* ignore */
        }
      });

      const qpCursorRaw = typeof req.query.cursor === 'string' ? String(req.query.cursor) : '';
      const qpCursor = qpCursorRaw && qpCursorRaw.trim() ? qpCursorRaw.trim() : '';
      const lastEventIdHeaderRaw = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;
      const lastEventIdHeader = lastEventIdHeaderRaw && lastEventIdHeaderRaw.trim() ? lastEventIdHeaderRaw.trim() : undefined;

      let len = 0;
      let lastId: string | null = null;
      try {
        [len, lastId] = await Promise.all([bus.getLen(params.starshipId, authUserId), bus.getLastId(params.starshipId, authUserId)]);
      } catch {
        /* ignore */
      }

      const snapshotCursor = lastId || qpCursor || lastEventIdHeader || '0-0';
      let cursor = snapshotCursor;

      const notifications = await attachThreadContext(
        params.starshipId,
        await repo.listForUser({
        starshipId: params.starshipId,
        userId: authUserId,
        limit,
        ...(query.beforeCreatedAt && query.beforeId ? { beforeCreatedAt: query.beforeCreatedAt, beforeId: query.beforeId } : null),
        })
      );
      const unread = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });
      const oldest = notifications.length > 0 ? notifications[notifications.length - 1] : null;
      const hasMoreBefore = notifications.length >= limit;

      res.write(`id: ${snapshotCursor}\n`);
      res.write(`event: snapshot\n`);
      res.write(
        `data: ${JSON.stringify({
          starshipId: params.starshipId,
          userId: authUserId,
          notifications,
          unread,
          hasMoreBefore,
          oldestCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
        })}\n\n`
      );
      try {
        res.write(`event: stream_debug\n`);
        res.write(`data: ${JSON.stringify({ starshipId: params.starshipId, userId: authUserId, cursor, len, lastId })}\n\n`);
      } catch {
        /* ignore */
      }

      while (!closed && !res.writableEnded && !res.destroyed) {
        // Keep per-connection work bounded (avoid long blocking reads + huge batches).
        const batch = await bus.read(params.starshipId, authUserId, cursor, { blockMs: 5_000, count: 50 }, redisReader);
        if (!batch || batch.length === 0) continue;
        for (const item of batch) {
          cursor = item.id;
          const evt = item.evt;
          try {
            res.write(`id: ${item.id}\n`);
            res.write(`event: ${evt.type}\n`);
            res.write(`data: ${JSON.stringify((evt as any).data)}\n\n`);
            try {
              const maybe = res as unknown as { flush?: () => void };
              if (typeof maybe.flush === 'function') maybe.flush();
            } catch {
              /* ignore */
            }
          } catch {
            closed = true;
            break;
          }
        }

        // Heartbeat comment for proxies / long-lived connections.
        // (Also gives us a low-cost check that the socket is still writable.)
        try {
          res.write(`:ping\n\n`);
        } catch {
          closed = true;
        }
      }
      return;
    }

    const repo = new NotificationRepository();
    const notifications = await attachThreadContext(
      params.starshipId,
      await repo.listForUser({
      starshipId: params.starshipId,
      userId: authUserId,
      limit,
      ...(query.beforeCreatedAt && query.beforeId ? { beforeCreatedAt: query.beforeCreatedAt, beforeId: query.beforeId } : null),
      })
    );
    const counts = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });

    const oldest = notifications.length > 0 ? notifications[notifications.length - 1] : null;
    sendSuccess(
      res,
      {
        notifications,
        unread: counts,
        hasMoreBefore: notifications.length >= limit,
        oldestCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
      },
      200
    );
  } catch (error) {
    handleError(error, res, 'listing notifications');
  }
});

/**
 * POST /starships/:starshipId/notifications/mark-seen
 */
router.post('/starships/:starshipId/notifications/mark-seen', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const body = validateData(
      z.object({
        before: z.string().datetime().optional().nullable(),
      }),
      req.body,
      res,
      'mark-seen body'
    );
    if (!body) return;

    const repo = new NotificationRepository();
    const result = await repo.markSeen({ starshipId: params.starshipId, userId: authUserId, before: body.before ?? null });
    const unread = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });

    // Best-effort: push state update to live streams
    try {
      const bus = NotificationStreamBus.getInstance();
      await bus.publish(params.starshipId, authUserId, { type: 'notification.state', data: { unread } });
    } catch {
      /* ignore */
    }

    sendSuccess(res, { updated: result.updated, unread }, 200);
  } catch (error) {
    handleError(error, res, 'marking notifications seen');
  }
});

/**
 * POST /starships/:starshipId/notifications/mark-read
 */
router.post('/starships/:starshipId/notifications/mark-read', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const body = validateData(
      z.object({
        conversationId: IdSchema.optional().nullable(),
      }),
      req.body,
      res,
      'mark-read body'
    );
    if (!body) return;

    const repo = new NotificationRepository();
    const result = await repo.markRead({ starshipId: params.starshipId, userId: authUserId, conversationId: body.conversationId ?? null });
    const unread = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });

    try {
      const bus = NotificationStreamBus.getInstance();
      await bus.publish(params.starshipId, authUserId, { type: 'notification.state', data: { unread } });
    } catch {
      /* ignore */
    }

    sendSuccess(res, { updated: result.updated, unread }, 200);
  } catch (error) {
    handleError(error, res, 'marking notifications read');
  }
});

/**
 * POST /conversations/:conversationId/read
 *
 * Marks a conversation as read for the current user:
 * - upserts conversation_read_states cursor to the latest message
 * - marks notifications for that conversation as read
 */
router.post('/conversations/:conversationId/read', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Resolve starshipId from conversation for access checks + notification state updates
    const db = getConnection();
    const convoRow = await db.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [
      params.conversationId,
    ]);
    const starshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
    if (!starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404);
      return;
    }
    if (!(await verifyStarshipAccess(starshipId, authUserId, res))) return;

    // Authorization: ensure user can access this conversation (private channels / DMs / shared convos).
    // NOTE: starship membership alone is not sufficient for private channels and DMs.
    const dm = await db.queryOne<{ dm_type: string; user_id: string | null; user_a_id: string | null; user_b_id: string | null }>(
      'SELECT dm_type, user_id, user_a_id, user_b_id FROM direct_messages WHERE conversation_id = $1',
      [params.conversationId]
    );
    if (dm) {
      const t = String(dm.dm_type || '');
      const dmUserId = dm.user_id ? String(dm.user_id) : '';
      const a = dm.user_a_id ? String(dm.user_a_id) : '';
      const b = dm.user_b_id ? String(dm.user_b_id) : '';
      const ok = t === 'user_agent' ? dmUserId === authUserId : t === 'user_user' ? authUserId === a || authUserId === b : false;
      if (!ok) {
        sendError(res, 'ACCESS_DENIED', 'User is not a participant in this direct message', 403);
        return;
      }
    } else {
      const ch = await db.queryOne<{ is_private: boolean }>('SELECT is_private FROM channels WHERE conversation_id = $1', [
        params.conversationId,
      ]);
      if (ch?.is_private) {
        const member = await db.queryOne<{ ok: boolean }>(
          'SELECT true as ok FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1',
          [params.conversationId, authUserId]
        );
        if (!member?.ok) {
          sendError(res, 'ACCESS_DENIED', 'User is not a member of this private channel', 403);
          return;
        }
      }
    }

    const last = await db.queryOne<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [params.conversationId]
    );
    const lastId = last?.id ? String(last.id) : null;
    const lastAt = last?.created_at ? new Date(String(last.created_at)).toISOString() : null;

    const readRepo = new ConversationReadStateRepository();
    const notifRepo = new NotificationRepository();
    const existing = await readRepo.get(params.conversationId, authUserId);
    const existingLastReadAt = existing?.lastReadAt ? String(existing.lastReadAt) : null;
    const existingLastReadMessageId = existing?.lastReadMessageId ? String(existing.lastReadMessageId) : null;

    const hasUnreadMessages = Boolean(lastAt && (!existingLastReadAt || Date.parse(lastAt) > Date.parse(existingLastReadAt)));

    // Mark any unread notifications as read (mentions/reactions/DM notifications).
    const notifResult = await notifRepo.markRead({ starshipId, userId: authUserId, conversationId: params.conversationId });

    // Only bump the persisted per-user "activity" timestamp when something actually changed:
    // - unread messages were present (Slack-style unread highlight), or
    // - unread notifications existed (badge counts).
    const shouldTouchReadState = hasUnreadMessages || (notifResult?.updated ?? 0) > 0;

    const nextLastReadAt = hasUnreadMessages
      ? lastAt
      : existingLastReadAt ?? (shouldTouchReadState ? new Date().toISOString() : null);
    const nextLastReadMessageId = hasUnreadMessages ? lastId : existingLastReadMessageId;

    const state = shouldTouchReadState
      ? await readRepo.upsert({
          conversationId: params.conversationId,
          userId: authUserId,
          lastReadMessageId: nextLastReadMessageId,
          lastReadAt: nextLastReadAt,
        })
      : existing;

    const unread = await notifRepo.getUnreadCounts({ starshipId, userId: authUserId });
    try {
      const bus = NotificationStreamBus.getInstance();
      await bus.publish(starshipId, authUserId, { type: 'notification.state', data: { unread } });
    } catch {
      /* ignore */
    }

    sendSuccess(res, { readState: state, unread }, 200);
  } catch (error) {
    handleError(error, res, 'marking conversation read');
  }
});

/**
 * POST /starships/:starshipId/unread
 *
 * Returns unread status for a list of conversationIds for the current user.
 * Used to render Slack-style "unread" styling in channel/DM lists.
 */
router.post('/starships/:starshipId/unread', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const body = validateData(
      z.object({
        conversationIds: z.array(IdSchema).max(500),
      }),
      req.body,
      res,
      'unread body'
    );
    if (!body) return;

    const ids = Array.from(new Set((body.conversationIds || []).map((x) => String(x)).filter(Boolean)));
    if (ids.length === 0) {
      sendSuccess(res, { unreadByConversationId: {} }, 200);
      return;
    }

    const db = getConnection();
    const rows = await db.query<{
      conversation_id: string;
      last_message_at: string | null;
      last_read_at: string | null;
      last_activity_at: string | null;
    }>(
      `
      WITH scoped AS (
        SELECT c.id AS conversation_id
          FROM conversations c
          LEFT JOIN channels ch ON ch.conversation_id = c.id
          LEFT JOIN direct_messages dm ON dm.conversation_id = c.id
         WHERE c.starship_id = $1::text
           AND c.id = ANY($3::text[])
           AND (
             -- DM access
             (dm.conversation_id IS NOT NULL AND (
               (dm.dm_type = 'user_agent' AND dm.user_id = $2::text)
               OR (dm.dm_type = 'user_user' AND ($2::text = dm.user_a_id OR $2::text = dm.user_b_id))
             ))
             OR
             -- Channel access: public OR private membership
             (ch.conversation_id IS NOT NULL AND (
               ch.is_private = false
               OR EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2::text LIMIT 1)
             ))
             OR
             -- Other conversation types: owner or explicit member
             -- Note: conversations table has no owner column; starship access is enforced above.
             (dm.conversation_id IS NULL AND ch.conversation_id IS NULL)
           )
      ),
      last_msg AS (
        SELECT m.conversation_id, MAX(m.created_at) AS last_message_at
          FROM messages m
          INNER JOIN scoped s ON s.conversation_id = m.conversation_id
         GROUP BY m.conversation_id
      )
      SELECT
        s.conversation_id,
        lm.last_message_at,
        rs.last_read_at,
        rs.updated_at AS last_activity_at
      FROM scoped s
      LEFT JOIN last_msg lm ON lm.conversation_id = s.conversation_id
      LEFT JOIN conversation_read_states rs
        ON rs.conversation_id = s.conversation_id
       AND rs.user_id = $2
      `,
      [params.starshipId, authUserId, ids]
    );

    const unreadByConversationId: Record<
      string,
      { hasUnread: boolean; lastMessageAt: string | null; lastReadAt: string | null; lastActivityAt: string | null }
    > = {};
    for (const r of rows) {
      const cid = String(r.conversation_id || '');
      const lastMessageAt = r.last_message_at ? new Date(String(r.last_message_at)).toISOString() : null;
      const lastReadAt = r.last_read_at ? new Date(String(r.last_read_at)).toISOString() : null;
      const lastActivityAt = r.last_activity_at ? new Date(String(r.last_activity_at)).toISOString() : null;
      const hasUnread = Boolean(lastMessageAt && (!lastReadAt || Date.parse(lastMessageAt) > Date.parse(lastReadAt)));
      if (cid) unreadByConversationId[cid] = { hasUnread, lastMessageAt, lastReadAt, lastActivityAt };
    }

    sendSuccess(res, { unreadByConversationId }, 200);
  } catch (error) {
    handleError(error, res, 'fetching unread status');
  }
});

export default router;
