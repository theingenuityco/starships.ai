import { RepositoryFactory } from '@starships/models';
import { MCPTool, MCPResource, ToolDiscoveryCache } from './ToolDiscoveryCache';
import { MCPNetworkClient } from './MCPNetworkClient';
import { MCPServiceEndpoint } from './ServiceRegistry';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * MCPToolGateway that fetches services from database instead of in-memory registry
 * This solves the cross-process issue where agent-engine can't see services registered in server
 */
export class MCPToolGatewayDB {
  private toolCache: ToolDiscoveryCache;
  private networkClient: MCPNetworkClient;

  constructor() {
    console.log('[MCPToolGatewayDB] Initializing database-backed MCP Tool Gateway');
    this.toolCache = new ToolDiscoveryCache(5 * 60 * 1000); // 5 minute TTL
    this.networkClient = new MCPNetworkClient();
  }

  /**
   * Get available tools for a starship by querying database
   */
  async getToolsForStarship(starshipId: string): Promise<MCPTool[]> {
    try {
      // Check cache first
      const cached = this.toolCache.get(starshipId);
      if (cached) {
        console.log(`[MCPToolGatewayDB] Returning cached tools for starship ${starshipId}`);
        return cached;
      }

      // Get active connectors from database with Docker info
      const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
      const connectors = await connectorRepo.findByStarshipWithDockerInfo(starshipId);
      
      // Also need to fetch template info
      const serverOptionRepo = RepositoryFactory.getMCPServerOptionRepository();
      
      console.log(`[MCPToolGatewayDB] Found ${connectors.length} connectors for starship ${starshipId}`);
      
      const allTools: MCPTool[] = [];

      // Fetch tools from each healthy connector
      for (const connector of connectors) {
        if (connector.dockerStatus === 'running' && 
            connector.dockerHealthStatus === 'healthy') {
          
          // Get template info
          let templateSlug = 'unknown';
          try {
            const template = await serverOptionRepo.findById(connector.templateId);
            if (template) {
              templateSlug = template.slug;
            }
          } catch (error) {
            console.warn(`[MCPToolGatewayDB] Could not fetch template info for ${connector.templateId}`);
          }
          
          // Check if we're in development mode and need to connect via exposed ports
          const isDevelopment = process.env.NODE_ENV !== 'production';
          let serviceUrl = `http://${connector.dockerServiceName || `mcp-${connector.id}`}:8080`;
          
          if (isDevelopment) {
            // In development, try to find the exposed port
            const containerName = connector.dockerServiceName || `mcp-${connector.id}`;
            const exposedPort = await this.getExposedPort(containerName, '8080/tcp');
            
            if (exposedPort) {
              serviceUrl = `http://localhost:${exposedPort}`;
              console.log(`[MCPToolGatewayDB] Using exposed port for development: ${serviceUrl}`);
            } else {
              console.warn(`[MCPToolGatewayDB] No exposed port found for ${containerName}, container may not be accessible`);
              continue; // Skip this connector
            }
          }
          
          const service: MCPServiceEndpoint = {
            connectorId: connector.id,
            containerName: connector.dockerServiceName || `mcp-${connector.id}`,
            internalUrl: serviceUrl,
            templateSlug: templateSlug,
            status: 'healthy',
            availableTools: [],
            availableResources: [],
            lastHealthCheck: new Date().toISOString()
          };

          try {
            console.log(`[MCPToolGatewayDB] Fetching tools from ${service.containerName} at ${serviceUrl}`);
            const tools = await this.fetchToolsFromService(service);
            allTools.push(...tools);
          } catch (error) {
            console.warn(`[MCPToolGatewayDB] Failed to fetch tools from ${service.containerName}:`, error);
          }
        }
      }

      // Update cache
      this.toolCache.set(starshipId, allTools);

      console.log(`[MCPToolGatewayDB] Found ${allTools.length} total tools for starship ${starshipId}`);
      return allTools;
    } catch (error) {
      console.error('[MCPToolGatewayDB] Error getting tools for starship:', error);
      return []; // Return empty array instead of throwing to allow graceful degradation
    }
  }

  /**
   * Fetch tools from a specific service
   */
  private async fetchToolsFromService(service: MCPServiceEndpoint): Promise<MCPTool[]> {
    try {
      const rawTools = await this.networkClient.fetchTools(service);
      
      // Transform raw tools to MCPTool format
      return rawTools.map(tool => ({
        id: `${service.connectorId}:${tool.name}`,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || {},
        connectorId: service.connectorId,
        templateSlug: service.templateSlug
      }));
    } catch (error) {
      console.error(`[MCPToolGatewayDB] Failed to fetch tools from ${service.containerName}:`, error);
      return [];
    }
  }

  /**
   * Invoke a tool on the appropriate MCP service
   */
  async invokeTool(
    starshipId: string,
    toolId: string,
    args: any
  ): Promise<any> {
    // Extract connector ID from tool ID
    const [connectorId, toolName] = toolId.split(':');
    
    // Get connector details from database
    const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
    const connector = await connectorRepo.findById(connectorId);
    
    if (!connector || !connector.dockerServiceName) {
      throw new Error(`Connector ${connectorId} not found or not running`);
    }

    // Get template info
    const serverOptionRepo = RepositoryFactory.getMCPServerOptionRepository();
    let templateSlug = 'unknown';
    try {
      const template = await serverOptionRepo.findById(connector.templateId);
      if (template) {
        templateSlug = template.slug;
      }
    } catch (error) {
      console.warn(`[MCPToolGatewayDB] Could not fetch template info for ${connector.templateId}`);
    }
    
    // Check if we're in development mode and need to connect via exposed ports
    const isDevelopment = process.env.NODE_ENV !== 'production';
    let serviceUrl = `http://${connector.dockerServiceName || `mcp-${connector.id}`}:8080`;
    
    if (isDevelopment) {
      // In development, try to find the exposed port
      const containerName = connector.dockerServiceName || `mcp-${connector.id}`;
      const exposedPort = await this.getExposedPort(containerName, '8080/tcp');
      
      if (exposedPort) {
        serviceUrl = `http://localhost:${exposedPort}`;
        console.log(`[MCPToolGatewayDB] Using exposed port for development: ${serviceUrl}`);
      } else {
        throw new Error(`No exposed port found for ${containerName}, container may not be accessible`);
      }
    }
    
    const service: MCPServiceEndpoint = {
      connectorId: connector.id,
      containerName: connector.dockerServiceName || `mcp-${connector.id}`,
      internalUrl: serviceUrl,
      templateSlug: templateSlug,
      status: 'healthy',
      availableTools: [],
      availableResources: [],
      lastHealthCheck: new Date().toISOString()
    };

    const result = await this.networkClient.executeTool(service, toolName, args);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.result;
  }

  /**
   * Get the exposed port for a container
   */
  private async getExposedPort(containerName: string, internalPort: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `docker inspect ${containerName} --format='{{json .NetworkSettings.Ports}}'`
      );
      
      const ports = JSON.parse(stdout.trim());
      const portMapping = ports[internalPort];
      
      if (portMapping && Array.isArray(portMapping) && portMapping.length > 0 && portMapping[0].HostPort) {
        console.log(`[MCPToolGatewayDB] Found exposed port ${portMapping[0].HostPort} for ${containerName}`);
        return portMapping[0].HostPort;
      }
      
      console.log(`[MCPToolGatewayDB] No port mapping found for ${containerName}:${internalPort}`);
      return null;
    } catch (error) {
      console.error(`[MCPToolGatewayDB] Error getting exposed port for ${containerName}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const mcpToolGatewayDB = new MCPToolGatewayDB();