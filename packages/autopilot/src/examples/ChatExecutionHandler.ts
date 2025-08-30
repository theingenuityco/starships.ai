/**
 * Example: Chat Execution Handler
 * 
 * Shows how to implement an ExecutionHandler for chat-based agents
 */

import type { AgentRequest, AgentResponse, ExecutionHandler } from '../types/agent';
import { Agent } from '../agent/Agent';

/**
 * Example execution handler for chat-based agents
 */
export class ChatExecutionHandler implements ExecutionHandler {
  async handle(request: AgentRequest, agent: Agent): Promise<AgentResponse> {
    // Simple echo response - in real implementation this would:
    // - Call LLM services
    // - Access memory/context
    // - Use agent-specific logic
    
    const response: AgentResponse = {
      content: `Hello! I'm ${agent.name}. You said: "${request.message}"`,
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId,
      metadata: {
        agentId: agent.id,
        agentName: agent.name,
        handlerType: 'chat'
      }
    };
    
    return response;
  }
}