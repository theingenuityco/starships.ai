/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentMemory, AgentMemoryState, AgentParams, Blueprint, EventCallback, ExecutionEvent } from '@starships/autopilot';
import { createError, NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository } from '@starships/models';
import type { AgentModel, ConversationRequest, ConversationResponse, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { AutopilotStreamService } from './AutopilotStreamService';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';

// LLM response data structure from autopilot LLM class
interface LlmResponseData {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  url?: string;
  llmResponse?: string;
  model?: string;
}

export interface ConversationStreamingRequest extends ConversationRequest {
  streamId: string;
  streamingService: StreamingService;
}

/**
 * Service class for managing agents and their execution
 */
export class AgentService {
  private agentRepository: AgentRepository;
  private messageService: MessageService;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.messageService = new MessageService();
  }

  // ============================================================================
  // AGENT MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new agent and return as AgentModel
   */
  async createAgent(data: CreateAgentRequest & { starshipId: string }): Promise<AgentModel> {
    const agentData = {
      name: data.name,
      description: data.description,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout || 30000,
      blueprint: data.blueprint,
      memory: data.memory,
    };

    return await this.agentRepository.create(agentData, data.starshipId);
  }

  /**
   * Update agent and return as AgentModel
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    // Validate blueprint if being updated
    if (updates.blueprint) {
      const validation = this.validateBlueprint(updates.blueprint);
      if (!validation.valid) {
        throw new ValidationError(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    return await this.agentRepository.update(agentId, updates as Partial<AgentModel>);
  }

  /**
   * Get agent by ID as AgentModel
   */
  async getAgent(agentId: string): Promise<AgentModel | null> {
    return await this.agentRepository.findById(agentId);
  }

  /**
   * Get agents by starship as AgentModel array
   */
  async getAgentsByStarship(starshipId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByStarshipId(starshipId);
  }

  /**
   * Search agents and return as AgentModel array
   */
  async searchAgents(query: string): Promise<AgentModel[]> {
    return await this.agentRepository.searchAgents(query);
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    return await this.agentRepository.delete(agentId);
  }

  /**
   * Update agent starship assignment (for routes layer)
   */
  async updateAgentStarship(agentId: string, starshipId: string): Promise<AgentModel | null> {
    // Check if agent exists first
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return await this.agentRepository.updateStarship(agentId, starshipId);
  }

  // ============================================================================
  // MODEL ↔ INSTANCE CONVERSION METHODS
  // ============================================================================

  /**
   * Convert AgentModel to Agent instance, storing model ID in instance metadata
   */
  async toInstance(agentModel: AgentModel): Promise<Agent> {
    const agentParams = {
      name: agentModel.name,
      description: agentModel.description,
      model: agentModel.model,
      temperature: agentModel.temperature,
      maxTokens: agentModel.maxTokens,
      timeout: agentModel.timeout,
      memory: agentModel.memory,
      blueprint: agentModel.blueprint,
      metadata: {
        id: agentModel.id,
      },
    } as AgentParams;
    const agentInstance = new Agent(agentParams);

    return agentInstance;
  }

  // ============================================================================
  // AGENT EXECUTION APIs
  // ============================================================================

  /**
   * Execute conversation with agent using ConversationRequest format with streaming support
   * Handles complete conversation lifecycle with event monitoring and message creation
   */
  static async executeConversationWithStreaming(request: ConversationStreamingRequest): Promise<ConversationResponse> {
    const { agentId, userId, message, conversationId, streamId, streamingService } = request;

    if (!agentId) {
      throw new ValidationError('agentId is required for conversation execution', 'agentId');
    }

    if (!streamId) {
      throw new ValidationError('streamId is required for streaming conversation execution', 'streamId');
    }

    console.log('🚀 [AGENT-SERVICE] Starting streaming conversation execution:', {
      agentId,
      userId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      conversationId,
      streamId,
      timestamp: new Date().toISOString(),
    });

    // Get agent from database
    const agentRepo = new AgentRepository();
    const agentModel = await agentRepo.findById(agentId);

    if (!agentModel) {
      throw new NotFoundError('Agent', agentId);
    }

    const startTime = Date.now();
    const agentService = new AgentService();

    try {
      // Create event handler with MessageService to add messages on each node completion
      const eventHandler = AgentService.createEventHandler({
        agentId: agentId,
        conversationId: conversationId,
        userId: userId,
        starshipId: 'unknown', // starshipId property no longer exists on AgentModel
        messageService: agentService.messageService,
        streamingService: streamingService,
        streamId: streamId,
      });

      // Create agent instance with enhanced options
      const agent = new Agent(agentModel);

      // Create and inject streaming service
      const autopilotStreamService = new AutopilotStreamService(streamingService, streamId, conversationId || 'unknown', agentId);

      // Inject streaming service into agent's engine
      agent.getEngine().setStreamingEmitter(autopilotStreamService);

      // Add user message to memory
      agent.addToMemory('user', message);

      // Execute agent with streaming-enabled execution
      const execution = await agent.execute(
        {
          currentNodeRef: undefined,
          status: 'not_started',
          executionResults: new Map(),
          agentMemory: agent.getMemory(),
          streaming: {
            enabled: true,
            streamId,
            conversationId,
            agentId,
          },
        },
        eventHandler
      );

      // Extract response from execution result
      const response = agentService.extractResponse(execution);

      // Calculate usage statistics
      const usage = agentService.calculateUsage(execution);

      // Note: incrementUsageCount functionality is not available in the updated AgentRepository
      // This would need to be implemented in the repository

      const executionTime = Date.now() - startTime;

      console.log('✅ [AGENT-SERVICE] Streaming conversation execution completed successfully:', {
        responseLength: response.length,
        executionTime,
        usageStats: usage,
      });

      return {
        source: 'agent',
        content: response,
        agentId: agentId,
        usage: {
          promptTokens: Math.floor(usage.totalTokens * 0.7), // Estimate prompt tokens
          completionTokens: Math.floor(usage.totalTokens * 0.3), // Estimate completion tokens
        },
      };
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        agentId,
        userId,
        streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Create error message in conversation
      await agentService.createErrorResponse(error as Error, {
        agentId,
        userId,
        conversationId,
        starshipId: 'unknown', // starshipId property no longer exists on AgentModel
      });

      throw error;
    }
  }

  /**
   * Execute conversation with agent using ConversationRequest format
   * Handles complete conversation lifecycle with event monitoring and message creation
   */
  static async executeConversation(request: ConversationRequest): Promise<ConversationResponse> {
    const { agentId, userId, message, conversationId } = request;

    if (!agentId) {
      throw new ValidationError('agentId is required for conversation execution', 'agentId');
    }

    console.log('🚀 [AGENT-SERVICE] Starting conversation execution:', {
      agentId,
      userId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      conversationId,
      timestamp: new Date().toISOString(),
    });

    // Get agent from database
    const agentRepo = new AgentRepository();
    const agentModel = await agentRepo.findById(agentId);

    if (!agentModel) {
      console.error('❌ [AGENT-SERVICE] Agent not found:', agentId);
      throw new NotFoundError('Agent', agentId);
    }

    console.log('✅ [AGENT-SERVICE] Database agent loaded:', {
      id: agentModel.id,
      name: agentModel.name,
      model: agentModel.model,
      hasBlueprint: !!agentModel.blueprint,
    });

    const startTime = Date.now();
    const agentService = new AgentService();

    try {
      // Create event handler with MessageService to add messages on each node completion
      const eventHandler = AgentService.createEventHandler({
        agentId: agentId,
        conversationId: conversationId,
        userId: userId,
        starshipId: 'unknown', // starshipId property no longer exists on AgentModel
        messageService: agentService.messageService,
      });

      // Create agent instance with enhanced options
      const agent = new Agent(agentModel);

      // Add user message to memory
      agent.addToMemory('user', message);

      // Execute agent with event monitoring
      const execution = await agent.execute(undefined, eventHandler);

      // Extract response from execution result
      const response = agentService.extractResponse(execution);

      // Calculate usage statistics
      const usage = agentService.calculateUsage(execution);

      // Note: incrementUsageCount functionality is not available in the updated AgentRepository
      // This would need to be implemented in the repository

      const executionTime = Date.now() - startTime;

      console.log('✅ [AGENT-SERVICE] Conversation execution completed successfully:', {
        responseLength: response.length,
        executionTime,
        usageStats: usage,
      });

      return {
        source: 'agent',
        content: response,
        agentId: agentId,
        usage: {
          promptTokens: Math.floor(usage.totalTokens * 0.7), // Estimate prompt tokens
          completionTokens: Math.floor(usage.totalTokens * 0.3), // Estimate completion tokens
        },
      };
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Conversation execution failed:', {
        agentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Create error message in conversation
      await agentService.createErrorResponse(error as Error, {
        agentId,
        userId,
        conversationId,
        starshipId: 'unknown', // starshipId property no longer exists on AgentModel
      });

      throw error;
    }
  }

  /**
   * Register event callback for agent execution monitoring with message creation
   */
  static createEventHandler(context: {
    agentId: string;
    conversationId?: string;
    userId?: string;
    starshipId?: string;
    messageService?: MessageService;
    streamingService?: any;
    streamId?: string;
  }): EventCallback {
    return async (event: ExecutionEvent) => {
      console.log(`[AGENT-SERVICE] Event: ${event.type}`, {
        agentId: context.agentId,
        conversationId: context.conversationId,
        userId: context.userId,
        currentNode: event.execution.currentNodeRef,
        status: event.execution.status,
        timestamp: event.timestamp,
        streaming: !!context.streamingService,
      });

      // Add custom event handling logic here based on event type
      switch (event.type) {
        case 'workflow_started':
          console.log(`[AGENT-SERVICE] Workflow started for agent ${context.agentId}`);
          await AgentService.handleWorkflowStarted(event, context);
          break;
        case 'node_started':
          console.log(`[AGENT-SERVICE] Node ${event.execution.currentNodeRef} started`);
          await AgentService.handleNodeStarted(event, context);
          break;
        case 'node_completed':
          console.log(`[AGENT-SERVICE] Node ${event.execution.currentNodeRef} completed`);
          await AgentService.handleNodeCompleted(event, context);
          break;
        case 'workflow_completed':
          console.log(`[AGENT-SERVICE] Workflow completed for agent ${context.agentId}`);
          await AgentService.handleWorkflowCompleted(event, context);
          break;
        case 'workflow_failed':
          console.error(`[AGENT-SERVICE] Workflow failed for agent ${context.agentId}:`, event.execution.error);
          await AgentService.handleWorkflowFailed(event, context);
          break;
        default:
          break;
      }
    };
  }

  /**
   * Handle workflow started event
   */
  private static async handleWorkflowStarted(
    event: ExecutionEvent,
    context: {
      agentId: string;
      conversationId?: string;
      userId?: string;
      starshipId?: string;
      messageService?: MessageService;
      streamingService?: any;
      streamId?: string;
    }
  ): Promise<void> {
    if (!context.conversationId || !context.starshipId || !context.messageService) {
      return;
    }

    try {
      const messageData = {
        role: 'system' as const,
        content: `🚀 Agent workflow started`,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'system_message' as const,
        importance: 'low' as const,
        processingStatus: 'completed' as const,
        metadata: {
          event: 'workflow_started',
          timestamp: event.timestamp,
        },
      };

      // Only create database message - streaming handled by AutopilotStreamService
      await context.messageService.createMessage(messageData);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to create workflow_started message:`, error);
    }
  }

  /**
   * Handle node started event
   */
  private static async handleNodeStarted(
    event: ExecutionEvent,
    context: {
      agentId: string;
      conversationId?: string;
      userId?: string;
      starshipId?: string;
      messageService?: MessageService;
      streamingService?: any;
      streamId?: string;
    }
  ): Promise<void> {
    if (!context.conversationId || !context.starshipId || !context.messageService) {
      return;
    }

    try {
      const messageData = {
        role: 'system' as const,
        content: `⏳ Starting node: ${event.execution.currentNodeRef}`,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'system_message' as const,
        importance: 'low' as const,
        processingStatus: 'completed' as const,
        metadata: {
          event: 'node_started',
          nodeRef: event.execution.currentNodeRef,
          timestamp: event.timestamp,
        },
      };

      // Only create database message - streaming handled by AutopilotStreamService
      await context.messageService.createMessage(messageData);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to create node_started message:`, error);
    }
  }

  /**
   * Handle node completed event - This is where each node completion creates a message
   */
  private static async handleNodeCompleted(
    event: ExecutionEvent,
    context: {
      agentId: string;
      conversationId?: string;
      userId?: string;
      starshipId?: string;
      messageService?: MessageService;
      streamingService?: any;
      streamId?: string;
    }
  ): Promise<void> {
    if (!context.conversationId || !context.starshipId || !context.messageService) {
      return;
    }

    try {
      // Get the node result from execution
      const nodeResult = event.execution.executionResults.get(event.execution.currentNodeRef || '');
      const nodeResultData = nodeResult?.data || {};
      const currentNodeRef = event.execution.currentNodeRef || '';

      // Check if nodeResult exists and has no error, then create assistant message with LLM response
      if (nodeResult && !nodeResult.error && nodeResult.data) {
        // Type the data as LLM response structure from autopilot LLM class
        const llmData = nodeResult.data as LlmResponseData;

        // Extract the actual LLM response content from the proper field
        const llmResponseContent = llmData.llmResponse;

        // Create assistant message with LLM response if we have content
        if (llmResponseContent && typeof llmResponseContent === 'string' && llmResponseContent.trim()) {
          const assistantMessageData = {
            role: 'assistant' as const,
            content: llmResponseContent.trim(),
            starshipId: context.starshipId,
            agentId: context.agentId,
            conversationId: context.conversationId,
            messageType: 'agent_response' as const,
            importance: 'high' as const,
            processingStatus: 'completed' as const,
            metadata: {
              event: 'llm_response',
              nodeRef: currentNodeRef,
              model: llmData.model,
              timestamp: event.timestamp,
            },
          };

          // Only create database message - streaming handled by AutopilotStreamService
          await context.messageService.createMessage(assistantMessageData);
        }
      }

      // Create system message for node completion tracking (for all nodes)
      const completionMessageData = {
        role: 'system' as const,
        content: `✅ Completed node: ${currentNodeRef}`,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'system_message' as const,
        importance: 'low' as const,
        processingStatus: 'completed' as const,
        metadata: {
          event: 'node_completed',
          nodeRef: currentNodeRef,
          nodeResult: nodeResultData,
          timestamp: event.timestamp,
        },
      };

      // Only create database message - streaming handled by AutopilotStreamService
      await context.messageService.createMessage(completionMessageData);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to create node_completed message:`, error);
    }
  }

  /**
   * Handle workflow completed event
   */
  private static async handleWorkflowCompleted(
    event: ExecutionEvent,
    context: {
      agentId: string;
      conversationId?: string;
      userId?: string;
      starshipId?: string;
      messageService?: MessageService;
      streamingService?: any;
      streamId?: string;
    }
  ): Promise<void> {
    if (!context.conversationId || !context.starshipId || !context.messageService) {
      return;
    }

    try {
      const messageData = {
        role: 'system' as const,
        content: `🎉 Agent workflow completed successfully`,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'system_message' as const,
        importance: 'medium' as const,
        processingStatus: 'completed' as const,
        metadata: {
          event: 'workflow_completed',
          timestamp: event.timestamp,
          executionResults: Array.from(event.execution.executionResults.keys()),
        },
      };

      // Only create database message - streaming handled by AutopilotStreamService
      await context.messageService.createMessage(messageData);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to create workflow_completed message:`, error);
    }
  }

  /**
   * Handle workflow failed event
   */
  private static async handleWorkflowFailed(
    event: ExecutionEvent,
    context: {
      agentId: string;
      conversationId?: string;
      userId?: string;
      starshipId?: string;
      messageService?: MessageService;
      streamingService?: any;
      streamId?: string;
    }
  ): Promise<void> {
    if (!context.conversationId || !context.starshipId || !context.messageService) {
      return;
    }

    try {
      const messageData = {
        role: 'system' as const,
        content: `❌ Agent workflow failed: ${event.execution.error?.message || 'Unknown error'}`,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'error' as const,
        importance: 'high' as const,
        processingStatus: 'completed' as const,
        metadata: {
          event: 'workflow_failed',
          error: event.execution.error,
          timestamp: event.timestamp,
        },
      };

      // Only create database message - streaming handled by AutopilotStreamService
      await context.messageService.createMessage(messageData);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to create workflow_failed message:`, error);
    }
  }

  /**
   * Create error response using raw error message
   */
  async createErrorResponse(
    error: Error,
    context: {
      agentId: string;
      userId?: string;
      conversationId?: string;
      starshipId: string;
    }
  ): Promise<ConversationResponse> {
    const errorMessage = error.message;
    const errorStack = error.stack;

    // Create raw error message via message service
    if (context.conversationId) {
      await this.messageService.createMessage({
        role: 'system',
        content: errorMessage,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        messageType: 'error',
        importance: 'high',
        processingStatus: 'completed',
        metadata: {
          errorMessage,
          errorStack,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Return raw error response
    return {
      source: 'agent',
      content: errorMessage,
      agentId: context.agentId,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
    };
  }

  /**
   * Extract response from autopilot agent execution result
   */
  private extractResponse(executionResult: any): string {
    if (executionResult.status !== 'completed') {
      throw createError(`Agent execution failed: ${executionResult.error?.message || 'Unknown error'}`, 500);
    }

    // Look for LLM response in execution results
    const results = Array.from(executionResult.executionResults.values()) as any[];

    // Find the last successful LLM response
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i] as any;
      if (!result.error && result.data) {
        // Check for different response formats
        if (typeof result.data === 'string') {
          return result.data;
        }
        if (result.data.content) {
          return result.data.content;
        }
        if (result.data.response) {
          return result.data.response;
        }
        if (result.data.output) {
          return result.data.output;
        }
      }
    }

    // Fallback: return a generic response
    return "I've processed your request successfully, but couldn't generate a specific response.";
  }

  /**
   * Calculate usage statistics from execution result
   */
  private calculateUsage(executionResult: any): any {
    // Extract usage information from execution results
    const results = Array.from(executionResult.executionResults.values()) as any[];
    let totalTokens = 0;
    let totalCost = 0;

    for (const result of results) {
      if (result.data?.usage) {
        totalTokens += result.data.usage.totalTokens || 0;
        totalCost += result.data.usage.cost || 0;
      }
    }

    return {
      totalTokens: totalTokens,
      cost: totalCost,
      modelCalls: results.filter((r: any) => !r.error).length,
    };
  }

  /**
   * Validate blueprint structure
   */
  private validateBlueprint(blueprint: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!blueprint.nodes || !Array.isArray(blueprint.nodes)) {
      errors.push('Blueprint must have a nodes array');
      return { valid: false, errors };
    }

    if (!blueprint.edges || !Array.isArray(blueprint.edges)) {
      errors.push('Blueprint must have an edges array');
      return { valid: false, errors };
    }

    // Check for start node
    const hasStartNode = blueprint.nodes.some((node: any) => node.type === 'start');
    if (!hasStartNode) {
      errors.push('Blueprint must have a start node');
    }

    // Check for end node
    const hasEndNode = blueprint.nodes.some((node: any) => node.type === 'end');
    if (!hasEndNode) {
      errors.push('Blueprint must have an end node');
    }

    // Validate edge references
    const nodeRefs = new Set(blueprint.nodes.map((n: any) => n.ref));
    for (const edge of blueprint.edges) {
      if (!nodeRefs.has(edge.from)) {
        errors.push(`Edge references non-existent node: ${edge.from}`);
      }
      if (!nodeRefs.has(edge.to)) {
        errors.push(`Edge references non-existent node: ${edge.to}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
