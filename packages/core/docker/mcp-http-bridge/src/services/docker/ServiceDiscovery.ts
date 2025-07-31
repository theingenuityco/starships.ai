/**
 * ServiceDiscovery - MCP service discovery and communication helper
 * Provides utilities for MCP servers to discover and communicate with each other
 */

import { NetworkManager, ServiceInfo } from './NetworkManager';

export interface MCPService {
  slug: string;
  containerName: string;
  internalUrl: string;
  healthUrl: string;
  status: 'running' | 'starting' | 'unhealthy' | 'stopped';
  lastHealthCheck?: Date;
}

export interface ServiceDiscoveryConfig {
  starshipId: string;
  enableHealthChecks?: boolean;
  healthCheckInterval?: number; // milliseconds
}

/**
 * Service discovery system for MCP servers within a starship
 */
export class ServiceDiscovery {
  private networkManager: NetworkManager;
  private config: ServiceDiscoveryConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private serviceCache: Map<string, MCPService> = new Map();
  
  constructor(config: ServiceDiscoveryConfig) {
    this.config = config;
    this.networkManager = new NetworkManager();
    
    if (config.enableHealthChecks) {
      this.startHealthChecking();
    }
  }
  
  /**
   * Discover all MCP services in the starship network
   */
  async discoverServices(): Promise<MCPService[]> {
    try {
      const services = await this.networkManager.getServiceDiscovery(this.config.starshipId);
      const mcpServices: MCPService[] = [];
      
      for (const service of services) {
        const mcpService = this.serviceInfoToMCPService(service);
        mcpServices.push(mcpService);
        
        // Update cache
        this.serviceCache.set(mcpService.slug, mcpService);
      }
      
      console.log(`[ServiceDiscovery] Discovered ${mcpServices.length} services for starship ${this.config.starshipId}`);
      return mcpServices;
      
    } catch (error) {
      console.error(`[ServiceDiscovery] Failed to discover services:`, error);
      return [];
    }
  }
  
  /**
   * Get a specific MCP service by slug
   */
  async getService(slug: string): Promise<MCPService | null> {
    // Check cache first
    if (this.serviceCache.has(slug)) {
      return this.serviceCache.get(slug)!;
    }
    
    // Discover services and search
    const services = await this.discoverServices();
    return services.find(service => service.slug === slug) || null;
  }
  
  /**
   * Test connectivity to a specific service
   */
  async testServiceConnectivity(slug: string): Promise<boolean> {
    try {
      const service = await this.getService(slug);
      if (!service) {
        console.warn(`[ServiceDiscovery] Service ${slug} not found`);
        return false;
      }
      
      // Test DNS resolution
      const dnsTest = await this.networkManager.testServiceDiscovery(
        this.config.starshipId, 
        slug
      );
      
      if (!dnsTest) {
        console.warn(`[ServiceDiscovery] DNS resolution failed for ${slug}`);
        return false;
      }
      
      // Test HTTP connectivity if health URL is available
      if (service.healthUrl) {
        const healthTest = await this.testHealthEndpoint(service);
        return healthTest;
      }
      
      return true;
      
    } catch (error) {
      console.error(`[ServiceDiscovery] Connectivity test failed for ${slug}:`, error);
      return false;
    }
  }
  
  /**
   * Get service URL for internal communication
   */
  getServiceUrl(slug: string, path: string = ''): string {
    const service = this.serviceCache.get(slug);
    if (!service) {
      throw new Error(`Service ${slug} not found in cache. Call discoverServices() first.`);
    }
    
    const basePath = path.startsWith('/') ? path : `/${path}`;
    return `${service.internalUrl}${basePath}`;
  }
  
  /**
   * List all available services with their status
   */
  async getServiceStatus(): Promise<{ [slug: string]: MCPService }> {
    const services = await this.discoverServices();
    const statusMap: { [slug: string]: MCPService } = {};
    
    for (const service of services) {
      statusMap[service.slug] = service;
    }
    
    return statusMap;
  }
  
  /**
   * Wait for a service to become available
   */
  async waitForService(slug: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const isAvailable = await this.testServiceConnectivity(slug);
      if (isAvailable) {
        console.log(`[ServiceDiscovery] Service ${slug} is now available`);
        return true;
      }
      
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.warn(`[ServiceDiscovery] Timeout waiting for service ${slug}`);
    return false;
  }
  
  /**
   * Clean up service discovery (stop health checks, clear cache)
   */
  cleanup(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    this.serviceCache.clear();
    console.log(`[ServiceDiscovery] Cleaned up service discovery for starship ${this.config.starshipId}`);
  }
  
  /**
   * Convert ServiceInfo to MCPService
   */
  private serviceInfoToMCPService(service: ServiceInfo): MCPService {
    const slug = service.serviceName;
    const baseUrl = `http://${service.containerName}:3000`; // Standard MCP port
    
    return {
      slug,
      containerName: service.containerName,
      internalUrl: baseUrl,
      healthUrl: `${baseUrl}/health`,
      status: 'running', // Will be updated by health checks
      lastHealthCheck: undefined
    };
  }
  
  /**
   * Test health endpoint of a service
   */
  private async testHealthEndpoint(service: MCPService): Promise<boolean> {
    try {
      // Use curl from within the network to test connectivity
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Find any container in the same network to run curl from
      const services = await this.networkManager.getServiceDiscovery(this.config.starshipId);
      if (services.length === 0) {
        return false;
      }
      
      const testContainer = services[0].containerName;
      const curlCommand = `docker exec ${testContainer} curl -f -s ${service.healthUrl} --max-time 5`;
      
      const result = await execAsync(curlCommand);
      const isHealthy = result.stderr === '' && result.stdout.includes('healthy');
      
      // Update service status
      service.status = isHealthy ? 'running' : 'unhealthy';
      service.lastHealthCheck = new Date();
      
      return isHealthy;
      
    } catch (error) {
      console.warn(`[ServiceDiscovery] Health check failed for ${service.slug}:`, error);
      service.status = 'unhealthy';
      service.lastHealthCheck = new Date();
      return false;
    }
  }
  
  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    const interval = this.config.healthCheckInterval || 30000; // 30 seconds default
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        const services = await this.discoverServices();
        
        for (const service of services) {
          await this.testHealthEndpoint(service);
        }
        
        console.log(`[ServiceDiscovery] Health check completed for ${services.length} services`);
        
      } catch (error) {
        console.error('[ServiceDiscovery] Health check cycle failed:', error);
      }
    }, interval);
    
    console.log(`[ServiceDiscovery] Started health checking every ${interval}ms`);
  }
}