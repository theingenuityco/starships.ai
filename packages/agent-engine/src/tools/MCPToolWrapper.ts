/**
 * MCPToolWrapper - Wraps MCP tools for use with LangChain agents
 * 
 * This wrapper converts MCP tools from the gateway into LangChain-compatible
 * DynamicTool instances that agents can use seamlessly.
 */

import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPToolGateway, MCPToolGatewayDB, MCPTool } from '@starships/core';

export interface MCPToolConfig {
  starshipId: string;
  agentId: string;
  gateway: MCPToolGateway | MCPToolGatewayDB;
  enableLogging?: boolean;
}

export class MCPToolWrapper {
  private config: MCPToolConfig;
  private toolUsageStats: Map<string, number> = new Map();

  constructor(config: MCPToolConfig) {
    this.config = config;
  }

  /**
   * Create a LangChain-compatible tool from an MCP tool
   */
  createLangChainTool(mcpTool: MCPTool): DynamicTool {
    // Create namespaced tool name (replace dots with underscores for LangChain compatibility)
    const namespacedName = `${mcpTool.templateSlug}_${mcpTool.name}`.replace(/\./g, '_');
    
    // Convert JSON Schema to Zod schema for validation
    const schema = this.jsonSchemaToZod(mcpTool.inputSchema);
    
    return new DynamicTool({
      name: namespacedName,
      description: this.enhanceDescription(mcpTool),
      func: async (input: any) => {
        const startTime = Date.now();
        
        try {
          // Log tool usage if enabled
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Agent ${this.config.agentId} calling ${mcpTool.name} with:`, input);
          }

          // Track usage statistics
          this.trackUsage(namespacedName);
          
          // Validate input
          const validatedInput = schema.parse(input);
          
          // Execute the tool via gateway
          const result = await this.config.gateway.invokeTool(
            this.config.starshipId,
            mcpTool.name,
            validatedInput
          );
          
          // Handle execution results
          if (!result.success) {
            const errorMsg = `Tool execution failed: ${result.error}`;
            console.error(`[MCPToolWrapper] ${errorMsg}`);
            return errorMsg;
          }
          
          // Log execution time
          const executionTime = Date.now() - startTime;
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Tool ${mcpTool.name} completed in ${executionTime}ms`);
          }
          
          // Format and return the result
          return this.formatToolResponse(result.result, mcpTool);
          
        } catch (error) {
          console.error(`[MCPToolWrapper] Error in ${mcpTool.name}:`, error);
          
          if (error instanceof z.ZodError) {
            return `Input validation failed: ${error.errors.map((e: any) => e.message).join(', ')}`;
          }
          
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });
  }

  /**
   * Create all LangChain tools for a starship
   */
  async createAllTools(): Promise<DynamicTool[]> {
    try {
      // Get all available MCP tools
      const mcpTools = await this.config.gateway.getToolsForStarship(this.config.starshipId);
      
      if (this.config.enableLogging) {
        console.log(`[MCPToolWrapper] Creating ${mcpTools.length} tools for agent ${this.config.agentId}`);
      }
      
      // Convert each MCP tool to a LangChain tool
      const langchainTools: DynamicTool[] = [];
      
      for (const mcpTool of mcpTools) {
        try {
          const langchainTool = this.createLangChainTool(mcpTool);
          langchainTools.push(langchainTool);
        } catch (error) {
          console.error(`[MCPToolWrapper] Failed to wrap tool ${mcpTool.name}:`, error);
          // Continue with other tools
        }
      }
      
      if (this.config.enableLogging) {
        const toolNames = langchainTools.map(t => t.name).join(', ');
        console.log(`[MCPToolWrapper] Created tools: ${toolNames}`);
      }
      
      return langchainTools;
      
    } catch (error) {
      console.error('[MCPToolWrapper] Failed to create tools:', error);
      return []; // Return empty array to allow agent to continue without MCP tools
    }
  }

  /**
   * Enhance tool description with usage hints and metadata
   */
  private enhanceDescription(tool: MCPTool): string {
    const categoryHints: Record<string, string> = {
      'sequentialthinking': '\nUse for: Complex reasoning, breaking down problems, systematic analysis',
      'memory': '\nUse for: Storing/retrieving context, maintaining state across conversations',
      'puppeteer': '\nUse for: Web automation, screenshots, data extraction from websites',
      'filesystem': '\nUse for: Reading/writing files, directory operations',
      'postgres': '\nUse for: Database queries, data persistence',
      'github': '\nUse for: GitHub API operations, repository management'
    };
    
    const hint = categoryHints[tool.templateSlug] || '';
    const provider = `\nProvider: ${tool.templateSlug}`;
    
    return `${tool.description}${hint}${provider}`;
  }

  /**
   * Convert JSON Schema to Zod schema
   * This is a simplified implementation - production should handle all JSON Schema features
   */
  private jsonSchemaToZod(jsonSchema: any): z.ZodSchema {
    // Default to accepting any input if no schema provided
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return z.any();
    }

    // Handle different schema types
    if (jsonSchema.type === 'object' && jsonSchema.properties) {
      const shape: Record<string, any> = {};
      const required = jsonSchema.required || [];

      for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
        const prop = propSchema as any;
        let zodType: any;

        // Map JSON Schema types to Zod types
        switch (prop.type) {
          case 'string':
            zodType = z.string();
            if (prop.minLength) zodType = zodType.min(prop.minLength);
            if (prop.maxLength) zodType = zodType.max(prop.maxLength);
            if (prop.pattern) zodType = zodType.regex(new RegExp(prop.pattern));
            if (prop.enum) zodType = z.enum(prop.enum);
            break;
            
          case 'number':
          case 'integer':
            zodType = prop.type === 'integer' ? z.number().int() : z.number();
            if (prop.minimum !== undefined) zodType = zodType.min(prop.minimum);
            if (prop.maximum !== undefined) zodType = zodType.max(prop.maximum);
            break;
            
          case 'boolean':
            zodType = z.boolean();
            break;
            
          case 'array':
            const itemSchema = prop.items ? this.jsonSchemaToZod(prop.items) : z.any();
            zodType = z.array(itemSchema);
            if (prop.minItems) zodType = zodType.min(prop.minItems);
            if (prop.maxItems) zodType = zodType.max(prop.maxItems);
            break;
            
          case 'object':
            zodType = this.jsonSchemaToZod(prop);
            break;
            
          default:
            zodType = z.any();
        }

        // Add description if available
        if (prop.description) {
          zodType = zodType.describe(prop.description);
        }

        // Make optional if not required
        if (!required.includes(key)) {
          zodType = zodType.optional();
        }

        shape[key] = zodType;
      }

      return z.object(shape);
    }

    // Handle primitive types
    switch (jsonSchema.type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(z.any());
      default:
        return z.any();
    }
  }

  /**
   * Format tool response for agent consumption
   */
  private formatToolResponse(result: any, tool: MCPTool): string {
    // Special formatting for known tool types
    if (tool.templateSlug === 'sequentialthinking') {
      // Sequential thinking returns structured reasoning
      if (result && typeof result === 'object') {
        if (result.thought) return result.thought;
        if (result.text) return result.text;
        if (result.reasoning) return result.reasoning;
      }
    }
    
    if (tool.templateSlug === 'memory') {
      // Memory operations return confirmation or retrieved data
      if (result && typeof result === 'object') {
        if (result.stored) return `Stored successfully with key: ${result.key}`;
        if (result.retrieved) return result.value || 'No data found';
      }
    }
    
    // Default formatting
    if (typeof result === 'string') {
      return result;
    }
    
    if (result === null || result === undefined) {
      return 'Operation completed successfully';
    }
    
    // Pretty print objects and arrays
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }

  /**
   * Track tool usage for analytics
   */
  private trackUsage(toolName: string): void {
    const currentCount = this.toolUsageStats.get(toolName) || 0;
    this.toolUsageStats.set(toolName, currentCount + 1);
  }

  /**
   * Get tool usage statistics
   */
  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [tool, count] of this.toolUsageStats.entries()) {
      stats[tool] = count;
    }
    return stats;
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.toolUsageStats.clear();
  }

  /**
   * Get recommended timeout for different tool categories
   */
  static getRecommendedTimeout(category: string): number {
    const timeouts: Record<string, number> = {
      'reasoning': 120000,    // 2 minutes for complex thinking
      'web': 60000,          // 1 minute for web operations
      'memory': 5000,        // 5 seconds for memory operations
      'data': 30000,         // 30 seconds for data operations
      'other': 30000         // Default 30 seconds
    };
    
    return timeouts[category] || 30000;
  }
}