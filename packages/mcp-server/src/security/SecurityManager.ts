import { MCPConfiguration, MCPToolCall } from '@starships/protocol';
import { MCPToolResult } from '@starships/protocol';
import crypto from 'crypto';

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

export class SecurityManager {
  private encryptionKey: string;
  private agentPermissions: Map<string, Map<string, string[]>> = new Map(); // userId -> agentId -> toolNames[]
  private agentCredentials: Map<string, Map<string, Map<string, string>>> = new Map(); // userId -> agentId -> toolName -> encryptedCredentials
  private initialized: boolean = false;

  constructor() {
    this.encryptionKey = process.env.MCP_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Validate encryption key
      if (this.encryptionKey === 'default-key-change-in-production') {
        console.warn('⚠️  Using default encryption key - change MCP_ENCRYPTION_KEY in production!');
      }

      this.initialized = true;
      console.log('✅ Security manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize security manager:', error);
      throw error;
    }
  }

  async validateConfiguration(config: MCPConfiguration): Promise<void> {
    // Validate user configuration
    if (!config.userId) {
      throw new Error('User ID is required');
    }

    if (!config.tools || config.tools.length === 0) {
      throw new Error('At least one tool must be configured');
    }

    // Validate resource limits
    if (!config.limits) {
      throw new Error('Resource limits are required');
    }

    const memoryLimit = this.parseMemoryLimit(config.limits.memory);
    if (memoryLimit > 2 * 1024 * 1024 * 1024) { // 2GB max
      throw new Error('Memory limit cannot exceed 2GB');
    }

    const cpuLimit = parseFloat(config.limits.cpu);
    if (cpuLimit > 2.0) { // 2 CPU cores max
      throw new Error('CPU limit cannot exceed 2.0');
    }

    if (config.limits.timeout > 300000) { // 5 minutes max
      throw new Error('Timeout cannot exceed 5 minutes');
    }

    // Validate tools
    for (const tool of config.tools) {
      if (!tool.name || !tool.description) {
        throw new Error(`Tool ${tool.name} must have name and description`);
      }

      // Check for dangerous tool names
      const dangerousTools = ['rm', 'delete', 'format', 'sudo', 'chmod'];
      if (dangerousTools.some(dangerous => tool.name.toLowerCase().includes(dangerous))) {
        throw new Error(`Tool name '${tool.name}' contains potentially dangerous keywords`);
      }
    }

    console.log(`✅ Configuration validated for user ${config.userId}`);
  }

  async validateToolExecution(toolCall: MCPToolCall): Promise<ValidationResult> {
    try {
      // Check if agent has permission for this tool
      const hasPermission = await this.checkAgentPermission(
        toolCall.userId,
        toolCall.agentId,
        toolCall.toolName
      );

      if (!hasPermission) {
        return {
          allowed: false,
          reason: `Agent ${toolCall.agentId} does not have permission to use tool ${toolCall.toolName}`
        };
      }

      // Check if agent has credentials configured for this tool
      const hasCredentials = await this.hasAgentCredentials(
        toolCall.userId,
        toolCall.agentId,
        toolCall.toolName
      );

      if (!hasCredentials) {
        return {
          allowed: false,
          reason: `No credentials configured for agent ${toolCall.agentId} to use tool ${toolCall.toolName}`
        };
      }

      // Validate tool parameters
      const paramValidation = this.validateToolParameters(toolCall);
      if (!paramValidation.allowed) {
        return paramValidation;
      }

      return { allowed: true };
    } catch (error) {
      console.error('Tool validation error:', error);
      return {
        allowed: false,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async setAgentPermissions(userId: string, agentPermissions: Record<string, string[]>): Promise<void> {
    try {
      if (!this.agentPermissions.has(userId)) {
        this.agentPermissions.set(userId, new Map());
      }

      const userPermissions = this.agentPermissions.get(userId)!;

      for (const [agentId, toolNames] of Object.entries(agentPermissions)) {
        userPermissions.set(agentId, toolNames);
        console.log(`✅ Set permissions for agent ${agentId}: ${toolNames.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Failed to set agent permissions for user ${userId}:`, error);
      throw error;
    }
  }

  async setAgentCredentials(userId: string, agentCredentials: Record<string, Record<string, any>>): Promise<void> {
    try {
      if (!this.agentCredentials.has(userId)) {
        this.agentCredentials.set(userId, new Map());
      }

      const userCredentials = this.agentCredentials.get(userId)!;

      for (const [agentId, toolCredentials] of Object.entries(agentCredentials)) {
        if (!userCredentials.has(agentId)) {
          userCredentials.set(agentId, new Map());
        }

        const agentToolCredentials = userCredentials.get(agentId)!;

        for (const [toolName, credentials] of Object.entries(toolCredentials)) {
          const encryptedCredentials = await this.encryptCredentials(credentials);
          agentToolCredentials.set(toolName, encryptedCredentials);
          console.log(`✅ Set credentials for agent ${agentId}, tool ${toolName}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to set agent credentials for user ${userId}:`, error);
      throw error;
    }
  }

  async checkAgentPermission(userId: string, agentId: string, toolName: string): Promise<boolean> {
    const userPermissions = this.agentPermissions.get(userId);
    if (!userPermissions) return false;

    const agentTools = userPermissions.get(agentId);
    if (!agentTools) return false;

    return agentTools.includes(toolName);
  }

  async hasAgentCredentials(userId: string, agentId: string, toolName: string): Promise<boolean> {
    const userCredentials = this.agentCredentials.get(userId);
    if (!userCredentials) return false;

    const agentCredentials = userCredentials.get(agentId);
    if (!agentCredentials) return false;

    return agentCredentials.has(toolName);
  }

  async getAgentCredentials(userId: string, agentId: string, toolName: string): Promise<Record<string, any>> {
    try {
      const userCredentials = this.agentCredentials.get(userId);
      if (!userCredentials) return {};

      const agentCredentials = userCredentials.get(agentId);
      if (!agentCredentials) return {};

      const encryptedCredentials = agentCredentials.get(toolName);
      if (!encryptedCredentials) return {};

      return await this.decryptCredentials(encryptedCredentials);
    } catch (error) {
      console.error(`❌ Failed to get credentials for agent ${agentId}, tool ${toolName}:`, error);
      return {};
    }
  }

  async auditToolExecution(toolCall: MCPToolCall, result: MCPToolResult, executionTime: number): Promise<void> {
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
      console.log('📋 Tool execution audit:', JSON.stringify(auditEntry, null, 2));
    } catch (error) {
      console.error('❌ Failed to audit tool execution:', error);
    }
  }

  private validateToolParameters(toolCall: MCPToolCall): ValidationResult {
    // Basic parameter validation
    if (!toolCall.parameters || typeof toolCall.parameters !== 'object') {
      return {
        allowed: false,
        reason: 'Tool parameters must be an object'
      };
    }

    // Check for potentially dangerous parameters
    const dangerousParams = ['rm', 'delete', 'sudo', 'chmod', 'format', 'exec', 'eval'];
    const paramString = JSON.stringify(toolCall.parameters).toLowerCase();
    
    for (const dangerous of dangerousParams) {
      if (paramString.includes(dangerous)) {
        return {
          allowed: false,
          reason: `Tool parameters contain potentially dangerous content: ${dangerous}`
        };
      }
    }

    return { allowed: true };
  }

  private async encryptCredentials(credentials: Record<string, any>): Promise<string> {
    try {
      const credentialsString = JSON.stringify(credentials);
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(credentialsString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      console.error('❌ Failed to encrypt credentials:', error);
      throw new Error('Credential encryption failed');
    }
  }

  private async decryptCredentials(encryptedCredentials: string): Promise<Record<string, any>> {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('❌ Failed to decrypt credentials:', error);
      throw new Error('Credential decryption failed');
    }
  }

  private parseMemoryLimit(memoryStr: string): number {
    // Parse memory limit string (e.g., "512m", "1g") to bytes
    const match = memoryStr.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 512 * 1024 * 1024; // Default 512MB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }
}