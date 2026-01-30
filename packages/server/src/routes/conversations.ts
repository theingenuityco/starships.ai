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
import { AttachmentService } from '@/services/AttachmentService';
import {
  AgentRepository,
  ChannelRepository,
  ConversationMemberRepository,
  ConversationWidgetRepository,
  DirectMessageRepository,
  getConnection,
  MessageRepository,
  StarshipMemberRepository,
  ToolCallApprovalRepository,
  ToolRepository,
  TurnRepository,
  WidgetRepository,
} from '@starships/models';
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import { AppError } from '@starships/errors';
import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { UIActionService } from '@/services/UIActionService';
import { MAX_TOOL_RESULT_BASE64_IMAGE_BYTES, MAX_TOOL_RESULT_DATA_URL_CHARS } from '@starships/protocol';
import type {
  ToolModel,
  ConversationStreamSnapshot,
  ConversationStreamEvent,
  TurnStatus as StreamTurnStatus,
  MessageModel,
  StandardErrorCode,
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

const PERMISSION_CACHE_MAX_SIZE = 5000;
const PERMISSION_CACHE_TARGET_SIZE = 4500;
const TOOL_CACHE_MAX_SIZE = 2000;
const TOOL_CACHE_TARGET_SIZE = 1750;

const permissionCache = new Map<string, { value: 'allow' | 'ask' | 'deny' | null; expiresAt: number }>();
const toolCache = new Map<string, { value: ToolModel | null; expiresAt: number }>();

function getCachedPermission(key: string): ('allow' | 'ask' | 'deny' | null) | undefined {
  const hit = permissionCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    permissionCache.delete(key);
    return undefined;
  }
  // LRU touch: keep hot keys near the end of iteration order.
  permissionCache.delete(key);
  permissionCache.set(key, hit);
  return hit.value;
}

function setCachedPermission(key: string, value: 'allow' | 'ask' | 'deny' | null): void {
  permissionCache.set(key, { value, expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS });
  // Guardrail to prevent unbounded growth in long-lived processes.
  // Avoid full-map scans: evict oldest (LRU-ish) entries in a bounded batch.
  if (permissionCache.size > PERMISSION_CACHE_MAX_SIZE) {
    const now = Date.now();
    while (permissionCache.size > PERMISSION_CACHE_TARGET_SIZE) {
      const oldestKey = permissionCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = permissionCache.get(oldestKey);
      // Prefer deleting expired entries, otherwise evict oldest.
      if (!oldest || oldest.expiresAt <= now) {
        permissionCache.delete(oldestKey);
        continue;
      }
      permissionCache.delete(oldestKey);
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
  // LRU touch
  toolCache.delete(key);
  toolCache.set(key, hit);
  return hit.value;
}

function setCachedTool(key: string, value: ToolModel | null): void {
  toolCache.set(key, { value, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
  if (toolCache.size > TOOL_CACHE_MAX_SIZE) {
    const now = Date.now();
    while (toolCache.size > TOOL_CACHE_TARGET_SIZE) {
      const oldestKey = toolCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = toolCache.get(oldestKey);
      if (!oldest || oldest.expiresAt <= now) {
        toolCache.delete(oldestKey);
        continue;
      }
      toolCache.delete(oldestKey);
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
    const memberRepo = new StarshipMemberRepository();
    const isMember = await memberRepo.isMember(args.userId, args.resourceStarshipId);
    if (!isMember) {
      sendError(args.res, 'ACCESS_DENIED', `Access denied to this ${args.resourceType}`, 200, {
        resource: args.resourceType,
        id: args.resourceId,
        reason: 'not_authorized',
      });
      return false;
    }
  } else {
    // owner/admin access allowed
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

function extractConnectorActionApiError(error: unknown): { code?: string; message?: string; details?: Record<string, unknown> } | null {
  // When connector_action is used with failOnNon2xx, the node throws an Error and attaches
  // the raw connector response as `error.cause`:
  //   { status, statusText, headers, body, url }
  //
  // If the underlying API uses the Starships ApiResponse contract:
  //   { success:false, error:{ code, message, details } }
  // we should preserve that error code for the server-tools envelope instead of
  // collapsing everything to INTERNAL_SERVER_ERROR.
  if (!(error instanceof Error)) return null;
  const cause = (error as unknown as { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object') return null;

  const body = (cause as Record<string, unknown>).body;
  if (!body || typeof body !== 'object') return null;

  const anyBody = body as Record<string, unknown>;
  if (anyBody.success !== false) return null;

  const err = anyBody.error;
  if (!err || typeof err !== 'object') return null;
  const anyErr = err as Record<string, unknown>;

  const code = typeof anyErr.code === 'string' && anyErr.code.trim().length > 0 ? anyErr.code : undefined;
  const message = typeof anyErr.message === 'string' && anyErr.message.trim().length > 0 ? anyErr.message : error.message || undefined;
  const details =
    anyErr.details && typeof anyErr.details === 'object' && !Array.isArray(anyErr.details)
      ? (anyErr.details as Record<string, unknown>)
      : undefined;

  if (!code && !message && !details) return null;
  return { code, message, details };
}

/**
 * Enforce private channel membership (conversation-backed channels).
 *
 * Starship collaborators can see starship resources, but private channels are more restrictive:
 * - owner / instance admin can always access
 * - otherwise require a row in `conversation_members`
 */
async function enforcePrivateChannelMembership(args: {
  conversationId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  try {
    const channelRepo = new ChannelRepository();
    const channel = await channelRepo.findByConversationId(args.conversationId).catch(() => null);
    if (!channel || !channel.isPrivate) return true;

    // Instance admin bypass
    const isAdmin = isInstanceAdmin(args.req.user);
    if (isAdmin) return true;

    // Owner bypass
    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(channel.starshipId).catch(() => null);
    if (starship && starship.ownerId === args.userId) return true;

    const memberRepo = new ConversationMemberRepository();
    const ok = await memberRepo.isMember(args.userId, args.conversationId);
    if (!ok) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
        resource: 'channel',
        conversationId: args.conversationId,
      });
      return false;
    }

    return true;
  } catch {
    // Best-effort: if we cannot evaluate channel membership, fail closed for safety.
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this channel', 403, {
      resource: 'channel',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
}

/**
 * Enforce direct message membership (conversation-backed DMs).
 *
 * Starship collaborators can see starship resources, but DMs are always restricted:
 * - instance admin can always access
 * - otherwise require a row in `conversation_members`
 */
async function enforceDirectMessageMembership(args: {
  conversationId: string;
  userId: string;
  req: Request;
  res: Response;
}): Promise<boolean> {
  try {
    const dmRepo = new DirectMessageRepository();
    const dm = await dmRepo.findByConversationId(args.conversationId).catch(() => null);
    if (!dm) return true;

    // Instance admin bypass
    const isAdmin = isInstanceAdmin(args.req.user);
    if (isAdmin) return true;

    const memberRepo = new ConversationMemberRepository();
    const ok = await memberRepo.isMember(args.userId, args.conversationId);
    if (!ok) {
      sendError(args.res, 'ACCESS_DENIED', 'Access denied to this direct message', 403, {
        resource: 'direct_message',
        conversationId: args.conversationId,
      });
      return false;
    }
    return true;
  } catch {
    // Best-effort: if we cannot evaluate DM membership, fail closed for safety.
    sendError(args.res, 'ACCESS_DENIED', 'Access denied to this direct message', 403, {
      resource: 'direct_message',
      conversationId: args.conversationId,
      reason: 'membership_check_failed',
    });
    return false;
  }
}

// tool execution uses the same runner config bundle as agent execution

async function executeToolBlueprint(args: {
  blueprint: Blueprint;
  toolConfig: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  runnerConfig: Record<string, unknown>;
  eventCallback?: EngineConfig['eventCallback'];
}): Promise<unknown> {
  const execution = ExecutionItemUtils.createExecution();
  const initial = ExecutionItemUtils.wrapSingle({ ...args.toolArgs, config: args.toolConfig });
  execution.results.push({ nodeRef: '__initial__', items: initial });
  const runner = RunnerFactory.getTopLevelRunner(execution.depth ?? 0);
  const items = await runner.run(args.blueprint, execution, {
    failOnNodeError: true,
    eventCallback: args.eventCallback,
    ...(args.runnerConfig as unknown as EngineConfig),
  });
  return ExecutionItemUtils.unwrapSingle(items);
}

type ToolResultAttachment = {
  id: string;
  previewUrl?: string;
};

type ToolResultAttachmentError = {
  index: number;
  reason: string;
};

type ParseBase64ImageDataUrlResult = { ok: true; mimeType: string; buffer: Buffer } | { ok: false; reason: string };

function parseBase64ImageDataUrl(dataUrl: string, opts: { maxImageBytes: number; maxDataUrlChars: number }): ParseBase64ImageDataUrlResult {
  if (typeof dataUrl !== 'string') return { ok: false, reason: 'not_a_string' };
  if (dataUrl.length > opts.maxDataUrlChars) return { ok: false, reason: 'data_url_too_large' };
  if (!dataUrl.startsWith('data:image/')) return { ok: false, reason: 'not_image_data_url' };

  const base64Marker = ';base64,';
  const markerIdx = dataUrl.indexOf(base64Marker);
  if (markerIdx < 0) return { ok: false, reason: 'missing_base64_marker' };

  // "data:" prefix length is 5
  const mimeTypeRaw = dataUrl.slice(5, markerIdx);
  if (!mimeTypeRaw.toLowerCase().startsWith('image/')) return { ok: false, reason: 'not_image_mime' };
  // Keep MIME parsing bounded: validate only small header portion.
  if (mimeTypeRaw.length > 64) return { ok: false, reason: 'mime_too_long' };
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeTypeRaw)) return { ok: false, reason: 'invalid_mime' };
  const mimeType = mimeTypeRaw.toLowerCase();

  let b64 = dataUrl.slice(markerIdx + base64Marker.length);
  if (!b64) return { ok: false, reason: 'empty_base64' };

  // Reject huge whitespace-containing base64 to avoid extra allocations. Most data URLs won't include whitespace.
  const hasWhitespace = /[\s]/.test(b64);
  if (hasWhitespace) {
    if (b64.length <= 1_000_000) {
      b64 = b64.replace(/\s+/g, '');
    } else {
      return { ok: false, reason: 'base64_contains_whitespace' };
    }
  }

  // Validate base64 characters and padding placement in a single pass (linear time).
  let paddingCount = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    const isAZ = c >= 65 && c <= 90;
    const isaz = c >= 97 && c <= 122;
    const is09 = c >= 48 && c <= 57;
    const isPlus = c === 43;
    const isSlash = c === 47;
    const isEq = c === 61;
    if (isEq) {
      paddingCount++;
      // padding must be at end
      continue;
    }
    if (paddingCount > 0) return { ok: false, reason: 'invalid_padding_position' };
    if (!(isAZ || isaz || is09 || isPlus || isSlash)) return { ok: false, reason: 'invalid_base64_char' };
  }
  if (paddingCount > 2) return { ok: false, reason: 'too_much_padding' };

  // Estimate decoded bytes before allocating the buffer.
  // bytes ≈ floor(len * 3/4) - padding
  const len = b64.length;
  if (len < 8) return { ok: false, reason: 'base64_too_short' };
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor((len * 3) / 4) - pad;
  if (!Number.isFinite(estimatedBytes) || estimatedBytes <= 0) return { ok: false, reason: 'invalid_base64_length' };
  if (estimatedBytes > opts.maxImageBytes) return { ok: false, reason: 'image_too_large' };

  try {
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer || buffer.length === 0) return { ok: false, reason: 'decoded_empty' };
    if (buffer.length > opts.maxImageBytes) return { ok: false, reason: 'image_too_large' };
    return { ok: true, mimeType, buffer };
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
}

async function replaceBase64ImagesWithAttachments(args: {
  value: unknown;
  starshipId: string;
  conversationId: string;
  maxImages?: number;
}): Promise<{ value: unknown; attachments: ToolResultAttachment[]; attachmentErrors: ToolResultAttachmentError[] }> {
  const MAX_IMAGE_BYTES = MAX_TOOL_RESULT_BASE64_IMAGE_BYTES;
  const MAX_DATA_URL_CHARS = MAX_TOOL_RESULT_DATA_URL_CHARS;

  const maxImages = Math.max(0, Math.min(20, Number(args.maxImages ?? 8)));
  if (maxImages === 0) return { value: args.value, attachments: [], attachmentErrors: [] };

  const candidates: string[] = [];
  const seen = new Set<string>();
  const attachmentErrors: ToolResultAttachmentError[] = [];

  const collect = (v: unknown, depth = 0): void => {
    if (candidates.length >= maxImages) return;
    if (depth > 10) return;
    if (typeof v === 'string') {
      // Common/cheap case: the value itself is a data URL.
      if (v.startsWith('data:image/') && v.includes(';base64,')) {
        // Bound individual strings early.
        if (v.length > MAX_DATA_URL_CHARS) {
          attachmentErrors.push({ index: candidates.length, reason: 'data_url_too_large' });
          return;
        }
        if (!seen.has(v)) {
          seen.add(v);
          candidates.push(v);
        }
      }
      return;
    }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const it of v) collect(it, depth + 1);
      return;
    }
    for (const it of Object.values(v as Record<string, unknown>)) {
      collect(it, depth + 1);
      if (candidates.length >= maxImages) return;
    }
  };

  collect(args.value);
  if (candidates.length === 0) return { value: args.value, attachments: [], attachmentErrors };

  const attachmentService = new AttachmentService();
  const urlToId = new Map<string, string>();
  const createdIds: string[] = [];

  for (let i = 0; i < candidates.length && createdIds.length < maxImages; i++) {
    const url = candidates[i];
    const parsed = parseBase64ImageDataUrl(url, { maxImageBytes: MAX_IMAGE_BYTES, maxDataUrlChars: MAX_DATA_URL_CHARS });
    if (!parsed.ok) {
      // Only report errors for things that looked like image data URLs (we only collected those),
      // so callers can decide whether to surface warnings.
      attachmentErrors.push({ index: i, reason: parsed.reason });
      continue;
    }
    try {
      const filenameBase = `generated_tool_${Date.now()}_${i}`;
      const created = await attachmentService.createGeneratedImageAttachment({
        starshipId: args.starshipId,
        conversationId: args.conversationId,
        mimeType: parsed.mimeType,
        buffer: parsed.buffer,
        filenameBase,
      });
      urlToId.set(url, created.id);
      createdIds.push(created.id);
    } catch (e) {
      attachmentErrors.push({ index: i, reason: 'persist_failed' });
    }
  }

  if (createdIds.length === 0) return { value: args.value, attachments: [], attachmentErrors };

  const apply = (v: unknown, depth = 0): unknown => {
    if (depth > 10) return v;
    if (typeof v === 'string') {
      let out = v;
      for (const [url, id] of urlToId.entries()) {
        if (out.includes(url)) out = out.split(url).join(`attachment://${id}`);
      }
      return out;
    }
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((it) => apply(it, depth + 1));
    const rec = v as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rec)) next[k] = apply(val, depth + 1);
    return next;
  };

  const replaced = apply(args.value);
  const full = (await attachmentService.getAttachmentsBatch(createdIds, args.starshipId).catch(() => [])) as Array<
    ToolResultAttachment & { id: string; previewUrl?: string }
  >;
  // Keep tool-result attachments lean: only what we need to render and feed vision models.
  const attachments: ToolResultAttachment[] = Array.isArray(full)
    ? full
        .map((a) => ({
          id: a.id,
          ...(typeof a.previewUrl === 'string' ? { previewUrl: String(a.previewUrl) } : {}),
        }))
        .filter((a) => typeof a.id === 'string' && a.id.length > 0)
    : [];
  return { value: replaced, attachments, attachmentErrors };
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
    if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) {
      return;
    }
    if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) {
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

      // 1) Always send a baseline snapshot from DB (bounded tail + latest known turn status)
      const page = await conversationService.getConversationMessagesPage({ conversationId, limit: 100 });
      const conversationMessages = page.messages;
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
      const hasMoreBefore = page.hasMoreBefore;
      const oldestCursor = page.oldestCursor;
      const activeTurnId =
        latestTurn &&
        typeof latestTurn.id === 'string' &&
        // Only augment snapshot with Redis deltas for *actively streaming* turns.
        // For waiting_for_tools (tool approval flow), augmenting can inject a synthetic `stream-${turnId}`
        // assistant message even though the DB already contains the tool-call assistant message, which
        // leads to perceived duplicates / ordering glitches after refresh.
        (latestTurn.status as StreamTurnStatus) === 'active'
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
              const alreadyPersistedById = Array.isArray(snapshotMessages) && snapshotMessages.some((m: MessageModel) => m.id === bestId);

              const alreadyPersisted = alreadyPersistedById;
              if (!alreadyPersisted) {
                const now = new Date().toISOString();
                const at = buf.lastAt || buf.firstAt || now;
                // CRITICAL FIX: Send empty streaming placeholder instead of replayed content
                // to avoid showing stale deltas from previous turns. The live stream will
                // populate it with fresh content.
                const derivedAssistantMsg: MessageModel = {
                  id: bestId,
                  role: 'assistant',
                  content: '', // Empty - let live stream populate it
                  messageType: 'agent_response',
                  createdAt: buf.firstAt || at,
                  updatedAt: at,
                  turnId: activeTurnId,
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

      // IMPORTANT: attach an id to the snapshot so clients can overwrite any stale local cursor on refresh.
      res.write(`id: ${snapshotCursor}\n`);
      res.write(`event: snapshot\n`);
      // Attach persisted widgets directly onto the snapshot messages as uiActions.
      // This avoids duplication caused by emitting "replay" ui_action events on reconnect.
      try {
        const convWidgetRepo = new ConversationWidgetRepository();
        const widgetRepo = new WidgetRepository();
        const convWidgets = await convWidgetRepo.listByConversation(conversationId, { limit: 50 });
        const byAnchor = new Map<string, Array<{ action: string; payload: Record<string, unknown> }>>();
        for (const cw of convWidgets) {
          if (!cw.anchorMessageId) continue;
          const widget = await widgetRepo.findById(cw.widgetId).catch(() => null);
          if (!widget) continue;
          const action = 'render_widget';
          const payload: Record<string, unknown> = {
            widget,
            anchorMessageId: cw.anchorMessageId,
            ...(cw.turnId ? { turnId: cw.turnId } : null),
            ...(cw.toolCallId ? { toolCallId: cw.toolCallId } : null),
          };
          const prev = byAnchor.get(cw.anchorMessageId) ?? [];
          prev.push({ action, payload });
          byAnchor.set(cw.anchorMessageId, prev);
        }
        if (byAnchor.size > 0 && Array.isArray(snapshotMessages)) {
          snapshotMessages = snapshotMessages.map((m: MessageModel & { uiActions?: unknown[] }) => {
            const mid = typeof m?.id === 'string' ? m.id : '';
            if (!mid) return m;
            const actions = byAnchor.get(mid);
            if (!actions || actions.length === 0) return m;
            const existing = Array.isArray(m.uiActions) ? m.uiActions : [];
            return { ...m, uiActions: [...existing, ...actions] };
          });
        }
      } catch {
        // best-effort only
      }

      res.write(`data: ${JSON.stringify({ conversationId, messages: snapshotMessages, turn, hasMoreBefore, oldestCursor })}\n\n`);

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
      // Keyset pagination (cursor-based). We currently ignore page/offset for this endpoint.
      const cursorValidation = validateData(
        z
          .object({
            beforeCreatedAt: z.string().datetime().optional(),
            beforeId: IdSchema.optional(),
          })
          .refine((v) => (v.beforeCreatedAt && !v.beforeId ? false : v.beforeId && !v.beforeCreatedAt ? false : true), {
            message: 'beforeCreatedAt and beforeId must be provided together',
          }),
        req.query,
        res,
        'message cursor'
      );
      if (!cursorValidation) return;

      const page = await conversationService.getConversationMessagesPage({
        conversationId,
        limit: paginationValidation.limit,
        ...(cursorValidation.beforeCreatedAt && cursorValidation.beforeId
          ? { beforeCreatedAt: cursorValidation.beforeCreatedAt, beforeId: cursorValidation.beforeId }
          : {}),
      });
      const messages = orderValidation.orderDirection === 'desc' ? page.messages.slice().reverse() : page.messages;

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
        hasMoreBefore: page.hasMoreBefore,
        oldestCursor: page.oldestCursor,
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
    if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) {
      return;
    }
    if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) {
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
      if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) {
        return;
      }
      if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) {
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
      // NOTE: We keep a small in-memory cache for hot tool-call loops, but permissions can be
      // changed out-of-band by the UI (e.g. "Always allow"). If we blindly trust a cached
      // 'ask'/'deny' value, we can incorrectly prompt again for a tool the user just allowed.
      //
      // So:
      // - Cache misses → read from DB and cache.
      // - Cache hits for 'allow' → trust (fast path).
      // - Cache hits for 'ask'/'deny' → re-check DB to pick up recent changes, then update cache.
      let permission =
        cachedPerm !== undefined ? cachedPerm : await agentRepo.getAgentToolPermissionBySlug(agentId, conversation.starshipId, toolSlug);
      if (cachedPerm === undefined) {
        setCachedPermission(permCacheKey, permission);
      } else if (cachedPerm === 'ask' || cachedPerm === 'deny') {
        const fresh = await agentRepo.getAgentToolPermissionBySlug(agentId, conversation.starshipId, toolSlug);
        permission = fresh;
        setCachedPermission(permCacheKey, fresh);
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
        // Idempotency: tool-call loops may retry the same toolCallId.
        // If an approval already exists, honor its status rather than creating a duplicate.
        const existing = await approvals.findByConversationAndToolCallId(conversationId, toolCallId).catch(() => null);
        if (existing) {
          // Starship/agent guardrails: approvals are scoped to a starship + conversation.
          if (existing.starshipId !== conversation.starshipId) {
            sendError(res, 'FORBIDDEN', 'Tool approval does not belong to this starship', 200, {
              approvalId: existing.id,
              agentId,
              toolSlug,
              toolCallId,
            });
            return;
          }
          if (existing.agentId !== agentId) {
            sendError(res, 'FORBIDDEN', 'Tool approval does not belong to this agent', 200, {
              approvalId: existing.id,
              agentId,
              toolSlug,
              toolCallId,
            });
            return;
          }

          if (existing.status === 'pending') {
            sendError(res, 'TOOL_APPROVAL_REQUIRED', 'Tool requires approval', 200, {
              approvalId: existing.id,
              agentId,
              toolSlug,
              toolCallId,
            });
            return;
          }

          if (existing.status === 'denied' || existing.status === 'expired') {
            // NOTE: This error is consumed by the agent tool-loop wrapper; keep as a distinct code.
            // Some build setups may not pick up newly added protocol union members immediately, so cast defensively.
            sendError(res, 'TOOL_APPROVAL_DENIED' as unknown as StandardErrorCode, 'Tool approval denied', 200, {
              approvalId: existing.id,
              agentId,
              toolSlug,
              toolCallId,
            });
            return;
          }

          // status === 'approved' → execute tool using the approved tool_id + args_json
          const toolById = await toolRepo.findById(existing.toolId);
          if (!toolById || toolById.starshipId !== conversation.starshipId) {
            sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 200, { toolSlug, toolCallId, toolId: existing.toolId });
            return;
          }
          if (toolById.status === 'draft' || !toolById.blueprint) {
            sendError(res, 'VALIDATION_ERROR', 'Tool is not ready for execution', 200, { toolSlug, toolCallId, toolId: existing.toolId });
            return;
          }

          const runtimeEnv = buildAutopilotRuntimeEnv({ starshipId: conversation.starshipId, conversationId, agentId });
          const { engineConfig } = await buildAutopilotExecutionBundle({ starshipId: conversation.starshipId, authUserId, runtimeEnv });
          const result = await executeToolBlueprint({
            blueprint: toolById.blueprint,
            toolConfig: (toolById.configuration || {}) as Record<string, unknown>,
            toolArgs: existing.argsJson || {},
            runnerConfig: engineConfig,
          });

          const normalized = await replaceBase64ImagesWithAttachments({
            value: result,
            starshipId: conversation.starshipId,
            conversationId,
            maxImages: 8,
          });
          sendSuccess(
            res,
            { toolCallId, result: normalized.value, attachments: normalized.attachments, attachmentErrors: normalized.attachmentErrors },
            200
          );
          return;
        }

        // First time we see this ask-first toolCallId: create the approval + notify UI.
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
        await new UIActionService(bus).publish(conversationId, {
          action: 'tool_approval_required',
          payload: {
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

      const bus = ConversationStreamBus.getInstance();
      const uiActions = new UIActionService(bus);
      const messageRepo = new MessageRepository();
      const conversationWidgetRepo = new ConversationWidgetRepository();

      const result = await executeToolBlueprint({
        blueprint: tool.blueprint,
        toolConfig: (tool.configuration || {}) as Record<string, unknown>,
        toolArgs: args || {},
        runnerConfig: engineConfig,
        eventCallback: async (evt: unknown) => {
          try {
            if (!evt || typeof evt !== 'object') return;
            if (!('type' in evt) || !('data' in evt)) return;
            const type = (evt as Record<string, unknown>)['type'];
            if (type !== 'ui_action') return;
            const data = (evt as Record<string, unknown>)['data'];
            if (!data || typeof data !== 'object') return;
            const dataRec = data as Record<string, unknown>;
            const action = typeof dataRec.action === 'string' ? dataRec.action : '';
            if (!action.trim()) return;
            const payload =
              dataRec.payload && typeof dataRec.payload === 'object' && !Array.isArray(dataRec.payload)
                ? (dataRec.payload as Record<string, unknown>)
                : undefined;

            // Persist rendered widgets across reloads by anchoring to an existing message id.
            // This is best-effort and must not affect tool execution.
            if (action.trim() === 'render_widget' && payload) {
              const widgetUnknown = payload.widget;
              const widgetId =
                widgetUnknown && typeof widgetUnknown === 'object' ? (widgetUnknown as Record<string, unknown>).id : undefined;
              const widgetIdStr = typeof widgetId === 'string' ? widgetId : widgetId != null ? String(widgetId) : '';

              if (widgetIdStr) {
                const assistantMsg = await messageRepo.findLatestAssistantMessageByToolCallId(conversationId, toolCallId).catch(() => null);
                const toolMsg = assistantMsg
                  ? null
                  : await messageRepo.findLatestToolMessageByToolCallId(conversationId, toolCallId).catch(() => null);
                const anchorMessageId = assistantMsg?.id ?? toolMsg?.id ?? null;
                const turnId = assistantMsg?.turnId ?? toolMsg?.turnId ?? null;

                if (anchorMessageId) {
                  // Upstream dedupe: if this widget is already associated to the same anchor message,
                  // don't re-publish the same render_widget again.
                  const persisted = await conversationWidgetRepo
                    .createOrIgnore({
                      starshipId: conversation.starshipId,
                      conversationId,
                      widgetId: widgetIdStr,
                      turnId,
                      anchorMessageId,
                      toolCallId,
                    })
                    .catch(() => null);
                  if (!persisted) return;

                  // Enrich live action for immediate attachment client-side.
                  payload.anchorMessageId = anchorMessageId;
                  if (turnId) payload.turnId = turnId;
                  payload.toolCallId = toolCallId;
                }
              }
            }

            await uiActions.publish(conversationId, payload ? { action: action.trim(), payload } : { action: action.trim() });
          } catch {
            // best-effort: never fail tool execution because UI signaling failed
          }
        },
      });

      const normalized = await replaceBase64ImagesWithAttachments({
        value: result,
        starshipId: conversation.starshipId,
        conversationId,
        maxImages: 8,
      });
      sendSuccess(
        res,
        { toolCallId, result: normalized.value, attachments: normalized.attachments, attachmentErrors: normalized.attachmentErrors },
        200
      );
    } catch (e) {
      const body = (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}) as Record<string, unknown>;
      const toolCallId = typeof body.toolCallId === 'string' ? String(body.toolCallId) : '';
      const msg = getSafeErrorMessageWithCause(e);
      const extracted = extractConnectorActionApiError(e);
      const code = extracted?.code ?? 'INTERNAL_SERVER_ERROR';
      const message = extracted?.message ?? msg;
      const details = { toolCallId, ...(extracted?.details ?? {}) };
      // extracted.code originates from Starships API responses (e.g. VALIDATION_ERROR) and
      // is compatible with StandardErrorCode at runtime, but is not statically typed here.
      sendError(res, code as unknown as StandardErrorCode, message, 200, details);
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
      if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) return;
      if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;

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

      // Mark approved (idempotent). Tool execution happens inside the agent tool-call loop
      // when the conversation is resumed, which preserves correct multi-tool-call ordering.
      const { approval: decided, updated } = await approvals.markApprovedIfPending(approvalId);
      if (!updated) {
        // Another request already decided this approval (approved/denied). Do not execute twice.
        sendSuccess(res, { status: decided.status, approvalId });
        return;
      }

      try {
        const bus = ConversationStreamBus.getInstance();
        await new UIActionService(bus).publish(conversationId, {
          action: 'tool_approval_resolved',
          payload: { approvalId, conversationId, status: 'approved' },
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
 * GET /conversations/:conversationId/tool-approvals/pending
 *
 * Used by the client to render pending ask-first approvals on refresh/navigation,
 * not just via SSE `ui_action`.
 */
router.get(
  '/conversations/:conversationId/tool-approvals/pending',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
      if (!paramsValidation) return;
      const { conversationId } = paramsValidation as { conversationId: string };

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
      if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) return;
      if (!(await enforceDirectMessageMembership({ conversationId, userId: authUserId, req, res }))) return;

      const approvalsRepo = new ToolCallApprovalRepository();
      const approvals = await approvalsRepo.findPendingByConversation(conversationId);

      // Join tool + agent display metadata for UI convenience.
      const toolRepo = new ToolRepository();
      const agentService = new AgentService();

      const toolIds = Array.from(
        new Set((approvals || []).map((a) => a.toolId).filter((x) => typeof x === 'string' && x.trim().length > 0))
      );
      const agentIds = Array.from(
        new Set((approvals || []).map((a) => a.agentId).filter((x) => typeof x === 'string' && x.trim().length > 0))
      );

      const [tools, agents] = await Promise.all([
        Promise.all(toolIds.map(async (id) => ({ id, tool: await toolRepo.findById(id).catch(() => null) }))),
        Promise.all(agentIds.map(async (id) => ({ id, agent: await agentService.getAgent(id).catch(() => null) }))),
      ]);

      const toolById = new Map<string, (ToolModel & { id: string }) | null>();
      for (const t of tools) {
        const tool = t.tool;
        // Starship guard: only expose tools that belong to the conversation's starship
        if (tool && tool.starshipId !== conversation.starshipId) toolById.set(t.id, null);
        else toolById.set(t.id, tool as (ToolModel & { id: string }) | null);
      }

      const agentNameById = new Map<string, string>();
      for (const a of agents) {
        const agent = a.agent;
        if (agent && agent.starshipId === conversation.starshipId) {
          agentNameById.set(a.id, agent.name);
        }
      }

      const payload = (approvals || [])
        .filter((a) => a.status === 'pending' && a.starshipId === conversation.starshipId)
        .map((a) => {
          const tool = toolById.get(a.toolId) ?? null;
          return {
            ...a,
            toolSlug: tool?.slug ?? '',
            toolName: tool?.name ?? '',
            agentName: agentNameById.get(a.agentId) ?? '',
          };
        });

      sendSuccess(res, payload, 200);
    } catch (error) {
      handleError(error, res, 'fetching pending tool approvals');
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
      if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) return;

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

      try {
        const bus = ConversationStreamBus.getInstance();
        await new UIActionService(bus).publish(conversationId, {
          action: 'tool_approval_resolved',
          payload: { approvalId, conversationId, status: 'denied' },
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
        if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) {
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
      // Multi-human support: persist author identity on the message so shared conversations/channels
      // can render the correct sender (not always “You”).
      const authUser = req.user as unknown as { id?: string; displayName?: string; email?: string; avatar?: string } | undefined;
      const authorUserId = typeof authUser?.id === 'string' ? authUser.id : undefined;
      const authorNameRaw =
        typeof authUser?.displayName === 'string' ? authUser.displayName : typeof authUser?.email === 'string' ? authUser.email : '';
      const authorName = authorNameRaw && authorNameRaw.trim().length > 0 ? authorNameRaw.trim() : undefined;
      const authorAvatar = typeof authUser?.avatar === 'string' && authUser.avatar.trim().length > 0 ? authUser.avatar.trim() : undefined;
      const userMessage = await messageService.createMessage({
        conversationId,
        role: 'user',
        content,
        messageType: 'user_input',
        ...(authorUserId && { userId: authorUserId }),
        ...(authorName && { userName: authorName }),
        ...(authorAvatar && { userAvatar: authorAvatar }),
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
          // Bound sync payload size; client can page older history via GET /conversations/:id/messages.
          const page = await conversationService.getConversationMessagesPage({ conversationId, limit: 200 });
          const messages = page.messages;
          // Include the server-authoritative turn status in the sync response.
          // This is critical for delegated conversations (call-agent) where execution can "complete"
          // early because the run is awaiting out-of-band tool approval (turn.status = waiting_for_tools).
          const turnRepo = new TurnRepository();
          const latestTurn = await turnRepo.findLatestByConversationId(conversationId).catch(() => null);
          const turn =
            latestTurn && typeof latestTurn.id === 'string'
              ? {
                  turnId: latestTurn.id,
                  status: (latestTurn.status as StreamTurnStatus) || 'completed',
                  startedAt: latestTurn.startedAt,
                  completedAt: latestTurn.completedAt,
                }
              : null;
          const awaitingToolApproval = turn?.status === 'waiting_for_tools';

          sendSuccess(
            res,
            {
              status: turn?.status || 'completed',
              streaming: false,
              conversationId,
              conversation: conversationWithFinalState
                ? { ...conversationWithFinalState, messages, hasMoreBefore: page.hasMoreBefore, oldestCursor: page.oldestCursor }
                : null,
              turn,
              awaitingToolApproval,
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
    if (!(await enforcePrivateChannelMembership({ conversationId, userId: authUserId, req, res }))) {
      return;
    }

    sendSuccess(res, conversation, 200);
  } catch (error) {
    handleError(error, res, 'fetching conversation details');
  }
});

/**
 * GET /conversations/:conversationId/children - Get child conversations for a parent
 *
 * Used by the client to detect pending tool approvals in child conversations after reload,
 * without relying on paginated starship conversation lists.
 */
router.get('/conversations/:conversationId/children', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ conversationId: IdSchema }), req.params, res, 'conversation parameter');
    if (!paramValidation) return;

    const { conversationId } = paramValidation;

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

    // IMPORTANT:
    // Do NOT rely on paginated starship conversation lists here; this endpoint must work on reload
    // even when the child conversation is not in the first page.
    //
    // Also IMPORTANT:
    // Keep this implemented purely in the server package so it does not depend on freshly-built
    // `@starships/models` dist typings.
    const all = await conversationService.getConversationsByStarshipWithAgents(conversation.starshipId);
    const children = (all ?? []).filter((c) => c.parentConversationId === conversationId);
    sendSuccess(res, children, 200);
  } catch (error) {
    handleError(error, res, 'fetching child conversations');
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
    const allConversations = await conversationService.getConversationsByStarshipWithAgents(starshipId);

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
        parentConversationId: IdSchema.optional(),
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

    // No-stray enforcement:
    // - Child conversations (parentConversationId set) are allowed as nested threads.
    // - Top-level conversations must be either a DM (agent provided) or a Channel (via channels API).
    const parentConversationId = bodyValidation.parentConversationId;
    const effectiveAgentId = resolvedAgentId ?? bodyValidation.agentId;
    if (!isInternal && !parentConversationId && !effectiveAgentId) {
      sendError(res, 'VALIDATION_ERROR', 'Top-level conversations must be created as a channel or a direct message', 400, {
        hint: 'Use POST /starships/:starshipId/channels or POST /starships/:starshipId/direct-messages',
      });
      return;
    }

    const conversationService = new ConversationService();
    // For external callers creating top-level agent chats, create/reuse a DM instead of a raw conversation.
    if (!isInternal && !parentConversationId && effectiveAgentId && authUserId) {
      const dmRepo = new DirectMessageRepository();
      const existingDm = await dmRepo.findUserAgentDm(bodyValidation.starshipId, authUserId, effectiveAgentId).catch(() => null);
      if (existingDm) {
        const existingConversation = await conversationService.getConversationById(existingDm.conversationId);
        if (existingConversation) {
          sendSuccess(res, existingConversation, 200);
          return;
        }
      }

      const conversation = await conversationService.createConversation({
        title: bodyValidation.title || 'New Conversation',
        status: 'active',
        starshipId: bodyValidation.starshipId,
        agentId: effectiveAgentId,
        parentConversationId,
      });

      await dmRepo
        .create({
          conversationId: conversation.id,
          starshipId: bodyValidation.starshipId,
          dmType: 'user_agent',
          userId: authUserId,
          agentId: effectiveAgentId,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt ?? conversation.createdAt,
        })
        .catch(() => null);

      const memberRepo = new ConversationMemberRepository();
      await memberRepo
        .createOrIgnoreMember({ conversationId: conversation.id, userId: authUserId, role: 'admin', createdBy: authUserId })
        .catch(() => null);

      sendSuccess(res, conversation, 201);
      return;
    }

    // Otherwise, fall back to raw conversation creation (internal/scheduled or nested).
    const conversation = await conversationService.createConversation({
      title: bodyValidation.title || 'New Conversation',
      status: 'active',
      starshipId: bodyValidation.starshipId,
      agentId: effectiveAgentId,
      parentConversationId,
    });

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

    // Prevent deleting the starship's default channel conversation.
    // Stored at the starship level to make the invariant explicit.
    try {
      const conn = getConnection();
      const row = await conn.queryOne<{ default_channel_conversation_id: string | null }>(
        `SELECT default_channel_conversation_id
           FROM starships
          WHERE id = $1`,
        [conversation.starshipId]
      );
      const defaultId = row?.default_channel_conversation_id ? String(row.default_channel_conversation_id) : '';
      if (defaultId && defaultId === conversationId) {
        sendError(res, 'ACCESS_DENIED', 'Cannot delete the default channel for a starship', 403, {
          conversationId,
          starshipId: conversation.starshipId,
        });
        return;
      }
    } catch {
      // Pre-migration compatibility: if the column doesn't exist yet, do not block.
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
