/**
 * KubernetesDeployer - Kubernetes implementation of MCPDeployer
 * 
 * Manages MCP server deployments using Kubernetes with dynamic template generation
 * from Neo4j database and intelligent defaults.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MCPServerConnector, MCPServerOption, MCPServerOptionRepository } from '@starships/models';
import { 
  MCPDeployer, 
  DeploymentStatus, 
  DeploymentResult, 
  NetworkConfig 
} from './MCPDeployer';
import { RepositoryFactory } from '@starships/models';
import * as k8s from '@kubernetes/client-node';
import PQueue from 'p-queue';

const execAsync = promisify(exec);

/**
 * Kubernetes implementation of MCP deployment
 */
export class KubernetesDeployer implements MCPDeployer {
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private deploymentQueue: PQueue;
  private templateCache: Map<string, MCPServerOption> = new Map();
  private mcpServerOptionRepo: MCPServerOptionRepository | null = null;

  constructor() {
    // Initialize Kubernetes client
    this.kc = new k8s.KubeConfig();
    
    // Try to load from default kubeconfig locations
    try {
      this.kc.loadFromDefault();
      console.log('[KubernetesDeployer] Loaded kubeconfig from default location');
    } catch (error) {
      // Fallback to in-cluster config for production
      try {
        this.kc.loadFromCluster();
        console.log('[KubernetesDeployer] Loaded in-cluster config');
      } catch (clusterError) {
        console.error('[KubernetesDeployer] Failed to load kubeconfig:', error);
        // Try to use kind cluster if available
        this.kc.loadFromString(this.getKindKubeconfig());
      }
    }
    
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    
    // Initialize deployment queue for concurrent deployments
    this.deploymentQueue = new PQueue({ 
      concurrency: 5, 
      interval: 1000, 
      intervalCap: 3 
    });
    
    console.log('[KubernetesDeployer] Initialized with Kubernetes cluster');
  }

  /**
   * Get kind kubeconfig as fallback
   */
  private getKindKubeconfig(): string {
    // This is a placeholder - in practice, read from ~/.kube/config
    // or execute `kind get kubeconfig --name starships`
    return `
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: kind-starships
contexts:
- context:
    cluster: kind-starships
    user: kind-starships
  name: kind-starships
current-context: kind-starships
users:
- name: kind-starships
  user:
    client-certificate-data: 
    client-key-data: 
`;
  }

  /**
   * Get the repository instance (lazy initialization)
   */
  private getMCPServerOptionRepo(): MCPServerOptionRepository {
    if (!this.mcpServerOptionRepo) {
      this.mcpServerOptionRepo = RepositoryFactory.getMCPServerOptionRepository();
    }
    return this.mcpServerOptionRepo;
  }

  /**
   * Get template information from cache or repository
   */
  private async getTemplate(templateId: string): Promise<MCPServerOption> {
    // Check cache first
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId)!;
    }

    // Query the repository for the actual template
    const template = await this.getMCPServerOptionRepo().findById(templateId);
    
    if (!template) {
      throw new Error(`MCP Server template not found with ID: ${templateId}`);
    }

    // Ensure the template has a valid slug
    if (!template.slug) {
      console.warn(`[KubernetesDeployer] Template ${templateId} (${template.name}) missing slug, using normalized name`);
      template.slug = template.name.toLowerCase().replace(/\s+/g, '-');
    }

    // Cache for future use
    this.templateCache.set(templateId, template);
    return template;
  }

  /**
   * Generate namespace name
   */
  private generateNamespaceName(starshipId: string): string {
    return `starship-${starshipId}`;
  }

  /**
   * Generate deployment name
   */
  private generateDeploymentName(starshipId: string, templateSlug: string): string {
    return `mcp-${templateSlug}-deployment`;
  }

  /**
   * Generate service name
   */
  private generateServiceName(starshipId: string, templateSlug: string): string {
    return `mcp-${templateSlug}-service`;
  }

  /**
   * Generate ConfigMap name
   */
  private generateConfigMapName(starshipId: string, templateSlug: string): string {
    return `mcp-${templateSlug}-config`;
  }

  /**
   * Generate PVC name
   */
  private generatePVCName(starshipId: string): string {
    return `starship-${starshipId}-storage`;
  }

  /**
   * Ensure namespace exists with resource quotas
   */
  private async ensureNamespace(starshipId: string): Promise<void> {
    const namespaceName = this.generateNamespaceName(starshipId);
    
    try {
      // Check if namespace exists
      await this.k8sApi.readNamespace(namespaceName);
      console.log(`[KubernetesDeployer] Namespace ${namespaceName} already exists`);
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        // Create namespace
        const namespace: k8s.V1Namespace = {
          metadata: {
            name: namespaceName,
            labels: {
              'app': 'starships',
              'starship': starshipId,
              'managed-by': 'starships'
            }
          }
        };
        
        await this.k8sApi.createNamespace(namespace);
        console.log(`[KubernetesDeployer] Created namespace ${namespaceName}`);
        
        // Create ResourceQuota for the namespace
        await this.createResourceQuota(namespaceName);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create ResourceQuota for namespace
   */
  private async createResourceQuota(namespaceName: string): Promise<void> {
    const resourceQuota: k8s.V1ResourceQuota = {
      metadata: {
        name: 'starship-quota',
        namespace: namespaceName
      },
      spec: {
        hard: {
          'requests.cpu': '4',
          'requests.memory': '8Gi',
          'limits.cpu': '8',
          'limits.memory': '16Gi',
          'persistentvolumeclaims': '5',
          'pods': '20'
        }
      }
    };
    
    try {
      await this.k8sApi.createNamespacedResourceQuota(namespaceName, resourceQuota);
      console.log(`[KubernetesDeployer] Created ResourceQuota for namespace ${namespaceName}`);
    } catch (error) {
      console.warn(`[KubernetesDeployer] Failed to create ResourceQuota:`, error);
    }
  }

  /**
   * Ensure PVC exists for starship
   */
  private async ensurePVC(starshipId: string): Promise<void> {
    const namespaceName = this.generateNamespaceName(starshipId);
    const pvcName = this.generatePVCName(starshipId);
    
    try {
      // Check if PVC exists
      await this.k8sApi.readNamespacedPersistentVolumeClaim(pvcName, namespaceName);
      console.log(`[KubernetesDeployer] PVC ${pvcName} already exists`);
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        // Create PVC
        const pvc: k8s.V1PersistentVolumeClaim = {
          metadata: {
            name: pvcName,
            namespace: namespaceName,
            labels: {
              'app': 'starships',
              'starship': starshipId,
              'managed-by': 'starships'
            }
          },
          spec: {
            accessModes: ['ReadWriteOnce'],  // Changed from ReadWriteMany - Kind doesn't support it
            resources: {
              requests: {
                storage: '1Gi'
              }
            },
            storageClassName: 'standard'
          }
        };
        
        await this.k8sApi.createNamespacedPersistentVolumeClaim(namespaceName, pvc);
        console.log(`[KubernetesDeployer] Created PVC ${pvcName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Deploy a MCP server connector
   */
  async deploy(starshipId: string, connector: MCPServerConnector): Promise<DeploymentResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[KubernetesDeployer] Starting deployment for connector ${connector.id} on starship ${starshipId}`);

      // Get template information
      const template = await this.getTemplate(connector.templateId);
      
      const deploymentName = this.generateDeploymentName(starshipId, template.slug);
      const serviceName = this.generateServiceName(starshipId, template.slug);
      const namespaceName = this.generateNamespaceName(starshipId);

      // Add to deployment queue
      const result = await this.deploymentQueue.add<DeploymentResult>(async (): Promise<DeploymentResult> => {
        // Ensure namespace exists
        await this.ensureNamespace(starshipId);
        
        // Ensure PVC exists (shared per starship)
        await this.ensurePVC(starshipId);
        
        // Parse environment variables from connector
        let userEnv: Record<string, string> = {};
        try {
          const parsedEnv = JSON.parse(connector.env || '{}');
          if (typeof parsedEnv === 'string') {
            userEnv = JSON.parse(parsedEnv);
          } else if (typeof parsedEnv === 'object' && parsedEnv !== null) {
            userEnv = parsedEnv;
          }
        } catch (error) {
          console.warn(`[KubernetesDeployer] Failed to parse environment variables:`, error);
        }
        
        // Create ConfigMap with environment variables (including API keys as plain text for now)
        await this.createConfigMap(starshipId, template.slug, userEnv, template);
        
        // Create Deployment
        await this.createDeployment(starshipId, template, connector);
        
        // Create Service
        await this.createService(starshipId, template.slug);
        
        // Wait for deployment to be ready
        const isReady = await this.waitForDeployment(namespaceName, deploymentName);
        
        if (!isReady) {
          throw new Error(`Deployment ${deploymentName} failed to become ready`);
        }
        
        // Update connector status in database (using existing Docker fields for K8s info)
        const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
        await connectorRepository.updateDockerStatus(connector.id, 'running', {
          containerId: deploymentName, // Use deployment name as container ID
          serviceName: serviceName,
          networkName: namespaceName,
          imageName: 'localhost:5001/starships/mcp-http-bridge:latest'
        });
        
        // Update HTTP bridge information
        await connectorRepository.update(connector.id, {
          httpBridgeEnabled: true,
          internalUrl: `http://${serviceName}.${namespaceName}.svc.cluster.local:8080`
        });
        
        // Trigger tool discovery for HTTP bridge containers
        await this.triggerToolDiscovery(connector.id, starshipId);
        
        const deploymentTime = Date.now() - startTime;
        console.log(`[KubernetesDeployer] Successfully deployed ${deploymentName} (${deploymentTime}ms)`);
        
        return {
          success: true,
          serviceName,
          containerId: deploymentName, // Use deployment name as identifier
          networkName: namespaceName,
          deploymentTime
        };
      });
      
      return result!;

    } catch (error) {
      const deploymentTime = Date.now() - startTime;
      console.error(`[KubernetesDeployer] Deployment failed for connector ${connector.id}:`, error);
      
      return {
        success: false,
        serviceName: this.generateServiceName(starshipId, 'unknown'),
        errorMessage: error instanceof Error ? error.message : 'Unknown deployment error',
        deploymentTime
      };
    }
  }

  /**
   * Create ConfigMap for environment variables
   */
  private async createConfigMap(
    starshipId: string, 
    templateSlug: string, 
    userEnv: Record<string, string>,
    template: MCPServerOption
  ): Promise<void> {
    const namespaceName = this.generateNamespaceName(starshipId);
    const configMapName = this.generateConfigMapName(starshipId, templateSlug);
    
    // Build environment variables
    const envData: Record<string, string> = {
      MCP_SERVER_CMD: template.command || 'npx',
      MCP_SERVER_ARGS: (template.args || []).join(' '),
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '30000',
      MAX_CONCURRENT_REQUESTS: '10',
      INIT_TIMEOUT: '120000',
      ...userEnv // Include user-provided environment variables (API keys, etc.)
    };
    
    const configMap: k8s.V1ConfigMap = {
      metadata: {
        name: configMapName,
        namespace: namespaceName,
        labels: {
          'app': 'mcp-connector',
          'starship': starshipId,
          'mcp': templateSlug,
          'managed-by': 'starships'
        }
      },
      data: envData
    };
    
    try {
      // Try to update if exists
      await this.k8sApi.readNamespacedConfigMap(configMapName, namespaceName);
      await this.k8sApi.replaceNamespacedConfigMap(configMapName, namespaceName, configMap);
      console.log(`[KubernetesDeployer] Updated ConfigMap ${configMapName}`);
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        // Create new
        await this.k8sApi.createNamespacedConfigMap(namespaceName, configMap);
        console.log(`[KubernetesDeployer] Created ConfigMap ${configMapName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create Deployment
   */
  private async createDeployment(
    starshipId: string,
    template: MCPServerOption,
    connector: MCPServerConnector
  ): Promise<void> {
    const namespaceName = this.generateNamespaceName(starshipId);
    const deploymentName = this.generateDeploymentName(starshipId, template.slug);
    const configMapName = this.generateConfigMapName(starshipId, template.slug);
    const pvcName = this.generatePVCName(starshipId);
    
    const deployment: k8s.V1Deployment = {
      metadata: {
        name: deploymentName,
        namespace: namespaceName,
        labels: {
          'app': 'mcp-connector',
          'starship': starshipId,
          'mcp': template.slug,
          'managed-by': 'starships'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            'app': 'mcp-connector',
            'starship': starshipId,
            'mcp': template.slug
          }
        },
        template: {
          metadata: {
            labels: {
              'app': 'mcp-connector',
              'starship': starshipId,
              'mcp': template.slug,
              'connector': connector.id
            }
          },
          spec: {
            containers: [{
              name: 'mcp-http-bridge',
              image: 'localhost:5001/starships/mcp-http-bridge:latest',
              ports: [{
                containerPort: 8080,
                protocol: 'TCP'
              }],
              envFrom: [{
                configMapRef: {
                  name: configMapName
                }
              }],
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '128Mi'
                },
                limits: {
                  cpu: '500m',
                  memory: '512Mi'
                }
              },
              volumeMounts: [{
                name: 'starship-storage',
                mountPath: '/data/starship'
              }],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8080
                },
                initialDelaySeconds: 30,
                periodSeconds: 30,
                timeoutSeconds: 10,
                failureThreshold: 3
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8080
                },
                initialDelaySeconds: 15,
                periodSeconds: 10,
                timeoutSeconds: 10,
                failureThreshold: 3
              }
            }],
            volumes: [{
              name: 'starship-storage',
              persistentVolumeClaim: {
                claimName: pvcName
              }
            }],
            restartPolicy: 'Always'
          }
        }
      }
    };
    
    try {
      // Try to update if exists
      await this.k8sAppsApi.readNamespacedDeployment(deploymentName, namespaceName);
      await this.k8sAppsApi.replaceNamespacedDeployment(deploymentName, namespaceName, deployment);
      console.log(`[KubernetesDeployer] Updated Deployment ${deploymentName}`);
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        // Create new
        await this.k8sAppsApi.createNamespacedDeployment(namespaceName, deployment);
        console.log(`[KubernetesDeployer] Created Deployment ${deploymentName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create Service
   */
  private async createService(starshipId: string, templateSlug: string): Promise<void> {
    const namespaceName = this.generateNamespaceName(starshipId);
    const serviceName = this.generateServiceName(starshipId, templateSlug);
    
    const service: k8s.V1Service = {
      metadata: {
        name: serviceName,
        namespace: namespaceName,
        labels: {
          'app': 'mcp-connector',
          'starship': starshipId,
          'mcp': templateSlug,
          'managed-by': 'starships'
        }
      },
      spec: {
        selector: {
          'app': 'mcp-connector',
          'starship': starshipId,
          'mcp': templateSlug
        },
        ports: [{
          port: 8080,
          targetPort: 8080,
          protocol: 'TCP',
          name: 'http'
        }],
        type: 'ClusterIP'
      }
    };
    
    try {
      // Try to update if exists
      await this.k8sApi.readNamespacedService(serviceName, namespaceName);
      await this.k8sApi.replaceNamespacedService(serviceName, namespaceName, service);
      console.log(`[KubernetesDeployer] Updated Service ${serviceName}`);
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        // Create new
        await this.k8sApi.createNamespacedService(namespaceName, service);
        console.log(`[KubernetesDeployer] Created Service ${serviceName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Wait for deployment to be ready
   */
  private async waitForDeployment(namespace: string, deploymentName: string): Promise<boolean> {
    const maxAttempts = 60; // 5 minutes with 5 second intervals
    const delayMs = 5000;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const deployment = await this.k8sAppsApi.readNamespacedDeploymentStatus(deploymentName, namespace);
        
        const readyReplicas = deployment.body.status?.readyReplicas || 0;
        const replicas = deployment.body.spec?.replicas || 1;
        
        if (readyReplicas >= replicas) {
          console.log(`[KubernetesDeployer] Deployment ${deploymentName} is ready`);
          return true;
        }
        
        console.log(`[KubernetesDeployer] Waiting for deployment (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error) {
        console.error(`[KubernetesDeployer] Error checking deployment status:`, error);
        if (attempt === maxAttempts) {
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return false;
  }

  /**
   * Remove a specific connector deployment
   */
  async remove(starshipId: string, connectorId: string): Promise<boolean> {
    try {
      console.log(`[KubernetesDeployer] Removing connector ${connectorId} from starship ${starshipId}`);
      
      // Get connector details to find the deployment
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepository.findById(connectorId);
      
      if (!connector) {
        console.warn(`[KubernetesDeployer] Connector ${connectorId} not found`);
        return false;
      }
      
      console.log(`[KubernetesDeployer] Found connector with starshipId: ${connector.starshipId}, passed starshipId: ${starshipId}`);
      
      // Use the connector's starshipId if it doesn't match (could be a slug vs ID issue)
      const effectiveStarshipId = connector.starshipId || starshipId;
      
      const template = await this.getTemplate(connector.templateId);
      const namespaceName = this.generateNamespaceName(effectiveStarshipId);
      const deploymentName = this.generateDeploymentName(effectiveStarshipId, template.slug);
      const serviceName = this.generateServiceName(effectiveStarshipId, template.slug);
      const configMapName = this.generateConfigMapName(effectiveStarshipId, template.slug);
      
      console.log(`[KubernetesDeployer] Will delete from namespace: ${namespaceName}`);
      
      // Delete resources in reverse order
      try {
        await this.k8sApi.deleteNamespacedService(serviceName, namespaceName);
        console.log(`[KubernetesDeployer] Deleted Service ${serviceName}`);
      } catch (error) {
        console.warn(`[KubernetesDeployer] Failed to delete service:`, error);
      }
      
      try {
        await this.k8sAppsApi.deleteNamespacedDeployment(deploymentName, namespaceName);
        console.log(`[KubernetesDeployer] Deleted Deployment ${deploymentName}`);
      } catch (error) {
        console.warn(`[KubernetesDeployer] Failed to delete deployment:`, error);
      }
      
      try {
        await this.k8sApi.deleteNamespacedConfigMap(configMapName, namespaceName);
        console.log(`[KubernetesDeployer] Deleted ConfigMap ${configMapName}`);
      } catch (error) {
        console.warn(`[KubernetesDeployer] Failed to delete configmap:`, error);
      }
      
      // Update connector status
      await connectorRepository.updateDockerStatus(connectorId, 'stopped');
      
      // Check if namespace is now empty and optionally clean it up
      // In development, always cleanup to avoid clutter
      // In production, opt-in via K8S_AUTO_CLEANUP_NAMESPACES
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const autoCleanEmptyNamespaces = isDevelopment || process.env.K8S_AUTO_CLEANUP_NAMESPACES === 'true';
      
      if (autoCleanEmptyNamespaces) {
        await this.cleanupEmptyNamespace(namespaceName);
      }
      
      console.log(`[KubernetesDeployer] Successfully removed connector ${connectorId}`);
      return true;
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to remove connector ${connectorId}:`, error);
      return false;
    }
  }

  /**
   * Remove all deployments for a starship
   */
  async removeAll(starshipId: string): Promise<number> {
    try {
      console.log(`[KubernetesDeployer] Removing all deployments for starship ${starshipId}`);
      
      const namespaceName = this.generateNamespaceName(starshipId);
      
      // Get all deployments in namespace
      const deployments = await this.k8sAppsApi.listNamespacedDeployment(namespaceName);
      const deploymentCount = deployments.body.items.length;
      
      // Delete the entire namespace (will cascade delete all resources)
      await this.k8sApi.deleteNamespace(namespaceName);
      console.log(`[KubernetesDeployer] Deleted namespace ${namespaceName} with ${deploymentCount} deployments`);
      
      return deploymentCount;
      
    } catch (error: any) {
      if (error?.response?.statusCode === 404) {
        console.log(`[KubernetesDeployer] Namespace for starship ${starshipId} not found`);
        return 0;
      }
      console.error(`[KubernetesDeployer] Failed to remove all deployments for starship ${starshipId}:`, error);
      return 0;
    }
  }

  /**
   * Get deployment status for a connector
   */
  async getStatus(connectorId: string): Promise<DeploymentStatus | null> {
    try {
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepository.findById(connectorId);
      
      if (!connector || !connector.dockerNetworkName || !connector.dockerContainerId) {
        return null;
      }
      
      const deployment = await this.k8sAppsApi.readNamespacedDeploymentStatus(
        connector.dockerContainerId, // deployment name stored as container ID
        connector.dockerNetworkName  // namespace stored as network name
      );
      
      const readyReplicas = deployment.body.status?.readyReplicas || 0;
      const replicas = deployment.body.spec?.replicas || 1;
      
      return {
        connectorId,
        status: readyReplicas >= replicas ? 'running' : 'pending',
        healthStatus: readyReplicas >= replicas ? 'healthy' : 'starting',
        serviceName: connector.dockerServiceName,
        networkName: connector.dockerNetworkName,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to get status for connector ${connectorId}:`, error);
      return null;
    }
  }

  /**
   * Get deployment status for all connectors in a starship
   */
  async getStarshipStatus(starshipId: string): Promise<DeploymentStatus[]> {
    try {
      const namespaceName = this.generateNamespaceName(starshipId);
      const deployments = await this.k8sAppsApi.listNamespacedDeployment(namespaceName);
      
      const statuses: DeploymentStatus[] = [];
      
      for (const deployment of deployments.body.items) {
        const connectorId = deployment.metadata?.labels?.['connector'] || 'unknown';
        const readyReplicas = deployment.status?.readyReplicas || 0;
        const replicas = deployment.spec?.replicas || 1;
        
        statuses.push({
          connectorId,
          status: readyReplicas >= replicas ? 'running' : 'pending',
          healthStatus: readyReplicas >= replicas ? 'healthy' : 'starting',
          serviceName: deployment.metadata?.name,
          networkName: namespaceName,
          lastUpdated: new Date().toISOString()
        });
      }
      
      return statuses;
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to get starship status for ${starshipId}:`, error);
      return [];
    }
  }

  /**
   * Restart a connector
   */
  async restart(starshipId: string, connectorId: string): Promise<boolean> {
    try {
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepository.findById(connectorId);
      
      if (!connector || !connector.dockerNetworkName || !connector.dockerContainerId) {
        return false;
      }
      
      // Restart by setting an annotation
      const deployment = await this.k8sAppsApi.readNamespacedDeployment(
        connector.dockerContainerId, // deployment name stored as container ID
        connector.dockerNetworkName  // namespace stored as network name
      );
      
      deployment.body.spec!.template.metadata = deployment.body.spec!.template.metadata || {};
      deployment.body.spec!.template.metadata.annotations = deployment.body.spec!.template.metadata.annotations || {};
      deployment.body.spec!.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
      
      await this.k8sAppsApi.replaceNamespacedDeployment(
        connector.dockerContainerId, // deployment name stored as container ID
        connector.dockerNetworkName, // namespace stored as network name
        deployment.body
      );
      
      console.log(`[KubernetesDeployer] Restarted deployment for connector ${connectorId}`);
      return true;
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to restart connector ${connectorId}:`, error);
      return false;
    }
  }

  /**
   * Update environment variables
   */
  async updateEnvironment(starshipId: string, connectorId: string, env: string): Promise<boolean> {
    try {
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepository.findById(connectorId);
      
      if (!connector) {
        return false;
      }
      
      const template = await this.getTemplate(connector.templateId);
      
      // Parse new environment variables
      let userEnv: Record<string, string> = {};
      try {
        const parsedEnv = JSON.parse(env);
        if (typeof parsedEnv === 'object' && parsedEnv !== null) {
          userEnv = parsedEnv;
        }
      } catch (error) {
        console.warn(`[KubernetesDeployer] Failed to parse environment variables:`, error);
        return false;
      }
      
      // Update ConfigMap
      await this.createConfigMap(starshipId, template.slug, userEnv, template);
      
      // Trigger rolling update by restarting
      return await this.restart(starshipId, connectorId);
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to update environment for connector ${connectorId}:`, error);
      return false;
    }
  }

  /**
   * Get logs from a connector
   */
  async getLogs(starshipId: string, connectorId: string, options?: any): Promise<string[]> {
    try {
      const connectorRepository = RepositoryFactory.getMCPServerConnectorRepository();
      const connector = await connectorRepository.findById(connectorId);
      
      if (!connector || !connector.dockerNetworkName) {
        return [];
      }
      
      const template = await this.getTemplate(connector.templateId);
      const namespaceName = connector.dockerNetworkName; // namespace stored as network name
      
      // Get pod for this deployment
      const pods = await this.k8sApi.listNamespacedPod(
        namespaceName,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=mcp-connector,mcp=${template.slug}`
      );
      
      if (pods.body.items.length === 0) {
        return ['No pods found for this connector'];
      }
      
      const podName = pods.body.items[0].metadata!.name!;
      
      // Get logs
      const logs = await this.k8sApi.readNamespacedPodLog(
        podName,
        namespaceName,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        options?.tail || 100
      );
      
      return logs.body.split('\n').filter(line => line.trim());
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to get logs for connector ${connectorId}:`, error);
      return [`Error fetching logs: ${error}`];
    }
  }

  /**
   * Check health of a connector
   */
  async checkHealth(starshipId: string, connectorId: string): Promise<{ healthy: boolean; status: string; details?: any }> {
    try {
      const status = await this.getStatus(connectorId);
      
      if (!status) {
        return { healthy: false, status: 'not found' };
      }
      
      return {
        healthy: status.healthStatus === 'healthy',
        status: status.healthStatus || 'unknown',
        details: status
      };
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to check health for connector ${connectorId}:`, error);
      return { healthy: false, status: 'error', details: error };
    }
  }

  /**
   * Ensure network exists (for compatibility - K8s uses namespaces for isolation)
   */
  async ensureNetwork(config: NetworkConfig): Promise<boolean> {
    // In Kubernetes, namespaces provide network isolation
    // This method exists for interface compatibility
    try {
      await this.ensureNamespace(config.starshipId);
      return true;
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to ensure network:`, error);
      return false;
    }
  }

  /**
   * Remove network (for compatibility - removes namespace in K8s)
   */
  async removeNetwork(starshipId: string): Promise<boolean> {
    try {
      const namespaceName = this.generateNamespaceName(starshipId);
      await this.k8sApi.deleteNamespace(namespaceName);
      return true;
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to remove network:`, error);
      return false;
    }
  }

  /**
   * List all deployments
   */
  async listDeployments(): Promise<DeploymentStatus[]> {
    try {
      // List all namespaces with starship label
      const namespaces = await this.k8sApi.listNamespace(
        undefined,
        undefined,
        undefined,
        undefined,
        'app=starships'
      );
      
      const allStatuses: DeploymentStatus[] = [];
      
      for (const namespace of namespaces.body.items) {
        const namespaceName = namespace.metadata!.name!;
        const starshipId = namespace.metadata!.labels!['starship'];
        
        if (starshipId) {
          const statuses = await this.getStarshipStatus(starshipId);
          allStatuses.push(...statuses);
        }
      }
      
      return allStatuses;
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to list deployments:`, error);
      return [];
    }
  }

  /**
   * Check if namespace is empty and optionally clean it up
   */
  private async cleanupEmptyNamespace(namespaceName: string): Promise<void> {
    try {
      // Check for any deployments in the namespace
      const deployments = await this.k8sAppsApi.listNamespacedDeployment(namespaceName);
      
      if (deployments.body.items.length === 0) {
        console.log(`[KubernetesDeployer] Namespace ${namespaceName} is empty, cleaning up...`);
        
        try {
          // Delete the namespace (this will cascade delete PVC and other resources)
          await this.k8sApi.deleteNamespace(namespaceName);
          console.log(`[KubernetesDeployer] Deleted empty namespace ${namespaceName} and associated resources`);
        } catch (error: any) {
          if (error?.response?.statusCode === 404) {
            // Already deleted, that's fine
            console.log(`[KubernetesDeployer] Namespace ${namespaceName} already deleted`);
          } else {
            console.warn(`[KubernetesDeployer] Failed to delete empty namespace:`, error);
          }
        }
      } else {
        console.log(`[KubernetesDeployer] Namespace ${namespaceName} still has ${deployments.body.items.length} deployments, keeping it`);
      }
    } catch (error) {
      console.error(`[KubernetesDeployer] Error checking namespace for cleanup:`, error);
    }
  }

  /**
   * Trigger tool discovery for a healthy container
   */
  private async triggerToolDiscovery(connectorId: string, starshipId: string): Promise<void> {
    try {
      console.log(`[KubernetesDeployer] Triggering tool discovery for connector ${connectorId}`);
      
      // Use singleton instance to ensure cache consistency
      const { mcpToolGatewayDB } = await import('./MCPToolGatewayDB');
      
      // Clear cache to force fresh discovery
      mcpToolGatewayDB.clearCacheForStarship(starshipId);
      
      // Force a tool discovery by calling getToolsForStarship
      // This will populate the cache with fresh data
      const tools = await mcpToolGatewayDB.getToolsForStarship(starshipId);
      
      console.log(`[KubernetesDeployer] Discovered ${tools.length} tools for starship ${starshipId}`);
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to trigger tool discovery:`, error);
    }
  }

  /**
   * Get deployment metrics
   */
  async getMetrics(starshipId?: string): Promise<any> {
    try {
      let totalDeployments = 0;
      let runningPods = 0;
      let readyPods = 0;
      let namespaceCount = 0;
      
      if (starshipId) {
        // Get metrics for specific starship
        const namespaceName = this.generateNamespaceName(starshipId);
        const deployments = await this.k8sAppsApi.listNamespacedDeployment(namespaceName);
        const pods = await this.k8sApi.listNamespacedPod(namespaceName);
        
        totalDeployments = deployments.body.items.length;
        namespaceCount = 1;
        
        for (const pod of pods.body.items) {
          if (pod.status?.phase === 'Running') {
            runningPods++;
            if (pod.status.conditions?.find(c => c.type === 'Ready' && c.status === 'True')) {
              readyPods++;
            }
          }
        }
      } else {
        // Get metrics for all starships
        const namespaces = await this.k8sApi.listNamespace(
          undefined,
          undefined,
          undefined,
          undefined,
          'app=starships'
        );
        
        namespaceCount = namespaces.body.items.length;
        
        for (const namespace of namespaces.body.items) {
          const namespaceName = namespace.metadata!.name!;
          const deployments = await this.k8sAppsApi.listNamespacedDeployment(namespaceName);
          const pods = await this.k8sApi.listNamespacedPod(namespaceName);
          
          totalDeployments += deployments.body.items.length;
          
          for (const pod of pods.body.items) {
            if (pod.status?.phase === 'Running') {
              runningPods++;
              if (pod.status.conditions?.find(c => c.type === 'Ready' && c.status === 'True')) {
                readyPods++;
              }
            }
          }
        }
      }
      
      return {
        totalDeployments,
        runningPods,
        readyPods,
        unhealthyPods: runningPods - readyPods,
        namespaceCount,
        averageStartupTime: 30000 // Placeholder - would need to track actual times
      };
      
    } catch (error) {
      console.error(`[KubernetesDeployer] Failed to get metrics:`, error);
      return {
        totalDeployments: 0,
        runningPods: 0,
        readyPods: 0,
        unhealthyPods: 0,
        namespaceCount: 0,
        averageStartupTime: 0
      };
    }
  }
}