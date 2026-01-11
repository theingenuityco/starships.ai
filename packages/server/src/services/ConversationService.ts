import { MessageService } from '@/services/MessageService';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { ConnectorSecretService } from '@/services/ConnectorSecretService';
import { UsageService } from '@/services/UsageService';
import { AttachmentService } from '@/services/AttachmentService';
import { Agent, AutopilotEvent, ExecutionItemUtils, ChildProcessRunner, RunnerFactory } from '@starships/autopilot';
import type {
  ToolParams,
  AgentParams,
  ExecutionEvent,
  LLMEvent,
  Execution,
  LlmToolCall,
  LlmMessage,
  EngineConfig,
} from '@starships/autopilot';
import { NotFoundError, ConflictError } from '@starships/errors';
import { ConversationRepository, AgentRepository, TurnRepository, LlmModelRepository } from '@starships/models';
import {
  AgentModel,
  ConversationModel,
  ConversationStatus,
  Message,
  MessageModel,
  StarshipModel,
  ConversationStreamEvent,
  ConversationStreamUIAction,
} from '@starships/protocol';
import type { ContentBlock, MessageContent } from '@starships/protocol';
import { isTextFile, MAX_TEXT_FILE_SIZE } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import OpenAI from 'openai';
import type { Runner } from '@starships/autopilot';
import { BillingService } from '@/services/BillingService';
import { StarshipTurnLeaseService } from '@/services/StarshipTurnLeaseService';
import { WalletService } from '@/services/WalletService';
import { BalanceValidationService } from '@/services/BalanceValidationService';
import { parse, Allow } from 'partial-json-parser';
import { parsePartialJSONObject } from '../utils/PartialJson';
import { fetchTextFromS3 } from '@/utils/s3-helper';
// Connector runtime (http_request.connector) removed in v2; connector_action uses template+session bundles.
import { AgentService } from '@/services/AgentService';
import {
  resolvePlugins,
  mergeConversationState,
  extractPersistableState as extractPersistableStateUtil,
  hasPlugins,
} from '@/utils/conversation-state';
import type { ConversationState, AgentState } from '@starships/protocol';

/**
 * Autopilot child process configuration
 */
interface AutopilotConfig {
  memoryLimitMB: number;
  timeoutMs: number;
  killGraceMs: number;
}

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
  private static instance: ConversationService | null = null;
  private conversationRepository!: ConversationRepository;
  private agentRepository!: AgentRepository;
  private messageService!: MessageService;
  private turnRepository!: TurnRepository;
  private streamBus!: ConversationStreamBus;
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
  private billingService!: BillingService;
  private walletService!: WalletService;
  // Auto-stop guards for low balance
  private lowBalanceStopTriggered: Set<string> = new Set();
  private lastLowBalanceCheckAt: Map<string, number> = new Map();
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
  // Track which agent is currently producing streamed content for a conversation (for attribution)
  private currentAgentForConversation: Map<string, { id: string; name: string }> = new Map();
  // LLM model catalog repository (for pricing/context metadata)
  private llmModelRepository!: LlmModelRepository;
  // Best-effort in-memory pricing cache to avoid DB reads on every turn
  private static modelPricingCache: Map<
    string,
    { promptPerToken?: number; completionPerToken?: number; request?: number; expiresAt: number }
  > = new Map();
  // Default runner for non-streaming paths (child process)
  private defaultRunner!: Runner;

  // connector_action bundles are built per-request (requires authUserId)

  // Autopilot configuration
  private static readonly AUTOPILOT_CONFIG: AutopilotConfig = {
    memoryLimitMB: 256, // 256MB memory limit
    timeoutMs: 600000, // 10 minute timeout
    killGraceMs: 5000, // 5 second grace period
  };

  constructor() {
    // Enforce singleton to share in-memory streaming buffers across routes/requests
    if (ConversationService.instance) {
      return ConversationService.instance;
    }
    this.conversationRepository = new ConversationRepository();
    this.agentRepository = new AgentRepository();
    this.messageService = new MessageService();
    this.turnRepository = new TurnRepository();
    this.llmModelRepository = new LlmModelRepository();
    this.streamBus = ConversationStreamBus.getInstance();
    this.connectorSecretService = new ConnectorSecretService();
    this.usageService = new UsageService();
    this.billingService = new BillingService();
    this.walletService = new WalletService();

    // Choose default runner based on whether a remote runner is configured.
    // When RUNNER_URL is set, server startup configures autopilot.setRunnerConfig({ url, token })
    // and RunnerFactory will return a RemoteRunner. Otherwise we use a child process
    // runner with local isolation and limits.
    if (process.env.RUNNER_URL) {
      this.defaultRunner = RunnerFactory.getTopLevelRunner(0);
    } else {
      this.defaultRunner = new ChildProcessRunner(ConversationService.AUTOPILOT_CONFIG);
    }

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
    const best = (Array.isArray(routes) && routes.length > 0 ? routes[0] : null) as
      | { pricing?: Record<string, unknown> | null }
      | null;
    const pricing = best?.pricing ?? null;

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
      const event: ConversationStreamEvent =
        kind === 'content'
          ? {
              type: 'assistant.delta',
              data: {
                conversationId,
                turnId,
                messageId,
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
    this.streamingReasoning.delete(conversationId);
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

    // Balance guards and suppression flags
    this.lowBalanceStopTriggered.delete(conversationId);
    this.lastLowBalanceCheckAt.delete(conversationId);
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

    // Turn identity + sequencing (safe to clear only once turn is definitively finished)
    this.currentTurnId.delete(conversationId);
    this.currentTurnBaseIndex.delete(conversationId);
    this.lastPersistedIndex.delete(conversationId);

    // Per-turn persistence guards (no longer needed once the turn is complete/failed)
    this.assistantPersistedThisTurn.delete(conversationId);
    this.activeStreamPersisted.delete(conversationId);

    // Also ensure we don't keep any outstanding cancellation handles around
    ConversationService.activeCancellations.delete(conversationId);
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
        this.streamingReasoning.delete(conversationId);
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

  /**
   * Create a new conversation
   */
  async createConversation(
    data: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'> & { starshipId: string; agentId?: string }
  ): Promise<ConversationModel> {
    let conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
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

    // If this is a child conversation linked to a parent, emit a UI action on the parent's stream
    try {
      if (conversation.parentConversationId) {
        const payload: ConversationStreamUIAction['data'] = {
          __ui_action: 'child_conversation_created',
          parentConversationId: conversation.parentConversationId,
          childConversationId: conversation.id,
          starshipId: conversation.starshipId,
        };
        await this.streamBus.publish(conversation.parentConversationId, {
          type: 'ui_action',
          data: payload,
        } as ConversationStreamEvent);
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
   * Auto-stop an active turn when wallet balance drops below minimum threshold.
   * Returns true if a stop was triggered.
   */
  private async maybeAutoStopForLowBalance(conversationId: string): Promise<boolean> {
    try {
      // Avoid repeat stops in the same turn
      if (this.lowBalanceStopTriggered.has(conversationId)) {
        return false;
      }

      // Throttle balance checks to at most once per second per conversation
      const now = Date.now();
      const last = this.lastLowBalanceCheckAt.get(conversationId) ?? 0;
      if (now - last < 250) {
        return false;
      }
      this.lastLowBalanceCheckAt.set(conversationId, now);

      const starship = await this.getConversationStarship(conversationId);
      if (!starship) return false;

      // Load wallet and validate against centralized threshold
      const wallet = await this.walletService.getByStarshipId(starship.id);
      if (!wallet) return false;

      const validation = BalanceValidationService.validateBalance({
        id: wallet.id,
        balance: wallet.balance,
      });

      if (!validation.isValid) {
        // Mark as triggered before broadcasting to de-dup system messages
        this.lowBalanceStopTriggered.add(conversationId);

        // Best-effort: inline system message for clear CTA in chat
        try {
          const sys = await this.messageService.createMessage({
            conversationId,
            role: 'system',
            content: 'Insufficient balance. Add credits from Billing to continue.',
            messageType: 'error',
          });
          try {
            await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: sys } });
            await this.streamBus.publish(conversationId, { type: 'ui_action', data: { __ui_action: 'insufficient_balance' } });
          } catch (err) {
            console.error('[ConversationService] Failed to publish insufficient balance messages', {
              error: err instanceof Error ? err.message : String(err),
              conversationId,
            });
          }
        } catch (err) {
          console.error('[ConversationService] Failed to emit system message', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
          });
        }

        // Trigger stop pipeline (cancel runner, persist partials, finalize SSE)
        try {
          await this.stopConversation(conversationId);
        } catch (err) {
          console.warn('[STOP] Auto-stop due to low balance failed', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;
      }
    } catch (e) {
      console.warn('[BALANCE] Auto-stop check failed', {
        conversationId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return false;
  }

  /**
   * Get deployed tool instances with their actual blueprints for the agent
   * Uses relationship-based tool resolution for accurate results
   */
  private async getAgentTools(agentId: string, starshipId: string): Promise<ToolParams[]> {
    try {
      const redactedBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Redacted tool blueprint start', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'Redacted tool blueprint end', parameters: {} },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
        metadata: { generatedBy: 'Tool.blueprintRedacted' },
      };

      // Use relationship-based approach: Agent-[:USES_TOOL]->Tool-[:DEPLOYED_ON]->Starship
      const deployedTools = await this.agentRepository.getAgentTools(agentId, starshipId);

      if (deployedTools.length === 0) {
        return [];
      }

      // Convert ToolModel instances to ToolParams with their actual blueprints
      // Filter out draft tools (status='draft') as they don't have complete parameters/blueprint
      const toolParams: ToolParams[] = deployedTools
        .filter((tool) => tool.status !== 'draft' && tool.parameters)
        .map((tool) => ({
          name: tool.name,
          slug: tool.slug,
          description: tool.description,
          parameters: tool.parameters!,
          // IMPORTANT: Tools are executed server-side; do not embed tool blueprints/transforms/mutations/condition in agent state.
          // Provide a minimal placeholder blueprint for ToolParams compatibility.
          blueprint: redactedBlueprint as ToolParams['blueprint'],
        }));

      return toolParams;
    } catch (error) {
      console.error(`[CONVERSATION-SERVICE] Error getting agent tools via relationships:`, error);
      return [];
    }
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
  ): unknown[] | undefined {
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

    // Load attachments with presigned URLs (1 minute expiry, secured)
    const attachmentService = new AttachmentService();
    const attachments = await attachmentService.getAttachments(message.attachmentIds, starshipId);

    // Build content blocks - text first, then attachments
    const contentBlocks: ContentBlock[] = [{ type: 'text', text: message.content }];

    // Add attachment blocks based on type
    for (const attachment of attachments) {
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
            textBlock.text += `\n\n--- Content of ${attachment.filename} ---\n${truncatedContent}\n--- End of ${attachment.filename} ---`;
          }
        } catch (err) {
          console.error(`Failed to fetch text file ${attachment.filename}:`, err);
          // Continue without the file content (non-blocking error)
          const textBlock = contentBlocks[0];
          if (textBlock.type === 'text') {
            textBlock.text += `\n\n[Note: Could not load content of ${attachment.filename}]`;
          }
        }
      }
    }

    return contentBlocks;
  }

  async addConversationMessage(
    data: Message & {
      conversationId: string;
      attachmentIds?: string[];
      // OpenRouter image generation (optional, per message)
      modalities?: Array<'image' | 'text'>;
      imageConfig?: Record<string, unknown>;
    },
    ctx?: { authContext?: { userId: string; agentId?: string; starshipId?: string } },
    opts?: { preCreatedUserMessage?: MessageModel; turnLeaseId?: string }
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
    const turnActive =
      conversationStateCheck?.state &&
      typeof conversationStateCheck.state === 'object' &&
      (conversationStateCheck.state as { turnActive?: boolean }).turnActive === true;

    if (turnActive) {
      // Remove placeholder since we're blocking
      ConversationService.activeCancellations.delete(data.conversationId);
      throw new ConflictError(
        'A turn is already in progress for this conversation. Please wait for the current response to complete before sending another message.'
      );
    }

    // Create a DB-backed turn record first. This is the idempotency boundary for this run.
    const turn = await this.turnRepository.createTurn({ conversationId: data.conversationId, status: 'active' });
    this.currentTurnId.set(data.conversationId, turn.id);

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

    // Publish turn start + user message (server-authoritative) to the shared stream.
    try {
      const at = new Date().toISOString();
      await this.streamBus.publish(data.conversationId, {
        type: 'turn.started',
        data: { conversationId: data.conversationId, turnId: turn.id, at },
      });
      await this.streamBus.publish(data.conversationId, {
        type: 'turn.status',
        data: { conversationId: data.conversationId, turnId: turn.id, status: 'active', at },
      });
      await this.streamBus.publish(data.conversationId, {
        type: 'message.append',
        data: { conversationId: data.conversationId, message: userMessage },
      });
    } catch (e) {
      console.warn('[STREAM] Failed to publish initial turn/message events', e);
    }

    // Attempt early title generation before agent gating (so missing agent link doesn't block title updates)
    try {
      const convo = await this.getConversationById(data.conversationId);
      if (convo) {
        const t = (convo.title || '').trim().toLowerCase();
        const needs = !t || t === 'new conversation' || t.startsWith('chat with ');

        if (needs) {
          const star = await this.getConversationStarship(data.conversationId);
          if (star) {
            const gen = await this.generateConversationTitle(star.id, convo.id, data.content);
            if (gen && gen.trim()) {
              await this.conversationRepository.update(convo.id, { title: gen.trim(), updatedAt: new Date().toISOString() });
              try {
                await this.streamBus.publish(convo.id, {
                  type: 'ui_action',
                  data: { __ui_action: 'conversation_title_updated', conversationId: convo.id, title: gen.trim() },
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

    const conversationAgents = await this.getConversationAgents(data.conversationId);
    if (conversationAgents.length < 1) {
      throw new NotFoundError('Agent', `for Conversation ${data.conversationId}`);
    }
    // Build initial target agents from @mentions in the incoming message; fallback to first agent
    // Resolve against starship agents and auto-link any newly mentioned agents
    const starship = await this.getConversationStarship(data.conversationId);
    if (!starship) {
      throw new NotFoundError('Starship', 'for conversation');
    }
    const allStarshipAgents = await this.agentRepository.findByStarship(starship.id);
    const initialTargetsUnlinked = this.extractMentionedAgents(data.content, allStarshipAgents);
    // Auto-link mentioned agents not yet linked
    for (const a of initialTargetsUnlinked) {
      if (!conversationAgents.find((x) => x.id === a.id)) {
        await this.conversationRepository.linkToAgent(data.conversationId, a.id);
      }
    }
    const initialTargets =
      initialTargetsUnlinked.length > 0 ? initialTargetsUnlinked : this.extractMentionedAgents(data.content, conversationAgents);
    const agentQueue: AgentModel[] = initialTargets.length > 0 ? initialTargets.slice() : [conversationAgents[0]];
    const processedAgents: Set<string> = new Set();
    const maxHops = 5; // prevent infinite handoffs per turn
    let hops = 0;

    const conversation = await this.getConversationById(data.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', data.conversationId);
    }

    // (late title generation block removed; handled early)

    // Get conversation messages from database
    let messages = await this.getConversationMessages(data.conversationId);

    // Load conversation state for context - reload conversation to get latest state
    const latestConversation = await this.getConversationById(data.conversationId);
    const conversationState = (latestConversation?.state || {}) as Record<string, unknown>;

    // Enable complete suppression during orchestration; we will emit a single 'complete' at the end
    this.suppressCompleteFor.add(data.conversationId);

    try {
      // starship already resolved above

      const env = getEnvConfig();

      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: starship.id,
        CONVERSATION_ID: data.conversationId,
        // Used by internal Starships connector templates like:
        // {{ String(runtimeEnv.SERVER_URL ?? "") + "/api/v1" }}
        SERVER_URL: env.SERVER_URL,
      };

      // Build connector/LLM runtime config ONCE for this turn (reused across agent hops).
      const authUserId = ctx?.authContext?.userId ?? (conversation as { userId?: string }).userId;
      if (!authUserId) {
        throw new Error('Missing authUserId for connector_action session build');
      }
      const { engineConfig: baseEngineConfig } = await buildAutopilotExecutionBundle({
        starshipId: starship.id,
        authUserId,
        runtimeEnv,
      });

      // Orchestrate sequentially without dynamic mention-based handoffs
      while (agentQueue.length > 0 && hops < maxHops) {
        const agentModel = agentQueue.shift()!;
        if (processedAgents.has(agentModel.id)) {
          continue;
        }
        processedAgents.add(agentModel.id);
        hops += 1;

        // Expose current agent id to the blueprint via env("AGENT_ID")
        (runtimeEnv as EngineConfig & { AGENT_ID?: string }).AGENT_ID = agentModel.id;

        // Guard against NULL/undefined persisted JSONB state
        const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

        // Get deployed tools for this agent (always redacted; server executes tools)
        const resolvedTools = await this.getAgentTools(agentModel.id, starship.id);

        // Resolve plugins from conversation state only (agent plugins ignored)
        const plugins = this.resolvePlugins(
          conversationState as Record<string, unknown> | undefined,
          baseState as Record<string, unknown> | undefined
        );

        // Exclude plugins from baseState and conversationState - plugins are set explicitly from resolvePlugins
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { plugins: _agentPlugins, ...baseStateWithoutPlugins } = baseState as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { plugins: _conversationPlugins, ...conversationStateWithoutPlugins } = conversationState as Record<string, unknown>;

        const agentWithTools: AgentParams = {
          ...agentModel,
          // Always use the server-tools blueprint (no legacy tool-node execution).
          blueprint: Agent.defaultAgentBlueprintServerTools(),
          state: {
            ...baseStateWithoutPlugins,
            ...conversationStateWithoutPlugins,
            tools: resolvedTools,
            starshipId: starship.id,
            // Explicitly set plugins from resolvePlugins (conversation-level only)
            // If plugins is undefined, omit it (no plugins enabled)
            ...(plugins !== undefined ? { plugins } : {}),
          },
        };

        // Prepare input messages snapshot for this agent (with multimodal content support)
        const llmMessages: LlmMessage[] = await Promise.all(
          messages.map(async (msg): Promise<LlmMessage> => {
            // Build multimodal content if message has attachments
            const content = await this.buildMessageContent(msg, starship.id);

            const baseMessage: LlmMessage = {
              role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
              content,
              ...(msg.reasoning ? { reasoning: msg.reasoning } : {}),
            };
            if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
              (baseMessage as LlmMessage).toolCalls = msg.toolCalls as unknown as LlmToolCall[];
            }
            if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
              (baseMessage as LlmMessage).toolCallId = msg.toolCallId;
            }
            return baseMessage;
          })
        );
        // input not required; execution.state messages are set directly

        // Attribute streamed content to the current agent
        this.currentAgentForConversation.set(data.conversationId, { id: agentModel.id, name: agentModel.name });

        const engineConfig = {
          ...(baseEngineConfig as object),
          eventCallback: (event: AutopilotEvent) => this.eventCallback(data.conversationId, event),
        } as EngineConfig & Record<string, unknown>;

        // Optional per-turn multimodal output configuration (OpenRouter image generation):
        // Agent.execute merges params.state into execution.state, so attach to agent params.state BEFORE construction.
        if (Array.isArray(data.modalities) && data.modalities.length > 0) {
          (agentWithTools.state as AgentState & { modalities?: unknown[] }).modalities = data.modalities;
        }
        if (data.imageConfig && typeof data.imageConfig === 'object') {
          (agentWithTools.state as AgentState & { imageConfig?: Record<string, unknown> }).imageConfig = data.imageConfig;
        }

        const agent = new Agent(agentWithTools, {
          eventCallback: (event) => this.eventCallback(data.conversationId, event),
          runtimeEnv,
          // Ensure ConversationService can still choose isolation strategy (child vs remote) and support cancellation.
          runner: this.defaultRunner,
          runnerConfig: engineConfig as unknown as Record<string, unknown>,
          onCancel: (cancel) => {
            ConversationService.activeCancellations.set(data.conversationId, cancel);
          },
        });

        // Execute the agent. Provide the full conversation snapshot as input so Agent.execute can
        // construct the correct ordered message list (systemPrompt -> memory -> conversation).
        await agent.execute(ExecutionItemUtils.wrapSingle(llmMessages));

        // Clear cancellation handle after completion
        ConversationService.activeCancellations.delete(data.conversationId);

        // Refresh messages after this agent's turn so subsequent agents (if any)
        // see the updated conversation state, but do not perform mention-based handoffs
        messages = await this.getConversationMessages(data.conversationId);
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
        const latestTurnId =
          this.currentTurnId.get(conversationId) ||
          (await this.turnRepository.findLatestByConversationId(conversationId).then((t) => (t?.id ? t.id : null)).catch(() => null)) ||
          null;
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

        await this.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'active', at } });
      } catch (err) {
        console.warn('[ConversationService] Failed to publish resume turn.status=active', {
          conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Load latest persisted conversation messages and convert to LlmMessage array
      const messages = await this.getConversationMessages(conversationId);
      const llmMessages: LlmMessage[] = await Promise.all(
        messages.map(async (msg): Promise<LlmMessage> => {
          const content = await this.buildMessageContent(msg, starship.id);
          const baseMessage: LlmMessage = {
            role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
            content,
            ...(msg.reasoning ? { reasoning: msg.reasoning } : {}),
          };
          if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            (baseMessage as LlmMessage).toolCalls = msg.toolCalls as unknown as LlmToolCall[];
          }
          if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
            (baseMessage as LlmMessage).toolCallId = msg.toolCallId;
          }
          return baseMessage;
        })
      );

      const env = getEnvConfig();

      const runtimeEnv = {
        STARSHIP_ID: starship.id,
        CONVERSATION_ID: conversationId,
        AGENT_ID: agentModel.id,
        // Used by internal Starships connector templates like:
        // {{ String(runtimeEnv.SERVER_URL ?? "") + "/api/v1" }}
        SERVER_URL: env.SERVER_URL,
      };

      // Load conversation-level state context (if any)
      const conversationState = (conversation.state && typeof conversation.state === 'object' ? conversation.state : {}) as Record<
        string,
        unknown
      >;

      // Resolve tools for this agent (always redacted; server executes tools)
      const resolvedTools = await this.getAgentTools(agentModel.id, starship.id);

      // Guard against NULL/undefined persisted JSONB state
      const baseState =
        agentModel.state && typeof agentModel.state === 'object'
          ? (agentModel.state as Record<string, unknown>)
          : ({ messages: [], tools: [] } as AgentState);

      // Resolve plugins from conversation state only (agent plugins ignored)
      const plugins = this.resolvePlugins(conversationState as ConversationState | undefined, baseState as AgentState | undefined);

      // Exclude plugins from baseState and conversationState - plugins are set explicitly from resolvePlugins
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { plugins: _agentPluginsContinue, ...baseStateWithoutPlugins } = baseState;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { plugins: _conversationPluginsContinue, ...conversationStateWithoutPlugins } = conversationState;

      const agentWithTools: AgentParams = {
        ...(agentModel as Partial<AgentParams>),
        // Always use the server-tools blueprint (no legacy tool-node execution).
        blueprint: Agent.defaultAgentBlueprintServerTools(),
        state: {
          ...baseStateWithoutPlugins,
          ...conversationStateWithoutPlugins,
          tools: resolvedTools,
          starshipId: starship.id,
          // Explicitly set plugins from resolvePlugins (conversation-level only)
          // If plugins is undefined, omit it (no plugins enabled)
          ...(plugins !== undefined ? { plugins } : {}),
        },
      } as unknown as AgentParams;

      // Build connector/LLM runtime config (same bundle as normal agent execution)
      const authUserId = ctx?.authContext?.userId ?? (conversation as { userId?: string }).userId;
      if (!authUserId) {
        throw new Error('Missing authUserId for connector_action session build');
      }
      const { engineConfig: baseEngineConfig } = await buildAutopilotExecutionBundle({
        starshipId: starship.id,
        authUserId,
        runtimeEnv,
      });

      const engineConfig = {
        ...(baseEngineConfig as object),
        eventCallback: (event: AutopilotEvent) => this.eventCallback(conversationId, event),
      } as EngineConfig & Record<string, unknown>;

      this.currentAgentForConversation.set(conversationId, { id: agentModel.id, name: agentModel.name });

      const agent = new Agent(agentWithTools, {
        eventCallback: (event) => this.eventCallback(conversationId, event),
        runtimeEnv,
        runner: this.defaultRunner,
        runnerConfig: engineConfig as unknown as Record<string, unknown>,
        onCancel: (cancel) => {
          ConversationService.activeCancellations.set(conversationId, cancel);
        },
      });

      await agent.execute(ExecutionItemUtils.wrapSingle(llmMessages));
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
   * Stop current turn: cancel runner, persist partial content/reasoning (omit tool_calls), finalize SSE.
   */
  async stopConversation(conversationId: string): Promise<void> {
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
      if (latest) {
        const starship = await this.getConversationStarship(conversationId);
        if (starship) {
          const promptTokens = Number(latest.promptTokens || 0);
          const completionTokens = Number(latest.completionTokens || 0);
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
            totalTokens: Number(latest.totalTokens || 0),
            cost: Number(computedCost ?? 0),
            ...(latest.model ? { model: latest.model } : {}),
          });
          // Credits system: usage rows are analytics only; do not debit wallet based on token usage.
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
      const convo = await this.getConversationById(conversationId);
      const prev = (convo?.state as ConversationState | undefined) || {};
      await this.conversationRepository.update(conversationId, {
        state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
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
        '- Capture the main user intent/topic from the first message.',
        '- Avoid quotes, emojis, and personal data. Keep under 60 characters.',
      ].join('\n');

      const prompt = `User message: "${String(userContent || '')
        .replace(/\n+/g, ' ')
        .slice(0, 400)}"\n\nReturn only the title text.`;

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
          const computedCost = providerCost !== undefined
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
      // Mentions:
      // - Plain: @slug_or_name (no spaces)
      // - Quoted: @"Display Name With Spaces"
      // - Bracketed: @[Display Name With Spaces]
      // - Special: @all
      const mentionRe = /@(?:"([^"\n]{1,100})"|\[([^\]\n]{1,100})\]|(all)|([a-z0-9._-]{1,100}))/gi;
      const seen: Set<string> = new Set();
      const out: AgentModel[] = [];

      const normalize = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, '').replace(/[_.-]/g, '');
      type Entry = { id: string; agent: AgentModel; nameKey: string; slugKey: string };
      const entries: Entry[] = availableAgents.map((a) => ({
        id: a.id,
        agent: a,
        nameKey: normalize((a as { name?: string }).name || ''),
        slugKey: normalize((a as { slug?: string }).slug || ''),
      }));

      let m: RegExpExecArray | null;
      const resolvedLog: Array<{ raw: string; matchedId?: string; strategy?: string }> = [];
      while ((m = mentionRe.exec(text)) !== null) {
        const token = (m[1] || m[2] || m[3] || m[4] || '').toLowerCase();
        const raw = token;
        if (!raw) continue;
        if (raw === 'all') {
          for (const a of availableAgents) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              out.push(a);
            }
          }
          resolvedLog.push({ raw, strategy: 'all' });
          continue;
        }
        const key = raw.replace(/\s+/g, '').replace(/[_.-]/g, '');
        // 1) Exact match on name or slug
        let candidates = entries.filter((e) => e.nameKey === key || e.slugKey === key);
        let chosen: Entry | undefined = undefined;
        let strategy = 'exact';
        if (candidates.length === 1) {
          chosen = candidates[0];
        }
        // 2) Prefix match if not found
        if (!chosen) {
          candidates = entries.filter((e) => e.nameKey.startsWith(key) || e.slugKey.startsWith(key));
          if (candidates.length === 1) {
            chosen = candidates[0];
            strategy = 'prefix';
          } else if (candidates.length > 1) {
            // choose shortest key length for better specificity
            chosen = candidates.sort(
              (a, b) => Math.min(a.nameKey.length, a.slugKey.length) - Math.min(b.nameKey.length, b.slugKey.length)
            )[0];
            strategy = 'prefix-heuristic';
          }
        }
        // 3) Contains match
        if (!chosen) {
          candidates = entries.filter((e) => e.nameKey.includes(key) || e.slugKey.includes(key));
          if (candidates.length === 1) {
            chosen = candidates[0];
            strategy = 'contains';
          } else if (candidates.length > 1) {
            chosen = candidates.sort(
              (a, b) => Math.min(a.nameKey.length, a.slugKey.length) - Math.min(b.nameKey.length, b.slugKey.length)
            )[0];
            strategy = 'contains-heuristic';
          }
        }
        if (chosen && !seen.has(chosen.id)) {
          seen.add(chosen.id);
          out.push(chosen.agent);
          resolvedLog.push({ raw, matchedId: chosen.id, strategy });
        } else {
          resolvedLog.push({ raw });
        }
      }

      return out;
    } catch (err) {
      console.error('[ConversationService] Failed to resolve agents from conversation mentions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async eventCallback(conversationId: string, event: AutopilotEvent): Promise<void> {
    // Skip workflow/node control events from nested executions (depth>0) to avoid duplicates
    if (
      event.type === 'workflow_started' ||
      event.type === 'workflow_completed' ||
      event.type === 'workflow_failed' ||
      event.type === 'workflow_paused' ||
      event.type === 'workflow_resumed' ||
      event.type === 'node_started' ||
      event.type === 'node_completed' ||
      event.type === 'node_failed'
    ) {
      const depthRoot = event.executionDepth ?? 0;
      if (depthRoot > 0) {
        // Skip these events from nested workflows (depth > 0) to prevent duplication
        return;
      }
    }

    switch (event.type) {
      case 'workflow_started': {
        // Defer placeholder creation until first content_chunk to avoid empty duplicate assistant messages.
        // streamingContent accumulator will be initialized on first chunk if needed.
        this.streamingContent.delete(conversationId);
        // Use the DB-backed turn id as the stable generation id for resume/idempotency.
        const turnId = this.currentTurnId.get(conversationId) || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.generationId.set(conversationId, turnId);
        this.accumulatedLength.set(conversationId, 0);
        this.placeholderEmitted.set(conversationId, false);
        this.ringBuffer.set(conversationId, []);
        this.snapshotPreferred.delete(conversationId);
        this.toolCallSeq.delete(conversationId);
        // CRITICAL FIX: Reset position counter at start of new turn
        this.nextChunkPosition.set(conversationId, 0);
        // Reset cached usage for the new turn
        this.latestStreamingUsage.delete(conversationId);
        this.streamingToolCalls.delete(conversationId);
        this.streamingReasoning.delete(conversationId);
        this.streamingGeneratedAttachmentIds.delete(conversationId);
        this.streamingGeneratedImageUrlSeen.delete(conversationId);
        // Reset per-stream sequence when a new turn begins (will be set on first placeholder)
        this.streamSeq.delete(conversationId);
        // Clear assistant-persisted flag at the start of a new top-level turn
        this.assistantPersistedThisTurn.delete(conversationId);
        // Reset active stream persisted guard for this new turn
        this.activeStreamPersisted.delete(conversationId);
        // Seed message index tracking to the current baseline so prior history isn't re-persisted
        const execEvent = event as ExecutionEvent;
        const execution: Execution | undefined = execEvent.data?.execution;
        const state = execution?.state as { messages?: unknown[] } | undefined;
        const msgs = Array.isArray(state?.messages) ? state.messages : undefined;

        if (msgs) {
          const baselineIndex = msgs.length - 1;
          const offset = this.resumeTurnSeqOffset.get(conversationId) ?? 0;
          // For normal turns offset=0 (first new message → turnSeq=1).
          // For resumed turns offset=maxTurnSeq, so first new message → turnSeq=maxTurnSeq+1.
          this.currentTurnBaseIndex.set(conversationId, baselineIndex - Math.max(0, offset));
          this.lastPersistedIndex.set(conversationId, baselineIndex);
        }

        // One-shot: consume resume offset if present.
        this.resumeTurnSeqOffset.delete(conversationId);

        // Reset streaming assistant message id for the new turn
        this.streamingAssistantMessageId.delete(conversationId);

        // Persist turn_started state (best-effort). Stream events are published when the turn is created.
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as ConversationState | undefined) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: true },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to persist turn_started state', err);
        }

        // Reset per-turn balance enforcement guards and enforce immediately
        this.lowBalanceStopTriggered.delete(conversationId);
        this.lastLowBalanceCheckAt.delete(conversationId);
        try {
          const stoppedAtStart = await this.maybeAutoStopForLowBalance(conversationId);
          if (stoppedAtStart) {
            break;
          }
        } catch (err) {
          console.error('[ConversationService] Failed to check balance auto-stop at workflow start', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
          });
        }

        // Do not clear pending finalization here; previous turn must finish to preserve event ordering
        break;
      }

      case 'workflow_paused': {
        // Persist the current partial assistant message so that reloads include it while paused
        try {
          const persisted = await this.persistActivePartial(conversationId);
          const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
          const at = new Date().toISOString();
          await this.streamBus.publish(conversationId, {
            type: 'turn.status',
            data: { conversationId, turnId, status: 'waiting_for_tools', at },
          });
          if (persisted) {
            await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
          }
        } catch (e) {
          console.warn('[STREAMING] Failed to persist partial on workflow_paused:', e);
        }
        break;
      }

      case 'content_chunk': {
        // Drop nested LLM content streams (depth>0) from conversation timeline
        if ((event.executionDepth ?? 0) > 0) {
          break;
        }

        // CRITICAL FIX: Serialize chunk processing using a lock pattern
        // Wait for previous chunk to complete before starting this one
        const processThisChunk = async () => {
          // Proactively stop mid-turn if balance falls below minimum threshold (throttled)
          try {
            const stopped = await this.maybeAutoStopForLowBalance(conversationId);
            if (stopped) {
              return;
            }
          } catch (err) {
            console.error('[ConversationService] Failed to check balance auto-stop', {
              error: err instanceof Error ? err.message : String(err),
              conversationId,
            });
          }

          // Stream content chunks in real-time (supports both delta.* and message.* providers)
          const chunkContent = (event as LLMEvent).data?.chunk;

          if (chunkContent && Array.isArray(chunkContent.choices) && chunkContent.choices.length > 0) {
            type ChoiceNode = {
              delta?: { content?: unknown; toolCalls?: unknown[]; reasoning?: unknown; thinking?: unknown };
              message?: {
                content?: unknown;
                toolCalls?: unknown[];
                reasoning?: unknown;
                reasoning_details?: unknown;
              };
            };
            const choice0 = (chunkContent.choices[0] || {}) as ChoiceNode;
            const delta = choice0.delta ?? {};
            const messageNode = choice0.message ?? {};
            // Capture provider usage from chunk if present for mid-stream accounting
            try {
              const rawUsage = (chunkContent as { usage?: unknown }).usage as
                | { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown; cost?: unknown }
                | undefined;
              if (rawUsage && typeof rawUsage === 'object') {
                const uRec = rawUsage as Record<string, unknown>;
                const promptTokens = typeof uRec.promptTokens === 'number' ? uRec.promptTokens : 0;
                const completionTokens = typeof uRec.completionTokens === 'number' ? uRec.completionTokens : 0;
                const totalTokens =
                  typeof uRec.totalTokens === 'number' ? uRec.totalTokens : Number(promptTokens) + Number(completionTokens);
                const cost = typeof uRec.cost === 'number' ? uRec.cost : 0;
                const model =
                  typeof (chunkContent as { model?: unknown }).model === 'string'
                    ? ((chunkContent as { model?: string }).model as string)
                    : undefined;
                if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0 || cost > 0) {
                  this.latestStreamingUsage.set(conversationId, {
                    promptTokens: Number(promptTokens || 0),
                    completionTokens: Number(completionTokens || 0),
                    totalTokens: Number(totalTokens || 0),
                    cost: Number(cost || 0),
                    ...(model ? { model } : {}),
                  });
                }
              }
            } catch (err) {
              console.warn('[STREAMING] Failed to capture usage from chunk', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }

            const contentFromDelta =
              typeof (delta as { content?: unknown }).content === 'string' ? ((delta as { content?: unknown }).content as string) : '';
            const contentFromMessage =
              typeof (messageNode as { content?: unknown }).content === 'string'
                ? ((messageNode as { content?: unknown }).content as string)
                : '';
            const hasContent = (contentFromDelta && contentFromDelta.length > 0) || (contentFromMessage && contentFromMessage.length > 0);

            const toolCallsFromDelta: unknown[] = Array.isArray((delta as { toolCalls?: unknown[] }).toolCalls)
              ? ((delta as { toolCalls?: unknown[] }).toolCalls as unknown[])
              : [];
            const toolCallsFromMessage: unknown[] = Array.isArray((messageNode as { toolCalls?: unknown[] }).toolCalls)
              ? ((messageNode as { toolCalls?: unknown[] }).toolCalls as unknown[])
              : [];
            const hasToolCalls = toolCallsFromDelta.length > 0 || toolCallsFromMessage.length > 0;

            // OpenRouter image generation output: delta.images / message.images
            const imagesFromDelta: unknown[] = Array.isArray((delta as { images?: unknown[] }).images)
              ? (delta as { images: unknown[] }).images
              : [];
            const imagesFromMessage: unknown[] = Array.isArray((messageNode as { images?: unknown[] }).images)
              ? (messageNode as { images: unknown[] }).images
              : [];
            const hasImages = imagesFromDelta.length > 0 || imagesFromMessage.length > 0;

            // Extract reasoning from OpenRouter unified fields (reasoning and reasoning_details)
            // IMPORTANT: Many providers send BOTH a cumulative snapshot (reasoning.content) AND token deltas (reasoning.tokens).
            // Concatenating both will double the text. Prefer a single source in priority order:
            // 1) reasoning_details (structured), else 2) reasoning.tokens (incremental), else 3) reasoning.content/text/string.
            const extractReasoning = (node: unknown): string => {
              try {
                if (!node || typeof node !== 'object') return '';
                const rec = node as Record<string, unknown>;

                // 1) Prefer structured reasoning_details if present
                const details = rec.reasoning_details as unknown;
                if (Array.isArray(details) && details.length > 0) {
                  const parts: string[] = [];
                  for (const d of details as unknown[]) {
                    if (d && typeof d === 'object') {
                      const det = d as Record<string, unknown>;
                      if (det.type === 'reasoning.text' && typeof det.text === 'string' && det.text.length > 0) {
                        parts.push(det.text);
                      }
                    }
                  }
                  if (parts.length > 0) return parts.join('');
                }

                const raw = rec.reasoning as unknown;
                if (!raw) return '';

                const pickText = (obj: unknown): string => {
                  if (!obj) return '';
                  if (typeof obj === 'string') return obj;
                  if (typeof obj !== 'object') return '';
                  const r = obj as Record<string, unknown>;
                  if (typeof r.text === 'string' && r.text.length > 0) return r.text;
                  if (typeof r.content === 'string' && r.content.length > 0) return r.content;
                  return '';
                };

                // 2) If reasoning is an object with tokens, prefer tokens (incremental) and ignore obj.content to avoid duplication
                if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
                  const obj = raw as Record<string, unknown>;
                  const tokens = obj.tokens as unknown;
                  if (Array.isArray(tokens) && tokens.length > 0) {
                    return (tokens as unknown[]).map(pickText).join('');
                  }
                  // Otherwise, use content/text on the object
                  return pickText(obj);
                }

                // 3) If reasoning is an array, join by text/content
                if (Array.isArray(raw)) {
                  return (raw as unknown[]).map(pickText).join('');
                }

                // 4) If reasoning is a string, return as-is
                if (typeof raw === 'string') return raw;

                return '';
              } catch (err) {
                console.error('[ConversationService] Failed to process image URL', {
                  error: err instanceof Error ? err.message : String(err),
                  conversationId,
                });
                return '';
              }
            };
            const reasoningFromDelta = extractReasoning(delta);
            const reasoningFromMessage = extractReasoning(messageNode);
            const hasReasoning =
              (reasoningFromDelta && reasoningFromDelta.length > 0) || (reasoningFromMessage && reasoningFromMessage.length > 0);

            // Initialize per-turn streaming accumulators on first observed content/tool/reasoning/images.
            // We no longer broadcast JSON-Patch placeholders; the client constructs the streaming assistant message
            // from typed delta events.
            if ((hasContent || hasToolCalls || hasReasoning || hasImages) && !this.streamingContent.has(conversationId)) {
              this.streamingContent.set(conversationId, '');
              this.placeholderEmitted.set(conversationId, true);
              this.streamingToolCalls.delete(conversationId);
              this.streamingGeneratedAttachmentIds.set(conversationId, []);
              this.streamingGeneratedImageUrlSeen.set(conversationId, new Set());
              if (!this.ringBuffer.has(conversationId)) this.ringBuffer.set(conversationId, []);
              // Streaming assistant message id is deterministic per turn for client-side reconciliation.
              const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
              this.streamingAssistantMessageId.set(conversationId, `stream-${turnId}`);
            }

            // Process generated images (OpenRouter: images[].image_url.url is a data URL)
            if (hasImages) {
              const all = [...imagesFromDelta, ...imagesFromMessage];
              const urls: string[] = [];
              for (const raw of all) {
                if (!raw || typeof raw !== 'object') continue;
                const rec = raw as Record<string, unknown>;
                // Support both snake_case and camelCase
                const imageUrlNode =
                  (rec.image_url && typeof rec.image_url === 'object' ? (rec.image_url as Record<string, unknown>) : null) ||
                  (rec.imageUrl && typeof rec.imageUrl === 'object' ? (rec.imageUrl as Record<string, unknown>) : null);
                const u = imageUrlNode && typeof imageUrlNode.url === 'string' ? imageUrlNode.url : '';
                if (u && u.startsWith('data:image/')) {
                  urls.push(u);
                }
              }

              if (urls.length > 0) {
                // Ensure tracking containers exist (covers edge case where images arrive before placeholder init)
                if (!this.streamingGeneratedAttachmentIds.has(conversationId)) this.streamingGeneratedAttachmentIds.set(conversationId, []);
                if (!this.streamingGeneratedImageUrlSeen.has(conversationId))
                  this.streamingGeneratedImageUrlSeen.set(conversationId, new Set());

                const seen = this.streamingGeneratedImageUrlSeen.get(conversationId)!;
                const acc = this.streamingGeneratedAttachmentIds.get(conversationId)!;

                // Resolve starship once for uploads
                const starship = await this.getConversationStarship(conversationId);
                if (starship) {
                  const attachmentService = new AttachmentService();

                  for (let idx = 0; idx < urls.length; idx++) {
                    const url = urls[idx];
                    if (seen.has(url)) continue;
                    seen.add(url);

                    const parsed = ConversationService.parseBase64ImageDataUrl(url);
                    if (!parsed) continue;

                    const ext =
                      parsed.mimeType === 'image/png'
                        ? 'png'
                        : parsed.mimeType === 'image/jpeg'
                          ? 'jpg'
                          : parsed.mimeType === 'image/webp'
                            ? 'webp'
                            : 'png';
                    const filename = `generated_${Date.now()}_${idx}.${ext}`;

                    try {
                      const attachment = await attachmentService.createAttachment({
                        starshipId: starship.id,
                        conversationId,
                        filename,
                        mimeType: parsed.mimeType,
                        buffer: parsed.buffer,
                      });

                      acc.push(attachment.id);
                      this.streamingGeneratedAttachmentIds.set(conversationId, acc);
                      // Attachment IDs will be included on the persisted assistant message and delivered via message.append.
                    } catch (err) {
                      console.warn('[STREAMING] Failed to persist generated image attachment', {
                        conversationId,
                        error: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }
                }
              }
            }

            // Process content if present (prefer delta token chunks; fall back to full message content snapshot with diffing)
            if (hasContent) {
              const incremental = contentFromDelta || '';
              const snapshot = contentFromMessage || '';

              // Compute the append text:
              // - If incremental tokens exist, append them directly.
              // - Else if we only have snapshot, append the new suffix beyond what we've already accumulated.
              let append = '';
              if (incremental) {
                append = incremental;
              } else if (snapshot) {
                // Prefer using the whole snapshot with non-overlap normalization
                const baseForSnapshot = this.streamingContent.get(conversationId) || '';
                append = ConversationService.computeNonOverlappingAppend(baseForSnapshot, snapshot);
              }

              if (append) {
                // CRITICAL FIX: Normalize content FIRST to know the chunk length
                const latestBase = this.streamingContent.get(conversationId) || '';
                const normalized = ConversationService.computeNonOverlappingAppend(latestBase, append);

                if (normalized.length === 0) {
                  // Nothing new to append - skip broadcasting
                } else {
                  // CRITICAL FIX: Read and increment position in ONE line to ensure atomicity
                  const chunkPosition = this.nextChunkPosition.get(conversationId) || 0;
                  this.nextChunkPosition.set(conversationId, chunkPosition + normalized.length);

                  // Update content
                  const newContent = latestBase + normalized;
                  this.streamingContent.set(conversationId, newContent);

                  const newLen = (this.accumulatedLength.get(conversationId) || 0) + normalized.length;
                  this.accumulatedLength.set(conversationId, newLen);

                  const rb = this.ringBuffer.get(conversationId) || [];
                  rb.push({ position: chunkPosition, content: normalized, ts: Date.now() });
                  if (rb.length > 200) rb.splice(0, rb.length - 200);
                  this.ringBuffer.set(conversationId, rb);

                  // Publish typed assistant delta (Redis Streams)
                  this.enqueueDelta('content', conversationId, normalized);
                }
              }
            }

            // Process reasoning if present (stream as delta chunks; persist final reasoning on completion)
            if (hasReasoning) {
              const incrementalR = reasoningFromDelta || '';
              const snapshotR = reasoningFromMessage || '';

              const currentR = this.streamingReasoning.get(conversationId) || '';

              let appendR = '';
              if (incrementalR) {
                appendR = incrementalR;
              } else if (snapshotR) {
                appendR = ConversationService.computeNonOverlappingAppend(currentR, snapshotR);
              }

              if (appendR) {
                const normalizedR = ConversationService.computeNonOverlappingAppend(currentR, appendR);
                if (normalizedR.length > 0) {
                  const newR = currentR + normalizedR;
                  this.streamingReasoning.set(conversationId, newR);

                  // Publish typed reasoning delta (Redis Streams)
                  this.enqueueDelta('reasoning', conversationId, normalizedR);
                }
              }
            }

            // Process toolCalls if present (prefer true delta updates; otherwise, broadcast snapshot from message)
            if (hasToolCalls) {
              try {
                if (toolCallsFromDelta.length > 0) {
                  const acc: StreamingToolCallAccum[] = this.streamingToolCalls.get(conversationId) || [];

                  for (const raw of toolCallsFromDelta) {
                    const rawTc = (raw ?? {}) as { index?: number; id?: string; function?: { name?: string; arguments?: unknown } };
                    const idx = typeof rawTc?.index === 'number' ? rawTc.index : 0;

                    // Ensure slot only for the referenced index; do not pre-fill earlier indices
                    if (!acc[idx]) {
                      acc[idx] = { id: undefined, type: 'function', function: { name: undefined, arguments: '' } };
                    }

                    const target = acc[idx];
                    if (rawTc?.id) target.id = rawTc.id;
                    if (rawTc?.function?.name) target.function.name = rawTc.function.name;

                    // Accumulate arguments as string, parse later when complete.
                    // Use non-overlapping append because some providers send cumulative snapshots.
                    if (typeof rawTc?.function?.arguments === 'string') {
                      const base = typeof target.function.arguments === 'string' ? (target.function.arguments as string) : '';
                      const incoming = rawTc.function.arguments as string;
                      const append = ConversationService.computeNonOverlappingAppend(base, incoming);
                      target.function.arguments = base + append;
                    }
                  }

                  this.streamingToolCalls.set(conversationId, acc);

                  // Tool calls are persisted via state/message persistence (node_completed) and published as message.append.
                  // We intentionally do not stream toolCalls as incremental UI deltas in the new protocol.
                  // Note: We parse tool call arguments here but don't use them for streaming (they're persisted on completion).
                } else if (toolCallsFromMessage.length > 0) {
                  // Snapshot toolCalls from message node (no incremental indices)
                  // Parse arguments using partial-json for robustness
                  const normalized: LlmToolCall[] = toolCallsFromMessage.map((raw): LlmToolCall => {
                    const tc = (raw ?? {}) as { id?: string; function?: { name?: string; arguments?: unknown } };
                    const argsStr = typeof tc?.function?.arguments === 'string' ? (tc.function!.arguments as string) : '';
                    let argsObj: unknown = {};
                    if (argsStr) {
                      try {
                        argsObj = parsePartialJSONObject(argsStr);
                      } catch (err) {
                        console.error('[ConversationService] Failed to parse partial JSON for tool call arguments', {
                          error: err instanceof Error ? err.message : String(err),
                          conversationId,
                          argsStr: argsStr?.substring(0, 100),
                        });
                        argsObj = {};
                      }
                    }
                    return {
                      id: tc?.id,
                      type: 'function' as const,
                      function: {
                        name: typeof tc?.function?.name === 'string' ? (tc.function!.name as string) : '',
                        arguments: argsObj, // Store as parsed object for UI
                      },
                    } as LlmToolCall;
                  });

                  // Maintain streaming accumulator with string arguments form
                  const accumFromSnapshot: StreamingToolCallAccum[] = normalized.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.function.name,
                      arguments: (() => {
                        try {
                          return JSON.stringify(tc.function.arguments ?? {});
                        } catch (err) {
                          console.error('[ConversationService] Failed to stringify tool call arguments', {
                            error: err instanceof Error ? err.message : String(err),
                            conversationId,
                          });
                          return '{}';
                        }
                      })(),
                    },
                  }));
                  this.streamingToolCalls.set(conversationId, accumFromSnapshot);

                  // Tool calls are persisted and will be delivered via message.append; no incremental streaming here.
                }
              } catch (err) {
                console.error('[ConversationService] Failed to parse tool calls', {
                  error: err instanceof Error ? err.message : String(err),
                  conversationId,
                });
              }
            }
          }
        };

        // CRITICAL FIX: Chain this chunk after the previous one completes
        const previousLock = this.chunkProcessingLock.get(conversationId) || Promise.resolve();
        const currentLock = previousLock
          .then(() => processThisChunk())
          .catch((err) => {
            console.error('[STREAMING] Chunk processing error:', err);
          });
        this.chunkProcessingLock.set(conversationId, currentLock);

        // Wait for this chunk to complete
        await currentLock;
        break;
      }

      case 'content_complete': {
        // Assistant messages are now persisted via state in node_completed
        // Just track usage here
        if ((event.executionDepth ?? 0) > 0) {
          break;
        }

        // Extract and persist usage
        const llmEvent = event as LLMEvent;
        const llmUsage = llmEvent.data?.usage;
        const model = llmEvent.data?.model;

        const usagePayload = llmUsage
          ? {
              promptTokens: typeof llmUsage.promptTokens === 'number' ? llmUsage.promptTokens : 0,
              completionTokens: typeof llmUsage.completionTokens === 'number' ? llmUsage.completionTokens : 0,
              totalTokens:
                typeof llmUsage.totalTokens === 'number'
                  ? llmUsage.totalTokens
                  : (typeof llmUsage.promptTokens === 'number' ? llmUsage.promptTokens : 0) +
                    (typeof llmUsage.completionTokens === 'number' ? llmUsage.completionTokens : 0),
              cost: this.extractProviderCost(llmUsage),
              ...(typeof model === 'string' ? { model } : {}),
            }
          : (() => {
              const latest = this.latestStreamingUsage.get(conversationId);
              return latest
                ? {
                    promptTokens: Number(latest.promptTokens || 0),
                    completionTokens: Number(latest.completionTokens || 0),
                    totalTokens: Number(latest.totalTokens || 0),
                    cost: typeof latest.cost === 'number' && Number.isFinite(latest.cost) ? latest.cost : undefined,
                    ...(latest.model ? { model: latest.model } : {}),
                  }
                : undefined;
            })();

        if (usagePayload) {
          try {
            const starship = await this.getConversationStarship(conversationId);
            if (starship) {
              const computedCost =
                typeof usagePayload.cost === 'number' && Number.isFinite(usagePayload.cost)
                  ? usagePayload.cost
                  : await this.computeCostFromCatalog({
                      model: typeof usagePayload.model === 'string' ? usagePayload.model : undefined,
                      promptTokens: usagePayload.promptTokens,
                      completionTokens: usagePayload.completionTokens,
                    });
              await this.usageService.createUsageForTurn({
                starshipId: starship.id,
                conversationId,
                promptTokens: usagePayload.promptTokens,
                completionTokens: usagePayload.completionTokens,
                totalTokens: usagePayload.totalTokens,
                cost: Number(computedCost ?? 0),
                model: usagePayload.model,
              });

              // Credits system: usage rows are analytics only; do not debit wallet based on token usage.
              this.latestStreamingUsage.delete(conversationId);
            }
          } catch (e) {
            console.error('[STREAMING] Failed to persist usage record:', e);
          }
        }

        // Do not clear streaming trackers here. We keep accumulators until persistence in
        // node_completed or finalization in workflow_completed, so that stopConversation
        // can persist partials if a cancel happens between content_complete and persistence.

        break;
      }

      case 'node_started': {
        // Node started
        break;
      }

      case 'node_failed': {
        const execEvent = event as ExecutionEvent;
        const execution: Execution | undefined = execEvent?.data?.execution;
        const nodeRef = execution?.currentNodeRef;
        console.error('[STREAMING] Node failed', {
          nodeRef,
          depth: execEvent.executionDepth,
        });
        // Print execution snapshot for diagnosis
        console.error('[STREAMING] Execution snapshot (node_failed)', {
          results: execution?.results?.[0]?.items?.[0],
        });
        break;
      }

      case 'node_completed': {
        // Handle tool node completion - persist tool result messages
        // Also detect UI actions emitted by code/end nodes and forward them to the client via SSE
        try {
          const execEvent = event as ExecutionEvent;
          const execution: Execution | undefined = execEvent?.data?.execution;
          const results = Array.isArray(execution?.results) ? execution.results : [];

          // Walk results from the end to find a JSON payload that declares a UI action
          type UIPayload = { __ui_action: string } & Record<string, unknown>;
          let uiPayload: UIPayload | null = null;
          for (let i = results.length - 1; i >= 0 && !uiPayload; i--) {
            const items = Array.isArray(results[i]?.items) ? results[i].items : [];
            for (let j = items.length - 1; j >= 0 && !uiPayload; j--) {
              const json = items[j]?.json && typeof items[j].json === 'object' ? items[j].json : null;
              if (!json) continue;
              if (json && typeof (json as Record<string, unknown>).__ui_action === 'string') {
                uiPayload = json as UIPayload;
                break;
              }
              const maybeResult = (json as Record<string, unknown>)['result'] as unknown;
              if (
                maybeResult &&
                typeof maybeResult === 'object' &&
                typeof (maybeResult as Record<string, unknown>).__ui_action === 'string'
              ) {
                uiPayload = maybeResult as UIPayload;
                break;
              }
            }
          }

          if (uiPayload && typeof uiPayload.__ui_action === 'string') {
            // Emit structured UI event over SSE; modern clients should listen to 'ui_action'
            // and no longer rely on back-compat assistant messages that duplicate tool_result JSON.
            try {
              await this.streamBus.publish(conversationId, { type: 'ui_action', data: uiPayload });
            } catch (err) {
              console.error('[ConversationService] Failed to publish UI action', {
                error: err instanceof Error ? err.message : String(err),
                conversationId,
              });
            }
          }
        } catch (e) {
          console.warn('[STREAMING] UI action detection failed on node_completed:', e);
        }

        // Detect and persist new messages added to state via mutations
        try {
          const execEvent = event as ExecutionEvent;
          const execution: Execution | undefined = execEvent?.data?.execution;

          if (execution?.state) {
            const stateObj = execution.state as { messages?: LlmMessage[] };
            const stateMessages = Array.isArray(stateObj.messages) ? stateObj.messages : [];

            // Get last persisted index for this conversation
            const lastIndex = this.lastPersistedIndex.get(conversationId) ?? -1;

            // Type guard for state messages coming from Autopilot mutations
            const isStateMsg = (m: unknown): m is LlmMessage => {
              if (!m || typeof m !== 'object') return false;
              const rec = m as Record<string, unknown>;
              return typeof rec.role === 'string' && typeof rec.content === 'string';
            };

            // Only process messages added since last persistence
            for (let i = lastIndex + 1; i < stateMessages.length; i++) {
              const raw = stateMessages[i];

              // Update index immediately to prevent re-processing if node_completed fires again
              this.lastPersistedIndex.set(conversationId, i);

              // Validate message shape
              if (!isStateMsg(raw)) {
                continue;
              }

              const role = raw.role as 'system' | 'user' | 'assistant' | 'tool';

              // Skip system messages (ephemeral, not persisted)
              if (role === 'system') {
                continue;
              }

              try {
                // Treat as canonical LlmMessage after type guard
                const lm = raw as LlmMessage;

                // Read optional toolCallId (canonical only)
                const toolCallId = typeof lm.toolCallId === 'string' ? lm.toolCallId : undefined;

                // For assistant messages, persist toolCalls if present (already canonical from Agent/LLM)
                let toolCalls: LlmToolCall[] | undefined = undefined;
                if (role === 'assistant' && Array.isArray(lm.toolCalls) && lm.toolCalls.length > 0) {
                  toolCalls = lm.toolCalls as LlmToolCall[];
                }

                // Persist the message (assistant or tool)
                const messageType = role === 'tool' ? 'tool_result' : 'agent_response';
                // For assistant messages, include agent attribution
                const agent = role === 'assistant' ? this.currentAgentForConversation.get(conversationId) : undefined;
                const pendingAttachmentIds =
                  role === 'assistant' ? this.streamingGeneratedAttachmentIds.get(conversationId) || [] : ([] as string[]);
                const starship = pendingAttachmentIds.length > 0 ? await this.getConversationStarship(conversationId) : null;

                // Extract string content (LLM responses are always string, not ContentBlock[])
                const contentString =
                  typeof lm.content === 'string' ? lm.content : lm.content[0]?.type === 'text' ? lm.content[0].text : '';

                const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || 'turn';
                const baseIdx = this.currentTurnBaseIndex.get(conversationId) ?? this.lastPersistedIndex.get(conversationId) ?? -1;
                const turnSeq = Math.max(0, i - baseIdx);

                const persistedMsg = await this.messageService.upsertMessageByTurnSlot({
                  conversationId,
                  turnId,
                  turnSeq,
                  role,
                  content: contentString,
                  messageType,
                  ...(toolCallId ? { toolCallId } : {}),
                  ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
                  ...(typeof lm.reasoning === 'string' && lm.reasoning.length > 0 ? { reasoning: lm.reasoning } : {}),
                  ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
                  ...(pendingAttachmentIds.length > 0 ? { attachmentIds: pendingAttachmentIds } : {}),
                });

                // Link generated attachments to the persisted assistant message (best-effort)
                if (role === 'assistant' && pendingAttachmentIds.length > 0 && starship) {
                  try {
                    const attachmentService = new AttachmentService();
                    await Promise.all(
                      pendingAttachmentIds.map((id) => attachmentService.linkToMessage(id, persistedMsg.id, starship.id).catch(() => false))
                    );
                  } catch (err) {
                    console.error('[ConversationService] Failed to link attachments to message', {
                      error: err instanceof Error ? err.message : String(err),
                      conversationId,
                      messageId: persistedMsg.id,
                    });
                  }
                }

                // Mark that an assistant message has been persisted for this turn
                if (role === 'assistant') {
                  // ROOT CAUSE FIX:
                  // We buffer deltas (timer-based) to avoid XADD per token. Without forcing a flush here,
                  // the last buffered assistant.delta can land AFTER this message.append (which already
                  // includes the final content), causing the UI to render the last chunk twice.
                  try {
                    await this.flushPendingDeltas(conversationId);
                  } catch (e) {
                    console.warn('[STREAM] Failed to flush pending deltas before message.append (node_completed)', {
                      conversationId,
                      error: e instanceof Error ? e.message : String(e),
                    });
                  }

                  this.assistantPersistedThisTurn.add(conversationId);
                  // Reset streaming accumulators so subsequent assistant responses in the same turn
                  // get their own placeholder and can be persisted independently
                  this.streamingContent.delete(conversationId);
                  this.streamingReasoning.delete(conversationId);
                  this.streamingToolCalls.delete(conversationId);
                  this.ringBuffer.delete(conversationId);
                  this.streamSeq.delete(conversationId);
                  this.activeStreamPersisted.delete(conversationId);
                  this.streamingGeneratedAttachmentIds.delete(conversationId);
                  this.streamingGeneratedImageUrlSeen.delete(conversationId);
                  // Clear streaming message id so future deltas start a new stream message for subsequent assistant outputs
                  this.streamingAssistantMessageId.delete(conversationId);
                }

                // Publish persisted messages to the shared stream.
                try {
                  await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persistedMsg } });
                } catch (e) {
                  console.warn('[STREAM] Failed to publish message.append', e);
                }
              } catch (persistError) {
                console.error('[STREAMING] Failed to persist state message:', persistError);
              }
            }
          }
        } catch (e) {
          console.warn('[STREAMING] State message persistence failed on node_completed:', e);
        }

        // Persist evolved state back to conversation when node completes
        // IMPORTANT: Merge with existing state to preserve plugins (plugins are conversation-level only, not from execution state)
        try {
          const execEvent = event as ExecutionEvent;
          const execution: Execution | undefined = execEvent?.data?.execution;
          if (execution?.state) {
            const evolvedState = this.extractPersistableState(execution.state);
            if (evolvedState) {
              // Get existing conversation state to preserve plugins
              const existingConversation = await this.getConversationById(conversationId);
              const existingState = (existingConversation?.state || {}) as ConversationState;

              // Merge: preserve plugins from existing state, update other fields from evolved state
              // Plugins are conversation-level only (controlled by UI toggle) and should NEVER be overwritten by execution state
              const mergedState = mergeConversationState(existingState, evolvedState);

              // Explicitly preserve plugins from existing state (plugins are never in evolvedState due to blacklist)
              if (hasPlugins(existingState)) {
                mergedState.plugins = existingState.plugins;
              }

              await this.conversationRepository.update(conversationId, {
                state: mergedState,
                updatedAt: new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.warn('[STREAMING] State persistence failed on node_completed:', e);
        }

        // Other persistence is handled on 'content_complete' to ensure final content is available and avoid race conditions.
        break;
      }

      case 'workflow_completed': {
        // If the workflow ended because a tool approval is required, we must NOT mark the turn as completed.
        // Otherwise, the client will drop "responding" UI during the approval flow and any subsequent resume
        // can be overwritten by a late 'completed' status event.
        try {
          const execEvent = event as ExecutionEvent;
          const execution: Execution | undefined = execEvent?.data?.execution;
          const results = Array.isArray(execution?.results) ? execution!.results : [];

          const isApprovalRequired = (() => {
            for (let i = results.length - 1; i >= 0; i--) {
              const items = Array.isArray(results[i]?.items) ? results[i].items : [];
              for (let j = items.length - 1; j >= 0; j--) {
                const json = items[j]?.json && typeof items[j].json === 'object' ? (items[j].json as Record<string, unknown>) : null;
                if (!json) continue;
                const body = (json['body'] && typeof json['body'] === 'object' ? (json['body'] as Record<string, unknown>) : null) || null;
                const err = body && typeof body['error'] === 'object' ? (body['error'] as Record<string, unknown>) : null;
                const code = err && typeof err['code'] === 'string' ? String(err['code']) : '';
                if (code === 'TOOL_APPROVAL_REQUIRED') return true;
              }
            }
            return false;
          })();

          if (isApprovalRequired) {
            // Persist any in-flight partial so reload shows the latest assistant content (best-effort).
            try {
              const persisted = await this.persistActivePartial(conversationId);
              if (persisted) {
                await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
              }
            } catch {
              /* ignore */
            }

            // Publish waiting_for_tools (Redis Streams)
            try {
              const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
              await this.streamBus.publish(conversationId, {
                type: 'turn.status',
                data: { conversationId, turnId, status: 'waiting_for_tools', at: new Date().toISOString() },
              });
            } catch {
              /* ignore */
            }

            // Persist waiting_for_tools to DB so SSE snapshot reflects the paused state on refresh.
            // Without this, snapshots see 'active' and can inject synthetic `stream-${turnId}` messages.
            try {
              const turnId = this.currentTurnId.get(conversationId);
              if (turnId) {
                await this.turnRepository.updateTurn(turnId, { status: 'waiting_for_tools', completedAt: null });
              }
            } catch {
              /* ignore */
            }

            // CRITICAL: clear streaming message id so resumed deltas don't attach to a stale placeholder id.
            this.streamingAssistantMessageId.delete(conversationId);

            // Mark the turn as NOT actively running while awaiting approval.
            // IMPORTANT: continueAfterToolApproval() must be able to resume from this state.
            try {
              const convo = await this.getConversationById(conversationId);
              const prev = (convo?.state as ConversationState | undefined) || {};
              await this.conversationRepository.update(conversationId, {
                state: { ...prev, turnActive: false },
                updatedAt: new Date().toISOString(),
              });
            } catch {
              /* ignore */
            }

            break;
          }
        } catch {
          // Best-effort detection only; fall through to normal completion behavior.
        }

        // Flush buffered deltas so clients see the final output immediately.
        try {
          await this.flushPendingDeltas(conversationId);
        } catch (e) {
          console.warn('[STREAM] Failed to flush pending deltas on workflow_completed', {
            conversationId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Persist any streamed assistant content (content/reasoning/attachments) if the normal
        // state-based persistence path did not produce an assistant message.
        try {
          const persisted = await this.persistActivePartial(conversationId);
          if (persisted) {
            await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
          }
        } catch (e) {
          console.warn('[STREAM] Failed to persist/publish final streamed assistant message on workflow_completed', {
            conversationId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Mark turn completed (best-effort)
        try {
          const turnId = this.currentTurnId.get(conversationId);
          if (turnId) {
            await this.turnRepository.updateTurn(turnId, { status: 'completed', completedAt: new Date().toISOString() });
          }
        } catch (err) {
          const turnId = this.currentTurnId.get(conversationId);
          console.error('[ConversationService] Failed to update turn status to completed', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
            turnId: turnId || 'unknown',
          });
        }

        // Publish terminal turn status (Redis Streams)
        try {
          const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
          await this.streamBus.publish(conversationId, {
            type: 'turn.status',
            data: { conversationId, turnId, status: 'completed', at: new Date().toISOString() },
          });
        } catch (err) {
          console.warn('[STREAM] Failed to publish completed turn status', err);
        }

        // Persist turn_completed state and notify clients
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as ConversationState | undefined) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to persist turn_completed state', err);
        }

        // Final cleanup now that the workflow turn has fully completed
        this.finalizeTurnState(conversationId);
        break;
      }

      case 'workflow_failed': {
        const execEvent = event as ExecutionEvent;
        const execution: Execution | undefined = execEvent.data?.execution;
        console.error('[STREAMING] Workflow failed:', execution?.results);

        try {
          await this.flushPendingDeltas(conversationId);
        } catch (e) {
          console.warn('[STREAM] Failed to flush pending deltas on workflow_failed', {
            conversationId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Persist any streamed assistant content even on failure (helps explain partial progress on reload).
        try {
          const persisted = await this.persistActivePartial(conversationId);
          if (persisted) {
            await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
          }
        } catch (e) {
          console.warn('[STREAM] Failed to persist/publish streamed assistant message on workflow_failed', {
            conversationId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Create error message
        const errorMessage = await this.messageService.createMessage({
          conversationId,
          role: 'system',
          content: `❌ Workflow failed: ${execEvent.data?.execution?.error || 'Unknown error'}`,
          messageType: 'error',
        });

        // Persist turn failed (best-effort)
        try {
          const turnId = this.currentTurnId.get(conversationId);
          if (turnId) {
            await this.turnRepository.updateTurn(turnId, { status: 'failed', completedAt: new Date().toISOString() });
          }
        } catch (err) {
          const turnId = this.currentTurnId.get(conversationId);
          console.error('[ConversationService] Failed to update turn status to failed', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
            turnId: turnId || 'unknown',
          });
        }

        // Publish error message + terminal turn status
        try {
          const turnId = this.currentTurnId.get(conversationId) || this.generationId.get(conversationId) || conversationId;
          const at = new Date().toISOString();
          await this.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: errorMessage } });
          await this.streamBus.publish(conversationId, {
            type: 'turn.status',
            data: { conversationId, turnId, status: 'failed', at, error: { message: 'Workflow failed' } },
          });
        } catch {
          /* ignore */
        }

        // Persist server-authoritative end-of-turn state (best-effort)
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as ConversationState | undefined) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        } catch {
          /* ignore */
        }

        // Final cleanup after a failed workflow
        this.finalizeTurnState(conversationId);
        break;
      }

      case 'tool_call_detected': {
        // Intentionally no-op:
        // The client conversation UI no longer auto-navigates to builders based on tool calls.
        // Balance enforcement is handled at 'tool_started' (and other execution boundaries).
        break;
      }

      case 'tool_started': {
        // Enforce balance at the moment tool execution starts
        try {
          const stoppedToolStart = await this.maybeAutoStopForLowBalance(conversationId);
          if (stoppedToolStart) {
            break;
          }
        } catch (err) {
          console.error('[ConversationService] Failed to check balance auto-stop during tool_started', {
            error: err instanceof Error ? err.message : String(err),
            conversationId,
          });
        }
        break;
      }

      case 'tool_complete': {
        // Tool completion is now handled via state-based message persistence in node_completed
        // No persistence needed here - messages are added to state via mutations and persisted automatically
        break;
      }

      default:
        break;
    }
  }
}
