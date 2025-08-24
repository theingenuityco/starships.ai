/**
 * CapabilitySyncService - Manages synchronization of MCP server capabilities
 * 
 * This service handles periodic synchronization of tools and resources from HTTP bridge
 * endpoints to the database and service registry for efficient querying and caching.
 */

import { MCPServerConnectorRepository } from '@starships/models';
import { serviceRegistry } from './ServiceRegistry';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPCapabilities {
  tools: MCPTool[];
  resources: MCPResource[];
  lastSync: string;
  syncVersion: number;
}

export interface CapabilitySyncResult {
  success: boolean;
  connectorId: string;
  toolsCount: number;
  resourcesCount: number;
  syncDuration: number;
  errorMessage?: string;
}

export class CapabilitySyncService {
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private defaultSyncInterval: number = 300000; // 5 minutes
  private maxRetries: number = 3;
  private retryDelay: number = 30000; // 30 seconds

  constructor(mcpConnectorRepo: MCPServerConnectorRepository) {
    this.mcpConnectorRepo = mcpConnectorRepo;
  }

  /**
   * Start automatic capability synchronization for a connector
   */
  async startCapabilitySync(connectorId: string, intervalMs?: number): Promise<void> {
    console.log(`[CapabilitySync] Starting capability sync for connector ${connectorId}`);
    
    // Clear any existing interval
    this.stopCapabilitySync(connectorId);
    
    const syncInterval = intervalMs || this.defaultSyncInterval;
    
    // Initial sync
    await this.syncConnectorCapabilities(connectorId);
    
    // Schedule periodic sync
    const interval = setInterval(async () => {
      try {
        await this.syncConnectorCapabilities(connectorId);
      } catch (error) {
        console.error(`[CapabilitySync] Periodic sync failed for connector ${connectorId}:`, error);
      }
    }, syncInterval);
    
    this.syncIntervals.set(connectorId, interval);
    console.log(`[CapabilitySync] Scheduled periodic sync every ${syncInterval}ms for connector ${connectorId}`);
  }

  /**
   * Stop automatic capability synchronization for a connector
   */
  stopCapabilitySync(connectorId: string): void {
    const interval = this.syncIntervals.get(connectorId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(connectorId);
      console.log(`[CapabilitySync] Stopped capability sync for connector ${connectorId}`);
    }
  }

  /**
   * Sync capabilities for a specific connector with retry logic
   */
  async syncConnectorCapabilities(connectorId: string, retryCount: number = 0): Promise<CapabilitySyncResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[CapabilitySync] Syncing capabilities for connector ${connectorId} (attempt ${retryCount + 1})`);
      
      // Get connector info
      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      if (!connector.httpBridgeEnabled || !connector.starshipId) {
        throw new Error(`Connector ${connectorId} is not HTTP bridge enabled`);
      }

      // Get service endpoint
      const serviceEndpoint = serviceRegistry.getService(connector.starshipId, connectorId);
      if (!serviceEndpoint) {
        throw new Error(`Service endpoint not found for connector ${connectorId}`);
      }

      if (serviceEndpoint.status !== 'healthy') {
        throw new Error(`Service endpoint is not healthy: ${serviceEndpoint.status}`);
      }

      // Fetch capabilities from HTTP bridge
      const capabilities = await this.fetchCapabilitiesFromBridge(serviceEndpoint.internalUrl);
      
      // Update service registry
      await serviceRegistry.updateServiceHealth(
        connector.starshipId,
        connectorId,
        'healthy',
        capabilities.tools.map(tool => tool.name),
        capabilities.resources.map(resource => resource.uri),
        {
          tools: capabilities.tools,
          resources: capabilities.resources,
          lastSync: capabilities.lastSync,
          syncVersion: capabilities.syncVersion
        }
      );

      // Update connector in database
      await this.updateConnectorCapabilities(connector, capabilities);

      const syncDuration = Date.now() - startTime;
      console.log(`[CapabilitySync] Successfully synced ${capabilities.tools.length} tools and ${capabilities.resources.length} resources for connector ${connectorId} in ${syncDuration}ms`);

      return {
        success: true,
        connectorId,
        toolsCount: capabilities.tools.length,
        resourcesCount: capabilities.resources.length,
        syncDuration,
      };

    } catch (error) {
      const syncDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[CapabilitySync] Failed to sync capabilities for connector ${connectorId}:`, errorMessage);

      // Retry logic
      if (retryCount < this.maxRetries) {
        console.log(`[CapabilitySync] Retrying sync for connector ${connectorId} in ${this.retryDelay}ms`);
        
        setTimeout(async () => {
          await this.syncConnectorCapabilities(connectorId, retryCount + 1);
        }, this.retryDelay);
      } else {
        console.error(`[CapabilitySync] Max retries exceeded for connector ${connectorId}`);
        
        // Update service registry to indicate sync failure
        try {
          const connector = await this.mcpConnectorRepo.findById(connectorId);
          if (connector?.starshipId) {
            await serviceRegistry.updateServiceHealth(
              connector.starshipId,
              connectorId,
              'unhealthy'
            );
          }
        } catch (registryError) {
          console.error(`[CapabilitySync] Failed to update service registry after sync failure:`, registryError);
        }
      }

      return {
        success: false,
        connectorId,
        toolsCount: 0,
        resourcesCount: 0,
        syncDuration,
        errorMessage,
      };
    }
  }

  /**
   * Fetch capabilities from HTTP bridge endpoint
   */
  private async fetchCapabilitiesFromBridge(internalUrl: string): Promise<MCPCapabilities> {
    const [toolsResponse, resourcesResponse] = await Promise.all([
      fetch(`${internalUrl}/tools`),
      fetch(`${internalUrl}/resources`)
    ]);

    if (!toolsResponse.ok) {
      throw new Error(`Failed to fetch tools: HTTP ${toolsResponse.status}`);
    }

    if (!resourcesResponse.ok) {
      throw new Error(`Failed to fetch resources: HTTP ${resourcesResponse.status}`);
    }

    const [toolsData, resourcesData] = await Promise.all([
      toolsResponse.json(),
      resourcesResponse.json()
    ]);

    return {
      tools: (toolsData as any)?.tools || [],
      resources: (resourcesData as any)?.resources || [],
      lastSync: new Date().toISOString(),
      syncVersion: Date.now(), // Use timestamp as version
    };
  }

  /**
   * Update connector capabilities in database
   */
  private async updateConnectorCapabilities(connector: any, capabilities: MCPCapabilities): Promise<void> {
    try {
      // Update connector with capabilities data
      await this.mcpConnectorRepo.update(connector.id, {
        availableTools: JSON.stringify(capabilities.tools),
        availableResources: JSON.stringify(capabilities.resources),
        lastToolsSync: capabilities.lastSync,
        bridgeCapabilities: JSON.stringify({
          syncVersion: capabilities.syncVersion,
          toolsCount: capabilities.tools.length,
          resourcesCount: capabilities.resources.length,
          lastSync: capabilities.lastSync
        })
      });

      console.log(`[CapabilitySync] Updated database capabilities for connector ${connector.id}`);
    } catch (error) {
      console.error(`[CapabilitySync] Failed to update database capabilities for connector ${connector.id}:`, error);
      throw error;
    }
  }

  /**
   * Sync capabilities for all HTTP bridge connectors
   */
  async syncAllCapabilities(): Promise<CapabilitySyncResult[]> {
    console.log(`[CapabilitySync] Starting sync for all HTTP bridge connectors`);
    
    try {
      // Get all HTTP bridge enabled connectors
      const connectors = await this.mcpConnectorRepo.findAll();
      const httpBridgeConnectors = connectors.filter((c: any) => c.httpBridgeEnabled);

      console.log(`[CapabilitySync] Found ${httpBridgeConnectors.length} HTTP bridge connectors to sync`);

      // Sync all connectors in parallel
      const syncPromises = httpBridgeConnectors.map((connector: any) =>
        this.syncConnectorCapabilities(connector.id)
      );

      const results = await Promise.allSettled(syncPromises);
      
      // Process results
      const syncResults: CapabilitySyncResult[] = results.map((result: any, index: number) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            connectorId: httpBridgeConnectors[index].id,
            toolsCount: 0,
            resourcesCount: 0,
            syncDuration: 0,
            errorMessage: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          };
        }
      });

      const successCount = syncResults.filter(r => r.success).length;
      console.log(`[CapabilitySync] Completed sync for ${httpBridgeConnectors.length} connectors: ${successCount} successful, ${httpBridgeConnectors.length - successCount} failed`);

      return syncResults;
    } catch (error) {
      console.error(`[CapabilitySync] Failed to sync all capabilities:`, error);
      throw error;
    }
  }

  /**
   * Get capability sync status for a connector
   */
  async getCapabilitySyncStatus(connectorId: string): Promise<any> {
    try {
      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        return null;
      }

      const isScheduled = this.syncIntervals.has(connectorId);
      const serviceEndpoint = connector.starshipId ? 
        serviceRegistry.getService(connector.starshipId, connectorId) : null;

      let parsedCapabilities = null;
      try {
        parsedCapabilities = connector.bridgeCapabilities ? 
          JSON.parse(connector.bridgeCapabilities) : null;
      } catch (parseError) {
        console.warn(`[CapabilitySync] Failed to parse bridge capabilities for connector ${connectorId}`);
      }

      return {
        connectorId,
        httpBridgeEnabled: connector.httpBridgeEnabled || false,
        lastToolsSync: connector.lastToolsSync,
        isScheduled,
        serviceStatus: serviceEndpoint?.status || 'unknown',
        availableTools: serviceEndpoint?.availableTools || [],
        availableResources: serviceEndpoint?.availableResources || [],
        syncMetadata: parsedCapabilities,
      };
    } catch (error) {
      console.error(`[CapabilitySync] Failed to get sync status for connector ${connectorId}:`, error);
      return null;
    }
  }

  /**
   * Cleanup - stop all sync intervals
   */
  cleanup(): void {
    console.log(`[CapabilitySync] Cleaning up ${this.syncIntervals.size} sync intervals`);
    
    for (const [connectorId, interval] of this.syncIntervals) {
      clearInterval(interval);
    }
    
    this.syncIntervals.clear();
  }
}

// Export singleton instance
export const capabilitySyncService = new CapabilitySyncService(
  // This will be injected in the actual deployment
  {} as MCPServerConnectorRepository
);