/**
 * DockerComposeDeployer - Docker Compose implementation of MCPDeployer
 * 
 * Manages MCP server deployments using Docker Compose with dynamic service generation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MCPServerConnector, MCPServerOption } from '@starships/models';
import { 
  MCPDeployer, 
  DeploymentStatus, 
  DeploymentResult, 
  NetworkConfig 
} from './MCPDeployer';
import { NetworkManager } from '../docker/NetworkManager';
import { 
  DockerServiceTemplate, 
  getDockerServiceTemplate, 
  getAllDockerServiceTemplates,
  buildVolumeMapping,
  getDefaultResourceLimits,
  getHttpBridgeTemplate,
  isHttpBridgeTemplate
} from './DockerServiceTemplate';
import { serviceRegistry } from './ServiceRegistry';
import { deploymentConfig } from './DeploymentConfig';
import { portAllocator } from './PortAllocator';
import { MCPToolGatewayDB } from './MCPToolGatewayDB';
import { RepositoryFactory } from '@starships/models';

const execAsync = promisify(exec);

interface DockerComposeService {
  image: string;
  container_name: string;
  command?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  networks: string[];
  ports?: string[]; // Added ports mapping
  restart: string;
  labels: Record<string, string>;
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period?: string;
  };
  deploy?: {
    resources: {
      limits: {
        cpus: string;
        memory: string;
      };
    };
  };
}

interface DockerComposeFile {
  version: string;
  services: Record<string, DockerComposeService>;
  networks: Record<string, {
    external?: boolean;
    driver?: string;
    name?: string;
  }>;
}

/**
 * Docker Compose implementation of MCP deployment
 */
export class DockerComposeDeployer implements MCPDeployer {
  private static readonly COMPOSE_DIR = './data/docker/compose-files';
  private static readonly VOLUME_BASE = './data/starships';
  private networkManager: NetworkManager;
  private templateCache: Map<string, MCPServerOption> = new Map();

  constructor() {
    this.networkManager = new NetworkManager();
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(DockerComposeDeployer.COMPOSE_DIR, { recursive: true });
      await fs.mkdir(DockerComposeDeployer.VOLUME_BASE, { recursive: true });
    } catch (error) {
      console.error('[DockerComposeDeployer] Failed to create directories:', error);
    }
  }

  /**
   * Get template information from cache or repository
   */
  private async getTemplate(templateId: string): Promise<MCPServerOption> {
    // Check cache first
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId)!;
    }

    // TODO: In a real implementation, this would query the MCPServerOptionRepository
    // For now, we'll use a simplified approach to resolve template slugs
    
    // Try common template ID to slug mappings first
    const templateIdToSlugMap: Record<string, string> = {
      '54f39175-4d64-49d1-90b5-d48491ce8cf2': 'brave', // Brave Search template
      'e054bf0a-5f93-4b0a-bf3e-aaade290118f': 'puppeteer', // Puppeteer template
      '9e1b6668-d3fa-47fb-9447-b8e1e9dabd9f': 'sequentialthinking', // Sequential Thinking template
      'edaaba13-d587-406d-b300-59e6b3b8aa9f': 'memory', // Memory template
      // Add other known mappings here as needed
    };
    
    let slug = templateIdToSlugMap[templateId];
    
    // If not in mapping, try the old pattern-based approach as fallback
    if (!slug) {
      slug = templateId.replace('-template', '');
    }
    
    // Verify we have a Docker service template for this slug
    const dockerTemplate = getDockerServiceTemplate(slug);
    if (!dockerTemplate) {
      const availableTemplates = Object.keys(getAllDockerServiceTemplates()).join(', ');
      throw new Error(`No Docker service template found for slug: ${slug}. Available: ${availableTemplates}`);
    }

    // Create a basic MCPServerOption based on the Docker template
    const template: MCPServerOption = {
      id: templateId,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug: slug,
      command: dockerTemplate.command?.[0] || 'npx',
      args: dockerTemplate.command?.slice(1) || [],
      env: JSON.stringify({}), // Environment will be provided by connector
    };

    // Cache for future use
    this.templateCache.set(templateId, template);
    return template;
  }

  /**
   * Generate Docker service name
   */
  private generateServiceName(starshipId: string, templateSlug: string, useHttpBridge: boolean = true): string {
    const suffix = useHttpBridge ? '-http' : '';
    return `mcp-${starshipId}-${templateSlug}${suffix}`;
  }

  /**
   * Generate network name
   */
  private generateNetworkName(starshipId: string): string {
    return `starship-${starshipId}`;
  }

  /**
   * Get compose file path
   */
  private getComposeFilePath(starshipId: string): string {
    return path.join(DockerComposeDeployer.COMPOSE_DIR, `starship-${starshipId}.yml`);
  }

  /**
   * Load existing compose file or create new one
   */
  private async loadOrCreateComposeFile(starshipId: string): Promise<DockerComposeFile> {
    const filePath = this.getComposeFilePath(starshipId);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return yaml.load(content) as DockerComposeFile;
    } catch (error) {
      // File doesn't exist, create new compose structure
      const networkName = this.generateNetworkName(starshipId);
      
      return {
        version: '3.8',
        services: {},
        networks: {
          [networkName]: {
            external: true,
            name: networkName,
          },
        },
      };
    }
  }

  /**
   * Save compose file
   */
  private async saveComposeFile(starshipId: string, compose: DockerComposeFile): Promise<void> {
    const filePath = this.getComposeFilePath(starshipId);
    const yamlContent = yaml.dump(compose, { 
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    
    await fs.writeFile(filePath, yamlContent, 'utf8');
    console.log(`[DockerComposeDeployer] Saved compose file: ${filePath}`);
  }

  /**
   * Build environment variables for service deployment
   */
  private buildEnvironmentVariables(
    dockerTemplate: DockerServiceTemplate, 
    userEnv: Record<string, string>,
    useHttpBridge: boolean
  ): Record<string, string> {
    if (useHttpBridge && dockerTemplate.bridgeConfig) {
      // HTTP Bridge deployment - merge bridge config with user environment
      const bridgeEnvironment = {
        // Bridge configuration from template
        ...dockerTemplate.environment,
        
        // User-provided environment variables (API keys, etc.)
        ...userEnv
      };
      
      console.log(`[DockerComposeDeployer] HTTP Bridge environment:`, bridgeEnvironment);
      return bridgeEnvironment;
    } else {
      // Legacy stdio deployment - traditional merge
      const environment = {
        ...dockerTemplate.environment,
        ...userEnv
      };
      
      console.log(`[DockerComposeDeployer] Legacy environment:`, environment);
      return environment;
    }
  }

  /**
   * Build Docker service configuration using Docker service templates
   */
  private async buildServiceConfig(
    starshipId: string,
    connector: MCPServerConnector,
    template: MCPServerOption
  ): Promise<DockerComposeService> {
    // Get Docker service template - prefer HTTP bridge version
    const dockerTemplate = getHttpBridgeTemplate(template.slug);
    if (!dockerTemplate) {
      throw new Error(`No Docker service template found for slug: ${template.slug}`);
    }
    
    const useHttpBridge = isHttpBridgeTemplate(dockerTemplate);
    const serviceName = this.generateServiceName(starshipId, template.slug, useHttpBridge);
    const networkName = this.generateNetworkName(starshipId);
    
    // Parse environment variables from connector (handle double-encoded JSON)
    let userEnv: Record<string, string> = {};
    try {
      const parsedEnv = JSON.parse(connector.env || '{}');
      // Check if the result is a string (double-encoded JSON)
      if (typeof parsedEnv === 'string') {
        userEnv = JSON.parse(parsedEnv);
      } else if (typeof parsedEnv === 'object' && parsedEnv !== null) {
        userEnv = parsedEnv;
      }
      console.log(`[DockerComposeDeployer] Parsed user environment:`, userEnv);
    } catch (error) {
      console.warn(`[DockerComposeDeployer] Failed to parse environment variables:`, error);
      userEnv = {};
    }
    
    // Build environment variables based on template type
    const environment = this.buildEnvironmentVariables(dockerTemplate, userEnv, useHttpBridge);

    // Build volumes using template configuration
    const volumes = buildVolumeMapping(dockerTemplate, starshipId);

    // Get resource limits (use template limits or defaults)
    const resourceLimits = dockerTemplate.resourceLimits || getDefaultResourceLimits();

    // Build labels combining template labels with standard ones
    const labels = {
      'starship.id': starshipId,
      'connector.id': connector.id,
      'template.slug': template.slug,
      'managed-by': 'starships',
      'created-at': new Date().toISOString(),
      ...dockerTemplate.labels
    };

    const service: DockerComposeService = {
      image: dockerTemplate.image,
      container_name: serviceName,
      command: dockerTemplate.command,
      environment,
      volumes,
      networks: [networkName],
      restart: 'unless-stopped',
      labels,
      healthcheck: dockerTemplate.healthcheck || {
        test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
        interval: '30s',
        timeout: '10s',
        retries: 3,
        start_period: '40s',
      },
      deploy: {
        resources: {
          limits: resourceLimits,
        },
      },
    };

    // Add port mapping for development environment
    if (deploymentConfig.shouldExposePort()) {
      const allocatedPort = await portAllocator.allocatePort(connector.id);
      const internalPort = useHttpBridge ? '8080' : (dockerTemplate.ports?.[0] || '3000');
      service.ports = [`${allocatedPort}:${internalPort}`];
      
      console.log(`[DockerComposeDeployer] Exposing port ${allocatedPort} for ${serviceName}`);
    }

    return service;
  }

  /**
   * Update service registry for container discovery
   */
  private async updateServiceRegistry(
    starshipId: string, 
    endpoint: any
  ): Promise<void> {
    try {
      await serviceRegistry.registerService(starshipId, endpoint);
      console.log(`[DockerComposeDeployer] Registered service in registry: ${endpoint.containerName}`);
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to register service:`, error);
    }
  }

  /**
   * Deploy a MCP server connector
   */
  async deploy(starshipId: string, connector: MCPServerConnector): Promise<DeploymentResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[DockerComposeDeployer] Starting deployment for connector ${connector.id} on starship ${starshipId}`);

      // Get template information
      const template = await this.getTemplate(connector.templateId);
      
      // Determine if we're using HTTP bridge
      const dockerTemplate = getHttpBridgeTemplate(template.slug);
      if (!dockerTemplate) {
        throw new Error(`No Docker service template found for slug: ${template.slug}`);
      }
      const useHttpBridge = isHttpBridgeTemplate(dockerTemplate);
      
      const serviceName = this.generateServiceName(starshipId, template.slug, useHttpBridge);
      const networkName = this.generateNetworkName(starshipId);

      // Ensure network exists
      const networkCreated = await this.ensureNetwork({
        networkName,
        starshipId,
        driver: 'bridge',
        isolated: true,
      });

      if (!networkCreated) {
        throw new Error('Failed to create or ensure network');
      }

      // Create volume directories
      await this.createVolumeDirectories(starshipId, template.slug);

      // Load or create compose file
      const compose = await this.loadOrCreateComposeFile(starshipId);

      // Build service configuration
      const serviceConfig = await this.buildServiceConfig(starshipId, connector, template);
      
      // Add service to compose file
      compose.services[serviceName] = serviceConfig;

      // Save updated compose file
      await this.saveComposeFile(starshipId, compose);

      // Deploy the service using docker-compose
      const composeFilePath = this.getComposeFilePath(starshipId);
      const deployCommand = `docker-compose -f ${composeFilePath} up -d --no-recreate ${serviceName}`;
      
      console.log(`[DockerComposeDeployer] Executing: ${deployCommand}`);
      const { stdout, stderr } = await execAsync(deployCommand);
      
      if (stderr && !stderr.includes('up-to-date')) {
        console.warn(`[DockerComposeDeployer] Deploy warning: ${stderr}`);
      }

      // Get container ID
      const containerId = await this.getContainerId(serviceName);
      
      // Update service registry for HTTP bridge containers
      if (useHttpBridge) {
        await this.updateServiceRegistry(starshipId, {
          connectorId: connector.id,
          containerName: serviceName,
          internalUrl: `http://${serviceName}:8080`,
          templateSlug: template.slug,
          status: 'starting',
          lastHealthCheck: new Date().toISOString()
        });
      }
      
      // Update connector with Docker deployment info
      const allocatedPort = deploymentConfig.shouldExposePort() 
        ? portAllocator.getAllocatedPort(connector.id) 
        : undefined;
      
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      await connectorRepository.updateDockerStatus(connector.id, 'running', {
        containerId,
        serviceName,
        networkName,
        imageName: useHttpBridge ? 'starships/mcp-http-bridge:latest' : (dockerTemplate?.image || 'unknown')
      });
      
      // Store allocated port if in development
      if (allocatedPort) {
        await connectorRepository.update(connector.id, {
          dockerPort: allocatedPort
        });
      }
      
      // Wait for container to be healthy and update status
      console.log(`[DockerComposeDeployer] Waiting for container ${serviceName} to be healthy...`);
      const isHealthy = await this.waitForContainerHealth(serviceName, connector.id);
      
      if (isHealthy) {
        await connectorRepository.updateDockerHealth(connector.id, 'healthy');
        console.log(`[DockerComposeDeployer] Container ${serviceName} is healthy`);
        
        // Trigger tool discovery after container is healthy
        if (useHttpBridge) {
          await this.triggerToolDiscovery(connector.id, starshipId);
        }
      } else {
        await connectorRepository.updateDockerHealth(connector.id, 'unhealthy');
        console.warn(`[DockerComposeDeployer] Container ${serviceName} failed health check`);
      }
      
      const deploymentTime = Date.now() - startTime;
      console.log(`[DockerComposeDeployer] Successfully deployed ${serviceName} (${deploymentTime}ms)`);

      return {
        success: true,
        serviceName,
        containerId,
        networkName,
        deploymentTime,
      };

    } catch (error) {
      const deploymentTime = Date.now() - startTime;
      console.error(`[DockerComposeDeployer] Deployment failed for connector ${connector.id}:`, error);
      
      return {
        success: false,
        serviceName: this.generateServiceName(starshipId, 'unknown'),
        errorMessage: error instanceof Error ? error.message : 'Unknown deployment error',
        deploymentTime,
      };
    }
  }

  /**
   * Create volume directories for a service based on template configuration
   */
  private async createVolumeDirectories(starshipId: string, templateSlug: string): Promise<void> {
    const starshipVolumePath = path.join(DockerComposeDeployer.VOLUME_BASE, starshipId);
    
    try {
      // Ensure base starship directory exists
      await fs.mkdir(starshipVolumePath, { recursive: true });
      
      // Get Docker service template to determine required directories
      const dockerTemplate = getDockerServiceTemplate(templateSlug);
      if (dockerTemplate && dockerTemplate.volumes) {
        for (const volume of dockerTemplate.volumes) {
          // Extract directory name from volume source
          const volumeSource = volume.source.replace('{starshipId}', starshipId);
          const volumeDir = path.dirname(volumeSource);
          const targetDirName = path.basename(volumeSource);
          
          // Create the specific volume directory
          const fullVolumePath = path.join(starshipVolumePath, targetDirName);
          await fs.mkdir(fullVolumePath, { recursive: true });
          
          console.log(`[DockerComposeDeployer] Created volume directory: ${fullVolumePath}`);
        }
      }
      
      console.log(`[DockerComposeDeployer] Created volume directories for ${starshipId}/${templateSlug}`);
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to create volume directories:`, error);
      throw error;
    }
  }

  /**
   * Get container ID for a service
   */
  private async getContainerId(serviceName: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`docker ps -q --filter name=${serviceName}`);
      return stdout.trim() || undefined;
    } catch (error) {
      console.warn(`[DockerComposeDeployer] Failed to get container ID for ${serviceName}:`, error);
      return undefined;
    }
  }

  /**
   * Remove a specific connector deployment
   */
  async remove(starshipId: string, connectorId: string): Promise<boolean> {
    try {
      console.log(`[DockerComposeDeployer] Removing connector ${connectorId} from starship ${starshipId}`);

      // Load compose file
      const compose = await this.loadOrCreateComposeFile(starshipId);
      
      // Find service by connector ID
      let serviceToRemove: string | null = null;
      for (const [serviceName, service] of Object.entries(compose.services)) {
        if (service.labels?.['connector.id'] === connectorId) {
          serviceToRemove = serviceName;
          break;
        }
      }

      if (!serviceToRemove) {
        console.warn(`[DockerComposeDeployer] No service found for connector ${connectorId}`);
        return false;
      }

      // Stop and remove the service
      const composeFilePath = this.getComposeFilePath(starshipId);
      const stopCommand = `docker-compose -f ${composeFilePath} stop ${serviceToRemove}`;
      const removeCommand = `docker-compose -f ${composeFilePath} rm -f ${serviceToRemove}`;

      await execAsync(stopCommand);
      await execAsync(removeCommand);

      // Remove service from compose file
      delete compose.services[serviceToRemove];
      await this.saveComposeFile(starshipId, compose);

      // Unregister from service registry
      try {
        await serviceRegistry.unregisterService(starshipId, connectorId);
        console.log(`[DockerComposeDeployer] Unregistered service from registry: ${serviceToRemove}`);
      } catch (error) {
        console.warn(`[DockerComposeDeployer] Failed to unregister service from registry:`, error);
      }

      console.log(`[DockerComposeDeployer] Successfully removed service ${serviceToRemove}`);
      return true;

    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to remove connector ${connectorId}:`, error);
      return false;
    }
  }

  /**
   * Remove all deployments for a starship
   */
  async removeAll(starshipId: string): Promise<number> {
    try {
      console.log(`[DockerComposeDeployer] Removing all deployments for starship ${starshipId}`);

      const composeFilePath = this.getComposeFilePath(starshipId);
      
      // Check if compose file exists
      try {
        await fs.access(composeFilePath);
      } catch {
        console.log(`[DockerComposeDeployer] No compose file found for starship ${starshipId}`);
        return 0;
      }

      // Load compose file to count services
      const compose = await this.loadOrCreateComposeFile(starshipId);
      const serviceCount = Object.keys(compose.services).length;

      if (serviceCount === 0) {
        console.log(`[DockerComposeDeployer] No services to remove for starship ${starshipId}`);
        return 0;
      }

      // Stop and remove all services
      const downCommand = `docker-compose -f ${composeFilePath} down --volumes`;
      await execAsync(downCommand);

      // Remove compose file
      await fs.unlink(composeFilePath);

      // Remove network
      await this.removeNetwork(starshipId);

      // Clean up volumes
      await this.cleanupVolumes(starshipId);

      console.log(`[DockerComposeDeployer] Successfully removed ${serviceCount} services for starship ${starshipId}`);
      return serviceCount;

    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to remove all deployments for starship ${starshipId}:`, error);
      return 0;
    }
  }

  /**
   * Clean up volume directories for a starship
   */
  private async cleanupVolumes(starshipId: string): Promise<void> {
    try {
      const starshipVolumePath = path.join(DockerComposeDeployer.VOLUME_BASE, starshipId);
      await fs.rm(starshipVolumePath, { recursive: true, force: true });
      console.log(`[DockerComposeDeployer] Cleaned up volumes for starship ${starshipId}`);
    } catch (error) {
      console.warn(`[DockerComposeDeployer] Failed to cleanup volumes for starship ${starshipId}:`, error);
    }
  }

  /**
   * Get deployment status for a connector
   */
  async getStatus(connectorId: string): Promise<DeploymentStatus | null> {
    try {
      // This is a simplified implementation
      // In practice, you'd need to find the container by connector ID and get its status
      console.log(`[DockerComposeDeployer] Getting status for connector ${connectorId}`);
      
      // Mock implementation
      return {
        connectorId,
        status: 'running',
        healthStatus: 'healthy',
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to get status for connector ${connectorId}:`, error);
      return null;
    }
  }

  /**
   * Get deployment status for all connectors in a starship
   */
  async getStarshipStatus(starshipId: string): Promise<DeploymentStatus[]> {
    try {
      const compose = await this.loadOrCreateComposeFile(starshipId);
      const statuses: DeploymentStatus[] = [];

      for (const [serviceName, service] of Object.entries(compose.services)) {
        const connectorId = service.labels?.['connector.id'];
        if (connectorId) {
          statuses.push({
            connectorId,
            status: 'running', // Simplified - should check actual container status
            serviceName,
            networkName: this.generateNetworkName(starshipId),
            lastUpdated: new Date().toISOString(),
          });
        }
      }

      return statuses;
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to get starship status for ${starshipId}:`, error);
      return [];
    }
  }

  /**
   * Restart a connector
   */
  async restart(starshipId: string, connectorId: string): Promise<boolean> {
    // Implementation would find the service and restart it
    console.log(`[DockerComposeDeployer] Restart not yet implemented for connector ${connectorId}`);
    return false;
  }

  /**
   * Update environment variables
   */
  async updateEnvironment(starshipId: string, connectorId: string, env: string): Promise<boolean> {
    // Implementation would update the compose file and recreate the service
    console.log(`[DockerComposeDeployer] Environment update not yet implemented for connector ${connectorId}`);
    return false;
  }

  /**
   * Get logs from a connector
   */
  async getLogs(starshipId: string, connectorId: string, options?: any): Promise<string[]> {
    // Implementation would get logs from the container
    console.log(`[DockerComposeDeployer] Log retrieval not yet implemented for connector ${connectorId}`);
    return [];
  }

  /**
   * Check health of a connector
   */
  async checkHealth(starshipId: string, connectorId: string): Promise<{ healthy: boolean; status: string; details?: any }> {
    // Implementation would check container health
    return { healthy: true, status: 'healthy' };
  }

  /**
   * Wait for container to be healthy
   */
  private async waitForContainerHealth(serviceName: string, connectorId: string): Promise<boolean> {
    const maxAttempts = 30; // 30 attempts
    const delayMs = 2000; // 2 seconds between attempts
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check container health status
        const { stdout } = await execAsync(
          `docker inspect ${serviceName} --format='{{json .State.Health}}'`
        );
        
        const health = JSON.parse(stdout.trim());
        
        if (health && health.Status === 'healthy') {
          return true;
        } else if (health && health.Status === 'unhealthy') {
          console.warn(`[DockerComposeDeployer] Container ${serviceName} is unhealthy`);
          return false;
        }
        
        console.log(`[DockerComposeDeployer] Waiting for container health (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error) {
        // Container might not have health check, try HTTP endpoint
        if (attempt > 5) { // Give container time to start
          try {
            const allocatedPort = portAllocator.getAllocatedPort(connectorId);
            const url = allocatedPort 
              ? `http://localhost:${allocatedPort}/health`
              : `http://${serviceName}:8080/health`;
              
            const response = await fetch(url, { 
              signal: AbortSignal.timeout(3000) 
            });
            
            if (response.ok) {
              return true;
            }
          } catch (fetchError) {
            // Continue waiting
          }
        }
        
        if (attempt === maxAttempts) {
          console.error(`[DockerComposeDeployer] Health check failed for ${serviceName}:`, error);
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return false;
  }

  /**
   * Trigger tool discovery for a healthy container
   */
  private async triggerToolDiscovery(connectorId: string, starshipId: string): Promise<void> {
    try {
      console.log(`[DockerComposeDeployer] Triggering tool discovery for connector ${connectorId}`);
      
      // Use singleton instance to ensure cache consistency
      const { mcpToolGatewayDB } = await import('./MCPToolGatewayDB');
      
      // Clear cache to force fresh discovery
      mcpToolGatewayDB.clearCacheForStarship(starshipId);
      
      // Force a tool discovery by calling getToolsForStarship
      // This will populate the cache with fresh data
      const tools = await mcpToolGatewayDB.getToolsForStarship(starshipId);
      
      console.log(`[DockerComposeDeployer] Discovered ${tools.length} tools for starship ${starshipId}`);
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to trigger tool discovery:`, error);
    }
  }

  /**
   * Ensure network exists
   */
  async ensureNetwork(config: NetworkConfig): Promise<boolean> {
    try {
      return await this.networkManager.createStarshipNetwork({
        starshipId: config.starshipId,
        networkName: config.networkName,
        driver: config.driver || 'bridge',
      });
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to ensure network ${config.networkName}:`, error);
      return false;
    }
  }

  /**
   * Remove network
   */
  async removeNetwork(starshipId: string): Promise<boolean> {
    try {
      return await this.networkManager.removeStarshipNetwork(starshipId);
    } catch (error) {
      console.error(`[DockerComposeDeployer] Failed to remove network for starship ${starshipId}:`, error);
      return false;
    }
  }

  /**
   * List all deployments
   */
  async listDeployments(): Promise<DeploymentStatus[]> {
    // Implementation would list all active deployments across all starships
    console.log(`[DockerComposeDeployer] List deployments not yet implemented`);
    return [];
  }

  /**
   * Get deployment metrics
   */
  async getMetrics(starshipId?: string): Promise<any> {
    // Implementation would gather metrics from Docker
    console.log(`[DockerComposeDeployer] Metrics not yet implemented`);
    return {
      totalDeployments: 0,
      runningContainers: 0,
      healthyContainers: 0,
      errorContainers: 0,
      networkCount: 0,
      averageStartupTime: 0,
    };
  }
}