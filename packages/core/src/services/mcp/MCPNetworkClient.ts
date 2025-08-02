/**
 * MCPNetworkClient - Handles network communication with MCP HTTP bridge containers
 * 
 * This client manages HTTP requests to MCP servers, handling Docker networking,
 * retries, and environment-specific URL resolution.
 */

import { MCPServiceEndpoint } from './ServiceRegistry';

export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
}

export interface ToolExecutionResult {
  result?: any;
  error?: string;
  usage?: {
    tokensUsed?: number;
    creditsUsed?: number;
  };
}

export class MCPNetworkClient {
  private defaultTimeout: number = 120000; // 2 minutes for web scraping operations
  private defaultRetries: number = 3;

  constructor() {
    console.log('[MCPNetworkClient] Initialized network client');
  }

  /**
   * Fetch available tools from an MCP service
   */
  async fetchTools(service: MCPServiceEndpoint): Promise<any[]> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      console.log(`[MCPNetworkClient] Fetching tools from ${service.containerName} at ${baseUrl}`);

      const response = await this.makeRequest('GET', `${baseUrl}/tools`, null, {
        timeout: 5000 // Quick timeout for discovery
      });

      const data = response.tools || [];
      console.log(`[MCPNetworkClient] Found ${data.length} tools from ${service.containerName}`);
      
      return data;
    } catch (error) {
      console.error(`[MCPNetworkClient] Failed to fetch tools from ${service.containerName}:`, error);
      throw new Error(`Tool discovery failed for ${service.templateSlug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch available resources from an MCP service
   */
  async fetchResources(service: MCPServiceEndpoint): Promise<any[]> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      console.log(`[MCPNetworkClient] Fetching resources from ${service.containerName} at ${baseUrl}`);

      const response = await this.makeRequest('GET', `${baseUrl}/resources`, null, {
        timeout: 5000
      });

      const data = response.resources || [];
      console.log(`[MCPNetworkClient] Found ${data.length} resources from ${service.containerName}`);
      
      return data;
    } catch (error) {
      console.error(`[MCPNetworkClient] Failed to fetch resources from ${service.containerName}:`, error);
      throw new Error(`Resource discovery failed for ${service.templateSlug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a tool on an MCP service
   */
  async executeTool(
    service: MCPServiceEndpoint,
    toolName: string,
    args: any,
    options?: ToolExecutionOptions
  ): Promise<ToolExecutionResult> {
    const baseUrl = await this.getServiceUrl(service);
    const timeout = options?.timeout || this.defaultTimeout;
    const retries = options?.retries || this.defaultRetries;

    console.log(`[MCPNetworkClient] Executing tool ${toolName} on ${service.containerName}`);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.makeRequest(
          'POST',
          `${baseUrl}/tools/${toolName}`,
          {
            arguments: args
          },
          { timeout }
        );

        console.log(`[MCPNetworkClient] Tool ${toolName} executed successfully`);
        
        return {
          result: response.content || response,
          usage: response.usage
        };
      } catch (error) {
        console.error(`[MCPNetworkClient] Tool execution failed (attempt ${attempt}/${retries}):`, error);
        
        if (attempt === retries) {
          return {
            error: error instanceof Error ? error.message : String(error)
          };
        }

        // Exponential backoff
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[MCPNetworkClient] Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    return {
      error: `Failed to execute tool after ${retries} attempts`
    };
  }

  /**
   * Read a resource from an MCP service
   */
  async readResource(
    service: MCPServiceEndpoint,
    uri: string,
    options?: { timeout?: number }
  ): Promise<any> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      const response = await this.makeRequest(
        'POST',
        `${baseUrl}/resources/read`,
        { uri },
        { timeout: options?.timeout || this.defaultTimeout }
      );

      return response.content || response;
    } catch (error) {
      console.error(`[MCPNetworkClient] Failed to read resource ${uri}:`, error);
      throw error;
    }
  }

  /**
   * Get the service URL based on environment
   */
  private async getServiceUrl(service: MCPServiceEndpoint): Promise<string> {
    // Check if we have a direct internal URL
    if (service.internalUrl) {
      // In development, we need to resolve to localhost with mapped port
      if (process.env.NODE_ENV === 'development' && !process.env.USE_INTERNAL_URLS) {
        return this.resolveDevUrl(service);
      }
      
      // In production or when USE_INTERNAL_URLS is set, use the internal URL directly
      return service.internalUrl;
    }

    throw new Error(`No URL available for service ${service.containerName}`);
  }

  /**
   * Resolve URL for development environment
   */
  private resolveDevUrl(service: MCPServiceEndpoint): string {
    // Extract container port from internal URL
    const match = service.internalUrl.match(/:(\d+)$/);
    const containerPort = match ? match[1] : '8080';

    // Map container to host port based on naming convention
    // This assumes containers are exposed with predictable port mappings
    const hostPort = this.getHostPortMapping(service.containerName, containerPort);

    const devUrl = `http://localhost:${hostPort}`;
    console.log(`[MCPNetworkClient] Resolved dev URL: ${service.internalUrl} -> ${devUrl}`);
    
    return devUrl;
  }

  /**
   * Get host port mapping for a container
   * In a real implementation, this could query Docker API or use a config file
   */
  private getHostPortMapping(containerName: string, containerPort: string): string {
    // Default mapping strategy - could be enhanced with actual Docker inspection
    const basePort = 9000;
    
    // Simple hash-based port assignment for consistency
    const hash = containerName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const offset = hash % 100;
    
    return String(basePort + offset);
  }

  /**
   * Make HTTP request with proper error handling
   */
  private async makeRequest(
    method: 'GET' | 'POST',
    url: string,
    data: any,
    options: { timeout: number }
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      };

      if (data && method === 'POST') {
        fetchOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${options.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check health of a service
   */
  async checkHealth(service: MCPServiceEndpoint): Promise<{ healthy: boolean; status: string; details?: any }> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      const response = await this.makeRequest('GET', `${baseUrl}/health`, null, {
        timeout: 3000 // Quick health check
      });

      return {
        healthy: response.status === 'healthy',
        status: response.status || 'unknown',
        details: response
      };
    } catch (error) {
      console.warn(`[MCPNetworkClient] Health check failed for ${service.containerName}:`, error);
      return {
        healthy: false,
        status: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Check if a service is reachable
   */
  async checkServiceHealth(service: MCPServiceEndpoint): Promise<boolean> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      const response = await this.makeRequest('GET', `${baseUrl}/health`, null, {
        timeout: 3000 // Quick health check
      });

      return response.status === 'healthy';
    } catch (error) {
      console.warn(`[MCPNetworkClient] Health check failed for ${service.containerName}:`, error);
      return false;
    }
  }

  /**
   * Get capabilities of an MCP service
   */
  async getCapabilities(service: MCPServiceEndpoint): Promise<any> {
    try {
      const baseUrl = await this.getServiceUrl(service);
      const response = await this.makeRequest('GET', `${baseUrl}/capabilities`, null, {
        timeout: 5000
      });

      return response;
    } catch (error) {
      console.error(`[MCPNetworkClient] Failed to get capabilities for ${service.containerName}:`, error);
      return null;
    }
  }
}