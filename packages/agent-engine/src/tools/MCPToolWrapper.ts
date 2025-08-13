/**
 * MCPToolWrapper - Wraps MCP tools for use with LangChain agents
 * 
 * This wrapper converts MCP tools from the gateway into LangChain-compatible
 * DynamicTool instances that agents can use seamlessly.
 */

import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPToolGateway, MCPToolGatewayDB, MCPTool } from '@starships/core';
import { ToolInputPatcher } from '../agents/ToolInputPatcher';

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
    
    // Handle case where agent passes JSON as a string
    if (typeof input === 'string' && (input.startsWith('{') || input.startsWith('['))) {
      try {
        input = JSON.parse(input);
        console.log(`[MCPToolWrapper] Parsed JSON string input to object:`, input);
      } catch (e) {
        console.log(`[MCPToolWrapper] Failed to parse JSON string, treating as regular string`);
      }
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
    if (input.input !== undefined) {
      // For Notion search, allow empty query to search all pages
      if (mcpTool.name.includes('search') && input.input === '') {
        console.log(`[MCPToolWrapper] Returning empty object for search with empty query`);
        // Return empty object for search with no query (searches all)
        return {};
      }
      
      // If there are no properties but we have input.input, still return empty object
      if (propertyNames.length === 0) {
        return {};
      }
      
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
    
    // Store the tool reference for the closure
    const toolRef = mcpTool;
    const gatewayRef = this.config.gateway;
    const starshipIdRef = this.config.starshipId;
    
    // Store references we need in the closure
    const configRef = this.config;
    const mapInputParametersFunc = this.mapInputParameters.bind(this);
    const formatToolResponseFunc = this.formatToolResponse.bind(this);
    const trackUsageFunc = this.trackUsage.bind(this);
    
    // Create the tool function with proper binding
    const toolFunc = async function(...args: any[]) {
        const startTime = Date.now();
        
        console.log(`[MCPToolWrapper] *** TOOL EXECUTION START: ${namespacedName} ***`);
        
        // Extract input from various possible locations
        let input = args[0];
        let runManager = args[1];
        
        console.log(`[MCPToolWrapper] Initial args:`, {
            argsLength: args.length,
            arg0Type: typeof args[0],
            arg0Keys: args[0] ? Object.keys(args[0]).slice(0, 5) : null,
            hasRunManager: !!runManager
        });
        
        // Check if first argument is actually the tool metadata (happens with DynamicTool)
        if (input && typeof input === 'object' && input.id && input.name === toolRef.name) {
            console.log(`[MCPToolWrapper] First arg is tool metadata, looking for actual input`);
            input = undefined;
        }
        
        // WORKAROUND: Check if input is actually the runManager
        if (input && typeof input === 'object' && input.handleToolStart) {
            console.log(`[MCPToolWrapper] Detected runManager as first argument`);
            runManager = input;
            input = undefined;
        }
        
        // If input is still undefined, try to extract from global state
        if (!input || (typeof input === 'object' && Object.keys(input).length === 0)) {
            console.log(`[MCPToolWrapper] Input is invalid/empty, attempting recovery from global store`);
            
            // Try to get from global store
            const globalStore = (global as any).__mcpToolInputs || {};
            if (globalStore[namespacedName]) {
                input = globalStore[namespacedName];
                console.log(`[MCPToolWrapper] Retrieved input from global store:`, JSON.stringify(input));
                // Clear it after use
                delete globalStore[namespacedName];
            } else {
                console.log(`[MCPToolWrapper] No input found in global store for ${namespacedName}`);
                console.log(`[MCPToolWrapper] Available keys in global store:`, Object.keys(globalStore));
            }
        }
        
        try {
          // Log tool usage if enabled
          if (configRef.enableLogging) {
            console.log(`[MCPToolWrapper] Agent ${configRef.agentId} calling ${toolRef.name} with:`, input);
          }

          // Track usage statistics
          trackUsageFunc(namespacedName);
          
          // Log input for sequential thinking debugging
          if (mcpTool.templateSlug === 'sequentialthinking') {
            console.log(`[MCPToolWrapper] Sequential thinking input:`, JSON.stringify(input, null, 2));
            console.log(`[MCPToolWrapper] Sequential thinking schema:`, JSON.stringify(mcpTool.inputSchema, null, 2));
          }
          
          // Map input parameters if needed
          console.log(`[MCPToolWrapper] Raw input before mapping:`, typeof input, JSON.stringify(input));
          let processedInput = mapInputParametersFunc(input, toolRef);
          console.log(`[MCPToolWrapper] Processed input after mapInputParameters:`, JSON.stringify(processedInput));
          
          // Special handling for Notion API tools
          if (toolRef.name === 'API-create-a-comment' && processedInput && typeof processedInput === 'object') {
            // Fix the parent structure for comments - it should have page_id, not block_id
            if (processedInput.parent && processedInput.parent.block_id) {
              processedInput.parent = {
                page_id: processedInput.parent.block_id
              };
            }
          }
          
          // Special handling for Notion API-patch-block-children tool
          if (toolRef.name === 'API-patch-block-children' && processedInput && typeof processedInput === 'object') {
            // Fix the structure for block children updates
            if (processedInput.children && Array.isArray(processedInput.children)) {
              processedInput.children = processedInput.children.map((child: any) => {
                // If the child has wrong structure, fix it
                if (child.object === 'block' && child.type === 'paragraph' && child.paragraph) {
                  return {
                    type: 'paragraph',
                    paragraph: {
                      rich_text: child.paragraph.text || child.paragraph.rich_text
                    }
                  };
                }
                return child;
              });
            }
          }
          
          // Special handling for sequential thinking tool
          if (toolRef.templateSlug === 'sequentialthinking') {
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
          
          if (configRef.enableLogging || toolRef.templateSlug === 'searxng') {
            console.log(`[MCPToolWrapper] Tool ${toolRef.name} - Input schema:`, JSON.stringify(toolRef.inputSchema, null, 2));
            console.log(`[MCPToolWrapper] Processed input after mapping:`, processedInput);
          }
          
          // Validate input
          const validatedInput = schema.parse(processedInput);
          
          // Execute the tool via gateway
          // Tool ID must be in format "connectorId:toolName"
          const fullToolId = `${toolRef.connectorId}:${toolRef.name}`;
          const result = await configRef.gateway.invokeTool(
            configRef.starshipId,
            fullToolId,
            validatedInput
          );
          
          // Log the full result for debugging
          if (configRef.enableLogging) {
            console.log(`[MCPToolWrapper] Tool invocation result:`, JSON.stringify(result, null, 2));
          }
          
          // Log execution time
          const executionTime = Date.now() - startTime;
          if (configRef.enableLogging) {
            console.log(`[MCPToolWrapper] Tool ${toolRef.name} completed in ${executionTime}ms`);
          }
          
          // Format and return the result
          // Note: invokeTool returns the result directly, not wrapped in a success/error object
          const formattedResponse = formatToolResponseFunc(result, toolRef);
          console.log(`[MCPToolWrapper] *** TOOL EXECUTION END: ${namespacedName} - Response: ${formattedResponse.substring(0, 200)}... ***`);
          return formattedResponse;
          
        } catch (error) {
          console.error(`[MCPToolWrapper] *** TOOL EXECUTION ERROR: ${namespacedName} ***`);
          console.error(`[MCPToolWrapper] Error in ${toolRef.name}:`, error);
          
          if (error instanceof z.ZodError) {
            return `Input validation failed: ${(error as z.ZodError).errors.map((e: any) => e.message).join(', ')}`;
          }
          
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      };
    
    // Wrap the tool function to store parameters in global state
    const wrappedFunc = async function(this: any, ...args: any[]) {
      const input = args[0];
      console.log(`[MCPToolWrapper] Storing input for ${namespacedName} in global state:`, JSON.stringify(input));
      
      // Store the input in global state before calling the actual function
      if (!(global as any).__mcpToolInputs) {
        (global as any).__mcpToolInputs = {};
      }
      (global as any).__mcpToolInputs[namespacedName] = input;
      
      // Call the original tool function
      return toolFunc.apply(this, args);
    };
    
    // Create the DynamicTool with our wrapped function
    const tool = new DynamicTool({
      name: namespacedName,
      description: this.enhanceDescription(mcpTool),
      func: wrappedFunc
    });
    
    // Store the MCP tool reference for debugging
    (tool as any).__mcpTool = mcpTool;
    
    return tool;
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