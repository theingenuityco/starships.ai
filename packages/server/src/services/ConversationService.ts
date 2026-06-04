import { MessageService } from '@/services/MessageService';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { ConnectorSecretService } from '@/services/ConnectorSecretService';
import { UsageService } from '@/services/UsageService';
import { AttachmentService } from '@/services/AttachmentService';
import type { LlmMessage, LlmToolCall } from '@starships/protocol';
import { NotFoundError, ConflictError, ValidationError } from '@starships/errors';
import {
  ConversationRepository,
  AgentRepository,
  TurnRepository,
  LlmModelRepository,
  UserRepository,
  ToolCallApprovalRepository,
  getConnection,
} from '@starships/models';
import {
  AgentModel,
  ConversationModel,
  ConversationStatus,
  Message,
  MessageModel,
  StarshipModel,
  ConversationStreamEvent,
} from '@starships/protocol';
import type { ContentBlock, MessageContent } from '@starships/protocol';
import { isTextFile, MAX_TEXT_FILE_SIZE } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { runAgentTurn } from '@/services/AgentTurn';
import OpenAI from 'openai';
import { StarshipTurnLeaseService } from '@/services/StarshipTurnLeaseService';
import { UIActionService } from '@/services/UIActionService';
import { NotificationService } from '@/services/NotificationService';
import { parse, Allow } from 'partial-json-parser';
import { fetchTextFromS3 } from '@/utils/s3-helper';
import { buildStarshipSystemPromptContext } from '@/utils/starship-system-prompt-context';
import { composeCanonicalSystemPrompt, type ThreadContextState } from '@/utils/SystemPromptComposer';
// Connector runtime (http_request.connector) removed in v2; connector_action uses template+session bundles.
import { AgentService } from '@/services/AgentService';
import {
  resolvePlugins,
  mergeConversationState,
  extractPersistableState as extractPersistableStateUtil,
  hasPlugins,
} from '@/utils/conversation-state';
import type { ConversationState, AgentState } from '@starships/protocol';
import { resolveRoomConversationContext } from '@/utils/conversation-membership';

type StreamingToolCallAccum = {
  id?: string;
  type: 'function';
  function: {
    name?: string;
    arguments: string; // accumulating JSON string during streaming
  };
};

// Parser state for incremental tool argument parsing per conversation/index

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  /**
   * Coerce a DB-ish timestamp into a real Date.
   *
   * We intentionally accept both:
   * - ISO strings (protocol shape)
   * - Date objects (node-postgres default for timestamptz)
   */
  private coerceToDate(value: unknown): Date | null {
    try {
      if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? new Date(t) : null;
      }
      if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return null;
        const d = new Date(s);
        return Number.isFinite(d.getTime()) ? d : null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        // Heuristic: seconds vs ms since epoch
        const ms = value < 5_000_000_000 ? value * 1000 : value;
        const d = new Date(ms);
        return Number.isFinite(d.getTime()) ? d : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private coerceToIsoString(value: unknown): string | undefined {
    const d = this.coerceToDate(value);
    return d ? d.toISOString() : undefined;
  }
  private static instance: ConversationService | null = null;
  // Mention token ID allowlist.
  // IMPORTANT: Most IDs in this codebase are nanoid() strings (URL-safe), not UUIDs.
  // We allow both to prevent "accept anything" parsing while supporting legacy UUID-backed tables.
  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly NANOID_RE = /^[a-z0-9_-]{10,64}$/i;
  private static isValidMentionId(id: string): boolean {
    const s = String(id || '').trim();
    if (!s) return false;
    return ConversationService.UUID_RE.test(s) || ConversationService.NANOID_RE.test(s);
  }

  static filterMessagesForLlmHistory<T extends { role?: unknown }>(messages: T[]): T[] {
    const list = Array.isArray(messages) ? messages : [];
    return list.filter((m) => String(m?.role ?? '') !== 'system');
  }
  private conversationRepository!: ConversationRepository;
  private agentRepository!: AgentRepository;
  private userRepository!: UserRepository;
  private messageService!: MessageService;
  private turnRepository!: TurnRepository;
  private streamBus!: ConversationStreamBus;
  private uiActions!: UIActionService;
  // Best-effort mapping of toolCallId -> tool function name (per conversation).
  // Used to emit UI actions produced explicitly by Autopilot (event.type === 'ui_action').
  private lastToolCallNameByConversation: Map<string, Map<string, string>> = new Map();
  // Streaming assistant message id per conversation (per current turn)
  private streamingAssistantMessageId: Map<string, string> = new Map();
  // Buffer deltas so we don't XADD per token (which slows streaming dramatically).
  private pendingContentDelta: Map<string, { buf: string; timer: NodeJS.Timeout | null; flushing: boolean }> = new Map();
  private pendingReasoningDelta: Map<string, { buf: string; timer: NodeJS.Timeout | null; flushing: boolean }> = new Map();
  // Track active runner cancellation handles per conversation
  private static activeCancellations: Map<string, () => void> = new Map();
  // Kept for future use (runtime secrets, connector context, etc.)

  private connectorSecretService!: ConnectorSecretService;
  private usageService!: UsageService;
  private notifications!: NotificationService;
  // Track accumulated content for streaming messages by conversation ID
  private streamingContent: Map<string, string> = new Map();
  // Resume state per conversation generation
  private generationId: Map<string, string> = new Map();
  // DB-backed turn id (one conversation -> many turns)
  private currentTurnId: Map<string, string> = new Map();
  // Baseline index for execution.state.messages at turn start (used to compute per-turn seq)
  private currentTurnBaseIndex: Map<string, number> = new Map();
  private accumulatedLength: Map<string, number> = new Map();
  // CRITICAL FIX: Track next chunk position atomically to prevent race conditions
  private nextChunkPosition: Map<string, number> = new Map();
  // CRITICAL FIX: Serialize chunk processing per conversation to prevent race conditions
  private chunkProcessingLock: Map<string, Promise<void>> = new Map();
  private placeholderEmitted: Map<string, boolean> = new Map();
  private ringBuffer: Map<string, Array<{ position: number; content: string; ts: number }>> = new Map();
  // Track accumulated toolCalls during streaming per conversation
  private streamingToolCalls: Map<string, StreamingToolCallAccum[]> = new Map();
  // Track generated image attachments for the current streaming assistant placeholder
  private streamingGeneratedAttachmentIds: Map<string, string[]> = new Map();
  private streamingGeneratedImageUrlSeen: Map<string, Set<string>> = new Map();

  // Track accumulated reasoning during streaming per conversation
  private streamingReasoning: Map<string, string> = new Map();
  // Track last broadcasted toolCalls snapshot (serialized) to avoid duplicate replace spam
  private lastToolCallsBroadcastHash: Map<string, string> = new Map();
  // Track whether the currently active streaming assistant placeholder has been persisted
  private activeStreamPersisted: Set<string> = new Set();
  // Track latest provider-reported usage during streaming for mid-turn persistence
  private latestStreamingUsage: Map<
    string,
    { promptTokens: number; completionTokens: number; totalTokens: number; cost: number; model?: string }
  > = new Map();
  // Monotonic per-active-stream sequence for streamed chunks within the current assistant placeholder
  private streamSeq: Map<string, number> = new Map();
  // Once we've seen a message.content snapshot for a stream, prefer snapshots and ignore delta tokens to avoid reordering
  private snapshotPreferred: Set<string> = new Set();
  // Sequence for tool-call argument deltas (per conversation)
  private toolCallSeq: Map<string, number> = new Map();
  /**
   * Compute a non-overlapping append by trimming any prefix of 'fragment' that
   * already exists as a suffix of 'base'. This guards against providers that
   * re-send overlapping chunks (delta + snapshot or resume replays).
   */
  private static computeNonOverlappingAppend(base: string, fragment: string): string {
    if (!fragment) return '';
    const maxCheck = Math.min(base.length, fragment.length);
    for (let k = maxCheck; k > 0; k--) {
      if (base.endsWith(fragment.slice(0, k))) {
        return fragment.slice(k);
      }
    }
    // No overlap; append entire fragment
    return fragment;
  }
  // Track last persisted message index to avoid re-persisting on workflow loops
  private lastPersistedIndex: Map<string, number> = new Map();
  // When resuming a turn (e.g., after tool approval), we need to keep turnSeq monotonic.
  // We do that by shifting currentTurnBaseIndex so i - baseIdx continues after max(existing turnSeq).
  private resumeTurnSeqOffset: Map<string, number> = new Map();
  // Suppress broadcasting 'complete' for conversations during multi-agent orchestration
  private suppressCompleteFor: Set<string> = new Set();
  // Track if an assistant message has been persisted for the current turn to avoid duplicates on stop
  private assistantPersistedThisTurn: Set<string> = new Set();
  // Track if a usage row has been persisted for the current turn (provider or estimate)
  private usagePersistedThisTurn: Set<string> = new Set();
  // When the user presses Stop, mark the conversation so we avoid persisting toolCalls without tool results.
  private stopRequestedForConversation: Set<string> = new Set();
  // Track which agent is currently producing streamed content for a conversation (for attribution)
  private currentAgentForConversation: Map<string, { id: string; name: string }> = new Map();
  // LLM model catalog repository (for pricing/context metadata)
  private llmModelRepository!: LlmModelRepository;
  // Best-effort in-memory pricing cache to avoid DB reads on every turn
  private static modelPricingCache: Map<
    string,
    { promptPerToken?: number; completionPerToken?: number; request?: number; expiresAt: number }
  > = new Map();
  // connector_action bundles are built per-request (requires authUserId)

  constructor() {
    // Enforce singleton to share in-memory streaming buffers across routes/requests
    if (ConversationService.instance) {
      return ConversationService.instance;
    }
    this.conversationRepository = new ConversationRepository();
    this.agentRepository = new AgentRepository();
    this.userRepository = new UserRepository();
    this.messageService = new MessageService();
    this.turnRepository = new TurnRepository();
    this.llmModelRepository = new LlmModelRepository();
    this.streamBus = ConversationStreamBus.getInstance();
    this.uiActions = new UIActionService(this.streamBus);
    this.connectorSecretService = new ConnectorSecretService();
    this.usageService = new UsageService();
    this.notifications = new NotificationService();

    ConversationService.instance = this;
    return this;
  }

  /**
   * Compute USD cost when provider does not include usage.cost (e.g. BYOK OpenRouter).
   *
   * We currently interpret OpenRouter-style pricing values as USD per 1M tokens:
   * - pricing.prompt: $/1M input tokens
   * - pricing.completion: $/1M output tokens
   * - pricing.request: $/request (optional)
   *
   * This uses our DB-backed catalog (`llm_model_providers.pricing`) populated via sync.
   */
  private async computeCostFromCatalog(args: {
    model: string | undefined;
    promptTokens: number;
    completionTokens: number;
  }): Promise<number | null> {
    const model = typeof args.model === 'string' ? args.model.trim() : '';
    if (!model) return null;

    const promptTokens = Number(args.promptTokens || 0);
    const completionTokens = Number(args.completionTokens || 0);
    if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;

    const now = Date.now();
    const cached = ConversationService.modelPricingCache.get(model);
    if (cached && cached.expiresAt > now) {
      const perTokenIn = typeof cached.promptPerToken === 'number' ? cached.promptPerToken : 0;
      const perTokenOut = typeof cached.completionPerToken === 'number' ? cached.completionPerToken : 0;
      const perReq = typeof cached.request === 'number' ? cached.request : 0;
      const cost = promptTokens * perTokenIn + completionTokens * perTokenOut + perReq;
      return Number.isFinite(cost) ? cost : null;
    }

    // Fetch provider routes; repository orders by priority DESC so [0] is "best".
    const routes = await this.llmModelRepository.listProvidersForModel(model, { enabledOnly: true }).catch(() => []);
    // Prefer the first route that actually has usable pricing (some providers/routes may omit it).
    const pickPricing = (): Record<string, unknown> | null => {
      const list = Array.isArray(routes) ? routes : [];
      for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        const pricing = (r as { pricing?: unknown }).pricing;
        if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) continue;
        // Treat it as usable if it has at least one of the expected pricing keys.
        const pr = pricing as Record<string, unknown>;
        if ('prompt' in pr || 'completion' in pr || 'request' in pr) return pr;
      }
      return null;
    };
    const pricing = pickPricing();

    const toNum = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    };

    // OpenRouter catalog pricing fields are USD per 1 token (strings in the API).
    const promptPerToken = toNum(pricing ? pricing['prompt'] : undefined);
    const completionPerToken = toNum(pricing ? pricing['completion'] : undefined);
    const request = toNum(pricing ? pricing['request'] : undefined);

    // Cache for 10 minutes (best-effort)
    ConversationService.modelPricingCache.set(model, {
      promptPerToken,
      completionPerToken,
      request,
      expiresAt: now + 10 * 60 * 1000,
    });

    const perTokenIn = typeof promptPerToken === 'number' ? promptPerToken : 0;
    const perTokenOut = typeof completionPerToken === 'number' ? completionPerToken : 0;
    const perReq = typeof request === 'number' ? request : 0;
    const cost = promptTokens * perTokenIn + completionTokens * perTokenOut + perReq;
    return Number.isFinite(cost) ? cost : null;
  }

  /**
   * Prefer BYOK upstream USD cost when present.
   * OpenRouter usage accounting may include:
   * - usage.cost (credits charged to OpenRouter)
   * - usage.cost_details.upstream_inference_cost (BYOK: upstream provider USD cost)
   */
  private extractProviderCost(usage: unknown): number | undefined {
    const u = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : null;
    if (!u) return undefined;

    const costDetails = u['cost_details'];
    const cd = costDetails && typeof costDetails === 'object' ? (costDetails as Record<string, unknown>) : null;
    const upstream = cd ? cd['upstream_inference_cost'] : undefined;
    if (typeof upstream === 'number' && Number.isFinite(upstream)) return upstream;

    const cost = u['cost'];
    if (typeof cost === 'number' && Number.isFinite(cost)) return cost;
    return undefined;
  }

  private enqueueDelta(kind: 'content' | 'reasoning', conversationId: string, delta: string): void {
    const map = kind === 'content' ? this.pendingContentDelta : this.pendingReasoningDelta;
    const entry = map.get(conversationId) ?? { buf: '', timer: null, flushing: false };
    entry.buf += delta;
    map.set(conversationId, entry);

    // Flush quickly for responsiveness, but avoid Redis roundtrip per-token.
    // - if buffer is large, flush immediately
    // - otherwise flush on a short timer
    if (entry.buf.length >= 1024) {
      void this.flushDelta(kind, conversationId);
      return;
    }
    if (!entry.timer) {
      entry.timer = setTimeout(() => void this.flushDelta(kind, conversationId), 50);
      map.set(conversationId, entry);
    }
  }

  /**
   * Flush buffered deltas for a conversation exactly-once per buffer snapshot.
   *
   * This prevents a race where:
   * - the timer-based flush from enqueueDelta()
   * - and the final flushPendingDeltas() at turn completion
   * both publish the same last buffer.
   */
  private async flushDelta(kind: 'content' | 'reasoning', conversationId: string): Promise<void> {
    const map = kind === 'content' ? this.pendingContentDelta : this.pendingReasoningDelta;
    const entry = map.get(conversationId);
    if (!entry) return;
    if (entry.flushing) return;

    entry.flushing = true;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    const payload = entry.buf;
    entry.buf = '';
    map.set(conversationId, entry);

    try {
      if (!payload) return;
      const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
      const messageId = this.streamingAssistantMessageId.get(conversationId) || `stream-${turnId}`;
      this.streamingAssistantMessageId.set(conversationId, messageId);
      const agent = this.currentAgentForConversation.get(conversationId);
      const event: ConversationStreamEvent =
        kind === 'content'
          ? {
              type: 'assistant.delta',
              data: {
                conversationId,
                turnId,
                messageId,
                ...(agent?.id ? { agentId: agent.id } : {}),
                ...(agent?.name ? { agentName: agent.name } : {}),
                delta: payload,
                at: new Date().toISOString(),
              },
            }
          : {
              type: 'assistant.reasoning_delta',
              data: {
                conversationId,
                turnId,
                messageId,
                ...(agent?.id ? { agentId: agent.id } : {}),
                ...(agent?.name ? { agentName: agent.name } : {}),
                delta: payload,
                at: new Date().toISOString(),
              },
            };
      await this.streamBus.publish(conversationId, event);
    } catch (err) {
      console.warn('[STREAM] Failed to publish buffered delta', {
        conversationId,
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      const cur = map.get(conversationId);
      if (cur) {
        cur.flushing = false;

        // If new deltas arrived while we were publishing, schedule another flush.
        if (cur.buf && cur.buf.length > 0 && !cur.timer) {
          cur.timer = setTimeout(() => void this.flushDelta(kind, conversationId), 10);
        }
        map.set(conversationId, cur);
      }
    }
  }

  private async flushPendingDeltas(conversationId: string): Promise<void> {
    await this.flushDelta('content', conversationId);
    await this.flushDelta('reasoning', conversationId);
  }

  /**
   * Clear all in-memory, per-conversation streaming/turn state to avoid leaks once
   * a conversation (or turn) has fully finished. This is safe to call multiple times.
   */
  private clearStreamingState(conversationId: string): void {
    // Per-turn / streaming accumulators
    this.streamingContent.delete(conversationId);
    this.streamingToolCalls.delete(conversationId);
    // IMPORTANT:
    // Do NOT clear streamingReasoning here.
    // After stop/cancel, late runner events (node_completed/workflow_completed) can still arrive and may
    // rely on last-known reasoning to persist a consistent assistant snapshot.
    this.streamingGeneratedAttachmentIds.delete(conversationId);
    this.streamingGeneratedImageUrlSeen.delete(conversationId);
    this.ringBuffer.delete(conversationId);
    this.latestStreamingUsage.delete(conversationId);
    this.streamSeq.delete(conversationId);
    this.snapshotPreferred.delete(conversationId);
    this.toolCallSeq.delete(conversationId);
    this.placeholderEmitted.delete(conversationId);

    // Resume / sequencing metadata
    this.generationId.delete(conversationId);
    this.accumulatedLength.delete(conversationId);
    this.nextChunkPosition.delete(conversationId);
    this.chunkProcessingLock.delete(conversationId);
    // IMPORTANT:
    // Do NOT clear lastPersistedIndex / persisted guards here.
    // After stop/cancel, late runner events (node_completed/workflow_completed) can still arrive.
    // If we clear lastPersistedIndex, the node_completed persistence pass can start from -1 and
    // re-persist the entire execution.state.messages history, duplicating all conversation messages.

    this.suppressCompleteFor.delete(conversationId);

    // Misc per-conversation flags / attribution
    // Leave these guards intact until the next workflow_started resets them.
    // This prevents stop/pause + late events from persisting multiple times.
    this.currentAgentForConversation.delete(conversationId);
    this.lastToolCallsBroadcastHash.delete(conversationId);
  }

  /**
   * Final cleanup for a conversation's *turn lifecycle* state.
   * Use this ONLY when we are confident no further runner events should be applied
   * for the current turn (e.g. workflow_completed / workflow_failed).
   */
  private finalizeTurnState(conversationId: string): void {
    // Clear bulky streaming state first
    this.clearStreamingState(conversationId);
    // Now that the turn is definitively finished, drop any retained reasoning.
    this.streamingReasoning.delete(conversationId);

    // Turn identity + sequencing (safe to clear only once turn is definitively finished)
    this.currentTurnId.delete(conversationId);
    this.currentTurnBaseIndex.delete(conversationId);
    this.lastPersistedIndex.delete(conversationId);

    // Per-turn persistence guards (no longer needed once the turn is complete/failed)
    this.assistantPersistedThisTurn.delete(conversationId);
    this.activeStreamPersisted.delete(conversationId);
    this.usagePersistedThisTurn.delete(conversationId);

    // Also ensure we don't keep any outstanding cancellation handles around
    ConversationService.activeCancellations.delete(conversationId);

    // Stop guard is turn-scoped; clear once the turn is definitively finished.
    this.stopRequestedForConversation.delete(conversationId);
  }

  /**
   * Aggressively clear ALL per-conversation in-memory state once a turn is definitively over.
   * This prevents unbounded growth in singleton Maps/Sets across many conversations.
   */
  private cleanupConversation(conversationId: string): void {
    this.finalizeTurnState(conversationId);

    // Tool call name cache (per conversation)
    this.lastToolCallNameByConversation.delete(conversationId);

    // Streaming assistant message id (per conversation)
    this.streamingAssistantMessageId.delete(conversationId);

    // Pending delta buffers + timers
    const pc = this.pendingContentDelta.get(conversationId);
    if (pc?.timer) clearTimeout(pc.timer);
    this.pendingContentDelta.delete(conversationId);

    const pr = this.pendingReasoningDelta.get(conversationId);
    if (pr?.timer) clearTimeout(pr.timer);
    this.pendingReasoningDelta.delete(conversationId);

    // Resume sequencing metadata
    this.resumeTurnSeqOffset.delete(conversationId);
  }

  /**
   * Extract completed properties from a JSON-like string buffer using partial-json-parser only.
   */
  private static extractCompletedTopLevelProperties(jsonLike: string): Record<string, unknown> {
    if (typeof jsonLike !== 'string' || jsonLike.length === 0) return {};
    try {
      const v = parse(jsonLike, Allow.ALL as number) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch (err) {
      console.error('[ConversationService] Failed to parse partial JSON', {
        error: err instanceof Error ? err.message : String(err),
        jsonLike: jsonLike?.substring(0, 100),
      });
      return {};
    }
  }

  /** Persist the currently active streaming assistant partial (content/reasoning only) if any. */
  private async persistActivePartial(conversationId: string): Promise<MessageModel | null> {
    // If we've already persisted the active stream for this conversation, skip
    if (this.activeStreamPersisted.has(conversationId)) {
      return null;
    }

    // If an assistant message was already persisted for this turn (via state message persistence),
    // do NOT persist again on stop/pause. This prevents duplicate saved messages when stop triggers
    // while the normal persistence path is also running.
    if (this.assistantPersistedThisTurn.has(conversationId)) {
      return null;
    }

    // Reconstruct partials from ringBuffer/accumulators
    let partialContent = this.streamingContent.get(conversationId) || '';
    const partialReasoning = this.streamingReasoning.get(conversationId) || '';

    try {
      const rb = this.ringBuffer.get(conversationId) || [];
      if (Array.isArray(rb) && rb.length > 0) {
        const sorted = [...rb].sort((a, b) => Number(a.position) - Number(b.position));
        let agg = '';
        for (const item of sorted) {
          const frag = typeof item.content === 'string' ? item.content : '';
          agg += ConversationService.computeNonOverlappingAppend(agg, frag);
        }
        if (agg && agg.length > 0) {
          partialContent = agg;
        }
      }
    } catch (err) {
      console.warn('[STREAMING] Failed to reconstruct partial from ring buffer', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const pendingAttachmentIds = this.streamingGeneratedAttachmentIds.get(conversationId) || [];

    // Only persist if we have something meaningful
    if (
      (partialContent && partialContent.trim().length > 0) ||
      (partialReasoning && partialReasoning.trim().length > 0) ||
      pendingAttachmentIds.length > 0
    ) {
      // IMPORTANT:
      // This function can be invoked from multiple concurrent pathways (e.g. user stop + lifecycle events).
      // Add the persisted guard *before* any awaits so it acts as an atomic "in-flight" lock and prevents
      // double inserts when two calls race past the initial checks.
      this.activeStreamPersisted.add(conversationId);
      const agent = this.currentAgentForConversation.get(conversationId);
      try {
        const starship = await this.getConversationStarship(conversationId);
        const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || 'turn';
        // Partial assistant is always the first assistant slot after the baseline user message.
        // We intentionally avoid relying on mutable lastPersistedIndex here.
        const turnSeq = 1;

        const persistedMsg = await this.messageService.upsertMessageByTurnSlot({
          conversationId,
          turnId,
          turnSeq,
          role: 'assistant',
          content: partialContent || '',
          messageType: 'agent_response',
          ...(partialReasoning ? { reasoning: partialReasoning } : {}),
          ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
          ...(pendingAttachmentIds.length > 0 ? { attachmentIds: pendingAttachmentIds } : {}),
        });

        // Link generated attachments to the persisted message (best-effort)
        try {
          if (starship && pendingAttachmentIds.length > 0) {
            const attachmentService = new AttachmentService();
            await Promise.all(
              pendingAttachmentIds.map((id) => attachmentService.linkToMessage(id, persistedMsg.id, starship.id).catch(() => false))
            );
          }
        } catch (err) {
          console.error('[ConversationService] Failed to emit UI action for child conversation', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
          });
        }

        // Mark per-turn persisted flag (active-stream guard already set above)
        this.assistantPersistedThisTurn.add(conversationId);

        // Clear accumulators for the active stream so a future stream can start cleanly
        this.streamingContent.delete(conversationId);
        this.streamingToolCalls.delete(conversationId);
        // Do NOT clear streamingReasoning here (see clearStreamingState notes).
        // Retain last-known reasoning through stop/cancel so late lifecycle events can still persist it.
        this.ringBuffer.delete(conversationId);
        this.streamingGeneratedAttachmentIds.delete(conversationId);
        this.streamingGeneratedImageUrlSeen.delete(conversationId);

        return persistedMsg;
      } catch (err) {
        // Roll back the in-flight guard so the caller can retry if needed.
        this.activeStreamPersisted.delete(conversationId);
        throw err;
      }
    }
    return null;
  }

  private static parseBase64ImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
    if (typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\n\r]+)$/i);
    if (!m) return null;
    const mimeType = m[1].toLowerCase();
    const b64 = m[2].replace(/\s+/g, '');
    try {
      const buffer = Buffer.from(b64, 'base64');
      if (!buffer || buffer.length === 0) return null;
      return { mimeType, buffer };
    } catch (err) {
      console.error('[ConversationService] Failed to parse base64 image data URL', {
        error: err instanceof Error ? err.message : String(err),
        dataUrlLength: dataUrl?.length,
      });
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Mention token decoding (LLM prompt only; DB content remains unchanged)
  // --------------------------------------------------------------------------

  private static collectMentionRefsFromText(content: string): { userRefs: Set<string>; agentRefs: Set<string> } {
    let text = typeof content === 'string' ? content : '';
    // Guard: avoid regex scanning extremely large payloads (DoS risk).
    if (text.length > 20_000) text = text.slice(0, 20_000);
    const userRefs = new Set<string>();
    const agentRefs = new Set<string>();
    const userRe = /<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi;
    const agentRe = /<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = userRe.exec(text))) {
      const ref = String(m[1] || '').trim();
      if (ref) userRefs.add(ref);
    }
    while ((m = agentRe.exec(text))) {
      const ref = String(m[1] || '').trim();
      if (ref) agentRefs.add(ref);
    }
    return { userRefs, agentRefs };
  }

  private static collectMentionRefsFromMessages(messages: MessageModel[]): { userRefs: Set<string>; agentRefs: Set<string> } {
    const userRefs = new Set<string>();
    const agentRefs = new Set<string>();
    for (const msg of Array.isArray(messages) ? messages : []) {
      const content = typeof msg?.content === 'string' ? msg.content : '';
      if (!content || (!content.includes('<@u:') && !content.includes('<@a:'))) continue;
      const parsed = ConversationService.collectMentionRefsFromText(content);
      parsed.userRefs.forEach((ref) => userRefs.add(ref));
      parsed.agentRefs.forEach((ref) => agentRefs.add(ref));
    }
    return { userRefs, agentRefs };
  }

  private async resolveMentionNameMaps(args: {
    starshipId: string;
    userRefs: Set<string>;
    agentRefs: Set<string>;
  }): Promise<{ agentNameByRef: Map<string, string>; userNameByRef: Map<string, string> }> {
    const starshipId = String(args.starshipId || '').trim();
    const userRefs = Array.from(args.userRefs || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    const agentRefs = Array.from(args.agentRefs || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean);

    const agentNameByRef = new Map<string, string>();
    const userNameByRef = new Map<string, string>();
    if (!starshipId || (userRefs.length === 0 && agentRefs.length === 0)) {
      return { agentNameByRef, userNameByRef };
    }

    const conn = getConnection();
    const [agentRows, userRows] = await Promise.all([
      agentRefs.length > 0
        ? conn
            .query<{ id: string; slug: string | null; name: string | null }>(
              `SELECT id, slug, name
                 FROM agents
                WHERE starship_id = $1
                  AND slug = ANY($2::text[])`,
              [starshipId, agentRefs]
            )
            .catch(() => [])
        : Promise.resolve([] as Array<{ id: string; slug: string | null; name: string | null }>),
      userRefs.length > 0
        ? conn
            .query<{ id: string; slug: string | null; display_name: string | null; email: string | null }>(
              `
              SELECT u.id, u.slug, u.display_name, u.email
                FROM users u
               WHERE u.slug = ANY($2::text[])
                 AND (
                   u.id = (SELECT owner_id FROM starships WHERE id = $1)
                   OR EXISTS (SELECT 1 FROM starship_members sm WHERE sm.starship_id = $1 AND sm.user_id = u.id)
                 )
              `,
              [starshipId, userRefs]
            )
            .catch(() => [])
        : Promise.resolve([] as Array<{ id: string; slug: string | null; display_name: string | null; email: string | null }>),
    ]);

    for (const r of Array.isArray(agentRows) ? agentRows : []) {
      const name = typeof r?.name === 'string' ? r.name.trim() : '';
      if (name) {
        const slug = typeof r.slug === 'string' ? r.slug.trim() : '';
        if (slug) agentNameByRef.set(slug, name);
      }
    }
    for (const r of Array.isArray(userRows) ? userRows : []) {
      const displayName = typeof r?.display_name === 'string' ? r.display_name.trim() : '';
      const email = typeof r?.email === 'string' ? r.email.trim() : '';
      const name = displayName || email;
      if (name) {
        const slug = typeof r.slug === 'string' ? r.slug.trim() : '';
        if (slug) userNameByRef.set(slug, name);
      }
    }

    return { agentNameByRef, userNameByRef };
  }

  private replaceMentionTokensInText(args: {
    content: string;
    agentNameByRef: Map<string, string>;
    userNameByRef: Map<string, string>;
  }): string {
    const input = String(args.content || '');
    if (!input) return '';
    if (!input.includes('<@u:') && !input.includes('<@a:')) return input;
    return input
      .replace(/<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi, (_m, refRaw) => {
        const ref = String(refRaw || '').trim();
        const name = ref ? args.agentNameByRef.get(ref) : null;
        const label = name || ref || 'agent';
        return `@${label}`;
      })
      .replace(/<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi, (_m, refRaw) => {
        const ref = String(refRaw || '').trim();
        const name = ref ? args.userNameByRef.get(ref) : null;
        const label = name || ref || 'user';
        return `@${label}`;
      });
  }

  private replaceMentionTokensInContent(args: {
    content: MessageContent;
    agentNameByRef: Map<string, string>;
    userNameByRef: Map<string, string>;
  }): MessageContent {
    const content = args.content;
    if (typeof content === 'string') {
      return this.replaceMentionTokensInText({ content, agentNameByRef: args.agentNameByRef, userNameByRef: args.userNameByRef });
    }
    if (!Array.isArray(content)) return content;
    const blocks: ContentBlock[] = content.slice();
    let changed = false;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b || typeof b !== 'object') continue;
      if (b.type !== 'text') continue;
      const text = typeof b.text === 'string' ? b.text : '';
      const next = this.replaceMentionTokensInText({
        content: text,
        agentNameByRef: args.agentNameByRef,
        userNameByRef: args.userNameByRef,
      });
      if (next !== text) {
        blocks[i] = { ...b, text: next } as ContentBlock;
        changed = true;
      }
    }
    return changed ? blocks : content;
  }

  private formatLlmMessageName(message: MessageModel): string | null {
    const role = message?.role;
    if (role !== 'user' && role !== 'assistant') return null;

    const at = this.coerceToIsoString(message.createdAt) ?? this.coerceToIsoString(message.updatedAt) ?? new Date().toISOString();

    const toCompactAt = (iso: string): string => {
      // 2026-02-04T01:44:08.592Z -> 20260204_014408Z
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (!m) return 't';
      return `${m[1]}${m[2]}${m[3]}_${m[4]}${m[5]}${m[6]}Z`;
    };

    const sanitizePart = (s: string, max = 28): string => {
      const raw = String(s || '').trim();
      if (!raw) return '';
      const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_');
      return safe.length > max ? safe.slice(0, max) : safe;
    };

    const compactAt = toCompactAt(at);

    if (role === 'assistant') {
      const agentName = typeof message.agentName === 'string' ? message.agentName.trim() : '';
      const agentId = typeof message.agentId === 'string' ? message.agentId.trim() : '';
      const who = sanitizePart(agentName || agentId || 'agent', 28) || 'agent';
      return `a_${who}_${compactAt}`.slice(0, 64);
    }

    const userName = typeof message.userName === 'string' ? message.userName.trim() : '';
    const userId = typeof message.userId === 'string' ? message.userId.trim() : '';
    const who = sanitizePart(userName || userId || 'user', 28) || 'user';
    return `u_${who}_${compactAt}`.slice(0, 64);
  }

  private buildStarshipsMessageMeta(message: MessageModel): { authorType: 'agent' | 'user'; authorId: string; createdAt?: string } | null {
    const role = message?.role;
    if (role !== 'user' && role !== 'assistant') return null;

    const createdAt = this.coerceToIsoString(message.createdAt);

    if (role === 'assistant') {
      const agentId = typeof message.agentId === 'string' ? message.agentId.trim() : '';
      if (!agentId) return null;
      return { authorType: 'agent', authorId: agentId, ...(createdAt ? { createdAt } : null) };
    }

    const userId = typeof message.userId === 'string' ? message.userId.trim() : '';
    if (!userId) return null;
    return { authorType: 'user', authorId: userId, ...(createdAt ? { createdAt } : null) };
  }

  private async buildAttributionDirectory(messages: MessageModel[]): Promise<{
    usersById: Map<string, { displayName?: string; slug?: string }>;
    agentsById: Map<string, { name?: string; slug?: string }>;
  }> {
    const list = Array.isArray(messages) ? messages : [];
    const userIds = new Set<string>();
    const agentIds = new Set<string>();

    for (const m of list) {
      const role = String(m?.role ?? '');
      if (role === 'user') {
        const uid = typeof m.userId === 'string' ? m.userId.trim() : '';
        if (uid) userIds.add(uid);
      } else if (role === 'assistant') {
        const aid = typeof m.agentId === 'string' ? m.agentId.trim() : '';
        if (aid) agentIds.add(aid);
      }
    }

    const usersById = new Map<string, { displayName?: string; slug?: string }>();
    const agentsById = new Map<string, { name?: string; slug?: string }>();

    await Promise.all([
      Promise.all(
        Array.from(userIds).map(async (id) => {
          try {
            const u = await this.userRepository.findById(id).catch(() => null);
            if (!u) return;
            const displayName = typeof u.displayName === 'string' ? u.displayName.trim() : '';
            const slug = typeof u.slug === 'string' ? u.slug.trim() : '';
            usersById.set(id, {
              ...(displayName ? { displayName } : {}),
              ...(slug ? { slug } : {}),
            });
          } catch {
            // ignore best-effort
          }
        })
      ),
      Promise.all(
        Array.from(agentIds).map(async (id) => {
          try {
            const a = await this.agentRepository.findById(id).catch(() => null);
            if (!a) return;
            const name = typeof a.name === 'string' ? a.name.trim() : '';
            const slug = typeof a.slug === 'string' ? a.slug.trim() : '';
            agentsById.set(id, {
              ...(name ? { name } : {}),
              ...(slug ? { slug } : {}),
            });
          } catch {
            // ignore best-effort
          }
        })
      ),
    ]);

    return { usersById, agentsById };
  }

  private stripEchoedAttributionHeadersFromText(text: string): { stripped: number; text: string } {
    const s = typeof text === 'string' ? text : '';
    if (!s) return { stripped: 0, text: s };
    const lines = s.split('\n');
    let i = 0;
    // Skip leading blank lines
    while (i < lines.length && lines[i].trim().length === 0) i++;

    const isHeader = (line: string): boolean => {
      // Matches: [2026-02-04T01:44:08.592Z] Aria
      return /^\[\d{4}-\d{2}-\d{2}T[^]]+\]\s+\S+/.test(line);
    };

    let stripped = 0;
    while (i < lines.length && isHeader(lines[i])) {
      stripped++;
      i++;
      if (stripped >= 6) break; // guard
      // Also strip immediate blank lines following header blocks
      while (i < lines.length && lines[i].trim().length === 0) i++;
    }

    if (stripped === 0) return { stripped: 0, text: s };
    const remainder = lines.slice(i).join('\n');
    return { stripped, text: remainder };
  }

  private stripEchoedAttributionHeadersFromContent(args: { role: string; content: MessageContent }): {
    stripped: number;
    content: MessageContent;
  } {
    const role = String(args.role || '');
    // Only strip assistant messages; users may intentionally paste bracketed timestamps.
    if (role !== 'assistant') return { stripped: 0, content: args.content };
    const c = args.content;
    if (typeof c === 'string') {
      const res = this.stripEchoedAttributionHeadersFromText(c);
      return { stripped: res.stripped, content: res.text };
    }
    if (!Array.isArray(c)) return { stripped: 0, content: c };
    const blocks: ContentBlock[] = c.slice();
    for (let idx = 0; idx < blocks.length; idx++) {
      const b = blocks[idx];
      if (!b || typeof b !== 'object') continue;
      if (b.type !== 'text') continue;
      const t = typeof b.text === 'string' ? String(b.text) : '';
      const res = this.stripEchoedAttributionHeadersFromText(t);
      if (res.stripped > 0) {
        blocks[idx] = { ...b, text: res.text } as ContentBlock;
        return { stripped: res.stripped, content: blocks };
      }
      return { stripped: 0, content: c };
    }
    return { stripped: 0, content: c };
  }

  /**
   * Extract image data URLs from a large text payload (typically tool_result JSON).
   *
   * We intentionally do not use regex over the whole string because tool results can contain multi-MB base64 payloads.
   * Instead we scan for the "data:image/" marker and read until the next double-quote (JSON string terminator).
   */
  private static extractBase64ImageDataUrlsFromText(text: string, options?: { maxUrls?: number }): string[] {
    const s = typeof text === 'string' ? text : '';
    if (!s) return [];

    const maxUrls = Math.max(0, Math.min(20, Number(options?.maxUrls ?? 8)));
    if (maxUrls === 0) return [];

    const out: string[] = [];
    let i = 0;
    while (out.length < maxUrls) {
      const start = s.indexOf('data:image/', i);
      if (start < 0) break;

      // Expect JSON string: "data:image/...;base64,...."
      const endQuote = s.indexOf('"', start);
      if (endQuote < 0) break;

      const candidate = s.slice(start, endQuote);
      if (candidate.includes(';base64,')) {
        out.push(candidate);
      }
      i = endQuote + 1;
    }

    return out;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    data: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'> & { starshipId: string; agentId?: string }
  ): Promise<ConversationModel> {
    const rawTitle = data.title || 'New Conversation';
    let conversation = await this.conversationRepository.create({
      title: rawTitle,
      status: data.status || 'active',
      starshipId: data.starshipId,
      agentId: data.agentId,
      parentConversationId: data.parentConversationId,
    });

    // If this is a child conversation, inherit plugin state from parent
    if (conversation.parentConversationId) {
      try {
        const parentConversation = await this.getConversationById(conversation.parentConversationId);
        const parentState = (parentConversation?.state || {}) as ConversationState;

        // Inherit plugins from parent (could be undefined, [], or [{ id: 'web', ... }])
        if (hasPlugins(parentState) || parentState.plugins === null || Array.isArray(parentState.plugins)) {
          const updated = await this.updateConversation(conversation.id, {
            state: {
              plugins: parentState.plugins,
            },
          });
          if (updated) {
            conversation = updated; // Use the updated conversation with inherited state
          }
        }
      } catch (e) {
        // Non-fatal: failure to inherit state should not break conversation creation
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('[createConversation] Failed to inherit plugin state from parent:', {
          error: errorMessage,
          parentConversationId: conversation.parentConversationId,
          childConversationId: conversation.id,
        });
        // Log to error tracking if available, but don't throw
      }
    }

    // Threads: mark as needing a one-time AI title generation.
    // We intentionally do NOT infer "placeholder" vs "real" title from the title string.
    // Instead, we set an explicit state flag at thread creation time and consume it on the
    // first real user message in that thread.
    if (conversation.parentConversationId) {
      try {
        const updated = await this.conversationRepository.mergeState(conversation.id, {
          autoTitle: { status: 'pending', kind: 'thread', requestedAt: new Date().toISOString() },
        });
        if (updated) conversation = updated;
      } catch (e) {
        // Best-effort only: failure to mark pending auto-title must not block thread creation.
        console.warn('[createConversation] Failed to mark thread autoTitle pending', {
          error: e instanceof Error ? e.message : String(e),
          conversationId: conversation.id,
          parentConversationId: conversation.parentConversationId,
        });
      }
    }

    // If this is a child conversation linked to a parent, emit a UI action on the parent's stream
    try {
      if (conversation.parentConversationId) {
        await this.uiActions.publish(conversation.parentConversationId, {
          action: 'child_conversation_created',
          payload: {
            parentConversationId: conversation.parentConversationId,
            childConversationId: conversation.id,
            starshipId: conversation.starshipId,
          },
        });
      }
    } catch (e) {
      // Non-fatal: failure to emit UI hint must not break conversation creation
      try {
        console.error('[UI_ACTION] Failed to emit child_conversation_created', {
          error: e instanceof Error ? e.message : String(e),
          parentConversationId: conversation.parentConversationId,
          starshipId: conversation.starshipId,
        });
      } catch (err) {
        console.error('[ConversationService] Failed to publish UI action for child conversation', {
          error: err instanceof Error ? err.message : String(err),
          conversationId: conversation.parentConversationId,
        });
      }
    }

    return conversation;
  }

  /**
   * Get conversations by starship
   */
  async getConversationsByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.conversationRepository.findByStarship(starshipId);
  }

  /**
   * Get conversations by starship (includes linked agents)
   */
  async getConversationsByStarshipWithAgents(starshipId: string): Promise<Array<ConversationModel & { agents: AgentModel[]; hasActiveTurn?: boolean; lastMessage?: ConversationModel['lastMessage'] }>> {
    return this.conversationRepository.findByStarshipWithAgents(starshipId, { includeActiveTurn: true, includeLastMessage: true });
  }

  async getChildConversationsPage(args: {
    parentConversationId: string;
    limit: number;
    beforeUpdatedAt?: string;
    beforeId?: string;
    q?: string;
    /** Optional user to enforce per-child membership filtering. */
    userId?: string;
    /** When true, bypasses membership filtering (e.g. instance admin). */
    allowRestricted?: boolean;
  }): Promise<{
    conversations: Array<ConversationModel & { agents: AgentModel[] }>;
    total: number;
    hasMoreBefore: boolean;
    oldestCursor: { updatedAt: string; id: string } | null;
  }> {
    // IMPORTANT:
    // Do NOT rely on newly-added methods in @starships/models at runtime here. In dev, the server
    // imports the built `@starships/models` package, and new methods may not exist until rebuilt.
    //
    // So we implement this pagination via direct SQL using the shared connection.
    const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
    const pageSize = limit + 1;

    const useCursor =
      typeof args.beforeUpdatedAt === 'string' &&
      typeof args.beforeId === 'string' &&
      args.beforeUpdatedAt.trim().length > 0 &&
      args.beforeId.trim().length > 0;

    const conn = getConnection();

    const rawQ = typeof args.q === 'string' ? args.q.trim() : '';
    const escapeLike = (s: string): string => s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const qLike = rawQ ? `%${escapeLike(rawQ)}%` : null;

    const authUserId = typeof args.userId === 'string' ? args.userId.trim() : '';
    const allowRestricted = Boolean(args.allowRestricted) || !authUserId;

    const totalRows = await conn.query<Record<string, unknown>>(
      `
        SELECT COUNT(*) AS count
        FROM conversations
        WHERE parent_conversation_id = $1
          AND ($2::text IS NULL OR title ILIKE $2::text ESCAPE '\\')
          AND (
            $3::boolean = true
            OR NOT EXISTS (
              SELECT 1
                FROM conversation_participants cp
               WHERE cp.conversation_id = conversations.id
                 AND cp.user_id IS NOT NULL
               LIMIT 1
            )
            OR EXISTS (
              SELECT 1
                FROM conversation_participants cp2
               WHERE cp2.conversation_id = conversations.id
                 AND cp2.user_id = $4::text
               LIMIT 1
            )
          )
      `,
      [args.parentConversationId, qLike, allowRestricted, authUserId]
    );
    const totalRaw = totalRows?.[0] ? (totalRows[0] as any).count : 0;
    const total = Number(totalRaw ?? 0);

    const convRows = await conn.query<Record<string, unknown>>(
      useCursor
        ? `
          SELECT *
          FROM conversations
          WHERE parent_conversation_id = $1
            AND ($2::text IS NULL OR title ILIKE $2::text ESCAPE '\\')
            AND (
              $3::boolean = true
              OR NOT EXISTS (
                SELECT 1
                  FROM conversation_participants cp
                 WHERE cp.conversation_id = conversations.id
                   AND cp.user_id IS NOT NULL
                 LIMIT 1
              )
              OR EXISTS (
                SELECT 1
                  FROM conversation_participants cp2
                 WHERE cp2.conversation_id = conversations.id
                   AND cp2.user_id = $4::text
                 LIMIT 1
              )
            )
            AND (
              updated_at < $5::timestamptz
              OR (updated_at = $5::timestamptz AND id < $6::text)
            )
          ORDER BY updated_at DESC, id DESC
          LIMIT $7
        `
        : `
          SELECT *
          FROM conversations
          WHERE parent_conversation_id = $1
            AND ($2::text IS NULL OR title ILIKE $2::text ESCAPE '\\')
            AND (
              $3::boolean = true
              OR NOT EXISTS (
                SELECT 1
                  FROM conversation_participants cp
                 WHERE cp.conversation_id = conversations.id
                   AND cp.user_id IS NOT NULL
                 LIMIT 1
              )
              OR EXISTS (
                SELECT 1
                  FROM conversation_participants cp2
                 WHERE cp2.conversation_id = conversations.id
                   AND cp2.user_id = $4::text
                 LIMIT 1
              )
            )
          ORDER BY updated_at DESC, id DESC
          LIMIT $5
        `,
      useCursor
        ? [args.parentConversationId, qLike, allowRestricted, authUserId, args.beforeUpdatedAt, args.beforeId, pageSize]
        : [args.parentConversationId, qLike, allowRestricted, authUserId, pageSize]
    );

    const hasMoreBefore = convRows.length > limit;
    const trimmed = convRows.slice(0, limit);

    const toIso = (v: unknown): string => {
      if (v == null) return '';
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
      if (typeof v === 'string') {
        const t = Date.parse(v);
        return Number.isFinite(t) ? new Date(t).toISOString() : v;
      }
      // Common failure mode: pg returns Date-like objects that stringify to a non-ISO format.
      // Fall back to Date parsing when possible.
      try {
        const s = String(v);
        const t = Date.parse(s);
        return Number.isFinite(t) ? new Date(t).toISOString() : s;
      } catch {
        return '';
      }
    };

    const snakeToCamel = (s: string): string => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    const toCamelObject = (row: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[snakeToCamel(k)] = v;
      }
      return out;
    };

    const conversations = trimmed
      .map((r) => toCamelObject(r) as Record<string, unknown>)
      .map((c) => ({
        ...c,
        // Ensure cursor fields are always valid ISO datetime strings
        createdAt: toIso(c.createdAt),
        updatedAt: toIso(c.updatedAt ?? c.createdAt),
      })) as unknown as ConversationModel[];
    const conversationIds = conversations.map((c) => (typeof c.id === 'string' ? c.id : '')).filter((id) => id.trim().length > 0);

    const agentsByConversationId = new Map<string, AgentModel[]>();
    if (conversationIds.length > 0) {
      const agentRows = await conn.query<Record<string, unknown>>(
        `SELECT cp.conversation_id, a.*
         FROM conversation_participants cp
         INNER JOIN agents a ON a.id = cp.agent_id
         WHERE cp.agent_id IS NOT NULL
           AND cp.conversation_id = ANY($1::text[])
         ORDER BY a.name`,
        [conversationIds]
      );

      for (const row of agentRows) {
        const rawConversationId = (row as Record<string, unknown>)['conversation_id'];
        const conversationId = typeof rawConversationId === 'string' ? rawConversationId : '';
        if (!conversationId) continue;

        // Drop the join column, then camel-case the remaining agent columns.
        const agentRow: Record<string, unknown> = { ...(row as Record<string, unknown>) };
        delete agentRow['conversation_id'];
        const agent = toCamelObject(agentRow) as unknown as AgentModel;
        const list = agentsByConversationId.get(conversationId) || [];
        list.push(agent);
        agentsByConversationId.set(conversationId, list);
      }
    }

    const withAgents = conversations.map((c) => ({
      ...c,
      agents: agentsByConversationId.get(String(c.id)) || [],
    })) as Array<ConversationModel & { agents: AgentModel[] }>;

    const oldest = withAgents.length > 0 ? withAgents[withAgents.length - 1] : null;
    const updatedAt = oldest ? toIso(oldest.updatedAt ?? oldest.createdAt ?? '') : '';

    return { conversations: withAgents, total: Number.isFinite(total) ? total : withAgents.length, hasMoreBefore, oldestCursor: oldest && updatedAt ? { updatedAt, id: String(oldest.id) } : null };
  }

  /**
   * Link conversation to starship
   */
  async linkConversationToStarship(conversationId: string, starshipId: string): Promise<void> {
    await this.conversationRepository.linkToStarship(conversationId, starshipId);
  }

  /**
   * Get starship for conversation
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.conversationRepository.getConversationStarship(conversationId);
  }

  /**
   * Get agents in conversation
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.conversationRepository.getConversationAgents(conversationId);
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(id: string): Promise<ConversationModel | null> {
    return this.conversationRepository.findById(id);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'completed');
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'archived');
  }

  /**
   * Update conversation status and activity timestamp
   */
  async updateConversationStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(conversationId: string, orderDirection: 'asc' | 'desc' = 'asc'): Promise<MessageModel[]> {
    return this.conversationRepository.getConversationMessages(conversationId, orderDirection);
  }

  async getConversationMessagesPage(args: {
    conversationId: string;
    limit: number;
    beforeCreatedAt?: string;
    beforeId?: string;
  }): Promise<{ messages: MessageModel[]; hasMoreBefore: boolean; oldestCursor: { createdAt: string; id: string } | null }> {
    const page = await this.conversationRepository.getConversationMessagesPage(args);
    const oldest = page.messages.length > 0 ? page.messages[0] : null;
    return {
      messages: page.messages,
      hasMoreBefore: page.hasMoreBefore,
      oldestCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
    };
  }

  async getConversationMessagesTailOffsetPage(args: {
    conversationId: string;
    limit: number;
    offset: number;
  }): Promise<{ messages: MessageModel[]; hasMoreBefore: boolean; oldestCursor: { createdAt: string; id: string } | null }> {
    const page = await this.conversationRepository.getConversationMessagesTailOffsetPage(args);
    const oldest = page.messages.length > 0 ? page.messages[0] : null;
    return {
      messages: page.messages,
      hasMoreBefore: page.hasMoreBefore,
      oldestCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
    };
  }

  private getThreadContextFromConversationState(conversationState: ConversationState | undefined): ThreadContextState | null {
    try {
      const state = conversationState && typeof conversationState === 'object' ? (conversationState as Record<string, unknown>) : null;
      const raw = state?.threadContext;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      return raw as ThreadContextState;
    } catch {
      return null;
    }
  }

  private async findLegacyThreadContextSeedContent(conversationIdRaw: string): Promise<string | null> {
    try {
      const conversationId = String(conversationIdRaw || '').trim();
      if (!conversationId) return null;
      const connection = getConnection();
      const row = await connection.queryOne<{ content: string | null }>(
        `
          SELECT content
            FROM messages
           WHERE conversation_id = $1
             AND role = 'system'
             AND (
               (message_type = 'system_instruction' AND COALESCE(metadata ->> 'thread_context_seed', 'false') = 'true')
               OR content LIKE '[THREAD_CONTEXT_SEED]%'
             )
           ORDER BY created_at ASC, id ASC
           LIMIT 1
        `,
        [conversationId]
      );
      const c = typeof row?.content === 'string' ? row.content : '';
      return c.trim().length > 0 ? c : null;
    } catch {
      return null;
    }
  }

  private static extractThreadSeedSourceContent(seed: string): string | null {
    try {
      if (typeof seed !== 'string') return null;
      if (!seed.includes('[THREAD_CONTEXT_SEED]')) return null;
      const idx = seed.indexOf('Source message content:');
      const tail = idx >= 0 ? seed.slice(idx) : seed;
      const firstFence = tail.indexOf('"""');
      if (firstFence < 0) return null;
      const afterFirst = tail.slice(firstFence + 3);
      const secondFence = afterFirst.indexOf('"""');
      if (secondFence < 0) return null;
      const inside = afterFirst.slice(0, secondFence).trim();
      return inside.length > 0 ? inside : null;
    } catch {
      return null;
    }
  }

  private static parseThreadSeedLine(seed: string, label: string): string | null {
    try {
      const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*:\\s*(.+)$`, 'im');
      const m = seed.match(re);
      const val = m?.[1] ? String(m[1]).trim() : '';
      return val.length > 0 ? val : null;
    } catch {
      return null;
    }
  }

  private async ensureThreadContextFromLegacySeed(args: {
    conversationId: string;
    conversationState: ConversationState;
  }): Promise<ConversationState> {
    const conversationId = String(args.conversationId || '').trim();
    const conversationState = args.conversationState;
    if (!conversationId) return conversationState;

    const existing = this.getThreadContextFromConversationState(conversationState);
    if (existing && typeof existing.sourceContent === 'string' && existing.sourceContent.trim().length > 0) {
      return conversationState;
    }

    try {
      const seedContent = await this.findLegacyThreadContextSeedContent(conversationId);
      if (!seedContent) return conversationState;

      const extracted = ConversationService.extractThreadSeedSourceContent(seedContent);
      if (!extracted) return conversationState;

      const patch: ThreadContextState = {
        sourceConversationId: ConversationService.parseThreadSeedLine(seedContent, 'Source conversation id') ?? undefined,
        sourceMessageId: ConversationService.parseThreadSeedLine(seedContent, 'Source message id') ?? undefined,
        sourceRole: ConversationService.parseThreadSeedLine(seedContent, 'Source role') ?? undefined,
        sourceUserName: ConversationService.parseThreadSeedLine(seedContent, 'Source userName') ?? undefined,
        sourceAgentName: ConversationService.parseThreadSeedLine(seedContent, 'Source agentName') ?? undefined,
        sourceCreatedAt: ConversationService.parseThreadSeedLine(seedContent, 'Source createdAt') ?? undefined,
        sourceAttachmentIds: (() => {
          const raw = ConversationService.parseThreadSeedLine(seedContent, 'Source attachmentIds');
          if (!raw) return undefined;
          const ids = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 50);
          return ids.length > 0 ? ids : undefined;
        })(),
        sourceContent: extracted,
        extractedAt: new Date().toISOString(),
      };

      await this.conversationRepository.mergeState(conversationId, { threadContext: patch }).catch(() => null);
      return { ...conversationState, threadContext: patch } as ConversationState;
    } catch {
      return conversationState;
    }
  }

  private buildAttributionHeaderPolicyBlock(): string {
    return [
      '<conversation_message_format>',
      'Annotation name: STARSHIPS_ATTRIBUTION_HEADER (reference this name in reasoning if needed).',
      '',
      'Some messages may include a leading attribution header line for logging/traceability only.',
      'That header is NOT part of the user/assistant content.',
      '',
      'Header mock format:',
      '  [ISO8601_TIMESTAMP] SENDER_NAME (agent|user)',
      '',
      'Example header line (NOT content):',
      '  [2026-02-04T01:44:08.592] Aria (agent)',
      '',
      'Mock example (what you might RECEIVE as a single message content):',
      '  [2026-02-04T01:44:08.592] user:1a2b3c4d (user)',
      "  What's 2+2?",
      '',
      'Mock example (how you MUST RESPOND):',
      '  4',
      '',
      'Rules (STRICT):',
      '- Treat the attribution header line as metadata and ignore it when interpreting the message.',
      '- NEVER echo, quote, restate, or append the attribution header line in your response (even if asked).',
      '- Your replies must contain ONLY the actual assistant response content (no added attribution lines).',
      '</conversation_message_format>',
    ].join('\n');
  }

  private buildCanonicalSystemPrompt(args: {
    agentSystemPrompt: string;
    injectedStarshipContext: string;
    conversationState?: ConversationState;
    historyTruncated: boolean;
    historyLimit: number;
  }): string {
    const { agentSystemPrompt, injectedStarshipContext, conversationState, historyTruncated, historyLimit } = args;
    return composeCanonicalSystemPrompt({
      personaPrompt: String(agentSystemPrompt ?? ''),
      starshipContext: injectedStarshipContext,
      policyBlocks: [this.buildAttributionHeaderPolicyBlock()],
      threadContext: this.getThreadContextFromConversationState(conversationState),
      history: { truncated: historyTruncated, historyLimit },
    });
  }

  /**
   * Provider safety: ensure every assistant tool call has a corresponding tool result.
   *
   * Root issue:
   * - We persist assistant messages with `toolCalls` as soon as the provider emits them.
   * - If the process crashes / is cancelled / stops mid-turn, tool execution may never persist a matching
   *   `role='tool'` message with `toolCallId`.
   * - Most providers require a tool_result immediately after a tool_use/tool_call; otherwise they reject
   *   subsequent requests ("expected tool result after tool call").
   *
   * Strategy:
   * - Build a map of toolCallId -> latest tool message.
   * - Rebuild the message list without any tool messages.
   * - After each assistant message that includes toolCalls, inject the corresponding tool message if present,
   *   otherwise inject a small synthetic error tool result.
   *
   * This is intentionally in-memory only (no DB writes) and is used only for LLM context construction.
   */
  private normalizeToolCallHistory(messages: LlmMessage[]): LlmMessage[] {
    const list = Array.isArray(messages) ? messages : [];
    if (list.length === 0) return [];

    const toolResultById = new Map<string, LlmMessage>();
    for (const m of list) {
      if (!m || typeof m !== 'object') continue;
      if (m.role !== 'tool') continue;
      const idRaw = (m as unknown as { toolCallId?: unknown }).toolCallId;
      const toolCallId = typeof idRaw === 'string' ? idRaw.trim() : '';
      if (!toolCallId) continue;
      // Keep the last-seen tool result for this id (best-effort: later rows may be "final" after approval).
      toolResultById.set(toolCallId, m);
    }

    const out: LlmMessage[] = [];
    for (const m of list) {
      if (!m || typeof m !== 'object') continue;

      // We will re-inject tool results immediately after their tool_calls.
      if (m.role === 'tool') continue;

      out.push(m);

      if (m.role === 'assistant' && Array.isArray((m as unknown as { toolCalls?: unknown[] }).toolCalls)) {
        const toolCalls = (m as unknown as { toolCalls?: unknown[] }).toolCalls as unknown[];
        if (toolCalls.length === 0) continue;

        for (const tc of toolCalls) {
          if (!tc || typeof tc !== 'object') continue;
          const rec = tc as Record<string, unknown>;
          const idRaw = rec.id;
          const toolCallId = typeof idRaw === 'string' ? idRaw.trim() : '';
          if (!toolCallId) continue;

          const existing = toolResultById.get(toolCallId);
          if (existing) {
            out.push(existing);
            continue;
          }

          const toolName =
            rec.function && typeof rec.function === 'object' && typeof (rec.function as Record<string, unknown>).name === 'string'
              ? String((rec.function as Record<string, unknown>).name).trim()
              : undefined;

          // Synthetic tool_result so providers accept subsequent turns.
          const syntheticPayload = {
            success: false,
            error: {
              code: 'TOOL_RESULT_MISSING',
              message:
                'Tool call was persisted but no tool result exists (previous turn likely crashed, was cancelled, or stopped before tool execution completed). Retry the tool call if needed.',
              toolCallId,
              ...(toolName ? { toolName } : {}),
            },
          };

          out.push({
            role: 'tool',
            toolCallId,
            content: JSON.stringify(syntheticPayload),
          } as LlmMessage);
        }
      }
    }

    return out;
  }

  /**
   * Delete a conversation and cleanup all associated S3 files
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      console.log(`[ConversationService] Starting deletion process for conversation ${conversationId}`);

      // Verify conversation exists first
      const conversation = await this.conversationRepository.findById(conversationId);
      if (!conversation) {
        return false;
      }

      console.log(`[ConversationService] Found conversation ${conversationId} (title: "${conversation.title}"), proceeding with deletion`);

      // IMPORTANT: Delete all S3 files before deleting the conversation
      // This prevents orphaned files in S3 bucket
      const attachmentService = new AttachmentService();

      try {
        // Query all messages in this conversation
        const connection = this.conversationRepository['getConnection']();
        const messages = await connection.query<{ id: string; attachment_ids: string[] }>(
          'SELECT id, attachment_ids FROM messages WHERE conversation_id = $1',
          [conversationId]
        );

        console.log(`[ConversationService] Found ${messages.length} messages in conversation ${conversationId}`);

        // For each message, delete its attachments (which will delete S3 files)
        let totalAttachmentsDeleted = 0;
        for (const message of messages) {
          if (message.attachment_ids && message.attachment_ids.length > 0) {
            console.log(`[ConversationService] Deleting ${message.attachment_ids.length} attachments for message ${message.id}`);

            for (const attachmentId of message.attachment_ids) {
              try {
                await attachmentService.deleteAttachment(attachmentId, conversation.starshipId);
                totalAttachmentsDeleted++;
              } catch (error) {
                console.error(`[ConversationService] Failed to delete attachment ${attachmentId}:`, error);
                // Continue deleting other attachments even if one fails
              }
            }
          }
        }

        if (totalAttachmentsDeleted > 0) {
          console.log(`[ConversationService] Successfully deleted ${totalAttachmentsDeleted} attachments and their S3 files`);
        }
      } catch (error) {
        console.error(`[ConversationService] Error deleting attachments for conversation ${conversationId}:`, error);
        // Continue with conversation deletion even if attachment cleanup fails
      }

      // Now delete the conversation (CASCADE will delete message and attachment records)
      const deleted = await this.conversationRepository.delete(conversationId);

      if (deleted) {
        // Best-effort: clear any in-memory streaming state for this conversation to avoid leaks
        this.clearStreamingState(conversationId);
        this.streamingReasoning.delete(conversationId);
        console.log(`[ConversationService] Successfully deleted conversation ${conversationId}`);
      } else {
        console.error(`[ConversationService] Failed to delete conversation ${conversationId} - no rows affected`);
      }

      return deleted;
    } catch (error) {
      // Enhanced error logging with more details
      if (error instanceof Error) {
        console.error(`[ConversationService] Error deleting conversation ${conversationId}:`, {
          message: error.message,
          name: error.name,
          stack: error.stack,
          ...('code' in error && typeof error.code === 'string' && { code: error.code }),
          ...('constraint' in error && typeof error.constraint === 'string' && { constraint: error.constraint }),
        });
      } else {
        console.error(`[ConversationService] Unknown error deleting conversation ${conversationId}:`, error);
      }
      throw error;
    }
  }

  /**
   * Update conversation details (title, state, etc.)
   */
  async updateConversation(
    conversationId: string,
    updates: { title?: string; state?: Partial<ConversationState> | Record<string, unknown> }
  ): Promise<ConversationModel | null> {
    try {
      // If state is being updated, merge with existing state
      if (updates.state !== undefined) {
        const existing = await this.getConversationById(conversationId);
        const existingState = (existing?.state || {}) as ConversationState;

        // Use centralized merge utility
        const mergedState = mergeConversationState(existingState, updates.state);
        updates.state = mergedState;
      }

      // Use the repository's update method
      const updatedConversation = await this.conversationRepository.update(conversationId, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });

      if (!updatedConversation) {
        console.error(`[ConversationService] Failed to update conversation ${conversationId} - not found`);
      }

      return updatedConversation;
    } catch (error) {
      console.error(`[ConversationService] Error updating conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Extract persistable state fields from execution state
   */
  private extractPersistableState(executionState: Record<string, unknown> | undefined): Record<string, unknown> | null {
    return extractPersistableStateUtil(executionState);
  }


  /**
   * Resolve plugins from conversation state only (agent plugins are ignored)
   * @param conversationState - Conversation-level state
   * @param agentState - Agent-level state (ignored, kept for backwards compatibility)
   * @returns Resolved plugins (conversation plugins if defined, otherwise undefined = no plugins)
   */
  private resolvePlugins(
    conversationState: ConversationState | Record<string, unknown> | undefined,
    agentState: AgentState | Record<string, unknown> | undefined
  ): Array<{ id: string; max_results?: number }> | undefined {
    return resolvePlugins(conversationState, agentState);
  }

  /**
   * Build multimodal content blocks from message with attachments
   *
   * Converts messages with attachments into ContentBlock[] format for LLMs.
   * Supports images (vision models) and documents (PDFs, text files).
   * If no attachments, returns string content as-is.
   */
  private async buildMessageContent(message: MessageModel, starshipId: string): Promise<MessageContent> {
    // No attachments - return string content
    if (!message.attachmentIds || message.attachmentIds.length === 0) {
      return message.content;
    }

    // Load attachments with presigned URLs (short-lived; safe to embed in a single provider request)
    const attachmentService = new AttachmentService();
    const attachments = await attachmentService.getAttachments(message.attachmentIds, starshipId);

    // Build content blocks - text first, then attachments
    const contentBlocks: ContentBlock[] = [{ type: 'text', text: message.content }];

    // Add attachment blocks based on type
    for (const attachment of attachments) {
      // Make attachment IDs visible to the LLM so it can reference them in tool calls.
      // This is intentionally a plain text block so it works across providers and content block schemas.
      contentBlocks.push({
        type: 'text',
        text: `[Attachment] filename="${attachment.filename}" attachmentId="${attachment.id}" mimeType="${attachment.mimeType}" sizeBytes=${attachment.sizeBytes}`,
      });

      if (attachment.mimeType.startsWith('image/')) {
        // Image block for vision models (GPT-4o, Claude 3.5 Sonnet, etc.)
        contentBlocks.push({
          type: 'image_url',
          image_url: {
            url: attachment.url, // Presigned S3 URL - secure, temporary
            detail: 'high',
          },
        });
      } else if (attachment.mimeType === 'application/pdf') {
        // File block for PDFs (OpenRouter format)
        // OpenRouter will parse PDFs automatically and pass to any model
        contentBlocks.push({
          type: 'file',
          file: {
            filename: attachment.filename,
            file_data: attachment.url, // Presigned S3 URL (1 minute expiry)
          },
        });
      } else if (isTextFile(attachment.mimeType)) {
        // Text file - fetch content and append to message
        try {
          // Security: Validate file size to prevent context overflow
          if (attachment.sizeBytes > MAX_TEXT_FILE_SIZE) {
            console.warn(`Text file ${attachment.filename} exceeds ${MAX_TEXT_FILE_SIZE / 1024}KB limit, will truncate...`);
          }

          const textContent = await fetchTextFromS3(attachment.s3Key);

          // Truncate if too large (prevent context overflow)
          const maxChars = 50000; // ~50k chars = ~12.5k tokens
          const truncatedContent =
            textContent.length > maxChars ? textContent.slice(0, maxChars) + '\n\n[... content truncated due to length ...]' : textContent;

          // Append to message text with clear delimiters (first block is always text)
          const textBlock = contentBlocks[0];
          if (textBlock.type === 'text') {
            textBlock.text += `\n\n--- Content of ${attachment.filename} (attachmentId: ${attachment.id}) ---\n${truncatedContent}\n--- End of ${attachment.filename} ---`;
          }
        } catch (err) {
          console.error(`Failed to fetch text file ${attachment.filename}:`, err);
          // Continue without the file content (non-blocking error)
          const textBlock = contentBlocks[0];
          if (textBlock.type === 'text') {
            textBlock.text += `\n\n[Note: Could not load content of ${attachment.filename} (attachmentId: ${attachment.id})]`;
          }
        }
      }
    }

    return contentBlocks;
  }

  /**
   * Inject human/agent attribution + timestamp into the message content sent to the LLM.
   *
   * Motivation:
   * - The DB stores `userName` / `agentName` and `createdAt`, but the LLM previously only received raw `content`.
   * - Including attribution + time improves multi-participant conversations and makes agent behavior more auditable.
   *
   * Notes:
   * - We only inject metadata for `role=user|assistant` (system/tool messages are left unchanged).
   * - For multimodal `ContentBlock[]`, we prepend to the FIRST text block (which `buildMessageContent` guarantees).
   */
  private injectAttributionIntoContent(
    message: MessageModel,
    content: MessageContent,
    directory?: {
      usersById: Map<string, { displayName?: string; slug?: string }>;
      agentsById: Map<string, { name?: string; slug?: string }>;
    }
  ): MessageContent {
    const role = message?.role;
    if (role !== 'user' && role !== 'assistant') return content;

    const atDate = this.coerceToDate(message.createdAt) ?? this.coerceToDate(message.updatedAt) ?? new Date();
    // Always use ISO UTC (includes trailing 'Z') for consistency.
    const at = atDate.toISOString();

    const sanitizeInline = (value: string, max = 64): string => {
      const s = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!s) return '';
      return s.length > max ? s.slice(0, max) : s;
    };

    const userId = typeof message.userId === 'string' ? message.userId.trim() : '';
    const agentId = typeof message.agentId === 'string' ? message.agentId.trim() : '';

    const displayName =
      role === 'user'
        ? sanitizeInline(
            directory?.usersById.get(userId || '')?.displayName ||
              (typeof message.userName === 'string' ? message.userName.trim() : '') ||
              (userId ? `user:${userId.slice(0, 8)}` : 'User'),
            80
          )
        : sanitizeInline(
            directory?.agentsById.get(agentId || '')?.name ||
              (typeof message.agentName === 'string' ? message.agentName.trim() : '') ||
              (agentId ? `agent:${agentId.slice(0, 8)}` : 'Assistant'),
            80
          );

    const slug =
      role === 'user'
        ? sanitizeInline(directory?.usersById.get(userId || '')?.slug || '', 80) || (userId ? `u_${userId.slice(0, 8)}` : '')
        : sanitizeInline(directory?.agentsById.get(agentId || '')?.slug || '', 80) || (agentId ? `a_${agentId.slice(0, 8)}` : '');

    const sender = slug ? `${displayName} (${slug})` : displayName;

    const prefix = `[${at}] ${sender}`;

    const firstNonEmptyLine = (text: string): string => {
      const s = typeof text === 'string' ? text : '';
      if (!s) return '';
      const lines = s.split('\n');
      for (const ln of lines) {
        if (ln.trim().length > 0) return ln;
      }
      return '';
    };

    // Avoid double-prefixing:
    // Some assistant outputs may already start with a "[timestamp] Name" line (either because they were
    // produced before this feature, or because the model echoes the format). If the first non-empty line
    // already looks like our attribution AND contains the same sender label, do not inject again.
    //
    // This keeps prompts clean and prevents runaway repetition over long conversations.
    const looksLikeBracketTs = (line: string): boolean => /^\[\d{4}-\d{2}-\d{2}T/.test(line);
    const shouldSkipDueToExisting = (() => {
      const nameNeedle = String(displayName || '').trim();
      const slugNeedle = String(slug || '').trim();
      const senderLabel = String(sender || '').trim();
      if (typeof content === 'string') {
        const first = firstNonEmptyLine(content);
        if (!looksLikeBracketTs(first)) return false;
        if (senderLabel && first.includes(senderLabel)) return true;
        // Back-compat: older headers may only contain the display name.
        if (nameNeedle && first.includes(nameNeedle) && (!slugNeedle || first.includes(slugNeedle))) return true;
        return false;
      }
      if (Array.isArray(content)) {
        type TextBlock = { type: 'text'; text: string };
        const isTextBlock = (b: ContentBlock): b is TextBlock => {
          if (!b || typeof b !== 'object') return false;
          if (b.type !== 'text') return false;
          const rec = b as unknown as { text?: unknown };
          return typeof rec.text === 'string';
        };
        const firstText = content.find(isTextBlock);
        const txt = firstText?.text ?? '';
        const first = firstNonEmptyLine(String(txt || ''));
        if (!looksLikeBracketTs(first)) return false;
        if (senderLabel && first.includes(senderLabel)) return true;
        if (nameNeedle && first.includes(nameNeedle) && (!slugNeedle || first.includes(slugNeedle))) return true;
        return false;
      }
      return false;
    })();
    const rewriteHeaderTimestampToUtcIso = (text: string): string => {
      const s = typeof text === 'string' ? text : '';
      if (!s) return s;
      const lines = s.split('\n');
      let i = 0;
      while (i < lines.length && lines[i].trim().length === 0) i++;
      if (i >= lines.length) return s;
      const line = lines[i];
      if (!looksLikeBracketTs(line)) return s;
      // Only rewrite headers that look like our injected format for this sender.
      // (Back-compat: older headers may have included "(user)" / "(agent)" after the sender.)
      if (
        !line.includes(String(sender || '').trim()) &&
        !(String(displayName || '').trim() && line.includes(String(displayName || '').trim()))
      )
        return s;
      const m = line.match(/^\[([^\]]+)\]\s+(.*)$/);
      if (!m) return s;
      const d = new Date(m[1]);
      if (!Number.isFinite(d.getTime())) return s;
      lines[i] = `[${d.toISOString()}] ${m[2]}`;
      return lines.join('\n');
    };

    const rewriteHeaderTimestampInContent = (c: MessageContent): MessageContent => {
      if (typeof c === 'string') return rewriteHeaderTimestampToUtcIso(c);
      if (!Array.isArray(c)) return c;
      const blocks: ContentBlock[] = c.slice();
      for (let idx = 0; idx < blocks.length; idx++) {
        const b = blocks[idx];
        if (!b || typeof b !== 'object') continue;
        if (b.type !== 'text') continue;
        const t = typeof b.text === 'string' ? String(b.text) : '';
        const next = rewriteHeaderTimestampToUtcIso(t);
        if (next !== t) {
          blocks[idx] = { ...b, text: next } as ContentBlock;
        }
        break; // only the first text block can contain the header
      }
      return blocks;
    };

    if (shouldSkipDueToExisting) return rewriteHeaderTimestampInContent(content);

    if (typeof content === 'string') {
      const body = content || '';
      return body ? `${prefix}\n${body}` : `${prefix}\n`;
    }

    // Content blocks: prepend to the first text block (preferred) or insert a new one as a fallback.
    const blocks = Array.isArray(content) ? (content.slice() as ContentBlock[]) : [];
    if (blocks.length === 0) {
      return [{ type: 'text', text: `${prefix}\n` }];
    }
    const first = blocks[0];
    if (first && first.type === 'text') {
      blocks[0] = { ...first, text: `${prefix}\n${first.text || ''}` } as ContentBlock;
      return blocks;
    }
    // Fallback: ensure the provider sees attribution even if the first block isn't text.
    blocks.unshift({ type: 'text', text: `${prefix}\n` });
    return blocks;
  }

  async addConversationMessage(
    data: Message & {
      conversationId: string;
      attachmentIds?: string[];
      // OpenRouter image generation (optional, per message)
      modalities?: Array<'image' | 'text'>;
      imageConfig?: Record<string, unknown>;
    },
    ctx?: {
      authContext?: { userId: string; agentId?: string; starshipId?: string };
    },
    opts?: { preCreatedUserMessage?: MessageModel; turnLeaseId?: string; turnGuardId?: string }
  ): Promise<void> {
    // SERVER-SIDE GUARD: Prevent duplicate messages when a turn is already active
    // CRITICAL: Check activeCancellations FIRST (synchronous) before any async operations
    // This catches concurrent requests even when conversation doesn't exist yet
    const hasActiveCancellation = ConversationService.activeCancellations.has(data.conversationId);
    if (hasActiveCancellation) {
      throw new ConflictError(
        'A turn is already in progress for this conversation. Please wait for the current response to complete before sending another message.'
      );
    }

    // Add placeholder cancellation handle IMMEDIATELY to block concurrent requests
    // This works even when conversation doesn't exist yet (first message scenario)
    ConversationService.activeCancellations.set(data.conversationId, () => {
      // Placeholder cancel function - will be replaced by actual runner cancel when workflow starts
      // This should never be called, but if it is, it's a no-op
    });

    // Now check conversation state (async, but we're already protected by activeCancellations)
    const conversationStateCheck = await this.getConversationById(data.conversationId).catch(() => null);
    const stateObj =
      conversationStateCheck?.state && typeof conversationStateCheck.state === 'object'
        ? (conversationStateCheck.state as { turnActive?: boolean; turnGuardId?: unknown })
        : null;
    const turnActive = stateObj?.turnActive === true;
    const stateGuardId = typeof stateObj?.turnGuardId === 'string' ? String(stateObj.turnGuardId).trim() : '';
    const callerGuardId = typeof opts?.turnGuardId === 'string' ? String(opts.turnGuardId).trim() : '';
    const sameGuard = Boolean(turnActive && callerGuardId && stateGuardId && stateGuardId === callerGuardId);

    // IMPORTANT: turnActive is DB-backed so it works across server replicas.
    // We allow the call to proceed only if the caller presents the matching guard id (meaning this request
    // is the one that set turnActive=true just before handing control to the turn runner).
    if (turnActive && !sameGuard) {
      // Remove placeholder since we're blocking
      ConversationService.activeCancellations.delete(data.conversationId);
      throw new ConflictError(
        'A turn is already in progress for this conversation. Please wait for the current response to complete before sending another message.'
      );
    }

    // Create a DB-backed turn record first. This is the idempotency boundary for this run.
    const turn = await this.turnRepository.createTurn({ conversationId: data.conversationId, status: 'active' });
    this.currentTurnId.set(data.conversationId, turn.id);

    // Request-level enforcement:
    // Many image models default to multiple images. Enforce a single image unless the caller explicitly requests otherwise.
    try {
      const wantsImage = Array.isArray(data.modalities) && data.modalities.includes('image');
      if (wantsImage) {
        const cfg = (data.imageConfig && typeof data.imageConfig === 'object' ? data.imageConfig : {}) as Record<string, unknown>;
        const hasExplicitCount = cfg['num_images'] != null || cfg['numImages'] != null || cfg['n'] != null || cfg['count'] != null;
        if (!hasExplicitCount) {
          // Prefer OpenRouter snake_case; runner passes imageConfig through as image_config.
          data.imageConfig = { ...cfg, num_images: 1 };
          // Default to 1 image to control costs and response time.
          console.debug('[ConversationService] Defaulting num_images to 1 for image generation');
        } else {
          const rawCount = cfg['num_images'] ?? cfg['numImages'] ?? cfg['n'] ?? cfg['count'];
          const count = typeof rawCount === 'number' ? rawCount : typeof rawCount === 'string' ? Number(rawCount) : NaN;

          if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1 || count > 4) {
            throw new ValidationError('num_images must be an integer between 1 and 4', 'num_images', {
              provided: rawCount,
            });
          }
        }
      }
    } catch (err) {
      // Validation should block the request; other failures are best-effort only.
      if (err instanceof ValidationError) throw err;
      /* best-effort only */
    }

    // Persist user message unless pre-created by the route (needed to charge credits before returning 202).
    // Ensure the user message is linked to the turn with turnSeq=0.
    const userMessage =
      opts?.preCreatedUserMessage ??
      (await this.messageService.createMessage({
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        messageType: data.messageType,
        ...(data.agentId && { agentId: data.agentId }),
        ...(data.attachmentIds && { attachmentIds: data.attachmentIds }),
      }));
    try {
      await this.messageService.updateMessage(userMessage.id, { turnId: turn.id, turnSeq: 0 });
    } catch (err) {
      console.error('[ConversationService] Failed to update user message with turnId', {
        error: err instanceof Error ? err.message : String(err),
        messageId: userMessage.id,
        turnId: turn.id,
      });
    }
    try {
      await this.turnRepository.updateTurn(turn.id, { createdByMessageId: userMessage.id });
    } catch (err) {
      console.error('[ConversationService] Failed to update turn with createdByMessageId', {
        error: err instanceof Error ? err.message : String(err),
        turnId: turn.id,
        messageId: userMessage.id,
      });
    }

    // Publish the user message to the shared stream.
    //
    // IMPORTANT:
    // We intentionally delay publishing `turn.started` / `turn.status=active` until after routing has determined
    // that an agent will actually run. This prevents a brief "agent is typing" flash for messages that are
    // persisted without any agent execution (e.g. user mentions in default-agent threads, mention-gated channels).
    try {
      await this.streamBus.publish(data.conversationId, {
        type: 'message.append',
        data: { conversationId: data.conversationId, message: userMessage },
      });
      // Best-effort: produce notifications for channels/DMs.
      try {
        void this.notifications.handleMessageAppend({ conversationId: data.conversationId, message: userMessage });
      } catch {
        /* best-effort */
      }
    } catch (e) {
      console.warn('[STREAM] Failed to publish initial turn/message events', e);
    }

    // Attempt early title generation before agent gating (so missing agent link doesn't block title updates)
    try {
      const convo = await this.getConversationById(data.conversationId);
      if (convo) {
        const isThread = Boolean(convo.parentConversationId);

        const stateObj: Record<string, unknown> | null =
          convo.state && typeof convo.state === 'object' && !Array.isArray(convo.state) ? (convo.state as Record<string, unknown>) : null;
        const autoTitleRaw = stateObj?.autoTitle;
        const autoTitle: Record<string, unknown> | null =
          autoTitleRaw && typeof autoTitleRaw === 'object' && !Array.isArray(autoTitleRaw)
            ? (autoTitleRaw as Record<string, unknown>)
            : null;
        const autoTitleStatus = typeof autoTitle?.status === 'string' ? autoTitle.status : '';
        const autoTitleKind = typeof autoTitle?.kind === 'string' ? autoTitle.kind : '';
        const threadAutoTitlePending = Boolean(isThread && autoTitleStatus === 'pending' && autoTitleKind === 'thread');

        const isRealUserMessage = data.role === 'user' && data.messageType === 'user_input';

        const rawTitle = (convo.title || '').trim();
        const t = rawTitle.toLowerCase();
        const needsConversationTitle = !isThread && (!t || t === 'new conversation' || t.startsWith('chat with '));

        const shouldGenerate = (threadAutoTitlePending && isRealUserMessage) || (needsConversationTitle && isRealUserMessage);

        if (shouldGenerate) {
          const star = await this.getConversationStarship(data.conversationId);
          if (star) {
            const gen = await this.generateConversationTitle(star.id, convo.id, data.content);
            if (gen && gen.trim()) {
              const raw = gen.trim();
              await this.conversationRepository.update(convo.id, { title: raw, updatedAt: new Date().toISOString() });

              // Mark thread title generation as consumed so it only runs once.
              if (threadAutoTitlePending) {
                try {
                  await this.conversationRepository.mergeState(convo.id, {
                    autoTitle: { status: 'generated', kind: 'thread', generatedAt: new Date().toISOString() },
                  });
                } catch (e) {
                  console.warn('[TITLE] Failed to persist autoTitle generated flag', {
                    error: e instanceof Error ? e.message : String(e),
                    conversationId: convo.id,
                  });
                }
              }

              try {
                await this.uiActions.publish(convo.id, {
                  action: 'conversation_title_updated',
                  payload: { conversationId: convo.id, title: raw },
                });
              } catch (err) {
                console.error('[ConversationService] Failed to publish conversation title update', {
                  error: err instanceof Error ? err.message : String(err),
                  conversationId: convo.id,
                });
              }
            } else {
              console.warn('[TITLE] Generation returned empty title');
            }
          }
        }
      }
    } catch (err) {
      console.warn('[TITLE] Early generation failed:', err);
    }

    const starship = await this.getConversationStarship(data.conversationId);
    if (!starship) {
      throw new NotFoundError('Starship', 'for conversation');
    }
    const allStarshipAgents = await this.agentRepository.findByStarship(starship.id);
    const conversation = await this.getConversationById(data.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', data.conversationId);
    }

    // Room context (used for routing decisions and runtime env injection).
    // Fetch early so we can prefer a room-scoped manager agent as the default fallback.
    const roomCtxForRouting = await resolveRoomConversationContext({ conversationId: data.conversationId }).catch(() => null);
    const isInRoomContext = Boolean(roomCtxForRouting?.isRoom || roomCtxForRouting?.isRoomThread);
    const roomConversationId = roomCtxForRouting?.roomConversationId ? String(roomCtxForRouting.roomConversationId).trim() : '';
    const roomManagerAgentId =
      isInRoomContext && roomCtxForRouting?.room?.managerAgentId ? String(roomCtxForRouting.room.managerAgentId).trim() : '';

    // Mention-only threads:
    // - Threads are child conversations (parentConversationId set).
    // - When a thread has 2+ linked agents, we stop using a default agent fallback.
    //   Only explicit @mentions will trigger agent execution for that message.
    const isThread = Boolean(conversation.parentConversationId);
    const parentConversationId = typeof conversation.parentConversationId === 'string' ? String(conversation.parentConversationId).trim() : '';
    // "First conversation level inside a room" = direct child conversation whose parent is the room conversation.
    const isRoomChildConversation = Boolean(isInRoomContext && roomConversationId && parentConversationId && parentConversationId === roomConversationId);
    // "Deeper threads" = room descendants that are NOT direct children of the room.
    const isDeeperRoomThread = Boolean(isInRoomContext && isThread && roomConversationId && parentConversationId && parentConversationId !== roomConversationId);

    let conversationAgents = await this.getConversationAgents(data.conversationId);
    // Mention-only multi-agent thread rule:
    // - For deeper threads: multi-agent threads are mention-only.
    // - For room child conversations: we allow the room manager to be the default even if multiple agents are linked.
    // - Elsewhere: keep the existing behavior.
    let isMentionOnlyThread = Boolean(isThread && conversationAgents.length >= 2 && !(isInRoomContext && isRoomChildConversation));

    let agentQueue: AgentModel[] = [];
    let noAgentToRun = false;
    {
      const content = typeof data.content === 'string' ? data.content : '';
      const userTokenCountPre = (content.match(/<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi) || []).length;
      const hasUserMentions = userTokenCountPre > 0;
      // If any agent is explicitly mentioned, we should route by mention (mentions take precedence over explicitAgentId fallback).
      const mentionedAgentsPreAll = this.extractMentionedAgents(content, allStarshipAgents);
      const mentionedAgentsPre = mentionedAgentsPreAll;
      const hasAgentMentions = Array.isArray(mentionedAgentsPre) && mentionedAgentsPre.length > 0;

      // Explicit agent selection (client-provided agentId):
      // - Supported for normal conversations and threads (including threads under channels) where a default agent is allowed.
      // - NOT used for channel conversations or mention-only threads (those remain mention-gated to avoid surprising charges/agent runs).
      const explicitAgentIdRaw = typeof data.agentId === 'string' ? data.agentId.trim() : '';
      const explicitAgentId = explicitAgentIdRaw;
      // IMPORTANT: explicitAgentId is lower priority than explicit mentions, and must not trigger when the message contains user mentions.
      if (explicitAgentId && !isMentionOnlyThread && !hasUserMentions && !hasAgentMentions) {
        const explicitAgent = allStarshipAgents.find((a) => String(a?.id || '').trim() === explicitAgentId);
        if (explicitAgent) {
          // Ensure the agent is linked so subsequent turns have a stable fallback.
          if (!conversationAgents.find((x) => x.id === explicitAgent.id)) {
            try {
              await this.conversationRepository.linkToAgent(data.conversationId, explicitAgent.id);
              conversationAgents = await this.getConversationAgents(data.conversationId);
            } catch (err) {
              console.warn('[ConversationService] Failed to auto-link explicit agent', {
                conversationId: data.conversationId,
                agentId: explicitAgent.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          agentQueue = [explicitAgent];
          noAgentToRun = false;
        }
      }

      // Build initial target agents from @mentions in the incoming message.
      // - For channels: mention-only; no fallback agent.
      // - For normal conversations: fallback to the first linked agent.
      // - For threads with 2+ agents: mention-only; no fallback agent.
      if (agentQueue.length === 0) {
        const initialTargetsUnlinkedAll = this.extractMentionedAgents(data.content, allStarshipAgents);
        const initialTargetsUnlinked = initialTargetsUnlinkedAll;
        // Auto-link mentioned agents not yet linked
        let linkedAny = false;
        for (const a of initialTargetsUnlinked) {
          if (!conversationAgents.find((x) => x.id === a.id)) {
            await this.conversationRepository.linkToAgent(data.conversationId, a.id);
            linkedAny = true;
          }
        }
        // Refresh agents after linking so counts/order are accurate for routing rules.
        if (linkedAny) {
          conversationAgents = await this.getConversationAgents(data.conversationId);
        }

        isMentionOnlyThread = Boolean(isThread && conversationAgents.length >= 2 && !(isInRoomContext && isRoomChildConversation));
        const initialTargets =
          initialTargetsUnlinked.length > 0 ? initialTargetsUnlinked : this.extractMentionedAgents(data.content, conversationAgents);

        // -------------------------------------------------------------------
        // Default agent rules (per product spec)
        //
        // A) Room child conversations (parent is the room conversation):
        //    - Default agent is the room manager agent when present in the room allowlist.
        //    - If manager is absent, tagging is mandatory (no default fallback).
        //
        // B) Deeper room threads:
        //    - If exactly 1 agent is linked to the thread, that agent is the default.
        //    - If 0 or 2+ agents are linked, tagging is mandatory (mention-only for 2+).
        //
        // C) Non-room conversations:
        //    - Keep existing behavior (fallback to the first linked agent).
        // -------------------------------------------------------------------
        const pickManagerAllowed = async (): Promise<boolean> => {
          if (!isInRoomContext) return false;
          if (!roomConversationId || !roomManagerAgentId) return false;
          try {
            const conn = getConnection();
            const row = await conn.queryOne<{ ok: number }>(
              `
                SELECT 1 AS ok
                  FROM conversation_participants
                 WHERE conversation_id = $1
                   AND agent_id = $2
                 LIMIT 1
              `,
              [roomConversationId, roomManagerAgentId]
            );
            return Boolean(row?.ok);
          } catch {
            return false;
          }
        };

        let fallbackAgent: AgentModel | null = null;
        if (isInRoomContext && (isRoomChildConversation || roomCtxForRouting?.isRoom)) {
          const allowed = await pickManagerAllowed();
          if (allowed) {
            fallbackAgent = allStarshipAgents.find((a) => String(a?.id || '').trim() === roomManagerAgentId) || null;
            // Ensure the manager is linked to THIS conversation so subsequent turns have stable agent lists.
            if (fallbackAgent && !conversationAgents.find((x) => x.id === fallbackAgent!.id)) {
              try {
                await this.conversationRepository.linkToAgent(data.conversationId, fallbackAgent.id);
                conversationAgents = await this.getConversationAgents(data.conversationId);
              } catch {
                // best-effort
              }
            }
          }
        } else if (isInRoomContext && isDeeperRoomThread) {
          fallbackAgent = conversationAgents.length === 1 ? conversationAgents[0] : null;
        } else {
          fallbackAgent = conversationAgents[0] || null;
        }

        // If the message mentions any user(s) but no agent(s), do not run a default fallback agent.
        // This allows people to talk to each other in agent-backed threads without triggering an agent run.
        const blockFallbackDueToUserMentions = hasUserMentions && initialTargets.length === 0;
        const allowFallback = !isMentionOnlyThread && Boolean(fallbackAgent) && !blockFallbackDueToUserMentions;
        agentQueue = initialTargets.length > 0 ? initialTargets.slice() : allowFallback && fallbackAgent ? [fallbackAgent] : [];
        // If there's no fallback agent (e.g. a human-started thread with no linked agents), behave like mention-only:
        // persist the message/turn lifecycle but do not run any agent workflow unless explicitly mentioned.
        noAgentToRun =
          ((isMentionOnlyThread || !fallbackAgent) && agentQueue.length === 0) ||
          (blockFallbackDueToUserMentions && agentQueue.length === 0);
      }
    }

    // Now that routing is finalized, publish the start/active turn lifecycle ONLY when an agent will run.
    if (!noAgentToRun) {
      try {
        const at = new Date().toISOString();
        const initialAgent = Array.isArray(agentQueue) && agentQueue.length > 0 ? agentQueue[0] : null;
        // Seed canonical agent identity for the "typing/loading" window (before any deltas).
        if (initialAgent && typeof initialAgent.id === 'string' && typeof initialAgent.name === 'string') {
          this.currentAgentForConversation.set(data.conversationId, { id: initialAgent.id, name: initialAgent.name });
        }
        await this.streamBus.publish(data.conversationId, {
          type: 'turn.started',
          data: {
            conversationId: data.conversationId,
            turnId: turn.id,
            ...(initialAgent && typeof initialAgent.id === 'string' ? { agentId: initialAgent.id } : {}),
            ...(initialAgent && typeof initialAgent.name === 'string' ? { agentName: initialAgent.name } : {}),
            at,
          },
        });
        await this.streamBus.publish(data.conversationId, {
          type: 'turn.status',
          data: { conversationId: data.conversationId, turnId: turn.id, status: 'active', at },
        });
      } catch (e) {
        console.warn('[STREAM] Failed to publish turn started/active events', e);
      }
    }
    const processedAgents: Set<string> = new Set();
    const maxHops = 5; // prevent infinite handoffs per turn
    let hops = 0;

    // (late title generation block removed; handled early)

    // IMPORTANT:
    // Do NOT load the full message history for agent execution. This can grow without bound and
    // overflow model context windows. Always cap the LLM input to the most recent N messages.
    const llmHistoryLimit = 30;
    const initialPage = await this.getConversationMessagesPage({ conversationId: data.conversationId, limit: llmHistoryLimit });
    let messages = initialPage.messages;
    let hasMoreBefore = initialPage.hasMoreBefore;

    // Load conversation state for context - reload conversation to get latest state
    const latestConversation = await this.getConversationById(data.conversationId);
    let conversationState = (latestConversation?.state || {}) as ConversationState;
    if (isThread) {
      conversationState = await this.ensureThreadContextFromLegacySeed({ conversationId: data.conversationId, conversationState });
    }

    // Enable complete suppression during orchestration; we will emit a single 'complete' at the end
    if (!noAgentToRun) {
      this.suppressCompleteFor.add(data.conversationId);
    }

    try {
      // Mention-only channels and multi-agent threads: if there are no @mentions, do not run any agent.
      // Still complete the turn lifecycle cleanly so clients can exit "responding" state.
      if (noAgentToRun) {
        const conversationId = data.conversationId;
        const turnId = this.currentTurnId.get(conversationId) || turn.id;
        const at = new Date().toISOString();

        try {
          await this.turnRepository.updateTurn(turnId, { status: 'completed', completedAt: at });
        } catch {
          // best-effort
        }
        try {
          await this.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'completed', at } });
        } catch {
          // best-effort
        }
        try {
          await this.conversationRepository.mergeState(conversationId, { turnActive: false, lastCompleteAt: at });
        } catch {
          // best-effort
        }

        this.cleanupConversation(conversationId);
        return;
      }
      // starship already resolved above

      const env = getEnvConfig();

      const roomId = roomCtxForRouting?.roomConversationId ? String(roomCtxForRouting.roomConversationId) : '';

      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: starship.id,
        CONVERSATION_ID: data.conversationId,
        ...(roomId ? { ROOM_ID: roomId } : {}),
        // Used by internal Starships connector templates like:
        // {{ String(runtimeEnv.SERVER_URL ?? "") + "/api/v1" }}
        SERVER_URL: env.SERVER_URL,
      };

      const authUserId = ctx?.authContext?.userId ?? (conversation as { userId?: string }).userId;
      if (!authUserId) {
        throw new Error('Missing authUserId for connector_action session build');
      }
      // Expose end-user id for provider-side attribution (abuse detection / caching).
      runtimeEnv.AUTH_USER_ID = authUserId;

      // Orchestrate sequentially without dynamic mention-based handoffs
      while (agentQueue.length > 0 && hops < maxHops) {
        const agentModel = agentQueue.shift()!;
        if (processedAgents.has(agentModel.id)) {
          continue;
        }
        processedAgents.add(agentModel.id);
        hops += 1;

        // Expose current agent id to the blueprint via env("AGENT_ID")
        (runtimeEnv as Record<string, unknown>).AGENT_ID = agentModel.id;

        // Best-effort: update room manager heartbeat when the manager agent runs.
        // Do not bump rooms.updated_at; this is operational metadata only.
        if (isInRoomContext && roomConversationId && roomManagerAgentId && agentModel.id === roomManagerAgentId) {
          try {
            const conn = getConnection();
            await conn.query(
              `
                UPDATE rooms
                   SET manager_agent_heartbeat_at = NOW()
                 WHERE conversation_id = $1
                   AND manager_agent_id = $2
              `,
              [roomConversationId, roomManagerAgentId]
            );
          } catch {
            // best-effort
          }
        }

        // Guard against NULL/undefined persisted JSONB state
        const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

        // Resolve OpenRouter LLM plugins (e.g. web search) from conversation state only (agent plugins ignored).
        const plugins = this.resolvePlugins(
          conversationState as Record<string, unknown> | undefined,
          baseState as Record<string, unknown> | undefined
        );

        // Fetch fresh starship details for each agent execution so prompt context reflects the latest updates.
        const freshStarship = (await this.getConversationStarship(data.conversationId).catch(() => null)) || starship;
        const injectedStarshipContext = buildStarshipSystemPromptContext(freshStarship);
        const combinedSystemPrompt = this.buildCanonicalSystemPrompt({
          agentSystemPrompt: String(agentModel.systemPrompt ?? ''),
          injectedStarshipContext,
          conversationState,
          historyTruncated: Boolean(hasMoreBefore),
          historyLimit: llmHistoryLimit,
        });

        // Prepare input messages snapshot for this agent (with multimodal content support)
        const mentionRefs = ConversationService.collectMentionRefsFromMessages(messages);
        const { agentNameByRef, userNameByRef } = await this.resolveMentionNameMaps({
          starshipId: starship.id,
          userRefs: mentionRefs.userRefs,
          agentRefs: mentionRefs.agentRefs,
        });

        // Exclude persisted system messages from LLM history. System instructions must come only from
        // the canonical system prompt for provider-stable semantics.
        const attributionDirectory = await this.buildAttributionDirectory(messages);
        const llmMessagesCore: LlmMessage[] = await Promise.all(
          ConversationService.filterMessagesForLlmHistory<MessageModel>(messages).map(async (msg): Promise<LlmMessage> => {
            // Build multimodal content if message has attachments
            const content = await this.buildMessageContent(msg, starship.id);
            const strippedInfo = this.stripEchoedAttributionHeadersFromContent({ role: msg.role, content });
            const contentStripped = strippedInfo.content;
            const contentWithMentions = this.replaceMentionTokensInContent({ content: contentStripped, agentNameByRef, userNameByRef });
            const contentWithAttribution = this.injectAttributionIntoContent(msg, contentWithMentions, attributionDirectory);

            const effectiveRole = (() => {
              const r = msg.role as 'user' | 'assistant' | 'system' | 'tool';
              if (r !== 'assistant') return r;
              // Multi-agent conversations: treat other agents' assistant messages as "external" input.
              // When executing agentModel.id, only that agent's assistant messages remain role=assistant.
              const msgAgentId = typeof msg.agentId === 'string' ? msg.agentId.trim() : '';
              if (msgAgentId && msgAgentId !== agentModel.id) return 'user';
              // Preserve assistant role when toolCalls are present (provider tool-result linkage).
              const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
              if (hasToolCalls) return 'assistant';
              return msgAgentId && msgAgentId !== agentModel.id ? 'user' : 'assistant';
            })();

            const baseMessage: LlmMessage = {
              role: effectiveRole,
              content: contentWithAttribution,
              ...(msg.reasoning ? { reasoning: msg.reasoning } : {}),
            };
            try {
              const meta = this.buildStarshipsMessageMeta(msg);
              if (meta) (baseMessage as unknown as Record<string, unknown>).starshipsMeta = meta;
            } catch {
              /* ignore */
            }
            if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
              (baseMessage as LlmMessage).toolCalls = msg.toolCalls as unknown as LlmToolCall[];
            }
            if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
              (baseMessage as LlmMessage).toolCallId = msg.toolCallId;
            }
            return baseMessage;
          })
        );
        const llmMessagesCoreNormalized = this.normalizeToolCallHistory(llmMessagesCore);
        // History folding notice is carried inside the canonical system prompt.
        const llmMessages: LlmMessage[] = llmMessagesCoreNormalized;
        // input not required; execution.state messages are set directly

        // Attribute streamed content to the current agent
        this.currentAgentForConversation.set(data.conversationId, { id: agentModel.id, name: agentModel.name });

        // Run the turn via the single converged path: a provisioned repo workspace
        // (engineering room) runs in the Docker sandbox with full system tools; everything
        // else runs in-process with connector tools only. Streaming + persistence are
        // identical across both transports (agentTurnEventMapper).
        const turnId = this.currentTurnId.get(data.conversationId);
        if (!turnId) {
          throw new Error('Missing turnId for agent execution');
        }
        const cfg = agentModel as unknown as Record<string, unknown>;
        const turnAuthUserId = typeof runtimeEnv?.AUTH_USER_ID === 'string' ? runtimeEnv.AUTH_USER_ID : authUserId;
        const turnRoomId = typeof runtimeEnv?.ROOM_ID === 'string' ? runtimeEnv.ROOM_ID : undefined;
        await runAgentTurn(
          {
            messageService: this.messageService,
            streamBus: this.streamBus,
            turnRepository: this.turnRepository,
            conversationRepository: this.conversationRepository,
          },
          {
            conversationId: data.conversationId,
            turnId,
            agentModel: {
              id: agentModel.id,
              name: agentModel.name,
              model: String(cfg.model ?? ''),
              ...(typeof cfg.temperature === 'number' ? { temperature: cfg.temperature } : {}),
              ...(typeof cfg.maxTokens === 'number' ? { maxTokens: cfg.maxTokens } : {}),
              ...(typeof cfg.timeout === 'number' ? { timeout: cfg.timeout } : {}),
              ...(cfg.reasoning && typeof cfg.reasoning === 'object'
                ? { reasoning: cfg.reasoning as { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean } }
                : {}),
            },
            systemPrompt: combinedSystemPrompt,
            llmMessages,
            starshipId: starship.id,
            authUserId: turnAuthUserId,
            ...(turnRoomId ? { roomId: turnRoomId } : {}),
            ...(Array.isArray(data.modalities) && data.modalities.length > 0 ? { modalities: data.modalities } : {}),
            ...(data.imageConfig && typeof data.imageConfig === 'object' ? { imageConfig: data.imageConfig } : {}),
            ...(plugins !== undefined ? { plugins } : {}),
          }
        );

        // Clear cancellation handle after completion
        ConversationService.activeCancellations.delete(data.conversationId);

        // Refresh messages after this agent's turn so subsequent agents (if any)
        // see the updated conversation state, but do not perform mention-based handoffs
        const refreshedPage = await this.getConversationMessagesPage({ conversationId: data.conversationId, limit: llmHistoryLimit });
        messages = refreshedPage.messages;
        hasMoreBefore = refreshedPage.hasMoreBefore;
      }
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Clean up placeholder cancellation handle on error
      ConversationService.activeCancellations.delete(data.conversationId);

      try {
        const turnId = this.currentTurnId.get(data.conversationId) || this.generationId.get(data.conversationId) || data.conversationId;
        await this.streamBus.publish(data.conversationId, {
          type: 'turn.status',
          data: {
            conversationId: data.conversationId,
            turnId,
            status: 'failed',
            at: new Date().toISOString(),
            error: { code: 'AGENT_EXECUTION_FAILED', message: error instanceof Error ? error.message : 'Unknown agent execution error' },
          },
        });
      } catch (err) {
        const turnId = this.currentTurnId.get(data.conversationId) || this.generationId.get(data.conversationId) || data.conversationId;
        console.error('[ConversationService] Failed to publish turn status failed event', {
          error: err instanceof Error ? err.message : String(err),
          conversationId: data.conversationId,
          turnId,
        });
      }

      throw error;
    } finally {
      // Always clean up cancellation handle (placeholder or real) to allow new turns
      ConversationService.activeCancellations.delete(data.conversationId);
      // Always release any starship-level concurrency lease associated with this turn (best-effort).
      if (opts?.turnLeaseId) {
        try {
          const leaseService = new StarshipTurnLeaseService();
          await leaseService.release(opts.turnLeaseId);
        } catch {
          // best-effort; lease also has TTL in DB
        }
      }
      // Clear attribution and suppression, emit a single completion
      this.currentAgentForConversation.delete(data.conversationId);
      this.suppressCompleteFor.delete(data.conversationId);
    }
  }

  /**
   * Determine whether an incoming user message will trigger any agent execution.
   *
   * Used for billing + UX gating: we only charge fixed "per user message" credits
   * when the message will actually run an agent.
   *
   * IMPORTANT:
   * - This is intentionally side-effect free (it does NOT auto-link mentioned agents).
   * - Server remains authoritative; this is a best-effort routing preview.
   */
  async willTriggerAgentExecution(params: { conversationId: string; content: string; agentId?: string | null }): Promise<boolean> {
    try {
      const conversationId = String(params.conversationId || '').trim();
      const content = typeof params.content === 'string' ? params.content : '';
      const explicitAgentId = typeof params.agentId === 'string' ? params.agentId.trim() : '';
      if (!conversationId) return false;

      const [conversation, starship] = await Promise.all([
        this.getConversationById(conversationId).catch(() => null),
        this.getConversationStarship(conversationId).catch(() => null),
      ]);
      if (!conversation || !starship) return false;

      const isThread = Boolean((conversation as { parentConversationId?: string | null }).parentConversationId);

      const [conversationAgents, allStarshipAgents] = await Promise.all([
        this.getConversationAgents(conversationId).catch(() => [] as AgentModel[]),
        this.agentRepository.findByStarship(starship.id).catch(() => [] as AgentModel[]),
      ]);

      const linkedAgentCount = Array.isArray(conversationAgents) ? conversationAgents.length : 0;
      const isMentionOnlyThread = Boolean(isThread && linkedAgentCount >= 2);

      // Mentions are resolved against the full starship agent list (not only currently-linked agents).
      const mentioned = this.extractMentionedAgents(content, Array.isArray(allStarshipAgents) ? allStarshipAgents : []);
      const hasMention = mentioned.length > 0;
      const hasUserMentionToken = /<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/i.test(content);

      // Mention-only contexts only trigger when at least one agent is mentioned.
      if (isMentionOnlyThread) return hasMention;

      // If the message contains user mentions but no agent mentions, do not trigger any agent execution
      // (even if a default linked agent exists or a client provided agentId for convenience).
      if (hasUserMentionToken && !hasMention) return false;

      // Normal conversations:
      // - If an explicit agentId is provided (client selects an agent), treat it as intent to trigger execution.
      // - Otherwise fallback to linked agent count.
      if (explicitAgentId) {
        const existsOnStarship = Array.isArray(allStarshipAgents)
          ? allStarshipAgents.some((a) => String(a?.id || '').trim() === explicitAgentId)
          : false;
        if (existsOnStarship) return true;
      }

      // Otherwise: mentions or fallback linked agent.
      return hasMention || linkedAgentCount > 0;
    } catch (err) {
      console.warn('[ConversationService] willTriggerAgentExecution failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail closed: if we can't determine routing, do not claim an agent will run.
      return false;
    }
  }

  /**
   * Continue a conversation turn after an out-of-band tool approval/denial.
   *
   * This does NOT create a new user message and must NOT debit fixed user-message credits.
   * It simply runs the specified agent again using the latest persisted conversation messages.
   */
  async continueAfterToolApproval(conversationId: string, agentId: string, ctx?: { authContext?: { userId?: string } }): Promise<void> {
    // SERVER-SIDE GUARD: prevent concurrent turns
    const hasActiveCancellation = ConversationService.activeCancellations.has(conversationId);
    if (hasActiveCancellation) {
      throw new ConflictError('A turn is already in progress for this conversation. Please wait for it to complete.');
    }

    ConversationService.activeCancellations.set(conversationId, () => {
      // placeholder; replaced by actual cancel on workflow start
    });

    let turnLeaseId: string | undefined;
    const leaseService = new StarshipTurnLeaseService();

    try {
      const conversation = await this.getConversationById(conversationId);
      const turnActive =
        conversation?.state &&
        typeof conversation.state === 'object' &&
        (conversation.state as { turnActive?: boolean }).turnActive === true;

      if (turnActive) {
        ConversationService.activeCancellations.delete(conversationId);
        throw new ConflictError('A turn is already in progress for this conversation. Please wait for it to complete.');
      }

      if (!conversation) {
        ConversationService.activeCancellations.delete(conversationId);
        throw new NotFoundError('Conversation', conversationId);
      }

      const starship = await this.getConversationStarship(conversationId);
      if (!starship) {
        ConversationService.activeCancellations.delete(conversationId);
        throw new NotFoundError('Starship', String(conversation.starshipId || ''));
      }

      // Starship-level concurrency gate (Scout=1, Frigate=2)
      turnLeaseId = await leaseService.acquire({
        starshipId: starship.id,
        conversationId,
        maxConcurrentTurns: (starship as StarshipModel & { maxConcurrentTurns?: number }).maxConcurrentTurns ?? 3,
      });

      const agentService = new AgentService();
      const agentModel = await agentService.getAgent(agentId);
      if (!agentModel || agentModel.starshipId !== starship.id) {
        ConversationService.activeCancellations.delete(conversationId);
        throw new NotFoundError('Agent', agentId);
      }

      // Publish a turn.status=active event so clients immediately re-enter "responding" UI.
      // Unlike the initial message flow, there is no new turn.started event here.
      // Also seed resumeTurnSeqOffset so new messages don't overwrite prior turn slots.
      try {
        const at = new Date().toISOString();
        let latestTurnId =
          this.currentTurnId.get(conversationId) ||
          (await this.turnRepository
            .findLatestByConversationId(conversationId)
            .then((t) => (t?.id ? t.id : null))
            .catch(() => null)) ||
          null;

        // If this is the first ever kickoff for a conversation (no DB turn exists yet),
        // create a DB-backed turn so streaming persistence (upsertByTurnSlot) has a valid turn_id.
        if (!latestTurnId) {
          try {
            const created = await this.turnRepository.createTurn({ conversationId, status: 'active' });
            latestTurnId = created?.id ? String(created.id) : null;
          } catch {
            // best-effort: if we fail to create a DB turn, fall back to a synthetic id.
            // Note: persistence may still fail; caller handles errors as best-effort.
            latestTurnId = null;
          }
        }

        const turnId = latestTurnId || conversationId;

        // Ensure turn-aware persistence uses the real DB turn id (not a synthetic generation id).
        if (latestTurnId) {
          this.currentTurnId.set(conversationId, latestTurnId);
          try {
            const maxSeq = await this.messageService.getMaxTurnSeq(latestTurnId);
            this.resumeTurnSeqOffset.set(conversationId, Math.max(0, Number(maxSeq) || 0));
          } catch {
            // best-effort; fallback keeps old behavior
          }
        }

        // If we created a fresh turn above, publish a turn.started so clients have a consistent turn lifecycle.
        // (Harmless if the client ignores it.)
        if (latestTurnId) {
          try {
            // Seed canonical agent identity for the resumed turn (so UI identity is stable before deltas).
            try {
              const aid = typeof agentModel?.id === 'string' ? String(agentModel.id) : '';
              const an = typeof agentModel?.name === 'string' ? String(agentModel.name) : '';
              if (aid && an) {
                this.currentAgentForConversation.set(conversationId, { id: aid, name: an });
              }
            } catch {
              /* ignore */
            }
            await this.streamBus.publish(conversationId, {
              type: 'turn.started',
              data: {
                conversationId,
                turnId,
                ...(typeof agentModel?.id === 'string' ? { agentId: String(agentModel.id) } : {}),
                ...(typeof agentModel?.name === 'string' ? { agentName: String(agentModel.name) } : {}),
                at,
              },
            });
          } catch {
            // best-effort
          }
        }

        await this.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'active', at } });
      } catch (err) {
        console.warn('[ConversationService] Failed to publish resume turn.status=active', {
          conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Load latest persisted conversation messages and convert to LlmMessage array
      // Keep resumed turns bounded too; do not load full history into the LLM context.
      const llmHistoryLimit = 30;
      const page = await this.getConversationMessagesPage({ conversationId, limit: llmHistoryLimit });
      const messages = page.messages;
      const mentionRefs = ConversationService.collectMentionRefsFromMessages(messages);
      const { agentNameByRef, userNameByRef } = await this.resolveMentionNameMaps({
        starshipId: starship.id,
        userRefs: mentionRefs.userRefs,
        agentRefs: mentionRefs.agentRefs,
      });
      // When resuming after tool approval, conversation state often has pending tool calls.
      // For provider-safety we sometimes inject synthetic TOOL_RESULT_MISSING tool messages into history,
      // but those placeholders must NOT block persistence of the real tool result that will be appended next.
      const pendingToolCallIds = (() => {
        const st = conversation?.state && typeof conversation.state === 'object' ? (conversation.state as Record<string, unknown>) : null;
        const raw = st && Array.isArray(st['pendingToolCalls']) ? (st['pendingToolCalls'] as unknown[]) : [];
        const out = new Set<string>();
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const id = typeof rec['id'] === 'string' ? rec['id'].trim() : '';
          if (id) out.add(id);
        }
        return out;
      })();
      // Exclude persisted system messages from LLM history. System instructions must come only from
      // the canonical system prompt for provider-stable semantics.
      const attributionDirectory = await this.buildAttributionDirectory(messages);
      const llmMessagesCore: LlmMessage[] = await Promise.all(
        ConversationService.filterMessagesForLlmHistory<MessageModel>(messages).map(async (msg): Promise<LlmMessage> => {
          const content = await this.buildMessageContent(msg, starship.id);
          const strippedInfo = this.stripEchoedAttributionHeadersFromContent({ role: msg.role, content });
          const contentStripped = strippedInfo.content;
          const contentWithMentions = this.replaceMentionTokensInContent({ content: contentStripped, agentNameByRef, userNameByRef });
          const contentWithAttribution = this.injectAttributionIntoContent(msg, contentWithMentions, attributionDirectory);
          const baseMessage: LlmMessage = {
            role: (() => {
              const r = msg.role as 'user' | 'assistant' | 'system' | 'tool';
              if (r !== 'assistant') return r;
              const msgAgentId = typeof msg.agentId === 'string' ? msg.agentId.trim() : '';
              if (msgAgentId && msgAgentId !== agentModel.id) return 'user';
              const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
              if (hasToolCalls) return 'assistant';
              return 'assistant';
            })(),
            content: contentWithAttribution,
            ...(msg.reasoning ? { reasoning: msg.reasoning } : {}),
          };
          try {
            const meta = this.buildStarshipsMessageMeta(msg);
            if (meta) (baseMessage as unknown as Record<string, unknown>).starshipsMeta = meta;
          } catch {
            /* ignore */
          }
          if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            (baseMessage as LlmMessage).toolCalls = msg.toolCalls as unknown as LlmToolCall[];
          }
          if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
            (baseMessage as LlmMessage).toolCallId = msg.toolCallId;
          }
          return baseMessage;
        })
      );
      const llmMessagesCoreNormalized = this.normalizeToolCallHistory(llmMessagesCore);
      // History folding notice is carried inside the canonical system prompt.
      const llmMessages: LlmMessage[] =
        pendingToolCallIds.size > 0
          ? llmMessagesCoreNormalized.filter((m) => {
              if (!m || typeof m !== 'object') return true;
              if (m.role !== 'tool') return true;
              const rec = m as unknown as Record<string, unknown>;
              const id = typeof rec['toolCallId'] === 'string' ? String(rec['toolCallId']).trim() : '';
              // Strip any placeholder tool messages for currently pending tool calls.
              // The real tool result will be appended by the agent execution and must be seen as "new" for persistence.
              return !id || !pendingToolCallIds.has(id);
            })
          : llmMessagesCoreNormalized;

      const env = getEnvConfig();

      const roomCtx = await resolveRoomConversationContext({ conversationId }).catch(() => null);
      const roomId = roomCtx?.roomConversationId ? String(roomCtx.roomConversationId) : '';

      const runtimeEnv = {
        STARSHIP_ID: starship.id,
        CONVERSATION_ID: conversationId,
        ...(roomId ? { ROOM_ID: roomId } : {}),
        AGENT_ID: agentModel.id,
        // Used by internal Starships connector templates like:
        // {{ String(runtimeEnv.SERVER_URL ?? "") + "/api/v1" }}
        SERVER_URL: env.SERVER_URL,
      };

      // Load conversation-level state context (if any)
      let conversationState = (conversation.state && typeof conversation.state === 'object' ? conversation.state : {}) as ConversationState;
      if (conversation.parentConversationId) {
        conversationState = await this.ensureThreadContextFromLegacySeed({ conversationId, conversationState });
      }
      // Guard against NULL/undefined persisted JSONB state
      const baseState =
        agentModel.state && typeof agentModel.state === 'object'
          ? (agentModel.state as Record<string, unknown>)
          : ({ messages: [], tools: [] } as AgentState);

      // Resolve OpenRouter LLM plugins (e.g. web search) from conversation state only.
      const plugins = this.resolvePlugins(conversationState as ConversationState | undefined, baseState as AgentState | undefined);

      // Fetch fresh starship details so prompt context reflects the latest updates.
      const freshStarship = (await this.getConversationStarship(conversationId).catch(() => null)) || starship;
      const injectedStarshipContext = buildStarshipSystemPromptContext(freshStarship);
      const combinedSystemPrompt = this.buildCanonicalSystemPrompt({
        agentSystemPrompt: String(agentModel.systemPrompt ?? ''),
        injectedStarshipContext,
        conversationState,
        historyTruncated: Boolean(page.hasMoreBefore),
        historyLimit: llmHistoryLimit,
      });

      const authUserId = ctx?.authContext?.userId ?? (conversation as { userId?: string }).userId;
      if (!authUserId) {
        throw new Error('Missing authUserId for connector_action session build');
      }

      this.currentAgentForConversation.set(conversationId, { id: agentModel.id, name: agentModel.name });

      // Resume the turn via the converged path: gather approval decisions for the pending
      // tool calls, then re-enter the loop (which finishes approved/denied calls without
      // re-calling the LLM). Transport (sandbox vs in-process) is chosen inside runAgentTurn.
      //
      // KNOWN LIMITATION: the turn id comes from the in-memory currentTurnId map, which is
      // empty after a server restart. A turn that was waiting_for_tools when the process
      // restarted has no in-memory turn id and cannot resume here yet; resolving this needs
      // a DB lookup for the active turn id (e.g. turnRepository.findActiveTurnId).
      const turnId = this.currentTurnId.get(conversationId);
      if (!turnId) {
        throw new Error('Missing turnId for agent resume');
      }

      const pendingRaw = Array.isArray((conversationState as Record<string, unknown>)?.pendingToolCalls)
        ? ((conversationState as Record<string, unknown>).pendingToolCalls as Array<Record<string, unknown>>)
        : [];
      const approvalRepo = new ToolCallApprovalRepository();
      const approvals: Record<string, 'approved' | 'denied'> = {};
      for (const p of pendingRaw) {
        const tcId = typeof p?.id === 'string' ? p.id : '';
        if (!tcId) continue;
        const rec = await approvalRepo.findByConversationAndToolCallId(conversationId, tcId).catch(() => null);
        if (rec?.status === 'approved') approvals[tcId] = 'approved';
        else if (rec?.status === 'denied' || rec?.status === 'expired') approvals[tcId] = 'denied';
      }

      const cfg = agentModel as unknown as Record<string, unknown>;
      const turnRoomId = typeof runtimeEnv?.ROOM_ID === 'string' ? runtimeEnv.ROOM_ID : undefined;
      await runAgentTurn(
        {
          messageService: this.messageService,
          streamBus: this.streamBus,
          turnRepository: this.turnRepository,
          conversationRepository: this.conversationRepository,
        },
        {
          conversationId,
          turnId,
          agentModel: {
            id: agentModel.id,
            name: agentModel.name,
            model: String(cfg.model ?? ''),
            ...(typeof cfg.temperature === 'number' ? { temperature: cfg.temperature } : {}),
            ...(typeof cfg.maxTokens === 'number' ? { maxTokens: cfg.maxTokens } : {}),
            ...(typeof cfg.timeout === 'number' ? { timeout: cfg.timeout } : {}),
            ...(cfg.reasoning && typeof cfg.reasoning === 'object'
              ? { reasoning: cfg.reasoning as { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean } }
              : {}),
          },
          systemPrompt: combinedSystemPrompt,
          llmMessages,
          starshipId: starship.id,
          authUserId,
          ...(turnRoomId ? { roomId: turnRoomId } : {}),
          ...(plugins !== undefined ? { plugins } : {}),
          approvals,
        }
      );
    } finally {
      ConversationService.activeCancellations.delete(conversationId);
      if (turnLeaseId) {
        try {
          await leaseService.release(turnLeaseId);
        } catch (err) {
          console.error('[ConversationService] Failed to release turn lease', {
            error: err instanceof Error ? err.message : String(err),
            turnLeaseId,
            conversationId,
          });
        }
      }
    }
  }

  /**
   * Best-effort token estimate for stop/cancel flows where providers do not return usage.
   *
   * NOTE: This is intentionally a heuristic. It improves UX/analytics consistency when a turn is interrupted
   * before the provider reports usage (common in streaming cancels).
   */
  private static estimateTokensFromText(text: string): number {
    if (typeof text !== 'string' || text.length === 0) return 0;
    // Rough heuristic: ~4 chars/token for English-like text.
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Stop current turn: cancel runner, persist partial content/reasoning (omit tool_calls), finalize SSE.
   */
  async stopConversation(conversationId: string): Promise<void> {
    // Mark stop-requested early so late node_completed persistence can avoid saving toolCalls.
    this.stopRequestedForConversation.add(conversationId);

    // Cancel active runner if any
    try {
      const cancel = ConversationService.activeCancellations.get(conversationId);
      if (typeof cancel === 'function') {
        try {
          cancel();
        } catch (err) {
          console.warn('[STOP] Error while cancelling active runner', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        ConversationService.activeCancellations.delete(conversationId);
      }
    } catch (err) {
      console.warn('[STOP] Error accessing active cancellation handle', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Persist the active streaming partial (if any), regardless of prior assistant messages this turn
    let persistedMsg: MessageModel | null = await this.persistActivePartial(conversationId);

    // Mark turn cancelled (best-effort)
    try {
      const turnId = this.currentTurnId.get(conversationId);
      if (turnId) {
        await this.turnRepository.updateTurn(turnId, {
          status: 'cancelled',
          completedAt: new Date().toISOString(),
          stopReason: 'user_stop',
        });
      }
    } catch (err) {
      console.error('[ConversationService] Failed to update conversation state after turn completion', {
        error: err instanceof Error ? err.message : String(err),
        conversationId,
      });
    }

    // If we have cached usage from streaming but no content_complete occurred, persist usage now
    try {
      const latest = this.latestStreamingUsage.get(conversationId);
      const starship = await this.getConversationStarship(conversationId);
      if (!starship) {
        // No access to starship context → skip usage persistence (best-effort).
      } else if (latest) {
        // Provider-supplied usage (preferred).
        const promptTokens = Number(latest.promptTokens || 0);
        const completionTokens = Number(latest.completionTokens || 0);
        const totalTokens = Number(latest.totalTokens || 0) || promptTokens + completionTokens;
        const rawCost = typeof latest.cost === 'number' && Number.isFinite(latest.cost) ? latest.cost : undefined;
        const computedCost =
          rawCost !== undefined
            ? rawCost
            : await this.computeCostFromCatalog({
                model: typeof latest.model === 'string' ? latest.model : undefined,
                promptTokens,
                completionTokens,
              });
        await this.usageService.createUsageForTurn({
          starshipId: starship.id,
          conversationId,
          promptTokens,
          completionTokens,
          totalTokens,
          cost: Number(computedCost ?? 0),
          ...(latest.model ? { model: latest.model } : {}),
        });
        this.usagePersistedThisTurn.add(conversationId);

        // Also publish a turn.usage so the client can update UI immediately (best-effort).
        try {
          const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
          const agent = this.currentAgentForConversation.get(conversationId);
          await this.streamBus.publish(conversationId, {
            type: 'turn.usage',
            data: {
              conversationId,
              turnId,
              at: new Date().toISOString(),
              ...(agent?.id ? { agentId: agent.id } : {}),
              ...(agent?.name ? { agentName: agent.name } : {}),
              ...(typeof latest.model === 'string' ? { model: latest.model } : {}),
              usage: {
                promptTokens,
                completionTokens,
                totalTokens,
                ...(typeof computedCost === 'number' && Number.isFinite(computedCost) ? { cost: Number(computedCost) } : {}),
              },
            },
          });
        } catch {
          // best-effort only
        }
      } else {
        // Heuristic estimate: provider did not report usage before stop.
        // We estimate completion tokens from streamed content and prompt tokens from recent persisted messages.
        const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
        const agent = this.currentAgentForConversation.get(conversationId);

        // Resolve model from active agent (best-effort) for cost estimation.
        let model: string | undefined;
        try {
          if (agent?.id) {
            const agentService = new AgentService();
            const agentModel = await agentService.getAgent(agent.id).catch(() => null);
            const cfg = agentModel && typeof agentModel === 'object' ? (agentModel as unknown as Record<string, unknown>) : null;
            if (cfg && typeof cfg.model === 'string') {
              const m = cfg.model.trim();
              if (m) model = m;
            }
          }
        } catch {
          /* best-effort */
        }

        // Completion estimate from current streamed assistant content/reasoning.
        const streamedContent = this.streamingContent.get(conversationId) || '';
        const streamedReasoning = this.streamingReasoning.get(conversationId) || '';
        const completionTokens = ConversationService.estimateTokensFromText(streamedContent + streamedReasoning);

        // Prompt estimate from last N persisted messages (text only).
        let promptTokens = 0;
        try {
          const page = await this.getConversationMessagesPage({ conversationId, limit: 30 });
          const msgs = Array.isArray(page?.messages) ? page.messages : [];
          const joined = msgs.map((m) => String(m?.content ?? '')).join('\n');
          promptTokens = ConversationService.estimateTokensFromText(joined);
        } catch {
          promptTokens = 0;
        }

        const totalTokens = promptTokens + completionTokens;
        const computedCost = await this.computeCostFromCatalog({
          model,
          promptTokens,
          completionTokens,
        });

        // Persist usage (even if estimated) so totals update after stop.
        await this.usageService.createUsageForTurn({
          starshipId: starship.id,
          conversationId,
          promptTokens,
          completionTokens,
          totalTokens,
          cost: Number(computedCost ?? 0),
          ...(model ? { model } : {}),
        });
        this.usagePersistedThisTurn.add(conversationId);

        // Publish turn.usage for UI (best-effort).
        try {
          await this.streamBus.publish(conversationId, {
            type: 'turn.usage',
            data: {
              conversationId,
              turnId,
              at: new Date().toISOString(),
              ...(agent?.id ? { agentId: agent.id } : {}),
              ...(agent?.name ? { agentName: agent.name } : {}),
              ...(model ? { model } : {}),
              usage: {
                promptTokens,
                completionTokens,
                totalTokens,
                ...(typeof computedCost === 'number' && Number.isFinite(computedCost) ? { cost: Number(computedCost) } : {}),
              },
            },
          });
        } catch {
          // best-effort only
        }
      }
    } catch (e) {
      console.error('[STOP] Failed to persist mid-turn usage on stop:', e);
    } finally {
      // Clear cached usage regardless to avoid double-accounting on future turns
      this.latestStreamingUsage.delete(conversationId);
    }

    // Publish terminal turn state + any persisted partial message
    try {
      const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
      const at = new Date().toISOString();
      if (persistedMsg) {
        await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persistedMsg } });
        try {
          void this.notifications.handleMessageAppend({ conversationId, message: persistedMsg });
        } catch {
          /* best-effort */
        }
      }
      await this.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'cancelled', at } });
    } catch (err) {
      console.warn('[STOP] Failed to publish cancelled turn status', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Persist server-authoritative end-of-turn state (best-effort, for administrative visibility)
    try {
      await this.conversationRepository.mergeState(conversationId, {
        turnActive: false,
        lastCompleteAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[STOP] Failed to persist turnActive=false on stop', err);
    }

    // Clear all in-memory state for this conversation's turn now that it has stopped
    this.clearStreamingState(conversationId);
  }

  /**
   * Generate a short, descriptive conversation title using a lightweight LLM (autopilot LLM node)
   * Records usage under the starship/conversation for billing.
   */
  private async generateConversationTitle(starshipId: string, conversationId: string, userContent: string): Promise<string | null> {
    try {
      // Hardcode a known, reliable OpenRouter model for titles
      const model = 'openai/gpt-4o-mini';

      // If this is a thread, include the pinned/linked message context.
      // New threads store this in conversation.state.threadContext; older threads used a hidden
      // system_instruction message (`[THREAD_CONTEXT_SEED]`).
      let threadPinnedContent: string | null = null;
      try {
        const convo = await this.getConversationById(conversationId).catch(() => null);
        const state = (convo?.state || {}) as ConversationState;
        const tc = this.getThreadContextFromConversationState(state);
        const fromState = typeof tc?.sourceContent === 'string' ? tc.sourceContent.trim() : '';
        if (fromState) {
          threadPinnedContent = fromState;
        } else if (convo?.parentConversationId) {
          const seed = await this.findLegacyThreadContextSeedContent(conversationId);
          const extracted = seed ? ConversationService.extractThreadSeedSourceContent(seed) : null;
          threadPinnedContent = extracted ?? null;
        }
      } catch {
        // best-effort
      }

      const { OPENROUTER_API_KEY } = getEnvConfig();
      if (!OPENROUTER_API_KEY) {
        console.warn('[TITLE] OPENROUTER_API_KEY not configured; skipping title generation');
        return null;
      }

      const client = new OpenAI({
        apiKey: OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://starships.ai',
          'X-Title': 'Starships.ai',
        },
      });

      const sys = [
        'You generate concise, helpful conversation titles.',
        'Rules:',
        '- 4-8 words, sentence case, no trailing punctuation.',
        '- Capture the main user intent/topic from the initial context.',
        '- Avoid quotes, emojis, and personal data. Keep under 60 characters.',
        '- Do not include @mentions or handles; omit them.',
      ].join('\n');

      const stripMentionsForTitle = (s: string): string => {
        const input = String(s || '');
        // Remove structured mention tokens and replace legacy @mentions with a generic placeholder.
        // (We intentionally avoid resolving IDs -> names for titles.)
        return input
          .replace(/<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi, ' agent ')
          .replace(/<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi, ' user ')
          .replace(/<@[^>\n]+>/g, ' ')
          .replace(/(^|\s)@(?:"([^"\n]{1,100})"|\[([^\]\n]{1,100})\]|([a-z0-9._-]{1,100}))/gi, '$1mention')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const safe = (s: string, max: number) =>
        String(s || '')
          .replace(/<@[^>\n]+>/g, ' ')
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, max);

      const pinnedForTitle = threadPinnedContent ? stripMentionsForTitle(threadPinnedContent) : '';
      const userForTitle = stripMentionsForTitle(userContent);
      const ctxBlock = pinnedForTitle ? `Thread pinned message: "${safe(pinnedForTitle, 500)}"\n` : '';
      const prompt = `${ctxBlock}User message: "${safe(userForTitle, 400)}"\n\nReturn only the title text.`;

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 32,
      });

      const choice = completion.choices?.[0]?.message?.content || '';
      const usage = (
        completion as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } }
      ).usage;

      // Record usage if provided by LLM (camelCase fields)
      try {
        if (usage && typeof usage.total_tokens === 'number') {
          const promptTokens = Number(usage.prompt_tokens ?? 0);
          const completionTokens = Number(usage.completion_tokens ?? 0);
          const totalTokens = Number(usage.total_tokens ?? 0);
          const providerCost = this.extractProviderCost(usage);
          const computedCost =
            providerCost !== undefined
              ? providerCost
              : await this.computeCostFromCatalog({
                  model: String(model),
                  promptTokens,
                  completionTokens,
                });
          await this.usageService
            .createUsageForTurn({
              starshipId,
              conversationId,
              promptTokens,
              completionTokens,
              totalTokens,
              cost: Number(computedCost ?? 0),
              model: String(model),
            })
            .then(async () => {
              // Credits system: usage rows are analytics only; do not debit wallet based on token usage.
            });
        }
      } catch (err) {
        console.warn('[TITLE] Usage recording failed:', err);
      }

      // If model produced nothing, skip
      if (!choice || String(choice).trim().length === 0) {
        console.warn('[TITLE] Empty model response; skipping');
        return null;
      }

      // Sanitize and trim the title
      const title = String(choice || '')
        .trim()
        .replace(/^"|"$/g, '');
      if (!title) {
        console.warn('[TITLE] Title empty after sanitize; skipping');
        return null;
      }
      // Remove trailing punctuation like '.' or ':'
      const cleaned = title.replace(/[\s:。.]+$/g, '');
      if (!cleaned) {
        console.warn('[TITLE] Title empty after cleanup; skipping');
        return null;
      }
      return cleaned.slice(0, 80);
    } catch (e) {
      console.warn('[TITLE] Generation error:', e instanceof Error ? e.message : e);
      return null;
    }
  }

  /** Extract @mentions from text and resolve against available conversation agents */
  private extractMentionedAgents(text: string, availableAgents: AgentModel[]): AgentModel[] {
    try {
      if (typeof text !== 'string' || text.length === 0) return [];
      // Structured agent mentions emitted by the client composer.
      // Format: <@a:AGENT_SLUG>
      //
      // IMPORTANT:
      // - User mentions are emitted as <@u:USER_SLUG> and must NEVER trigger agent execution.
      // - Legacy plain-text parsing (e.g. @slug / @name / @all) is intentionally unsupported.
      const tokenRe = /<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi;
      const tokenMatches = Array.from(text.matchAll(tokenRe));
      if (tokenMatches.length === 0) return [];

      const bySlug = new Map<string, AgentModel>();
      for (const a of availableAgents) {
        const slug = String(a.slug || '').trim();
        if (slug) bySlug.set(slug, a);
      }
      const seen: Set<string> = new Set();
      const out: AgentModel[] = [];
      for (const m of tokenMatches) {
        const slug = String(m[1] || '').trim();
        if (!slug) continue;
        const agent = bySlug.get(slug);
        if (!agent) continue;
        const agentId = String(agent.id || '').trim();
        if (!agentId) continue;
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        out.push(agent);
      }
      return out;
    } catch (err) {
      console.error('[ConversationService] Failed to resolve agents from conversation mentions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

}
