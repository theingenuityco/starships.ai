/**
 * MCP-Enabled First Officer Agent
 * 
 * Factory function and wrapper for FirstOfficerAgent with MCP tool capabilities,
 * allowing agents to leverage MCP servers during expedition orchestration.
 */

import { FirstOfficerAgent } from './FirstOfficerAgent';
import { MCPEnhancedTaskExecutor } from './MCPEnhancedTaskExecutor';
import { FirstOfficerConfig } from './types';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';
import { ExpeditionMessage } from '@starships/protocol';

export interface MCPEnabledFirstOfficerConfig extends FirstOfficerConfig {
  mcpEnabled?: boolean;
  mcpStarshipId?: string; // Starship ID for MCP tool discovery
}

/**
 * Factory function to create an MCP-enabled FirstOfficerAgent
 * 
 * This function creates a FirstOfficerAgent instance that uses MCPEnhancedTaskExecutor
 * internally for MCP tool integration.
 */
export async function createMCPEnabledFirstOfficerAgent(
  starshipId: string,
  memoryStore: LangChainMemoryStore,
  config: Partial<MCPEnabledFirstOfficerConfig> = {},
  selectedAgentIds: string[],
  messageEmitCallback?: (message: ExpeditionMessage) => Promise<void>,
  webSocketEmitter?: WebSocketEventEmitter
): Promise<MCPEnabledFirstOfficerAgent> {
  // Create the base agent
  const baseAgent = new FirstOfficerAgent(starshipId, memoryStore, config, selectedAgentIds, messageEmitCallback, webSocketEmitter);
  
  // Create MCP-enhanced task executor
  const mcpTaskExecutor = new MCPEnhancedTaskExecutor(
    config as FirstOfficerConfig,
    memoryStore,
    {
      mcpEnabled: config.mcpEnabled ?? true,
      customGateway: undefined // Use default gateway
    }
  );
  
  // Set the starship ID for MCP tool discovery
  const mcpStarshipId = config.mcpStarshipId || starshipId;
  try {
    await mcpTaskExecutor.setStarshipId(mcpStarshipId);
    console.log('[MCPEnabledFirstOfficer] Successfully set starship ID:', mcpStarshipId);
  } catch (error) {
    console.error('[MCPEnabledFirstOfficer] Failed to set starship ID:', error);
  }
  
  // Replace the taskExecutor using reflection (careful approach)
  const agentWithMCP = baseAgent as any;
  agentWithMCP._originalTaskExecutor = agentWithMCP.taskExecutor;
  agentWithMCP.taskExecutor = mcpTaskExecutor;
  
  // Add MCP-specific methods
  const mcpAgent = baseAgent as MCPEnabledFirstOfficerAgent;
  
  // Add MCP management methods
  (mcpAgent as any).getMCPStats = () => mcpTaskExecutor.getGlobalMCPStats();
  (mcpAgent as any).setMCPEnabled = (enabled: boolean) => mcpTaskExecutor.setMCPEnabled(enabled);
  (mcpAgent as any).clearMCPCache = () => mcpTaskExecutor.clearMCPCache();
  (mcpAgent as any).checkMCPAvailability = () => mcpTaskExecutor.checkMCPAvailability();
  (mcpAgent as any)._mcpTaskExecutor = mcpTaskExecutor;
  (mcpAgent as any)._mcpConfig = config;
  
  console.log('[MCPEnabledFirstOfficer] Created with MCP support');
  
  return mcpAgent;
}

/**
 * MCP-Enabled First Officer Agent interface
 * 
 * This interface extends FirstOfficerAgent with MCP-specific methods
 */
export interface MCPEnabledFirstOfficerAgent extends FirstOfficerAgent {
  getMCPStats(): Record<string, any>;
  setMCPEnabled(enabled: boolean): void;
  clearMCPCache(): void;
  checkMCPAvailability(): Promise<{
    available: boolean;
    toolCount: number;
    services: string[];
  }>;
}