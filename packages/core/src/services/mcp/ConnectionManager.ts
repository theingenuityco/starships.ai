/**
 * ConnectionManager - High-level orchestration of MCP-Agent connections
 * 
 * This service provides a unified interface for managing MCP container
 * deployments, connections, and health across different environments.
 */

import { MCPServerConnector } from '@starships/models';
import { MCPDeployer } from './MCPDeployer';
import { DockerComposeDeployer } from './DockerComposeDeployer';
import { MCPToolGatewayDB } from './MCPToolGatewayDB';
import { deploymentConfig } from './DeploymentConfig';
import { portAllocator } from './PortAllocator';
import { healthMonitor } from './HealthMonitor';
import { EventEmitter } from 'events';

export interface ConnectionStatus {
  connectorId: string;
  starshipId: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  serviceUrl?: string;
  allocatedPort?: number;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown' | 'starting';
  lastUpdate: Date;
  error?: string;
}

export interface ConnectionOptions {
  enableHealthMonitoring?: boolean;
  enableAutoRecovery?: boolean;
  connectionTimeout?: number;
  retryAttempts?: number;
}

export class ConnectionManager extends EventEmitter {
  private static instance: ConnectionManager;
  private deployer: MCPDeployer;
  private toolGateway: MCPToolGatewayDB;
  private connections: Map<string, ConnectionStatus> = new Map();
  private options: ConnectionOptions;

  private constructor(options: ConnectionOptions = {}) {
    super();
    this.options = {
      enableHealthMonitoring: true,
      enableAutoRecovery: true,
      connectionTimeout: 30000,
      retryAttempts: 3,
      ...options
    };

    // Initialize components
    this.deployer = new DockerComposeDeployer();
    this.toolGateway = new MCPToolGatewayDB();

    // Set up health monitoring
    if (this.options.enableHealthMonitoring) {
      this.setupHealthMonitoring();
    }

    console.log('[ConnectionManager] Initialized with options:', this.options);
  }

  static getInstance(options?: ConnectionOptions): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(options);
    }
    return ConnectionManager.instance;
  }

  /**
   * Deploy and connect an MCP server
   */
  async deployAndConnect(
    starshipId: string, 
    connector: MCPServerConnector
  ): Promise<ConnectionStatus> {
    const connectionStatus: ConnectionStatus = {
      connectorId: connector.id,
      starshipId,
      status: 'connecting',
      lastUpdate: new Date()
    };

    this.connections.set(connector.id, connectionStatus);
    this.emit('connection_started', connectionStatus);

    try {
      console.log(`[ConnectionManager] Deploying connector ${connector.id} for starship ${starshipId}`);

      // Deploy the container
      const deploymentResult = await this.deployer.deploy(starshipId, connector);
      
      if (!deploymentResult.success) {
        throw new Error(deploymentResult.errorMessage || 'Deployment failed');
      }

      // Get connection details based on environment
      const serviceUrl = await this.getServiceUrl(connector.id, deploymentResult.serviceName);
      const allocatedPort = deploymentConfig.shouldExposePort() 
        ? portAllocator.getAllocatedPort(connector.id) || undefined
        : undefined;

      // Wait for container to be ready
      await this.waitForContainerReady(connector.id, serviceUrl);

      // Verify tools are accessible
      const tools = await this.toolGateway.getToolsForStarship(starshipId);
      console.log(`[ConnectionManager] Found ${tools.length} tools for starship ${starshipId}`);

      // Update connection status
      connectionStatus.status = 'connected';
      connectionStatus.serviceUrl = serviceUrl;
      connectionStatus.allocatedPort = allocatedPort;
      connectionStatus.healthStatus = 'healthy';
      connectionStatus.lastUpdate = new Date();

      this.connections.set(connector.id, connectionStatus);
      this.emit('connection_established', connectionStatus);

      return connectionStatus;
    } catch (error) {
      console.error(`[ConnectionManager] Failed to deploy and connect ${connector.id}:`, error);
      
      connectionStatus.status = 'error';
      connectionStatus.error = error instanceof Error ? error.message : String(error);
      connectionStatus.lastUpdate = new Date();

      this.connections.set(connector.id, connectionStatus);
      this.emit('connection_failed', connectionStatus);

      throw error;
    }
  }

  /**
   * Disconnect and remove an MCP server
   */
  async disconnect(starshipId: string, connectorId: string): Promise<void> {
    try {
      console.log(`[ConnectionManager] Disconnecting connector ${connectorId}`);

      // Remove the container
      await this.deployer.remove(starshipId, connectorId);

      // Release allocated port
      if (deploymentConfig.shouldExposePort()) {
        await portAllocator.releasePort(connectorId);
      }

      // Update connection status
      const connectionStatus: ConnectionStatus = {
        connectorId,
        starshipId,
        status: 'disconnected',
        lastUpdate: new Date()
      };

      this.connections.set(connectorId, connectionStatus);
      this.emit('connection_closed', connectionStatus);
    } catch (error) {
      console.error(`[ConnectionManager] Failed to disconnect ${connectorId}:`, error);
      throw error;
    }
  }

  /**
   * Get connection status for a connector
   */
  getConnectionStatus(connectorId: string): ConnectionStatus | undefined {
    return this.connections.get(connectorId);
  }

  /**
   * Get all connections for a starship
   */
  getStarshipConnections(starshipId: string): ConnectionStatus[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.starshipId === starshipId);
  }

  /**
   * Refresh connection (useful after network changes)
   */
  async refreshConnection(connectorId: string): Promise<ConnectionStatus> {
    const existing = this.connections.get(connectorId);
    if (!existing) {
      throw new Error(`No connection found for connector ${connectorId}`);
    }

    try {
      // Check current status
      const deploymentStatus = await this.deployer.getStatus(connectorId);
      
      if (!deploymentStatus || deploymentStatus.status !== 'running') {
        existing.status = 'disconnected';
        existing.healthStatus = 'unknown';
      } else {
        // Update service URL
        const serviceUrl = await this.getServiceUrl(
          connectorId, 
          deploymentStatus.serviceName || ''
        );
        existing.serviceUrl = serviceUrl;
        existing.status = 'connected';
        existing.healthStatus = deploymentStatus.healthStatus || 'unknown';
      }

      existing.lastUpdate = new Date();
      this.connections.set(connectorId, existing);
      
      this.emit('connection_refreshed', existing);
      return existing;
    } catch (error) {
      console.error(`[ConnectionManager] Failed to refresh connection ${connectorId}:`, error);
      
      existing.status = 'error';
      existing.error = error instanceof Error ? error.message : String(error);
      existing.lastUpdate = new Date();
      
      this.connections.set(connectorId, existing);
      throw error;
    }
  }

  /**
   * Get service URL based on environment
   */
  private async getServiceUrl(connectorId: string, serviceName: string): Promise<string> {
    if (deploymentConfig.shouldExposePort()) {
      const port = portAllocator.getAllocatedPort(connectorId);
      return port ? `http://localhost:${port}` : `http://${serviceName}:8080`;
    } else {
      return deploymentConfig.getServiceUrl(serviceName, 8080);
    }
  }

  /**
   * Wait for container to be ready
   */
  private async waitForContainerReady(
    connectorId: string, 
    serviceUrl: string
  ): Promise<void> {
    const maxAttempts = this.options.retryAttempts || 3;
    const timeout = this.options.connectionTimeout || 30000;
    const interval = 5000; // 5 seconds between attempts

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[ConnectionManager] Waiting for container ${connectorId} to be ready (attempt ${attempt}/${maxAttempts})`);
        
        // Simple health check
        const response = await fetch(`${serviceUrl}/health`, {
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          console.log(`[ConnectionManager] Container ${connectorId} is ready`);
          return;
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Container not ready after ${maxAttempts} attempts`);
        }
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  /**
   * Set up health monitoring
   */
  private setupHealthMonitoring(): void {
    // Listen to health monitor events
    healthMonitor.on('unhealthy_connector', (result) => {
      const connection = this.connections.get(result.connectorId);
      if (connection) {
        connection.healthStatus = 'unhealthy';
        connection.lastUpdate = new Date();
        this.emit('health_status_changed', connection);
      }
    });

    healthMonitor.on('recovery_attempted', async (action) => {
      if (action.success && action.type === 'restart') {
        // Refresh connection after restart
        await this.refreshConnection(action.connectorId);
      }
    });

    // Start monitoring
    healthMonitor.startMonitoring();
  }

  /**
   * Get connection statistics
   */
  getStatistics(): {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    healthy: number;
    unhealthy: number;
  } {
    const connections = Array.from(this.connections.values());
    
    return {
      total: connections.length,
      connected: connections.filter(c => c.status === 'connected').length,
      disconnected: connections.filter(c => c.status === 'disconnected').length,
      error: connections.filter(c => c.status === 'error').length,
      healthy: connections.filter(c => c.healthStatus === 'healthy').length,
      unhealthy: connections.filter(c => c.healthStatus === 'unhealthy').length
    };
  }
}

export const connectionManager = ConnectionManager.getInstance();