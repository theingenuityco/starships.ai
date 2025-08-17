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
import { SmartParameterAdapter } from '../adapters/SmartParameterAdapter';
import { getConnection, RepositoryFactory } from '@starships/models';

// Helper function to validate UUID format
function isValidUUID(str: string | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export interface MCPToolConfig {
  starshipId: string;
  agentId: string;
  gateway: MCPToolGateway | MCPToolGatewayDB;
  enableLogging?: boolean;
}

export class MCPToolWrapper {
  private config: MCPToolConfig;
  private toolUsageStats: Map<string, number> = new Map();
  private smartAdapter: SmartParameterAdapter | null = null;

  constructor(config: MCPToolConfig) {
    this.config = config;
    
    // Initialize smart adapter if feature flag is enabled
    if (process.env.USE_SMART_ADAPTER === 'true') {
      this.initializeSmartAdapter();
    }
  }
  
  /**
   * Add native LangChain tools based on user's stored API keys
   */
  private async addNativeTools(langchainTools: DynamicTool[]): Promise<void> {
    try {
      // Get user's API keys from database
      const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();
      const apiKeys = await apiKeyRepo.getAllApiKeys(this.config.starshipId);
      
      // Add Tavily if API key exists
      if (apiKeys.tavily) {
        try {
          const { TavilySearchResults } = await import('@langchain/community/tools/tavily_search');
          
          const tavilyTool = new TavilySearchResults({
            apiKey: apiKeys.tavily,
            maxResults: 5
          });
          
          // Wrap in DynamicTool to match our interface
          const wrappedTavily = new DynamicTool({
            name: 'tavily_web_search',
            description: 'Search the web for current information using Tavily',
            func: async (input: string) => {
              console.log(`[Tavily] Starship ${this.config.starshipId} searching: ${input}`);
              const result = await tavilyTool.invoke(input);
              return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            }
          });
          
          langchainTools.push(wrappedTavily);
          console.log(`[MCPToolWrapper] Added Tavily search for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[MCPToolWrapper] Failed to add Tavily tool:', error);
        }
      }
      
      // Add Brave Search if API key exists
      if (apiKeys.brave) {
        try {
          const { BraveSearch } = await import('@langchain/community/tools/brave_search');
          
          const braveTool = new BraveSearch({
            apiKey: apiKeys.brave
          });
          
          const wrappedBrave = new DynamicTool({
            name: 'brave_web_search',
            description: 'Privacy-focused web search using Brave',
            func: async (input: string) => {
              console.log(`[Brave] Starship ${this.config.starshipId} searching: ${input}`);
              const result = await braveTool.invoke(input);
              return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            }
          });
          
          langchainTools.push(wrappedBrave);
          console.log(`[MCPToolWrapper] Added Brave search for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[MCPToolWrapper] Failed to add Brave tool:', error);
        }
      }
      
      // Add OpenWeatherMap if API key exists
      // TODO: OpenWeatherMap tool is not available in @langchain/community
      // Will need to implement custom integration or wait for library update
      /*
      if (apiKeys.openweather) {
        try {
          const { OpenWeatherMapQueryRun } = await import('@langchain/community/tools/openweathermap');
          
          const weatherTool = new OpenWeatherMapQueryRun({
            apiKey: apiKeys.openweather
          });
          
          const wrappedWeather = new DynamicTool({
            name: 'weather_query',
            description: 'Get current weather for any location',
            func: async (input: string) => {
              console.log(`[Weather] Starship ${this.config.starshipId} querying: ${input}`);
              const result = await weatherTool.invoke(input);
              return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            }
          });
          
          langchainTools.push(wrappedWeather);
          console.log(`[MCPToolWrapper] Added OpenWeatherMap for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[MCPToolWrapper] Failed to add OpenWeatherMap tool:', error);
        }
      }
      */
      
    } catch (error) {
      console.error('[MCPToolWrapper] Error loading native tools:', error);
      // Continue without native tools if there's an error
    }
  }
  
  private async initializeSmartAdapter() {
    try {
      const connection = await getConnection();
      this.smartAdapter = new SmartParameterAdapter(connection);
      console.log('[MCPToolWrapper] Smart Parameter Adapter initialized');
    } catch (error) {
      console.error('[MCPToolWrapper] Failed to initialize Smart Adapter:', error);
      // Fall back to legacy system
      this.smartAdapter = null;
    }
  }

  /**
   * Map input parameters intelligently when LLM sends generic format
   */
  private async mapInputParameters(input: any, mcpTool: MCPTool): Promise<any> {
    // Use smart adapter if available
    if (this.smartAdapter) {
      const startTime = Date.now();
      try {
        const result = await this.smartAdapter.adapt(input, mcpTool);
        console.log(`[MCPToolWrapper] Smart adaptation took ${Date.now() - startTime}ms`);
        return result;
      } catch (error) {
        console.error(`[MCPToolWrapper] Smart adapter failed, falling back to legacy:`, error);
        // Fall through to legacy method
      }
    }
    
    // Legacy method starts here
    return this.legacyMapInputParameters(input, mcpTool);
  }
  
  /**
   * Legacy parameter mapping method (to be deprecated)
   */
  private legacyMapInputParameters(input: any, mcpTool: MCPTool): any {
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
    
    // Special handling for Notion API-retrieve-a-page - extract UUID from URL
    if (mcpTool.name === 'API-retrieve-a-page') {
      // If agent sends a full Notion URL, extract the UUID
      if (typeof input === 'string' && input.includes('notion.so/')) {
        console.log(`[MCPToolWrapper] Extracting page ID from Notion URL: ${input}`);
        // Extract UUID from URL like: https://www.notion.so/Marketing-Plan-250aed16448d813ebc85e1accd8fde2e
        const matches = input.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        if (matches) {
          const pageId = matches[1];
          // Convert 32-char format to UUID format if needed
          if (pageId.length === 32) {
            const uuid = `${pageId.slice(0, 8)}-${pageId.slice(8, 12)}-${pageId.slice(12, 16)}-${pageId.slice(16, 20)}-${pageId.slice(20, 32)}`;
            console.log(`[MCPToolWrapper] Extracted and formatted page ID: ${uuid}`);
            return { page_id: uuid };
          } else {
            console.log(`[MCPToolWrapper] Extracted page ID: ${pageId}`);
            return { page_id: pageId };
          }
        }
      }
      // If agent sends {input: "url"} format
      if (input.input && typeof input.input === 'string' && input.input.includes('notion.so/')) {
        const url = input.input;
        console.log(`[MCPToolWrapper] Extracting page ID from Notion URL in input object: ${url}`);
        const matches = url.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        if (matches) {
          const pageId = matches[1];
          if (pageId.length === 32) {
            const uuid = `${pageId.slice(0, 8)}-${pageId.slice(8, 12)}-${pageId.slice(12, 16)}-${pageId.slice(16, 20)}-${pageId.slice(20, 32)}`;
            console.log(`[MCPToolWrapper] Extracted and formatted page ID: ${uuid}`);
            return { page_id: uuid };
          } else {
            console.log(`[MCPToolWrapper] Extracted page ID: ${pageId}`);
            return { page_id: pageId };
          }
        }
      }
    }
    
    // Special handling for Notion database query - CRITICAL FIX
    if (mcpTool.name === 'API-post-database-query') {
      // If agent sends just a string (likely a user ID mistaken for database ID)
      if (typeof input === 'string') {
        console.warn(`[MCPToolWrapper] WARNING: Agent sent string "${input}" to database-query. This looks like a user ID, not a database ID.`);
        // Check if it looks like a user ID (not a database ID)
        if (input.includes('-') && input.length === 36) {
          console.error(`[MCPToolWrapper] ERROR: "${input}" appears to be a user ID. Database query requires a database ID, not a user ID.`);
          // Return an error-inducing input to make the agent realize its mistake
          throw new Error(`Cannot query database with user ID. To list pages, use 'API-post-search' instead of 'API-post-database-query'. User IDs cannot be used as database IDs.`);
        }
        return { database_id: input };
      }
      // If agent sends {input: "id"} format
      if (input.input && typeof input.input === 'string') {
        const id = input.input;
        if (id.includes('-') && id.length === 36) {
          console.error(`[MCPToolWrapper] ERROR: "${id}" appears to be a user ID, not a database ID.`);
          throw new Error(`Cannot query database with user ID "${id}". To list pages, use 'API-post-search' with an empty query {} instead.`);
        }
        return { database_id: id };
      }
    }
    
    // Special handling for Notion search - ensure empty string becomes empty object
    if (mcpTool.name === 'API-post-search') {
      // Empty string should become empty object (searches all)
      if (input === '' || input === '""' || (typeof input === 'string' && input.trim() === '')) {
        console.log(`[MCPToolWrapper] Converting empty string to empty object for Notion search`);
        return {};
      }
      // If agent sends {input: ""} format
      if (input.input === '' || input.input === '""') {
        console.log(`[MCPToolWrapper] Converting {input: ""} to empty object for Notion search`);
        return {};
      }
      // If it's already an empty object, keep it
      if (typeof input === 'object' && Object.keys(input).length === 0) {
        return {};
      }
      // If there's an actual query string, map it properly
      if (typeof input === 'string' && input.trim() !== '') {
        return { query: input };
      }
      if (input.input && typeof input.input === 'string' && input.input.trim() !== '') {
        return { query: input.input };
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
        'value': ['value', 'data', 'content'],
        'database_id': ['database_id', 'db_id', 'database'],
        'page_id': ['page_id', 'parent_id', 'parent']
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
        
        // If input is undefined (not just empty object), try to extract from global state
        if (input === undefined || input === null) {
            console.log(`[MCPToolWrapper] Input is undefined/null, attempting recovery from global store`);
            
            // Try to get from global store
            const globalStore = (global as any).__mcpToolInputs || {};
            
            // Try exact match first
            if (globalStore[namespacedName]) {
                input = globalStore[namespacedName];
                console.log(`[MCPToolWrapper] Retrieved input from global store using exact key:`, JSON.stringify(input));
                // Don't delete yet - might need it for retries
            } else {
                // Try to find by tool name without namespace
                const toolBaseName = toolRef.name;
                if (globalStore[toolBaseName]) {
                    input = globalStore[toolBaseName];
                    console.log(`[MCPToolWrapper] Retrieved input from global store using base name ${toolBaseName}:`, JSON.stringify(input));
                } else {
                    // Try any key that contains our tool name
                    const possibleKeys = Object.keys(globalStore);
                    for (const key of possibleKeys) {
                        if (key.includes(toolRef.name) || namespacedName.includes(key)) {
                            input = globalStore[key];
                            console.log(`[MCPToolWrapper] Retrieved input from global store using partial match ${key}:`, JSON.stringify(input));
                            break;
                        }
                    }
                    
                    if (input === undefined || input === null) {
                        console.log(`[MCPToolWrapper] No input found in global store for ${namespacedName}`);
                        console.log(`[MCPToolWrapper] Available keys in global store:`, Object.keys(globalStore));
                    }
                }
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
          let processedInput = await mapInputParametersFunc(input, toolRef);
          console.log(`[MCPToolWrapper] Processed input after mapInputParameters:`, JSON.stringify(processedInput));
          
          // Special handling for Notion API tools
          if (toolRef.name === 'API-post-page' && processedInput && typeof processedInput === 'object') {
            console.log(`[MCPToolWrapper] Fixing Notion API-post-page structure`);
            
            // Fix the parent structure
            if (processedInput.parent) {
              // Check for any invalid parent structures
              const hasInvalidParent = 
                processedInput.parent.type === 'workspace' || 
                processedInput.parent.database_id === 'workspace' ||
                processedInput.parent.database_id === 'workspace_id' ||
                (processedInput.parent.type === 'database_id' && !isValidUUID(processedInput.parent.database_id)) ||
                (!processedInput.parent.page_id || !isValidUUID(processedInput.parent.page_id));
              
              if (hasInvalidParent) {
                console.log(`[MCPToolWrapper] Invalid parent structure detected for Notion page creation`);
                console.log(`[MCPToolWrapper] Parent structure received:`, JSON.stringify(processedInput.parent));
                
                // Return a helpful error message to guide the agent
                const errorMessage = `Cannot create Notion page: Invalid or missing parent page_id.

Current invalid parent: ${JSON.stringify(processedInput.parent)}

To fix this:
1. Use 'API-post-search' tool with empty object {} to list all pages
2. From results, find a page to use as parent (look for "id" field)
3. Create page with: parent: { page_id: "the-actual-page-id" }

IMPORTANT:
- DO NOT use 'API-get-users' to find pages (users are not pages)
- DO NOT use 'API-post-database-query' with user IDs
- Use 'API-post-search' to find pages
- The parent.page_id must be from an actual page, not a user`;
                
                throw new Error(errorMessage);
              }
            }
            
            // Fix the properties.title structure - it should be an array
            if (processedInput.properties && processedInput.properties.title) {
              // If title is in the wrong format (nested object with title array)
              if (processedInput.properties.title.title && Array.isArray(processedInput.properties.title.title)) {
                processedInput.properties.title = processedInput.properties.title.title.map((item: any) => ({
                  text: {
                    content: item.text?.content || "Untitled"
                  }
                }));
              }
              // Handle structure like: {"type": "title", "text": {"content": "Marketing Planning"}}
              else if (processedInput.properties.title.type === 'title' && processedInput.properties.title.text) {
                const content = processedInput.properties.title.text.content || "Untitled";
                processedInput.properties.title = [{
                  text: {
                    content: content
                  }
                }];
              }
              // If title is not an array, convert it
              else if (!Array.isArray(processedInput.properties.title)) {
                const titleContent = typeof processedInput.properties.title === 'string' 
                  ? processedInput.properties.title 
                  : "Untitled";
                processedInput.properties.title = [{
                  text: {
                    content: titleContent
                  }
                }];
              }
              // Ensure each item in the array has the correct structure
              else {
                processedInput.properties.title = processedInput.properties.title.map((item: any) => {
                  if (typeof item === 'string') {
                    return {
                      text: {
                        content: item
                      }
                    };
                  } else if (item.type === 'text' && item.text) {
                    // Already in correct format
                    return item;
                  } else if (item.text && item.text.content) {
                    // Has text.content but missing type
                    return {
                      text: item.text
                    };
                  }
                  return item;
                });
              }
            }
            
            console.log(`[MCPToolWrapper] Fixed Notion API-post-page input:`, JSON.stringify(processedInput, null, 2));
          }
          
          if (toolRef.name === 'API-create-a-comment' && processedInput && typeof processedInput === 'object') {
            // Fix the parent structure - convert string to object with page_id
            if (processedInput.parent && typeof processedInput.parent === 'string') {
              console.log(`[MCPToolWrapper] Fixing Notion comment parent structure from string to object`);
              processedInput.parent = {
                page_id: processedInput.parent
              };
            } else if (processedInput.parent && processedInput.parent.block_id) {
              // Also handle the case where it has block_id instead of page_id
              processedInput.parent = {
                page_id: processedInput.parent.block_id
              };
            }
            
            // Fix rich_text structure if needed
            if (processedInput.rich_text && Array.isArray(processedInput.rich_text)) {
              processedInput.rich_text = processedInput.rich_text.map((item: any) => {
                // If the item doesn't have the correct structure, fix it
                if (item.text && !item.type) {
                  return {
                    type: 'text',
                    text: item.text
                  };
                } else if (typeof item === 'string') {
                  return {
                    type: 'text',
                    text: {
                      content: item
                    }
                  };
                }
                return item;
              });
            }
          }
          
          // Special handling for Notion API-patch-block-children tool
          if (toolRef.name === 'API-patch-block-children' && processedInput && typeof processedInput === 'object') {
            console.log(`[MCPToolWrapper] Fixing API-patch-block-children structure`);
            
            // Fix the structure for block children updates
            if (processedInput.children && Array.isArray(processedInput.children)) {
              processedInput.children = processedInput.children.map((child: any) => {
                console.log(`[MCPToolWrapper] Processing child block:`, JSON.stringify(child));
                
                // Remove 'object' field if present (not needed)
                if (child.object) {
                  delete child.object;
                }
                
                // Fix paragraph structure
                if (child.type === 'paragraph' && child.paragraph) {
                  // If paragraph has 'text' instead of 'rich_text', fix it
                  if (child.paragraph.text && !child.paragraph.rich_text) {
                    // Handle array of text items
                    if (Array.isArray(child.paragraph.text)) {
                      child.paragraph.rich_text = child.paragraph.text.map((item: any) => {
                        // If item is already properly structured
                        if (item.text && item.text.content) {
                          return item;
                        }
                        // If item has content directly
                        if (item.content) {
                          return {
                            type: 'text',
                            text: {
                              content: item.content
                            }
                          };
                        }
                        // If item is a string
                        if (typeof item === 'string') {
                          return {
                            type: 'text',
                            text: {
                              content: item
                            }
                          };
                        }
                        return item;
                      });
                    }
                    // If text is a single string
                    else if (typeof child.paragraph.text === 'string') {
                      child.paragraph.rich_text = [{
                        type: 'text',
                        text: {
                          content: child.paragraph.text
                        }
                      }];
                    }
                    delete child.paragraph.text;
                  }
                  
                  // Ensure rich_text items have proper structure
                  if (child.paragraph.rich_text && Array.isArray(child.paragraph.rich_text)) {
                    child.paragraph.rich_text = child.paragraph.rich_text.map((item: any) => {
                      // If missing type field
                      if (!item.type && item.text) {
                        item.type = 'text';
                      }
                      return item;
                    });
                  }
                }
                
                // Fix bulleted_list_item structure similarly
                if (child.type === 'bulleted_list_item' && child.bulleted_list_item) {
                  if (child.bulleted_list_item.text && !child.bulleted_list_item.rich_text) {
                    if (Array.isArray(child.bulleted_list_item.text)) {
                      child.bulleted_list_item.rich_text = child.bulleted_list_item.text.map((item: any) => {
                        if (item.text && item.text.content) {
                          return item;
                        }
                        if (item.content) {
                          return {
                            type: 'text',
                            text: {
                              content: item.content
                            }
                          };
                        }
                        if (typeof item === 'string') {
                          return {
                            type: 'text',
                            text: {
                              content: item
                            }
                          };
                        }
                        return item;
                      });
                    } else if (typeof child.bulleted_list_item.text === 'string') {
                      child.bulleted_list_item.rich_text = [{
                        type: 'text',
                        text: {
                          content: child.bulleted_list_item.text
                        }
                      }];
                    }
                    delete child.bulleted_list_item.text;
                  }
                }
                
                return child;
              });
              
              console.log(`[MCPToolWrapper] Fixed children structure:`, JSON.stringify(processedInput.children, null, 2));
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
    
    // Wrap the tool function to intercept and fix parameter passing
    // DynamicTool.call() passes (input, runManager, parentConfig)
    // But sometimes the input gets lost or is undefined
    const wrappedFunc = async function(inputArg: any, runManager?: any, parentConfig?: any) {
      console.log(`[MCPToolWrapper-Wrapper] ${namespacedName} called with:`, {
        inputArgType: typeof inputArg,
        inputArgValue: JSON.stringify(inputArg),
        hasRunManager: !!runManager,
        hasParentConfig: !!parentConfig
      });
      
      // If we got a valid input, store it in global state for recovery
      if (inputArg !== undefined && inputArg !== null) {
        if (!(global as any).__mcpToolInputs) {
          (global as any).__mcpToolInputs = {};
        }
        (global as any).__mcpToolInputs[namespacedName] = inputArg;
      }
      
      // Call the original tool function with all arguments
      // The toolFunc will handle recovery if input is undefined
      return toolFunc(inputArg, runManager, parentConfig);
    };
    
    // Create the DynamicTool with our wrapped function
    const tool = new DynamicTool({
      name: namespacedName,
      description: this.enhanceDescription(mcpTool),
      func: wrappedFunc
    });
    
    // Store the MCP tool reference and schema for debugging
    (tool as any).__mcpTool = mcpTool;
    (tool as any).__schema = schema;
    
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
      
      // Add native LangChain tools based on user's API keys
      await this.addNativeTools(langchainTools);
      
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
    
    // Add critical clarifications for commonly confused Notion tools
    if (tool.name === 'API-post-database-query') {
      baseDescription = 'Query a Notion DATABASE (not pages!). Requires database_id. TO LIST PAGES use API-post-search instead. ' + baseDescription;
    } else if (tool.name === 'API-get-users') {
      baseDescription = 'Get USERS only (not pages!). TO LIST PAGES use API-post-search with {}. ' + baseDescription;
    } else if (tool.name === 'API-post-search') {
      baseDescription = 'Search/list Notion pages and databases. USE {} to list all. Primary tool for finding pages. ' + baseDescription;
    } else if (tool.name === 'API-post-page') {
      baseDescription = 'Create page. First use API-post-search to find parent page, then use its ID. ' + baseDescription;
    }
    
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