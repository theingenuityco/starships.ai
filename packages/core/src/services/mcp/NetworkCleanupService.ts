/**
 * NetworkCleanupService - Handles comprehensive cleanup of Docker resources
 * 
 * This service provides secure cleanup of containers, networks, volumes, and compose files
 * when starships are deleted or deployments fail. It ensures no resources are left behind.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { VolumeManager } from './VolumeManager';
import { NetworkManager } from '../docker/NetworkManager';

const execAsync = promisify(exec);

export interface ContainerInfo {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  networkName: string;
  starshipId: string;
  connectorId?: string;
}

export interface CleanupResult {
  success: boolean;
  containersRemoved: number;
  networksRemoved: number;
  volumesRemoved: number;
  composeFilesRemoved: number;
  errors: string[];
  warnings: string[];
  cleanupTime: number;
}

export interface SecurityAuditResult {
  passed: boolean;
  score: number; // 0-100
  findings: {
    critical: string[];
    high: string[];
    medium: string[];
    low: string[];
  };
  recommendations: string[];
}

/**
 * Comprehensive network and resource cleanup service
 */
export class NetworkCleanupService {
  private volumeManager: VolumeManager;
  private networkManager: NetworkManager;

  constructor(
    volumeManager?: VolumeManager,
    networkManager?: NetworkManager
  ) {
    this.volumeManager = volumeManager || new VolumeManager();
    this.networkManager = networkManager || new NetworkManager();
  }

  /**
   * Complete cleanup of all resources for a starship
   */
  async cleanupStarship(starshipId: string): Promise<CleanupResult> {
    const startTime = Date.now();
    console.log(`[NetworkCleanup] Starting comprehensive cleanup for starship ${starshipId}`);

    const result: CleanupResult = {
      success: true,
      containersRemoved: 0,
      networksRemoved: 0,
      volumesRemoved: 0,
      composeFilesRemoved: 0,
      errors: [],
      warnings: [],
      cleanupTime: 0
    };

    try {
      // 1. Get all containers for this starship
      const containers = await this.getStarshipContainers(starshipId);
      console.log(`[NetworkCleanup] Found ${containers.length} containers for starship ${starshipId}`);

      // 2. Stop and remove all containers
      for (const container of containers) {
        try {
          await this.removeContainer(container);
          result.containersRemoved++;
          console.log(`[NetworkCleanup] Removed container: ${container.name}`);
        } catch (error) {
          const errorMsg = `Failed to remove container ${container.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          result.success = false;
          console.error(`[NetworkCleanup] ${errorMsg}`);
        }
      }

      // 3. Remove compose file
      try {
        const composeFilePath = `/data/docker/compose-files/starship-${starshipId}.yml`;
        await fs.unlink(composeFilePath);
        result.composeFilesRemoved++;
        console.log(`[NetworkCleanup] Removed compose file: ${composeFilePath}`);
      } catch (error) {
        // Compose file might not exist, which is OK
        if (error instanceof Error && !error.message.includes('ENOENT')) {
          result.warnings.push(`Could not remove compose file: ${error.message}`);
        }
      }

      // 4. Remove network
      try {
        const networkRemoved = await this.networkManager.removeStarshipNetwork(starshipId);
        if (networkRemoved) {
          result.networksRemoved++;
          console.log(`[NetworkCleanup] Removed network for starship ${starshipId}`);
        }
      } catch (error) {
        const errorMsg = `Failed to remove network: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.warnings.push(errorMsg);
        console.warn(`[NetworkCleanup] ${errorMsg}`);
      }

      // 5. Clean up volumes
      try {
        const volumeCleanupSuccess = await this.volumeManager.cleanupStarshipVolumes(starshipId);
        if (volumeCleanupSuccess) {
          result.volumesRemoved++;
          console.log(`[NetworkCleanup] Cleaned up volumes for starship ${starshipId}`);
        } else {
          result.warnings.push('Volume cleanup completed with warnings');
        }
      } catch (error) {
        const errorMsg = `Failed to cleanup volumes: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        result.success = false;
        console.error(`[NetworkCleanup] ${errorMsg}`);
      }

      // 6. Verify cleanup completeness
      await this.verifyCleanupCompleteness(starshipId, result);

      result.cleanupTime = Date.now() - startTime;
      console.log(`[NetworkCleanup] Cleanup completed for starship ${starshipId} in ${result.cleanupTime}ms`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.cleanupTime = Date.now() - startTime;
      console.error(`[NetworkCleanup] Cleanup failed for starship ${starshipId}:`, error);
    }

    return result;
  }

  /**
   * Get all containers belonging to a starship
   */
  private async getStarshipContainers(starshipId: string): Promise<ContainerInfo[]> {
    try {
      const { stdout } = await execAsync(
        `docker ps -a --filter "label=starship.id=${starshipId}" --format "{{.ID}}:{{.Names}}:{{.Status}}:{{.Label \\"starship.id\\"}}:{{.Label \\"connector.id\\"}}"`
      );

      if (!stdout.trim()) {
        return [];
      }

      const containers: ContainerInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const [id, name, status, starshipLabel, connectorId] = line.split(':');
        
        containers.push({
          id: id.trim(),
          name: name.trim(),
          status: status.toLowerCase().includes('up') ? 'running' : 
                  status.toLowerCase().includes('exited') ? 'stopped' : 'error',
          networkName: `starship-${starshipId}`,
          starshipId: starshipLabel || starshipId,
          connectorId: connectorId || undefined
        });
      }

      return containers;
    } catch (error) {
      console.warn(`[NetworkCleanup] Could not get containers for starship ${starshipId}:`, error);
      return [];
    }
  }

  /**
   * Remove a specific container with force
   */
  private async removeContainer(container: ContainerInfo): Promise<void> {
    try {
      // Stop container if running
      if (container.status === 'running') {
        await execAsync(`docker stop ${container.id}`, { timeout: 30000 }); // 30 second timeout
        console.log(`[NetworkCleanup] Stopped container: ${container.name}`);
      }

      // Remove container
      await execAsync(`docker rm -f ${container.id}`);
      console.log(`[NetworkCleanup] Removed container: ${container.name}`);

    } catch (error) {
      console.error(`[NetworkCleanup] Failed to remove container ${container.name}:`, error);
      throw error;
    }
  }

  /**
   * Verify that cleanup was complete
   */
  private async verifyCleanupCompleteness(starshipId: string, result: CleanupResult): Promise<void> {
    try {
      // Check for remaining containers
      const remainingContainers = await this.getStarshipContainers(starshipId);
      if (remainingContainers.length > 0) {
        result.warnings.push(`${remainingContainers.length} containers still exist after cleanup`);
      }

      // Check for remaining network
      try {
        const { stdout } = await execAsync(`docker network ls --filter "name=starship-${starshipId}" --format "{{.Name}}"`);
        if (stdout.trim()) {
          result.warnings.push('Network still exists after cleanup');
        }
      } catch (error) {
        // Network command error is not critical
      }

      // Check for remaining volumes
      const volumeInfo = await this.volumeManager.getVolumeInfo(starshipId, 'filesystem');
      if (volumeInfo && volumeInfo.exists) {
        result.warnings.push('Volume directory still exists after cleanup');
      }

    } catch (error) {
      result.warnings.push(`Could not verify cleanup completeness: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up orphaned resources (containers/networks without starship labels)
   */
  async cleanupOrphanedResources(): Promise<CleanupResult> {
    const startTime = Date.now();
    console.log('[NetworkCleanup] Starting orphaned resource cleanup');

    const result: CleanupResult = {
      success: true,
      containersRemoved: 0,
      networksRemoved: 0,
      volumesRemoved: 0,
      composeFilesRemoved: 0,
      errors: [],
      warnings: [],
      cleanupTime: 0
    };

    try {
      // Find containers with starships label but no corresponding compose file
      const orphanedContainers = await this.findOrphanedContainers();
      
      for (const container of orphanedContainers) {
        try {
          await this.removeContainer(container);
          result.containersRemoved++;
          console.log(`[NetworkCleanup] Removed orphaned container: ${container.name}`);
        } catch (error) {
          result.errors.push(`Failed to remove orphaned container ${container.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Find orphaned networks
      const orphanedNetworks = await this.findOrphanedNetworks();
      
      for (const networkName of orphanedNetworks) {
        try {
          await execAsync(`docker network rm ${networkName}`);
          result.networksRemoved++;
          console.log(`[NetworkCleanup] Removed orphaned network: ${networkName}`);
        } catch (error) {
          result.warnings.push(`Could not remove orphaned network ${networkName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Clean up orphaned compose files
      const orphanedComposeFiles = await this.findOrphanedComposeFiles();
      
      for (const composeFile of orphanedComposeFiles) {
        try {
          await fs.unlink(composeFile);
          result.composeFilesRemoved++;
          console.log(`[NetworkCleanup] Removed orphaned compose file: ${composeFile}`);
        } catch (error) {
          result.warnings.push(`Could not remove orphaned compose file ${composeFile}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.cleanupTime = Date.now() - startTime;
      console.log(`[NetworkCleanup] Orphaned resource cleanup completed in ${result.cleanupTime}ms`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Orphaned cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.cleanupTime = Date.now() - startTime;
      console.error('[NetworkCleanup] Orphaned resource cleanup failed:', error);
    }

    return result;
  }

  /**
   * Find containers that have starship labels but no corresponding active starship
   */
  private async findOrphanedContainers(): Promise<ContainerInfo[]> {
    try {
      const { stdout } = await execAsync(
        'docker ps -a --filter "label=managed-by=starships" --format "{{.ID}}:{{.Names}}:{{.Status}}:{{.Label \\"starship.id\\"}}"'
      );

      if (!stdout.trim()) {
        return [];
      }

      const orphanedContainers: ContainerInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const [id, name, status, starshipId] = line.split(':');
        
        if (!starshipId) {
          continue; // Skip containers without starship ID
        }

        // Check if compose file exists for this starship
        const composeFilePath = `/data/docker/compose-files/starship-${starshipId}.yml`;
        try {
          await fs.access(composeFilePath);
          // Compose file exists, container is not orphaned
        } catch {
          // Compose file doesn't exist, container is orphaned
          orphanedContainers.push({
            id: id.trim(),
            name: name.trim(),
            status: status.toLowerCase().includes('up') ? 'running' : 'stopped',
            networkName: `starship-${starshipId}`,
            starshipId: starshipId.trim()
          });
        }
      }

      return orphanedContainers;
    } catch (error) {
      console.warn('[NetworkCleanup] Could not find orphaned containers:', error);
      return [];
    }
  }

  /**
   * Find networks that don't have active containers
   */
  private async findOrphanedNetworks(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        'docker network ls --filter "label=managed-by=starships" --format "{{.Name}}"'
      );

      if (!stdout.trim()) {
        return [];
      }

      const orphanedNetworks: string[] = [];
      const networkNames = stdout.trim().split('\n');

      for (const networkName of networkNames) {
        try {
          // Check if network has any containers
          const { stdout: networkInfo } = await execAsync(`docker network inspect ${networkName.trim()}`);
          const networkData = JSON.parse(networkInfo);
          
          if (networkData[0] && Object.keys(networkData[0].Containers || {}).length === 0) {
            orphanedNetworks.push(networkName.trim());
          }
        } catch (error) {
          console.warn(`[NetworkCleanup] Could not inspect network ${networkName}:`, error);
        }
      }

      return orphanedNetworks;
    } catch (error) {
      console.warn('[NetworkCleanup] Could not find orphaned networks:', error);
      return [];
    }
  }

  /**
   * Find compose files that don't have corresponding active containers
   */
  private async findOrphanedComposeFiles(): Promise<string[]> {
    try {
      const composeDir = '/data/docker/compose-files';
      const files = await fs.readdir(composeDir);
      const orphanedFiles: string[] = [];

      for (const file of files) {
        if (file.startsWith('starship-') && file.endsWith('.yml')) {
          const starshipId = file.replace('starship-', '').replace('.yml', '');
          const composeFilePath = path.join(composeDir, file);

          // Check if there are any containers for this starship
          const containers = await this.getStarshipContainers(starshipId);
          
          if (containers.length === 0) {
            orphanedFiles.push(composeFilePath);
          }
        }
      }

      return orphanedFiles;
    } catch (error) {
      console.warn('[NetworkCleanup] Could not find orphaned compose files:', error);
      return [];
    }
  }

  /**
   * Perform security audit of Docker deployment
   */
  async performSecurityAudit(): Promise<SecurityAuditResult> {
    console.log('[NetworkCleanup] Performing security audit');

    const result: SecurityAuditResult = {
      passed: true,
      score: 100,
      findings: {
        critical: [],
        high: [],
        medium: [],
        low: []
      },
      recommendations: []
    };

    try {
      // Check for containers running as root
      await this.auditContainerPrivileges(result);

      // Check for exposed ports
      await this.auditPortExposure(result);

      // Check volume mount security
      await this.auditVolumeMounts(result);

      // Check network isolation
      await this.auditNetworkIsolation(result);

      // Check resource limits
      await this.auditResourceLimits(result);

      // Check for sensitive data in environment variables
      await this.auditEnvironmentVariables(result);

      // Calculate final score
      result.score = this.calculateSecurityScore(result);
      result.passed = result.score >= 70 && result.findings.critical.length === 0;

      console.log(`[NetworkCleanup] Security audit completed: ${result.passed ? 'PASS' : 'FAIL'} (Score: ${result.score}/100)`);

    } catch (error) {
      result.passed = false;
      result.score = 0;
      result.findings.critical.push(`Security audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('[NetworkCleanup] Security audit failed:', error);
    }

    return result;
  }

  /**
   * Audit container privileges
   */
  private async auditContainerPrivileges(result: SecurityAuditResult): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}" | xargs -I {} docker inspect {} --format "{{.Name}}: {{.HostConfig.Privileged}}"'
      );

      if (stdout.includes('true')) {
        result.findings.critical.push('Containers running with privileged mode detected');
        result.recommendations.push('Remove privileged mode from container configurations');
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Audit port exposure
   */
  private async auditPortExposure(result: SecurityAuditResult): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}: {{.Ports}}"'
      );

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('0.0.0.0:') || line.includes(':::')) {
          result.findings.high.push(`Container has exposed ports: ${line}`);
          result.recommendations.push('Remove external port mappings and use internal networking only');
        }
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Audit volume mounts for security issues
   */
  private async auditVolumeMounts(result: SecurityAuditResult): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}" | xargs -I {} docker inspect {} --format "{{.Name}}: {{range .Mounts}}{{.Source}}:{{.Destination}}:{{.Mode}} {{end}}"'
      );

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        // Check for dangerous mount points
        if (line.includes('/:/') || line.includes('/etc:') || line.includes('/usr:')) {
          result.findings.critical.push(`Dangerous volume mount detected: ${line}`);
          result.recommendations.push('Restrict volume mounts to application-specific directories only');
        }

        // Check for read-write mounts to sensitive directories
        if (line.includes('/data/starships/') && line.includes(':rw') && !line.includes('credentials')) {
          result.findings.medium.push(`Read-write mount to sensitive directory: ${line}`);
        }
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Audit network isolation
   */
  private async auditNetworkIsolation(result: SecurityAuditResult): Promise<void> {
    try {
      // Check for containers on default bridge network
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}" | xargs -I {} docker inspect {} --format "{{.Name}}: {{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}"'
      );

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('bridge')) {
          result.findings.medium.push(`Container using default bridge network: ${line}`);
          result.recommendations.push('Ensure all containers use isolated custom networks');
        }
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Audit resource limits
   */
  private async auditResourceLimits(result: SecurityAuditResult): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}" | xargs -I {} docker inspect {} --format "{{.Name}}: CPU={{.HostConfig.CpuQuota}} MEM={{.HostConfig.Memory}}"'
      );

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('CPU=0') || line.includes('MEM=0')) {
          result.findings.medium.push(`Container without resource limits: ${line}`);
          result.recommendations.push('Set CPU and memory limits for all containers');
        }
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Audit environment variables for sensitive data
   */
  private async auditEnvironmentVariables(result: SecurityAuditResult): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "label=managed-by=starships" --format "{{.Names}}" | xargs -I {} docker inspect {} --format "{{.Name}}: {{range .Config.Env}}{{.}} {{end}}"'
      );

      const sensitivePatterns = [
        /[DEFAULT-PASSWORD]/i,
        /secret/i,
        /key.*=/i,
        /token/i,
        /credential/i
      ];

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        for (const pattern of sensitivePatterns) {
          if (pattern.test(line)) {
            result.findings.low.push(`Potentially sensitive environment variable: ${line}`);
            result.recommendations.push('Use Docker secrets or external secret management for sensitive data');
            break;
          }
        }
      }
    } catch (error) {
      // No containers or command failed
    }
  }

  /**
   * Calculate security score based on findings
   */
  private calculateSecurityScore(result: SecurityAuditResult): number {
    let score = 100;
    
    // Deduct points for findings
    score -= result.findings.critical.length * 25;  // -25 per critical
    score -= result.findings.high.length * 15;      // -15 per high
    score -= result.findings.medium.length * 10;    // -10 per medium
    score -= result.findings.low.length * 5;        // -5 per low

    return Math.max(0, score);
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalContainers: number;
    orphanedContainers: number;
    totalNetworks: number;
    orphanedNetworks: number;
    composeFiles: number;
    orphanedComposeFiles: number;
  }> {
    try {
      const [containers, orphanedContainers, networks, orphanedNetworks, composeFiles, orphanedComposeFiles] = await Promise.all([
        this.getTotalContainers(),
        this.findOrphanedContainers(),
        this.getTotalNetworks(),
        this.findOrphanedNetworks(),
        this.getTotalComposeFiles(),
        this.findOrphanedComposeFiles()
      ]);

      return {
        totalContainers: containers,
        orphanedContainers: orphanedContainers.length,
        totalNetworks: networks,
        orphanedNetworks: orphanedNetworks.length,
        composeFiles: composeFiles,
        orphanedComposeFiles: orphanedComposeFiles.length
      };
    } catch (error) {
      console.error('[NetworkCleanup] Failed to get cleanup stats:', error);
      return {
        totalContainers: 0,
        orphanedContainers: 0,
        totalNetworks: 0,
        orphanedNetworks: 0,
        composeFiles: 0,
        orphanedComposeFiles: 0
      };
    }
  }

  private async getTotalContainers(): Promise<number> {
    try {
      const { stdout } = await execAsync('docker ps -a --filter "label=managed-by=starships" --format "{{.ID}}"');
      return stdout.trim() ? stdout.trim().split('\n').length : 0;
    } catch {
      return 0;
    }
  }

  private async getTotalNetworks(): Promise<number> {
    try {
      const { stdout } = await execAsync('docker network ls --filter "label=managed-by=starships" --format "{{.ID}}"');
      return stdout.trim() ? stdout.trim().split('\n').length : 0;
    } catch {
      return 0;
    }
  }

  private async getTotalComposeFiles(): Promise<number> {
    try {
      const files = await fs.readdir('/data/docker/compose-files');
      return files.filter(f => f.startsWith('starship-') && f.endsWith('.yml')).length;
    } catch {
      return 0;
    }
  }
}