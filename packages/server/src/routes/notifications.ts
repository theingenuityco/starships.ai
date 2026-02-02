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

    if (wantsStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      try {
        res.socket?.setNoDelay(true);
      } catch {}
      try {
        const maybe = res as unknown as { flushHeaders?: () => void };
        if (typeof maybe.flushHeaders === 'function') maybe.flushHeaders();
      } catch {}
      try {
        res.write(':ok\n\n');
      } catch {}

      const bus = NotificationStreamBus.getInstance();
      const redisReader = bus.createReaderClient();
      const repo = new NotificationRepository();

      try {
        await redisReader.connect();
      } catch {}

      let closed = false;
      res.on('close', () => {
        closed = true;
        try {
          redisReader.disconnect();
        } catch {}
      });

      const qpCursorRaw = typeof req.query.cursor === 'string' ? String(req.query.cursor) : '';
      const qpCursor = qpCursorRaw && qpCursorRaw.trim() ? qpCursorRaw.trim() : '';
      const lastEventIdHeaderRaw = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;
      const lastEventIdHeader = lastEventIdHeaderRaw && lastEventIdHeaderRaw.trim() ? lastEventIdHeaderRaw.trim() : undefined;

      let len = 0;
      let lastId: string | null = null;
      try {
        [len, lastId] = await Promise.all([bus.getLen(params.starshipId, authUserId), bus.getLastId(params.starshipId, authUserId)]);
      } catch {}

      const snapshotCursor = lastId || qpCursor || lastEventIdHeader || '0-0';
      let cursor = snapshotCursor;

      const notifications = await repo.listForUser({ starshipId: params.starshipId, userId: authUserId, limit: 50 });
      const unread = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });

      res.write(`id: ${snapshotCursor}\n`);
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify({ starshipId: params.starshipId, userId: authUserId, notifications, unread })}\n\n`);
      try {
        res.write(`event: stream_debug\n`);
        res.write(`data: ${JSON.stringify({ starshipId: params.starshipId, userId: authUserId, cursor, len, lastId })}\n\n`);
      } catch {}

      while (!closed && !res.writableEnded && !res.destroyed) {
        const batch = await bus.read(params.starshipId, authUserId, cursor, { blockMs: 25_000, count: 200 }, redisReader);
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
            } catch {}
          } catch {
            closed = true;
            break;
          }
        }
      }
      return;
    }

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

    const repo = new NotificationRepository();
    const notifications = await repo.listForUser({
      starshipId: params.starshipId,
      userId: authUserId,
      limit: query.limit ?? 50,
      ...(query.beforeCreatedAt && query.beforeId ? { beforeCreatedAt: query.beforeCreatedAt, beforeId: query.beforeId } : null),
    });
    const counts = await repo.getUnreadCounts({ starshipId: params.starshipId, userId: authUserId });

    const oldest = notifications.length > 0 ? notifications[notifications.length - 1] : null;
    sendSuccess(
      res,
      {
        notifications,
        unread: counts,
        hasMoreBefore: notifications.length >= (query.limit ?? 50),
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
    } catch {}

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
    } catch {}

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
    const convoRow = await db.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [params.conversationId]);
    const starshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
    if (!starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404);
      return;
    }
    if (!(await verifyStarshipAccess(starshipId, authUserId, res))) return;

    const last = await db.queryOne<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [params.conversationId]
    );
    const lastId = last?.id ? String(last.id) : null;
    const lastAt = last?.created_at ? new Date(String(last.created_at)).toISOString() : null;

    const readRepo = new ConversationReadStateRepository();
    const state = await readRepo.upsert({
      conversationId: params.conversationId,
      userId: authUserId,
      lastReadMessageId: lastId,
      lastReadAt: lastAt,
    });

    const notifRepo = new NotificationRepository();
    await notifRepo.markRead({ starshipId, userId: authUserId, conversationId: params.conversationId });
    const unread = await notifRepo.getUnreadCounts({ starshipId, userId: authUserId });
    try {
      const bus = NotificationStreamBus.getInstance();
      await bus.publish(starshipId, authUserId, { type: 'notification.state', data: { unread } });
    } catch {}

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
    }>(
      `
      WITH ids AS (
        SELECT UNNEST($3::text[]) AS conversation_id
      ),
      last_msg AS (
        SELECT m.conversation_id, MAX(m.created_at) AS last_message_at
          FROM messages m
          INNER JOIN ids i ON i.conversation_id = m.conversation_id
         GROUP BY m.conversation_id
      )
      SELECT
        i.conversation_id,
        lm.last_message_at,
        rs.last_read_at
      FROM ids i
      LEFT JOIN last_msg lm ON lm.conversation_id = i.conversation_id
      LEFT JOIN conversation_read_states rs
        ON rs.conversation_id = i.conversation_id
       AND rs.user_id = $2
      `,
      [params.starshipId, authUserId, ids]
    );

    const unreadByConversationId: Record<string, { hasUnread: boolean; lastMessageAt: string | null; lastReadAt: string | null }> = {};
    for (const r of rows) {
      const cid = String(r.conversation_id || '');
      const lastMessageAt = r.last_message_at ? new Date(String(r.last_message_at)).toISOString() : null;
      const lastReadAt = r.last_read_at ? new Date(String(r.last_read_at)).toISOString() : null;
      const hasUnread = Boolean(lastMessageAt && (!lastReadAt || Date.parse(lastMessageAt) > Date.parse(lastReadAt)));
      if (cid) unreadByConversationId[cid] = { hasUnread, lastMessageAt, lastReadAt };
    }

    sendSuccess(res, { unreadByConversationId }, 200);
  } catch (error) {
    handleError(error, res, 'fetching unread status');
  }
});

export default router;

