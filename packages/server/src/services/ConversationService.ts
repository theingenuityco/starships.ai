import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { EnvironmentService } from '@/services/EnvironmentService';
import { UsageService } from '@/services/UsageService';
import { Agent, AutopilotEvent, ExecutionItemUtils, ChildProcessRunner } from '@starships/autopilot';
import type { ToolParams, ExecutionItem, AgentParams, ExecutionEvent, LLMEvent, ToolEvent } from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository, AgentRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
import { Operation } from 'fast-json-patch';
import { getEnvConfig } from '@starships/env';
import { parse as parsePartialJson } from 'partial-json';

/**
 * Autopilot child process configuration
 */
interface AutopilotConfig {
  memoryLimitMB: number;
  timeoutMs: number;
  killGraceMs: number;
}

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private agentRepository: AgentRepository;
  private messageService: MessageService;
  private streamingService: StreamingService;
  private environmentService: EnvironmentService;
  private usageService: UsageService;
  // Track accumulated content for streaming messages by conversation ID
  private streamingContent: Map<string, string> = new Map();
  // Track accumulated toolCalls during streaming per conversation
  private streamingToolCalls: Map<string, any[]> = new Map();
  // Track accumulated reasoning during streaming per conversation
  private streamingReasoning: Map<string, string> = new Map();
  // Default runner for non-streaming paths (child process)
  private defaultRunner: ChildProcessRunner;

  // Autopilot configuration
  private static readonly AUTOPILOT_CONFIG: AutopilotConfig = {
    memoryLimitMB: 256, // 256MB memory limit
    timeoutMs: 60000, // 60 second timeout
    killGraceMs: 5000, // 5 second grace period
  };

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.agentRepository = new AgentRepository();
    this.messageService = new MessageService();
    this.streamingService = new StreamingService();
    this.environmentService = new EnvironmentService();
    this.usageService = new UsageService();
    // Choose default runner (child process) with proper limits
    this.defaultRunner = new ChildProcessRunner(ConversationService.AUTOPILOT_CONFIG);
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
  async getConversationMessages(
    conversationId: string,
    orderBy: 'createdAt' = 'createdAt',
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Promise<MessageModel[]> {
    return this.conversationRepository.getConversationMessages(conversationId, orderDirection);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
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
      const toolParams: ToolParams[] = deployedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        blueprint: tool.blueprint, // Use the actual blueprint from the deployed instance
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

    const agentModels = await this.getConversationAgents(data.conversationId);
    if (agentModels.length < 1) {
      throw new NotFoundError('Agent', `for Conversation ${data.conversationId}`);
    }
    // only first agent for now
    const agentModel = agentModels[0];

    const conversation = await this.getConversationById(data.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', data.conversationId);
    }

    // Get conversation messages from database
    const messages = await this.getConversationMessages(data.conversationId);

    try {
      // Get starship for context
      const starship = await this.getConversationStarship(data.conversationId);
      if (!starship) {
        throw new NotFoundError('Starship', 'for conversation');
      }

      // Get deployed tools for this agent using ToolService
      const resolvedTools = await this.getAgentTools(agentModel.id, starship.id);
      // console.log('>>>Resolved tools', { resolvedTools });

      // Build Agent to materialize blueprint (tools, nodes, etc.)
      const env = getEnvConfig();
      const baseUrl = `${env.SERVER_URL}/api/v1`;
      const rawAuth = ctx?.authorization ?? '';
      const authToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
      const openRouterKey = env.OPENROUTER_API_KEY || '';

      // Get user-defined encrypted environment variables for this starship
      const starshipEnv = await this.environmentService.getDecryptedEnvironment(starship.id);

      const secureEnv: Record<string, string> = {
        // System variables (read-only)
        STARSHIP_ID: starship.id,
        BASE_URL: baseUrl,
        ...(authToken ? { AUTH_TOKEN: authToken } : {}),
        ...(openRouterKey ? { OPEN_ROUTER_KEY: String(openRouterKey) } : {}),
        // User-defined variables (from encrypted storage)
        ...starshipEnv,
      };

      // Guard against NULL/undefined persisted JSONB state (now nullable)
      const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

      const agentWithTools: AgentParams = {
        ...agentModel,
        state: {
          ...baseState,
          tools: resolvedTools,
          // Do not inject secrets into state
          starshipId: starship.id,
        },
      };

      // Create Agent with secureEnv for eval across all nodes
      const agent = new Agent(agentWithTools, {
        eventCallback: (event) => this.eventCallback(data.conversationId, event),
        secureEnv,
      });

      // Convert database messages to OpenRouter format
      // OpenRouter standardizes format and translates to provider-specific formats automatically
      const llmMessages = messages.map((msg) => {
        const baseMessage: any = {
          role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
          content: msg.content,
        };

        // Add reasoning if present
        if (msg.reasoning) {
          baseMessage.reasoning = msg.reasoning;
        }

        // For assistant messages with tool calls, use OpenRouter snake_case format
        if (msg.role === 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls)) {
          baseMessage.tool_calls = msg.toolCalls.map((tc: any) => ({
            id: tc.id,
            type: tc.type || 'function',
            function: {
              name: tc.function?.name,
              arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}),
            },
          }));
        }

        // For tool result messages, use OpenRouter snake_case format
        // OpenRouter translates tool_call_id to provider-specific format (e.g., tool_use_id for Anthropic)
        if (msg.role === 'tool' && msg.toolCallId) {
          baseMessage.tool_call_id = msg.toolCallId;
        }

        return baseMessage;
      });

      // Prepare input for agent execution - Agent will handle memory state and ordering internally
      const input: ExecutionItem[] = ExecutionItemUtils.wrapSingle(llmMessages);

      // Execute via agent - runner and event callback are configured in the Agent constructor
      await agent.execute(input);

      // Note: broadcastComplete is now called at the end of content_complete event handler
      // to ensure all delta operations are sent before the complete event
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        agentId: agentModel.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Send error via streaming if available
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
        this.streamingToolCalls.delete(conversationId);
        this.streamingReasoning.delete(conversationId);
        // Do not clear pending finalization here; previous turn must finish to preserve event ordering
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
          const choice0: any = chunkContent.choices[0] || {};
          const delta: any = choice0?.delta || {};
          const messageNode: any = choice0?.message || {};

          const contentFromDelta = typeof delta?.content === 'string' ? delta.content : '';
          const contentFromMessage = typeof messageNode?.content === 'string' ? messageNode.content : '';
          const hasContent = (contentFromDelta && contentFromDelta.length > 0) || (contentFromMessage && contentFromMessage.length > 0);

          const toolCallsFromDelta: any[] = Array.isArray(delta?.toolCalls) ? delta.toolCalls : [];
          const toolCallsFromMessage: any[] = Array.isArray(messageNode?.toolCalls) ? messageNode.toolCalls : [];
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

              const shell: Operation = {
                op: 'add',
                path: '/messages/-',
                value: {
                  ...assistantMessage,
                  streaming: true,
                  chunks: [], // Initialize array so JSON Patch add to /chunks/- is valid
                  reasoningChunks: [], // Initialize array so JSON Patch add to /reasoningChunks/- is valid
                  toolCalls: [], // Initialize empty toolCalls array for replace operations
                },
              };
              await this.streamingService.broadcastDelta(conversationId, shell);
            } else {
              break;
            }
          }

          // Process content if present (prefer delta token chunks; fall back to full message content snapshot with diffing)
          if (hasContent) {
            const incremental = contentFromDelta || '';
            const snapshot = contentFromMessage || '';

            // Track accumulated content server-side for completion event
            const currentContent = this.streamingContent.get(conversationId) || '';
            const currentLength = currentContent.length;

            // Compute the append text:
            // - If incremental tokens exist, append them directly.
            // - Else if we only have snapshot, append the new suffix beyond what we've already accumulated.
            let append = '';
            if (incremental) {
              append = incremental;
            } else if (snapshot) {
              append = snapshot.slice(currentLength);
            }

            if (append) {
              const newContent = currentContent + append;
              this.streamingContent.set(conversationId, newContent);

              // Stream delta chunk as JSON Patch add into chunks array
              const chunkDelta: Operation = {
                op: 'add',
                path: '/messages/-1/chunks/-',
                value: {
                  content: append,
                  position: currentLength,
                  timestamp: Date.now(),
                },
              };
              await this.streamingService.broadcastDelta(conversationId, chunkDelta);
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
              appendR = snapshotR.slice(currentRLength);
            }

            if (appendR) {
              const newR = currentR + appendR;
              this.streamingReasoning.set(conversationId, newR);

              // Stream delta chunk for reasoning
              const rChunkDelta: Operation = {
                op: 'add',
                path: '/messages/-1/reasoningChunks/-',
                value: {
                  content: appendR,
                  position: currentRLength,
                  timestamp: Date.now(),
                },
              };
              await this.streamingService.broadcastDelta(conversationId, rChunkDelta);
            }
          }

          // Process toolCalls if present (prefer true delta updates; otherwise, broadcast snapshot from message)
          if (hasToolCalls) {
            try {
              if (toolCallsFromDelta.length > 0) {
                const acc = this.streamingToolCalls.get(conversationId) || [];

                for (const rawTc of toolCallsFromDelta as any[]) {
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
                    target.function.arguments = (target.function.arguments as string) + rawTc.function.arguments;
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
                const normalized = toolCallsFromMessage.map((tc: any) => {
                  const argsStr = typeof tc?.function?.arguments === 'string' ? tc.function.arguments : '';
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
                    type: 'function',
                    function: {
                      name: tc?.function?.name,
                      arguments: argsObj, // Store as parsed object
                    },
                  };
                });

                this.streamingToolCalls.set(conversationId, normalized);

                // Broadcast only valid entries (non-empty function name)
                await this.streamingService.broadcastDelta(conversationId, {
                  op: 'replace',
                  path: '/messages/-1/toolCalls',
                  value: normalized.filter((tc) => typeof tc.function?.name === 'string' && tc.function.name.length > 0),
                });
              }
            } catch (e) {
              // ignore toolCall parse errors to avoid breaking streaming
              console.warn('[STREAMING] Tool call processing error:', e);
            }
          }
        }
        break;
      }

      case 'content_complete': {
        // Drop nested LLM completion events (depth>0)
        if ((event.executionDepth ?? 0) > 0) {
          break;
        }
        // Guard: if there's no active stream AND no accumulated tool calls, ignore completion
        // (tool-only responses may not have content stream but still need persistence)
        const hasToolCalls = this.streamingToolCalls.has(conversationId) && (this.streamingToolCalls.get(conversationId)?.length || 0) > 0;
        if (!this.streamingContent.has(conversationId) && !hasToolCalls) {
          break;
        }

        // Extract provider-reported usage (from LLMEvent.data.usage)
        const llmEvent = event as LLMEvent;
        const llmUsage = llmEvent.data?.usage;
        const model = llmEvent.data?.model;

        // Build a strongly-typed usage payload with required numeric fields
        // LLMUsage now uses camelCase - pass directly to UsageService
        const usagePayload = llmUsage
          ? {
              promptTokens: typeof llmUsage.promptTokens === 'number' ? llmUsage.promptTokens : 0,
              completionTokens: typeof llmUsage.completionTokens === 'number' ? llmUsage.completionTokens : 0,
              totalTokens:
                typeof llmUsage.totalTokens === 'number'
                  ? llmUsage.totalTokens
                  : (typeof llmUsage.promptTokens === 'number' ? llmUsage.promptTokens : 0) +
                    (typeof llmUsage.completionTokens === 'number' ? llmUsage.completionTokens : 0),
              // Cost in USD (OpenRouter usage.cost). Mandatory; default to 0 if missing.
              cost: Number(llmUsage.cost) || 0,
              ...(typeof model === 'string' ? { model } : {}),
            }
          : undefined;
        /**
         * Persist usage at end-of-turn (no per-token streaming). This records usage in the Usage model
         * and links it to both Starship and Conversation.
         */
        if (usagePayload) {
          try {
            const starship = await this.getConversationStarship(conversationId);
            if (starship) {
              // Create usage record
              const usageRecord = await this.usageService.createUsageForTurn({
                starshipId: starship.id,
                conversationId,
                promptTokens: usagePayload.promptTokens,
                completionTokens: usagePayload.completionTokens,
                totalTokens: usagePayload.totalTokens,
                cost: usagePayload.cost,
                model: usagePayload.model,
              });

              // Deduct credits for usage (enforced - fail the turn if credit deduction fails or insufficient)
              try {
                const { CreditService } = await import('@/services/CreditService');
                const creditService = new CreditService();
                await creditService.ensureBalanceRow(starship.ownerId);
                const deductResult = await creditService.deductForUsage(starship.ownerId, usagePayload.cost, usageRecord.id);

                if (!deductResult.ok) {
                  const message = `Insufficient credits. Required: $${Number(usagePayload.cost).toFixed(4)}, available: $${Number(
                    deductResult.remaining || 0
                  ).toFixed(4)}. Please top up to continue.`;

                  console.warn(`[CREDITS] ${message}`);

                  // Broadcast error to streaming clients
                  if (this.streamingService && this.streamingService.isActive(conversationId)) {
                    await this.streamingService.broadcastError(conversationId, {
                      streamId: conversationId,
                      errorCode: 'INSUFFICIENT_CREDITS',
                      message,
                      timestamp: new Date().toISOString(),
                      recoverable: false,
                    });
                  }

                  // Persist error message into timeline
                  const errorMessage = await this.messageService.createMessage({
                    conversationId,
                    role: 'system',
                    content: `❌ ${message}`,
                    messageType: 'error',
                  });

                  if (this.streamingService && this.streamingService.isActive(conversationId)) {
                    const delta: Operation = {
                      op: 'add',
                      path: '/messages/-',
                      value: errorMessage,
                    };
                    await this.streamingService.broadcastDelta(conversationId, delta);
                  }

                  // Update conversation status to archived to prevent further turns
                  await this.updateConversationStatus(conversationId, 'archived');

                  // Clear streaming accumulators and abort finalization
                  this.streamingContent.delete(conversationId);
                  this.streamingToolCalls.delete(conversationId);
                  this.streamingReasoning.delete(conversationId);

                  return;
                } else {
                  console.log(
                    `[CREDITS] Deducted ${usagePayload.cost} credits from user ${starship.ownerId}, remaining: ${deductResult.remaining}`
                  );
                }
              } catch (creditError) {
                console.error('[CREDITS] Failed to deduct credits:', creditError);

                const message = 'Credit deduction failed. Please try again later or contact support.';
                if (this.streamingService && this.streamingService.isActive(conversationId)) {
                  await this.streamingService.broadcastError(conversationId, {
                    streamId: conversationId,
                    errorCode: 'CREDIT_DEDUCTION_FAILED',
                    message,
                    timestamp: new Date().toISOString(),
                    recoverable: false,
                  });
                }

                const errorMessage = await this.messageService.createMessage({
                  conversationId,
                  role: 'system',
                  content: `❌ ${message}`,
                  messageType: 'error',
                });

                if (this.streamingService && this.streamingService.isActive(conversationId)) {
                  const delta: Operation = {
                    op: 'add',
                    path: '/messages/-',
                    value: errorMessage,
                  };
                  await this.streamingService.broadcastDelta(conversationId, delta);
                }

                await this.updateConversationStatus(conversationId, 'archived');

                this.streamingContent.delete(conversationId);
                this.streamingToolCalls.delete(conversationId);
                this.streamingReasoning.delete(conversationId);

                return;
              }
            }
          } catch (e) {
            console.error('[STREAMING] Failed to persist usage record:', e);
          }
        }

        const finalContent = this.streamingContent.get(conversationId) || '';
        const finalReasoning = this.streamingReasoning.get(conversationId) || '';
        const finalToolCallsAcc = this.streamingToolCalls.get(conversationId) || [];

        const validToolCalls = finalToolCallsAcc.filter(
          (tc) => !!tc && typeof tc.function?.name === 'string' && tc.function.name.length > 0
        );
        // Build finalization task: ensure final patches and persistence complete in order.
        try {
          // Content was already incrementally streamed to /messages/-1/content during chunks

          // Persist and patch id/updatedAt while placeholder is still active.
          // Persist if we have content OR at least one valid toolCall (tool-only responses).
          if (
            (finalContent && finalContent.trim().length > 0) ||
            validToolCalls.length > 0 ||
            (finalReasoning && finalReasoning.trim().length > 0)
          ) {
            try {
              // Parse accumulated arguments strings into objects for database storage
              const toolCallsForDb = validToolCalls.map((tc) => {
                let argsObj: unknown = {};
                const argsStr = tc.function?.arguments;

                // Arguments accumulated as strings, parse them now
                if (typeof argsStr === 'string') {
                  if (argsStr === '' || !argsStr.trim()) {
                    argsObj = {};
                  } else {
                    try {
                      argsObj = JSON.parse(argsStr);
                    } catch {
                      console.warn('[DEBUG] Failed to parse tool arguments, using empty object:', argsStr);
                      argsObj = {};
                    }
                  }
                } else {
                  argsObj = argsStr ?? {};
                }

                return {
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.function.name,
                    arguments: argsObj, // Parsed object for JSONB storage
                  },
                };
              });

              const assistantMessage = await this.messageService.createMessage({
                conversationId,
                role: 'assistant',
                content: finalContent,
                messageType: 'agent_response',
                ...(finalReasoning && { reasoning: finalReasoning }),
                ...(validToolCalls.length > 0 && { toolCalls: toolCallsForDb }),
              });

              await this.streamingService.broadcastDelta(conversationId, {
                op: 'replace',
                path: '/messages/-1/id',
                value: assistantMessage.id,
              });

              await this.streamingService.broadcastDelta(conversationId, {
                op: 'replace',
                path: '/messages/-1/updatedAt',
                value: assistantMessage.updatedAt,
              });

              // Finalize message content with one replace of the full text (clients will stop using chunks)
              if (finalContent && finalContent.trim().length > 0) {
                await this.streamingService.broadcastDelta(conversationId, {
                  op: 'replace',
                  path: '/messages/-1/content',
                  value: finalContent,
                });
              }
              // Finalize reasoning text
              if (finalReasoning && finalReasoning.trim().length > 0) {
                await this.streamingService.broadcastDelta(conversationId, {
                  op: 'replace',
                  path: '/messages/-1/reasoning',
                  value: finalReasoning,
                });
              }
            } catch (persistError) {
              console.error('[STREAMING] Failed saving assistant message on content_complete:', persistError);
            }
          } else {
            console.log('[STREAMING] Skipping persistence - empty content and no valid toolCalls');
          }

          // Defer streaming=false and chunks removal to workflow_completed to avoid premature client close
        } finally {
          // Always clear trackers when we are done with finalization
          this.streamingContent.delete(conversationId);
          this.streamingToolCalls.delete(conversationId);
          this.streamingReasoning.delete(conversationId);
        }
        break;
      }

      case 'node_started': {
        // Node started
        break;
      }

      case 'node_completed': {
        // Handle tool node completion - persist tool result messages
        // Also detect UI actions emitted by code/end nodes and forward them to the client via SSE
        try {
          const execEvent = event as ExecutionEvent;
          const execution: any = execEvent?.data?.execution;
          const results: any[] = Array.isArray(execution?.results) ? execution.results : [];

          // Walk results from the end to find a JSON payload that declares a UI action
          let uiPayload: any = null;
          for (let i = results.length - 1; i >= 0 && !uiPayload; i--) {
            const items = Array.isArray(results[i]?.items) ? results[i].items : [];
            for (let j = items.length - 1; j >= 0 && !uiPayload; j--) {
              const json = items[j]?.json && typeof items[j].json === 'object' ? items[j].json : null;
              if (!json) continue;
              if (json && (json as any).__ui_action) {
                uiPayload = json;
                break;
              }
              const maybeResult = (json as any)?.result;
              if (maybeResult && typeof maybeResult === 'object' && (maybeResult as any).__ui_action) {
                uiPayload = maybeResult;
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

        // Other persistence is handled on 'content_complete' to ensure final content is available and avoid race conditions.
        break;
      }

      case 'workflow_completed': {
        // console.log('Execution >>>', JSON.stringify(event.data?.execution, null, 2));
        // Just before emitting "complete", finalize the assistant placeholder so UIs see the finished state
        // (but not earlier to avoid client prematurely closing the SSE on streaming=false).
        if (this.streamingService && this.streamingService.isActive(conversationId)) {
          try {
            await this.streamingService.broadcastDelta(conversationId, {
              op: 'replace',
              path: '/messages/-1/streaming',
              value: false,
            });
          } catch (_) {
            // ignore
          }

          // Yield a tick to allow the streaming=false patch to flush before emitting 'complete'
          await new Promise<void>((resolve) => {
            if (typeof setImmediate !== 'undefined') {
              setImmediate(resolve);
            } else {
              setTimeout(resolve, 0);
            }
          });

          // Now emit stream completion for the entire workflow (top-level only)
          await this.streamingService.broadcastComplete(conversationId, {
            source: 'agent',
            content: 'Workflow completed',
            agentId: 'agent', // agent id not critical for client-side terminal handling
            scope: 'workflow',
            conversationId,
          });
        }
        break;
      }

      case 'workflow_failed': {
        const execEvent = event as ExecutionEvent;
        console.error('[STREAMING] Workflow failed:', execEvent.data?.execution?.error);

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
        console.log('[STREAMING] 🎯 Tool call detected at depth 0:', {
          toolName: toolEvt.data?.toolName,
          toolCallId: toolEvt.data?.toolCallId,
          conversationId,
          isActive: this.streamingService?.isActive(conversationId),
        });

        // Broadcast tool_call_detected via ui_action event channel
        // This triggers UI form opening for specific tools like tool_create
        if (this.streamingService && this.streamingService.isActive(conversationId)) {
          const payload = {
            __ui_action: 'tool_call_detected',
            toolCallId: toolEvt.data?.toolCallId,
            toolName: toolEvt.data?.toolName,
          };
          console.log('[STREAMING] 📤 Broadcasting ui_action:', payload);
          await this.streamingService.broadcastUIAction(conversationId, payload);
          console.log('[STREAMING] ✅ ui_action broadcast complete');
        } else {
          console.warn('[STREAMING] ⚠️  StreamingService not active, cannot broadcast tool_call_detected');
        }
        break;
      }

      case 'tool_started': {
        const toolEvt = event as ToolEvent;
        console.log('[STREAMING] Tool started:', toolEvt.data?.toolName);
        break;
      }

      case 'tool_complete': {
        const toolEvt = event as ToolEvent;
        console.log('[STREAMING] Tool completed:', toolEvt.data?.toolName);

        // Depth-based guard: drop nested tool executions (keep only top-level where executionDepth === 0)
        if ((event.executionDepth ?? 0) > 0) {
          break;
        }

        // Track persistence as an async task so workflow_completed can await before emitting "complete"
        const persistTask = (async () => {
          try {
            // Persist tool_result for both success (result) and failure (error)
            if (toolEvt.data?.toolName && (toolEvt.data?.result !== undefined || toolEvt.data?.error)) {
              const toolContent =
                toolEvt.data?.result !== undefined
                  ? typeof toolEvt.data.result === 'string'
                    ? toolEvt.data.result
                    : JSON.stringify(toolEvt.data.result)
                  : String(toolEvt.data?.error || 'Unknown tool error');

              const toolResultMessage = await this.messageService.createMessage({
                conversationId,
                role: 'tool',
                content: toolContent,
                messageType: 'tool_result',
                ...(toolEvt.data?.toolCallId ? { toolCallId: toolEvt.data.toolCallId } : {}),
              });

              console.log('[STREAMING] Successfully persisted tool result message:', toolResultMessage.id);

              if (this.streamingService && this.streamingService.isActive(conversationId)) {
                const toolResultDelta: Operation = {
                  op: 'add',
                  path: '/messages/-',
                  value: toolResultMessage,
                };
                await this.streamingService.broadcastDelta(conversationId, toolResultDelta);
              }
            }
          } catch (error) {
            console.error('[STREAMING] Error persisting tool result message:', error);
          }
        })();

        // Optionally await to preserve event order for this handler
        await persistTask;

        break;
      }

      default:
        break;
    }
  }
}
