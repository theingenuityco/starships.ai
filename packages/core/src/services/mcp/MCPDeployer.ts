/**
 * MCPDeployer Interface
 * 
 * Defines the contract for deploying and managing MCP server containers.
 * This interface allows for different deployment strategies (Docker Compose, Kubernetes, etc.)
 */

import { MCPServerConnector } from '@starships/models';

export interface DeploymentStatus {
  connectorId: string;
  status: 'pending' | 'building' | 'running' | 'stopped' | 'error';
  containerId?: string;
  serviceName?: string;
  networkName?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'starting';
  lastHealthCheck?: string;
  errorMessage?: string;
  deployedAt?: string;
  lastUpdated: string;
  // HTTP bridge specific fields
  httpBridgeEnabled?: boolean;
  internalUrl?: string;
  bridgeVersion?: string;
  availableTools?: string[];
  availableResources?: string[];
  lastToolsSync?: string;
}

export interface DeploymentResult {
  success: boolean;
  serviceName: string;
  containerId?: string;
  networkName?: string;
  errorMessage?: string;
  deploymentTime: number; // milliseconds
}

export interface NetworkConfig {
  networkName: string;
  starshipId: string;
  subnet?: string;
  driver?: 'bridge' | 'overlay';
  isolated?: boolean;
}

/**
 * MCPDeployer Interface
 * 
 * Provides methods for deploying, managing, and monitoring MCP server containers
 */
export interface MCPDeployer {
  /**
   * Deploy a new MCP server connector as a containerized service
   * @param starshipId - The ID of the starship to deploy on
   * @param connector - The connector instance configuration
   * @returns Promise resolving to the service name (DNS endpoint)
   */
  deploy(starshipId: string, connector: MCPServerConnector): Promise<DeploymentResult>;

  /**
   * Remove a specific MCP server connector container
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance to remove
   * @returns Promise resolving to true if successful
   */
  remove(starshipId: string, connectorId: string): Promise<boolean>;

  /**
   * Remove all MCP server connectors for a starship (cleanup entire starship)
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to the number of containers removed
   */
  removeAll(starshipId: string): Promise<number>;

  /**
   * Get the current deployment status of a connector
   * @param connectorId - The ID of the connector instance
   * @returns Promise resolving to the deployment status
   */
  getStatus(connectorId: string): Promise<DeploymentStatus | null>;

  /**
   * Get deployment status for all connectors in a starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of deployment statuses
   */
  getStarshipStatus(starshipId: string): Promise<DeploymentStatus[]>;

  /**
   * Restart a specific MCP server connector
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @returns Promise resolving to true if successful
   */
  restart(starshipId: string, connectorId: string): Promise<boolean>;

  /**
   * Update environment variables for a running connector
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @param env - New environment variables as JSON string
   * @returns Promise resolving to true if successful
   */
  updateEnvironment(starshipId: string, connectorId: string, env: string): Promise<boolean>;

  /**
   * Get logs from a specific connector container
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @param options - Log options (tail, since, etc.)
   * @returns Promise resolving to log lines
   */
  getLogs(
    starshipId: string, 
    connectorId: string, 
    options?: {
      tail?: number;
      since?: string;
      follow?: boolean;
    }
  ): Promise<string[]>;

  /**
   * Check health of a specific connector
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @returns Promise resolving to health status
   */
  checkHealth(starshipId: string, connectorId: string): Promise<{
    healthy: boolean;
    status: string;
    details?: any;
  }>;

  /**
   * Create or ensure network exists for a starship
   * @param config - Network configuration
   * @returns Promise resolving to true if successful
   */
  ensureNetwork(config: NetworkConfig): Promise<boolean>;

  /**
   * Remove network for a starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to true if successful
   */
  removeNetwork(starshipId: string): Promise<boolean>;

  /**
   * List all active deployments
   * @returns Promise resolving to array of deployment statuses
   */
  listDeployments(): Promise<DeploymentStatus[]>;

  /**
   * Get deployment metrics and statistics
   * @param starshipId - Optional starship ID to filter by
   * @returns Promise resolving to deployment metrics
   */
  getMetrics(starshipId?: string): Promise<{
    totalDeployments: number;
    runningContainers: number;
    healthyContainers: number;
    errorContainers: number;
    networkCount: number;
    averageStartupTime: number;
    resourceUsage?: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    };
  }>;
}