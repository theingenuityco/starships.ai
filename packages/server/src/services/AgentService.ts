/**
 * Agent Service
 * 
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and 
 * stateless execution engine (autopilot Agent).
 */

import { AgentRepository } from '@starships/models';
import { AgentModel as DatabaseAgent, CreateAgentRequest, UpdateAgentRequest } from '@starships/models';
import { Agent as AutopilotAgent, AgentMemory, createAgentMemory, Blueprint } from '@starships/autopilot';
import { DatabaseMemoryStore } from '../utils/database-memory';
import type { MemoryEntry } from '@starships/protocol';

export interface AutopilotAgentOptions {
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
  private memoryStore: DatabaseMemoryStore;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.memoryStore = new DatabaseMemoryStore();
  }

  // ============================================================================
  // STATIC APIs FOR BACKWARD COMPATIBILITY
  // ============================================================================

  /**
   * Get agents by category - Static method
   */
  static async getAgentsByCategory(category: string): Promise<DatabaseAgent[]> {
    const repository = new AgentRepository();
    return await repository.findByCategory(category);
  }

  /**
   * Get agents by author - Static method
   */
  static async getAgentsByAuthor(authorId: string): Promise<DatabaseAgent[]> {
    const repository = new AgentRepository();
    return await repository.findByAuthor(authorId);
  }

  /**
   * Get agents by tags - Static method
   */
  static async getAgentsByTags(tags: string[]): Promise<DatabaseAgent[]> {
    const repository = new AgentRepository();
    return await repository.findByTags(tags);
  }

  /**
   * Get public agents - Static method
   */
  static async getPublicAgents(limit: number = 50, offset: number = 0): Promise<DatabaseAgent[]> {
    const repository = new AgentRepository();
    return await repository.findPublic(limit, offset);
  }

  /**
   * Search agents - Static method
   */
  static async searchAgents(query: string): Promise<DatabaseAgent[]> {
    const repository = new AgentRepository();
    return await repository.searchAgents(query);
  }

  /**
   * Get agent by ID - Static method (returns DatabaseAgent, not AutopilotAgent)
   */
  static async getAgent(agentId: string): Promise<DatabaseAgent | null> {
    const repository = new AgentRepository();
    return await repository.findById(agentId);
  }

  /**
   * Create agent - Static method (returns DatabaseAgent, not AutopilotAgent)
   */
  static async createAgent(request: CreateAgentRequest): Promise<DatabaseAgent> {
    const repository = new AgentRepository();
    
    // Provide defaults for required fields that might be missing from CreateAgentRequest
    const agentData = {
      ...request,
      version: '1.0.0',
      tags: request.tags || [],
      isPublic: request.isPublic || false,
      authorId: request.authorId || 'system',
      executionMode: request.executionMode || 'simple' as const,
      timeout: request.timeout || 30000,
    };
    
    return await repository.create(agentData);
  }

  /**
   * Update agent - Static method (returns DatabaseAgent, not AutopilotAgent)
   */
  static async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<DatabaseAgent | null> {
    const repository = new AgentRepository();
    return await repository.update(agentId, updates);
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
  static async getAgentsByStarshipId(starshipId: string): Promise<DatabaseAgent[]> {
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

  // ============================================================================
  // AGENT MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new agent and return as AutopilotAgent instance
   */
  async createAgent(request: CreateAgentRequest, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent> {
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
      executionMode: request.executionMode || 'simple',
      timeout: request.timeout || 30000,
      version: '1.0.0',
      tags: request.tags || [],
      isPublic: request.isPublic || false,
      authorId: request.authorId || 'system',
    };

    const dbAgent = await this.agentRepository.create(agentData);
    return await this.createAutopilotAgent(dbAgent, options);
  }

  /**
   * Get agent by ID as AutopilotAgent instance
   */
  async getAgent(agentId: string, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent | null> {
    const dbAgent = await this.agentRepository.findById(agentId);
    if (!dbAgent) {
      return null;
    }
    return await this.createAutopilotAgent(dbAgent, options);
  }

  /**
   * Get all agents as AutopilotAgent instances
   */
  async getAllAgents(options: AutopilotAgentOptions = {}): Promise<AutopilotAgent[]> {
    const dbAgents = await this.agentRepository.findAll();
    return Promise.all(dbAgents.map(dbAgent => this.createAutopilotAgent(dbAgent, options)));
  }

  /**
   * Get agents by starship as AutopilotAgent instances
   */
  async getAgentsByStarship(starshipId: string, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent[]> {
    const dbAgents = await this.agentRepository.findByStarshipId(starshipId);
    return Promise.all(dbAgents.map(dbAgent => this.createAutopilotAgent(dbAgent, options)));
  }

  /**
   * Get agents by user as AutopilotAgent instances
   */
  async getAgentsByUser(userId: string, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent[]> {
    const dbAgents = await this.agentRepository.findByAuthor(userId);
    return Promise.all(dbAgents.map(dbAgent => this.createAutopilotAgent(dbAgent, options)));
  }

  /**
   * Update agent and return as AutopilotAgent instance
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent | null> {
    // Validate blueprint if being updated
    if (updates.blueprint) {
      const validation = this.validateBlueprint(updates.blueprint);
      if (!validation.valid) {
        throw new Error(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    const dbAgent = await this.agentRepository.update(agentId, updates);
    if (!dbAgent) {
      return null;
    }
    return await this.createAutopilotAgent(dbAgent, options);
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
   * Search agents and return as AutopilotAgent instances
   */
  async searchAgents(query: string, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent[]> {
    const dbAgents = await this.agentRepository.searchAgents(query);
    return Promise.all(dbAgents.map(dbAgent => this.createAutopilotAgent(dbAgent, options)));
  }

  /**
   * Get agents with filters as AutopilotAgent instances
   */
  async getAgentsWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }, options: AutopilotAgentOptions = {}): Promise<AutopilotAgent[]> {
    const dbAgents = await this.agentRepository.findWithFilters(filters);
    return Promise.all(dbAgents.map(dbAgent => this.createAutopilotAgent(dbAgent, options)));
  }

  // ============================================================================
  // AGENT EXECUTION APIs
  // ============================================================================

  /**
   * Execute an agent with user input
   */
  async executeAgent(
    context: AgentExecutionContext,
    options: AutopilotAgentOptions = {}
  ): Promise<ExecuteAgentResponse> {
    const startTime = Date.now();
    
    try {
      // Get database agent
      const dbAgent = await this.agentRepository.findById(context.agentId);
      if (!dbAgent) {
        throw new Error(`Agent ${context.agentId} not found`);
      }

      // Create autopilot agent instance
      const autopilotAgent = await this.createAutopilotAgent(dbAgent, options);

      // Add user message to memory
      autopilotAgent.addToMemory('user', context.userMessage);

      // Execute the agent
      const execution = await autopilotAgent.execute();

      // Extract response from execution result
      const response = this.extractResponse(execution);
      
      // Calculate usage statistics
      const usage = this.calculateUsage(execution);

      // Save conversation history back to database
      if (options.includeMemory && options.userId) {
        await this.saveConversationHistory(
          autopilotAgent.getMemory(),
          context.agentId,
          options.userId
        );
      }

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

  /**
   * Get agent conversation history
   */
  async getAgentConversationHistory(
    agentId: string, 
    userId: string, 
    limit: number = 50
  ): Promise<MemoryEntry[]> {
    const memoryKey = this.memoryStore.makeKey(agentId, userId);
    const history = await this.memoryStore.get(memoryKey);
    return history.slice(-limit);
  }

  /**
   * Clear agent conversation history
   */
  async clearAgentConversationHistory(agentId: string, userId: string): Promise<void> {
    const memoryKey = this.memoryStore.makeKey(agentId, userId);
    await this.memoryStore.clear(memoryKey);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Convert database agent to autopilot agent instance
   */
  private async createAutopilotAgent(
    dbAgent: DatabaseAgent,
    options: AutopilotAgentOptions
  ): Promise<AutopilotAgent> {
    const {
      includeMemory = true,
      userId,
      loadConversationHistory = true
    } = options;

    // Create agent memory
    const memory = await this.createAgentMemory(dbAgent, {
      includeMemory,
      userId,
      loadConversationHistory
    });

    // Get or create blueprint
    const blueprint = dbAgent.blueprint || this.createDefaultBlueprint(dbAgent);

    // Create autopilot agent parameters
    const agentParams = {
      name: dbAgent.name,
      description: dbAgent.description,
      model: dbAgent.model,
      memory: memory,
      blueprint: blueprint,
      instructions: dbAgent.customInstructions,
      temperature: dbAgent.temperature,
      maxTokens: dbAgent.maxTokens,
      timeout: dbAgent.timeout || 30000
    };

    return new AutopilotAgent(agentParams);
  }

  /**
   * Create agent memory from database agent configuration
   */
  private async createAgentMemory(
    dbAgent: DatabaseAgent,
    options: {
      includeMemory?: boolean;
      userId?: string;
      loadConversationHistory?: boolean;
    }
  ): Promise<AgentMemory> {
    // Initialize memory with system prompt
    const memory = createAgentMemory(
      dbAgent.systemPrompt || 'You are a helpful AI assistant.'
    );

    // Set structured context from database configuration
    if (dbAgent.agentMemoryConfig) {
      if (dbAgent.agentMemoryConfig.identity) {
        memory.setIdentity(dbAgent.agentMemoryConfig.identity);
      }
      if (dbAgent.agentMemoryConfig.purpose) {
        memory.setPurpose(dbAgent.agentMemoryConfig.purpose);
      }
      if (dbAgent.agentMemoryConfig.space) {
        memory.setSpace(dbAgent.agentMemoryConfig.space);
      }
    } else {
      // Set default identity and purpose based on agent metadata
      memory.setIdentity({
        name: dbAgent.name,
        role: this.getRoleFromCategory(dbAgent.category),
        expertise: dbAgent.tags
      });

      memory.setPurpose({
        primary: dbAgent.description || `Assist users as a ${dbAgent.category} agent`,
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines']
      });
    }

    // Load conversation history from database if requested
    if (options.includeMemory && options.userId && options.loadConversationHistory) {
      await this.loadConversationHistory(memory, dbAgent.id, options.userId);
    }

    return memory;
  }

  /**
   * Load conversation history from database into agent memory
   */
  private async loadConversationHistory(
    memory: AgentMemory,
    agentId: string,
    userId: string
  ): Promise<void> {
    try {
      const memoryKey = this.memoryStore.makeKey(agentId, userId);
      const history = await this.memoryStore.get(memoryKey);

      // Load last 10 conversation entries to maintain context window
      const recentHistory = history.slice(-10);

      for (const entry of recentHistory) {
        if (entry.role === 'user' || entry.role === 'assistant') {
          memory.addConversation(entry.role, entry.content, {
            timestamp: entry.timestamp,
            fromDatabase: true
          });
        }
      }

      console.log(`[AGENT-SERVICE] Loaded ${recentHistory.length} conversation entries for agent ${agentId}`);
    } catch (error) {
      console.warn(`[AGENT-SERVICE] Failed to load conversation history for agent ${agentId}:`, error);
      // Continue without history - not a critical failure
    }
  }

  /**
   * Save agent memory conversation back to database
   */
  private async saveConversationHistory(
    memory: AgentMemory,
    agentId: string,
    userId: string
  ): Promise<void> {
    try {
      const memoryKey = this.memoryStore.makeKey(agentId, userId);
      const conversations = memory.getConversationHistory();

      // Save only recent conversations that haven't been saved yet
      const newConversations = conversations.filter(
        conv => !conv.metadata?.fromDatabase
      ).slice(-2); // Last user/assistant pair

      for (const conv of newConversations) {
        await this.memoryStore.append(memoryKey, {
          role: conv.role,
          content: conv.content,
          timestamp: parseInt(conv.timestamp) || Date.now()
        } as MemoryEntry);
      }

      console.log(`[AGENT-SERVICE] Saved ${newConversations.length} new conversations for agent ${agentId}`);
    } catch (error) {
      console.error(`[AGENT-SERVICE] Failed to save conversation history for agent ${agentId}:`, error);
    }
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
  private createDefaultBlueprint(dbAgent: DatabaseAgent | CreateAgentRequest): Blueprint {
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
