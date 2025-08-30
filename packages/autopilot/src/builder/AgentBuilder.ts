/**
 * Agent Builder
 * 
 * Fluent API for building agents with configuration
 */

import { ConfigurableAgent } from '../agent/ConfigurableAgent';
import type { Agent, AgentConfiguration, ExecutionHandler } from '../types/agent';

/**
 * Builder class for creating agents with fluent API
 */
export class AgentBuilder {
  private config: Partial<AgentConfiguration> = {};
  
  /**
   * Set agent ID (optional - will auto-generate if not provided)
   */
  setId(id: string): this {
    if (!id || id.trim().length === 0) {
      throw new Error('Agent ID cannot be empty');
    }
    this.config.id = id.trim();
    return this;
  }
  
  /**
   * Set agent name (required)
   */
  setName(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Agent name cannot be empty');
    }
    this.config.name = name.trim();
    return this;
  }
  
  /**
   * Set agent description (required)
   */
  setDescription(description: string): this {
    if (!description || description.trim().length === 0) {
      throw new Error('Agent description cannot be empty');
    }
    this.config.description = description.trim();
    return this;
  }
  
  /**
   * Set execution handler (required)
   */
  setHandler(handler: ExecutionHandler): this {
    if (!handler) {
      throw new Error('Execution handler is required');
    }
    this.config.handler = handler;
    return this;
  }
  
  /**
   * Build the agent instance
   */
  build(): Agent {
    // Validate required fields
    if (!this.config.name) {
      throw new Error('Agent name is required. Use setName() to provide it.');
    }
    
    if (!this.config.description) {
      throw new Error('Agent description is required. Use setDescription() to provide it.');
    }
    
    if (!this.config.handler) {
      throw new Error('Execution handler is required. Use setHandler() to provide it.');
    }
    
    // Create and return the agent
    return new ConfigurableAgent(this.config as AgentConfiguration);
  }
  
  /**
   * Reset builder to initial state
   */
  reset(): this {
    this.config = {};
    return this;
  }
}