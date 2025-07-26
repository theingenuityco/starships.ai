/**
 * SecurityManager - Handles security controls and resource limits for MCP deployments
 * 
 * This service implements comprehensive security measures including container isolation,
 * resource limits, network segmentation, and access controls for MCP server deployments.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface SecurityPolicy {
  resourceLimits: {
    maxCpuCores: number;
    maxMemoryMB: number;
    maxStorageGB: number;
    maxContainersPerStarship: number;
  };
  networkSecurity: {
    isolatedNetworks: boolean;
    allowExternalPorts: boolean;
    allowPrivilegedContainers: boolean;
    restrictedNetworkAccess: string[];
  };
  volumeSecurity: {
    readOnlyCredentials: boolean;
    isolatedVolumes: boolean;
    restrictedMounts: string[];
    maxVolumeSize: number;
  };
  containerSecurity: {
    runAsNonRoot: boolean;
    readOnlyRootFS: boolean;
    dropCapabilities: string[];
    seccompProfile?: string;
    apparmorProfile?: string;
  };
}

export interface ResourceQuota {
  starshipId: string;
  currentUsage: {
    cpuCores: number;
    memoryMB: number;
    storageGB: number;
    containerCount: number;
  };
  limits: {
    cpuCores: number;
    memoryMB: number;
    storageGB: number;
    containerCount: number;
  };
  warnings: string[];
}

export interface SecurityViolation {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'resource_limit' | 'network_security' | 'volume_security' | 'container_security';
  description: string;
  starshipId?: string;
  containerId?: string;
  recommendation: string;
  timestamp: Date;
}

/**
 * Comprehensive security management for MCP deployments
 */
export class SecurityManager {
  private securityPolicy: SecurityPolicy;

  constructor(customPolicy?: Partial<SecurityPolicy>) {
    this.securityPolicy = this.getDefaultSecurityPolicy();
    
    if (customPolicy) {
      this.securityPolicy = { ...this.securityPolicy, ...customPolicy };
    }
  }

  /**
   * Get default security policy
   */
  private getDefaultSecurityPolicy(): SecurityPolicy {
    return {
      resourceLimits: {
        maxCpuCores: 2.0,
        maxMemoryMB: 2048,
        maxStorageGB: 5,
        maxContainersPerStarship: 10
      },
      networkSecurity: {
        isolatedNetworks: true,
        allowExternalPorts: false,
        allowPrivilegedContainers: false,
        restrictedNetworkAccess: ['host', 'none']
      },
      volumeSecurity: {
        readOnlyCredentials: true,
        isolatedVolumes: true,
        restrictedMounts: ['/', '/etc', '/usr', '/bin', '/sbin', '/var/run/docker.sock'],
        maxVolumeSize: 1024 // MB
      },
      containerSecurity: {
        runAsNonRoot: true,
        readOnlyRootFS: false, // Many MCP servers need to write temporary files
        dropCapabilities: ['ALL'],
        seccompProfile: 'runtime/default',
        apparmorProfile: 'docker-default'
      }
    };
  }

  /**
   * Validate deployment against security policy
   */
  async validateDeployment(
    starshipId: string,
    templateSlug: string,
    containerConfig: any
  ): Promise<{ allowed: boolean; violations: SecurityViolation[] }> {
    console.log(`[SecurityManager] Validating deployment for ${templateSlug} on starship ${starshipId}`);

    const violations: SecurityViolation[] = [];

    // Check resource quotas
    const resourceViolations = await this.checkResourceQuotas(starshipId, containerConfig);
    violations.push(...resourceViolations);

    // Check network security
    const networkViolations = this.checkNetworkSecurity(containerConfig);
    violations.push(...networkViolations);

    // Check volume security
    const volumeViolations = this.checkVolumeSecurity(containerConfig);
    violations.push(...volumeViolations);

    // Check container security
    const containerViolations = this.checkContainerSecurity(containerConfig);
    violations.push(...containerViolations);

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const allowed = criticalViolations.length === 0;

    console.log(`[SecurityManager] Validation result: ${allowed ? 'ALLOWED' : 'DENIED'} (${violations.length} violations)`);

    return { allowed, violations };
  }

  /**
   * Check resource quotas for starship
   */
  private async checkResourceQuotas(starshipId: string, containerConfig: any): Promise<SecurityViolation[]> {
    const violations: SecurityViolation[] = [];

    try {
      const quota = await this.getResourceQuota(starshipId);
      const requestedCpu = this.parseResourceValue(containerConfig.deploy?.resources?.limits?.cpus || '0.5');
      const requestedMemory = this.parseResourceValue(containerConfig.deploy?.resources?.limits?.memory || '512M');

      // Check CPU limit
      if (quota.currentUsage.cpuCores + requestedCpu > quota.limits.cpuCores) {
        violations.push({
          severity: 'critical',
          type: 'resource_limit',
          description: `CPU quota exceeded: ${quota.currentUsage.cpuCores + requestedCpu} > ${quota.limits.cpuCores}`,
          starshipId,
          recommendation: 'Reduce CPU allocation or increase quota',
          timestamp: new Date()
        });
      }

      // Check memory limit
      if (quota.currentUsage.memoryMB + requestedMemory > quota.limits.memoryMB) {
        violations.push({
          severity: 'critical',
          type: 'resource_limit',
          description: `Memory quota exceeded: ${quota.currentUsage.memoryMB + requestedMemory}MB > ${quota.limits.memoryMB}MB`,
          starshipId,
          recommendation: 'Reduce memory allocation or increase quota',
          timestamp: new Date()
        });
      }

      // Check container count
      if (quota.currentUsage.containerCount >= quota.limits.containerCount) {
        violations.push({
          severity: 'high',
          type: 'resource_limit',
          description: `Container limit reached: ${quota.currentUsage.containerCount}/${quota.limits.containerCount}`,
          starshipId,
          recommendation: 'Remove unused containers or increase container limit',
          timestamp: new Date()
        });
      }

    } catch (error) {
      violations.push({
        severity: 'medium',
        type: 'resource_limit',
        description: `Could not check resource quotas: ${error instanceof Error ? error.message : 'Unknown error'}`,
        starshipId,
        recommendation: 'Verify resource monitoring system',
        timestamp: new Date()
      });
    }

    return violations;
  }

  /**
   * Check network security configuration
   */
  private checkNetworkSecurity(containerConfig: any): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check for external port mappings
    if (containerConfig.ports && this.securityPolicy.networkSecurity.allowExternalPorts === false) {
      violations.push({
        severity: 'high',
        type: 'network_security',
        description: 'External port mappings are not allowed',
        recommendation: 'Remove port mappings and use internal networking only',
        timestamp: new Date()
      });
    }

    // Check for privileged mode
    if (containerConfig.privileged && this.securityPolicy.networkSecurity.allowPrivilegedContainers === false) {
      violations.push({
        severity: 'critical',
        type: 'network_security',
        description: 'Privileged containers are not allowed',
        recommendation: 'Remove privileged flag from container configuration',
        timestamp: new Date()
      });
    }

    // Check network mode
    if (containerConfig.network_mode && this.securityPolicy.networkSecurity.restrictedNetworkAccess.includes(containerConfig.network_mode)) {
      violations.push({
        severity: 'high',
        type: 'network_security',
        description: `Restricted network mode: ${containerConfig.network_mode}`,
        recommendation: 'Use custom bridge networks for container isolation',
        timestamp: new Date()
      });
    }

    return violations;
  }

  /**
   * Check volume security configuration
   */
  private checkVolumeSecurity(containerConfig: any): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    if (!containerConfig.volumes || !Array.isArray(containerConfig.volumes)) {
      return violations;
    }

    for (const volume of containerConfig.volumes) {
      const [hostPath, containerPath, mode] = volume.split(':');

      // Check for restricted mount points
      for (const restrictedPath of this.securityPolicy.volumeSecurity.restrictedMounts) {
        if (hostPath.startsWith(restrictedPath)) {
          violations.push({
            severity: 'critical',
            type: 'volume_security',
            description: `Dangerous volume mount: ${hostPath}`,
            recommendation: 'Mount only application-specific directories',
            timestamp: new Date()
          });
        }
      }

      // Check credential volume permissions
      if (hostPath.includes('credentials') && mode !== 'ro' && this.securityPolicy.volumeSecurity.readOnlyCredentials) {
        violations.push({
          severity: 'high',
          type: 'volume_security',
          description: `Credential volume should be read-only: ${volume}`,
          recommendation: 'Set credential volumes to read-only mode',
          timestamp: new Date()
        });
      }

      // Check for world-writable mounts
      if (mode === 'rw' && hostPath.startsWith('/tmp')) {
        violations.push({
          severity: 'medium',
          type: 'volume_security',
          description: `World-writable volume mount: ${volume}`,
          recommendation: 'Use dedicated directories with restricted permissions',
          timestamp: new Date()
        });
      }
    }

    return violations;
  }

  /**
   * Check container security configuration
   */
  private checkContainerSecurity(containerConfig: any): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check for root user
    if (!containerConfig.user && this.securityPolicy.containerSecurity.runAsNonRoot) {
      violations.push({
        severity: 'medium',
        type: 'container_security',
        description: 'Container may be running as root',
        recommendation: 'Set non-root user for container execution',
        timestamp: new Date()
      });
    }

    // Check capabilities
    if (!containerConfig.cap_drop || !containerConfig.cap_drop.includes('ALL')) {
      violations.push({
        severity: 'medium',
        type: 'container_security',
        description: 'Container retains unnecessary capabilities',
        recommendation: 'Drop all capabilities and add only required ones',
        timestamp: new Date()
      });
    }

    // Check security options
    if (!containerConfig.security_opt || !containerConfig.security_opt.some((opt: string) => opt.includes('seccomp'))) {
      violations.push({
        severity: 'low',
        type: 'container_security',
        description: 'No seccomp profile specified',
        recommendation: 'Apply seccomp security profile',
        timestamp: new Date()
      });
    }

    return violations;
  }

  /**
   * Get current resource quota for starship
   */
  async getResourceQuota(starshipId: string): Promise<ResourceQuota> {
    console.log(`[SecurityManager] Getting resource quota for starship ${starshipId}`);

    try {
      // Get current container usage
      const containers = await this.getStarshipContainers(starshipId);
      let totalCpu = 0;
      let totalMemory = 0;

      for (const container of containers) {
        const stats = await this.getContainerStats(container);
        totalCpu += stats.cpu;
        totalMemory += stats.memory;
      }

      // Get storage usage
      const storageUsage = await this.getStorageUsage(starshipId);

      const quota: ResourceQuota = {
        starshipId,
        currentUsage: {
          cpuCores: totalCpu,
          memoryMB: totalMemory,
          storageGB: storageUsage,
          containerCount: containers.length
        },
        limits: {
          cpuCores: this.securityPolicy.resourceLimits.maxCpuCores,
          memoryMB: this.securityPolicy.resourceLimits.maxMemoryMB,
          storageGB: this.securityPolicy.resourceLimits.maxStorageGB,
          containerCount: this.securityPolicy.resourceLimits.maxContainersPerStarship
        },
        warnings: []
      };

      // Add warnings for high usage
      if (quota.currentUsage.cpuCores / quota.limits.cpuCores > 0.8) {
        quota.warnings.push('CPU usage above 80%');
      }
      if (quota.currentUsage.memoryMB / quota.limits.memoryMB > 0.8) {
        quota.warnings.push('Memory usage above 80%');
      }
      if (quota.currentUsage.storageGB / quota.limits.storageGB > 0.8) {
        quota.warnings.push('Storage usage above 80%');
      }

      return quota;
    } catch (error) {
      console.error(`[SecurityManager] Failed to get resource quota for ${starshipId}:`, error);
      
      // Return default quota on error
      return {
        starshipId,
        currentUsage: { cpuCores: 0, memoryMB: 0, storageGB: 0, containerCount: 0 },
        limits: {
          cpuCores: this.securityPolicy.resourceLimits.maxCpuCores,
          memoryMB: this.securityPolicy.resourceLimits.maxMemoryMB,
          storageGB: this.securityPolicy.resourceLimits.maxStorageGB,
          containerCount: this.securityPolicy.resourceLimits.maxContainersPerStarship
        },
        warnings: ['Could not determine current resource usage']
      };
    }
  }

  /**
   * Apply security configurations to container config
   */
  applySecurityConfig(containerConfig: any): any {
    console.log('[SecurityManager] Applying security configurations');

    const secureConfig = { ...containerConfig };

    // Apply resource limits
    if (!secureConfig.deploy) {
      secureConfig.deploy = { resources: { limits: {} } };
    }
    if (!secureConfig.deploy.resources) {
      secureConfig.deploy.resources = { limits: {} };
    }
    if (!secureConfig.deploy.resources.limits) {
      secureConfig.deploy.resources.limits = {};
    }

    // Set default resource limits if not specified
    if (!secureConfig.deploy.resources.limits.cpus) {
      secureConfig.deploy.resources.limits.cpus = '0.5';
    }
    if (!secureConfig.deploy.resources.limits.memory) {
      secureConfig.deploy.resources.limits.memory = '512M';
    }

    // Apply container security settings
    if (this.securityPolicy.containerSecurity.runAsNonRoot) {
      secureConfig.user = secureConfig.user || '1000:1000';
    }

    if (this.securityPolicy.containerSecurity.dropCapabilities.length > 0) {
      secureConfig.cap_drop = this.securityPolicy.containerSecurity.dropCapabilities;
    }

    if (this.securityPolicy.containerSecurity.readOnlyRootFS) {
      secureConfig.read_only = true;
    }

    // Apply security options
    secureConfig.security_opt = secureConfig.security_opt || [];
    
    if (this.securityPolicy.containerSecurity.seccompProfile) {
      secureConfig.security_opt.push(`seccomp:${this.securityPolicy.containerSecurity.seccompProfile}`);
    }

    if (this.securityPolicy.containerSecurity.apparmorProfile) {
      secureConfig.security_opt.push(`apparmor:${this.securityPolicy.containerSecurity.apparmorProfile}`);
    }

    // Ensure no privileged mode
    if (secureConfig.privileged) {
      console.warn('[SecurityManager] Removing privileged flag from container config');
      delete secureConfig.privileged;
    }

    // Remove external port mappings if not allowed
    if (!this.securityPolicy.networkSecurity.allowExternalPorts && secureConfig.ports) {
      console.warn('[SecurityManager] Removing external port mappings');
      delete secureConfig.ports;
    }

    console.log('[SecurityManager] Security configurations applied');
    return secureConfig;
  }

  /**
   * Enforce read-only credentials
   */
  enforceCredentialSecurity(volumes: string[]): string[] {
    if (!this.securityPolicy.volumeSecurity.readOnlyCredentials) {
      return volumes;
    }

    return volumes.map(volume => {
      const [hostPath, containerPath, mode] = volume.split(':');
      
      if (hostPath.includes('credentials') && mode !== 'ro') {
        console.log(`[SecurityManager] Enforcing read-only mode for credentials: ${volume}`);
        return `${hostPath}:${containerPath}:ro`;
      }
      
      return volume;
    });
  }

  /**
   * Get security policy
   */
  getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy };
  }

  /**
   * Update security policy
   */
  updateSecurityPolicy(updates: Partial<SecurityPolicy>): void {
    console.log('[SecurityManager] Updating security policy');
    this.securityPolicy = { ...this.securityPolicy, ...updates };
  }

  /**
   * Helper methods
   */
  private async getStarshipContainers(starshipId: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `docker ps --filter "label=starship.id=${starshipId}" --format "{{.Names}}"`
      );
      return stdout.trim() ? stdout.trim().split('\n') : [];
    } catch (error) {
      console.warn(`[SecurityManager] Could not get containers for starship ${starshipId}:`, error);
      return [];
    }
  }

  private async getContainerStats(containerName: string): Promise<{ cpu: number; memory: number }> {
    try {
      const { stdout } = await execAsync(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}}:{{.MemUsage}}"`);
      const [cpuPerc, memUsage] = stdout.trim().split(':');
      
      const cpu = parseFloat(cpuPerc.replace('%', '')) / 100; // Convert percentage to cores
      const memoryMB = this.parseMemoryUsage(memUsage);
      
      return { cpu, memory: memoryMB };
    } catch (error) {
      console.warn(`[SecurityManager] Could not get stats for container ${containerName}:`, error);
      return { cpu: 0, memory: 0 };
    }
  }

  private async getStorageUsage(starshipId: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sh /data/starships/${starshipId} | cut -f1`);
      return this.parseStorageSize(stdout.trim());
    } catch (error) {
      console.warn(`[SecurityManager] Could not get storage usage for starship ${starshipId}:`, error);
      return 0;
    }
  }

  private parseResourceValue(value: string): number {
    if (typeof value === 'number') {
      return value;
    }

    if (value.endsWith('M') || value.endsWith('MB')) {
      return parseInt(value.replace(/[MB]/g, ''));
    }

    if (value.endsWith('G') || value.endsWith('GB')) {
      return parseInt(value.replace(/[GB]/g, '')) * 1024;
    }

    return parseFloat(value);
  }

  private parseMemoryUsage(memUsage: string): number {
    // Parse format like "123.4MiB / 512MiB"
    const current = memUsage.split(' / ')[0];
    
    if (current.includes('MiB')) {
      return parseFloat(current.replace('MiB', ''));
    } else if (current.includes('GiB')) {
      return parseFloat(current.replace('GiB', '')) * 1024;
    }
    
    return 0;
  }

  private parseStorageSize(size: string): number {
    if (size.endsWith('K')) {
      return parseFloat(size.replace('K', '')) / 1024 / 1024; // Convert to GB
    } else if (size.endsWith('M')) {
      return parseFloat(size.replace('M', '')) / 1024; // Convert to GB
    } else if (size.endsWith('G')) {
      return parseFloat(size.replace('G', ''));
    }
    
    return 0;
  }
}