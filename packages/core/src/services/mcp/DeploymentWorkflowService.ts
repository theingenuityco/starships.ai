/**
 * DeploymentWorkflowService - Handles real-time MCP server deployment workflows
 * 
 * This service orchestrates the entire deployment process from connector creation
 * to container deployment, health monitoring, and status tracking.
 */

import { MCPServerConnector, MCPServerConnectorRepository, MCPServerOptionRepository } from '@starships/models';
import { MCPDeployer, DeploymentResult, DeploymentStatus } from './MCPDeployer';
import { DockerComposeDeployer } from './DockerComposeDeployer';
import { getDockerServiceTemplate, isHttpBridgeTemplate, getHttpBridgeTemplate, setHttpBridgeEnabled, getTemplateForDeployment } from './DockerServiceTemplate';
import { serviceRegistry } from './ServiceRegistry';
import { CapabilitySyncService } from './CapabilitySyncService';
import { bridgeMonitoringService } from './BridgeMonitoringService';

export interface DeploymentWorkflowOptions {
  starshipId: string;
  templateId: string;
  apiKeys: Record<string, string>;
  userId?: string;
}

export interface WorkflowResult {
  success: boolean;
  connectorId?: string;
  serviceName?: string;
  deploymentTime?: number;
  errorMessage?: string;
  rollbackRequired?: boolean;
}

export interface DeploymentNotification {
  type: 'deployment_started' | 'deployment_success' | 'deployment_failed' | 'health_check_failed';
  connectorId: string;
  starshipId: string;
  serviceName?: string;
  message: string;
  timestamp: string;
  metadata?: any;
}

/**
 * Real-time deployment workflow service
 */
export class DeploymentWorkflowService {
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private mcpServerOptionRepo: MCPServerOptionRepository;
  private deployer: MCPDeployer;
  private capabilitySync: CapabilitySyncService;
  private notificationCallbacks: ((notification: DeploymentNotification) => void)[] = [];
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    mcpConnectorRepo?: MCPServerConnectorRepository,
    mcpServerOptionRepo?: MCPServerOptionRepository,
    deployer?: MCPDeployer
  ) {
    this.mcpConnectorRepo = mcpConnectorRepo || new MCPServerConnectorRepository();
    this.mcpServerOptionRepo = mcpServerOptionRepo || new MCPServerOptionRepository();
    this.deployer = deployer || new DockerComposeDeployer();
    this.capabilitySync = new CapabilitySyncService(this.mcpConnectorRepo);
  }

  /**
   * Main deployment workflow - handles the complete process
   * This is the entry point for real-time MCP server deployment
   */
  async handleMCPServerSelection(options: DeploymentWorkflowOptions): Promise<WorkflowResult> {
    const startTime = Date.now();
    const { starshipId, templateId, apiKeys, userId } = options;

    console.log(`[DeploymentWorkflow] Starting deployment for template ${templateId} on starship ${starshipId}`);

    try {
      // 1. Create connector instance with pending Docker status
      const connector = await this.createConnectorInstance(starshipId, templateId, apiKeys);
      
      // 2. Send deployment started notification
      this.sendNotification({
        type: 'deployment_started',
        connectorId: connector.id,
        starshipId,
        message: `Starting deployment of ${templateId} on starship ${starshipId}`,
        timestamp: new Date().toISOString(),
        metadata: { userId, templateId }
      });

      // 3. Get template info and determine deployment type based on feature flag
      const template = await this.getTemplate(templateId);
      const dockerTemplate = getTemplateForDeployment(template.slug);
      const useHttpBridge = dockerTemplate && isHttpBridgeTemplate(dockerTemplate);
      
      // Generate service names based on deployment type
      const serviceName = useHttpBridge ? 
        `mcp-${starshipId}-${template.slug}-http` : 
        `mcp-${starshipId}-${template.slug}`;
      const networkName = `starship-${starshipId}`;
      const internalUrl = useHttpBridge ? `http://${serviceName}:8080` : null;

      // 4. Update connector with Docker info and HTTP bridge details
      await this.updateConnectorDockerInfo(connector.id, {
        dockerServiceName: serviceName,
        dockerNetworkName: networkName,
        dockerStatus: 'building',
        httpBridgeEnabled: useHttpBridge || false,
        internalUrl: internalUrl || undefined,
        bridgeVersion: useHttpBridge ? '1.0.0' : undefined
      });

      // 5. Deploy container using MCPDeployer
      const deploymentResult = await this.deployer.deploy(starshipId, connector);

      if (!deploymentResult.success) {
        // Deployment failed - update status and send notification
        await this.updateConnectorDockerInfo(connector.id, {
          dockerStatus: 'error',
          dockerErrorMessage: deploymentResult.errorMessage
        });

        this.sendNotification({
          type: 'deployment_failed',
          connectorId: connector.id,
          starshipId,
          serviceName,
          message: `Deployment failed: ${deploymentResult.errorMessage}`,
          timestamp: new Date().toISOString(),
          metadata: { error: deploymentResult.errorMessage }
        });

        return {
          success: false,
          connectorId: connector.id,
          errorMessage: deploymentResult.errorMessage,
          rollbackRequired: true,
          deploymentTime: Date.now() - startTime
        };
      }

      // 6. Update connector with successful deployment info
      await this.updateConnectorDockerInfo(connector.id, {
        dockerStatus: 'running',
        dockerContainerId: deploymentResult.containerId,
        dockerHealthStatus: 'starting'
      });

      // 7. Start health monitoring
      await this.startHealthMonitoring(connector.id);

      // 8. Start monitoring and observability for HTTP bridge deployments
      if (useHttpBridge) {
        try {
          console.log(`[DeploymentWorkflow] Starting monitoring for HTTP bridge connector ${connector.id}`);
          await bridgeMonitoringService.startMonitoring(connector.id);
        } catch (error) {
          console.error(`[DeploymentWorkflow] Failed to start monitoring for ${connector.id}:`, error);
        }

        // Schedule initial capability sync after a brief startup delay
        setTimeout(async () => {
          try {
            console.log(`[DeploymentWorkflow] Starting capability synchronization for HTTP bridge connector ${connector.id}`);
            await this.capabilitySync.startCapabilitySync(connector.id);
          } catch (error) {
            console.error(`[DeploymentWorkflow] Failed to start capability sync for ${connector.id}:`, error);
          }
        }, 15000); // 15 second delay for container startup
      }

      // 9. Send success notification
      this.sendNotification({
        type: 'deployment_success',
        connectorId: connector.id,
        starshipId,
        serviceName: deploymentResult.serviceName,
        message: `Successfully deployed ${template.slug} ${useHttpBridge ? 'HTTP bridge' : 'MCP server'}`,
        timestamp: new Date().toISOString(),
        metadata: { 
          containerId: deploymentResult.containerId,
          networkName: deploymentResult.networkName,
          deploymentTime: deploymentResult.deploymentTime,
          httpBridgeEnabled: useHttpBridge,
          internalUrl: internalUrl
        }
      });

      const totalTime = Date.now() - startTime;
      console.log(`[DeploymentWorkflow] Successfully completed deployment in ${totalTime}ms`);

      return {
        success: true,
        connectorId: connector.id,
        serviceName: deploymentResult.serviceName,
        deploymentTime: totalTime
      };

    } catch (error) {
      console.error(`[DeploymentWorkflow] Deployment failed:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      const totalTime = Date.now() - startTime;

      return {
        success: false,
        errorMessage,
        deploymentTime: totalTime,
        rollbackRequired: true
      };
    }
  }

  /**
   * Create connector instance with Docker-specific initial state
   */
  private async createConnectorInstance(
    starshipId: string, 
    templateId: string, 
    apiKeys: Record<string, string>
  ): Promise<MCPServerConnector> {
    console.log(`[DeploymentWorkflow] Creating connector instance for ${templateId}`);

    const connector = await this.mcpConnectorRepo.createFromTemplate(
      starshipId,
      templateId,
      JSON.stringify(apiKeys)
    );

    // Update with initial Docker status
    const updatedConnector = await this.mcpConnectorRepo.updateDockerStatus(
      connector.id,
      'pending',
      {
        // Will be set during deployment
      }
    );

    if (!updatedConnector) {
      throw new Error('Failed to update connector with Docker status');
    }

    return updatedConnector;
  }

  /**
   * Get template information (mock implementation - should integrate with repository)
   */
  private async getTemplate(templateId: string): Promise<{ slug: string; name: string }> {
    // Look up the template from the database using the templateId
    const template = await this.mcpServerOptionRepo.findById(templateId);
    if (!template) {
      throw new Error(`MCP server template not found: ${templateId}`);
    }
    
    // Handle missing slug field (defensive coding for incomplete migrations)
    let slug = template.slug;
    if (!slug) {
      console.warn(`[DeploymentWorkflow] Template ${templateId} missing slug, generating from name: ${template.name}`);
      
      // Map common template names to their correct Docker template slugs
      const nameToSlugMap: Record<string, string> = {
        'brave search': 'brave',
        'github': 'github',
        'puppeteer': 'puppeteer',
        'puppeteer web automation': 'puppeteer',
        'filesystem': 'filesystem',
        'postgres': 'postgres',
        'postgresql': 'postgres',
        'sqlite': 'sqlite'
      };
      
      const normalizedName = template.name.toLowerCase();
      slug = nameToSlugMap[normalizedName] || normalizedName.replace(/\s+/g, '-');
    }
    
    console.log(`[DeploymentWorkflow] Using template slug: ${slug} for ${template.name}`);
    
    // Verify we have a Docker service template for this slug
    const dockerTemplate = getDockerServiceTemplate(slug);
    if (!dockerTemplate) {
      throw new Error(`No Docker service template found for slug: ${slug}. Available templates: ${Object.keys(this.getAvailableTemplates()).join(', ')}`);
    }

    return {
      slug: slug,
      name: template.name
    };
  }

  private getAvailableTemplates(): Record<string, any> {
    // This is a helper method to show what templates are available
    // We'll import the template mapping from DockerServiceTemplate
    return {
      'github': 'GitHub MCP Server',
      'puppeteer': 'Puppeteer MCP Server', 
      'filesystem': 'Filesystem MCP Server',
      'postgres': 'PostgreSQL MCP Server',
      'brave': 'Brave Search MCP Server',
      'sqlite': 'SQLite MCP Server'
    };
  }

  /**
   * Update connector Docker information
   */
  private async updateConnectorDockerInfo(
    connectorId: string,
    dockerInfo: {
      dockerServiceName?: string;
      dockerNetworkName?: string;
      dockerStatus?: MCPServerConnector['dockerStatus'];
      dockerContainerId?: string;
      dockerHealthStatus?: MCPServerConnector['dockerHealthStatus'];
      dockerErrorMessage?: string;
      httpBridgeEnabled?: boolean;
      internalUrl?: string;
      bridgeVersion?: string;
    }
  ): Promise<void> {
    await this.mcpConnectorRepo.updateDockerStatus(connectorId, dockerInfo.dockerStatus, {
      serviceName: dockerInfo.dockerServiceName,
      containerId: dockerInfo.dockerContainerId,
      networkName: dockerInfo.dockerNetworkName,
      errorMessage: dockerInfo.dockerErrorMessage
    });

    if (dockerInfo.dockerHealthStatus) {
      await this.mcpConnectorRepo.updateDockerHealth(connectorId, dockerInfo.dockerHealthStatus);
    }
  }

  /**
   * Start health monitoring for a deployed connector
   */
  private async startHealthMonitoring(connectorId: string): Promise<void> {
    console.log(`[DeploymentWorkflow] Starting health monitoring for connector ${connectorId}`);

    // Clear any existing health check interval
    const existingInterval = this.healthCheckIntervals.get(connectorId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Start periodic health checks every 30 seconds
    const interval = setInterval(async () => {
      try {
        await this.performHealthCheck(connectorId);
      } catch (error) {
        console.error(`[DeploymentWorkflow] Health check failed for connector ${connectorId}:`, error);
        
        // Send health check failure notification
        const connector = await this.mcpConnectorRepo.findById(connectorId);
        if (connector) {
          this.sendNotification({
            type: 'health_check_failed',
            connectorId,
            starshipId: connector.starshipId,
            serviceName: connector.dockerServiceName,
            message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date().toISOString(),
            metadata: { error: error instanceof Error ? error.message : error }
          });
        }
      }
    }, 30000); // 30 seconds

    this.healthCheckIntervals.set(connectorId, interval);
  }

  /**
   * Perform health check for a connector
   */
  private async performHealthCheck(connectorId: string): Promise<void> {
    const startTime = Date.now();
    const connector = await this.mcpConnectorRepo.findById(connectorId);
    if (!connector || !connector.starshipId) {
      throw new Error('Connector not found or missing starship ID');
    }

    // Check if this is an HTTP bridge deployment
    const template = await this.mcpServerOptionRepo.findById(connector.templateId);
    if (template) {
      const dockerTemplate = getHttpBridgeTemplate(template.slug);
      const useHttpBridge = dockerTemplate && isHttpBridgeTemplate(dockerTemplate);
      
      if (useHttpBridge) {
        // Use ServiceRegistry for HTTP bridge health checks
        const serviceEndpoint = serviceRegistry.getService(connector.starshipId, connectorId);
        
        if (serviceEndpoint) {
          const responseTime = Date.now() - startTime;
          const isHealthy = serviceEndpoint.status === 'healthy';
          
          // Record health check in monitoring service
          bridgeMonitoringService.recordHealthCheck(connectorId, isHealthy, responseTime);
          
          // ServiceRegistry automatically updates health status via its monitoring
          await this.mcpConnectorRepo.updateDockerHealth(
            connectorId, 
            isHealthy ? 'healthy' : 'unhealthy'
          );
          
          // Sync capabilities if available
          if (serviceEndpoint.availableTools || serviceEndpoint.availableResources) {
            await this.syncMCPCapabilities(connectorId, serviceEndpoint);
          }
          
          console.log(`[DeploymentWorkflow] HTTP bridge health check for ${connectorId}: ${serviceEndpoint.status} (${responseTime}ms)`);
          return;
        }
      }
    }

    // Fallback to legacy health check for stdio deployments
    const healthResult = await this.deployer.checkHealth(connector.starshipId, connectorId);
    const responseTime = Date.now() - startTime;
    await this.mcpConnectorRepo.updateDockerHealth(connectorId, healthResult.healthy ? 'healthy' : 'unhealthy');
    console.log(`[DeploymentWorkflow] Legacy health check for ${connectorId}: ${healthResult.status} (${responseTime}ms)`);
  }

  /**
   * Stop health monitoring for a connector
   */
  async stopHealthMonitoring(connectorId: string): Promise<void> {
    const interval = this.healthCheckIntervals.get(connectorId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(connectorId);
      console.log(`[DeploymentWorkflow] Stopped health monitoring for connector ${connectorId}`);
    }
  }

  /**
   * Rollback a deployment (remove connector and container)
   */
  async rollbackDeployment(connectorId: string): Promise<boolean> {
    try {
      console.log(`[DeploymentWorkflow] Rolling back deployment for connector ${connectorId}`);

      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        console.warn(`[DeploymentWorkflow] Connector ${connectorId} not found for rollback`);
        return false;
      }

      // Stop health monitoring and bridge monitoring
      await this.stopHealthMonitoring(connectorId);
      if (connector.httpBridgeEnabled) {
        bridgeMonitoringService.stopMonitoring(connectorId);
      }

      // Remove container if it exists
      if (connector.starshipId) {
        await this.deployer.remove(connector.starshipId, connectorId);
      }

      // Remove connector from database
      await this.mcpConnectorRepo.delete(connectorId);

      console.log(`[DeploymentWorkflow] Successfully rolled back deployment for connector ${connectorId}`);
      return true;
    } catch (error) {
      console.error(`[DeploymentWorkflow] Rollback failed for connector ${connectorId}:`, error);
      return false;
    }
  }

  /**
   * Get deployment status for a connector
   */
  async getDeploymentStatus(connectorId: string): Promise<DeploymentStatus | null> {
    try {
      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        return null;
      }

      // Get additional status from deployer if available
      const deployerStatus = await this.deployer.getStatus(connectorId);

      // Get service registry information for HTTP bridge deployments
      let serviceEndpoint = null;
      if (connector.httpBridgeEnabled && connector.starshipId) {
        serviceEndpoint = serviceRegistry.getService(connector.starshipId, connectorId);
      }

      return {
        connectorId,
        status: connector.dockerStatus || 'pending',
        containerId: connector.dockerContainerId,
        serviceName: connector.dockerServiceName,
        networkName: connector.dockerNetworkName,
        healthStatus: connector.dockerHealthStatus,
        lastHealthCheck: connector.dockerLastHealthCheck,
        errorMessage: connector.dockerErrorMessage,
        lastUpdated: connector.updatedAt,
        // HTTP bridge specific fields
        httpBridgeEnabled: connector.httpBridgeEnabled || false,
        internalUrl: connector.internalUrl,
        bridgeVersion: connector.bridgeVersion,
        availableTools: serviceEndpoint?.availableTools || [],
        availableResources: serviceEndpoint?.availableResources || [],
        lastToolsSync: connector.lastToolsSync,
        ...deployerStatus
      };
    } catch (error) {
      console.error(`[DeploymentWorkflow] Failed to get deployment status for ${connectorId}:`, error);
      return null;
    }
  }

  /**
   * Sync MCP capabilities from HTTP bridge endpoint (now uses CapabilitySyncService)
   */
  private async syncMCPCapabilities(connectorId: string, serviceEndpoint?: any): Promise<void> {
    try {
      console.log(`[DeploymentWorkflow] Triggering capability sync for connector ${connectorId}`);
      
      // Use the dedicated CapabilitySyncService for robust capability synchronization
      const result = await this.capabilitySync.syncConnectorCapabilities(connectorId);
      
      if (result.success) {
        console.log(`[DeploymentWorkflow] Successfully synced ${result.toolsCount} tools and ${result.resourcesCount} resources for connector ${connectorId}`);
      } else {
        console.error(`[DeploymentWorkflow] Capability sync failed for connector ${connectorId}: ${result.errorMessage}`);
      }
    } catch (error) {
      console.error(`[DeploymentWorkflow] Failed to sync capabilities for connector ${connectorId}:`, error);
    }
  }

  /**
   * Add notification callback
   */
  addNotificationCallback(callback: (notification: DeploymentNotification) => void): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Remove notification callback
   */
  removeNotificationCallback(callback: (notification: DeploymentNotification) => void): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Send notification to all registered callbacks
   */
  private sendNotification(notification: DeploymentNotification): void {
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('[DeploymentWorkflow] Notification callback error:', error);
      }
    });
  }

  /**
   * Cleanup - stop all health monitoring
   */
  async cleanup(): Promise<void> {
    console.log('[DeploymentWorkflow] Cleaning up health monitoring intervals');
    
    for (const [connectorId, interval] of this.healthCheckIntervals) {
      clearInterval(interval);
    }
    
    this.healthCheckIntervals.clear();
    this.notificationCallbacks.length = 0;
  }
}