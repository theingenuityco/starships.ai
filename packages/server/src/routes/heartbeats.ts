import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { IdSchema } from '@/schemas/common';
import { HeartbeatService } from '@/services/HeartbeatService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import {
  RoomRepository,
  ConversationParticipantRepository,
  getConnection,
} from '@starships/models';
import type { RoomModel } from '@starships/protocol';

const router: Router = Router();
const heartbeatService = new HeartbeatService();

const ActiveHoursTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Must be HH:MM (00:00–24:00)');

const CreateHeartbeatConfigSchema = z.object({
  agentId: IdSchema,
  isEnabled: z.boolean().default(true),
  intervalMinutes: z.number().int().min(1).max(1440).default(30),
  prompt: z.string().min(1).max(10000).optional(),
  ackMaxChars: z.number().int().min(0).max(10000).default(300),
  activeHoursStart: ActiveHoursTimeSchema.nullable().optional(),
  activeHoursEnd: ActiveHoursTimeSchema.nullable().optional(),
  activeHoursTimezone: z.string().max(100).nullable().optional(),
});

const UpdateHeartbeatConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  prompt: z.string().min(1).max(10000).optional(),
  ackMaxChars: z.number().int().min(0).max(10000).optional(),
  activeHoursStart: ActiveHoursTimeSchema.nullable().optional(),
  activeHoursEnd: ActiveHoursTimeSchema.nullable().optional(),
  activeHoursTimezone: z.string().max(100).nullable().optional(),
});

/**
 * Resolve room + verify the caller is a participant.
 * Returns null (and sends an error response) if access is denied.
 */
async function requireRoomAccess(
  roomId: string,
  req: Request,
  res: Response,
): Promise<{ authUserId: string; room: RoomModel; starshipId: string } | null> {
  const authUserId = req.user?.id as string | undefined;
  if (!authUserId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }

  const roomRepo = new RoomRepository();
  const room = await roomRepo.findByConversationId(roomId);
  if (!room) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404);
    return null;
  }

  const conn = getConnection();
  const convoRow = await conn.queryOne<{ starship_id: string }>(
    'SELECT starship_id FROM conversations WHERE id = $1',
    [roomId],
  );
  const starshipId = convoRow?.starship_id ? String(convoRow.starship_id) : '';
  if (!starshipId) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Room conversation not found', 404);
    return null;
  }

  const participantRepo = new ConversationParticipantRepository();
  const userIds: string[] = await participantRepo.listUserIdsByConversation(roomId).catch(() => [] as string[]);
  if (!userIds.includes(authUserId)) {
    sendError(res, 'ACCESS_DENIED', 'You are not a participant of this room', 403);
    return null;
  }

  return { authUserId, room, starshipId };
}

/**
 * POST /rooms/:roomId/heartbeats
 * Create a heartbeat config for an agent in this room.
 */
router.post('/rooms/:roomId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const body = CreateHeartbeatConfigSchema.parse(req.body);

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const existing = await heartbeatService.getConfigByRoomAndAgent(params.roomId, body.agentId);
    if (existing) {
      sendError(res, 'RESOURCE_ALREADY_EXISTS', 'A heartbeat config already exists for this agent in this room', 409);
      return;
    }

    const config = await heartbeatService.createConfig({
      agentId: body.agentId,
      roomConversationId: params.roomId,
      starshipId: access.starshipId,
      ownerUserId: access.authUserId,
      isEnabled: body.isEnabled,
      intervalMinutes: body.intervalMinutes,
      prompt: body.prompt,
      ackMaxChars: body.ackMaxChars,
      activeHoursStart: body.activeHoursStart ?? null,
      activeHoursEnd: body.activeHoursEnd ?? null,
      activeHoursTimezone: body.activeHoursTimezone ?? null,
    });

    sendSuccess(res, config, 201);
  } catch (error) {
    handleError(error, res, 'creating heartbeat config');
  }
});

/**
 * GET /rooms/:roomId/heartbeats
 * List all heartbeat configs for a room.
 */
router.get('/rooms/:roomId/heartbeats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const configs = await heartbeatService.listConfigsByRoom(params.roomId);
    sendSuccess(res, configs, 200);
  } catch (error) {
    handleError(error, res, 'listing heartbeat configs');
  }
});

/**
 * GET /rooms/:roomId/heartbeats/:agentId
 * Get heartbeat config for a specific agent in this room.
 */
router.get('/rooms/:roomId/heartbeats/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'parameters');
    if (!params) return;

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const config = await heartbeatService.getConfigByRoomAndAgent(params.roomId, params.agentId);
    if (!config) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat config not found for this agent in this room', 404);
      return;
    }

    sendSuccess(res, config, 200);
  } catch (error) {
    handleError(error, res, 'getting heartbeat config');
  }
});

/**
 * PATCH /rooms/:roomId/heartbeats/:agentId
 * Update heartbeat config for a specific agent in this room.
 */
router.patch('/rooms/:roomId/heartbeats/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'parameters');
    if (!params) return;

    const updates = UpdateHeartbeatConfigSchema.parse(req.body);

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const config = await heartbeatService.getConfigByRoomAndAgent(params.roomId, params.agentId);
    if (!config) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat config not found for this agent in this room', 404);
      return;
    }

    const updated = await heartbeatService.updateConfig(config.id, updates);
    if (!updated) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update heartbeat config');
      return;
    }

    sendSuccess(res, updated, 200);
  } catch (error) {
    handleError(error, res, 'updating heartbeat config');
  }
});

/**
 * DELETE /rooms/:roomId/heartbeats/:agentId
 * Delete heartbeat config for a specific agent in this room.
 */
router.delete('/rooms/:roomId/heartbeats/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'parameters');
    if (!params) return;

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const config = await heartbeatService.getConfigByRoomAndAgent(params.roomId, params.agentId);
    if (!config) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat config not found for this agent in this room', 404);
      return;
    }

    await heartbeatService.deleteConfig(config.id);
    sendSuccess(res, { message: 'Heartbeat config deleted successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'deleting heartbeat config');
  }
});

/**
 * POST /rooms/:roomId/heartbeats/:agentId/wake
 * Trigger an immediate heartbeat run (on-demand).
 */
router.post('/rooms/:roomId/heartbeats/:agentId/wake', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'parameters');
    if (!params) return;

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const config = await heartbeatService.getConfigByRoomAndAgent(params.roomId, params.agentId);
    if (!config) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat config not found for this agent in this room', 404);
      return;
    }

    await heartbeatService.wakeHeartbeat(config.id);
    sendSuccess(res, { message: 'Heartbeat triggered' }, 200);
  } catch (error) {
    handleError(error, res, 'triggering heartbeat wake');
  }
});

/**
 * GET /rooms/:roomId/heartbeats/:agentId/runs
 * List recent heartbeat runs for an agent in this room.
 */
router.get('/rooms/:roomId/heartbeats/:agentId/runs', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, agentId: IdSchema }), req.params, res, 'parameters');
    if (!params) return;

    const access = await requireRoomAccess(params.roomId, req, res);
    if (!access) return;

    const config = await heartbeatService.getConfigByRoomAndAgent(params.roomId, params.agentId);
    if (!config) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Heartbeat config not found for this agent in this room', 404);
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);
    const runs = await heartbeatService.getRunsByConfigId(config.id, limit);
    sendSuccess(res, runs, 200);
  } catch (error) {
    handleError(error, res, 'listing heartbeat runs');
  }
});

export default router;
