import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { ConversationParticipantRepository, RoomRepository, getConnection } from '@starships/models';
import { RoomGameStreamBus, type RoomGameStreamEvent } from '@/services/RoomGameStreamBus';
import { RoomGameStateService } from '@/services/RoomGameStateService';
import { RoomGameConfigService } from '@/services/RoomGameConfigService';
import crypto from 'crypto';

const router: Router = Router();

function shaSeedHex(input: string): string {
  const s = String(input || '').trim();
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 13);
}

function appearanceKey(args: {
  agentId: string;
  avatarAttachmentId?: string | null;
  styleId?: string;
  modelVersion?: string;
  generatorVersion?: string;
}): string {
  const agentId = String(args.agentId || '').trim();
  const avatar = String(args.avatarAttachmentId || '').trim();
  const styleId = String(args.styleId || 'default').trim();
  const modelVersion = String(args.modelVersion || 'unknown').trim();
  const generatorVersion = String(args.generatorVersion || 'v1').trim();
  return shaSeedHex(`${agentId}:${avatar}:${styleId}:${modelVersion}:${generatorVersion}`);
}

async function requireRoomParticipant(args: {
  roomConversationId: string;
  req: Request;
  res: Response;
}): Promise<{ userId: string; starshipId: string } | null> {
  const roomConversationId = String(args.roomConversationId || '').trim();
  if (!roomConversationId) {
    sendError(args.res, 'VALIDATION_ERROR', 'Missing roomId', 400);
    return null;
  }
  const userId = args.req.user?.id as string | undefined;
  if (!userId) {
    sendError(args.res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }

  const roomRepo = new RoomRepository();
  const room = await roomRepo.findByConversationId(roomConversationId);
  if (!room) {
    sendError(args.res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId: roomConversationId });
    return null;
  }
  if (!(await verifyStarshipAccess(room.starshipId, userId, args.res))) return null;

  const participantRepo = new ConversationParticipantRepository();
  const ok = await participantRepo.isUserParticipant(userId, roomConversationId).catch(() => false);
  if (!ok) {
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this room', 403, {
      roomId: roomConversationId,
      reason: 'room_membership_required',
    });
    return null;
  }
  return { userId, starshipId: String(room.starshipId) };
}

/**
 * GET /api/v1/rooms/:roomId/game/stream
 *
 * Streams room game runtime events over SSE (Redis Streams).
 *
 * Contract: sends an initial `snapshot` then streams events (actors.patch, actors.join/leave, fx).
 */
router.get('/rooms/:roomId/game/stream', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
  if (!params) return;

  try {
    const access = await requireRoomParticipant({ roomConversationId: params.roomId, req, res });
    if (!access) return;

    const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';
    if (!wantsStreaming) {
      return sendError(res, 'VALIDATION_ERROR', 'Streaming required (set Accept: text/event-stream or ?stream=true)', 400);
    }

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

    const roomConversationId = params.roomId;
    const bus = RoomGameStreamBus.getInstance();
    const stateSvc = RoomGameStateService.getInstance();
    const configSvc = RoomGameConfigService.getInstance();
    const redisReader = bus.createReaderClient();
    try {
      await redisReader.connect();
    } catch {
      /* best-effort */
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

    let lastId: string | null = null;
    try {
      lastId = await bus.getLastId(roomConversationId);
    } catch {
      /* ignore */
    }

    const snapshotCursor: string = lastId || qpCursor || lastEventIdHeader || '0-0';
    let cursor: string = snapshotCursor;

    // Build initial snapshot
    const generatorVersion = 'v1';
    const seed = shaSeedHex(`${roomConversationId}:${generatorVersion}`);
    const at = new Date().toISOString();

    const participantRepo = new ConversationParticipantRepository();
    const [userIds, agentIds] = await Promise.all([
      participantRepo.listUserIdsByConversation(roomConversationId).catch(() => []),
      participantRepo.listAgentIdsByConversation(roomConversationId).catch(() => []),
    ]);

    // Best-effort labels + avatar ids (avoid N+1 by using direct SQL)
    const conn = getConnection();
    const users =
      userIds.length === 0
        ? []
        : await conn.query<{ id: string; display_name: string | null; email: string | null }>(
            `SELECT id, display_name, email FROM users WHERE id = ANY($1)`,
            [userIds]
          );
    const agents =
      agentIds.length === 0
        ? []
        : await conn.query<{ id: string; name: string | null; slug: string | null; avatar_attachment_id: string | null }>(
            `SELECT id, name, slug, avatar_attachment_id FROM agents WHERE id = ANY($1)`,
            [agentIds]
          );

    const userLabelById = new Map<string, string>();
    for (const u of users) {
      const id = String(u.id || '').trim();
      if (!id) continue;
      const label = String(u.display_name || u.email || id).trim();
      userLabelById.set(id, label || id);
    }
    const agentInfoById = new Map<string, { label: string; avatarAttachmentId: string | null }>();
    for (const a of agents) {
      const id = String(a.id || '').trim();
      if (!id) continue;
      const label = String(a.name || a.slug || id).trim() || id;
      const avatarAttachmentId = a.avatar_attachment_id ? String(a.avatar_attachment_id) : null;
      agentInfoById.set(id, { label, avatarAttachmentId });
    }

    type SnapshotActor = {
      id: string;
      kind: 'user' | 'agent';
      label: string | null;
      avatarAttachmentId: string | null;
      appearanceKey: string | null;
      x: number;
      y: number;
      facing: 'down';
      anim: 'idle_down';
    };

    const actors: SnapshotActor[] = [];

    const all = [...userIds.map((id) => ({ id, kind: 'user' as const })), ...agentIds.map((id) => ({ id, kind: 'agent' as const }))];
    for (let i = 0; i < all.length; i++) {
      const item = all[i];
      const angle = (Math.PI * 2 * i) / Math.max(1, all.length);
      const fallbackX = Math.round(4 + Math.cos(angle) * 3);
      const fallbackY = Math.round(4 + Math.sin(angle) * 3);
      const existing = await stateSvc.getActor(roomConversationId, item.id).catch(() => null);
      const x = typeof existing?.x === 'number' ? existing.x : fallbackX;
      const y = typeof existing?.y === 'number' ? existing.y : fallbackY;
      if (item.kind === 'user') {
        const label = userLabelById.get(item.id) || item.id;
        const actor: SnapshotActor = {
          id: item.id,
          kind: 'user',
          label,
          avatarAttachmentId: null,
          appearanceKey: shaSeedHex(`user:${item.id}`),
          x,
          y,
          facing: 'down',
          anim: 'idle_down',
        };
        actors.push(actor);
        // Seed state if not present (best-effort)
        if (!existing) void stateSvc.setActor(roomConversationId, actor as any).catch(() => undefined);
      } else {
        const info = agentInfoById.get(item.id);
        const avatarAttachmentId = info?.avatarAttachmentId ?? null;
        const label = info?.label ?? item.id;
        const actor: SnapshotActor = {
          id: item.id,
          kind: 'agent',
          label,
          avatarAttachmentId,
          appearanceKey: appearanceKey({ agentId: item.id, avatarAttachmentId, generatorVersion }),
          x,
          y,
          facing: 'down',
          anim: 'idle_down',
        };
        actors.push(actor);
        if (!existing) void stateSvc.setActor(roomConversationId, actor as any).catch(() => undefined);
      }
    }

    const snapshot: RoomGameStreamEvent = {
      type: 'snapshot',
      data: {
        roomConversationId,
        starshipId: access.starshipId,
        at,
        seed,
        generatorVersion,
        mapRef:
          (await configSvc.get(roomConversationId).catch(() => null))?.mapRef ??
          // Dev-friendly default: show office template everywhere unless overridden.
          { kind: 'ldtk_url', url: '/room-game/maps/office_template.ldtk' },
        actors,
      },
    };

    res.write(`id: ${snapshotCursor}\n`);
    res.write(`event: snapshot\n`);
    res.write(`data: ${JSON.stringify(snapshot.data)}\n\n`);

    while (!closed && !res.writableEnded && !res.destroyed) {
      const batch = await bus.read(roomConversationId, cursor, { blockMs: 25_000, count: 200 }, redisReader);
      if (!batch || batch.length === 0) continue;
      for (const item of batch) {
        cursor = item.id;
        try {
          res.write(`id: ${item.id}\n`);
          res.write(`event: ${item.evt.type}\n`);
          res.write(`data: ${JSON.stringify(item.evt.data)}\n\n`);
        } catch {
          closed = true;
          break;
        }
      }
    }
  } catch (error) {
    return handleError(error, res, 'stream room game');
  }
});

/**
 * POST /api/v1/rooms/:roomId/game/input
 *
 * Accepts lightweight user inputs and publishes authoritative patches.
 * (Clients should interpolate to 60fps locally.)
 */
router.post('/rooms/:roomId/game/input', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
  if (!params) return;

  const body = validateData(
    z.object({
      type: z.literal('move'),
      dx: z.number().int().min(-1).max(1),
      dy: z.number().int().min(-1).max(1),
    }),
    req.body,
    res,
    'room game input'
  );
  if (!body) return;

  try {
    const access = await requireRoomParticipant({ roomConversationId: params.roomId, req, res });
    if (!access) return;

    const roomConversationId = params.roomId;
    const actorId = access.userId;
    const stateSvc = RoomGameStateService.getInstance();
    const bus = RoomGameStreamBus.getInstance();

    const cur = (await stateSvc.getActor(roomConversationId, actorId).catch(() => null)) ?? {
      id: actorId,
      kind: 'user' as const,
      x: 4,
      y: 4,
      facing: 'down' as const,
      anim: 'idle_down' as const,
      appearanceKey: shaSeedHex(`user:${actorId}`),
      avatarAttachmentId: null,
      label: null,
    };

    const nextX = Math.max(0, Math.min(50, Math.round((cur.x ?? 0) + body.dx)));
    const nextY = Math.max(0, Math.min(50, Math.round((cur.y ?? 0) + body.dy)));
    const facing = body.dx > 0 ? 'right' : body.dx < 0 ? 'left' : body.dy > 0 ? 'down' : body.dy < 0 ? 'up' : (cur.facing ?? 'down');
    const anim = body.dx !== 0 || body.dy !== 0 ? `walk_${facing}` : `idle_${facing}`;

    const at = new Date().toISOString();
    const next = {
      ...cur,
      x: nextX,
      y: nextY,
      facing,
      anim,
    };

    await stateSvc.setActor(roomConversationId, next as any);

    await bus.publish(roomConversationId, {
      type: 'actors.patch',
      data: {
        roomConversationId,
        at,
        patches: [{ id: actorId, x: nextX, y: nextY, facing, anim }],
      },
    });

    return sendSuccess(res, { ok: true, state: next }, 200);
  } catch (error) {
    return handleError(error, res, 'room game input');
  }
});

/**
 * POST /api/v1/rooms/:roomId/game/config
 *
 * Owner/admin sets room game config (e.g. mapRef to an LDtk/Tiled attachment).
 */
router.post('/rooms/:roomId/game/config', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
  if (!params) return;

  const body = validateData(
    z
      .object({
        mapRef: z
          .discriminatedUnion('kind', [
            z.object({ kind: z.literal('none') }),
            z.object({
              kind: z.literal('procedural'),
              seed: z.string().trim().min(1).max(255),
              generatorVersion: z.string().trim().min(1).max(128),
            }),
            z.object({ kind: z.literal('ldtk_attachment'), attachmentId: z.string().trim().min(1).max(255) }),
            z.object({
              kind: z.literal('ldtk_url'),
              url: z
                .string()
                .trim()
                .min(1)
                .max(2048)
                // Restrict to same-origin relative URLs (Next public assets, etc.)
                .refine((s) => s.startsWith('/'), { message: 'ldtk_url must start with /' }),
            }),
            z.object({ kind: z.literal('tiled_attachment'), attachmentId: z.string().trim().min(1).max(255) }),
          ])
          .optional(),
      })
      .strict(),
    req.body,
    res,
    'room game config'
  );
  if (!body) return;

  try {
    const access = await requireRoomParticipant({ roomConversationId: params.roomId, req, res });
    if (!access) return;
    if (!(await verifyStarshipOwnerAccess(access.starshipId, access.userId, res))) return;

    const configSvc = RoomGameConfigService.getInstance();
    await configSvc.set(params.roomId, { mapRef: body.mapRef });
    return sendSuccess(res, { ok: true }, 200);
  } catch (error) {
    return handleError(error, res, 'set room game config');
  }
});

export default router;
