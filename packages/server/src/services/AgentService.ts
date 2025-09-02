/**
 * Agent Service
 * 
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and 
 * stateless execution engine (autopilot Agent).
 */

import { AgentRepository, RepositoryFactory } from '@starships/models';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { Agent, AgentMemory, createAgentMemory, Blueprint } from '@starships/autopilot';
import type { SessionRequest, SessionResponse, MessageModel } from '@starships/protocol';
import getStore, { type MemoryStore } from '../store';

export interface AgentOptions {
  includeMemory?: boolean;
  sessionId?: string;
  userId?: string;
  loadConversationHistory?: boolean;
}

export interface ExecuteAgentResponse {
  response: string;
  usage: {
    total_tokens: number;
    cost: number;
    model_calls: number;
  };
  executionTime: number;
  status: 'success' | 'error';
  error?: string;
}

export interface AgentExecutionContext {
  agentId: string;
  userId?: string;
  sessionId?: string;
  userMessage: string;
}

/**
 * Service class for managing agents and their execution
 */
export class AgentService {
  private agentRepository: AgentRepository;

  constructor() {
    this.agentRepository = new AgentRepository();
  }

  // ============================================================================
  // STATIC APIs FOR BACKWARD COMPATIBILITY
  // ============================================================================

  /**
   * Get agents by category - Static method
   */
  static async getAgentsByCategory(category: string): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.findByCategory(category);
  }

  /**
   * Get agents by author - Static method
   */
  static async getAgentsByAuthor(authorId: string): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.findByAuthor(authorId);
  }

  /**
   * Get agents by tags - Static method
   */
  static async getAgentsByTags(tags: string[]): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.findByTags(tags);
  }

  /**
   * Get public agents - Static method
   */
  static async getPublicAgents(limit: number = 50, offset: number = 0): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.findPublic(limit, offset);
  }

  /**
   * Search agents - Static method
   */
  static async searchAgents(query: string): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.searchAgents(query);
  }

  /**
   * Get agent by ID - Static method (returns AgentModel, not Agent)
   */
  static async getAgent(agentId: string): Promise<AgentModel | null> {
    const repository = new AgentRepository();
    return await repository.findById(agentId);
  }

  /**
   * Create agent - Static method (returns AgentModel, not Agent)
   */
  static async createAgent(request: CreateAgentRequest): Promise<AgentModel> {
    const repository = new AgentRepository();
    
    // Provide defaults for core AgentNodeParameters fields
    const agentData = {
      ...request,
      timeout: request.timeout || 30000,
      version: '1.0.0', // Default version for all new agents
    };
    
    return await repository.create(agentData);
  }

  /**
   * Update agent - Static method (returns AgentModel, not Agent)
   */
  static async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    const repository = new AgentRepository();
    return await repository.update(agentId, updates as Partial<AgentModel>);
  }

  /**
   * Delete agent - Static method
   */
  static async deleteAgent(agentId: string): Promise<boolean> {
    const repository = new AgentRepository();
    return await repository.delete(agentId);
  }

  /**
   * Get agents by starship ID - Static method
   */
  static async getAgentsByStarshipId(starshipId: string): Promise<AgentModel[]> {
    const repository = new AgentRepository();
    return await repository.findByStarshipId(starshipId);
  }

  /**
   * Track usage - Static method
   */
  static async trackUsage(agentId: string): Promise<boolean> {
    const repository = new AgentRepository();
    try {
      await repository.incrementUsageCount(agentId);
      return true;
    } catch (error) {
      console.error(`Failed to track usage for agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Rate agent - Static method
   */
  static async rateAgent(agentId: string, userId: string, rating: number): Promise<boolean> {
    const repository = new AgentRepository();
    try {
      await repository.updateRating(agentId, rating);
      return true;
    } catch (error) {
      console.error(`Failed to rate agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Get agent analytics - Static method
   */
  static async getAgentAnalytics(agentId: string): Promise<any> {
    const repository = new AgentRepository();
    const agent = await repository.findById(agentId);
    if (!agent) {
      return null;
    }
    
    // Return basic analytics from the agent model
    return {
      id: agent.id,
      name: agent.name,
      usageCount: agent.usageCount || 0,
      rating: agent.rating || 0,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      category: agent.category,
      isPublic: agent.isPublic
    };
  }

  /**
   * Get memory store - Static method
   */
  static getMemoryStore(): MemoryStore {
    return getStore();
  }

  // ============================================================================
  // AGENT MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new agent and return as Agent instance
   */
  async createAgent(request: CreateAgentRequest, options: AgentOptions = {}): Promise<Agent> {
    // Validate blueprint if provided
    if (request.blueprint) {
      const validation = this.validateBlueprint(request.blueprint);
      if (!validation.valid) {
        throw new Error(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    // Create agent with default blueprint if none provided
    const agentData = {
      ...request,
      blueprint: request.blueprint || this.createDefaultBlueprint(request),
      timeout: request.timeout || 30000,
      version: '1.0.0', // Default version for all new agents
    };

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
    return Promise.all(dbAgents.map(dbAgent => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents by starship as Agent instances
   */
  async getAgentsByStarship(starshipId: string, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findByStarshipId(starshipId);
    return Promise.all(dbAgents.map(dbAgent => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents by user as Agent instances
   */
  async getAgentsByUser(userId: string, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findByAuthor(userId);
    return Promise.all(dbAgents.map(dbAgent => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Update agent and return as Agent instance
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest, options: AgentOptions = {}): Promise<Agent | null> {
    // Validate blueprint if being updated
    if (updates.blueprint) {
      const validation = this.validateBlueprint(updates.blueprint);
      if (!validation.valid) {
        throw new Error(`Invalid blueprint: ${validation.errors.join(', ')}`);
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
    return Promise.all(dbAgents.map(dbAgent => this.createAgentInstance(dbAgent, options)));
  }

  /**
   * Get agents with filters as Agent instances
   */
  async getAgentsWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }, options: AgentOptions = {}): Promise<Agent[]> {
    const dbAgents = await this.agentRepository.findWithFilters(filters);
    return Promise.all(dbAgents.map(dbAgent => this.createAgentInstance(dbAgent, options)));
  }

  // ============================================================================
  // AGENT EXECUTION APIs
  // ============================================================================

  /**
   * Execute agent chat using SessionRequest format (replaces AgentExecutionService.executeChat)
   */
  static async executeChat(request: SessionRequest): Promise<SessionResponse> {
    const { agentId, userId, message, sessionId } = request;

    if (!agentId) {
      throw new Error('agentId is required for agent chat');
    }

    console.log('🚀 [AGENT-SERVICE] Starting agent chat:', {
      agentId,
      userId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      sessionId,
      timestamp: new Date().toISOString(),
    });

    // Get agent from database
    const agentRepo = RepositoryFactory.getAgentRepository();
    const dbAgent = await agentRepo.findById(agentId);

    if (!dbAgent) {
      console.error('❌ [AGENT-SERVICE] Agent not found:', agentId);
      throw new Error(`Agent ${agentId} not found`);
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
          sessionId: sessionId,
          userMessage: message
        },
        {
          includeMemory: true,
          userId: userId,
          sessionId: sessionId,
          loadConversationHistory: true
        }
      );

      console.log('✅ [AGENT-SERVICE] Chat execution completed successfully:', {
        responseLength: executionResult.response.length,
        executionTime: executionResult.executionTime,
        usageStats: executionResult.usage
      });

      return {
        source: 'agent',
        content: executionResult.response,
        agentId: agentId,
        usage: {
          promptTokens: Math.floor(executionResult.usage.total_tokens * 0.7), // Estimate prompt tokens
          completionTokens: Math.floor(executionResult.usage.total_tokens * 0.3) // Estimate completion tokens
        }
      };

    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Agent execution failed:', {
        agentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Just throw the error instead of providing fallback response
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
      const agentRepo = RepositoryFactory.getAgentRepository();
      const dbAgent = await agentRepo.findById(agentId);

      if (!dbAgent) {
        return {
          valid: false,
          errors: [`Agent ${agentId} not found`],
          warnings: []
        };
      }

      // Basic validation - AgentService handles detailed validation internally
      if (!dbAgent.name || !dbAgent.model) {
        return {
          valid: false,
          errors: ['Agent name and model are required'],
          warnings: []
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
        warnings
      };

    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: []
      };
    }
  }

  /**
   * Execute an agent with user input
   */
  async executeAgent(
    context: AgentExecutionContext,
    options: AgentOptions = {}
  ): Promise<ExecuteAgentResponse> {
    const startTime = Date.now();
    
    try {
      // Get database agent
      const dbAgent = await this.agentRepository.findById(context.agentId);
      if (!dbAgent) {
        throw new Error(`Agent ${context.agentId} not found`);
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
        status: 'success'
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[AGENT-SERVICE] Agent execution failed for ${context.agentId}:`, error);
      
      return {
        response: "I apologize, but I encountered an error processing your request.",
        usage: { total_tokens: 0, cost: 0, model_calls: 0 },
        executionTime,
        status: 'error',
        error: errorMessage
      };
    }
  }

  /**
   * Test agent execution (dry run without saving to memory)
   */
  async testAgent(agentId: string, testMessage: string): Promise<ExecuteAgentResponse> {
    return this.executeAgent(
      { agentId, userMessage: testMessage },
      { includeMemory: false, loadConversationHistory: false }
    );
  }


  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Convert database agent to agent instance
   */
  private async createAgentInstance(
    dbAgent: AgentModel,
    options: AgentOptions
  ): Promise<Agent> {
    // Get or create blueprint
    const blueprint = dbAgent.blueprint || this.createDefaultBlueprint(dbAgent);

    // Create default memory config if missing
    const memoryConfig = dbAgent.memory || {
      identity: {
        name: dbAgent.name as string,
        role: this.getRoleFromCategory(dbAgent.category as string),
        expertise: dbAgent.tags as string[]
      },
      purpose: {
        primary: (dbAgent.description as string) || `Assist users as a ${dbAgent.category} agent`,
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines']
      },
      space: {
        description: `Professional ${dbAgent.category} assistance environment. Focused on providing accurate and helpful responses.`
      }
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
      timeout: (dbAgent.timeout as number) || 30000
    };

    return new Agent(agentParams);
  }

  /**
   * Create agent memory from database agent configuration
   */
  private async createAgentMemory(
    dbAgent: AgentModel,
    options: {
      includeMemory?: boolean;
      userId?: string;
      loadConversationHistory?: boolean;
    }
  ): Promise<AgentMemory> {
    // Initialize memory with default prompt
    const memory = createAgentMemory();
    memory.addMessage('system', 'You are a helpful AI assistant.');

    // Set structured context from database configuration
    if (dbAgent.memory) {
      if (dbAgent.memory.identity) {
        memory.setIdentity(dbAgent.memory.identity);
      }
      if (dbAgent.memory.purpose) {
        memory.setPurpose(dbAgent.memory.purpose);
      }
      if (dbAgent.memory.space) {
        memory.setSpace(dbAgent.memory.space);
      }
    } else {
      // Set default identity and purpose based on agent metadata
      memory.setIdentity({
        name: dbAgent.name as string,
        role: this.getRoleFromCategory(dbAgent.category as string),
        expertise: dbAgent.tags as string[]
      });

      memory.setPurpose({
        primary: (dbAgent.description as string) || `Assist users as a ${dbAgent.category} agent`,
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines']
      });
    }

    // Note: Conversation history loading removed

    return memory;
  }


  /**
   * Extract response from autopilot agent execution result
   */
  private extractResponse(executionResult: any): string {
    if (executionResult.status !== 'completed') {
      throw new Error(`Agent execution failed: ${executionResult.error?.message || 'Unknown error'}`);
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
        totalTokens += result.data.usage.total_tokens || 0;
        totalCost += result.data.usage.cost || 0;
      }
    }

    return {
      total_tokens: totalTokens,
      cost: totalCost,
      model_calls: results.filter((r: any) => !r.error).length
    };
  }

  /**
   * Create default blueprint for simple chat agents
   */
  private createDefaultBlueprint(dbAgent: AgentModel | CreateAgentRequest): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin conversation',
          parameters: {}
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
            timeout: 30000
          }
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete conversation',
          parameters: {}
        }
      ],
      edges: [
        {
          ref: 'edge-1',
          from: 'start',
          to: 'llm-response'
        },
        {
          ref: 'edge-2',
          from: 'llm-response',
          to: 'end'
        }
      ],
      metadata: {
        version: '1.0',
        type: 'simple-chat',
        generated: true,
        agentId: 'id' in dbAgent ? dbAgent.id : 'new-agent',
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Validate blueprint structure
   */
  private validateBlueprint(blueprint: Blueprint): { valid: boolean; errors: string[] } {
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
    const hasStartNode = blueprint.nodes.some(node => node.type === 'start');
    if (!hasStartNode) {
      errors.push('Blueprint must have a start node');
    }

    // Check for end node
    const hasEndNode = blueprint.nodes.some(node => node.type === 'end');
    if (!hasEndNode) {
      errors.push('Blueprint must have an end node');
    }

    // Validate edge references
    const nodeRefs = new Set(blueprint.nodes.map(n => n.ref));
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
      errors
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
      support: 'Support Specialist'
    };
    return roles[category as keyof typeof roles] || 'AI Assistant';
  }
}
