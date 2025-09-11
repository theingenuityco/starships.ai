/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentParams } from '@starships/autopilot';
import { createError, NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository } from '@starships/models';
import type { AgentModel, ConversationRequest, ConversationResponse, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { AutopilotStreamService } from './AutopilotStreamService';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';

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
      // Create agent instance with enhanced options
      const agent = new Agent(agentModel);

      // Create and inject streaming service
      const autopilotStreamService = new AutopilotStreamService(streamingService, streamId, conversationId || 'unknown', agentId);

      // Inject streaming service into agent's engine
      agent.getEngine().setEmitter(autopilotStreamService);

      // Add user message to memory
      agent.addToMemory('user', message);

      // Execute agent with streaming-enabled execution
      const execution = await agent.execute({
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
      });

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
      // Create agent instance with enhanced options
      const agent = new Agent(agentModel);

      // Add user message to memory
      agent.addToMemory('user', message);

      // Execute agent with event monitoring
      const execution = await agent.execute();

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
}
