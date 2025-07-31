/**
 * Memory Integration Pattern for MCP
 * 
 * Demonstrates how agents can use MCP memory tools for context persistence
 * and retrieval across tasks and expeditions.
 */

import { MCPToolGateway } from '@starships/core';
import { DynamicTool } from '@langchain/core/tools';

export interface MemoryContext {
  expeditionId: string;
  agentId: string;
  taskId?: string;
  timestamp: string;
  data: any;
}

export interface MemoryPattern {
  store(key: string, value: any): Promise<boolean>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * MCP Memory Integration Pattern Implementation
 */
export class MCPMemoryPattern implements MemoryPattern {
  private gateway: MCPToolGateway;
  private starshipId: string;
  private namespace: string;

  constructor(
    gateway: MCPToolGateway,
    starshipId: string,
    namespace: string = 'default'
  ) {
    this.gateway = gateway;
    this.starshipId = starshipId;
    this.namespace = namespace;
  }

  /**
   * Store data in memory with namespaced key
   */
  async store(key: string, value: any): Promise<boolean> {
    const namespacedKey = this.createNamespacedKey(key);
    
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'store_memory',
        {
          key: namespacedKey,
          value: JSON.stringify(value)
        }
      );

      return result.success && result.result?.stored === true;
    } catch (error) {
      console.error('[MCPMemoryPattern] Failed to store:', error);
      return false;
    }
  }

  /**
   * Retrieve data from memory
   */
  async retrieve(key: string): Promise<any> {
    const namespacedKey = this.createNamespacedKey(key);
    
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'retrieve_memory',
        {
          key: namespacedKey
        }
      );

      if (result.success && result.result?.value) {
        try {
          return JSON.parse(result.result.value);
        } catch {
          // Return raw value if not JSON
          return result.result.value;
        }
      }

      return null;
    } catch (error) {
      console.error('[MCPMemoryPattern] Failed to retrieve:', error);
      return null;
    }
  }

  /**
   * Delete data from memory
   */
  async delete(key: string): Promise<boolean> {
    const namespacedKey = this.createNamespacedKey(key);
    
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'delete_memory',
        {
          key: namespacedKey
        }
      );

      return result.success;
    } catch (error) {
      console.error('[MCPMemoryPattern] Failed to delete:', error);
      return false;
    }
  }

  /**
   * List all keys with optional prefix
   */
  async list(prefix?: string): Promise<string[]> {
    try {
      const searchPrefix = prefix 
        ? this.createNamespacedKey(prefix)
        : `${this.namespace}:`;

      const result = await this.gateway.invokeTool(
        this.starshipId,
        'list_memory',
        {
          prefix: searchPrefix
        }
      );

      if (result.success && Array.isArray(result.result)) {
        // Strip namespace from returned keys
        return result.result.map(key => 
          key.replace(`${this.namespace}:`, '')
        );
      }

      return [];
    } catch (error) {
      console.error('[MCPMemoryPattern] Failed to list:', error);
      return [];
    }
  }

  /**
   * Create namespaced key
   */
  private createNamespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

/**
 * Common memory patterns for agent tasks
 */
export class AgentMemoryPatterns {
  private memory: MCPMemoryPattern;

  constructor(memory: MCPMemoryPattern) {
    this.memory = memory;
  }

  /**
   * Store expedition context
   */
  async storeExpeditionContext(
    expeditionId: string,
    context: any
  ): Promise<boolean> {
    const key = `expedition:${expeditionId}:context`;
    const contextData: MemoryContext = {
      expeditionId,
      agentId: context.agentId || 'unknown',
      timestamp: new Date().toISOString(),
      data: context
    };

    return this.memory.store(key, contextData);
  }

  /**
   * Retrieve expedition context
   */
  async getExpeditionContext(expeditionId: string): Promise<MemoryContext | null> {
    const key = `expedition:${expeditionId}:context`;
    return this.memory.retrieve(key);
  }

  /**
   * Store task result
   */
  async storeTaskResult(
    taskId: string,
    result: any,
    metadata?: any
  ): Promise<boolean> {
    const key = `task:${taskId}:result`;
    const taskData = {
      taskId,
      result,
      metadata,
      timestamp: new Date().toISOString()
    };

    return this.memory.store(key, taskData);
  }

  /**
   * Get task result
   */
  async getTaskResult(taskId: string): Promise<any> {
    const key = `task:${taskId}:result`;
    const data = await this.memory.retrieve(key);
    return data?.result || null;
  }

  /**
   * Store agent learning/insight
   */
  async storeAgentInsight(
    agentId: string,
    insightType: string,
    insight: any
  ): Promise<boolean> {
    const key = `agent:${agentId}:insight:${insightType}:${Date.now()}`;
    const insightData = {
      agentId,
      type: insightType,
      insight,
      timestamp: new Date().toISOString()
    };

    return this.memory.store(key, insightData);
  }

  /**
   * Get agent insights by type
   */
  async getAgentInsights(
    agentId: string,
    insightType?: string
  ): Promise<any[]> {
    const prefix = insightType
      ? `agent:${agentId}:insight:${insightType}`
      : `agent:${agentId}:insight`;

    const keys = await this.memory.list(prefix);
    const insights = [];

    for (const key of keys) {
      const insight = await this.memory.retrieve(key);
      if (insight) {
        insights.push(insight);
      }
    }

    return insights;
  }

  /**
   * Store conversation history
   */
  async storeConversation(
    conversationId: string,
    messages: any[]
  ): Promise<boolean> {
    const key = `conversation:${conversationId}`;
    return this.memory.store(key, {
      conversationId,
      messages,
      lastUpdated: new Date().toISOString()
    });
  }

  /**
   * Append to conversation
   */
  async appendToConversation(
    conversationId: string,
    message: any
  ): Promise<boolean> {
    const conversation = await this.memory.retrieve(`conversation:${conversationId}`);
    
    if (conversation) {
      conversation.messages.push(message);
      conversation.lastUpdated = new Date().toISOString();
      return this.memory.store(`conversation:${conversationId}`, conversation);
    } else {
      // Create new conversation
      return this.storeConversation(conversationId, [message]);
    }
  }

  /**
   * Get conversation history
   */
  async getConversation(conversationId: string): Promise<any[]> {
    const conversation = await this.memory.retrieve(`conversation:${conversationId}`);
    return conversation?.messages || [];
  }

  /**
   * Store error context for debugging
   */
  async storeErrorContext(
    errorId: string,
    error: Error,
    context: any
  ): Promise<boolean> {
    const key = `error:${errorId}`;
    return this.memory.store(key, {
      errorId,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Store performance metrics
   */
  async storePerformanceMetric(
    metricName: string,
    value: number,
    tags?: Record<string, string>
  ): Promise<boolean> {
    const key = `metric:${metricName}:${Date.now()}`;
    return this.memory.store(key, {
      name: metricName,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(
    metricName: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<any[]> {
    const keys = await this.memory.list(`metric:${metricName}`);
    const metrics = [];

    for (const key of keys) {
      const metric = await this.memory.retrieve(key);
      if (metric) {
        const metricTime = new Date(metric.timestamp);
        if (
          (!startTime || metricTime >= startTime) &&
          (!endTime || metricTime <= endTime)
        ) {
          metrics.push(metric);
        }
      }
    }

    return metrics.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }
}

/**
 * Create memory-enhanced tools for agents
 */
export function createMemoryTools(
  gateway: MCPToolGateway,
  starshipId: string,
  namespace: string = 'agent'
): DynamicTool[] {
  const memory = new MCPMemoryPattern(gateway, starshipId, namespace);
  const patterns = new AgentMemoryPatterns(memory);

  return [
    new DynamicTool({
      name: 'store_context',
      description: 'Store important context for future reference',
      func: async (input: string) => {
        try {
          const { key, value } = JSON.parse(input);
          const success = await memory.store(key, value);
          return success 
            ? `Context stored successfully with key: ${key}`
            : 'Failed to store context';
        } catch (error) {
          return `Error: Invalid input format. Expected JSON with 'key' and 'value'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'retrieve_context',
      description: 'Retrieve previously stored context',
      func: async (input: string) => {
        try {
          const { key } = JSON.parse(input);
          const value = await memory.retrieve(key);
          return value 
            ? JSON.stringify(value)
            : `No context found for key: ${key}`;
        } catch (error) {
          return `Error: Invalid input format. Expected JSON with 'key'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'store_task_result',
      description: 'Store the result of a completed task',
      func: async (input: string) => {
        try {
          const { taskId, result, metadata } = JSON.parse(input);
          const success = await patterns.storeTaskResult(taskId, result, metadata);
          return success 
            ? `Task result stored for: ${taskId}`
            : 'Failed to store task result';
        } catch (error) {
          return `Error: Invalid input format. Expected JSON with 'taskId' and 'result'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'get_previous_insights',
      description: 'Retrieve previous insights and learnings',
      func: async (input: string) => {
        try {
          const { agentId, insightType } = JSON.parse(input);
          const insights = await patterns.getAgentInsights(agentId, insightType);
          return insights.length > 0
            ? JSON.stringify(insights)
            : 'No previous insights found';
        } catch (error) {
          return `Error: Invalid input format. Expected JSON with 'agentId' and optional 'insightType'.`;
        }
      }
    })
  ];
}