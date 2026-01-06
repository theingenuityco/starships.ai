import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { ConnectorSecretService } from '@/services/ConnectorSecretService';
import { UsageService } from '@/services/UsageService';
import { AttachmentService } from '@/services/AttachmentService';
import { Agent, AutopilotEvent, ExecutionItemUtils, ChildProcessRunner, RunnerFactory } from '@starships/autopilot';
import type {
  ToolParams,
  AgentParams,
  ExecutionEvent,
  LLMEvent,
  ToolEvent,
  Execution,
  LlmToolCall,
  LlmMessage,
  EngineConfig,
} from '@starships/autopilot';
import { NotFoundError, ConflictError } from '@starships/errors';
import { ConversationRepository, AgentRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
import type { ContentBlock, MessageContent } from '@starships/protocol';
import { isTextFile, MAX_TEXT_FILE_SIZE } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import OpenAI from 'openai';
import { Operation } from 'fast-json-patch';
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
  private streamingService!: StreamingService;
  // Track active runner cancellation handles per conversation
  private static activeCancellations: Map<string, () => void> = new Map();
  // Track conversations that should be stopped when real cancel is registered
  private static pendingStops: Set<string> = new Set();

  /**
   * Check if a conversation (or its parent) is marked for stop
   * Public method to allow external checks before creating messages
   */
  static isConversationStopped(conversationId: string): boolean {
    return this.pendingStops.has(conversationId);
  }

  /**
   * Clear the stop flag for a conversation
   * Used when a user starts a new turn after stopping
   */
  static clearConversationStop(conversationId: string): void {
    this.pendingStops.delete(conversationId);
  }

  /**
   * Clear pendingStops for a conversation (parent only, not children)
   * Used when a user sends a new message after stopping
   *
   * IMPORTANT: We do NOT clear children's stop state - stopped child conversations
   * should remain stopped. Only the parent is cleared so it can start fresh and
   * create new child conversations if needed.
   */
  async clearConversationStop(conversationId: string): Promise<void> {
    ConversationService.pendingStops.delete(conversationId);
    console.log('[STOP-DEBUG] Cleared pendingStops for conversation', {
      conversationId,
      note: 'Children remain stopped - they should not continue executing',
    });
  }

  // Track turn lease IDs per conversation so we can release them on stop
  private static turnLeases: Map<string, string> = new Map();
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
  // Suppress broadcasting 'complete' for conversations during multi-agent orchestration
  private suppressCompleteFor: Set<string> = new Set();
  // Track if an assistant message has been persisted for the current turn to avoid duplicates on stop
  private assistantPersistedThisTurn: Set<string> = new Set();
  // Track which agent is currently producing streamed content for a conversation (for attribution)
  private currentAgentForConversation: Map<string, { id: string; name: string }> = new Map();
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
    this.streamingService = new StreamingService();
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
   * Clear streaming state for a conversation.
   * @param conversationId - The conversation ID
   * @param options - Optional configuration for selective clearing
   * @param options.preserveLastPersistedIndex - If true, keeps lastPersistedIndex (needed when stopping mid-turn to prevent duplicate persistence)
   */
  private clearStreamingState(conversationId: string, options?: { preserveLastPersistedIndex?: boolean }): void {
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

    // Conditionally clear lastPersistedIndex (preserve when stopping to prevent duplicate persistence)
    if (!options?.preserveLastPersistedIndex) {
      this.lastPersistedIndex.delete(conversationId);
    }

    // Balance guards and suppression flags
    this.lowBalanceStopTriggered.delete(conversationId);
    this.lastLowBalanceCheckAt.delete(conversationId);
    this.suppressCompleteFor.delete(conversationId);

    // Misc per-conversation flags / attribution
    this.activeStreamPersisted.delete(conversationId);
    this.assistantPersistedThisTurn.delete(conversationId);
    this.currentAgentForConversation.delete(conversationId);
    this.lastToolCallsBroadcastHash.delete(conversationId);
  }

  /**
   * Determines if an assistant message should be skipped during node_completed persistence.
   *
   * We need to handle two cases:
   * 1. Message was stopped and persisted via persistActivePartial - skip that specific message
   * 2. Multiple assistant messages in same turn (tool call + final response) - persist both
   *
   * The original check was too aggressive - it prevented ALL assistant messages from being
   * persisted after the first one. This broke the case where an assistant makes a tool call
   * (first message) and then continues with a final response (second message).
   *
   * @param message - The message from execution state
   * @param index - Current message index in state array
   * @param lastIndex - Last persisted index for this conversation
   * @param conversationId - The conversation ID
   * @returns true if this message should be skipped (already persisted via persistActivePartial)
   */
  private shouldSkipAssistantMessage(message: unknown, index: number, lastIndex: number, conversationId: string): boolean {
    // Type guard: ensure message has expected structure
    if (!message || typeof message !== 'object') return false;
    const msg = message as Record<string, unknown>;

    // Only skip if this is the exact message that was persisted via persistActivePartial during stop
    // We can identify it because:
    // - activeStreamPersisted is set (persistActivePartial was called)
    // - It's the first message after lastIndex (the one that was being streamed)
    // - It has no tool calls (tool call messages are persisted via node_completed, not persistActivePartial)
    const wasPartialPersisted = this.activeStreamPersisted.has(conversationId);
    const isFirstMessageAfterLastIndex = index === lastIndex + 1;
    const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;

    return wasPartialPersisted && isFirstMessageAfterLastIndex && !hasToolCalls;
  }

  /**
   * Extract completed properties from a JSON-like string buffer using partial-json-parser only.
   */
  private static extractCompletedTopLevelProperties(jsonLike: string): Record<string, unknown> {
    if (typeof jsonLike !== 'string' || jsonLike.length === 0) return {};
    try {
      const v = parse(jsonLike, Allow.ALL as number) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Persist the currently active streaming assistant partial (content/reasoning only) if any. */
  private async persistActivePartial(conversationId: string, isStopped: boolean = false): Promise<MessageModel | null> {
    // If we've already persisted the active stream for this conversation, skip
    if (this.activeStreamPersisted.has(conversationId)) {
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
      const agent = this.currentAgentForConversation.get(conversationId);
      const starship = await this.getConversationStarship(conversationId);
      const stoppedAt = isStopped ? new Date().toISOString() : undefined;

      const persistedMsg = await this.messageService.createMessage({
        conversationId,
        role: 'assistant',
        content: partialContent || '',
        messageType: 'agent_response',
        ...(partialReasoning ? { reasoning: partialReasoning } : {}),
        ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
        ...(pendingAttachmentIds.length > 0 ? { attachmentIds: pendingAttachmentIds } : {}),
        ...(stoppedAt ? { stoppedAt } : {}),
      });

      // Link generated attachments to the persisted message (best-effort)
      try {
        if (starship && pendingAttachmentIds.length > 0) {
          const attachmentService = new AttachmentService();
          await Promise.all(
            pendingAttachmentIds.map((id) => attachmentService.linkToMessage(id, persistedMsg.id, starship.id).catch(() => false))
          );
        }
      } catch {
        // Non-fatal
      }
      // Mark both per-turn and active-stream persisted flags
      this.assistantPersistedThisTurn.add(conversationId);
      this.activeStreamPersisted.add(conversationId);

      // Clear accumulators for the active stream so a future stream can start cleanly
      this.streamingContent.delete(conversationId);
      this.streamingToolCalls.delete(conversationId);
      this.streamingReasoning.delete(conversationId);
      this.ringBuffer.delete(conversationId);
      this.streamingGeneratedAttachmentIds.delete(conversationId);
      this.streamingGeneratedImageUrlSeen.delete(conversationId);

      return persistedMsg;
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
    } catch {
      return null;
    }
  }

  /**
   * Recursively check if any ancestor conversation is stopped
   * Returns the stopped ancestor ID if found, or null if none are stopped
   */
  private async checkAncestorStopped(conversationId: string, visited: Set<string> = new Set()): Promise<string | null> {
    // Guard against infinite loops
    if (visited.has(conversationId)) {
      return null;
    }
    visited.add(conversationId);

    // Check if this conversation is stopped
    const isStopped = ConversationService.pendingStops.has(conversationId);
    console.log('[STOP-DEBUG] checkAncestorStopped', {
      conversationId,
      isStopped,
      allPendingStops: Array.from(ConversationService.pendingStops),
    });

    if (isStopped) {
      return conversationId;
    }

    // Check parent recursively
    try {
      const conversation = await this.conversationRepository.findById(conversationId);
      if (conversation?.parentConversationId) {
        return await this.checkAncestorStopped(conversation.parentConversationId, visited);
      }
    } catch (err) {
      console.warn('[STOP-DEBUG] Error checking ancestor stops', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return null;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    data: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'> & { starshipId: string; agentId?: string }
  ): Promise<ConversationModel> {
    // CRITICAL: Check if parent is stopped BEFORE creating the conversation
    // This prevents new child conversations from being created after a stop
    if (data.parentConversationId) {
      const stoppedAncestorId = await this.checkAncestorStopped(data.parentConversationId);
      if (stoppedAncestorId !== null) {
        console.log('[STOP-DEBUG] Rejecting child conversation creation - parent is stopped', {
          parentConversationId: data.parentConversationId,
          stoppedAncestorId,
          wouldBeChildTitle: data.title || 'New Conversation',
        });
        throw new Error(`Cannot create child conversation: parent conversation ${stoppedAncestorId} is stopped`);
      }
    }

    const conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
      status: data.status || 'active',
      starshipId: data.starshipId,
      agentId: data.agentId,
      parentConversationId: data.parentConversationId,
    });

    // If this is a child conversation linked to a parent, emit a UI action on the parent's stream
    try {
      if (conversation.parentConversationId) {
        // CRITICAL FIX: Recursively check if any ancestor is stopped
        // This handles cases where a grandparent is stopped but the immediate parent isn't
        const stoppedAncestorId = await this.checkAncestorStopped(conversation.parentConversationId);
        const parentHasPendingStop = stoppedAncestorId !== null;
        const parentHasActiveCancellation = ConversationService.activeCancellations.has(conversation.parentConversationId);

        console.log('[STOP-DEBUG] Child conversation created', {
          parentConversationId: conversation.parentConversationId,
          childConversationId: conversation.id,
          parentHasActiveCancellation,
          parentHasPendingStop,
          stoppedAncestorId,
          childHasActiveCancellation: ConversationService.activeCancellations.has(conversation.id),
          allActiveCancellations: Array.from(ConversationService.activeCancellations.keys()),
        });

        // CRITICAL FIX: If any ancestor has a pending stop, propagate it to the child immediately
        // This ensures that if any ancestor is stopped before the child starts executing,
        // the child will be stopped as soon as it tries to start
        if (parentHasPendingStop) {
          console.log('[STOP-DEBUG] Ancestor has pending stop, propagating to child', {
            parentConversationId: conversation.parentConversationId,
            childConversationId: conversation.id,
            stoppedAncestorId,
          });
          ConversationService.pendingStops.add(conversation.id);
        }

        if (this.streamingService && this.streamingService.isActive(conversation.parentConversationId)) {
          const payload: any = {
            __ui_action: 'child_conversation_created',
            parentConversationId: conversation.parentConversationId,
            childConversationId: conversation.id,
            starshipId: conversation.starshipId,
          };
          await this.streamingService.broadcastUIAction(conversation.parentConversationId, payload);
        }
      }
    } catch (e) {
      // Non-fatal: failure to emit UI hint must not break conversation creation
      try {
        console.error('[STOP-DEBUG] Failed to emit child_conversation_created', {
          error: e instanceof Error ? e.message : String(e),
          parentConversationId: conversation.parentConversationId,
          starshipId: conversation.starshipId,
        });
      } catch {
        // ignore
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
          ...((error as any).code && { code: (error as any).code }),
          ...((error as any).constraint && { constraint: (error as any).constraint }),
        });
      } else {
        console.error(`[ConversationService] Unknown error deleting conversation ${conversationId}:`, error);
      }
      throw error;
    }
  }

  /**
   * Update conversation details (title, etc.)
   */
  async updateConversation(conversationId: string, updates: { title?: string }): Promise<ConversationModel | null> {
    try {
      console.log(`[ConversationService] Updating conversation ${conversationId}`, updates);

      // Use the repository's update method
      const updatedConversation = await this.conversationRepository.update(conversationId, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });

      if (updatedConversation) {
        console.log(`[ConversationService] Successfully updated conversation ${conversationId}`);
      } else {
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
    if (!executionState || typeof executionState !== 'object') {
      return null;
    }

    const persistable: Record<string, unknown> = {};
    // Persist most execution state to conversation.state, but keep certain keys ephemeral
    // (per-turn/per-request) so they don't "stick" across turns.
    const blacklist = new Set(['messages', 'tools', 'modalities', 'imageConfig']);

    // Blacklist: Store everything except messages and tools
    for (const [key, value] of Object.entries(executionState)) {
      if (!blacklist.has(key)) {
        persistable[key] = value;
      }
    }

    return Object.keys(persistable).length > 0 ? persistable : null;
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
          if (this.streamingService && this.streamingService.isActive(conversationId)) {
            await this.streamingService.broadcastDelta(conversationId, {
              op: 'add',
              path: '/messages/-',
              value: sys,
            });
          }
          // Optional: UI action for future clients to react immediately
          try {
            await this.streamingService.broadcastUIAction(conversationId, { __ui_action: 'insufficient_balance' });
          } catch {
            /* non-fatal: ui_action is best-effort */
          }
        } catch {
          /* non-fatal: system message emission failure */
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
          blueprint: redactedBlueprint as any,
        }));

      return toolParams;
    } catch (error) {
      console.error(`[CONVERSATION-SERVICE] Error getting agent tools via relationships:`, error);
      return [];
    }
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
    // CRITICAL: Check if this conversation was marked for stop BEFORE doing anything
    // This prevents execution from starting if stop was requested
    // CRITICAL: Keep pendingStops flag active so any subsequent messages are also aborted
    // The remote runner service might continue processing and send results back later
    const hasPendingStop = ConversationService.pendingStops.has(data.conversationId);
    if (hasPendingStop) {
      console.log('[STOP-DEBUG] Stop was pending at start of addConversationMessage, aborting', {
        conversationId: data.conversationId,
        note: 'Keeping pendingStops flag active to prevent future execution',
      });
      // Try to call cancel if available
      const cancel = ConversationService.activeCancellations.get(data.conversationId);
      if (typeof cancel === 'function' && !cancel.toString().includes('Placeholder cancel function')) {
        try {
          cancel();
          console.log('[STOP-DEBUG] Called cancel in addConversationMessage abort', { conversationId: data.conversationId });
        } catch (err) {
          console.warn('[STOP-DEBUG] Error calling cancel in addConversationMessage abort', {
            conversationId: data.conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      // CRITICAL: Do NOT delete pendingStops - keep it active to prevent future execution
      // The remote runner might continue processing and trigger new messages
      // ConversationService.activeCancellations.delete(data.conversationId); // Keep cancellation handle too in case we need to cancel again
      // Finalize turn state
      try {
        const convo = await this.getConversationById(data.conversationId);
        if (convo) {
          const prev = (convo.state as any) || {};
          await this.conversationRepository.update(data.conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('[STOP-DEBUG] Failed to update turn state', {
          conversationId: data.conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return; // Exit early - don't process the message
    }

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
    console.log('[STOP-DEBUG] Setting placeholder cancellation handle', {
      conversationId: data.conversationId,
      allActiveCancellations: Array.from(ConversationService.activeCancellations.keys()),
    });

    // CRITICAL FIX: Check if this is a child conversation and if the parent has a pending stop
    // If so, mark this child for stop immediately so it stops as soon as execution starts
    let parentHasPendingStop = false;
    try {
      const conversation = await this.getConversationById(data.conversationId).catch(() => null);
      if (conversation?.parentConversationId) {
        parentHasPendingStop = ConversationService.pendingStops.has(conversation.parentConversationId);
        if (parentHasPendingStop) {
          console.log('[STOP-DEBUG] Parent has pending stop, marking child for stop', {
            parentConversationId: conversation.parentConversationId,
            childConversationId: data.conversationId,
          });
          ConversationService.pendingStops.add(data.conversationId);
        }
      }
    } catch (e) {
      // Non-fatal: if we can't check parent status, continue anyway
      console.warn('[STOP-DEBUG] Failed to check parent stop status', {
        conversationId: data.conversationId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    ConversationService.activeCancellations.set(data.conversationId, () => {
      // Placeholder cancel function - will be replaced by actual runner cancel when workflow starts
      // This should never be called, but if it is, it's a no-op
      console.log('[STOP-DEBUG] Placeholder cancel function called (unexpected)', {
        conversationId: data.conversationId,
      });
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

    // Persist user message unless pre-created by the route (needed to charge credits before returning 202)
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

    // Broadcast user message immediately via streaming if available
    if (this.streamingService) {
      const userMessageDelta: Operation = {
        op: 'add',
        path: '/messages/-',
        value: userMessage,
      };
      await this.streamingService.broadcastDelta(data.conversationId, userMessageDelta);
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

              if (this.streamingService && this.streamingService.isActive(convo.id)) {
                await this.streamingService.broadcastUIAction(convo.id, {
                  __ui_action: 'conversation_title_updated',
                  conversationId: convo.id,
                  title: gen.trim(),
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

    // Load conversation state for context
    const conversationState = conversation.state || {};

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
        // CRITICAL: Check for pending stop at the START of each loop iteration
        // This catches cases where stop was requested while we were processing previous agents
        if (ConversationService.pendingStops.has(data.conversationId)) {
          console.log('[STOP-DEBUG] Stop detected at start of agent loop iteration, aborting', {
            conversationId: data.conversationId,
            remainingAgents: agentQueue.length,
            hops,
          });
          // Try to call cancel if available
          const cancel = ConversationService.activeCancellations.get(data.conversationId);
          if (typeof cancel === 'function' && !cancel.toString().includes('Placeholder cancel function')) {
            try {
              cancel();
              console.log('[STOP-DEBUG] Called cancel in loop check', { conversationId: data.conversationId });
            } catch (err) {
              console.warn('[STOP-DEBUG] Error calling cancel in loop check', {
                conversationId: data.conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          ConversationService.pendingStops.delete(data.conversationId);
          ConversationService.activeCancellations.delete(data.conversationId);
          // Finalize turn state
          try {
            const convo = await this.getConversationById(data.conversationId);
            if (convo) {
              const prev = (convo.state as any) || {};
              await this.conversationRepository.update(data.conversationId, {
                state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[STOP-DEBUG] Failed to finalize in loop check', {
              conversationId: data.conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break; // Exit the while loop
        }

        const agentModel = agentQueue.shift()!;
        if (processedAgents.has(agentModel.id)) {
          continue;
        }
        processedAgents.add(agentModel.id);
        hops += 1;

        // Expose current agent id to the blueprint via env("AGENT_ID")
        (runtimeEnv as any).AGENT_ID = agentModel.id;

        // Guard against NULL/undefined persisted JSONB state
        const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

        // Get deployed tools for this agent (always redacted; server executes tools)
        const resolvedTools = await this.getAgentTools(agentModel.id, starship.id);

        const agentWithTools: AgentParams = {
          ...agentModel,
          // Always use the server-tools blueprint (no legacy tool-node execution).
          blueprint: Agent.defaultAgentBlueprintServerTools(),
          state: {
            ...baseState,
            ...conversationState,
            tools: resolvedTools,
            starshipId: starship.id,
          },
        };

        // Check if the previous task was stopped - if so, inject a system message to signal fresh start
        // Find the last assistant message before the new user message (skipping tool results)
        let previousTaskWasStopped = false;
        if (messages.length > 0 && messages[messages.length - 1]?.role === 'user') {
          // This is the new user message - look backwards for the last assistant message
          for (let i = messages.length - 2; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'assistant') {
              if (msg.stoppedAt) {
                previousTaskWasStopped = true;
              }
              break; // Found the last assistant message, stop looking
            }
            // Skip tool/system messages and continue looking backwards
          }
        }

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

        // If previous task was stopped, inject a system message right before the new user message
        // This tells the agent to treat this as a fresh start, not a continuation
        if (previousTaskWasStopped && llmMessages.length > 0 && llmMessages[llmMessages.length - 1]?.role === 'user') {
          const systemMessage: LlmMessage = {
            role: 'system',
            content:
              'The user stopped the previous task. This is a new request - treat it as a fresh start and do not continue the previous task.',
          };
          // Insert system message right before the last (new) user message
          llmMessages.splice(llmMessages.length - 1, 0, systemMessage);
        }
        // input not required; execution.state messages are set directly

        // Attribute streamed content to the current agent
        this.currentAgentForConversation.set(data.conversationId, { id: agentModel.id, name: agentModel.name });

        const engineConfig = {
          ...(baseEngineConfig as object),
          eventCallback: (event: AutopilotEvent) => this.eventCallback(data.conversationId, event),
        } as EngineConfig & Record<string, unknown>;

        // Optional per-turn multimodal output configuration (OpenRouter image generation):
        // Agent.execute merges params.state into execution.state, so attach to agent params.state BEFORE construction.
        if (Array.isArray((data as any).modalities) && (data as any).modalities.length > 0) {
          (agentWithTools.state as any).modalities = (data as any).modalities;
        }
        if ((data as any).imageConfig && typeof (data as any).imageConfig === 'object') {
          (agentWithTools.state as any).imageConfig = (data as any).imageConfig;
        }

        // Check if this conversation was marked for stop before execution starts
        const hasPendingStop = ConversationService.pendingStops.has(data.conversationId);
        if (hasPendingStop) {
          console.log('[STOP-DEBUG] Stop was pending before execution, skipping agent execution', {
            conversationId: data.conversationId,
          });
          // Clean up and exit early
          ConversationService.pendingStops.delete(data.conversationId);
          ConversationService.activeCancellations.delete(data.conversationId);
          // Still need to finalize the turn state
          try {
            const convo = await this.getConversationById(data.conversationId);
            if (convo) {
              const prev = (convo.state as any) || {};
              await this.conversationRepository.update(data.conversationId, {
                state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[STOP-DEBUG] Failed to update turn state for stopped conversation', {
              conversationId: data.conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          // Skip to next agent or exit
          continue;
        }

        const agent = new Agent(agentWithTools, {
          eventCallback: (event) => this.eventCallback(data.conversationId, event),
          runtimeEnv,
          // Ensure ConversationService can still choose isolation strategy (child vs remote) and support cancellation.
          runner: this.defaultRunner,
          runnerConfig: engineConfig as unknown as Record<string, unknown>,
          onCancel: (cancel) => {
            console.log('[STOP-DEBUG] Registering cancellation handle (addConversationMessage)', {
              conversationId: data.conversationId,
              cancelType: typeof cancel,
              allActiveCancellations: Array.from(ConversationService.activeCancellations.keys()),
              hasPendingStop: ConversationService.pendingStops.has(data.conversationId),
            });

            // Check if this conversation was marked for stop before the real cancel was registered
            const shouldStopImmediately = ConversationService.pendingStops.has(data.conversationId);

            ConversationService.activeCancellations.set(data.conversationId, cancel);
            console.log('[STOP-DEBUG] Cancellation handle registered (addConversationMessage)', {
              conversationId: data.conversationId,
              activeCancellationsAfter: Array.from(ConversationService.activeCancellations.keys()),
              shouldStopImmediately,
            });

            // If stop was requested before real cancel was registered, call it immediately
            if (shouldStopImmediately) {
              console.log('[STOP-DEBUG] Stop was pending, calling cancel immediately (addConversationMessage)', {
                conversationId: data.conversationId,
              });
              try {
                cancel();
                console.log('[STOP-DEBUG] Pending stop executed successfully (addConversationMessage)', {
                  conversationId: data.conversationId,
                });
              } catch (err) {
                console.warn('[STOP-DEBUG] Error executing pending stop (addConversationMessage)', {
                  conversationId: data.conversationId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
              ConversationService.activeCancellations.delete(data.conversationId);
              // CRITICAL: Do NOT delete from pendingStops - keep stop active to prevent future execution
              // The conversation should remain "stopped" until a new user message starts a new turn
              // ConversationService.pendingStops.delete(data.conversationId);
            }
          },
        });

        // Execute the agent. Provide the full conversation snapshot as input so Agent.execute can
        // construct the correct ordered message list (systemPrompt -> memory -> conversation).
        // CRITICAL: Check one final time right before execution (race condition protection)
        if (ConversationService.pendingStops.has(data.conversationId)) {
          console.log('[STOP-DEBUG] Stop was requested just before execute, aborting execution', {
            conversationId: data.conversationId,
          });
          // Try to call cancel if real cancel is already registered
          const cancel = ConversationService.activeCancellations.get(data.conversationId);
          if (typeof cancel === 'function' && !cancel.toString().includes('Placeholder cancel function')) {
            try {
              cancel();
              console.log('[STOP-DEBUG] Called real cancel before execute', { conversationId: data.conversationId });
            } catch (err) {
              console.warn('[STOP-DEBUG] Error calling cancel before execute', {
                conversationId: data.conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          ConversationService.pendingStops.delete(data.conversationId);
          ConversationService.activeCancellations.delete(data.conversationId);
          // Finalize turn state
          try {
            const convo = await this.getConversationById(data.conversationId);
            if (convo) {
              const prev = (convo.state as any) || {};
              await this.conversationRepository.update(data.conversationId, {
                state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[STOP-DEBUG] Failed to update turn state before execute', {
              conversationId: data.conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          continue; // Skip this agent execution
        }

        // FINAL CHECK: Right before execute, check one more time for pending stop
        // This is the last chance to abort before execution starts
        if (ConversationService.pendingStops.has(data.conversationId)) {
          console.log('[STOP-DEBUG] Final check: Stop pending right before execute, aborting', {
            conversationId: data.conversationId,
          });
          const cancel = ConversationService.activeCancellations.get(data.conversationId);
          if (typeof cancel === 'function' && !cancel.toString().includes('Placeholder cancel function')) {
            try {
              cancel();
              console.log('[STOP-DEBUG] Called cancel in final check', { conversationId: data.conversationId });
            } catch (err) {
              console.warn('[STOP-DEBUG] Error in final check cancel', {
                conversationId: data.conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          ConversationService.pendingStops.delete(data.conversationId);
          ConversationService.activeCancellations.delete(data.conversationId);
          // Finalize turn state
          try {
            const convo = await this.getConversationById(data.conversationId);
            if (convo) {
              const prev = (convo.state as any) || {};
              await this.conversationRepository.update(data.conversationId, {
                state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[STOP-DEBUG] Failed to finalize in final check', {
              conversationId: data.conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          continue; // Skip execution
        }

        console.log('[STOP-DEBUG] About to call agent.execute', {
          conversationId: data.conversationId,
          hasPendingStop: ConversationService.pendingStops.has(data.conversationId),
          hasActiveCancellation: ConversationService.activeCancellations.has(data.conversationId),
          cancellationType: typeof ConversationService.activeCancellations.get(data.conversationId),
        });
        await agent.execute(ExecutionItemUtils.wrapSingle(llmMessages));
        console.log('[STOP-DEBUG] agent.execute completed', {
          conversationId: data.conversationId,
          hadPendingStop: ConversationService.pendingStops.has(data.conversationId),
          hasActiveCancellation: ConversationService.activeCancellations.has(data.conversationId),
        });

        // Clear cancellation handle after completion
        // CRITICAL: If onCancel was never called, we still have a placeholder that needs to be cleaned up
        const finalCancel = ConversationService.activeCancellations.get(data.conversationId);
        if (finalCancel && typeof finalCancel === 'function') {
          const isPlaceholder = finalCancel.toString().includes('Placeholder cancel function');
          if (isPlaceholder) {
            console.log('[STOP-DEBUG] Execution completed but placeholder still present (onCancel never called), cleaning up', {
              conversationId: data.conversationId,
            });
          }
        }
        ConversationService.activeCancellations.delete(data.conversationId);
        // Also clear pending stop if execution completed successfully
        ConversationService.pendingStops.delete(data.conversationId);

        // Refresh messages after this agent's turn so subsequent agents (if any)
        // see the updated conversation state, but do not perform mention-based handoffs
        messages = await this.getConversationMessages(data.conversationId);
      }
    } catch (error) {
      // Check if this is a cancellation error - if so, it's expected and we should handle it gracefully
      const isCancellationError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message.includes('aborted') ||
          error.message.includes('cancelled') ||
          error.message.includes('Remote runner execution cancelled'));

      if (isCancellationError) {
        console.log('[STOP-DEBUG] Execution was cancelled (expected)', {
          conversationId: data.conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Clean up cancellation handle - execution was intentionally stopped
        ConversationService.activeCancellations.delete(data.conversationId);
        // CRITICAL: Do NOT delete from pendingStops - keep stop active to prevent future execution
        // The conversation should remain "stopped" until a new user message starts a new turn
        // This prevents tools/connectors from creating child conversations or sending messages after stop
        // ConversationService.pendingStops.delete(data.conversationId);
        // Don't throw - cancellation is expected, just stop execution
        return;
      }

      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Clean up placeholder cancellation handle on error
      ConversationService.activeCancellations.delete(data.conversationId);

      if (this.streamingService) {
        await this.streamingService.broadcastError(data.conversationId, {
          streamId: data.conversationId,
          errorCode: 'AGENT_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown agent execution error',
          timestamp: new Date().toISOString(),
          recoverable: false,
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
          ConversationService.turnLeases.delete(data.conversationId);
        } catch {
          // best-effort; lease also has TTL in DB
        }
      }
      // Clear attribution and suppression, emit a single completion
      this.currentAgentForConversation.delete(data.conversationId);
      const wasSuppressed = this.suppressCompleteFor.delete(data.conversationId);
      if (wasSuppressed && this.streamingService && this.streamingService.isActive(data.conversationId)) {
        await this.streamingService.broadcastComplete(data.conversationId, {
          source: 'agent',
          content: 'Turn completed',
          agentId: 'multi',
          scope: 'workflow',
          conversationId: data.conversationId,
        });
      }
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
        maxConcurrentTurns: (starship as any).maxConcurrentTurns ?? 3,
      });

      // Track the turn lease so we can release it on stop
      if (turnLeaseId) {
        ConversationService.turnLeases.set(conversationId, turnLeaseId);
      }

      const agentService = new AgentService();
      const agentModel = await agentService.getAgent(agentId);
      if (!agentModel || agentModel.starshipId !== starship.id) {
        ConversationService.activeCancellations.delete(conversationId);
        throw new NotFoundError('Agent', agentId);
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
          : ({ messages: [], tools: [] } as any);

      const agentWithTools: AgentParams = {
        ...(agentModel as any),
        // Always use the server-tools blueprint (no legacy tool-node execution).
        blueprint: Agent.defaultAgentBlueprintServerTools(),
        state: {
          ...baseState,
          ...conversationState,
          tools: resolvedTools,
          starshipId: starship.id,
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
          console.log('[STOP-DEBUG] Registering cancellation handle', {
            conversationId,
            cancelType: typeof cancel,
            allActiveCancellations: Array.from(ConversationService.activeCancellations.keys()),
            hasPendingStop: ConversationService.pendingStops.has(conversationId),
          });

          // Check if this conversation was marked for stop before the real cancel was registered
          const shouldStopImmediately = ConversationService.pendingStops.has(conversationId);

          ConversationService.activeCancellations.set(conversationId, cancel);
          console.log('[STOP-DEBUG] Cancellation handle registered', {
            conversationId,
            activeCancellationsAfter: Array.from(ConversationService.activeCancellations.keys()),
            shouldStopImmediately,
          });

          // If stop was requested before real cancel was registered, call it immediately
          if (shouldStopImmediately) {
            console.log('[STOP-DEBUG] Stop was pending, calling cancel immediately', { conversationId });
            try {
              cancel();
              console.log('[STOP-DEBUG] Pending stop executed successfully', { conversationId });
            } catch (err) {
              console.warn('[STOP-DEBUG] Error executing pending stop', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            ConversationService.activeCancellations.delete(conversationId);
            // CRITICAL: Do NOT delete from pendingStops - keep stop active to prevent future execution
            // The conversation should remain "stopped" until explicitly resumed or a new turn starts
            // ConversationService.pendingStops.delete(conversationId);
          }
        },
      });

      await agent.execute(ExecutionItemUtils.wrapSingle(llmMessages));
    } finally {
      ConversationService.activeCancellations.delete(conversationId);
      if (turnLeaseId) {
        try {
          await leaseService.release(turnLeaseId);
          ConversationService.turnLeases.delete(conversationId);
        } catch {
          // best-effort; lease TTL will clean up
        }
      }
    }
  }

  /**
   * Stop current turn: cancel runner, persist partial content/reasoning (omit tool_calls), finalize SSE.
   * Also recursively stops all child conversations (delegated conversations).
   * @param conversationId - The conversation ID to stop
   * @param visited - Internal set to prevent infinite loops (do not pass manually)
   */
  async stopConversation(conversationId: string, visited: Set<string> = new Set()): Promise<void> {
    console.log('[STOP-DEBUG] stopConversation called', {
      conversationId,
      visitedSize: visited.size,
      hasActiveCancellation: ConversationService.activeCancellations.has(conversationId),
      allActiveCancellations: Array.from(ConversationService.activeCancellations.keys()),
    });

    // Guard against infinite loops (shouldn't happen with valid data, but safety first)
    if (visited.has(conversationId)) {
      console.warn('[STOP-DEBUG] Circular reference detected, skipping', { conversationId });
      return;
    }
    visited.add(conversationId);

    // CRITICAL: Release turn lease immediately when stopping
    // This prevents the concurrency limit from being stuck when conversations are stopped
    const turnLeaseId = ConversationService.turnLeases.get(conversationId);
    if (turnLeaseId) {
      try {
        const leaseService = new StarshipTurnLeaseService();
        await leaseService.release(turnLeaseId);
        ConversationService.turnLeases.delete(conversationId);
        console.log('[STOP-DEBUG] Released turn lease on stop', { conversationId, turnLeaseId });
      } catch (err) {
        console.warn('[STOP-DEBUG] Error releasing turn lease on stop', {
          conversationId,
          turnLeaseId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue with stop even if lease release fails
      }
    }

    // First, recursively stop all child conversations (delegated conversations)
    // This ensures that when stopping a parent conversation, all child conversations are also stopped
    try {
      console.log('[STOP-DEBUG] Finding child conversations for parent', { conversationId });
      const childConversations = await this.conversationRepository.findByParentConversationId(conversationId);
      console.log('[STOP-DEBUG] Found child conversations', {
        parentConversationId: conversationId,
        childCount: childConversations.length,
        childIds: childConversations.map((c) => c.id),
      });

      for (const childConversation of childConversations) {
        try {
          const childCancel = ConversationService.activeCancellations.get(childConversation.id);
          const childCancelString = typeof childCancel === 'function' ? childCancel.toString() : '';
          const childHasPlaceholder = childCancelString.includes('Placeholder cancel function');

          console.log('[STOP-DEBUG] Stopping child conversation', {
            parentConversationId: conversationId,
            childConversationId: childConversation.id,
            childHasActiveCancellation: ConversationService.activeCancellations.has(childConversation.id),
            childHasPlaceholder,
            childHasRealCancel: typeof childCancel === 'function' && !childHasPlaceholder,
          });

          // CRITICAL: Release child's turn lease immediately when stopping
          const childTurnLeaseId = ConversationService.turnLeases.get(childConversation.id);
          if (childTurnLeaseId) {
            try {
              const leaseService = new StarshipTurnLeaseService();
              await leaseService.release(childTurnLeaseId);
              ConversationService.turnLeases.delete(childConversation.id);
              console.log('[STOP-DEBUG] Released child turn lease on stop', {
                parentConversationId: conversationId,
                childConversationId: childConversation.id,
                childTurnLeaseId,
              });
            } catch (err) {
              console.warn('[STOP-DEBUG] Error releasing child turn lease on stop', {
                parentConversationId: conversationId,
                childConversationId: childConversation.id,
                childTurnLeaseId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // CRITICAL: Mark child for stop immediately, even if it's already executing
          // This ensures the onCancel callback will see the pending stop and call cancel immediately
          ConversationService.pendingStops.add(childConversation.id);

          // SIMPLE FIX: If we have a real cancel (not placeholder), call it immediately
          // This handles the case where the child is executing and we have the cancel function
          if (typeof childCancel === 'function' && !childHasPlaceholder) {
            console.log('[STOP-DEBUG] Child has real cancel, calling it immediately', {
              parentConversationId: conversationId,
              childConversationId: childConversation.id,
            });
            try {
              childCancel();
              console.log('[STOP-DEBUG] Child real cancel called successfully', {
                parentConversationId: conversationId,
                childConversationId: childConversation.id,
              });
              ConversationService.activeCancellations.delete(childConversation.id);
              // CRITICAL: Ensure child stays in pendingStops - keep stop active to prevent future execution
              // The child should remain "stopped" until explicitly resumed or a new turn starts
              ConversationService.pendingStops.add(childConversation.id);
            } catch (err) {
              console.warn('[STOP-DEBUG] Error calling child real cancel', {
                parentConversationId: conversationId,
                childConversationId: childConversation.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // Recursively stop child conversation (which will also stop its children if any)
          await this.stopConversation(childConversation.id, visited);
          console.log('[STOP-DEBUG] Successfully stopped child conversation', {
            parentConversationId: conversationId,
            childConversationId: childConversation.id,
          });
        } catch (err) {
          console.warn('[STOP-DEBUG] Error stopping child conversation', {
            parentConversationId: conversationId,
            childConversationId: childConversation.id,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          // Continue stopping other children even if one fails
        }
      }
    } catch (err) {
      console.warn('[STOP-DEBUG] Error finding child conversations', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Continue with stopping this conversation even if finding children fails
    }

    // Cancel active runner if any
    try {
      const cancel = ConversationService.activeCancellations.get(conversationId);
      const cancelString = typeof cancel === 'function' ? cancel.toString() : '';
      const isPlaceholder = cancelString.includes('Placeholder cancel function');
      console.log('[STOP-DEBUG] Checking cancellation handle', {
        conversationId,
        hasCancel: typeof cancel === 'function',
        cancelType: typeof cancel,
        isPlaceholder,
        cancelStringPreview: cancelString.substring(0, 200),
      });
      if (typeof cancel === 'function') {
        // Check if this is a placeholder cancel function (it will log "Placeholder cancel function called")
        const isPlaceholder = cancel.toString().includes('Placeholder cancel function');

        if (isPlaceholder) {
          // Real cancel hasn't been registered yet - mark this conversation for stop
          // The real cancel will check this flag and stop immediately when registered
          console.log('[STOP-DEBUG] Placeholder cancel found, marking for stop when real cancel is registered', {
            conversationId,
          });
          ConversationService.pendingStops.add(conversationId);
          // Don't delete the placeholder yet - we need to keep it so the real cancel can replace it

          // CRITICAL FIX: Before polling, do an immediate re-check in case the real cancel was just registered
          // This handles the race condition where execution is in progress and the real cancel gets registered
          // between when we first checked and now
          await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay to let any in-flight registrations complete
          const immediateRecheck = ConversationService.activeCancellations.get(conversationId);
          if (immediateRecheck && typeof immediateRecheck === 'function') {
            const isStillPlaceholderAfterRecheck = immediateRecheck.toString().includes('Placeholder cancel function');
            if (!isStillPlaceholderAfterRecheck) {
              // Real cancel is now registered! Call it immediately
              console.log('[STOP-DEBUG] Real cancel found on immediate recheck, calling it', {
                conversationId,
              });
              try {
                immediateRecheck();
                console.log('[STOP-DEBUG] Real cancel called successfully on immediate recheck', { conversationId });
                ConversationService.activeCancellations.delete(conversationId);
                // CRITICAL: Do NOT delete from pendingStops - keep stop active to prevent future execution
                // The conversation should remain "stopped" until explicitly resumed or a new turn starts
                // ConversationService.pendingStops.delete(conversationId);
                // Skip polling since we already found and called the real cancel
                return;
              } catch (err) {
                console.warn('[STOP-DEBUG] Error calling cancel on immediate recheck', {
                  conversationId,
                  error: err instanceof Error ? err.message : String(err),
                });
                // Continue to polling as fallback
              }
            }
          }

          // CRITICAL FIX: We found a placeholder, which means execution might be starting or already in progress.
          // Even if turnActive is false, execution might be in progress (turnActive is set after execution starts).
          // We should poll for the real cancel to be registered, but with a shorter timeout for cases where
          // execution truly hasn't started and won't start (due to pending stop).
          // However, we can't rely on turnActive alone because there's a race condition where execution is
          // in progress but turnActive hasn't been set yet.
          console.log('[STOP-DEBUG] Placeholder found, will poll for real cancel (execution may be in progress)', {
            conversationId,
          });

          // CRITICAL FIX: Poll for real cancel to be registered (execution might be in progress)
          // The onCancel callback should handle this, but as a fallback, check a few times
          // This handles the race condition where execution starts before stop is called
          // IMPORTANT: For child conversations that are already executing, we need to poll longer
          // because the real cancel should already be registered, we just need to catch it
          let pollCount = 0;
          const maxPolls = 30; // Increased from 10 to 30 to handle executing children (1.5 seconds total)
          const pollInterval = 50; // 50ms between polls

          const pollForRealCancel = async () => {
            while (pollCount < maxPolls && ConversationService.pendingStops.has(conversationId)) {
              await new Promise((resolve) => setTimeout(resolve, pollInterval));
              pollCount++;

              const currentCancel = ConversationService.activeCancellations.get(conversationId);
              if (currentCancel && typeof currentCancel === 'function') {
                const isStillPlaceholder = currentCancel.toString().includes('Placeholder cancel function');
                if (!isStillPlaceholder) {
                  // Real cancel is now registered!
                  console.log('[STOP-DEBUG] Real cancel registered during polling, calling it', {
                    conversationId,
                    pollCount,
                  });
                  try {
                    currentCancel();
                    console.log('[STOP-DEBUG] Real cancel called successfully during polling', { conversationId });
                  } catch (err) {
                    console.warn('[STOP-DEBUG] Error calling cancel during polling', {
                      conversationId,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
                  ConversationService.activeCancellations.delete(conversationId);
                  // CRITICAL: Do NOT delete from pendingStops - keep stop active to prevent future execution
                  // The conversation should remain "stopped" until explicitly resumed or a new turn starts
                  // ConversationService.pendingStops.delete(conversationId);
                  return; // Exit polling loop
                }
              }
            }

            if (pollCount >= maxPolls && ConversationService.pendingStops.has(conversationId)) {
              console.warn('[STOP-DEBUG] Polling timeout - real cancel never registered', {
                conversationId,
                pollCount,
                // Additional debug: check if conversation is actually executing
                hasActiveCancellation: ConversationService.activeCancellations.has(conversationId),
                activeCancellationType: typeof ConversationService.activeCancellations.get(conversationId),
              });

              // CRITICAL: Even though polling timed out, the conversation might still be executing.
              // The pending stop flag will prevent new execution from starting, but we can't stop
              // execution that's already in progress without the real cancel. This is a limitation
              // when onCancel isn't called (e.g., if runner doesn't support runWithController).
              // The execution will eventually complete or timeout, and the pending stop will prevent
              // any new execution from starting.
              console.warn('[STOP-DEBUG] Execution may still be in progress but cannot be stopped without real cancel', {
                conversationId,
                note: 'Pending stop flag will prevent new execution, but current execution may continue',
              });
            }
          };

          // Start polling in background (don't await - let it run async)
          pollForRealCancel().catch((err) => {
            console.warn('[STOP-DEBUG] Polling error', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        } else {
          // Real cancel function exists - call it
          try {
            console.log('[STOP-DEBUG] Calling real cancel function', { conversationId });
            cancel();
            console.log('[STOP-DEBUG] Real cancel function called successfully', { conversationId });
          } catch (err) {
            console.warn('[STOP-DEBUG] Error while cancelling active runner', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            });
          }
          ConversationService.activeCancellations.delete(conversationId);
          // CRITICAL: Ensure conversation is in pendingStops - keep it active to prevent future execution
          // Tool execution might still be in flight and could create child conversations or send messages
          // The conversation should remain "stopped" until explicitly resumed or a new turn starts
          ConversationService.pendingStops.add(conversationId);
          console.log('[STOP-DEBUG] Removed cancellation handle (keeping pendingStops active)', { conversationId });
        }
      } else {
        // No cancellation handle at all - mark for stop in case it gets registered later
        console.log('[STOP-DEBUG] No active cancellation handle found, marking for stop', {
          conversationId,
          activeCancellationsKeys: Array.from(ConversationService.activeCancellations.keys()),
        });
        ConversationService.pendingStops.add(conversationId);
      }
    } catch (err) {
      console.warn('[STOP-DEBUG] Error accessing active cancellation handle', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    // Persist the active streaming partial (if any), regardless of prior assistant messages this turn
    // Mark as stopped since this is called from stopConversation
    let persistedMsg: MessageModel | null = await this.persistActivePartial(conversationId, true);

    // After persisting a stopped message, update lastPersistedIndex to account for the assistant message
    // that was just persisted, so node_completed doesn't try to persist it again
    if (persistedMsg) {
      // Get the current lastPersistedIndex
      const currentIndex = this.lastPersistedIndex.get(conversationId) ?? -1;
      // Increment by 1 to account for the assistant message we just persisted
      // This assumes the next message in execution state would be the assistant message
      this.lastPersistedIndex.set(conversationId, currentIndex + 1);
    }

    // If we have cached usage from streaming but no content_complete occurred, persist usage now
    try {
      const latest = this.latestStreamingUsage.get(conversationId);
      if (latest) {
        const starship = await this.getConversationStarship(conversationId);
        if (starship) {
          const usageRow = await this.usageService.createUsageForTurn({
            starshipId: starship.id,
            conversationId,
            promptTokens: Number(latest.promptTokens || 0),
            completionTokens: Number(latest.completionTokens || 0),
            totalTokens: Number(latest.totalTokens || 0),
            cost: Number(latest.cost || 0),
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

    // Finalize stream on SSE
    if (this.streamingService) {
      if (this.streamingService.isActive(conversationId)) {
        try {
          if (persistedMsg) {
            await this.streamingService.broadcastDelta(conversationId, { op: 'replace', path: '/messages/-1', value: persistedMsg });
          }
          await this.streamingService.broadcastDelta(conversationId, { op: 'replace', path: '/messages/-1/streaming', value: false });
        } catch (err) {
          console.warn('[STOP] Failed to finalize streaming state via delta', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        try {
          await this.streamingService.broadcastComplete(conversationId, {
            source: 'agent',
            content: 'Turn stopped by user',
            agentId: 'agent',
            scope: 'workflow',
            conversationId,
          });
        } catch (err) {
          console.warn('[STOP] Failed to broadcast complete on stop', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        // Persist server-authoritative end-of-turn state and notify listeners before closing SSE
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as any) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STOP] Failed to persist turn_completed state on stop', err);
        }
        try {
          await this.streamingService.broadcastTurnCompleted(conversationId, {
            conversationId,
            at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STOP] Failed to broadcast turn_completed on stop', err);
        }
        try {
          this.streamingService.closeConnection(conversationId);
        } catch (err) {
          console.warn('[STOP] Failed to close streaming connection', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        // No active connection: still buffer a logical 'complete' to bound future replays
        try {
          await this.streamingService.broadcastComplete(conversationId, {
            source: 'agent',
            content: 'Turn stopped by user',
            agentId: 'agent',
            scope: 'workflow',
            conversationId,
          });
        } catch (err) {
          console.warn('[STOP] Failed to buffer complete event on stop', {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        // Persist server-authoritative end-of-turn state even without active SSE connections
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as any) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STOP] Failed to persist turn_completed state on stop (no active conn)', err);
        }
        try {
          await this.streamingService.broadcastTurnCompleted(conversationId, {
            conversationId,
            at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STOP] Failed to broadcast turn_completed on stop (no active conn)', err);
        }
      }
    }

    // Clear streaming accumulators but preserve lastPersistedIndex to prevent duplicate persistence
    // when node_completed fires after stop (execution might still be running)
    this.clearStreamingState(conversationId, { preserveLastPersistedIndex: true });
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
          await this.usageService
            .createUsageForTurn({
              starshipId,
              conversationId,
              promptTokens: Number(usage.prompt_tokens ?? 0),
              completionTokens: Number(usage.completion_tokens ?? 0),
              totalTokens: Number(usage.total_tokens ?? 0),
              cost: Number((usage as any).cost ?? 0),
              model: String(model),
            })
            .then(async (_row) => {
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
    } catch {
      return [];
    }
  }

  async eventCallback(conversationId: string, event: AutopilotEvent): Promise<void> {
    // Log all tool events for debugging stop functionality
    if (event.type === 'tool_started' || event.type === 'tool_complete') {
      console.log(`[STOP-DEBUG] eventCallback received ${event.type}`, {
        conversationId,
        eventType: event.type,
        timestamp: event.timestamp,
        allPendingStops: Array.from(ConversationService.pendingStops),
        thisConversationInPendingStops: ConversationService.pendingStops.has(conversationId),
      });
    }
    if (!this.streamingService) {
      return;
    }

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
        // Start a new generation for resume
        const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.generationId.set(conversationId, genId);
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
          this.lastPersistedIndex.set(conversationId, baselineIndex);
        }

        // Persist turn_started state and notify clients
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as any) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: true },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to persist turn_started state', err);
        }
        try {
          await this.streamingService.broadcastTurnStarted(conversationId, {
            conversationId,
            at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to broadcast turn_started', err);
        }

        // Reset per-turn balance enforcement guards and enforce immediately
        this.lowBalanceStopTriggered.delete(conversationId);
        this.lastLowBalanceCheckAt.delete(conversationId);
        try {
          const stoppedAtStart = await this.maybeAutoStopForLowBalance(conversationId);
          if (stoppedAtStart) {
            break;
          }
        } catch {
          /* non-fatal: balance auto-stop check at workflow start */
        }

        // Do not clear pending finalization here; previous turn must finish to preserve event ordering
        break;
      }

      case 'workflow_paused': {
        // Persist the current partial assistant message so that reloads include it while paused
        try {
          const persisted = await this.persistActivePartial(conversationId);
          if (persisted && this.streamingService && this.streamingService.isActive(conversationId)) {
            try {
              await this.streamingService.broadcastDelta(conversationId, { op: 'replace', path: '/messages/-1', value: persisted });
            } catch (err) {
              console.warn('[STREAMING] Failed to broadcast persisted partial on workflow_paused', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            try {
              await this.streamingService.broadcastDelta(conversationId, { op: 'replace', path: '/messages/-1/streaming', value: false });
            } catch (err) {
              console.warn('[STREAMING] Failed to mark streaming=false on workflow_paused', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
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
          } catch (e) {
            /* non-fatal: balance auto-stop check failure */
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
              ? ((delta as any).images as unknown[])
              : [];
            const imagesFromMessage: unknown[] = Array.isArray((messageNode as { images?: unknown[] }).images)
              ? ((messageNode as any).images as unknown[])
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
              } catch {
                return '';
              }
            };
            const reasoningFromDelta = extractReasoning(delta);
            const reasoningFromMessage = extractReasoning(messageNode);
            const hasReasoning =
              (reasoningFromDelta && reasoningFromDelta.length > 0) || (reasoningFromMessage && reasoningFromMessage.length > 0);

            // Guard: if no active accumulator and we have content OR toolCalls OR reasoning, start a new placeholder stream.
            // Acquire the placeholder "lock" BEFORE any awaits to prevent duplicate shells from concurrent chunks.
            if ((hasContent || hasToolCalls || hasReasoning || hasImages) && !this.streamingContent.has(conversationId)) {
              if (this.streamingService.isActive(conversationId)) {
                // Acquire lock upfront to avoid race between parallel content_chunk events
                this.streamingContent.set(conversationId, '');
                this.placeholderEmitted.set(conversationId, true);
                // Clear toolCalls accumulator for this new stream to prevent reuse from previous LLM calls
                this.streamingToolCalls.delete(conversationId);
                // Reset generated image attachment tracking for this new stream
                this.streamingGeneratedAttachmentIds.set(conversationId, []);
                this.streamingGeneratedImageUrlSeen.set(conversationId, new Set());
                // Initialize per-stream sequence counter
                this.streamSeq.set(conversationId, 0);
                this.snapshotPreferred.delete(conversationId);
                this.toolCallSeq.set(conversationId, 0);

                const assistantMessage: MessageModel = {
                  id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  role: 'assistant',
                  content: '',
                  messageType: 'agent_response',
                  createdAt: event.timestamp,
                  updatedAt: event.timestamp,
                };

                const agent = this.currentAgentForConversation.get(conversationId);
                const shell: Operation = {
                  op: 'add',
                  path: '/messages/-',
                  value: {
                    ...assistantMessage,
                    ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
                    streaming: true,
                    chunks: [], // Initialize array so JSON Patch add to /chunks/- is valid
                    reasoningChunks: [], // Initialize array so JSON Patch add to /reasoningChunks/- is valid
                    toolCalls: [], // Initialize empty toolCalls array for replace operations
                    attachmentIds: [], // Generated images (and other attachments) can be added during streaming
                  },
                };
                await this.streamingService.broadcastDelta(conversationId, shell);
                // Emit initial resume token
                try {
                  const ResumeTokenService = (await import('./ResumeTokenService')).ResumeTokenService;
                  const svc = ResumeTokenService.getInstance();
                  const token = svc.sign({
                    c: conversationId,
                    g: this.generationId.get(conversationId) || 'g',
                    p: 0,
                    m: '0',
                    exp: Math.floor(Date.now() / 1000) + 600,
                  });
                  this.streamingService.sendResumeToken(conversationId, token);
                } catch (err) {
                  console.warn('[STREAMING] Failed to emit initial resume token', {
                    conversationId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              } else {
                // No active SSE client: still initialize accumulators so stop can persist partials.
                this.streamingContent.set(conversationId, '');
                this.placeholderEmitted.set(conversationId, true);
                this.streamingToolCalls.delete(conversationId);
                this.streamingGeneratedAttachmentIds.set(conversationId, []);
                this.streamingGeneratedImageUrlSeen.set(conversationId, new Set());
                if (!this.ringBuffer.has(conversationId)) this.ringBuffer.set(conversationId, []);
                // Skip shell broadcast; continue accumulating for persistence
              }
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

                      if (this.streamingService && this.streamingService.isActive(conversationId)) {
                        try {
                          await this.streamingService.broadcastDelta(conversationId, {
                            op: 'add',
                            path: '/messages/-1/attachmentIds/-',
                            value: attachment.id,
                          });
                        } catch (err) {
                          console.warn('[STREAMING] Failed to broadcast generated image attachment id', {
                            conversationId,
                            error: err instanceof Error ? err.message : String(err),
                          });
                        }
                      }
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

                  // Build delta object synchronously
                  const chunkDelta: Operation = {
                    op: 'add',
                    path: '/messages/-1/chunks/-',
                    value: {
                      content: normalized,
                      position: chunkPosition,
                      timestamp: Date.now(),
                    },
                  };

                  // Broadcast
                  await this.streamingService.broadcastDelta(conversationId, chunkDelta);

                  // Periodically emit resume token (every ~2s)
                  try {
                    if (Math.random() < 0.15) {
                      const ResumeTokenService = (await import('./ResumeTokenService')).ResumeTokenService;
                      const svc = ResumeTokenService.getInstance();
                      const token = svc.sign({
                        c: conversationId,
                        g: this.generationId.get(conversationId) || 'g',
                        p: newLen,
                        m: '0',
                        exp: Math.floor(Date.now() / 1000) + 600,
                      });
                      this.streamingService.sendResumeToken(conversationId, token);
                    }
                  } catch (err) {
                    console.warn('[STREAMING] Failed to emit periodic resume token', {
                      conversationId,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
                }
              }
            }

            // Process reasoning if present (stream as delta chunks; persist final reasoning on completion)
            if (hasReasoning) {
              const incrementalR = reasoningFromDelta || '';
              const snapshotR = reasoningFromMessage || '';

              const currentR = this.streamingReasoning.get(conversationId) || '';
              const currentRLength = currentR.length;

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

                  // Stream delta chunk for reasoning
                  const rChunkDelta: Operation = {
                    op: 'add',
                    path: '/messages/-1/reasoningChunks/-',
                    value: {
                      content: normalizedR,
                      position: currentRLength,
                      timestamp: Date.now(),
                    },
                  };
                  await this.streamingService.broadcastDelta(conversationId, rChunkDelta);
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

                  // Parse accumulated arguments using partial-json to handle incomplete JSON gracefully
                  const toolCallsValue = acc
                    .filter((tc) => !!tc && typeof tc.function?.name === 'string' && tc.function.name.length > 0)
                    .map((tc) => {
                      let argsObj: unknown = {};
                      const argsStr = tc.function?.arguments;
                      if (typeof argsStr === 'string' && argsStr) {
                        try {
                          // Lenient parse for partial/incomplete JSON object
                          argsObj = parsePartialJSONObject(argsStr);
                        } catch {
                          argsObj = {};
                        }
                      }
                      return {
                        id: tc.id,
                        type: tc.type,
                        function: {
                          name: tc.function.name,
                          arguments: argsObj, // Parsed object (may be partial)
                        },
                      };
                    });

                  await this.streamingService.broadcastDelta(conversationId, {
                    op: 'replace',
                    path: '/messages/-1/toolCalls',
                    value: toolCallsValue,
                  });
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
                      } catch {
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
                    } as any;
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
                        } catch {
                          return '{}';
                        }
                      })(),
                    },
                  }));
                  this.streamingToolCalls.set(conversationId, accumFromSnapshot);

                  // Broadcast only valid entries (non-empty function name)
                  await this.streamingService.broadcastDelta(conversationId, {
                    op: 'replace',
                    path: '/messages/-1/toolCalls',
                    value: normalized.filter((tc) => typeof tc.function?.name === 'string' && tc.function.name.length > 0),
                  });
                }
              } catch {
                // ignore toolCall parse errors to avoid breaking streaming
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
              cost: Number(llmUsage.cost) || 0,
              ...(typeof model === 'string' ? { model } : {}),
            }
          : (() => {
              const latest = this.latestStreamingUsage.get(conversationId);
              return latest
                ? {
                    promptTokens: Number(latest.promptTokens || 0),
                    completionTokens: Number(latest.completionTokens || 0),
                    totalTokens: Number(latest.totalTokens || 0),
                    cost: Number(latest.cost || 0),
                    ...(latest.model ? { model: latest.model } : {}),
                  }
                : undefined;
            })();

        if (usagePayload) {
          try {
            const starship = await this.getConversationStarship(conversationId);
            if (starship) {
              const usageRow = await this.usageService.createUsageForTurn({
                starshipId: starship.id,
                conversationId,
                promptTokens: usagePayload.promptTokens,
                completionTokens: usagePayload.completionTokens,
                totalTokens: usagePayload.totalTokens,
                cost: usagePayload.cost,
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
            await this.streamingService.broadcastUIAction(conversationId, uiPayload);
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

              // For assistant messages, check if we should skip this message to avoid duplicates
              // This handles two cases:
              // 1. Message was stopped and persisted via persistActivePartial - skip that specific message
              // 2. Multiple assistant messages in same turn (tool call + final response) - persist both
              if (role === 'assistant' && this.shouldSkipAssistantMessage(raw, i, lastIndex, conversationId)) {
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

                const persistedMsg = await this.messageService.createMessage({
                  conversationId,
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
                  } catch {
                    // Non-fatal
                  }
                }

                // Mark that an assistant message has been persisted for this turn
                if (role === 'assistant') {
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
                }

                // Broadcast via SSE if streaming is active
                if (this.streamingService && this.streamingService.isActive(conversationId)) {
                  if (role === 'assistant') {
                    // Replace the streaming placeholder with the persisted assistant message
                    await this.streamingService.broadcastDelta(conversationId, {
                      op: 'replace',
                      path: '/messages/-1',
                      value: persistedMsg,
                    });
                  } else {
                    await this.streamingService.broadcastDelta(conversationId, {
                      op: 'add',
                      path: '/messages/-',
                      value: persistedMsg,
                    });
                  }

                  // Emit resume token checkpoint including last persisted message id
                  try {
                    const ResumeTokenService = (await import('./ResumeTokenService')).ResumeTokenService;
                    const svc = ResumeTokenService.getInstance();
                    const persistedId = (persistedMsg as { id?: unknown }).id;
                    const token = svc.sign({
                      c: conversationId,
                      g: this.generationId.get(conversationId) || 'g',
                      p: this.accumulatedLength.get(conversationId) || 0,
                      m: String(typeof persistedId === 'string' || typeof persistedId === 'number' ? persistedId : '0'),
                      exp: Math.floor(Date.now() / 1000) + 600,
                    });
                    this.streamingService.sendResumeToken(conversationId, token);
                  } catch {
                    /* non-fatal: resume token emission after persistence failed */
                  }
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
        try {
          const execEvent = event as ExecutionEvent;
          const execution: Execution | undefined = execEvent?.data?.execution;
          if (execution?.state) {
            const evolvedState = this.extractPersistableState(execution.state);
            if (evolvedState) {
              await this.conversationRepository.update(conversationId, {
                state: evolvedState,
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
        // Ensure the active assistant streaming shell is finalized before emitting 'complete'
        if (this.streamingService && this.streamingService.isActive(conversationId)) {
          try {
            await this.streamingService.broadcastDelta(conversationId, {
              op: 'replace',
              path: '/messages/-1/streaming',
              value: false,
            });
            await new Promise<void>((resolve) => {
              if (typeof setImmediate !== 'undefined') {
                setImmediate(resolve);
              } else {
                setTimeout(resolve, 0);
              }
            });
          } catch (err) {
            console.warn('[STREAMING] Failed to finalize streaming shell on workflow_completed', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }

          // If this conversation is under multi-agent suppression, skip broadcasting 'complete' here
          if (!this.suppressCompleteFor.has(conversationId)) {
            await this.streamingService.broadcastComplete(conversationId, {
              source: 'agent',
              content: 'Workflow completed',
              agentId: 'agent',
              scope: 'workflow',
              conversationId,
            });
            try {
              const ResumeTokenService = (await import('./ResumeTokenService')).ResumeTokenService;
              const svc = ResumeTokenService.getInstance();
              const token = svc.sign({
                c: conversationId,
                g: this.generationId.get(conversationId) || 'g',
                p: this.accumulatedLength.get(conversationId) || 0,
                m: '0',
                exp: Math.floor(Date.now() / 1000) + 600,
              });
              this.streamingService.sendResumeToken(conversationId, token);
            } catch (err) {
              console.warn('[STREAMING] Failed to emit final resume token on workflow_completed', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (this.streamingService) {
          // No active connection: still buffer a logical 'complete' to bound future replays
          if (!this.suppressCompleteFor.has(conversationId)) {
            try {
              await this.streamingService.broadcastComplete(conversationId, {
                source: 'agent',
                content: 'Workflow completed',
                agentId: 'agent',
                scope: 'workflow',
                conversationId,
              });
            } catch (err) {
              console.warn('[STREAMING] Failed to buffer logical complete on workflow_completed (no active conn)', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        // Persist turn_completed state and notify clients
        try {
          const convo = await this.getConversationById(conversationId);
          const prev = (convo?.state as any) || {};
          await this.conversationRepository.update(conversationId, {
            state: { ...prev, turnActive: false, lastCompleteAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to persist turn_completed state', err);
        }
        try {
          await this.streamingService.broadcastTurnCompleted(conversationId, {
            conversationId,
            at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[STREAMING] Failed to broadcast turn_completed', err);
        }

        // Clear streaming trackers now that the workflow turn has fully completed
        this.clearStreamingState(conversationId);
        break;
      }

      case 'workflow_failed': {
        const execEvent = event as ExecutionEvent;
        const execution: Execution | undefined = execEvent.data?.execution;
        console.error('[STREAMING] Workflow failed:', execution?.results);

        // Create error message
        const errorMessage = await this.messageService.createMessage({
          conversationId,
          role: 'system',
          content: `❌ Workflow failed: ${execEvent.data?.execution?.error || 'Unknown error'}`,
          messageType: 'error',
        });

        // Broadcast error message
        const delta: Operation = {
          op: 'add',
          path: '/messages/-',
          value: errorMessage,
        };
        await this.streamingService.broadcastDelta(conversationId, delta);
        // Best-effort: clear any per-conversation streaming state after a failed workflow
        this.clearStreamingState(conversationId);
        break;
      }

      case 'tool_call_detected': {
        // Intentionally no-op:
        // The client conversation UI no longer auto-navigates to builders based on tool calls.
        // Balance enforcement is handled at 'tool_started' (and other execution boundaries).
        break;
      }

      case 'tool_started': {
        // CRITICAL: Hard stop - check if conversation was stopped BEFORE tool execution
        // This prevents tools from executing at all when conversation is stopped
        const isStopped = ConversationService.pendingStops.has(conversationId);

        // Also check parent conversation if this is a child conversation
        let parentStopped = false;
        try {
          const convo = await this.getConversationById(conversationId).catch(() => null);
          if (convo?.parentConversationId) {
            parentStopped = ConversationService.pendingStops.has(convo.parentConversationId);
            // Also check parent's turnActive state
            if (!parentStopped) {
              const parentConvo = await this.getConversationById(convo.parentConversationId).catch(() => null);
              if (parentConvo) {
                const parentConvoState = (parentConvo.state || {}) as { turnActive?: boolean };
                parentStopped = parentConvoState.turnActive === false;
              }
            }
          }
        } catch {
          // Best-effort check
        }

        if (isStopped || parentStopped) {
          const toolEvent = event as { data?: { toolName?: string } };
          const toolName = toolEvent.data?.toolName;
          console.log('[STOP-DEBUG] HARD STOP: Throwing error to prevent tool execution', {
            conversationId,
            parentStopped,
            toolName,
            isStopped,
            allPendingStops: Array.from(ConversationService.pendingStops),
            note: 'Tool execution will be aborted immediately',
          });
          // Throw an error that the Tool node will catch - this prevents tool execution entirely
          // Use "aborted" in the message so Tool node recognizes it as an abort error
          const abortError = new Error(`Tool execution aborted: conversation was stopped`);
          abortError.name = 'AbortError';
          // CRITICAL: Re-throw immediately to ensure Tool node catches it
          throw abortError;
        }

        // Enforce balance at the moment tool execution starts
        try {
          const stoppedToolStart = await this.maybeAutoStopForLowBalance(conversationId);
          if (stoppedToolStart) {
            break;
          }
        } catch {
          /* non-fatal: balance auto-stop during tool_started */
        }
        break;
      }

      case 'tool_complete': {
        // CRITICAL: Check if conversation was stopped before processing tool results
        // The remote runner might continue processing tool calls even after we abort the fetch
        // We need to prevent tool results from being processed if the conversation was stopped
        const toolEvent = event as { data?: { toolName?: string; result?: unknown } };
        const toolName = toolEvent.data?.toolName;

        console.log('[STOP-DEBUG] tool_complete event received', {
          conversationId,
          toolName,
          allPendingStops: Array.from(ConversationService.pendingStops),
          thisConversationInPendingStops: ConversationService.pendingStops.has(conversationId),
        });

        // Check if this conversation or its parent was stopped
        // pendingStops is the authoritative indicator that a conversation was stopped
        const currentConversationStopped = ConversationService.pendingStops.has(conversationId);

        // Also check parent conversation if this is a child conversation
        // This is critical because tool execution in child conversations should stop if parent was stopped
        let parentConversationStopped = false;
        let parentConversationId: string | undefined;
        try {
          const convo = await this.getConversationById(conversationId).catch(() => null);
          if (convo?.parentConversationId) {
            parentConversationId = convo.parentConversationId;
            parentConversationStopped = ConversationService.pendingStops.has(parentConversationId);
          }
        } catch {
          // Best-effort: if we can't check parent, continue with current conversation check
        }

        if (currentConversationStopped || parentConversationStopped) {
          console.log('[STOP-DEBUG] Ignoring tool_complete event - conversation was stopped', {
            conversationId,
            parentConversationId,
            toolName,
            currentConversationStopped,
            parentConversationStopped,
            allPendingStops: Array.from(ConversationService.pendingStops),
            note: 'Tool result will not be processed, preventing any side effects',
          });
          // Don't process the tool result - the conversation was stopped
          // This prevents tool results from being added to state and triggering subsequent actions
          return;
        }

        // CRITICAL: For ALL tools, verify conversation is still active by checking turnActive state
        // This catches cases where the conversation was stopped between tool_started and tool_complete
        try {
          const convo = await this.getConversationById(conversationId).catch(() => null);
          if (convo && (convo.state as { turnActive?: boolean })?.turnActive === false) {
            console.log('[STOP-DEBUG] Ignoring tool_complete event - conversation turn is inactive', {
              conversationId,
              toolName,
              turnActive: (convo.state as { turnActive?: boolean })?.turnActive,
              note: 'Tool result will not be processed',
            });
            return;
          }

          // Also check parent conversation's turnActive state
          if (convo?.parentConversationId) {
            const parentConvo = await this.getConversationById(convo.parentConversationId).catch(() => null);
            if (parentConvo && (parentConvo.state as { turnActive?: boolean })?.turnActive === false) {
              console.log('[STOP-DEBUG] Ignoring tool_complete event - parent conversation turn is inactive', {
                conversationId,
                parentConversationId: convo.parentConversationId,
                toolName,
                parentTurnActive: (parentConvo.state as { turnActive?: boolean })?.turnActive,
                note: 'Tool result will not be processed',
              });
              return;
            }
          }
        } catch (err) {
          // Non-fatal: if we can't check conversation state, log and continue
          console.warn('[STOP-DEBUG] Failed to check conversation state in tool_complete', {
            conversationId,
            toolName,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Tool completion is now handled via state-based message persistence in node_completed
        // No persistence needed here - messages are added to state via mutations and persisted automatically
        break;
      }

      default:
        break;
    }
  }
}
