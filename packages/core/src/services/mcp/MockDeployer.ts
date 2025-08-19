/**
 * MockDeployer - Development mode mock implementation of MCPDeployer
 * 
 * This deployer is used when SKIP_K8S_CHECK=true to bypass all
 * Kubernetes and Docker operations during local development.
 */

import { 
  MCPDeployer, 
  DeploymentStatus, 
  DeploymentResult, 
  NetworkConfig 
} from './MCPDeployer';
import { MCPServerConnector } from '@starships/models';

/**
 * Mock implementation for development mode
 */
export class MockDeployer implements MCPDeployer {
  private mockDeployments: Map<string, DeploymentStatus> = new Map();

  constructor() {
    console.log('[MockDeployer] Initialized - Kubernetes/Docker operations will be skipped');
  }

  async deploy(starshipId: string, connector: MCPServerConnector): Promise<DeploymentResult> {
    const connectorId = connector.id;
    const serviceName = `mcp-${connectorId}`;
    
    // Store mock deployment
    this.mockDeployments.set(connectorId, {
      connectorId,
      status: 'running',
      serviceName,
      networkName: `starship-${starshipId}-network`,
      healthStatus: 'healthy',
      lastHealthCheck: new Date().toISOString(),
      deployedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      httpBridgeEnabled: true,
      internalUrl: `http://${serviceName}:3000`,
      bridgeVersion: '1.0.0',
      availableTools: [],
      availableResources: []
    });

    console.log(`[MockDeployer] Mock deployed connector ${connectorId} for starship ${starshipId}`);
    
    return {
      success: true,
      serviceName,
      containerId: `mock-container-${connectorId}`,
      networkName: `starship-${starshipId}-network`,
      deploymentTime: 100
    };
  }

  async remove(starshipId: string, connectorId: string): Promise<boolean> {
    this.mockDeployments.delete(connectorId);
    console.log(`[MockDeployer] Mock removed connector ${connectorId} from starship ${starshipId}`);
    return true;
  }

  async removeAll(starshipId: string): Promise<number> {
    const count = Array.from(this.mockDeployments.keys())
      .filter(id => id.includes(starshipId)).length;
    
    Array.from(this.mockDeployments.keys())
      .filter(id => id.includes(starshipId))
      .forEach(id => this.mockDeployments.delete(id));
    
    console.log(`[MockDeployer] Mock removed ${count} connectors from starship ${starshipId}`);
    return count;
  }

  async getStatus(connectorId: string): Promise<DeploymentStatus | null> {
    return this.mockDeployments.get(connectorId) || null;
  }

  async getStarshipStatus(starshipId: string): Promise<DeploymentStatus[]> {
    return Array.from(this.mockDeployments.values())
      .filter(status => status.networkName?.includes(starshipId));
  }

  async restart(starshipId: string, connectorId: string): Promise<boolean> {
    const status = this.mockDeployments.get(connectorId);
    if (status) {
      status.lastUpdated = new Date().toISOString();
      console.log(`[MockDeployer] Mock restarted connector ${connectorId}`);
    }
    return !!status;
  }

  async updateEnvironment(starshipId: string, connectorId: string, env: string): Promise<boolean> {
    const status = this.mockDeployments.get(connectorId);
    if (status) {
      status.lastUpdated = new Date().toISOString();
      console.log(`[MockDeployer] Mock updated environment for connector ${connectorId}`);
    }
    return !!status;
  }

  async getLogs(
    starshipId: string, 
    connectorId: string, 
    options?: { tail?: number; since?: string; follow?: boolean }
  ): Promise<string[]> {
    console.log(`[MockDeployer] Mock logs requested for connector ${connectorId}`);
    return [
      `[${new Date().toISOString()}] Mock MCP server started`,
      `[${new Date().toISOString()}] Listening on port 3000`,
      `[${new Date().toISOString()}] Ready to accept connections`
    ];
  }

  async checkHealth(starshipId: string, connectorId: string): Promise<{
    healthy: boolean;
    status: string;
    details?: any;
  }> {
    const deployment = this.mockDeployments.get(connectorId);
    return {
      healthy: !!deployment,
      status: deployment ? 'healthy' : 'not found',
      details: { mock: true, message: 'Development mode - health check skipped' }
    };
  }

  async ensureNetwork(config: NetworkConfig): Promise<boolean> {
    console.log(`[MockDeployer] Mock network created for starship ${config.starshipId}`);
    return true;
  }

  async removeNetwork(starshipId: string): Promise<boolean> {
    console.log(`[MockDeployer] Mock network removed for starship ${starshipId}`);
    return true;
  }

  async listDeployments(): Promise<DeploymentStatus[]> {
    return Array.from(this.mockDeployments.values());
  }

  async getMetrics(starshipId?: string): Promise<{
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
  }> {
    const deployments = starshipId 
      ? Array.from(this.mockDeployments.values()).filter(d => d.networkName?.includes(starshipId))
      : Array.from(this.mockDeployments.values());

    return {
      totalDeployments: deployments.length,
      runningContainers: deployments.filter(d => d.status === 'running').length,
      healthyContainers: deployments.filter(d => d.healthStatus === 'healthy').length,
      errorContainers: 0,
      networkCount: 1,
      averageStartupTime: 100,
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0
      }
    };
  }
}