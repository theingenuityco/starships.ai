/**
 * Autopilot Agent Adapter
 *
 * @deprecated This adapter is being replaced by AgentService for better architecture.
 * The new architecture separates concerns:
 * - AgentRepository (from @starships/models) handles database persistence
 * - Agent (from @starships/autopilot) provides stateless execution engine
 * - AgentService orchestrates between the two with clean business logic APIs
 *
 * Please migrate to:
 * - packages/server/src/services/AgentService.ts for agent management and execution
 *
 * Bridge between database agents and autopilot Agent class.
 * Handles conversion, memory management, and blueprint creation.
 */

import { AgentModel as DBAgent, AgentMemoryConfig } from '@starships/models';
import { Blueprint, NodeType, Agent as AutopilotAgent, AgentMemory, createAgentMemory, Execution, ConversationEntry } from '@starships/autopilot';
import { DatabaseMemoryStore } from '../utils/database-memory';
import type { MemoryEntry } from '@starships/protocol';

// Now using real autopilot imports

export interface AutopilotAgentOptions {
  includeMemory?: boolean;
  sessionId?: string;
  userId?: string;
  loadConversationHistory?: boolean;
}

/**
 * Adapter class for converting database agents to autopilot agents
 */
export class AutopilotAgentAdapter {
  private static memoryStore = new DatabaseMemoryStore();

  /**
   * Get memory store instance for backward compatibility
   */
  static getMemoryStore(): DatabaseMemoryStore {
    return this.memoryStore;
  }

  /**
   * Convert database agent to autopilot agent instance
   */
  static async fromDatabaseAgent(
    dbAgent: DBAgent, 
    options: AutopilotAgentOptions = {}
  ): Promise<AutopilotAgent> {
    const {
      includeMemory = true,
      sessionId,
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
  private static async createAgentMemory(
    dbAgent: DBAgent,
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
  private static async loadConversationHistory(
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

      console.log(`[AUTOPILOT-ADAPTER] Loaded ${recentHistory.length} conversation entries for agent ${agentId}`);
    } catch (error) {
      console.warn(`[AUTOPILOT-ADAPTER] Failed to load conversation history for agent ${agentId}:`, error);
      // Continue without history - not a critical failure
    }
  }

  /**
   * Save agent memory conversation back to database
   */
  static async saveConversationHistory(
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

      console.log(`[AUTOPILOT-ADAPTER] Saved ${newConversations.length} new conversations for agent ${agentId}`);
    } catch (error) {
      console.error(`[AUTOPILOT-ADAPTER] Failed to save conversation history for agent ${agentId}:`, error);
    }
  }

  /**
   * Create default blueprint for simple chat agents
   */
  private static createDefaultBlueprint(dbAgent: DBAgent): Blueprint {
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
        agentId: dbAgent.id,
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create workflow blueprint for complex agents with tools
   */
  static createWorkflowBlueprint(
    dbAgent: DBAgent,
    includeTools: boolean = false
  ): Blueprint {
    const nodes = [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin workflow',
        parameters: {}
      }
    ];

    const edges = [];
    let currentNodeRef = 'start';

    // Add HTTP request node for external data if needed
    if (includeTools && dbAgent.category === 'analysis') {
      nodes.push({
        ref: 'fetch-data',
        type: 'http_request',
        name: 'Fetch External Data',
        description: 'Get data from external APIs',
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          timeout: 10000,
          retries: 2
        }
      });

      edges.push({
        ref: 'edge-fetch',
        from: currentNodeRef,
        to: 'fetch-data'
      });
      currentNodeRef = 'fetch-data';
    }

    // Main LLM processing node
    nodes.push({
      ref: 'llm-process',
      type: 'llm',
      name: 'Process with AI',
      description: 'Main AI processing step',
      parameters: {
        model: dbAgent.model,
        prompt: this.getPromptForCategory(dbAgent.category),
        temperature: dbAgent.temperature || 0.7,
        maxTokens: dbAgent.maxTokens || 2000
      }
    });

    edges.push({
      ref: 'edge-process',
      from: currentNodeRef,
      to: 'llm-process'
    });

    // End node
    nodes.push({
      ref: 'end',
      type: 'end',
      name: 'End',
      description: 'Complete workflow',
      parameters: {}
    });

    edges.push({
      ref: 'edge-end',
      from: 'llm-process',
      to: 'end'
    });

    return {
      nodes: nodes as any, // Cast to avoid type issues with temporary definitions
      edges,
      metadata: {
        version: '1.0',
        type: 'workflow',
        category: dbAgent.category,
        includesTools: includeTools,
        agentId: dbAgent.id,
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Extract response from autopilot agent execution result
   */
  static extractResponse(executionResult: any): string {
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
  static calculateUsage(executionResult: any): any {
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
   * Helper: Get role from agent category
   */
  private static getRoleFromCategory(category: string): string {
    const roles = {
      general: 'General Assistant',
      coding: 'Software Developer',
      creative: 'Creative Assistant',
      analysis: 'Data Analyst',
      support: 'Support Specialist'
    };
    return roles[category as keyof typeof roles] || 'AI Assistant';
  }

  /**
   * Helper: Get appropriate prompt template for category
   */
  private static getPromptForCategory(category: string): string {
    const prompts = {
      general: 'Provide a helpful and comprehensive response to the user.',
      coding: 'Analyze the code or programming question and provide a clear, well-structured solution.',
      creative: 'Use your creativity to generate engaging and original content.',
      analysis: 'Analyze the provided data and generate insights and conclusions.',
      support: 'Provide helpful support and guidance to resolve the user\'s issue.'
    };
    return prompts[category as keyof typeof prompts] || 'Respond helpfully to the user.';
  }

  /**
   * Validate autopilot agent configuration
   */
  static validateAgentConfig(dbAgent: DBAgent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!dbAgent.name || dbAgent.name.trim().length === 0) {
      errors.push('Agent name is required');
    }

    if (!dbAgent.model || dbAgent.model.trim().length === 0) {
      errors.push('Agent model is required');
    }

    // Validate blueprint if present
    if (dbAgent.blueprint) {
      const blueprintValidation = this.validateBlueprint(dbAgent.blueprint);
      if (!blueprintValidation.valid) {
        errors.push(...blueprintValidation.errors);
      }
    }

    // Validate execution mode
    if (dbAgent.executionMode && !['simple', 'workflow'].includes(dbAgent.executionMode)) {
      errors.push('Execution mode must be either "simple" or "workflow"');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate blueprint structure
   */
  private static validateBlueprint(blueprint: Blueprint): { valid: boolean; errors: string[] } {
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
}