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
    // Guard against undefined or null inputs
    if (input === undefined || input === null) {
      console.warn(`[MCPToolWrapper] Received undefined/null input for tool ${mcpTool.name}, using empty object`);
      return {};
    }
    
    // If input is already correctly formatted, return as-is
    if (typeof input === 'object' && !input.hasOwnProperty('input')) {
      return input;
    }
    
    // Handle common single-parameter tools
    const properties = mcpTool.inputSchema?.properties || {};
    const propertyNames = Object.keys(properties);
    const requiredParams = mcpTool.inputSchema?.required || [];
    
    // If input is a string and there's exactly one required parameter, map to it
    if (typeof input === 'string' && requiredParams.length === 1) {
      return { [requiredParams[0]]: input };
    }
    
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
          console.log(`[MCPToolWrapper] Raw input before mapping:`, typeof input, input);
          let processedInput = this.mapInputParameters(input, mcpTool);
          console.log(`[MCPToolWrapper] Processed input after mapInputParameters:`, processedInput);
          
          // Special handling for sequential thinking tool
          if (mcpTool.templateSlug === 'sequentialthinking') {
            // Handle undefined or empty input for continuation requests
            if (!processedInput || Object.keys(processedInput).length === 0 || 
                (processedInput.input === undefined && !processedInput.thought)) {
              processedInput = {
                thought: `I need to continue my analysis. Let me build upon my previous thoughts and provide additional insights.`,
                nextThoughtNeeded: true,
                thoughtNumber: 2,
                totalThoughts: 5
              };
              console.log(`[MCPToolWrapper] Generated continuation input for sequential thinking:`, JSON.stringify(processedInput, null, 2));
            }
            // If the LLM sends a simple format, transform it
            else if (typeof processedInput === 'string' || (processedInput && typeof processedInput.input === 'string' && !processedInput.thought)) {
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
          
          if (this.config.enableLogging || mcpTool.templateSlug === 'searxng') {
            console.log(`[MCPToolWrapper] Tool ${mcpTool.name} - Input schema:`, JSON.stringify(mcpTool.inputSchema, null, 2));
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
            return `Input validation failed: ${(error as z.ZodError).errors.map((e: any) => e.message).join(', ')}`;
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
    // QUICK FIX: Truncate tool descriptions to avoid token limit issues
    const MAX_DESCRIPTION_LENGTH = 200;
    
    // Get the base description and truncate if needed
    let baseDescription = tool.description || '';
    if (baseDescription.length > MAX_DESCRIPTION_LENGTH) {
      baseDescription = baseDescription.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }
    
    // Only add minimal metadata
    const provider = ` [${tool.templateSlug}]`;
    
    // For critical tools, add very brief parameter info
    if (tool.inputSchema?.required && tool.inputSchema.required.length > 0) {
      const requiredParams = tool.inputSchema.required.slice(0, 3).join(', ');
      return `${baseDescription} Required: ${requiredParams}${provider}`;
    }
    
    return `${baseDescription}${provider}`;
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
      'web': 120000,         // 2 minutes for web operations (web scraping needs more time)
      'memory': 5000,        // 5 seconds for memory operations
      'data': 60000,         // 1 minute for data operations
      'other': 60000         // Default 1 minute
    };
    
    return timeouts[category] || 60000;
  }
}