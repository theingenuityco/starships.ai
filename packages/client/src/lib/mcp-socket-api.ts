import { generateId } from './utils';
import SocketClient from './socket-client';

// Define MCP types locally since they're not properly exported yet
export interface MCPConfiguration {
  id: string;
  userId: string;
  agentId?: string;
  name: string;
  containerImage: string;
  tools: any[];
  resources: any[];
  environment: Record<string, string>;
  limits: {
    memory: string;
    cpu: string;
    timeout: number;
  };
  agentPermissions: Record<string, string[]>;
  agentToolCredentials: Record<string, Record<string, any>>;
  createdAt: string;
  updatedAt: string;
}

export interface MCPToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  agentId: string;
  userId: string;
  timestamp: string;
  context?: {
    conversationId?: string;
    messageId?: string;
  };
}

export interface MCPToolResult {
  id: string;
  toolCallId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  timestamp: string;
  logs?: string[];
}

export interface MCPStatus {
  serverId: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  containerInfo: {
    id: string;
    status: string;
    uptime: number;
    resourceUsage: {
      memory: string;
      cpu: string;
    };
  };
  availableTools: string[];
  lastActivity: string;
}

export interface MCPHealthResult {
  serverId: string;
  healthy: boolean;
  uptime: number;
  resourceUsage: {
    memory: string;
    cpu: string;
  };
  availableTools: number;
  lastActivity: string;
  error?: string;
}

export interface MCPToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
  agentCredentialsConfigured?: boolean;
}

export interface MCPContainerLogs {
  serverId: string;
  containerId: string;
  logs: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export interface MCPToolStreamChunk {
  toolCallId: string;
  type: 'stdout' | 'stderr' | 'result' | 'error' | 'complete';
  content: string;
  timestamp: number;
}

export interface MCPConfigurationResult {
  success: boolean;
  serverId?: string;
  error?: string;
}

export interface MCPCallbacks {
  onConfigurationResult?: (result: MCPConfigurationResult) => void;
  onToolResult?: (result: MCPToolResult) => void;
  onToolStream?: (chunk: MCPToolStreamChunk) => void;
  onStatusUpdate?: (status: MCPStatus) => void;
  onContainerLogs?: (logs: MCPContainerLogs) => void;
  onHealthResult?: (result: MCPHealthResult) => void;
  onAgentToolsAvailable?: (agentId: string, tools: MCPToolSchema[]) => void;
  onAgentPermissionUpdated?: (agentId: string, toolName: string, granted: boolean) => void;
  onAgentCredentialsUpdated?: (agentId: string, toolName: string, configured: boolean) => void;
}

export const mcpSocketAPI = {
  // Configure MCP server for user
  configureMCPServer: (
    config: MCPConfiguration,
    callbacks: MCPCallbacks
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      callbacks.onConfigurationResult?.({
        success: false,
        error: 'Socket.IO connection required - please check your connection'
      });
      return { abort: () => {} };
    }

    let isAborted = false;

    const handleConfigurationResult = (result: MCPConfigurationResult) => {
      if (!isAborted) {
        callbacks.onConfigurationResult?.(result);
        if (result.success) {
          console.log('[MCP API] MCP server configured successfully:', result.serverId);
        }
      }
    };

    const handleStatusUpdate = (status: MCPStatus) => {
      if (!isAborted) {
        callbacks.onStatusUpdate?.(status);
      }
    };

    const handleContainerLogs = (logs: MCPContainerLogs) => {
      if (!isAborted) {
        callbacks.onContainerLogs?.(logs);
      }
    };

    const handleAgentToolsAvailable = (agentId: string, tools: MCPToolSchema[]) => {
      if (!isAborted) {
        callbacks.onAgentToolsAvailable?.(agentId, tools);
      }
    };

    const handleAgentPermissionUpdated = (agentId: string, toolName: string, granted: boolean) => {
      if (!isAborted) {
        callbacks.onAgentPermissionUpdated?.(agentId, toolName, granted);
      }
    };

    const handleAgentCredentialsUpdated = (agentId: string, toolName: string, configured: boolean) => {
      if (!isAborted) {
        callbacks.onAgentCredentialsUpdated?.(agentId, toolName, configured);
      }
    };

    const cleanup = () => {
      (socket as any).off('mcp:configuration-result', handleConfigurationResult);
      (socket as any).off('mcp:status-update', handleStatusUpdate);
      (socket as any).off('mcp:container-logs', handleContainerLogs);
      (socket as any).off('mcp:agent-tools-available', handleAgentToolsAvailable);
      (socket as any).off('mcp:agent-permission-updated', handleAgentPermissionUpdated);
      (socket as any).off('mcp:agent-credentials-updated', handleAgentCredentialsUpdated);
    };

    // Set up event listeners
    (socket as any).on('mcp:configuration-result', handleConfigurationResult);
    (socket as any).on('mcp:status-update', handleStatusUpdate);
    (socket as any).on('mcp:container-logs', handleContainerLogs);
    (socket as any).on('mcp:agent-tools-available', handleAgentToolsAvailable);
    (socket as any).on('mcp:agent-permission-updated', handleAgentPermissionUpdated);
    (socket as any).on('mcp:agent-credentials-updated', handleAgentCredentialsUpdated);

    // Send configuration request
    (socket as any).emit('mcp:configure', config);

    return {
      abort: () => {
        isAborted = true;
        cleanup();
      }
    };
  },

  // Execute MCP tool with streaming
  executeTool: (
    toolCall: MCPToolCall,
    callbacks: MCPCallbacks
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      callbacks.onToolResult?.({
        id: toolCall.id,
        toolCallId: toolCall.id,
        success: false,
        error: 'Socket.IO connection required - please check your connection',
        executionTime: 0,
        timestamp: new Date().toISOString()
      });
      return { abort: () => {} };
    }

    let isAborted = false;

    const handleToolResult = (result: MCPToolResult) => {
      if (result.toolCallId === toolCall.id && !isAborted) {
        callbacks.onToolResult?.(result);
        cleanup();
      }
    };

    const handleToolStream = (chunk: MCPToolStreamChunk) => {
      if (chunk.toolCallId === toolCall.id && !isAborted) {
        callbacks.onToolStream?.(chunk);
      }
    };

    const cleanup = () => {
      (socket as any).off('mcp:tool-result', handleToolResult);
      (socket as any).off('mcp:tool-stream', handleToolStream);
    };

    // Set up event listeners
    (socket as any).on('mcp:tool-result', handleToolResult);
    (socket as any).on('mcp:tool-stream', handleToolStream);

    // Execute tool
    (socket as any).emit('mcp:tool-execute', toolCall);

    return {
      abort: () => {
        isAborted = true;
        cleanup();
      }
    };
  },

  // Perform health check
  performHealthCheck: (
    serverId: string,
    callbacks: MCPCallbacks
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      callbacks.onHealthResult?.({
        serverId,
        healthy: false,
        uptime: 0,
        resourceUsage: { memory: '0MB', cpu: '0%' },
        availableTools: 0,
        lastActivity: new Date().toISOString(),
        error: 'Socket.IO connection required - please check your connection'
      });
      return { abort: () => {} };
    }

    let isAborted = false;

    const handleHealthResult = (result: MCPHealthResult) => {
      if (result.serverId === serverId && !isAborted) {
        callbacks.onHealthResult?.(result);
        cleanup();
      }
    };

    const cleanup = () => {
      (socket as any).off('mcp:health-result', handleHealthResult);
    };

    // Set up event listener
    (socket as any).on('mcp:health-result', handleHealthResult);

    // Request health check
    (socket as any).emit('mcp:health-check', serverId);

    return {
      abort: () => {
        isAborted = true;
        cleanup();
      }
    };
  },

  // Subscribe to MCP events for a specific server
  subscribeToMCPEvents: (
    serverId: string,
    callbacks: MCPCallbacks
  ): { unsubscribe: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      console.warn('[MCP API] Cannot subscribe to MCP events - not connected');
      return { unsubscribe: () => {} };
    }

    const handleStatusUpdate = (status: MCPStatus) => {
      if (status.serverId === serverId) {
        callbacks.onStatusUpdate?.(status);
      }
    };

    const handleContainerLogs = (logs: MCPContainerLogs) => {
      if (logs.serverId === serverId) {
        callbacks.onContainerLogs?.(logs);
      }
    };

    const handleAgentToolsAvailable = (agentId: string, tools: MCPToolSchema[]) => {
      callbacks.onAgentToolsAvailable?.(agentId, tools);
    };

    const handleAgentPermissionUpdated = (agentId: string, toolName: string, granted: boolean) => {
      callbacks.onAgentPermissionUpdated?.(agentId, toolName, granted);
    };

    const handleAgentCredentialsUpdated = (agentId: string, toolName: string, configured: boolean) => {
      callbacks.onAgentCredentialsUpdated?.(agentId, toolName, configured);
    };

    // Set up event listeners
    (socket as any).on('mcp:status-update', handleStatusUpdate);
    (socket as any).on('mcp:container-logs', handleContainerLogs);
    (socket as any).on('mcp:agent-tools-available', handleAgentToolsAvailable);
    (socket as any).on('mcp:agent-permission-updated', handleAgentPermissionUpdated);
    (socket as any).on('mcp:agent-credentials-updated', handleAgentCredentialsUpdated);

    return {
      unsubscribe: () => {
        (socket as any).off('mcp:status-update', handleStatusUpdate);
        (socket as any).off('mcp:container-logs', handleContainerLogs);
        (socket as any).off('mcp:agent-tools-available', handleAgentToolsAvailable);
        (socket as any).off('mcp:agent-permission-updated', handleAgentPermissionUpdated);
        (socket as any).off('mcp:agent-credentials-updated', handleAgentCredentialsUpdated);
      }
    };
  }
};

// Utility function to create MCP tool call
export function createMCPToolCall(
  toolName: string,
  parameters: Record<string, any>,
  agentId: string,
  userId: string,
  context?: { conversationId?: string; messageId?: string }
): MCPToolCall {
  return {
    id: generateId(),
    toolName,
    parameters,
    agentId,
    userId,
    timestamp: new Date().toISOString(),
    context
  };
}

// Utility function to create MCP configuration
export function createMCPConfiguration(
  userId: string,
  name: string,
  tools: any[],
  agentPermissions: Record<string, string[]>,
  agentToolCredentials: Record<string, Record<string, any>>,
  options?: {
    containerImage?: string;
    environment?: Record<string, string>;
    limits?: { memory: string; cpu: string; timeout: number };
  }
): MCPConfiguration {
  return {
    id: generateId(),
    userId,
    name,
    containerImage: options?.containerImage || 'starships-mcp-tools:latest',
    tools,
    resources: [],
    environment: options?.environment || {},
    limits: options?.limits || {
      memory: '512m',
      cpu: '0.5',
      timeout: 30000
    },
    agentPermissions,
    agentToolCredentials,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}