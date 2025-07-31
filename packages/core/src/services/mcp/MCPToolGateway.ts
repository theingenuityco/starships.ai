import { Neo4jConnection, getConnection } from '@starships/models';
import { MCPServiceEndpoint, serviceRegistry } from './ServiceRegistry';
import { ToolDiscoveryCache, MCPTool, MCPResource } from './ToolDiscoveryCache';
import { MCPNetworkClient } from './MCPNetworkClient';

/**
 * MCPToolGateway - Gateway service for agents to access MCP server tools
 * 
 * This service provides the interface between LangChain agents and MCP servers,
 * handling tool discovery, invocation, and result transformation.
 */

export interface ToolInvocationResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export class MCPToolGateway {
  private connection: Neo4jConnection | null = null;
  private toolCache: ToolDiscoveryCache;
  private networkClient: MCPNetworkClient;

  constructor() {
    console.log('[MCPToolGateway] Initializing MCP Tool Gateway');
    this.toolCache = new ToolDiscoveryCache(5 * 60 * 1000); // 5 minute TTL
    this.networkClient = new MCPNetworkClient();
  }

  /**
   * Get available tools for a starship
   */
  async getToolsForStarship(starshipId: string): Promise<MCPTool[]> {
    try {
      // Check cache first
      const cached = this.toolCache.get(starshipId);
      if (cached) {
        console.log(`[MCPToolGateway] Returning cached tools for starship ${starshipId}`);
        return cached;
      }

      // Get services from registry
      const services = serviceRegistry.getStarshipServices(starshipId);
      const allTools: MCPTool[] = [];

      // Fetch tools from each service
      for (const service of services) {
        if (service.status === 'healthy' && service.availableTools) {
          const tools = await this.fetchToolsFromService(service);
          allTools.push(...tools);
        }
      }

      // Update cache
      this.toolCache.set(starshipId, allTools);

      console.log(`[MCPToolGateway] Found ${allTools.length} tools for starship ${starshipId}`);
      return allTools;
    } catch (error) {
      console.error('[MCPToolGateway] Error getting tools for starship:', error);
      throw error;
    }
  }

  /**
   * Get available resources for a starship
   */
  async getResourcesForStarship(starshipId: string): Promise<MCPResource[]> {
    try {
      // Check cache first
      const cached = this.toolCache.getResources(starshipId);
      if (cached) {
        console.log(`[MCPToolGateway] Returning cached resources for starship ${starshipId}`);
        return cached;
      }

      // Get services from registry
      const services = serviceRegistry.getStarshipServices(starshipId);
      const allResources: MCPResource[] = [];

      // Fetch resources from each service
      for (const service of services) {
        if (service.status === 'healthy' && service.availableResources) {
          const resources = await this.fetchResourcesFromService(service);
          allResources.push(...resources);
        }
      }

      // Update cache
      this.toolCache.setResources(starshipId, allResources);

      console.log(`[MCPToolGateway] Found ${allResources.length} resources for starship ${starshipId}`);
      return allResources;
    } catch (error) {
      console.error('[MCPToolGateway] Error getting resources for starship:', error);
      throw error;
    }
  }

  /**
   * Invoke a tool on an MCP server
   */
  async invokeTool(
    starshipId: string, 
    toolName: string, 
    params: any
  ): Promise<ToolInvocationResult> {
    const startTime = Date.now();
    
    try {
      // Get tools to find the correct connector
      const tools = await this.getToolsForStarship(starshipId);
      const tool = tools.find(t => t.name === toolName);

      if (!tool) {
        throw new Error(`Tool ${toolName} not found for starship ${starshipId}`);
      }

      // Get service endpoint
      const service = serviceRegistry.getService(starshipId, tool.connectorId);
      if (!service) {
        throw new Error(`Service not found for connector ${tool.connectorId}`);
      }

      if (service.status !== 'healthy') {
        throw new Error(`Service ${service.templateSlug} is not healthy`);
      }

      // Call the tool via network client
      const result = await this.networkClient.executeTool(
        service,
        toolName,
        params,
        { timeout: 30000 }
      );

      if (result.error) {
        throw new Error(result.error);
      }
      const executionTime = Date.now() - startTime;

      console.log(`[MCPToolGateway] Tool ${toolName} executed successfully in ${executionTime}ms`);

      return {
        success: true,
        result: result.result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[MCPToolGateway] Tool invocation failed for ${toolName}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      };
    }
  }

  /**
   * Get namespaced tool names to avoid conflicts
   * This returns tool names formatted for use by agents
   */
  async getNamespacedTools(starshipId: string): Promise<Array<{
    name: string;
    originalName: string;
    description: string;
    inputSchema: any;
    provider: string;
  }>> {
    const mcpTools = await this.getToolsForStarship(starshipId);
    
    return mcpTools.map(tool => ({
      name: `${tool.templateSlug}_${tool.name}`,
      originalName: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      provider: tool.templateSlug
    }));
  }

  /**
   * Fetch tools from a specific MCP service
   */
  private async fetchToolsFromService(service: MCPServiceEndpoint): Promise<MCPTool[]> {
    try {
      const toolsData = await this.networkClient.fetchTools(service);
      const tools: MCPTool[] = [];

      for (const tool of toolsData) {
        tools.push({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {},
          connectorId: service.connectorId,
          templateSlug: service.templateSlug
        });
      }

      return tools;
    } catch (error) {
      console.error(`[MCPToolGateway] Error fetching tools from ${service.templateSlug}:`, error);
      return [];
    }
  }

  /**
   * Fetch resources from a specific MCP service
   */
  private async fetchResourcesFromService(service: MCPServiceEndpoint): Promise<MCPResource[]> {
    try {
      const resourcesData = await this.networkClient.fetchResources(service);
      const resources: MCPResource[] = [];

      for (const resource of resourcesData) {
        resources.push({
          name: resource.name,
          description: resource.description || '',
          uri: resource.uri,
          mimeType: resource.mimeType,
          connectorId: service.connectorId,
          templateSlug: service.templateSlug
        });
      }

      return resources;
    } catch (error) {
      console.error(`[MCPToolGateway] Error fetching resources from ${service.templateSlug}:`, error);
      return [];
    }
  }


  /**
   * Check for tool name conflicts
   */
  async checkForToolNameConflicts(starshipId: string): Promise<Map<string, string[]>> {
    const tools = await this.getToolsForStarship(starshipId);
    const conflicts = new Map<string, string[]>();

    // Group tools by name
    const toolsByName = new Map<string, MCPTool[]>();
    for (const tool of tools) {
      const existing = toolsByName.get(tool.name) || [];
      existing.push(tool);
      toolsByName.set(tool.name, existing);
    }

    // Find conflicts
    for (const [name, toolList] of toolsByName.entries()) {
      if (toolList.length > 1) {
        conflicts.set(name, toolList.map(t => t.templateSlug));
      }
    }

    return conflicts;
  }

  /**
   * Get tool usage statistics
   */
  async getToolUsageStats(starshipId: string): Promise<any> {
    const tools = await this.getToolsForStarship(starshipId);
    const resources = await this.getResourcesForStarship(starshipId);
    const services = serviceRegistry.getStarshipServices(starshipId);

    return {
      totalTools: tools.length,
      totalResources: resources.length,
      activeServices: services.filter(s => s.status === 'healthy').length,
      toolsByService: tools.reduce((acc, tool) => {
        acc[tool.templateSlug] = (acc[tool.templateSlug] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      resourcesByService: resources.reduce((acc, resource) => {
        acc[resource.templateSlug] = (acc[resource.templateSlug] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.toolCache.clear();
    console.log('[MCPToolGateway] Caches cleared');
  }
}

// Export singleton instance
export const mcpToolGateway = new MCPToolGateway();