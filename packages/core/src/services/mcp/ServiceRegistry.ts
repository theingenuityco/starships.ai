/**
 * ServiceRegistry - Container discovery and service management for MCP HTTP bridge containers
 * 
 * This service provides container discovery, health monitoring, and service endpoint management
 * for HTTP bridge deployments.
 */

export interface MCPServiceEndpoint {
  connectorId: string;
  containerName: string;
  internalUrl: string;
  templateSlug: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  lastHealthCheck: string;
  availableTools?: string[];
  availableResources?: string[];
  capabilities?: any;
}

export interface ServiceRegistryEntry {
  starshipId: string;
  endpoint: MCPServiceEndpoint;
  registeredAt: string;
  lastUpdated: string;
}

export class ServiceRegistry {
  private registry: Map<string, ServiceRegistryEntry> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckIntervalMs: number = 30000; // 30 seconds

  constructor() {
    // Start health check monitoring
    this.startHealthCheckMonitoring();
  }

  /**
   * Register a new service endpoint
   */
  async registerService(starshipId: string, endpoint: MCPServiceEndpoint): Promise<void> {
    const key = this.getServiceKey(starshipId, endpoint.connectorId);
    const now = new Date().toISOString();
    
    const entry: ServiceRegistryEntry = {
      starshipId,
      endpoint,
      registeredAt: this.registry.get(key)?.registeredAt || now,
      lastUpdated: now
    };

    this.registry.set(key, entry);
    
    console.log(`[ServiceRegistry] Registered service: ${endpoint.containerName} for starship ${starshipId}`);
  }

  /**
   * Unregister a service endpoint
   */
  async unregisterService(starshipId: string, connectorId: string): Promise<void> {
    const key = this.getServiceKey(starshipId, connectorId);
    const removed = this.registry.delete(key);
    
    if (removed) {
      console.log(`[ServiceRegistry] Unregistered service for connector ${connectorId} on starship ${starshipId}`);
    }
  }

  /**
   * Get all services for a starship
   */
  getStarshipServices(starshipId: string): MCPServiceEndpoint[] {
    const services: MCPServiceEndpoint[] = [];
    
    for (const [key, entry] of this.registry.entries()) {
      if (entry.starshipId === starshipId) {
        services.push(entry.endpoint);
      }
    }
    
    return services;
  }

  /**
   * Get a specific service endpoint
   */
  getService(starshipId: string, connectorId: string): MCPServiceEndpoint | null {
    const key = this.getServiceKey(starshipId, connectorId);
    const entry = this.registry.get(key);
    return entry ? entry.endpoint : null;
  }

  /**
   * Update service health status
   */
  async updateServiceHealth(
    starshipId: string, 
    connectorId: string, 
    status: 'healthy' | 'unhealthy' | 'starting' | 'stopping',
    tools?: string[],
    resources?: string[],
    capabilities?: any
  ): Promise<void> {
    const key = this.getServiceKey(starshipId, connectorId);
    const entry = this.registry.get(key);
    
    if (entry) {
      entry.endpoint.status = status;
      entry.endpoint.lastHealthCheck = new Date().toISOString();
      entry.lastUpdated = new Date().toISOString();
      
      if (tools) entry.endpoint.availableTools = tools;
      if (resources) entry.endpoint.availableResources = resources;
      if (capabilities) entry.endpoint.capabilities = capabilities;
      
      console.log(`[ServiceRegistry] Updated health for ${entry.endpoint.containerName}: ${status}`);
    }
  }

  /**
   * Get service discovery data for API endpoints
   */
  getServiceDiscoveryData(starshipId: string): any {
    const services = this.getStarshipServices(starshipId);
    
    return {
      services: services.map(service => ({
        connectorId: service.connectorId,
        slug: service.templateSlug,
        internalUrl: service.internalUrl,
        status: service.status,
        lastHealthCheck: service.lastHealthCheck,
        availableTools: service.availableTools || [],
        availableResources: service.availableResources || [],
        capabilities: service.capabilities
      }))
    };
  }

  /**
   * Perform health check on a service
   */
  private async performHealthCheck(entry: ServiceRegistryEntry): Promise<void> {
    const { endpoint } = entry;
    
    try {
      // For HTTP bridge services, call the health endpoint
      if (endpoint.internalUrl.startsWith('http')) {
        // Check if we're in development and skip actual network calls
        if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_DOCKER_HEALTH_CHECKS) {
          console.log(`[ServiceRegistry] Skipping health check for ${endpoint.containerName} (development mode)`);
          await this.updateServiceHealth(entry.starshipId, endpoint.connectorId, 'healthy');
          return;
        }
        
        // For health checks from the host, we need to use Docker's internal health check
        // The container's health is managed by Docker's healthcheck configuration
        // We'll check the container status instead of making HTTP calls
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' ${endpoint.containerName}`);
          const healthStatus = stdout.trim();
          
          if (healthStatus === 'healthy') {
            await this.updateServiceHealth(entry.starshipId, endpoint.connectorId, 'healthy');
          } else if (healthStatus === 'unhealthy') {
            await this.updateServiceHealth(entry.starshipId, endpoint.connectorId, 'unhealthy');
          } else {
            // starting, none, or other status
            await this.updateServiceHealth(entry.starshipId, endpoint.connectorId, 'starting');
          }
          return;
        } catch (dockerError) {
          console.warn(`[ServiceRegistry] Docker inspect failed, falling back to marking as unhealthy:`, dockerError);
          await this.updateServiceHealth(entry.starshipId, endpoint.connectorId, 'unhealthy');
          return;
        }
      }
    } catch (error) {
      console.warn(`[ServiceRegistry] Health check failed for ${endpoint.containerName}:`, error);
      await this.updateServiceHealth(
        entry.starshipId,
        endpoint.connectorId,
        'unhealthy'
      );
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      console.log(`[ServiceRegistry] Running health checks for ${this.registry.size} services`);
      
      const healthCheckPromises = Array.from(this.registry.values()).map(entry => 
        this.performHealthCheck(entry).catch(error => 
          console.error(`[ServiceRegistry] Health check error for ${entry.endpoint.containerName}:`, error)
        )
      );
      
      await Promise.all(healthCheckPromises);
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get service key for internal mapping
   */
  private getServiceKey(starshipId: string, connectorId: string): string {
    return `${starshipId}:${connectorId}`;
  }

  /**
   * Get registry statistics
   */
  getStats(): any {
    const services = Array.from(this.registry.values());
    const now = Date.now();
    
    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.endpoint.status === 'healthy').length,
      unhealthyServices: services.filter(s => s.endpoint.status === 'unhealthy').length,
      startingServices: services.filter(s => s.endpoint.status === 'starting').length,
      stoppingServices: services.filter(s => s.endpoint.status === 'stopping').length,
      averageUptimeHours: services.length > 0 
        ? services.reduce((sum, s) => sum + (now - new Date(s.registeredAt).getTime()), 0) / services.length / (1000 * 60 * 60)
        : 0,
      starships: new Set(services.map(s => s.starshipId)).size
    };
  }

  /**
   * Cleanup old/stale entries
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, entry] of this.registry.entries()) {
      const lastUpdate = new Date(entry.lastUpdated).getTime();
      if (now - lastUpdate > staleThreshold && entry.endpoint.status !== 'healthy') {
        this.registry.delete(key);
        console.log(`[ServiceRegistry] Cleaned up stale entry: ${entry.endpoint.containerName}`);
      }
    }
  }
}

// Singleton instance
export const serviceRegistry = new ServiceRegistry();