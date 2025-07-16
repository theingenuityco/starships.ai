import { RepositoryFactory } from '@starships/models';
import { MCPConfiguration, MCPToolCall, MCPToolResult, MCPStatus } from '@starships/protocol';
import { MCPServer, MCPTool, MCPContainer, AgentMCPPermission, AgentToolCredentials } from '@starships/models';
import crypto from 'crypto';

/**
 * Service for managing MCP (Model Context Protocol) servers and tools
 */
export class MCPService {
  private static isInitialized = false;
  private static encryptionKey: string;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.encryptionKey = process.env.MCP_ENCRYPTION_KEY || 'default-key-change-in-production';
    
    if (this.encryptionKey === 'default-key-change-in-production') {
      console.warn('⚠️  Using default MCP encryption key - change MCP_ENCRYPTION_KEY in production!');
    }

    this.isInitialized = true;
    console.log('✅ MCP Service initialized');
  }

  // User MCP Server Management
  static async createUserMCPServer(userId: string, config: MCPConfiguration): Promise<MCPServer> {
    try {
      await this.initialize();

      const mcpRepo = RepositoryFactory.getMCPRepository();

      // Check if user already has an MCP server
      const existingServers = await mcpRepo.findMCPServerByUser(userId);
      if (existingServers.length > 0) {
        // Update existing server
        const existing = existingServers[0];
        const updated = await mcpRepo.updateMCPServer(existing.id, {
          name: config.name,
          containerImage: config.containerImage,
          environment: config.environment,
          limits: config.limits,
          status: 'starting'
        });
        
        if (updated) {
          // Update tools and permissions
          await this.updateServerTools(updated.id, config.tools);
          await this.setAgentPermissions(userId, config.agentPermissions);
          await this.setAgentCredentials(userId, config.agentToolCredentials);
          
          return updated;
        }
      }

      // Create new MCP server
      const mcpServer = await mcpRepo.createMCPServer({
        userId,
        agentId: config.agentId,
        name: config.name,
        containerImage: config.containerImage,
        status: 'starting',
        environment: config.environment,
        limits: config.limits
      });

      // Create tools for the server
      await this.createServerTools(mcpServer.id, config.tools);

      // Set agent permissions and credentials
      if (config.agentPermissions) {
        await this.setAgentPermissions(userId, config.agentPermissions);
      }

      if (config.agentToolCredentials) {
        await this.setAgentCredentials(userId, config.agentToolCredentials);
      }

      console.log(`✅ Created MCP server for user ${userId}: ${mcpServer.id}`);
      return mcpServer;
    } catch (error) {
      console.error(`❌ Failed to create MCP server for user ${userId}:`, error);
      throw error;
    }
  }

  static async getMCPServerForUser(userId: string): Promise<MCPServer | null> {
    await this.initialize();
    
    const mcpRepo = RepositoryFactory.getMCPRepository();
    const servers = await mcpRepo.findMCPServerByUser(userId);
    
    return servers[0] || null;
  }

  static async getMCPServerForAgent(agentId: string): Promise<MCPServer | null> {
    await this.initialize();
    
    const mcpRepo = RepositoryFactory.getMCPRepository();
    return await mcpRepo.findMCPServerByAgent(agentId);
  }

  // Tool Management
  static async getUserAvailableTools(userId: string): Promise<MCPTool[]> {
    await this.initialize();
    
    const mcpRepo = RepositoryFactory.getMCPRepository();
    const servers = await mcpRepo.findMCPServerByUser(userId);
    
    if (servers.length === 0) {
      return [];
    }

    return await mcpRepo.findToolsByServer(servers[0].id);
  }

  static async getAgentAvailableTools(userId: string, agentId: string): Promise<MCPTool[]> {
    await this.initialize();
    
    const allTools = await this.getUserAvailableTools(userId);
    const availableTools: MCPTool[] = [];

    // Filter tools by agent permissions and credential availability
    for (const tool of allTools) {
      const hasPermission = await this.checkAgentToolPermission(userId, agentId, tool.name);
      const hasCredentials = await this.getAgentToolCredentials(userId, agentId, tool.name);
      
      if (hasPermission && hasCredentials) {
        availableTools.push(tool);
      }
    }

    return availableTools;
  }

  // Tool Execution with Permission and Credential Checks
  static async executeToolWithPermissionAndCredentialCheck(
    userId: string,
    agentId: string,
    toolCall: MCPToolCall
  ): Promise<MCPToolResult> {
    try {
      await this.initialize();

      const startTime = Date.now();

      // 1. Check if agent has permission for this tool
      const hasPermission = await this.checkAgentToolPermission(userId, agentId, toolCall.toolName);
      
      if (!hasPermission) {
        return {
          id: toolCall.id,
          toolCallId: toolCall.id,
          success: false,
          error: `Agent ${agentId} does not have permission to use tool ${toolCall.toolName}`,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }

      // 2. Get agent-specific credentials for this tool
      const agentCredentials = await this.getAgentToolCredentials(userId, agentId, toolCall.toolName);
      
      if (!agentCredentials) {
        return {
          id: toolCall.id,
          toolCallId: toolCall.id,
          success: false,
          error: `No credentials configured for agent ${agentId} to use tool ${toolCall.toolName}`,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }

      // 3. Merge tool parameters with agent-specific credentials
      const toolCallWithCredentials = {
        ...toolCall,
        parameters: {
          ...toolCall.parameters,
          ...agentCredentials  // Agent-specific credentials override defaults
        }
      };

      // 4. Execute tool (this would integrate with the MCP server)
      const result = await this.executeToolInUserContainer(userId, toolCallWithCredentials);
      
      // 5. Audit log the execution
      await this.auditToolExecution(toolCall, result, Date.now() - startTime);

      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed for agent ${agentId}:`, error);
      return {
        id: toolCall.id,
        toolCallId: toolCall.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - Date.now(),
        timestamp: new Date().toISOString()
      };
    }
  }

  // Agent Permission Management
  static async setAgentPermissions(userId: string, agentPermissions: Record<string, string[]>): Promise<void> {
    try {
      await this.initialize();
      
      const mcpRepo = RepositoryFactory.getMCPRepository();

      for (const [agentId, toolNames] of Object.entries(agentPermissions)) {
        // Remove existing permissions for this agent
        const existingPermissions = await mcpRepo.listAgentPermissions(userId, agentId);
        for (const permission of existingPermissions) {
          await mcpRepo.revokeAgentPermission(userId, agentId, permission.toolName);
        }

        // Grant new permissions
        for (const toolName of toolNames) {
          await mcpRepo.grantAgentPermission({
            userId,
            agentId,
            toolName,
            granted: true,
            grantedBy: 'system'
          });
        }
        
        console.log(`✅ Set permissions for agent ${agentId}: ${toolNames.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Failed to set agent permissions for user ${userId}:`, error);
      throw error;
    }
  }

  static async checkAgentToolPermission(userId: string, agentId: string, toolName: string): Promise<boolean> {
    await this.initialize();
    
    const mcpRepo = RepositoryFactory.getMCPRepository();
    return await mcpRepo.checkAgentPermission(userId, agentId, toolName);
  }

  // Agent Credential Management
  static async setAgentCredentials(userId: string, agentToolCredentials: Record<string, Record<string, any>>): Promise<void> {
    try {
      await this.initialize();
      
      const mcpRepo = RepositoryFactory.getMCPRepository();

      for (const [agentId, toolCredentials] of Object.entries(agentToolCredentials)) {
        for (const [toolName, credentials] of Object.entries(toolCredentials)) {
          const encryptedCredentials = await this.encryptCredentials(credentials);
          
          await mcpRepo.setAgentCredentials({
            userId,
            agentId,
            toolName,
            encryptedCredentials
          });
          
          console.log(`✅ Set credentials for agent ${agentId}, tool ${toolName}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to set agent credentials for user ${userId}:`, error);
      throw error;
    }
  }

  static async getAgentToolCredentials(userId: string, agentId: string, toolName: string): Promise<Record<string, any> | null> {
    try {
      await this.initialize();
      
      const mcpRepo = RepositoryFactory.getMCPRepository();
      const credentialsRecord = await mcpRepo.getAgentCredentials(userId, agentId, toolName);
      
      if (!credentialsRecord) {
        return null;
      }
      
      // Decrypt credentials before returning
      return await this.decryptCredentials(credentialsRecord.encryptedCredentials);
    } catch (error) {
      console.error(`❌ Failed to get credentials for agent ${agentId}, tool ${toolName}:`, error);
      return null;
    }
  }

  // Private helper methods
  private static async createServerTools(serverId: string, toolConfigs: any[]): Promise<void> {
    const mcpRepo = RepositoryFactory.getMCPRepository();
    
    for (const config of toolConfigs) {
      await mcpRepo.createTool({
        serverId,
        name: config.name,
        description: config.description,
        parameters: config.parameters,
        permissions: config.permissions,
        category: config.category
      });
    }
  }

  private static async updateServerTools(serverId: string, toolConfigs: any[]): Promise<void> {
    const mcpRepo = RepositoryFactory.getMCPRepository();
    
    // Get existing tools
    const existingTools = await mcpRepo.findToolsByServer(serverId);
    
    // Remove tools not in new config
    const newToolNames = toolConfigs.map(t => t.name);
    for (const existingTool of existingTools) {
      if (!newToolNames.includes(existingTool.name)) {
        await mcpRepo.deleteTool(existingTool.id);
      }
    }
    
    // Add or update tools
    for (const config of toolConfigs) {
      const existingTool = existingTools.find(t => t.name === config.name);
      if (existingTool) {
        await mcpRepo.updateTool(existingTool.id, {
          description: config.description,
          parameters: config.parameters,
          permissions: config.permissions,
          category: config.category
        });
      } else {
        await mcpRepo.createTool({
          serverId,
          name: config.name,
          description: config.description,
          parameters: config.parameters,
          permissions: config.permissions,
          category: config.category
        });
      }
    }
  }

  private static async executeToolInUserContainer(userId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    // This is a placeholder - in the real implementation, this would communicate
    // with the MCP server to execute the tool in the user's container
    
    const startTime = Date.now();
    
    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      id: toolCall.id,
      toolCallId: toolCall.id,
      success: true,
      result: {
        toolName: toolCall.toolName,
        parameters: toolCall.parameters,
        executedAt: new Date().toISOString(),
        message: `Tool ${toolCall.toolName} executed successfully`
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  private static async auditToolExecution(toolCall: MCPToolCall, result: MCPToolResult, executionTime: number): Promise<void> {
    try {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        userId: toolCall.userId,
        agentId: toolCall.agentId,
        toolName: toolCall.toolName,
        success: result.success,
        executionTime,
        error: result.error
      };

      // In a real implementation, this would be stored in a database or log system
      console.log('📋 MCP Tool execution audit:', JSON.stringify(auditEntry, null, 2));
    } catch (error) {
      console.error('❌ Failed to audit MCP tool execution:', error);
    }
  }

  // Security: Encrypt/decrypt credentials
  private static async encryptCredentials(credentials: Record<string, any>): Promise<string> {
    try {
      const credentialsString = JSON.stringify(credentials);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), Buffer.alloc(16, 0));
      let encrypted = cipher.update(credentialsString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      console.error('❌ Failed to encrypt credentials:', error);
      throw new Error('Credential encryption failed');
    }
  }

  private static async decryptCredentials(encryptedCredentials: string): Promise<Record<string, any>> {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), Buffer.alloc(16, 0));
      let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('❌ Failed to decrypt credentials:', error);
      throw new Error('Credential decryption failed');
    }
  }
}