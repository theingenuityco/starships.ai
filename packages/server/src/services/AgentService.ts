/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent } from '@starships/autopilot';
import { createError, NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository } from '@starships/models';
import type { AgentModel, ConversationRequest, ConversationResponse, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { MessageService } from './MessageService';

export interface AgentOptions {
  includeMemory?: boolean;
  conversationId?: string;
  userId?: string;
  loadConversationHistory?: boolean;
}

export interface ExecuteAgentResponse {
  response: string;
  usage: {
    totalTokens: number;
    cost: number;
    modelCalls: number;
  };
  executionTime: number;
  status: 'success' | 'error';
  error?: string;
}

export interface AgentExecutionContext {
  agentId: string;
  userId?: string;
  conversationId?: string;
  userMessage: string;
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
   * Create a new agent and return as Agent instance
   */
  async createAgent(request: CreateAgentRequest, options: AgentOptions = {}): Promise<Agent> {
    // Create agent with default blueprint and memory if none provided
    const agentData = {
      ...request,
      blueprint: request.blueprint || this.createDefaultBlueprint(request),
      memory: request.memory || this.createDefaultMemoryConfig(request),
      timeout: request.timeout || 30000,
      version: '1.0.0', // Default version for all new agents
    };

    // Entity validation and transformation is now handled in the repository layer
    const dbAgent = await this.agentRepository.create(agentData);
    return await this.createAgentInstance(dbAgent, options);
  }

  /**
   * Get agent by ID as Agent instance
   */
  async getAgent(agentId: string, options: AgentOptions = {}): Promise<Agent | null> {
    const dbAgent = await this.agentRepository.findById(agentId);
    if (!dbAgent) {
      return null;
    }
    return await this.createAgentInstance(dbAgent, options);
  }

  /**
   * Get all agents as Agent instances
   */
  async getAllAgents(options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findAll();
    return Promise.all(dbAgents.map((dbAgent) => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents by starship as Agent instances
   */
  async getAgentsByStarship(starshipId: string, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findByStarshipId(starshipId);
    return Promise.all(dbAgents.map((dbAgent) => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents by user as Agent instances
   */
  async getAgentsByUser(userId: string, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findByAuthor(userId);
    return Promise.all(dbAgents.map((dbAgent) => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Update agent and return as Agent instance
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest, options: AgentOptions = {}): Promise<Agent | null> {
    // Validate blueprint if being updated
    if (updates.blueprint) {
      const validation = this.validateBlueprint(updates.blueprint);
      if (!validation.valid) {
        throw new ValidationError(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    const dbAgent = await this.agentRepository.update(agentId, updates as Partial<AgentModel>);
    if (!dbAgent) {
      return null;
    }
    return await this.createAgentInstance(dbAgent, options);
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    return await this.agentRepository.delete(agentId);
  }

  /**
   * Deploy agent to starship
   */
  async deployAgent(agentId: string, starshipId: string): Promise<void> {
    await this.agentRepository.updateStarshipId(agentId, starshipId);
  }

  /**
   * Search agents and return as Agent instances
   */
  async searchAgents(query: string, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.searchAgents(query);
    return Promise.all(dbAgents.map((dbAgent) => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents with filters as Agent instances
   */
  async getAgentsWithFilters(
    filters: {
      category?: string;
      tags?: string[];
      isPublic?: boolean;
      authorId?: string;
      starshipClass?: 'scout' | 'cruiser';
    },
    options: AgentOptions = {}
  ): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findWithFilters(filters);
    return Promise.all(dbAgents.map((dbAgent) => this.createAgentInstance(dbAgent, options)));
  }

  // ============================================================================
  // AGENT DATA MANAGEMENT APIs (for Routes Layer)
  // ============================================================================

  /**
   * Create a new agent and return as AgentModel (for routes layer)
   */
  async createAgentModel(request: CreateAgentRequest & { authorId: string }): Promise<AgentModel> {
    // Create agent with default blueprint and memory if none provided
    const agentData = {
      ...request,
      blueprint: request.blueprint || this.createDefaultBlueprint(request),
      memory: request.memory || this.createDefaultMemoryConfig(request),
      timeout: request.timeout || 30000,
      version: '1.0.0', // Default version for all new agents
    };

    // Entity validation and transformation is now handled in the repository layer
    return await this.agentRepository.create(agentData);
  }

  /**
   * Get agent by ID as AgentModel (for routes layer)
   */
  async getAgentModel(agentId: string): Promise<AgentModel | null> {
    return await this.agentRepository.findById(agentId);
  }

  /**
   * Update agent and return as AgentModel (for routes layer)
   */
  async updateAgentModel(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
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
   * Get agents by starship as AgentModel array (for routes layer)
   */
  async getAgentModelsByStarship(starshipId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByStarshipId(starshipId);
  }

  /**
   * Get agents by user as AgentModel array (for routes layer)
   */
  async getAgentModelsByUser(userId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByAuthor(userId);
  }

  /**
   * Get agents by category as AgentModel array (for routes layer)
   */
  async getAgentModelsByCategory(category: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByCategory(category);
  }

  /**
   * Get public agents as AgentModel array (for routes layer)
   */
  async getPublicAgentModels(limit: number = 50, offset: number = 0): Promise<AgentModel[]> {
    return await this.agentRepository.findPublic(limit, offset);
  }

  /**
   * Search agents and return as AgentModel array (for routes layer)
   */
  async searchAgentModels(query: string): Promise<AgentModel[]> {
    return await this.agentRepository.searchAgents(query);
  }

  /**
   * Get agents with filters as AgentModel array (for routes layer)
   */
  async getAgentModelsWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<AgentModel[]> {
    return await this.agentRepository.findWithFilters(filters);
  }

  /**
   * Rate an agent (for routes layer)
   */
  async rateAgent(agentId: string, rating: number): Promise<void> {
    // Business validation
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be a number between 1 and 5', 'rating');
    }

    // Check if agent exists first
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await this.agentRepository.updateRating(agentId, rating);
  }

  /**
   * Track agent usage (for routes layer)
   */
  async trackAgentUsage(agentId: string): Promise<void> {
    // Check if agent exists first
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await this.agentRepository.incrementUsageCount(agentId);
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

    // TODO: Add business validation for starship existence and user access
    return await this.agentRepository.update(agentId, { starshipId } as Partial<AgentModel>);
  }

  /**
   * Get agent analytics (for routes layer)
   */
  async getAgentAnalytics(agentId: string): Promise<{
    id: string;
    name: string;
    usageCount: number;
    rating: number;
    createdAt: string;
    updatedAt: string;
    category: string;
    isPublic: boolean;
  } | null> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      name: agent.name,
      usageCount: agent.usageCount || 0,
      rating: (agent as any).rating || 0,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      category: agent.category,
      isPublic: agent.isPublic || false,
    };
  }

  // ============================================================================
  // AGENT EXECUTION APIs
  // ============================================================================

  /**
   * Execute agent chat using ConversationRequest format with enhanced error handling
   */
  static async executeChat(request: ConversationRequest): Promise<ConversationResponse> {
    const { agentId, userId, message, conversationId } = request;

    if (!agentId) {
      throw new ValidationError('agentId is required for agent chat', 'agentId');
    }

    console.log('🚀 [AGENT-SERVICE] Starting agent chat:', {
      agentId,
      userId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      conversationId,
      timestamp: new Date().toISOString(),
    });

    // Get agent from database
    const agentRepo = new AgentRepository();
    const dbAgent = await agentRepo.findById(agentId);

    if (!dbAgent) {
      console.error('❌ [AGENT-SERVICE] Agent not found:', agentId);
      throw new NotFoundError('Agent', agentId);
    }

    console.log('✅ [AGENT-SERVICE] Database agent loaded:', {
      id: dbAgent.id,
      name: dbAgent.name,
      model: dbAgent.model,
      executionMode: dbAgent.executionMode || 'simple',
      hasBlueprint: !!dbAgent.blueprint,
      starshipId: dbAgent.starshipId,
    });

    try {
      // Execute agent using AgentService instance
      const agentService = new AgentService();
      const executionResult = await agentService.executeAgent(
        {
          agentId: agentId,
          userId: userId,
          conversationId: conversationId,
          userMessage: message,
        },
        {
          includeMemory: true,
          userId: userId,
          conversationId: conversationId,
          loadConversationHistory: true,
        }
      );

      console.log('✅ [AGENT-SERVICE] Chat execution completed successfully:', {
        responseLength: executionResult.response.length,
        executionTime: executionResult.executionTime,
        usageStats: executionResult.usage,
      });

      return {
        source: 'agent',
        content: executionResult.response,
        agentId: agentId,
        usage: {
          promptTokens: Math.floor(executionResult.usage.totalTokens * 0.7), // Estimate prompt tokens
          completionTokens: Math.floor(executionResult.usage.totalTokens * 0.3), // Estimate completion tokens
        },
      };
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Agent execution failed:', {
        agentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Create error message in conversation and then throw the error
      // This ensures the error is handled properly by the message service
      const agentService = new AgentService();
      await agentService.createErrorResponse(error as Error, {
        agentId,
        userId,
        conversationId,
        starshipId: dbAgent.starshipId,
      });

      // Throw the original error so it's handled as an actual error, not a success response
      throw error;
    }
  }

  /**
   * Test agent configuration without executing
   */
  static async validateAgent(agentId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const agentRepo = new AgentRepository();
      const dbAgent = await agentRepo.findById(agentId);

      if (!dbAgent) {
        return {
          valid: false,
          errors: [`Agent ${agentId} not found`],
          warnings: [],
        };
      }

      // Basic validation - AgentService handles detailed validation internally
      if (!dbAgent.name || !dbAgent.model) {
        return {
          valid: false,
          errors: ['Agent name and model are required'],
          warnings: [],
        };
      }

      const warnings: string[] = [];

      // Add warnings for potential issues
      if (!dbAgent.blueprint && dbAgent.executionMode === 'workflow') {
        warnings.push('Agent is set to workflow mode but has no blueprint defined');
      }

      if (!dbAgent.starshipId) {
        warnings.push('Agent is not assigned to any starship');
      }

      return {
        valid: true,
        errors: [],
        warnings,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Execute an agent with user input
   */
  async executeAgent(context: AgentExecutionContext, options: AgentOptions = {}): Promise<ExecuteAgentResponse> {
    const startTime = Date.now();

    try {
      // Get database agent
      const dbAgent = await this.agentRepository.findById(context.agentId);
      if (!dbAgent) {
        throw new NotFoundError('Agent', context.agentId);
      }

      // Create agent instance
      const agent = await this.createAgentInstance(dbAgent, options);

      // Add user message to memory
      agent.addToMemory('user', context.userMessage);

      // Execute the agent
      const execution = await agent.execute();

      // Extract response from execution result
      const response = this.extractResponse(execution);

      // Calculate usage statistics
      const usage = this.calculateUsage(execution);

      // Note: Conversation history persistence removed

      // Update agent usage count
      await this.agentRepository.incrementUsageCount(context.agentId);

      const executionTime = Date.now() - startTime;

      return {
        response,
        usage,
        executionTime,
        status: 'success',
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[AGENT-SERVICE] Agent execution failed for ${context.agentId}:`, error);

      // Return raw error response
      // Note: Error message creation is handled by createErrorResponse in executeChat
      // to avoid duplicate messages. This method just returns the error response.

      return {
        response: errorMessage,
        usage: { totalTokens: 0, cost: 0, modelCalls: 0 },
        executionTime,
        status: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Test agent execution (dry run without saving to memory)
   */
  async testAgent(agentId: string, testMessage: string): Promise<ExecuteAgentResponse> {
    return this.executeAgent({ agentId, userMessage: testMessage }, { includeMemory: false, loadConversationHistory: false });
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

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Convert database agent to agent instance
   */
  private async createAgentInstance(dbAgent: AgentModel, options: AgentOptions): Promise<Agent> {
    // Get or create blueprint - ensure it has proper nodes and edges arrays
    let blueprint = dbAgent.blueprint;
    if (!blueprint || !blueprint.nodes || !blueprint.edges) {
      blueprint = this.createDefaultBlueprint(dbAgent);
    }

    // Create default memory config if missing
    const memoryConfig = dbAgent.memory || {
      identity: {
        name: dbAgent.name as string,
        role: this.getRoleFromCategory(dbAgent.category as string),
        expertise: dbAgent.tags as string[],
      },
      purpose: {
        primary: (dbAgent.description as string) || `Assist users as a ${dbAgent.category} agent`,
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines'],
      },
      space: {
        description: `Professional ${dbAgent.category} assistance environment. Focused on providing accurate and helpful responses.`,
      },
    };

    // Create autopilot agent parameters
    const agentParams = {
      name: dbAgent.name as string,
      description: dbAgent.description as string,
      model: dbAgent.model as string,
      memory: memoryConfig, // Pass the AgentMemoryConfig
      blueprint: blueprint,
      temperature: dbAgent.temperature as number,
      maxTokens: dbAgent.maxTokens as number,
      timeout: (dbAgent.timeout as number) || 30000,
    };

    return new Agent(agentParams);
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
   * Create default blueprint for simple chat agents
   */
  private createDefaultBlueprint(dbAgent: AgentModel | CreateAgentRequest): any {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin conversation',
          parameters: {},
        },
        {
          ref: 'llm-response',
          type: 'llm',
          name: 'Generate Response',
          description: 'Process user input and generate response',
          parameters: {
            model: dbAgent.model,
            prompt: 'Respond to the user based on the conversation context and your system instructions.',
            temperature: dbAgent.temperature || 0.7,
            maxTokens: dbAgent.maxTokens || 2000,
            timeout: 30000,
          },
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete conversation',
          parameters: {},
        },
      ],
      edges: [
        {
          ref: 'edge-1',
          from: 'start',
          to: 'llm-response',
        },
        {
          ref: 'edge-2',
          from: 'llm-response',
          to: 'end',
        },
      ],
      metadata: {
        version: '1.0',
        type: 'simple-chat',
        generated: true,
        agentId: 'id' in dbAgent ? dbAgent.id : 'new-agent',
        createdAt: new Date().toISOString(),
      },
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

  /**
   * Create default memory configuration for agents
   */
  private createDefaultMemoryConfig(request: CreateAgentRequest): any {
    return {
      identity: {
        name: request.name,
        role: this.getRoleFromCategory(request.category),
        expertise: [], // No tags by default
      },
      purpose: {
        primary: request.description || `Assist users as a ${request.category} agent`,
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines'],
      },
      space: {
        description: `Professional ${request.category} assistance environment. Focused on providing accurate and helpful responses.`,
      },
    };
  }

  /**
   * Helper: Get role from agent category
   */
  private getRoleFromCategory(category: string): string {
    const roles = {
      general: 'General Assistant',
      coding: 'Software Developer',
      creative: 'Creative Assistant',
      analysis: 'Data Analyst',
      support: 'Support Specialist',
    };
    return roles[category as keyof typeof roles] || 'AI Assistant';
  }
}
