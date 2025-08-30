/**
 * Agent Framework Types
 * 
 * Core type definitions for the autopilot agent framework
 */

/**
 * Context provided when initializing an agent
 */
export interface AgentContext {
  userId: string;
  starshipId?: string;
  services?: Record<string, unknown>;
}

/**
 * Request sent to an agent for execution
 */
export interface AgentRequest {
  message: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response returned by an agent after execution
 */
export interface AgentResponse {
  content: string;
  timestamp: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for creating a configurable agent
 */
export interface AgentConfiguration {
  id?: string;
  name: string;
  description: string;
  handler: ExecutionHandler;
}

/**
 * Handler interface for processing agent requests
 */
export interface ExecutionHandler {
  handle(request: AgentRequest, agent: Agent): Promise<AgentResponse>;
}

/**
 * Forward declaration of Agent class (to avoid circular dependency)
 */
export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  
  onInitialize(context: AgentContext): Promise<void>;
  onExecute(request: AgentRequest): Promise<AgentResponse>;
  onDestroy(): Promise<void>;
  execute(request: AgentRequest): Promise<AgentResponse>;
}