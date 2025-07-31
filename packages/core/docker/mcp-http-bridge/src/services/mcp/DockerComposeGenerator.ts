/**
 * DockerComposeGenerator - Enhanced service generation for Docker Compose deployments
 * 
 * This service provides sophisticated Docker service configuration generation with
 * advanced features like resource optimization, health check customization, and
 * service validation. It builds upon the existing DockerComposeDeployer.
 */

import * as yaml from 'js-yaml';
import { MCPServerConnector } from '@starships/models';
import { 
  DockerServiceTemplate, 
  getDockerServiceTemplate, 
  buildVolumeMapping,
  ResourceLimits 
} from './DockerServiceTemplate';
import { SecurityManager, SecurityPolicy } from './SecurityManager';
import { VolumeManager } from './VolumeManager';

export interface DockerService {
  image: string;
  container_name: string;
  command?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  networks: string[];
  restart: string;
  labels: Record<string, string>;
  healthcheck?: HealthCheck;
  deploy?: {
    resources: {
      limits: ResourceLimits;
      reservations?: ResourceLimits;
    };
    restart_policy?: {
      condition: string;
      delay: string;
      max_attempts: number;
      window: string;
    };
  };
  depends_on?: Record<string, { condition: string }>;
  logging?: {
    driver: string;
    options: Record<string, string>;
  };
  security_opt?: string[];
  cap_drop?: string[];
  cap_add?: string[];
  user?: string;
  read_only?: boolean;
  tmpfs?: string[];
  privileged?: boolean;
  shm_size?: string;
}

export interface HealthCheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
  start_period?: string;
  start_interval?: string;
}

export interface DockerComposeConfiguration {
  version: string;
  services: Record<string, DockerService>;
  networks: Record<string, NetworkConfig>;
  volumes?: Record<string, VolumeConfig>;
}

export interface NetworkConfig {
  driver: string;
  name: string;
  external?: boolean;
  labels?: Record<string, string>;
  driver_opts?: Record<string, string>;
}

export interface VolumeConfig {
  driver: string;
  driver_opts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface ServiceGenerationOptions {
  optimizeResources?: boolean;
  enableAdvancedHealthChecks?: boolean;
  enableLogging?: boolean;
  enableSecurity?: boolean;
  customLabels?: Record<string, string>;
  resourceProfile?: 'minimal' | 'standard' | 'performance';
}

export interface ServiceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  score: number; // 0-100 quality score
}

/**
 * Enhanced Docker Compose service generator
 */
export class DockerComposeGenerator {
  private securityManager: SecurityManager;
  private volumeManager: VolumeManager;

  constructor(
    securityManager?: SecurityManager,
    volumeManager?: VolumeManager
  ) {
    this.securityManager = securityManager || new SecurityManager();
    this.volumeManager = volumeManager || new VolumeManager();
  }

  /**
   * Generate enhanced Docker service configuration
   */
  async generateService(
    starshipId: string, 
    connector: MCPServerConnector,
    options: ServiceGenerationOptions = {}
  ): Promise<DockerService> {
    console.log(`[DockerComposeGenerator] Generating service for ${connector.templateId} on ${starshipId}`);

    // Get template configuration
    const template = await this.getDockerTemplate(connector.templateId);
    const serviceName = this.generateServiceName(starshipId, template.slug);
    const networkName = this.generateNetworkName(starshipId);

    // Parse environment variables
    const environment = this.buildEnvironmentVariables(connector, template);

    // Build volumes with security enforcement
    const volumes = await this.buildVolumes(template, starshipId, options);

    // Generate resource configuration
    const resourceLimits = this.buildResourceConfiguration(template, options);

    // Build health check configuration
    const healthcheck = this.buildHealthCheck(template, options);

    // Generate labels
    const labels = this.buildLabels(starshipId, connector, template, options);

    // Build logging configuration
    const logging = options.enableLogging ? this.buildLoggingConfig(serviceName) : undefined;

    // Create base service configuration
    let service: DockerService = {
      image: template.image,
      container_name: serviceName,
      command: template.command,
      environment,
      volumes,
      networks: [networkName],
      restart: 'unless-stopped',
      labels,
      healthcheck,
      deploy: {
        resources: {
          limits: resourceLimits,
          reservations: this.buildResourceReservations(resourceLimits, options)
        },
        restart_policy: {
          condition: 'on-failure',
          delay: '5s',
          max_attempts: 3,
          window: '120s'
        }
      },
      logging
    };

    // Apply security configurations
    if (options.enableSecurity !== false) {
      service = this.securityManager.applySecurityConfig(service);
    }

    // Add advanced configurations
    service = this.addAdvancedConfigurations(service, template, options);

    console.log(`[DockerComposeGenerator] Generated service configuration for ${serviceName}`);
    return service;
  }

  /**
   * Generate complete Docker Compose configuration
   */
  async generateComposeConfiguration(
    starshipId: string,
    connectors: MCPServerConnector[],
    options: ServiceGenerationOptions = {}
  ): Promise<DockerComposeConfiguration> {
    console.log(`[DockerComposeGenerator] Generating compose configuration for ${connectors.length} services`);

    const services: Record<string, DockerService> = {};
    const networks: Record<string, NetworkConfig> = {};
    const volumes: Record<string, VolumeConfig> = {};

    // Generate services
    for (const connector of connectors) {
      const service = await this.generateService(starshipId, connector, options);
      const template = await this.getDockerTemplate(connector.templateId);
      services[service.container_name] = service;

      // Add service-specific volumes if needed
      if (template.requiresFileAccess || template.requiresCredentials) {
        const volumeName = `${starshipId}-${template.slug}-data`;
        volumes[volumeName] = {
          driver: 'local',
          driver_opts: {
            type: 'none',
            o: 'bind',
            device: `/data/starships/${starshipId}/${template.slug}`
          },
          labels: {
            'starship.id': starshipId,
            'template.slug': template.slug,
            'managed-by': 'starships'
          }
        };
      }
    }

    // Generate network configuration
    const networkName = this.generateNetworkName(starshipId);
    networks[networkName] = {
      driver: 'bridge',
      name: networkName,
      labels: {
        'starship.id': starshipId,
        'managed-by': 'starships',
        'created-at': new Date().toISOString()
      },
      driver_opts: {
        'com.docker.network.bridge.name': networkName,
        'com.docker.network.driver.mtu': '1500'
      }
    };

    const configuration: DockerComposeConfiguration = {
      version: '3.8',
      services,
      networks,
      ...(Object.keys(volumes).length > 0 && { volumes })
    };

    console.log(`[DockerComposeGenerator] Generated compose configuration with ${Object.keys(services).length} services`);
    return configuration;
  }

  /**
   * Validate service configuration
   */
  async validateService(service: DockerService, template: DockerServiceTemplate): Promise<ServiceValidationResult> {
    const result: ServiceValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      score: 100
    };

    // Validate required fields
    if (!service.image) {
      result.errors.push('Service image is required');
      result.isValid = false;
      result.score -= 25;
    }

    if (!service.container_name) {
      result.errors.push('Container name is required');
      result.isValid = false;
      result.score -= 25;
    }

    if (!service.networks || service.networks.length === 0) {
      result.errors.push('Service must be connected to at least one network');
      result.isValid = false;
      result.score -= 15;
    }

    // Validate health check
    if (!service.healthcheck) {
      result.warnings.push('No health check configured');
      result.score -= 10;
      result.suggestions.push('Add health check for better monitoring');
    } else {
      if (!service.healthcheck.test || service.healthcheck.test.length === 0) {
        result.errors.push('Health check test command is required');
        result.isValid = false;
        result.score -= 15;
      }
    }

    // Validate resource limits
    if (!service.deploy?.resources?.limits) {
      result.warnings.push('No resource limits configured');
      result.score -= 10;
      result.suggestions.push('Set CPU and memory limits to prevent resource exhaustion');
    } else {
      const limits = service.deploy.resources.limits;
      if (!limits.cpus || parseFloat(limits.cpus) > 2.0) {
        result.warnings.push('CPU limit seems high or undefined');
        result.score -= 5;
      }
      if (!limits.memory || this.parseMemoryLimit(limits.memory) > 2048) {
        result.warnings.push('Memory limit seems high or undefined');
        result.score -= 5;
      }
    }

    // Validate security
    if (service.privileged) {
      result.errors.push('Privileged containers are not allowed');
      result.isValid = false;
      result.score -= 30;
    }

    if (!service.cap_drop || !service.cap_drop.includes('ALL')) {
      result.warnings.push('Should drop all capabilities for security');
      result.score -= 5;
      result.suggestions.push('Add cap_drop: ["ALL"] for better security');
    }

    // Validate volumes
    if (service.volumes) {
      for (const volume of service.volumes) {
        const [hostPath, containerPath, mode] = volume.split(':');
        
        // Check for dangerous mounts
        if (hostPath === '/' || hostPath.startsWith('/etc') || hostPath.startsWith('/usr')) {
          result.errors.push(`Dangerous volume mount: ${volume}`);
          result.isValid = false;
          result.score -= 20;
        }

        // Check credential volumes are read-only
        if (hostPath.includes('credentials') && mode !== 'ro') {
          result.warnings.push(`Credential volume should be read-only: ${volume}`);
          result.score -= 10;
        }
      }
    }

    // Template-specific validations
    if (template.requiresFileAccess && (!service.volumes || service.volumes.length === 0)) {
      result.warnings.push('Template requires file access but no volumes configured');
      result.score -= 15;
    }

    if (template.requiresCredentials && (!service.volumes || !service.volumes.some(v => v.includes('credentials')))) {
      result.warnings.push('Template requires credentials but no credential volume configured');
      result.score -= 15;
    }

    // Validate environment variables
    if (service.environment) {
      const sensitivePatterns = [/[DEFAULT-PASSWORD]/i, /secret/i, /key/i, /token/i];
      
      for (const [key, value] of Object.entries(service.environment)) {
        if (sensitivePatterns.some(pattern => pattern.test(key)) && value === '') {
          result.warnings.push(`Sensitive environment variable ${key} is empty`);
          result.score -= 5;
        }
      }
    }

    console.log(`[DockerComposeGenerator] Service validation: ${result.isValid ? 'VALID' : 'INVALID'} (Score: ${result.score})`);
    return result;
  }

  /**
   * Optimize service configuration for performance
   */
  optimizeService(service: DockerService, profile: 'minimal' | 'standard' | 'performance' = 'standard'): DockerService {
    const optimized = { ...service };

    // Adjust resources based on profile
    if (optimized.deploy?.resources?.limits) {
      switch (profile) {
        case 'minimal':
          optimized.deploy.resources.limits.cpus = '0.25';
          optimized.deploy.resources.limits.memory = '256M';
          break;
        case 'performance':
          optimized.deploy.resources.limits.cpus = '1.0';
          optimized.deploy.resources.limits.memory = '1G';
          break;
        default: // standard
          optimized.deploy.resources.limits.cpus = '0.5';
          optimized.deploy.resources.limits.memory = '512M';
      }
    }

    // Optimize health checks
    if (optimized.healthcheck) {
      switch (profile) {
        case 'minimal':
          optimized.healthcheck.interval = '60s';
          optimized.healthcheck.retries = 2;
          break;
        case 'performance':
          optimized.healthcheck.interval = '15s';
          optimized.healthcheck.retries = 5;
          optimized.healthcheck.start_interval = '5s';
          break;
        default: // standard
          optimized.healthcheck.interval = '30s';
          optimized.healthcheck.retries = 3;
      }
    }

    // Add tmpfs for performance profile
    if (profile === 'performance') {
      optimized.tmpfs = ['/tmp:rw,noexec,nosuid,size=100m'];
    }

    console.log(`[DockerComposeGenerator] Optimized service for ${profile} profile`);
    return optimized;
  }

  /**
   * Generate service YAML configuration
   */
  generateServiceYAML(service: DockerService): string {
    return yaml.dump({ [service.container_name]: service }, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });
  }

  /**
   * Generate complete compose YAML
   */
  generateComposeYAML(configuration: DockerComposeConfiguration): string {
    return yaml.dump(configuration, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });
  }

  /**
   * Private helper methods
   */
  private async getDockerTemplate(templateId: string): Promise<DockerServiceTemplate> {
    const slug = templateId.replace('-template', '');
    const template = getDockerServiceTemplate(slug);
    
    if (!template) {
      throw new Error(`No Docker service template found for slug: ${slug}`);
    }
    
    return template;
  }

  private generateServiceName(starshipId: string, templateSlug: string): string {
    return `mcp-${starshipId}-${templateSlug}`;
  }

  private generateNetworkName(starshipId: string): string {
    return `starship-${starshipId}`;
  }

  private buildEnvironmentVariables(
    connector: MCPServerConnector, 
    template: DockerServiceTemplate
  ): Record<string, string> {
    const connectorEnv = JSON.parse(connector.env || '{}');
    const templateEnv = template.environment || {};
    
    return { ...templateEnv, ...connectorEnv };
  }

  private async buildVolumes(
    template: DockerServiceTemplate, 
    starshipId: string,
    options: ServiceGenerationOptions
  ): Promise<string[]> {
    if (!template.volumes) {
      return [];
    }

    let volumes = buildVolumeMapping(template, starshipId);

    // Apply security enforcement
    if (options.enableSecurity !== false) {
      volumes = this.securityManager.enforceCredentialSecurity(volumes);
    }

    // Ensure volume directories exist
    for (const volume of template.volumes) {
      await this.volumeManager.createTemplateVolumes(starshipId, template.slug);
    }

    return volumes;
  }

  private buildResourceConfiguration(
    template: DockerServiceTemplate,
    options: ServiceGenerationOptions
  ): ResourceLimits {
    let limits = template.resourceLimits || { cpus: '0.5', memory: '512M' };

    // Apply resource profile optimization
    if (options.resourceProfile) {
      switch (options.resourceProfile) {
        case 'minimal':
          limits = { cpus: '0.25', memory: '256M' };
          break;
        case 'performance':
          limits = { cpus: '1.0', memory: '1G' };
          break;
        // 'standard' uses template defaults
      }
    }

    return limits;
  }

  private buildResourceReservations(
    limits: ResourceLimits,
    options: ServiceGenerationOptions
  ): ResourceLimits | undefined {
    if (!options.optimizeResources) {
      return undefined;
    }

    // Reserve 50% of limits as baseline
    return {
      cpus: (parseFloat(limits.cpus) * 0.5).toString(),
      memory: this.calculateMemoryReservation(limits.memory)
    };
  }

  private buildHealthCheck(
    template: DockerServiceTemplate,
    options: ServiceGenerationOptions
  ): HealthCheck | undefined {
    if (!template.healthcheck && !options.enableAdvancedHealthChecks) {
      return undefined;
    }

    const baseHealthCheck = template.healthcheck || {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '40s'
    };

    // Enhanced health checks
    if (options.enableAdvancedHealthChecks) {
      return {
        ...baseHealthCheck,
        start_interval: '5s', // Docker 25.0+ feature
        retries: Math.max(baseHealthCheck.retries, 5)
      };
    }

    return baseHealthCheck;
  }

  private buildLabels(
    starshipId: string,
    connector: MCPServerConnector,
    template: DockerServiceTemplate,
    options: ServiceGenerationOptions
  ): Record<string, string> {
    const baseLabels = {
      'starship.id': starshipId,
      'connector.id': connector.id,
      'template.slug': template.slug,
      'managed-by': 'starships',
      'created-at': new Date().toISOString(),
      'version': '1.0',
      ...template.labels
    };

    // Add custom labels
    if (options.customLabels) {
      Object.assign(baseLabels, options.customLabels);
    }

    return baseLabels;
  }

  private buildLoggingConfig(serviceName: string): DockerService['logging'] {
    return {
      driver: 'json-file',
      options: {
        'max-size': '10m',
        'max-file': '3',
        'labels': 'starship.id,connector.id,template.slug',
        'tag': `${serviceName}-{{.ImageName}}-{{.Name}}-{{.ID}}`
      }
    };
  }

  private addAdvancedConfigurations(
    service: DockerService,
    template: DockerServiceTemplate,
    options: ServiceGenerationOptions
  ): DockerService {
    const enhanced = { ...service };

    // Add dependency management for complex services
    if (template.slug === 'postgresql' || template.slug === 'notion') {
      // These might depend on network being ready
      enhanced.depends_on = {
        [`network-${template.slug}`]: { condition: 'service_started' }
      };
    }

    // Add service-specific optimizations
    switch (template.slug) {
      case 'puppeteer':
        // Puppeteer needs special configurations
        enhanced.shm_size = '2gb';
        break;
      case 'filesystem':
        // Filesystem service might need specific mount options
        if (enhanced.volumes) {
          enhanced.volumes = enhanced.volumes.map(vol => {
            if (vol.includes('filesystem')) {
              return vol.replace(':rw', ':rw,Z'); // SELinux label
            }
            return vol;
          });
        }
        break;
    }

    return enhanced;
  }

  private calculateMemoryReservation(memoryLimit: string): string {
    const value = parseInt(memoryLimit.replace(/[GMK]/gi, ''));
    const unit = memoryLimit.replace(/[0-9]/g, '');
    
    return `${Math.floor(value * 0.5)}${unit}`;
  }

  private parseMemoryLimit(memory: string): number {
    const value = parseInt(memory.replace(/[GMK]/gi, ''));
    const unit = memory.replace(/[0-9]/g, '').toUpperCase();
    
    switch (unit) {
      case 'G':
      case 'GB':
        return value * 1024;
      case 'K':
      case 'KB':
        return value / 1024;
      default:
        return value;
    }
  }
}