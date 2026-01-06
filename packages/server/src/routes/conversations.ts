import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { rateLimiters } from '@/middleware/rateLimiter';
import { ConversationService } from '@/services/ConversationService';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema } from '@/schemas/common';
import { WalletService } from '@/services/WalletService';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { AgentService } from '@/services/AgentService';
import { MessageService } from '@/services/MessageService';
import { BillingService, InsufficientFundsError } from '@/services/BillingService';
import { StarshipTurnLeaseService } from '@/services/StarshipTurnLeaseService';
import { CREDITS_PER_USER_MESSAGE } from '@/config/credits';
import { AgentRepository, ToolCallApprovalRepository, ToolRepository, TurnRepository } from '@starships/models';
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import { AppError } from '@starships/errors';
import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type {
  ToolModel,
  ConversationStreamSnapshot,
  ConversationStreamEvent,
  TurnStatus as StreamTurnStatus,
  MessageModel,
} from '@starships/protocol';
import { buildAutopilotExecutionBundle, buildAutopilotRuntimeEnv } from '@/services/autopilot-execution-bundle';

const router: Router = Router();

const INTERNAL_SCHEDULE_HEADER = 'x-internal-schedule-token';

// -----------------------------------------------------------------------------
// Lightweight in-memory caches (best-effort) to reduce repeated DB reads during
// tool-call loops. These are intentionally small + TTL-based.
// -----------------------------------------------------------------------------
const PERMISSION_CACHE_TTL_MS = 15_000;
const TOOL_CACHE_TTL_MS = 15_000;

const permissionCache = new Map<string, { value: 'allow' | 'ask' | 'deny' | null; expiresAt: number }>();
const toolCache = new Map<string, { value: ToolModel | null; expiresAt: number }>();

function getCachedPermission(key: string): ('allow' | 'ask' | 'deny' | null) | undefined {
  const hit = permissionCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    permissionCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCachedPermission(key: string, value: 'allow' | 'ask' | 'deny' | null): void {
  permissionCache.set(key, { value, expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS });
  // Guardrail to prevent unbounded growth in long-lived processes
  if (permissionCache.size > 5000) {
    // Simple prune: delete expired entries first; if still too big, delete oldest-ish by iteration.
    const now = Date.now();
    for (const [k, v] of permissionCache) {
      if (v.expiresAt <= now) permissionCache.delete(k);
      if (permissionCache.size <= 4000) break;
    }
    if (permissionCache.size > 4500) {
      let i = 0;
      for (const k of permissionCache.keys()) {
        permissionCache.delete(k);
        if (++i >= 500) break;
      }
    }
  }
}

function getCachedTool(key: string): ToolModel | null | undefined {
  const hit = toolCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    toolCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCachedTool(key: string, value: ToolModel | null): void {
  toolCache.set(key, { value, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
  if (toolCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of toolCache) {
      if (v.expiresAt <= now) toolCache.delete(k);
      if (toolCache.size <= 1500) break;
    }
  }
}

function isInternalScheduleRequest(req: Request): boolean {
  const expected = process.env.SCHEDULE_WORKER_TOKEN;
  if (!expected) return false;
  const header = req.headers[INTERNAL_SCHEDULE_HEADER] as string | string[] | undefined;
  if (!header) return false;
  if (Array.isArray(header)) {
    return header.includes(expected);
  }
  return header === expected;
}

async function verifyResourceAccess200(args: {
  resourceStarshipId: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  res: Response;
}): Promise<boolean> {
  const starshipService = new StarshipService();
  const userService = new UserService();

  const [starship, user] = await Promise.all([starshipService.getStarship(args.resourceStarshipId), userService.getUserById(args.userId)]);

  if (!starship) {
    // Preserve "always 200" contract for HttpRequest node (it throws on non-2xx).
    sendError(args.res, 'RESOURCE_NOT_FOUND', `${args.resourceType} belongs to non-existent starship`, 200, {
      resource: args.resourceType,
      id: args.resourceId,
    });
    return false;
  }

  if (!user) {
    sendError(args.res, 'ACCESS_DENIED', `Access denied to this ${args.resourceType}`, 200, {
      resource: args.resourceType,
      id: args.resourceId,
      reason: 'user_not_found',
    });
    return false;
  }

  if (starship.ownerId !== args.userId && !isInstanceAdmin(user)) {
    sendError(args.res, 'ACCESS_DENIED', `Access denied to this ${args.resourceType}`, 200, {
      resource: args.resourceType,
      id: args.resourceId,
      reason: 'not_owner',
    });
    return false;
  }

  return true;
}

const scheduleOrJwtAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (isInternalScheduleRequest(req)) {
    // Internal scheduler calls are authenticated via shared secret header and do not
    // need a user context; starship/agent consistency is enforced at schedule creation.
    return next();
  }
  return jwtAuthMiddleware(req, res, next);
};

// Using standard pagination schema for consistency

function getSafeErrorMessageWithCause(error: unknown): string {
  if (error instanceof AppError) {
    return error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

// tool execution uses the same runner config bundle as agent execution

async function executeToolBlueprint(args: {
  blueprint: Blueprint;
  toolConfig: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  runnerConfig: Record<string, unknown>;
}): Promise<unknown> {
  const execution = ExecutionItemUtils.createExecution();
  const initial = ExecutionItemUtils.wrapSingle({ ...args.toolArgs, config: args.toolConfig });
  execution.results.push({ nodeRef: '__initial__', items: initial });
  const runner = RunnerFactory.getTopLevelRunner(execution.depth ?? 0);
  const items = await runner.run(args.blueprint, execution, { failOnNodeError: true, ...(args.runnerConfig as unknown as EngineConfig) });
  return ExecutionItemUtils.unwrapSingle(items);
}

/**
 * GET /conversations/:conversationId/messages - Get conversation messages (supports streaming for live updates)
 */
router.get('/conversations/:conversationId/messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Authorization: verify user has access to this conversation's starship
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const convAuthSvc = new ConversationService();
    const convAuth = await convAuthSvc.getConversationById(conversationId);
    if (!convAuth) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }
    if (!(await verifyResourceAccess(convAuth.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    // Check if streaming is requested
    const wantsStreaming = req.get('Accept')?.includes('text/event-stream') || req.query.stream === 'true';

    if (wantsStreaming) {
      // SSE streaming (Redis Streams)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      try {
        // Reduce latency for small SSE frames (avoid Nagle delaying writes)
        res.socket?.setNoDelay(true);
      } catch {
        /* best-effort */
      }
      try {
        const maybe = res as unknown as { flushHeaders?: () => void };
        if (typeof maybe.flushHeaders === 'function') maybe.flushHeaders();
      } catch (e) {
        console.warn('[stream] flushHeaders failed', {
          conversationId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      try {
        res.write(':ok\n\n');
      } catch (e) {
        console.warn('[stream] initial :ok write failed', {
          conversationId,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const bus = ConversationStreamBus.getInstance();
      // IMPORTANT: Use a dedicated Redis connection for blocking reads (XREAD BLOCK).
      // Never share the publish connection with a blocking reader, or publishes can stall.
      const redisReader = bus.createReaderClient();
      const conversationService = new ConversationService();
      const turnRepo = new TurnRepository();

      // Ensure reader is connected early (best-effort); disconnect on close to avoid leaks.
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

      // Compute initial cursor from client-provided cursor / Last-Event-ID; otherwise derive
      // from Redis so we avoid clock-skew issues from time-based cursors.
      const qpCursorRaw = typeof req.query.cursor === 'string' ? String(req.query.cursor) : '';
      const qpCursor = qpCursorRaw && qpCursorRaw.trim() ? qpCursorRaw.trim() : '';
      const lastEventIdHeaderRaw = typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;
      const lastEventIdHeader = lastEventIdHeaderRaw && lastEventIdHeaderRaw.trim() ? lastEventIdHeaderRaw.trim() : undefined;

      let len = 0;
      let lastId: string | null = null;
      try {
        [len, lastId] = await Promise.all([bus.getLen(conversationId), bus.getLastId(conversationId)]);
      } catch {
        /* best-effort */
      }

      // Snapshot cursor:
      // - Always align snapshot to the current tail (if available) so refresh/reconnect can
      //   immediately render the in-progress state, then continue streaming from that point.
      // - We still accept client cursors, but we don't *depend* on them for reconstructing UI state
      //   (a full page refresh loses in-memory deltas).
      // IMPORTANT: treat empty string as "unset" (Redis rejects '' as an invalid stream id).
      const snapshotCursor: string = lastId || qpCursor || lastEventIdHeader || '0-0';
      let cursor: string = snapshotCursor;

      // 1) Always send a baseline snapshot from DB (messages + latest known turn status)
      const conversationMessages = await conversationService.getConversationMessages(conversationId);
      const latestTurn = await turnRepo.findLatestByConversationId(conversationId);
      const turn: ConversationStreamSnapshot['turn'] =
        latestTurn && typeof latestTurn.id === 'string'
          ? {
              turnId: latestTurn.id,
              status: (latestTurn.status as StreamTurnStatus) || 'completed',
              startedAt: latestTurn.startedAt,
              completedAt: latestTurn.completedAt,
            }
          : null;

      // Best-effort: augment the snapshot with any in-progress streamed assistant content by
      // replaying recent Redis stream entries for the active turn.
      //
      // This fixes a UX bug where refreshing the page mid-stream would lose previously streamed
      // deltas (not yet persisted to DB), and the UI would only show new deltas after reconnect.
      let snapshotMessages = conversationMessages;
      const activeTurnId =
        latestTurn &&
        typeof latestTurn.id === 'string' &&
        ((latestTurn.status as StreamTurnStatus) === 'active' || (latestTurn.status as StreamTurnStatus) === 'waiting_for_tools')
          ? latestTurn.id
          : null;

      if (activeTurnId) {
        try {
          const recentDesc = await bus.readReverse(conversationId, snapshotCursor, { count: 2_000 }, redisReader);
          if (Array.isArray(recentDesc) && recentDesc.length > 0) {
            const recent = recentDesc.slice().reverse(); // chronological

            type Buffer = { content: string; reasoning: string; firstAt?: string; lastAt?: string };
            const buffers = new Map<string, Buffer>();

            for (const item of recent) {
              const evt = item.evt;
              if (!evt || typeof evt.type !== 'string') continue;

              if (evt.type === 'assistant.delta' || evt.type === 'assistant.reasoning_delta') {
                const data =
                  evt.type === 'assistant.delta'
                    ? (evt as Extract<ConversationStreamEvent, { type: 'assistant.delta' }>).data
                    : (evt as Extract<ConversationStreamEvent, { type: 'assistant.reasoning_delta' }>).data;
                if (!data || data.turnId !== activeTurnId) continue;
                const messageId = typeof data.messageId === 'string' ? data.messageId : '';
                const delta = typeof data.delta === 'string' ? data.delta : '';
                const at = typeof data.at === 'string' ? data.at : undefined;
                if (!messageId || !delta) continue;

                const cur = buffers.get(messageId) || { content: '', reasoning: '' };
                if (!cur.firstAt && at) cur.firstAt = at;
                if (at) cur.lastAt = at;
                if (evt.type === 'assistant.delta') cur.content += delta;
                else cur.reasoning += delta;
                buffers.set(messageId, cur);
              }
            }

            // Pick the messageId with the most accumulated data.
            let bestId: string | null = null;
            let bestScore = 0;
            for (const [id, buf] of buffers.entries()) {
              const score = (buf.content?.length || 0) + (buf.reasoning?.length || 0);
              if (score > bestScore) {
                bestScore = score;
                bestId = id;
              }
            }

            if (bestId && bestScore > 0) {
              const buf = buffers.get(bestId)!;
              const alreadyPersisted = Array.isArray(snapshotMessages) && snapshotMessages.some((m: MessageModel) => m.id === bestId);
              if (!alreadyPersisted) {
                const now = new Date().toISOString();
                const at = buf.lastAt || buf.firstAt || now;
                const derivedAssistantMsg: MessageModel = {
                  id: bestId,
                  role: 'assistant',
                  content: buf.content || '',
                  messageType: 'agent_response',
                  createdAt: buf.firstAt || at,
                  updatedAt: at,
                  turnId: activeTurnId,
                  ...(buf.reasoning && { reasoning: buf.reasoning }),
                };
                snapshotMessages = [...snapshotMessages, derivedAssistantMsg];
              }
            }
          }
        } catch (e) {
          console.warn('[stream] failed to augment snapshot from redis', {
            conversationId,
            snapshotCursor,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const snapshotEvt = { type: 'snapshot', data: { conversationId, messages: snapshotMessages, turn } };
      // IMPORTANT: attach an id to the snapshot so clients can overwrite any stale local cursor on refresh.
      res.write(`id: ${snapshotCursor}\n`);
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(snapshotEvt.data)}\n\n`);

      // Always emit one diagnostic event so we can tell whether Redis is receiving/publishing events
      // (and what cursor this connection is using) without needing extra flags.
      try {
        res.write(`event: stream_debug\n`);
        type StreamDebugPayload = { conversationId: string; cursor: string; len: number; lastId: string | null };
        const payload: StreamDebugPayload = { conversationId, cursor, len, lastId };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        console.warn('[stream] stream_debug emission failed', {
          conversationId,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      try {
        while (!closed && !res.writableEnded && !res.destroyed) {
          const batch = await bus.read(conversationId, cursor, { blockMs: 25_000, count: 200 }, redisReader);
          if (!batch || batch.length === 0) continue;
          for (const item of batch) {
            const id = item.id;
            const evt = item.evt;
            cursor = id;
            try {
              res.write(`id: ${id}\n`);
              res.write(`event: ${evt.type}\n`);
              res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
              // Best-effort flush for environments with compression middleware / proxy buffering.
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
        }
      } catch (e) {
        try {
          res.write(`event: error\n`);
          res.write(
            `data: ${JSON.stringify({
              code: 'STREAM_READ_FAILED',
              message: 'Streaming backend read failed',
              detail: e instanceof Error ? e.message : String(e),
            })}\n\n`
          );
        } catch (e2) {
          console.warn('[stream] failed to write STREAM_READ_FAILED event', {
            conversationId,
            error: e2 instanceof Error ? e2.message : String(e2),
          });
        }
        try {
          res.end();
        } catch (e3) {
          console.warn('[stream] failed to end response after stream read error', {
            conversationId,
            error: e3 instanceof Error ? e3.message : String(e3),
          });
        }
      }
      return;
    } else {
      // Regular JSON response mode
      // Validate pagination parameters
      const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
      if (!paginationValidation) return;

      // Validate query parameters for ordering
      const orderValidation = validateData(
        z.object({
          orderBy: z.enum(['createdAt']).optional(),
          orderDirection: z.enum(['asc', 'desc']).optional(),
        }),
        req.query,
        res,
        'order parameters'
      );
      if (!orderValidation) return;

      // Delegate to service layer
      const conversationService = new ConversationService();
      const messages = await conversationService.getConversationMessages(conversationId, orderValidation.orderDirection);

      // Verify conversation exists
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
          resource: 'conversation',
          id: conversationId,
        });
        return;
      }

      // Get conversation agents to determine participants
      const agents = await conversationService.getConversationAgents(conversationId);
      const participants = agents.map((agent) => agent.id);

      // Structure response to match client expectations
      const state = conversation?.state || {};
      const responseData = {
        conversationId,
        messages,
        total: messages.length,
        participants,
        startedAt: conversation.createdAt,
        lastActivityAt: conversation.updatedAt || conversation.createdAt,
        agents, // Include full agent information for client
        // Server-authoritative turn state for non-streaming baseline consumers
        turnActive: !!state.turnActive,
        lastCompleteAt: state.lastCompleteAt,
      };

      sendSuccess(res, responseData, 200);
    }
  } catch (error) {
    handleError(error, res, 'fetching conversation messages');
  }
});

/**
 * POST /conversations/:conversationId/stop - Stop streaming for the current turn
 * - Cancels backend execution if running
 * - Persists partial content/reasoning (no tool_calls)
 * - Finalizes SSE and closes connections
 */
router.post('/conversations/:conversationId/stop', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    const conversationService = new ConversationService();
    const exists = await conversationService.getConversationById(conversationId);
    if (!exists) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId });
      return;
    }

    // Authorization: verify user has access to this conversation
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(exists.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    await conversationService.stopConversation(conversationId);
    sendSuccess(res, { status: 'stopped', conversationId }, 200);
  } catch (error) {
    handleError(error, res, 'stopping conversation');
  }
});

/**
 * POST /conversations/:conversationId/tool-calls/authorize-and-maybe-execute
 *
 * Called from the agent's default blueprint (server-tools mode) via HttpRequest + starships connector.
 * Always returns 200 using the standard API contract so the HttpRequest node does not throw on non-2xx:
 * - Success: { success: true, data: { ... } }
 * - Error: { success: false, error: { code, message, details } }
 */
router.post(
  '/conversations/:conversationId/tool-calls/authorize-and-maybe-execute',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
      if (!paramValidation) return;
      const { conversationId } = paramValidation;

      const authUserId = req.user?.id as string | undefined;
      if (!authUserId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 200, { toolCallId: '' });
        return;
      }

      const bodyValidation = validateData(
        z.object({
          agentId: IdSchema,
          toolSlug: z.string().min(1),
          toolCallId: z.string().min(1),
          args: z.record(z.string(), z.unknown()).optional(),
        }),
        req.body,
        res,
        'tool authorization payload'
      );
      if (!bodyValidation) return;

      const { agentId, toolSlug, toolCallId, args } = bodyValidation as {
        agentId: string;
        toolSlug: string;
        toolCallId: string;
        args?: Record<string, unknown>;
      };

      const conversationService = new ConversationService();
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 200, { conversationId, toolCallId });
        return;
      }

      // Authorization: ensure the authenticated user can only authorize tools for their own starships.
      // This endpoint must ALWAYS return 200 for the HttpRequest node, so we use a 200-wrapped guard.
      const ok = await verifyResourceAccess200({
        resourceStarshipId: conversation.starshipId,
        userId: authUserId,
        resourceType: 'conversation',
        resourceId: conversationId,
        res,
      });
      if (!ok) {
        return;
      }

      // Starship connector JWT embeds starshipId in authContext; enforce scoping without using 4xx
      // responses (HttpRequest node throws on non-2xx).
      const authStarshipId = (req as unknown as { authContext?: { starshipId?: string } })?.authContext?.starshipId;
      if (authStarshipId && authStarshipId !== conversation.starshipId) {
        sendError(res, 'FORBIDDEN', 'Conversation does not belong to authenticated starship', 200, {
          conversationId,
          toolCallId,
          starshipId: conversation.starshipId,
          authStarshipId,
        });
        return;
      }

      const agentService = new AgentService();
      const agent = await agentService.getAgent(agentId);
      if (!agent || agent.starshipId !== conversation.starshipId) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 200, { agentId, toolCallId });
        return;
      }

      const agentRepo = new AgentRepository();
      const permCacheKey = `${conversation.starshipId}:${agentId}:${toolSlug}`;
      const cachedPerm = getCachedPermission(permCacheKey);
      const permission =
        cachedPerm !== undefined ? cachedPerm : await agentRepo.getAgentToolPermissionBySlug(agentId, conversation.starshipId, toolSlug);
      if (cachedPerm === undefined) {
        setCachedPermission(permCacheKey, permission);
      }
      if (!permission) {
        sendError(res, 'FORBIDDEN', 'Tool is not assigned to agent', 200, { agentId, toolSlug, toolCallId });
        return;
      }
      if (permission === 'deny') {
        sendError(res, 'FORBIDDEN', 'Tool permission denied', 200, { agentId, toolSlug, toolCallId });
        return;
      }

      if (permission === 'ask') {
        // Resolve toolId once at authorization time so approvals are stable across slug changes.
        const toolRepo = new ToolRepository();
        const resolvedTool = await toolRepo.findBySlugAndStarship(toolSlug, conversation.starshipId);
        if (!resolvedTool) {
          sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 200, { toolSlug, toolCallId });
          return;
        }

        const approvals = new ToolCallApprovalRepository();
        let approvalId: string;
        try {
          const approval = await approvals.createPending({
            starshipId: conversation.starshipId,
            conversationId,
            agentId,
            toolId: resolvedTool.id,
            toolCallId,
            argsJson: args || {},
          });
          approvalId = approval.id;
        } catch (e) {
          const msg = getSafeErrorMessageWithCause(e);
          sendError(res, 'INTERNAL_SERVER_ERROR', msg, 200, { agentId, toolSlug, toolCallId });
          return;
        }

        // Emit out-of-band UI action so the client can show an Approve/Deny prompt.
        const bus = ConversationStreamBus.getInstance();
        await bus.publish(conversationId, {
          type: 'ui_action',
          data: {
            __ui_action: 'tool_approval_required',
            approvalId,
            conversationId,
            starshipId: conversation.starshipId,
            agentId,
            agentName: agent.name,
            toolId: resolvedTool.id,
            toolSlug,
            toolCallId,
            args: args || {},
          },
        });

        sendError(res, 'TOOL_APPROVAL_REQUIRED', 'Tool requires approval', 200, { approvalId, agentId, toolSlug, toolCallId });
        return;
      }

      // permission === 'allow' → execute tool immediately in the runner (remote when RUNNER_URL is configured)
      const toolRepo = new ToolRepository();
      const toolCacheKey = `${conversation.starshipId}:${toolSlug}`;
      const cachedTool = getCachedTool(toolCacheKey);
      const tool = cachedTool !== undefined ? cachedTool : await toolRepo.findBySlugAndStarship(toolSlug, conversation.starshipId);
      if (cachedTool === undefined) {
        setCachedTool(toolCacheKey, tool);
      }
      if (!tool || tool.status === 'draft' || !tool.blueprint) {
        sendError(res, 'VALIDATION_ERROR', 'Tool is not ready for execution', 200, { toolSlug, toolCallId });
        return;
      }

      const runtimeEnv = buildAutopilotRuntimeEnv({ starshipId: conversation.starshipId, conversationId, agentId });
      const { engineConfig } = await buildAutopilotExecutionBundle({ starshipId: conversation.starshipId, authUserId, runtimeEnv });

      const result = await executeToolBlueprint({
        blueprint: tool.blueprint,
        toolConfig: (tool.configuration || {}) as Record<string, unknown>,
        toolArgs: args || {},
        runnerConfig: engineConfig,
      });

      sendSuccess(res, { toolCallId, result }, 200);
    } catch (e) {
      const body = (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}) as Record<string, unknown>;
      const toolCallId = typeof body.toolCallId === 'string' ? String(body.toolCallId) : '';
      const msg = getSafeErrorMessageWithCause(e);
      sendError(res, 'INTERNAL_SERVER_ERROR', msg, 200, { toolCallId });
    }
  }
);

/**
 * POST /conversations/:conversationId/tool-approvals/:approvalId/approve
 */
router.post(
  '/conversations/:conversationId/tool-approvals/:approvalId/approve',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsValidation = validateData(
        z.object({ conversationId: IdSchema, approvalId: IdSchema }),
        req.params,
        res,
        'approval parameters'
      );
      if (!paramsValidation) return;
      const { conversationId, approvalId } = paramsValidation as { conversationId: string; approvalId: string };

      const authUserId = req.user?.id as string | undefined;
      if (!authUserId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const conversationService = new ConversationService();
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId });
        return;
      }
      if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;

      const approvals = new ToolCallApprovalRepository();
      const approval = await approvals.findById(approvalId);
      if (!approval || approval.conversationId !== conversationId) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Tool approval not found', 404, { approvalId });
        return;
      }
      if (approval.starshipId !== conversation.starshipId) {
        sendError(res, 'FORBIDDEN', 'Tool approval does not belong to this conversation', 403, { approvalId, conversationId });
        return;
      }
      if (approval.status !== 'pending') {
        sendSuccess(res, { status: approval.status, approvalId });
        return;
      }

      // Execute tool (server-side) and update the placeholder tool message
      const toolRepo = new ToolRepository();
      const tool = await toolRepo.findById(approval.toolId);
      if (tool && tool.starshipId !== conversation.starshipId) {
        sendError(res, 'FORBIDDEN', 'Tool approval tool does not belong to this starship', 403, { toolId: approval.toolId });
        return;
      }
      if (!tool || tool.status === 'draft' || !tool.blueprint) {
        sendError(res, 'VALIDATION_ERROR', 'Tool is not available for execution', 400, { toolId: approval.toolId });
        return;
      }

      // Mark approved ONLY after all preflight checks pass, so we can't end up with
      // status='approved' for a request that never had a chance to execute.
      // Also ensure only one concurrent request proceeds to execution.
      const { approval: decided, updated } = await approvals.markApprovedIfPending(approvalId);
      if (!updated) {
        // Another request already decided this approval (approved/denied). Do not execute twice.
        sendSuccess(res, { status: decided.status, approvalId });
        return;
      }

      const runtimeEnv = buildAutopilotRuntimeEnv({
        starshipId: conversation.starshipId,
        conversationId,
        agentId: approval.agentId,
      });
      const { engineConfig } = await buildAutopilotExecutionBundle({ starshipId: conversation.starshipId, authUserId, runtimeEnv });

      const result = await executeToolBlueprint({
        blueprint: tool.blueprint,
        toolConfig: (tool.configuration || {}) as Record<string, unknown>,
        toolArgs: approval.argsJson || {},
        runnerConfig: engineConfig,
      });

      const messageService = new MessageService();
      const content = JSON.stringify({
        success: true,
        data: { result, approvalId, toolId: approval.toolId, toolCallId: approval.toolCallId },
      });

      // Do NOT persist any interim tool result before approval; this message is the first persisted tool result for this call.
      const created = await messageService.createMessage({
        conversationId,
        role: 'tool',
        content,
        messageType: 'tool_result',
        toolCallId: approval.toolCallId,
      });

      // Best-effort broadcast: update last message (after client supports replace for non-assistant)
      try {
        const bus = ConversationStreamBus.getInstance();
        await bus.publish(conversationId, { type: 'message.append', data: { conversationId, message: created } });
        await bus.publish(conversationId, {
          type: 'ui_action',
          data: {
            __ui_action: 'tool_approval_resolved',
            approvalId,
            conversationId,
            status: 'approved',
          },
        });
      } catch {
        // ignore broadcast failures
      }

      // Continue agent execution without billing a new user message (async; UI watches SSE)
      void conversationService
        .continueAfterToolApproval(conversationId, approval.agentId, { authContext: { userId: authUserId } })
        .catch((e) => console.warn('[tool-approval] continueAfterToolApproval failed', e));

      sendSuccess(res, { approvalId, status: 'approved' }, 202);
    } catch (error) {
      handleError(error, res, 'approving tool');
    }
  }
);

/**
 * POST /conversations/:conversationId/tool-approvals/:approvalId/deny
 */
router.post(
  '/conversations/:conversationId/tool-approvals/:approvalId/deny',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsValidation = validateData(
        z.object({ conversationId: IdSchema, approvalId: IdSchema }),
        req.params,
        res,
        'approval parameters'
      );
      if (!paramsValidation) return;
      const { conversationId, approvalId } = paramsValidation as { conversationId: string; approvalId: string };

      const authUserId = req.user?.id as string | undefined;
      if (!authUserId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const conversationService = new ConversationService();
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, { conversationId });
        return;
      }
      if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) return;

      const approvals = new ToolCallApprovalRepository();
      const approval = await approvals.findById(approvalId);
      if (!approval || approval.conversationId !== conversationId) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Tool approval not found', 404, { approvalId });
        return;
      }
      if (approval.starshipId !== conversation.starshipId) {
        sendError(res, 'FORBIDDEN', 'Tool approval does not belong to this conversation', 403, { approvalId, conversationId });
        return;
      }
      if (approval.status !== 'pending') {
        sendSuccess(res, { status: approval.status, approvalId });
        return;
      }

      await approvals.markDenied(approvalId);

      const messageService = new MessageService();
      const content = JSON.stringify({
        success: false,
        error: {
          code: 'TOOL_APPROVAL_DENIED',
          message: 'Tool approval denied',
          details: { approvalId, toolId: approval.toolId, toolCallId: approval.toolCallId },
        },
      });

      const created = await messageService.createMessage({
        conversationId,
        role: 'tool',
        content,
        messageType: 'tool_result',
        toolCallId: approval.toolCallId,
      });

      try {
        const bus = ConversationStreamBus.getInstance();
        await bus.publish(conversationId, { type: 'message.append', data: { conversationId, message: created } });
        await bus.publish(conversationId, {
          type: 'ui_action',
          data: {
            __ui_action: 'tool_approval_resolved',
            approvalId,
            conversationId,
            status: 'denied',
          },
        });
      } catch {
        /* ignore broadcast failures */
      }

      void conversationService
        .continueAfterToolApproval(conversationId, approval.agentId, { authContext: { userId: authUserId } })
        .catch((e) => console.warn('[tool-approval] continueAfterToolApproval failed', e));

      sendSuccess(res, { approvalId, status: 'denied' }, 202);
    } catch (error) {
      handleError(error, res, 'denying tool');
    }
  }
);

/**
 * POST /conversations/:conversationId/messages - Send message to agent (supports unified streaming)
 */
router.post(
  '/conversations/:conversationId/messages',
  rateLimiters.messaging,
  scheduleOrJwtAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate conversationId parameter
      const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
      if (!paramValidation) return;

      // Validate request body
      const bodyValidation = validateData(
        z.object({
          content: z.string().min(1, 'content is required'),
          agentId: z.string().optional(),
          attachmentIds: z.array(z.string()).optional(),
          // OpenRouter image generation (optional)
          modalities: z.array(z.enum(['image', 'text'])).optional(),
          imageConfig: z
            .object({
              aspect_ratio: z.string().optional(),
            })
            .passthrough()
            .optional(),
          // baselineLength is no longer used on POST (streaming happens over GET SSE)
          baselineLength: z.coerce.number().int().min(0).optional(),
          // When true, wait for the turn to fully complete and return the last message
          sync: z.boolean().optional(),
        }),
        req.body,
        res,
        'conversation message'
      );
      if (!bodyValidation) return;

      const { conversationId } = paramValidation;
      const { content, agentId, attachmentIds, sync, modalities, imageConfig } = bodyValidation;

      const isInternal = isInternalScheduleRequest(req);

      // Preflight billing gate: block when wallet credits are insufficient for a user message
      const conversationService = new ConversationService();

      // Verify conversation exists
      const conversation = await conversationService.getConversationById(conversationId);
      if (!conversation) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
          resource: 'conversation',
          id: conversationId,
        });
        return;
      }

      // Authorization: verify user has access to this conversation (external callers only)
      const authUserId = req.user?.id as string | undefined;
      if (!isInternal) {
        if (!authUserId) {
          sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
          return;
        }
        if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) {
          return;
        }
      }

      // Resolve starship and wallet, then enforce non-zero balance
      const starship = await conversationService.getConversationStarship(conversationId);
      if (!starship) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found for conversation', 404, {
          resource: 'starship',
          conversationId,
        });
        return;
      }

      const walletService = new WalletService();
      const wallet = await walletService.getByStarshipId(starship.id);

      if (!wallet) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Wallet not found', 404, {
          starshipId: starship.id,
        });
        return;
      }

      const currentCredits = Number(wallet.balance) || 0;
      const requiredCredits = Number(CREDITS_PER_USER_MESSAGE) || 0;
      if (currentCredits < requiredCredits) {
        sendError(
          res,
          'INSUFFICIENT_FUNDS',
          `Insufficient credits. ${requiredCredits} credits required per message. Please add credits from Billing to continue.`,
          402,
          {
            currentCredits: wallet.balance,
            requiredCredits: requiredCredits.toFixed(6),
          }
        );
        return;
      }

      // Starship-level concurrency gate (Scout=1, Frigate=2).
      // IMPORTANT: acquire this before persisting/charging the user message.
      const leaseService = new StarshipTurnLeaseService();
      let turnLeaseId: string | undefined;
      try {
        turnLeaseId = await leaseService.acquire({
          starshipId: starship.id,
          conversationId,
          maxConcurrentTurns: starship.maxConcurrentTurns ?? 3,
        });
      } catch (e) {
        handleError(e, res, 'acquiring starship concurrency slot');
        return;
      }

      // Persist the user message first (we need messageId for idempotent charging), then debit fixed credits.
      // If debit fails, delete the message and return 402 (do not start the turn).
      const messageService = new MessageService();
      const userMessage = await messageService.createMessage({
        conversationId,
        role: 'user',
        content,
        messageType: 'user_input',
        ...(agentId && { agentId }),
        ...(attachmentIds && attachmentIds.length > 0 && { attachmentIds }),
      });

      const billingService = new BillingService();
      try {
        await billingService.debitForUserMessage({
          walletId: wallet.id,
          starshipId: starship.id,
          conversationId,
          messageId: userMessage.id,
        });
      } catch (e) {
        // Best-effort cleanup: remove message if we couldn't charge it.
        try {
          await messageService.deleteMessage(userMessage.id);
        } catch {
          /* ignore cleanup failure */
        }
        if (e instanceof InsufficientFundsError) {
          sendError(res, 'INSUFFICIENT_FUNDS', 'Insufficient credits. Please add credits from Billing to continue.', 402, {
            currentCredits: wallet.balance,
            requiredCredits: requiredCredits.toFixed(6),
          });
          if (turnLeaseId) await leaseService.release(turnLeaseId).catch(() => undefined);
          return;
        }
        if (turnLeaseId) await leaseService.release(turnLeaseId).catch(() => undefined);
        throw e;
      }

      // Authorization: if agentId is provided, verify user owns it and it belongs to the conversation's starship
      if (agentId && !isInternal) {
        const agentService = new AgentService();
        const agent = await agentService.getAgent(agentId);

        if (!agent) {
          sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);
          return;
        }

        // Verify user owns the agent's starship
        if (!(await verifyResourceAccess(agent.starshipId, authUserId as string, 'agent', agentId, res))) {
          return;
        }

        // Verify agent belongs to the same starship as the conversation
        if (agent.starshipId !== starship.id) {
          sendError(res, 'ACCESS_DENIED', 'Cannot use an agent from a different starship', 403);
          return;
        }
      }

      // If sync is requested, wait for the full turn to complete and return the full conversation with messages
      if (sync) {
        try {
          await conversationService.addConversationMessage(
            {
              conversationId,
              content,
              role: 'user',
              messageType: 'user_input',
              ...(agentId && { agentId }),
              ...(attachmentIds && attachmentIds.length > 0 && { attachmentIds }),
              ...(modalities && modalities.length > 0 && { modalities }),
              ...(imageConfig && { imageConfig }),
            },
            { authContext: req.authContext },
            { preCreatedUserMessage: userMessage, turnLeaseId }
          );

          const conversationWithFinalState = await conversationService.getConversationById(conversationId);
          const messages = await conversationService.getConversationMessages(conversationId);

          sendSuccess(
            res,
            {
              status: 'completed',
              streaming: false,
              conversationId,
              conversation: conversationWithFinalState ? { ...conversationWithFinalState, messages } : null,
            },
            200
          );
        } catch (error) {
          handleError(error, res, 'processing synchronous conversation message');
        }
        return;
      }

      // Default behavior: fire-and-forget processing; live updates go over GET SSE channel (/conversations/:id/messages?stream=true)
      conversationService
        .addConversationMessage(
          {
            conversationId,
            content,
            role: 'user',
            messageType: 'user_input',
            ...(agentId && { agentId }),
            ...(attachmentIds && attachmentIds.length > 0 && { attachmentIds }),
            ...(modalities && modalities.length > 0 && { modalities }),
            ...(imageConfig && { imageConfig }),
          },
          { authContext: req.authContext },
          { preCreatedUserMessage: userMessage, turnLeaseId }
        )
        .catch((error) => {
          // Background conversation processing failure; main request already acknowledged
          console.error('Conversation processing failed:', error);
          // Best-effort lease cleanup in case the failure occurred before ConversationService could release it.
          if (turnLeaseId) void leaseService.release(turnLeaseId).catch(() => undefined);
        });

      // Acknowledge request; client should be listening on GET SSE channel for updates
      sendSuccess(res, { status: 'accepted', streaming: true, conversationId }, 202);
    } catch (error) {
      handleError(error, res, 'processing conversation message');
    }
  }
);

/**
 * GET /conversations/:conversationId - Get conversation details with messages
 */
router.get('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Use service layer for consistent data access
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);

    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Authorization: verify user has access to this conversation
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    sendSuccess(res, conversation, 200);
  } catch (error) {
    handleError(error, res, 'fetching conversation details');
  }
});

/**
 * GET /starships/:starshipId/conversations - Get conversations by starship
 */
router.get('/starships/:starshipId/conversations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { starshipId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Authorization: verify user owns this starship
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(starshipId, authUserId, res))) {
      return;
    }

    // Use service layer to get conversations by starship
    const conversationService = new ConversationService();
    const allConversations = await conversationService.getConversationsByStarship(starshipId);

    // Apply pagination
    const offset = (page - 1) * limit;
    const conversations = allConversations.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allConversations.length);
    sendSuccess(res, conversations, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching starship conversations');
  }
});

/**
 * POST /conversations - Create new conversation
 */
router.post('/conversations', scheduleOrJwtAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(
      z.object({
        title: z.string().min(1).max(100).optional(),
        starshipId: IdSchema,
        agentSlug: z.string().min(1).max(255).optional(),
        agentId: IdSchema.optional(),
      }),
      req.body,
      res,
      'conversation creation data'
    );
    if (!bodyValidation) return;

    const isInternal = isInternalScheduleRequest(req);

    // Authorization: verify user owns the target starship (external callers only)
    const authUserId = req.user?.id as string | undefined;
    if (!isInternal) {
      if (!authUserId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }
      if (!(await verifyStarshipAccess(bodyValidation.starshipId, authUserId, res))) {
        return;
      }
    }

    // Resolve agent from either agentId or agentSlug, and verify access/ownership
    let resolvedAgentId: string | undefined;
    if (!isInternal && bodyValidation.agentSlug) {
      const agentService = new AgentService();
      const starshipAgents = await agentService.getAgentsByStarship(bodyValidation.starshipId);
      const agent = starshipAgents.find((a) => a.slug === bodyValidation.agentSlug) || null;

      if (!agent) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
          resource: 'agent',
          slug: bodyValidation.agentSlug,
          starshipId: bodyValidation.starshipId,
        });
        return;
      }

      // Verify user owns the agent's starship
      if (!(await verifyResourceAccess(agent.starshipId, authUserId as string, 'agent', agent.id, res))) {
        return;
      }

      // Verify agent belongs to the same starship as the conversation
      if (agent.starshipId !== bodyValidation.starshipId) {
        sendError(res, 'ACCESS_DENIED', 'Cannot use an agent from a different starship', 403);
        return;
      }

      resolvedAgentId = agent.id;
    }

    const conversationService = new ConversationService();
    // Build payload for conversation creation, normalizing agentId and dropping agentSlug
    const createPayload = {
      ...req.body,
      agentId: resolvedAgentId ?? bodyValidation.agentId,
    };
    delete createPayload.agentSlug;

    const conversation = await conversationService.createConversation(createPayload);

    sendSuccess(res, conversation, 201);
  } catch (error) {
    handleError(error, res, 'creating conversation');
  }
});

/**
 * PATCH /conversations/:conversationId/status - Update conversation status
 */
router.patch('/conversations/:conversationId/status', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        status: z.enum(['active', 'paused', 'completed', 'archived']),
      }),
      req.body,
      res,
      'conversation status update'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const { status } = bodyValidation;

    // Use service layer to update conversation status
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Authorization: verify user has access to this conversation
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    // Update status using appropriate method
    switch (status) {
      case 'completed':
        await conversationService.completeConversation(conversationId);
        break;
      case 'archived':
        await conversationService.archiveConversation(conversationId);
        break;
      default:
        await conversationService.updateConversationStatus(conversationId, status);
        break;
    }

    const updatedConversation = await conversationService.getConversationById(conversationId);
    sendSuccess(res, updatedConversation, 200);
  } catch (error) {
    handleError(error, res, 'updating conversation status');
  }
});

/**
 * DELETE /conversations/:conversationId - Delete conversation
 */
router.delete('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

    // Verify conversation exists
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Authorization: verify user has access to this conversation
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    const deleted = await conversationService.deleteConversation(conversationId);

    if (deleted) {
      sendSuccess(res, { message: 'Conversation deleted successfully' }, 200);
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete conversation');
    }
  } catch (error) {
    handleError(error, res, 'deleting conversation');
  }
});

/**
 * PATCH /conversations/:conversationId - Update conversation details
 */
router.patch('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate conversationId parameter
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        title: z.string().min(1).max(100).optional(),
        state: z
          .object({
            plugins: z
              .array(
                z.object({
                  id: z.string().min(1), // Require non-empty id
                  max_results: z.number().int().positive().optional(), // Must be positive integer if provided
                })
              )
              .optional()
              .nullable(), // Allow null for explicit clearing
          })
          .passthrough()
          .optional(), // passthrough allows other state fields
      }),
      req.body,
      res,
      'conversation update data'
    );
    if (!bodyValidation) return;

    const { conversationId } = paramValidation;
    const updateData = bodyValidation;

    // Verify conversation exists
    const conversationService = new ConversationService();
    const conversation = await conversationService.getConversationById(conversationId);
    if (!conversation) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404, {
        resource: 'conversation',
        id: conversationId,
      });
      return;
    }

    // Authorization: verify user has access to this conversation
    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyResourceAccess(conversation.starshipId, authUserId, 'conversation', conversationId, res))) {
      return;
    }

    // Update conversation
    const updatedConversation = await conversationService.updateConversation(conversationId, updateData);
    if (!updatedConversation) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update conversation');
      return;
    }

    sendSuccess(res, updatedConversation, 200);
  } catch (error) {
    handleError(error, res, 'updating conversation');
  }
});

export default router;
