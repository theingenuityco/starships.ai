/**
 * Configurable Agent Implementation
 * 
 * Concrete agent implementation that uses configuration and handlers
 */

import { Agent } from './Agent';
import type { AgentContext, AgentRequest, AgentResponse, AgentConfiguration, ExecutionHandler } from '../types/agent';

/**
 * Configurable agent that delegates execution to a handler
 */
export class ConfigurableAgent extends Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  
  private handler: ExecutionHandler;
  private initialized = false;
  
  constructor(config: AgentConfiguration) {
    super();
    
    // Validate configuration
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Agent name is required');
    }
    
    if (!config.description || config.description.trim().length === 0) {
      throw new Error('Agent description is required');
    }
    
    if (!config.handler) {
      throw new Error('Execution handler is required');
    }
    
    this.id = config.id || `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.name = config.name;
    this.description = config.description;
    this.handler = config.handler;
  }
  
  /**
   * Initialize the agent
   */
  async onInitialize(context: AgentContext): Promise<void> {
    this.initialized = true;
  }
  
  /**
   * Execute request using the configured handler
   */
  async onExecute(request: AgentRequest): Promise<AgentResponse> {
    if (!this.initialized) {
      throw new Error('Agent must be initialized before execution');
    }
    
    return await this.handler.handle(request, this);
  }
  
  /**
   * Cleanup and mark as uninitialized
   */
  async onDestroy(): Promise<void> {
    this.initialized = false;
  }
  
  /**
   * Check if agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}