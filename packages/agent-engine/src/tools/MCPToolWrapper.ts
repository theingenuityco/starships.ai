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
   * Map input parameters intelligently when LLM sends generic format
   */
  private mapInputParameters(input: any, mcpTool: MCPTool): any {
    // If input is already correctly formatted, return as-is
    if (typeof input === 'object' && !input.hasOwnProperty('input')) {
      return input;
    }
    
    // Handle common single-parameter tools
    const properties = mcpTool.inputSchema?.properties || {};
    const propertyNames = Object.keys(properties);
    
    // Single parameter tool with generic input
    if (propertyNames.length === 1 && (typeof input === 'string' || input.input !== undefined)) {
      const paramName = propertyNames[0];
      const value = typeof input === 'string' ? input : input.input;
      return { [paramName]: value };
    }
    
    // Try to map 'input' to the most likely parameter
    if (input.input !== undefined && propertyNames.length > 0) {
      // Common parameter name mappings
      const mappings: Record<string, string[]> = {
        'url': ['url', 'uri', 'link', 'href', 'website', 'address'],
        'text': ['text', 'content', 'message', 'query', 'prompt', 'input'],
        'selector': ['selector', 'element', 'target', 'locator'],
        'thought': ['thought', 'reasoning', 'analysis'],
        'key': ['key', 'name', 'identifier'],
        'value': ['value', 'data', 'content']
      };
      
      // Find best match
      for (const [_, aliases] of Object.entries(mappings)) {
        const matchedParam = propertyNames.find(name => 
          aliases.includes(name.toLowerCase())
        );
        if (matchedParam) {
          return { [matchedParam]: input.input };
        }
      }
      
      // If no match found but there's only one required parameter, use it
      const requiredParams = mcpTool.inputSchema?.required || [];
      if (requiredParams.length === 1) {
        return { [requiredParams[0]]: input.input };
      }
    }
    
    // Return original if no mapping found
    return input;
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
        
        console.log(`[MCPToolWrapper] *** TOOL EXECUTION START: ${namespacedName} ***`);
        
        try {
          // Log tool usage if enabled
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Agent ${this.config.agentId} calling ${mcpTool.name} with:`, input);
          }

          // Track usage statistics
          this.trackUsage(namespacedName);
          
          // Log input for sequential thinking debugging
          if (mcpTool.templateSlug === 'sequentialthinking') {
            console.log(`[MCPToolWrapper] Sequential thinking input:`, JSON.stringify(input, null, 2));
            console.log(`[MCPToolWrapper] Sequential thinking schema:`, JSON.stringify(mcpTool.inputSchema, null, 2));
          }
          
          // Map input parameters if needed
          let processedInput = this.mapInputParameters(input, mcpTool);
          
          // Special handling for sequential thinking tool
          if (mcpTool.templateSlug === 'sequentialthinking') {
            // If the LLM sends a simple format, transform it
            if (typeof processedInput === 'string' || (processedInput && typeof processedInput.input === 'string' && !processedInput.thought)) {
              const query = typeof processedInput === 'string' ? processedInput : processedInput.input;
              processedInput = {
                thought: `I need to analyze this request: "${query}". Let me break this down systematically to provide a comprehensive response.`,
                nextThoughtNeeded: true,
                thoughtNumber: 1,
                totalThoughts: 5
              };
              console.log(`[MCPToolWrapper] Transformed simple input to sequential thinking format:`, JSON.stringify(processedInput, null, 2));
            }
          }
          
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Processed input after mapping:`, processedInput);
          }
          
          // Validate input
          const validatedInput = schema.parse(processedInput);
          
          // Execute the tool via gateway
          // Tool ID must be in format "connectorId:toolName"
          const fullToolId = `${mcpTool.connectorId}:${mcpTool.name}`;
          const result = await this.config.gateway.invokeTool(
            this.config.starshipId,
            fullToolId,
            validatedInput
          );
          
          // Log the full result for debugging
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Tool invocation result:`, JSON.stringify(result, null, 2));
          }
          
          // Log execution time
          const executionTime = Date.now() - startTime;
          if (this.config.enableLogging) {
            console.log(`[MCPToolWrapper] Tool ${mcpTool.name} completed in ${executionTime}ms`);
          }
          
          // Format and return the result
          // Note: invokeTool returns the result directly, not wrapped in a success/error object
          const formattedResponse = this.formatToolResponse(result, mcpTool);
          console.log(`[MCPToolWrapper] *** TOOL EXECUTION END: ${namespacedName} - Response: ${formattedResponse.substring(0, 200)}... ***`);
          return formattedResponse;
          
        } catch (error) {
          console.error(`[MCPToolWrapper] *** TOOL EXECUTION ERROR: ${namespacedName} ***`);
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
      'playwright': '\nUse for: Web browser automation, navigation, and interaction',
      'filesystem': '\nUse for: Reading/writing files, directory operations',
      'postgres': '\nUse for: Database queries, data persistence',
      'github': '\nUse for: GitHub API operations, repository management'
    };
    
    const hint = categoryHints[tool.templateSlug] || '';
    const provider = `\nProvider: ${tool.templateSlug}`;
    
    // Add parameter hints based on tool schema
    let parameterHints = '';
    if (tool.inputSchema?.properties) {
      const properties = tool.inputSchema.properties;
      const required = tool.inputSchema.required || [];
      
      const params = Object.entries(properties).map(([name, schema]: [string, any]) => {
        const isRequired = required.includes(name) ? ' (required)' : ' (optional)';
        const description = schema.description || schema.type || 'any';
        return `- ${name}: ${description}${isRequired}`;
      }).join('\n');
      
      if (params) {
        parameterHints = `\n\nParameters:\n${params}`;
        
        // Add specific examples for common tools
        if (tool.name === 'browser_navigate' || tool.name === 'navigate') {
          parameterHints += '\n\nExample usage: url="https://example.com"';
        } else if (tool.templateSlug === 'sequentialthinking') {
          parameterHints += '\n\nExample usage: thought="First, I need to understand...", nextThoughtNeeded=true, thoughtNumber=1, totalThoughts=5';
        } else if (tool.templateSlug === 'memory' && tool.name === 'store_memory') {
          parameterHints += '\n\nExample usage: key="user_preference", value="likes Python"';
        }
      }
    }
    
    return `${tool.description}${hint}${parameterHints}${provider}`;
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
    // Handle wrapped responses from MCP HTTP bridge
    if (Array.isArray(result) && result.length > 0 && result[0].type === 'text') {
      // Extract the text content and try to parse it
      const textContent = result[0].text;
      try {
        const parsedContent = JSON.parse(textContent);
        // For sequential thinking, format to encourage continuation
        if (tool.templateSlug === 'sequentialthinking') {
          const thought = parsedContent.thought || parsedContent.text || parsedContent.reasoning;
          const thoughtNum = parsedContent.thoughtNumber || 1;
          const totalThoughts = parsedContent.totalThoughts || 5;
          const needsMore = parsedContent.nextThoughtNeeded !== false;
          
          if (needsMore) {
            return `[Thought ${thoughtNum}/${totalThoughts}] ${thought}\n[Status: Continuing analysis...]`;
          } else {
            return `[Final Thought ${thoughtNum}/${totalThoughts}] ${thought}\n[Status: Analysis complete]`;
          }
        }
        return JSON.stringify(parsedContent, null, 2);
      } catch {
        return textContent;
      }
    }
    
    // Special formatting for known tool types
    if (tool.templateSlug === 'sequentialthinking') {
      // Sequential thinking returns structured reasoning
      if (result && typeof result === 'object') {
        const thought = result.thought || result.text || result.reasoning || '';
        const thoughtNum = result.thoughtNumber || 1;
        const totalThoughts = result.totalThoughts || 5;
        const needsMore = result.nextThoughtNeeded !== false;
        
        if (needsMore) {
          return `[Thought ${thoughtNum}/${totalThoughts}] ${thought}\n[Status: Continuing analysis...]`;
        } else {
          return `[Final Thought ${thoughtNum}/${totalThoughts}] ${thought}\n[Status: Analysis complete]`;
        }
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