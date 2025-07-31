/**
 * DeploymentConfig - Environment-aware configuration for MCP deployments
 * 
 * This service provides sophisticated configuration management for different
 * deployment environments (development, staging, production).
 */

export interface NetworkingMode {
  type: 'bridge' | 'host' | 'custom';
  portAllocation?: 'dynamic' | 'static';
  basePort?: number;
  exposeToHost?: boolean;
}

export interface DeploymentEnvironment {
  name: 'development' | 'staging' | 'production';
  networking: NetworkingMode;
  serviceDiscovery: {
    method: 'docker-dns' | 'consul' | 'kubernetes' | 'direct';
    registry?: string;
  };
  security: {
    enableTLS: boolean;
    mtls?: boolean;
    apiKeyRequired: boolean;
  };
}

export class DeploymentConfig {
  private static instance: DeploymentConfig;
  private environment: DeploymentEnvironment;

  private constructor() {
    this.environment = this.detectEnvironment();
  }

  static getInstance(): DeploymentConfig {
    if (!DeploymentConfig.instance) {
      DeploymentConfig.instance = new DeploymentConfig();
    }
    return DeploymentConfig.instance;
  }

  private detectEnvironment(): DeploymentEnvironment {
    const env = process.env.NODE_ENV || 'development';
    const isKubernetes = process.env.KUBERNETES_SERVICE_HOST !== undefined;
    const isDocker = process.env.DOCKER_HOST !== undefined;

    switch (env) {
      case 'production':
        return {
          name: 'production',
          networking: {
            type: isKubernetes ? 'custom' : 'bridge',
            portAllocation: 'static',
            exposeToHost: false
          },
          serviceDiscovery: {
            method: isKubernetes ? 'kubernetes' : 'consul',
            registry: process.env.SERVICE_REGISTRY_URL
          },
          security: {
            enableTLS: true,
            mtls: true,
            apiKeyRequired: true
          }
        };

      case 'staging':
        return {
          name: 'staging',
          networking: {
            type: 'bridge',
            portAllocation: 'static',
            exposeToHost: true
          },
          serviceDiscovery: {
            method: 'consul',
            registry: process.env.SERVICE_REGISTRY_URL || 'http://consul:8500'
          },
          security: {
            enableTLS: true,
            apiKeyRequired: true
          }
        };

      default: // development
        return {
          name: 'development',
          networking: {
            type: 'bridge',
            portAllocation: 'dynamic',
            basePort: 8080,
            exposeToHost: true
          },
          serviceDiscovery: {
            method: 'direct'
          },
          security: {
            enableTLS: false,
            apiKeyRequired: false
          }
        };
    }
  }

  getEnvironment(): DeploymentEnvironment {
    return this.environment;
  }

  getServiceUrl(containerName: string, port: number): string {
    const { name, networking, serviceDiscovery } = this.environment;

    switch (name) {
      case 'production':
        if (serviceDiscovery.method === 'kubernetes') {
          // Use Kubernetes service name
          return `http://${containerName}:${port}`;
        } else if (serviceDiscovery.method === 'consul') {
          // Use Consul DNS
          return `http://${containerName}.service.consul:${port}`;
        }
        break;

      case 'staging':
        // Use Docker network DNS
        return `http://${containerName}:${port}`;

      case 'development':
        if (networking.exposeToHost) {
          // For development, always use localhost with exposed port
          // Port will be dynamically allocated
          return `http://localhost:${port}`;
        }
        break;
    }

    // Default to container name
    return `http://${containerName}:${port}`;
  }

  shouldExposePort(): boolean {
    return this.environment.networking.exposeToHost || false;
  }

  getPortAllocationStrategy(): 'dynamic' | 'static' {
    return this.environment.networking.portAllocation || 'static';
  }

  getBasePort(): number {
    return this.environment.networking.basePort || 8080;
  }

  requiresServiceRegistry(): boolean {
    return ['consul', 'kubernetes'].includes(this.environment.serviceDiscovery.method);
  }

  getSecurityConfig() {
    return this.environment.security;
  }
}

export const deploymentConfig = DeploymentConfig.getInstance();