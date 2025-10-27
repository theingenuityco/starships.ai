import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { EnvironmentService } from '@/services/EnvironmentService';
import { UsageService } from '@/services/UsageService';
import { Agent, AutopilotEvent, ExecutionItemUtils, ChildProcessRunner, LLM } from '@starships/autopilot';
import type {
  ToolParams,
  ExecutionItem,
  AgentParams,
  ExecutionEvent,
  LLMEvent,
  ToolEvent,
  Execution,
  LlmToolCall,
  LlmMessage,
} from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository, AgentRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
import { Operation } from 'fast-json-patch';
import { getEnvConfig } from '@starships/env';
import { parse as parsePartialJson } from 'partial-json';
import { BillingService, InsufficientFundsError } from '@/services/BillingService';

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
  private environmentService!: EnvironmentService;
  private usageService!: UsageService;
  private billingService!: BillingService;
  // Track accumulated content for streaming messages by conversation ID
  private streamingContent: Map<string, string> = new Map();
  // Resume state per conversation generation
  private generationId: Map<string, string> = new Map();
  private accumulatedLength: Map<string, number> = new Map();
  private placeholderEmitted: Map<string, boolean> = new Map();
  private ringBuffer: Map<string, Array<{ position: number; content: string; ts: number }>> = new Map();
  // Track accumulated toolCalls during streaming per conversation
  private streamingToolCalls: Map<string, StreamingToolCallAccum[]> = new Map();
  // Track accumulated reasoning during streaming per conversation
  private streamingReasoning: Map<string, string> = new Map();
  // Track whether the currently active streaming assistant placeholder has been persisted
  private activeStreamPersisted: Set<string> = new Set();
  // Track latest provider-reported usage during streaming for mid-turn persistence
  private latestStreamingUsage: Map<
    string,
    { promptTokens: number; completionTokens: number; totalTokens: number; cost: number; model?: string }
  > = new Map();
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
  private defaultRunner!: ChildProcessRunner;

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
    this.environmentService = new EnvironmentService();
    this.usageService = new UsageService();
    this.billingService = new BillingService();
    // Choose default runner (child process) with proper limits
    this.defaultRunner = new ChildProcessRunner(ConversationService.AUTOPILOT_CONFIG);

    ConversationService.instance = this;
    return this;
  }

  /** Persist the currently active streaming assistant partial (content/reasoning only) if any. */
  private async persistActivePartial(conversationId: string): Promise<MessageModel | null> {
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

    // Only persist if we have something meaningful
    if ((partialContent && partialContent.trim().length > 0) || (partialReasoning && partialReasoning.trim().length > 0)) {
      const agent = this.currentAgentForConversation.get(conversationId);
      const persistedMsg = await this.messageService.createMessage({
        conversationId,
        role: 'assistant',
        content: partialContent || '',
        messageType: 'agent_response',
        ...(partialReasoning ? { reasoning: partialReasoning } : {}),
        ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
      });
      // Mark both per-turn and active-stream persisted flags
      this.assistantPersistedThisTurn.add(conversationId);
      this.activeStreamPersisted.add(conversationId);

      // Clear accumulators for the active stream so a future stream can start cleanly
      this.streamingContent.delete(conversationId);
      this.streamingToolCalls.delete(conversationId);
      this.streamingReasoning.delete(conversationId);
      this.ringBuffer.delete(conversationId);

      return persistedMsg;
    }
    return null;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    data: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'> & { starshipId: string; agentId?: string }
  ): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
      status: data.status || 'active',
      starshipId: data.starshipId,
      agentId: data.agentId,
    });

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
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      console.log(`[ConversationService] Starting deletion process for conversation ${conversationId}`);
      
      // Verify conversation exists first
      const conversation = await this.conversationRepository.findById(conversationId);
      if (!conversation) {
        console.log(`[ConversationService] Conversation ${conversationId} not found for deletion`);
        return false;
      }

      console.log(`[ConversationService] Found conversation ${conversationId} (title: "${conversation.title}"), proceeding with deletion`);
      
      // Use the repository's delete method which should handle CASCADE properly
      const deleted = await this.conversationRepository.delete(conversationId);
      
      if (deleted) {
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
          ...(error as any).code && { code: (error as any).code },
          ...(error as any).constraint && { constraint: (error as any).constraint },
        });
      } else {
        console.error(`[ConversationService] Unknown error deleting conversation ${conversationId}:`, error);
      }
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
    const blacklist = new Set(['messages', 'tools']);

    // Blacklist: Store everything except messages and tools
    for (const [key, value] of Object.entries(executionState)) {
      if (!blacklist.has(key)) {
        persistable[key] = value;
      }
    }

    return Object.keys(persistable).length > 0 ? persistable : null;
  }

  /**
   * Get deployed tool instances with their actual blueprints for the agent
   * Uses relationship-based tool resolution for accurate results
   */
  private async getAgentTools(agentId: string, starshipId: string): Promise<ToolParams[]> {
    try {
      // Use relationship-based approach: Agent-[:USES_TOOL]->Tool-[:DEPLOYED_ON]->Starship
      const deployedTools = await this.agentRepository.getAgentTools(agentId, starshipId);

      if (deployedTools.length === 0) {
        console.log(`[CONVERSATION-SERVICE] No tools found for agent ${agentId} on starship ${starshipId} via relationships`);
        return [];
      }

      // Convert ToolModel instances to ToolParams with their actual blueprints
      // Filter out draft tools (status='draft') as they don't have complete parameters/blueprint
      const toolParams: ToolParams[] = deployedTools
        .filter((tool) => tool.status !== 'draft' && tool.parameters && tool.blueprint)
        .map((tool) => ({
          name: tool.name,
          slug: tool.slug,
          description: tool.description,
          parameters: tool.parameters!,
          blueprint: tool.blueprint!,
          ...(tool.transforms && { transforms: tool.transforms }),
          ...(tool.mutations && { mutations: tool.mutations }),
          ...(tool.condition && { condition: tool.condition }),
        }));

      console.log(`[CONVERSATION-SERVICE] Found ${toolParams.length} tools via Agent→Tool relationships for agent ${agentId}`);
      return toolParams;
    } catch (error) {
      console.error(`[CONVERSATION-SERVICE] Error getting agent tools via relationships:`, error);
      return [];
    }
  }

  async addConversationMessage(data: Message & { conversationId: string }, ctx?: { authorization?: string }): Promise<void> {
    // Save user message to database
    const userMessage = await this.messageService.createMessage({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      messageType: data.messageType,
    });

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
        console.log('[TITLE] Early check:', {
          conversationId: convo.id,
          currentTitle: convo.title,
          needsTitle: needs,
          contentPreview: String(data.content || '').slice(0, 80),
        });
        if (needs) {
          const star = await this.getConversationStarship(data.conversationId);
          if (star) {
            const gen = await this.generateConversationTitle(star.id, convo.id, data.content);
            if (gen && gen.trim()) {
              await this.conversationRepository.update(convo.id, { title: gen.trim(), updatedAt: new Date().toISOString() });
              console.log('[TITLE] Updated conversation title:', { conversationId: convo.id, title: gen.trim() });
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
      const baseUrl = `${env.SERVER_URL}/api/v1`;
      const rawAuth = ctx?.authorization ?? '';
      const authToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
      const openRouterKey = env.OPENROUTER_API_KEY || '';
      const starshipEnv = await this.environmentService.getDecryptedEnvironment(starship.id);
      const secureEnv: Record<string, string> = {
        STARSHIP_ID: starship.id,
        BASE_URL: baseUrl,
        ...(authToken ? { AUTH_TOKEN: authToken } : {}),
        ...(openRouterKey ? { OPEN_ROUTER_KEY: String(openRouterKey) } : {}),
        ...starshipEnv,
      };

      // Orchestrate sequentially with mention-based handoffs
      while (agentQueue.length > 0 && hops < maxHops) {
        const agentModel = agentQueue.shift()!;
        if (processedAgents.has(agentModel.id)) {
          continue;
        }
        processedAgents.add(agentModel.id);
        hops += 1;

        // Get deployed tools for this agent
        const resolvedTools = await this.getAgentTools(agentModel.id, starship.id);

        // Guard against NULL/undefined persisted JSONB state
        const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

        const agentWithTools: AgentParams = {
          ...agentModel,
          state: {
            ...baseState,
            ...conversationState,
            tools: resolvedTools,
            starshipId: starship.id,
          },
        };

        // Prepare input messages snapshot for this agent
        const llmMessages: LlmMessage[] = messages.map((msg): LlmMessage => {
          const baseMessage: LlmMessage = {
            role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
            content: msg.content,
            ...(msg.reasoning ? { reasoning: msg.reasoning } : {}),
          };
          if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            (baseMessage as LlmMessage).toolCalls = msg.toolCalls as unknown as LlmToolCall[];
          }
          if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
            (baseMessage as LlmMessage).toolCallId = msg.toolCallId;
          }
          return baseMessage;
        });
        const input: ExecutionItem[] = ExecutionItemUtils.wrapSingle(llmMessages);

        // Attribute streamed content to the current agent
        this.currentAgentForConversation.set(data.conversationId, { id: agentModel.id, name: agentModel.name });

        const agent = new Agent(agentWithTools, {
          eventCallback: (event) => this.eventCallback(data.conversationId, event),
          secureEnv,
        });

        const baselineCount = messages.length;
        // Execute with cancellation controller at top level (depth=0 implied inside Agent)
        // Use ChildProcessRunner directly to capture cancel handle
        const runner = this.defaultRunner;
        const engineConfig = { eventCallback: (event: AutopilotEvent) => this.eventCallback(data.conversationId, event), secureEnv } as any;
        const blueprint = agent.getCurrentBlueprint();
        const exec = ExecutionItemUtils.createExecution();
        // Seed execution state with ordered conversation messages for LLM node validation
        (exec.state as Record<string, unknown>)['messages'] = llmMessages;
        (exec.state as Record<string, unknown>)['tools'] = (agentWithTools.state as any)?.tools ?? [];

        const ctl = (runner as any).runWithController?.(blueprint, exec, engineConfig);
        if (ctl && typeof ctl.cancel === 'function') {
          ConversationService.activeCancellations.set(data.conversationId, ctl.cancel);
          try {
            await ctl.promise;
          } finally {
            ConversationService.activeCancellations.delete(data.conversationId);
          }
        } else {
          // Fallback: no controller available
          await runner.run(blueprint, exec, engineConfig as any);
        }

        // Refresh messages after this agent's turn and discover mentions in new assistant messages
        const after = await this.getConversationMessages(data.conversationId);
        const newMessages = after.slice(baselineCount);
        messages = after; // advance baseline

        const combinedAssistantText = newMessages
          .filter((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 0)
          .map((m) => m.content)
          .join('\n');

        // Resolve handoffs against starship agents and auto-link dynamically
        const handoffTargets = this.extractMentionedAgents(combinedAssistantText, allStarshipAgents);
        for (const t of handoffTargets) {
          if (!conversationAgents.find((x) => x.id === t.id)) {
            await this.conversationRepository.linkToAgent(data.conversationId, t.id);
            conversationAgents.push(t);
          }
        }
        for (const target of handoffTargets) {
          if (!processedAgents.has(target.id) && !agentQueue.find((a) => a.id === target.id)) {
            agentQueue.push(target);
          }
        }
      }
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

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
          try {
            await this.billingService.debitUsage(usageRow);
          } catch (e) {
            // Non-fatal: log only; stopping should still finalize UX
            console.warn('[STOP] Billing debit failed for mid-turn usage', {
              conversationId,
              usageId: usageRow.id,
            });
          }
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
      }
    }

    // Clear accumulators
    this.streamingContent.delete(conversationId);
    this.streamingToolCalls.delete(conversationId);
    this.streamingReasoning.delete(conversationId);
    // Leave assistantPersistedThisTurn as-is until next workflow_started clears it
  }

  /**
   * Generate a short, descriptive conversation title using a lightweight LLM (autopilot LLM node)
   * Records usage under the starship/conversation for billing.
   */
  private async generateConversationTitle(starshipId: string, conversationId: string, userContent: string): Promise<string | null> {
    try {
      const env = getEnvConfig();
      const openRouterKey = env.OPENROUTER_API_KEY || '';
      if (!openRouterKey) {
        console.warn('[TITLE] OPENROUTER_API_KEY missing; skipping title generation');
        return null;
      }

      // Hardcode a known, reliable OpenRouter model for titles
      const model = 'openai/gpt-4o-mini';

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

      // Use autopilot LLM node directly (no runner/engine). Secure env provides API key.
      const llm = new LLM(
        {
          model,
          messages: [
            { role: 'system' as const, content: sys },
            { role: 'user' as const, content: prompt },
          ],
          temperature: 0.3,
          maxTokens: 32,
        },
        { secureEnv: { OPEN_ROUTER_KEY: openRouterKey } }
      );
      console.log('[TITLE] Using model:', model);
      const items = await llm.execute();
      const res = (items?.[0]?.json || {}) as {
        model?: string;
        usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number };
        choices?: Array<{ message?: { content?: string } }>;
      };

      const choice = res?.choices?.[0]?.message?.content || '';
      const usage = res?.usage || null;
      const modelUsed = res?.model || model;

      // Record usage if provided by LLM (camelCase fields)
      try {
        if (usage && typeof usage.totalTokens === 'number') {
          await this.usageService
            .createUsageForTurn({
              starshipId,
              conversationId,
              promptTokens: Number(usage.promptTokens ?? 0),
              completionTokens: Number(usage.completionTokens ?? 0),
              totalTokens: Number(usage.totalTokens ?? 0),
              cost: Number(usage.cost ?? 0),
              model: String(modelUsed || model),
            })
            .then(async (row) => {
              try {
                await this.billingService.debitUsage(row);
              } catch (err) {
                console.warn('[TITLE] Billing debit failed:', err);
              }
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
      if (resolvedLog.length > 0) {
        console.log('[CONVERSATION-SERVICE] Mentions resolved:', resolvedLog);
      }
      return out;
    } catch {
      return [];
    }
  }

  async eventCallback(conversationId: string, event: AutopilotEvent): Promise<void> {
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
        // Reset cached usage for the new turn
        this.latestStreamingUsage.delete(conversationId);
        this.streamingToolCalls.delete(conversationId);
        this.streamingReasoning.delete(conversationId);
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
              const totalTokens = typeof uRec.totalTokens === 'number' ? uRec.totalTokens : Number(promptTokens) + Number(completionTokens);
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

          // Extract reasoning from known provider patterns (reasoning, thinking, and reasoning_details)
          const extractReasoning = (node: unknown): string => {
            try {
              if (!node || typeof node !== 'object') return '';
              const rec = node as Record<string, unknown>;
              const parts: string[] = [];

              // Unified fields
              const raw = (rec.reasoning ?? rec.thinking) as unknown;

              const appendFromRaw = (r: unknown): void => {
                if (!r) return;
                if (typeof r === 'string') {
                  parts.push(r);
                  return;
                }
                if (typeof r === 'object' && r !== null) {
                  const obj = r as Record<string, unknown>;
                  if (typeof obj.content === 'string') parts.push(obj.content);
                  if (Array.isArray(obj.tokens)) {
                    for (const t of obj.tokens as unknown[]) {
                      if (t && typeof t === 'object') {
                        const tr = t as Record<string, unknown>;
                        const text = typeof tr.text === 'string' ? tr.text : '';
                        const content = typeof tr.content === 'string' ? tr.content : '';
                        if (text) parts.push(text);
                        else if (content) parts.push(content);
                      }
                    }
                  }
                }
                if (Array.isArray(r)) {
                  for (const p of r as unknown[]) {
                    if (p && typeof p === 'object') {
                      const pr = p as Record<string, unknown>;
                      const text = typeof pr.text === 'string' ? pr.text : '';
                      const content = typeof pr.content === 'string' ? pr.content : '';
                      if (text) parts.push(text);
                      else if (content) parts.push(content);
                    }
                  }
                }
              };

              appendFromRaw(raw);

              // OpenRouter unified 'reasoning_details' chunks
              const details = rec.reasoning_details as unknown;
              if (Array.isArray(details)) {
                for (const d of details as unknown[]) {
                  if (d && typeof d === 'object') {
                    const det = d as Record<string, unknown>;
                    if (det.type === 'reasoning.text' && typeof det.text === 'string') {
                      parts.push(det.text);
                    }
                  }
                }
              }

              return parts.join('');
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
          if ((hasContent || hasToolCalls || hasReasoning) && !this.streamingContent.has(conversationId)) {
            if (this.streamingService.isActive(conversationId)) {
              // Acquire lock upfront to avoid race between parallel content_chunk events
              this.streamingContent.set(conversationId, '');
              this.placeholderEmitted.set(conversationId, true);
              // Clear toolCalls accumulator for this new stream to prevent reuse from previous LLM calls
              this.streamingToolCalls.delete(conversationId);

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
              if (!this.ringBuffer.has(conversationId)) this.ringBuffer.set(conversationId, []);
              // Skip shell broadcast; continue accumulating for persistence
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
              // Normalize against the latest base right before applying to avoid races/duplicates
              const latestBase = this.streamingContent.get(conversationId) || '';
              const currentLength = latestBase.length;
              const normalized = ConversationService.computeNonOverlappingAppend(latestBase, append);
              if (normalized.length === 0) {
                // Nothing new to append
              } else {
                const newContent = latestBase + normalized;
                this.streamingContent.set(conversationId, newContent);
                const newLen = (this.accumulatedLength.get(conversationId) || 0) + normalized.length;
                this.accumulatedLength.set(conversationId, newLen);
                const rb = this.ringBuffer.get(conversationId) || [];
                rb.push({ position: currentLength, content: normalized, ts: Date.now() });
                if (rb.length > 200) rb.splice(0, rb.length - 200);
                this.ringBuffer.set(conversationId, rb);

                // Stream delta chunk as JSON Patch add into chunks array
                const chunkDelta: Operation = {
                  op: 'add',
                  path: '/messages/-1/chunks/-',
                  value: {
                    content: normalized,
                    position: currentLength,
                    timestamp: Date.now(),
                  },
                };
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

                  // Accumulate arguments as string, parse later when complete
                  if (typeof rawTc?.function?.arguments === 'string') {
                    target.function.arguments = (target.function.arguments as string) + (rawTc.function.arguments as string);
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
                        // Try full JSON.parse first for complete JSON
                        argsObj = JSON.parse(argsStr);
                      } catch {
                        try {
                          // Use partial-json for incomplete JSON during streaming
                          argsObj = parsePartialJson(argsStr);
                        } catch {
                          // If both fail, use empty object
                          argsObj = {};
                        }
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
                      argsObj = JSON.parse(argsStr);
                    } catch {
                      try {
                        argsObj = parsePartialJson(argsStr);
                      } catch {
                        argsObj = {};
                      }
                    }
                  }
                  return {
                    id: tc?.id,
                    type: 'function' as const,
                    function: {
                      name: typeof tc?.function?.name === 'string' ? (tc.function!.name as string) : '',
                      arguments: argsObj, // Store as parsed object for UI
                    },
                  };
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

              try {
                await this.billingService.debitUsage(usageRow);
              } catch (e) {
                // Prepaid policy: decline and log; do not break streaming UX
                if (
                  e instanceof InsufficientFundsError ||
                  (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'INSUFFICIENT_FUNDS')
                ) {
                  console.warn('[BILLING] Insufficient funds for usage debit', {
                    starshipId: starship.id,
                    conversationId,
                    usageId: usageRow.id,
                    cost: usageRow.cost,
                  });
                  // Emit an inline system message so the user sees a clear CTA inside the chat
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
                  } catch (emitErr) {
                    console.error('[BILLING] Failed to emit insufficient funds system message:', emitErr);
                  }
                } else {
                  console.error('[BILLING] Debit failed', {
                    error: e instanceof Error ? e.message : String(e),
                    starshipId: starship.id,
                    conversationId,
                    usageId: usageRow.id,
                  });
                  // Emit a generic billing failure system message to inform the user
                  try {
                    const sys = await this.messageService.createMessage({
                      conversationId,
                      role: 'system',
                      content: 'Billing error detected while processing usage. Please try again or check Billing.',
                      messageType: 'error',
                    });
                    if (this.streamingService && this.streamingService.isActive(conversationId)) {
                      await this.streamingService.broadcastDelta(conversationId, {
                        op: 'add',
                        path: '/messages/-',
                        value: sys,
                      });
                    }
                  } catch (emitErr) {
                    console.error('[BILLING] Failed to emit billing error system message:', emitErr);
                  }
                }
              }
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
            // New SSE event: send as 'ui_action' for clean separation
            await this.streamingService.broadcastUIAction(conversationId, uiPayload);

            // Back-compat: also emit a lightweight assistant message containing the UI instruction payload.
            const now = new Date().toISOString();
            const uiMessage = {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              role: 'assistant',
              content: JSON.stringify(uiPayload),
              messageType: 'agent_response',
              createdAt: now,
              updatedAt: now,
            };
            await this.streamingService.broadcastDelta(conversationId, {
              op: 'add',
              path: '/messages/-',
              value: uiMessage,
            });
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

            console.log(`[STREAMING] node_completed: Checking messages. Last index: ${lastIndex}, Current count: ${stateMessages.length}`);

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
                const persistedMsg = await this.messageService.createMessage({
                  conversationId,
                  role,
                  content: lm.content,
                  messageType,
                  ...(toolCallId ? { toolCallId } : {}),
                  ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
                  ...(typeof lm.reasoning === 'string' && lm.reasoning.length > 0 ? { reasoning: lm.reasoning } : {}),
                  ...(agent ? { agentId: agent.id, agentName: agent.name } : {}),
                });

                // Mark that an assistant message has been persisted for this turn
                if (role === 'assistant') {
                  this.assistantPersistedThisTurn.add(conversationId);
                  // Reset streaming accumulators so subsequent assistant responses in the same turn
                  // get their own placeholder and can be persisted independently
                  this.streamingContent.delete(conversationId);
                  this.streamingReasoning.delete(conversationId);
                  this.streamingToolCalls.delete(conversationId);
                  this.ringBuffer.delete(conversationId);
                  this.activeStreamPersisted.delete(conversationId);
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

        // Clear streaming trackers now that the workflow turn has fully completed
        this.streamingContent.delete(conversationId);
        this.streamingToolCalls.delete(conversationId);
        this.streamingReasoning.delete(conversationId);
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
        break;
      }

      case 'tool_call_detected': {
        // Drop nested tool call detections (only emit from top-level LLM)
        if ((event.executionDepth ?? 0) > 0) {
          console.log('[STREAMING] Skipping nested tool_call_detected at depth', event.executionDepth);
          break;
        }

        const toolEvt = event as ToolEvent;

        // Broadcast tool_call_detected via ui_action event channel
        // This triggers UI form opening for specific tools like tool_create
        if (this.streamingService && this.streamingService.isActive(conversationId)) {
          const payload = {
            __ui_action: 'tool_call_detected',
            toolCallId: toolEvt.data?.toolCallId,
            toolName: toolEvt.data?.toolName,
          };
          await this.streamingService.broadcastUIAction(conversationId, payload);
        } else {
          console.warn('[STREAMING] ⚠️ StreamingService not active, cannot broadcast tool_call_detected');
        }
        break;
      }

      case 'tool_started': {
        const toolEvt = event as ToolEvent;
        console.log('[STREAMING] Tool started:', toolEvt.data?.toolName);
        break;
      }

      case 'tool_complete': {
        // Tool completion is now handled via state-based message persistence in node_completed
        // No persistence needed here - messages are added to state via mutations and persisted automatically
        const toolEvt = event as ToolEvent;
        console.log('[STREAMING] Tool completed:', toolEvt.data?.toolName);
        break;
      }

      default:
        break;
    }
  }
}
