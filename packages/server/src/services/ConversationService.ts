import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { Agent, AutopilotEvent, ExecutionItemUtils, ChildProcessRunner } from '@starships/autopilot';
import type { ToolParams, ExecutionItem, AgentParams, ExecutionEvent } from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository, AgentRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
import { Operation } from 'fast-json-patch';
import { getEnvConfig } from '@starships/env';

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
  // Track accumulated content for streaming messages by conversation ID
  private streamingContent: Map<string, string> = new Map();
  // Track accumulated tool_calls during streaming per conversation
  private streamingToolCalls: Map<string, any[]> = new Map();
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
    // Choose default runner (child process) with proper limits
    this.defaultRunner = new ChildProcessRunner(ConversationService.AUTOPILOT_CONFIG);
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: ConversationModel & { starshipId: string; agentId?: string }): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
      status: 'active',
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
    return this.conversationRepository.getConversationMessages(conversationId, orderBy, orderDirection);
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

      const secureEnv: Record<string, string> = {
        STARSHIP_ID: starship.id,
        BASE_URL: baseUrl,
        ...(authToken ? { AUTH_TOKEN: authToken } : {}),
        ...(openRouterKey ? { OPEN_ROUTER_KEY: String(openRouterKey) } : {}),
      };

      const agentWithTools: AgentParams = {
        ...agentModel,
        state: {
          ...agentModel.state,
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

      // Convert database messages to LLM format, preserving tool_calls and tool results
      const llmMessages = messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      }));

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

    // Skip workflow control events from nested executions (e.g., tool blueprints) to avoid duplicates
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
      const executionEvent = event as ExecutionEvent;
      const executionDepth = executionEvent.data?.execution.depth || 0;

      if (executionDepth > 0) {
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
        // Do not clear pending finalization here; previous turn must finish to preserve event ordering
        break;
      }

      case 'content_chunk': {
        // Stream content chunks in real-time
        const chunkContent = event.data?.chunk;
        if (chunkContent && Array.isArray(chunkContent.choices) && chunkContent.choices.length > 0) {
          const delta = chunkContent.choices[0]?.delta;
          const hasContent = delta?.content;
          const hasToolCalls = delta?.tool_calls && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0;

          // Guard: if no active accumulator and we have content OR tool_calls, start a new placeholder stream.
          // Acquire the placeholder "lock" BEFORE any awaits to prevent duplicate shells from concurrent chunks.
          if ((hasContent || hasToolCalls) && !this.streamingContent.has(conversationId)) {
            if (this.streamingService.isActive(conversationId)) {
              // Acquire lock upfront to avoid race between parallel content_chunk events
              this.streamingContent.set(conversationId, '');
              // Clear tool_calls accumulator for this new stream to prevent reuse from previous LLM calls
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
                  tool_calls: [], // Initialize empty tool_calls array for replace operations
                },
              };
              await this.streamingService.broadcastDelta(conversationId, shell);
            } else {
              break;
            }
          }

          // Process content if present
          if (hasContent) {
            const content = String(delta.content);

            // Track accumulated content server-side for completion event
            const currentContent = this.streamingContent.get(conversationId) || '';
            const currentLength = currentContent.length;
            const newContent = currentContent + content;
            this.streamingContent.set(conversationId, newContent);

            // Stream delta chunk as JSON Patch add into chunks array (no cumulative replace)
            const chunkDelta: Operation = {
              op: 'add',
              path: '/messages/-1/chunks/-',
              value: {
                content,
                position: currentLength,
                timestamp: Date.now(),
              },
            };
            await this.streamingService.broadcastDelta(conversationId, chunkDelta);
          }

          // Process tool_calls if present (separate from content processing)
          if (hasToolCalls) {
            try {
              const toolCallsDelta = delta.tool_calls || [];
              const acc = this.streamingToolCalls.get(conversationId) || [];

              for (const rawTc of toolCallsDelta as any[]) {
                const idx = typeof rawTc?.index === 'number' ? rawTc.index : 0;

                // Ensure slot only for the referenced index; do not pre-fill earlier indices
                if (!acc[idx]) {
                  acc[idx] = { id: undefined, type: 'function', function: { name: undefined, arguments: '' } };
                }

                const target = acc[idx];
                if (rawTc?.id) target.id = rawTc.id;
                if (rawTc?.function?.name) target.function.name = rawTc.function.name;
                if (typeof rawTc?.function?.arguments === 'string') {
                  target.function.arguments = (target.function.arguments || '') + rawTc.function.arguments;
                }
              }

              this.streamingToolCalls.set(conversationId, acc);

              // Only broadcast valid tool calls (those with a non-empty function name)
              const toolCallsValue = acc
                .filter((tc) => !!tc && typeof tc.function?.name === 'string' && tc.function.name.length > 0)
                .map((tc) => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.function.name,
                    arguments: tc.function?.arguments || '',
                  },
                }));

              const toolCallsOperation: Operation = {
                op: 'replace',
                path: '/messages/-1/tool_calls',
                value: toolCallsValue,
              };

              await this.streamingService.broadcastDelta(conversationId, toolCallsOperation);
            } catch (e) {
              // ignore tool_call parse errors to avoid breaking streaming
              console.warn('[STREAMING] Tool call processing error:', e);
            }
          }
        }
        break;
      }

      case 'content_complete': {
        // Guard: if there's no active stream (no accumulator), ignore completion to avoid corrupting state
        if (!this.streamingContent.has(conversationId)) {
          break;
        }

        const finalContent = this.streamingContent.get(conversationId) || '';
        const finalToolCallsAcc = this.streamingToolCalls.get(conversationId) || [];
        const validToolCalls = finalToolCallsAcc.filter(
          (tc) => !!tc && typeof tc.function?.name === 'string' && tc.function.name.length > 0
        );

        // Build finalization task: ensure final patches and persistence complete in order.
        try {
          // Content was already incrementally streamed to /messages/-1/content during chunks

          // Persist and patch id/updatedAt while placeholder is still active.
          // Persist if we have content OR at least one valid tool_call (tool-only responses).
          if ((finalContent && finalContent.trim().length > 0) || validToolCalls.length > 0) {
            try {
              const assistantMessage = await this.messageService.createMessage({
                conversationId,
                role: 'assistant',
                content: finalContent,
                messageType: 'agent_response',
                ...(validToolCalls.length > 0 && {
                  tool_calls: validToolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.function.name,
                      arguments: tc.function?.arguments || '',
                    },
                  })),
                }),
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
            } catch (persistError) {
              console.error('[STREAMING] Failed saving assistant message on content_complete:', persistError);
            }
          } else {
            console.log('[STREAMING] Skipping persistence - empty content and no valid tool_calls');
          }

          // Defer streaming=false and chunks removal to workflow_completed to avoid premature client close
        } finally {
          // Always clear trackers when we are done with finalization
          this.streamingContent.delete(conversationId);
          this.streamingToolCalls.delete(conversationId);
        }
        break;
      }

      case 'node_started': {
        // Node started
        break;
      }

      case 'node_completed': {
        // Handle tool node completion - persist tool result messages
        // Note: Due to type constraints, we'll handle tool result persistence differently
        console.log('[STREAMING] Node completed event received');
        // Other persistence is handled on 'content_complete' to ensure final content is available and avoid race conditions.
        break;
      }

      case 'workflow_completed': {
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
        console.error('[STREAMING] Workflow failed:', event.data?.execution?.error);

        // Create error message
        const errorMessage = await this.messageService.createMessage({
          conversationId,
          role: 'system',
          content: `❌ Workflow failed: ${event.data?.execution?.error || 'Unknown error'}`,
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

      case 'tool_started': {
        console.log('[STREAMING] Tool started:', event.data?.toolName);
        // Tool started - we can optionally broadcast this or track it
        break;
      }

      case 'tool_complete': {
        console.log('[STREAMING] Tool completed:', event.data?.toolName);

        // Track persistence as an async task so workflow_completed can await before emitting "complete"
        const persistTask = (async () => {
          try {
            // Persist tool_result for both success (result) and failure (error)
            if (event.data?.toolName && (event.data?.result !== undefined || event.data?.error)) {
              const toolContent =
                event.data?.result !== undefined
                  ? typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result)
                  : String(event.data?.error || 'Unknown tool error');

              const toolResultMessage = await this.messageService.createMessage({
                conversationId,
                role: 'tool',
                content: toolContent,
                messageType: 'tool_result',
                ...(event.data.toolCallId && { tool_call_id: event.data.toolCallId }),
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
