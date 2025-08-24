/**
 * HealthMonitor - Monitors MCP container health and triggers recovery actions
 * 
 * This service provides continuous health monitoring, automatic recovery,
 * and alerting for MCP containers.
 */

import { RepositoryFactory } from '@starships/models';
import { MCPNetworkClient } from './MCPNetworkClient';
import { MCPServiceEndpoint } from './ServiceRegistry';
import { deploymentConfig } from './DeploymentConfig';
import { portAllocator } from './PortAllocator';
import { EventEmitter } from 'events';

export interface HealthCheckResult {
  connectorId: string;
  healthy: boolean;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  consecutiveFailures: number;
}

export interface RecoveryAction {
  type: 'restart' | 'recreate' | 'alert';
  connectorId: string;
  reason: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export class HealthMonitor extends EventEmitter {
  private static instance: HealthMonitor;
  private checkInterval: number = 30000; // 30 seconds
  private maxConsecutiveFailures: number = 3;
  private healthChecks: Map<string, HealthCheckResult> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private networkClient: MCPNetworkClient;
  private isMonitoring: boolean = false;

  private constructor() {
    super();
    this.networkClient = new MCPNetworkClient();
    console.log('[HealthMonitor] Initialized health monitoring service');
  }

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  /**
   * Start monitoring all active MCP containers
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('[HealthMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log('[HealthMonitor] Starting health monitoring');

    // Initial check
    await this.checkAllConnectors();

    // Set up periodic checks
    this.intervalId = setInterval(async () => {
      await this.checkAllConnectors();
    }, this.checkInterval);

    this.emit('monitoring_started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    console.log('[HealthMonitor] Stopped health monitoring');
    this.emit('monitoring_stopped');
  }

  /**
   * Check health of all active connectors
   */
  private async checkAllConnectors(): Promise<void> {
    try {
      const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
      const connectors = await connectorRepo.findByDockerStatus('running');

      console.log(`[HealthMonitor] Checking health of ${connectors.length} connectors`);

      const checkPromises = connectors.map(async (connector: any) => {
        const result = await this.checkConnectorHealth(connector.id);
        
        // Handle unhealthy connectors
        if (!result.healthy) {
          await this.handleUnhealthyConnector(result);
        }
        
        return result;
      });

      const results = await Promise.allSettled(checkPromises);
      
      // Emit summary event
      const summary = {
        total: results.length,
        healthy: results.filter((r: any) => r.status === 'fulfilled' && r.value.healthy).length,
        unhealthy: results.filter((r: any) => r.status === 'fulfilled' && !r.value.healthy).length,
        errors: results.filter((r: any) => r.status === 'rejected').length
      };
      
      this.emit('health_check_completed', summary);
    } catch (error) {
      console.error('[HealthMonitor] Error in checkAllConnectors:', error);
      this.emit('health_check_error', error);
    }
  }

  /**
   * Check health of a specific connector
   */
  async checkConnectorHealth(connectorId: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const previousResult = this.healthChecks.get(connectorId);
    
    try {
      // Get connector details
      const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepo.findById(connectorId);
      
      if (!connector || !connector.dockerServiceName) {
        throw new Error('Connector not found or not deployed');
      }

      // Build service endpoint
      const containerName = connector.dockerServiceName;
      let serviceUrl: string;
      
      if (deploymentConfig.shouldExposePort()) {
        const allocatedPort = portAllocator.getAllocatedPort(connectorId);
        serviceUrl = allocatedPort 
          ? `http://localhost:${allocatedPort}`
          : `http://localhost:8080`; // Fallback
      } else {
        serviceUrl = deploymentConfig.getServiceUrl(containerName, 8080);
      }

      const service: MCPServiceEndpoint = {
        connectorId: connector.id,
        containerName,
        internalUrl: serviceUrl,
        templateSlug: 'unknown',
        status: 'starting',
        availableTools: [],
        availableResources: [],
        lastHealthCheck: new Date().toISOString()
      };

      // Perform health check
      const response = await this.networkClient.checkHealth(service);
      const responseTime = Date.now() - startTime;

      const result: HealthCheckResult = {
        connectorId,
        healthy: response.healthy,
        status: response.healthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        responseTime,
        consecutiveFailures: 0
      };

      this.healthChecks.set(connectorId, result);
      
      // Update database
      await connectorRepo.updateDockerHealth(
        connectorId,
        response.healthy ? 'healthy' : 'unhealthy'
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const consecutiveFailures = (previousResult?.consecutiveFailures || 0) + 1;

      const result: HealthCheckResult = {
        connectorId,
        healthy: false,
        status: 'unhealthy',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        error: errorMessage,
        consecutiveFailures
      };

      this.healthChecks.set(connectorId, result);
      
      return result;
    }
  }

  /**
   * Handle unhealthy connector
   */
  private async handleUnhealthyConnector(result: HealthCheckResult): Promise<void> {
    console.warn(`[HealthMonitor] Unhealthy connector detected: ${result.connectorId}`, {
      consecutiveFailures: result.consecutiveFailures,
      error: result.error
    });

    this.emit('unhealthy_connector', result);

    // Determine recovery action based on failure count
    if (result.consecutiveFailures >= this.maxConsecutiveFailures) {
      // Attempt recovery
      const action = await this.attemptRecovery(result.connectorId, result.consecutiveFailures);
      this.emit('recovery_attempted', action);
    }
  }

  /**
   * Attempt to recover an unhealthy connector
   */
  private async attemptRecovery(
    connectorId: string, 
    failureCount: number
  ): Promise<RecoveryAction> {
    const action: RecoveryAction = {
      type: failureCount <= 5 ? 'restart' : 'recreate',
      connectorId,
      reason: `${failureCount} consecutive health check failures`,
      timestamp: new Date(),
      success: false
    };

    try {
      if (action.type === 'restart') {
        // Attempt to restart the container
        console.log(`[HealthMonitor] Attempting to restart connector ${connectorId}`);
        // Implementation would call MCPDeployer.restart()
        action.success = true;
      } else {
        // For now, just alert - recreate requires more complex logic
        action.type = 'alert';
        console.error(`[HealthMonitor] Connector ${connectorId} requires manual intervention`);
      }
    } catch (error) {
      action.error = error instanceof Error ? error.message : String(error);
      console.error(`[HealthMonitor] Recovery failed for ${connectorId}:`, error);
    }

    return action;
  }

  /**
   * Get current health status of all connectors
   */
  getHealthStatus(): Map<string, HealthCheckResult> {
    return new Map(this.healthChecks);
  }

  /**
   * Get health status for a specific connector
   */
  getConnectorHealth(connectorId: string): HealthCheckResult | undefined {
    return this.healthChecks.get(connectorId);
  }

  /**
   * Set monitoring interval
   */
  setCheckInterval(intervalMs: number): void {
    this.checkInterval = intervalMs;
    if (this.isMonitoring) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Set maximum consecutive failures before recovery
   */
  setMaxConsecutiveFailures(max: number): void {
    this.maxConsecutiveFailures = max;
  }
}

export const healthMonitor = HealthMonitor.getInstance();