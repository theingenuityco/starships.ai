/**
 * Agent Base Class
 * 
 * Abstract base class for all agents in the autopilot framework
 */

import type { AgentContext, AgentRequest, AgentResponse } from '../types/agent';

/**
 * Abstract base class for all agents
 */
export abstract class Agent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  
  /**
   * Initialize the agent with context
   */
  abstract onInitialize(context: AgentContext): Promise<void>;
  
  /**
   * Execute a request (implemented by concrete agents)
   */
  abstract onExecute(request: AgentRequest): Promise<AgentResponse>;
  
  /**
   * Cleanup when agent is destroyed
   */
  abstract onDestroy(): Promise<void>;
  
  /**
   * Main execution method with validation
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    await this.validateRequest(request);
    return await this.onExecute(request);
  }
  
  /**
   * Validate incoming request
   */
  private async validateRequest(request: AgentRequest): Promise<void> {
    if (!request.message || request.message.trim().length === 0) {
      throw new Error('Message is required and cannot be empty');
    }
    
    if (!request.sessionId || request.sessionId.trim().length === 0) {
      throw new Error('Session ID is required and cannot be empty');
    }
  }
}