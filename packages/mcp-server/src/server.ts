import { MCPConfiguration, MCPToolCall, MCPToolResult, MCPStatus } from '@starships/protocol';
import { MCPTool } from '@starships/models';
import { UserContainerManager } from './docker/UserContainerManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { SecurityManager } from './security/SecurityManager';

export class MCPServer {
  private containerManager: UserContainerManager;
  private toolRegistry: ToolRegistry;
  private securityManager: SecurityManager;
  private initialized: boolean = false;

  constructor(
    containerManager: UserContainerManager,
    toolRegistry: ToolRegistry,
    securityManager: SecurityManager
  ) {
    this.containerManager = containerManager;
    this.toolRegistry = toolRegistry;
    this.securityManager = securityManager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('🔧 Initializing MCP Server...');
    
    try {
      // Initialize Docker connection
      await this.containerManager.initialize();
      console.log('✅ Container manager initialized');

      // Initialize tool registry
      await this.toolRegistry.initialize();
      console.log('✅ Tool registry initialized');

      // Initialize security manager
      await this.securityManager.initialize();
      console.log('✅ Security manager initialized');

      this.initialized = true;
      console.log('🚀 MCP Server initialization complete');
    } catch (error) {
      console.error('❌ MCP Server initialization failed:', error);
      throw error;
    }
  }

  async configureUserMCP(config: MCPConfiguration): Promise<{ success: boolean; serverId?: string; error?: string }> {
    try {
      if (!this.initialized) {
        throw new Error('MCP Server not initialized');
      }

      // Validate configuration
      await this.securityManager.validateConfiguration(config);

      // Create user container with tools
      const containerId = await this.containerManager.createUserContainer(config.userId, config);

      // Register tools for the user
      await this.toolRegistry.registerUserTools(config.userId, config.tools);

      // Set agent permissions and credentials
      if (config.agentPermissions) {
        await this.securityManager.setAgentPermissions(config.userId, config.agentPermissions);
      }

      if (config.agentToolCredentials) {
        await this.securityManager.setAgentCredentials(config.userId, config.agentToolCredentials);
      }

      return {
        success: true,
        serverId: containerId
      };
    } catch (error) {
      console.error('MCP configuration error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async executeToolCall(toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      if (!this.initialized) {
        throw new Error('MCP Server not initialized');
      }

      // Validate permissions and credentials
      const hasPermission = await this.securityManager.validateToolExecution(toolCall);
      if (!hasPermission.allowed) {
        return {
          id: toolCall.id,
          toolCallId: toolCall.id,
          success: false,
          error: hasPermission.reason || 'Permission denied',
          executionTime: 0,
          timestamp: new Date().toISOString()
        };
      }

      // Get agent-specific credentials
      const credentials = await this.securityManager.getAgentCredentials(
        toolCall.userId,
        toolCall.agentId,
        toolCall.toolName
      );

      // Merge credentials with tool parameters
      const enhancedToolCall = {
        ...toolCall,
        parameters: {
          ...toolCall.parameters,
          ...credentials
        }
      };

      // Execute tool in user's container
      const startTime = Date.now();
      const result = await this.containerManager.executeToolInContainer(
        toolCall.userId,
        enhancedToolCall
      );
      const executionTime = Date.now() - startTime;

      // Audit log the execution
      await this.securityManager.auditToolExecution(toolCall, result, executionTime);

      return {
        id: toolCall.id,
        toolCallId: toolCall.id,
        success: true,
        result: result,
        executionTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Tool execution error:', error);
      return {
        id: toolCall.id,
        toolCallId: toolCall.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getUserMCPStatus(userId: string): Promise<MCPStatus> {
    try {
      const containerInfo = await this.containerManager.getUserContainerInfo(userId);
      const availableTools = await this.toolRegistry.getUserTools(userId);

      return {
        serverId: containerInfo.id,
        status: containerInfo.status as 'running' | 'stopped' | 'error' | 'starting',
        containerInfo: {
          id: containerInfo.dockerId,
          status: containerInfo.status,
          uptime: Date.now() - new Date(containerInfo.createdAt).getTime(),
          resourceUsage: containerInfo.resourceUsage
        },
        availableTools: availableTools.map(tool => tool.name),
        lastActivity: containerInfo.lastActivity
      };
    } catch (error) {
      console.error('Status check error:', error);
      throw error;
    }
  }

  async getUserAvailableTools(userId: string): Promise<MCPTool[]> {
    try {
      return await this.toolRegistry.getUserTools(userId);
    } catch (error) {
      console.error('Tools listing error:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down MCP Server...');
    
    try {
      await this.containerManager.cleanup();
      console.log('✅ Container manager cleaned up');
      
      await this.toolRegistry.cleanup();
      console.log('✅ Tool registry cleaned up');
      
      this.initialized = false;
      console.log('✅ MCP Server shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}