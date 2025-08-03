/**
 * ComposeFileManager - Handles incremental updates to Docker Compose files
 * 
 * This service manages Docker Compose configurations for MCP deployments with
 * atomic updates, versioning, and rollback capabilities. It ensures services
 * can be added, updated, or removed without disrupting other running services.
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MCPServerConnector } from '@starships/models';
import { DockerService, DockerComposeConfiguration, NetworkConfig } from './DockerComposeGenerator';

const execAsync = promisify(exec);

export interface ComposeUpdate {
  starshipId: string;
  serviceName: string;
  action: 'add' | 'update' | 'remove';
  service?: DockerService;
  timestamp: Date;
}

export interface ComposeVersion {
  version: number;
  filePath: string;
  timestamp: Date;
  hash: string;
  services: string[];
}

export interface UpdateResult {
  success: boolean;
  serviceName: string;
  action: string;
  containerId?: string;
  errors: string[];
  warnings: string[];
  duration: number;
}

export interface RollbackResult {
  success: boolean;
  targetVersion: number;
  servicesAffected: string[];
  errors: string[];
  duration: number;
}

/**
 * Manages Docker Compose files with incremental updates and versioning
 */
export class ComposeFileManager {
  private readonly composeDir = '/data/docker/compose-files';
  private readonly backupDir = '/data/docker/compose-backups';
  private readonly maxVersions = 10;

  constructor() {
    this.ensureDirectories();
  }

  /**
   * Add a new service to the compose file
   */
  async addService(
    starshipId: string, 
    serviceName: string, 
    service: DockerService
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    console.log(`[ComposeFileManager] Adding service ${serviceName} to starship ${starshipId}`);

    const result: UpdateResult = {
      success: true,
      serviceName,
      action: 'add',
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      const composePath = this.getComposePath(starshipId);
      
      // Create backup before making changes
      await this.createBackup(starshipId);

      // Load existing compose or create new
      let compose = await this.loadCompose(composePath);
      if (!compose) {
        compose = this.createEmptyCompose(starshipId);
        console.log(`[ComposeFileManager] Created new compose file for starship ${starshipId}`);
      }

      // Validate service doesn't already exist
      if (compose.services[serviceName]) {
        result.warnings.push(`Service ${serviceName} already exists, updating instead`);
        return this.updateService(starshipId, serviceName, service);
      }

      // Add new service
      compose.services[serviceName] = service;

      // Ensure network exists
      await this.ensureNetworks(compose);

      // Save updated compose
      await this.saveCompose(composePath, compose);

      // Apply changes - start only the new service
      result.containerId = await this.applyServiceOnly(starshipId, serviceName, 'up');

      console.log(`[ComposeFileManager] Successfully added service ${serviceName}`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to add service: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[ComposeFileManager] Error adding service ${serviceName}:`, error);

      // Attempt rollback on failure
      try {
        await this.rollbackLastChange(starshipId);
        result.warnings.push('Automatically rolled back failed changes');
      } catch (rollbackError) {
        result.errors.push(`Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`);
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Update an existing service in the compose file
   */
  async updateService(
    starshipId: string,
    serviceName: string,
    service: DockerService
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    console.log(`[ComposeFileManager] Updating service ${serviceName} in starship ${starshipId}`);

    const result: UpdateResult = {
      success: true,
      serviceName,
      action: 'update',
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      const composePath = this.getComposePath(starshipId);
      
      // Create backup before making changes
      await this.createBackup(starshipId);

      // Load existing compose
      const compose = await this.loadCompose(composePath);
      if (!compose) {
        result.errors.push('Compose file does not exist');
        result.success = false;
        return result;
      }

      // Validate service exists
      if (!compose.services[serviceName]) {
        result.warnings.push(`Service ${serviceName} does not exist, adding instead`);
        return this.addService(starshipId, serviceName, service);
      }

      // Store old service for comparison
      const oldService = compose.services[serviceName];

      // Update service
      compose.services[serviceName] = service;

      // Save updated compose
      await this.saveCompose(composePath, compose);

      // Determine if restart is needed
      const needsRestart = this.requiresRestart(oldService, service);
      if (needsRestart) {
        result.warnings.push('Service configuration changed, restarting container');
        result.containerId = await this.applyServiceOnly(starshipId, serviceName, 'restart');
      } else {
        result.warnings.push('No restart required, configuration updated');
      }

      console.log(`[ComposeFileManager] Successfully updated service ${serviceName}`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to update service: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[ComposeFileManager] Error updating service ${serviceName}:`, error);

      // Attempt rollback on failure
      try {
        await this.rollbackLastChange(starshipId);
        result.warnings.push('Automatically rolled back failed changes');
      } catch (rollbackError) {
        result.errors.push(`Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`);
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Remove a service from the compose file
   */
  async removeService(starshipId: string, serviceName: string): Promise<UpdateResult> {
    const startTime = Date.now();
    console.log(`[ComposeFileManager] Removing service ${serviceName} from starship ${starshipId}`);

    const result: UpdateResult = {
      success: true,
      serviceName,
      action: 'remove',
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      const composePath = this.getComposePath(starshipId);
      
      // Create backup before making changes
      await this.createBackup(starshipId);

      // Load existing compose
      const compose = await this.loadCompose(composePath);
      if (!compose) {
        result.warnings.push('Compose file does not exist, nothing to remove');
        return result;
      }

      // Validate service exists
      if (!compose.services[serviceName]) {
        result.warnings.push(`Service ${serviceName} does not exist, nothing to remove`);
        return result;
      }

      // Stop and remove the service first
      await this.applyServiceOnly(starshipId, serviceName, 'down');

      // Remove service from compose
      delete compose.services[serviceName];

      // Clean up unused networks if no services remain
      if (Object.keys(compose.services).length === 0) {
        await this.cleanupEmptyCompose(starshipId);
      } else {
        // Save updated compose
        await this.saveCompose(composePath, compose);
      }

      console.log(`[ComposeFileManager] Successfully removed service ${serviceName}`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to remove service: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[ComposeFileManager] Error removing service ${serviceName}:`, error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Get the current status of all services in a compose file
   */
  async getComposeStatus(starshipId: string): Promise<{
    exists: boolean;
    services: Record<string, {
      status: 'running' | 'stopped' | 'error' | 'unknown';
      containerId?: string;
      health?: 'healthy' | 'unhealthy' | 'starting';
    }>;
    networks: string[];
    lastModified?: Date;
  }> {
    const composePath = this.getComposePath(starshipId);
    
    try {
      // Check if compose file exists
      await fs.access(composePath);
      
      const compose = await this.loadCompose(composePath);
      if (!compose) {
        return { exists: false, services: {}, networks: [] };
      }

      const stats = await fs.stat(composePath);
      const serviceStatus: Record<string, any> = {};

      // Get container status for each service
      for (const serviceName of Object.keys(compose.services)) {
        try {
          const { stdout } = await execAsync(
            `docker compose -f ${composePath} ps --format json ${serviceName}`
          );
          
          if (stdout.trim()) {
            const containerInfo = JSON.parse(stdout.trim());
            serviceStatus[serviceName] = {
              status: this.parseContainerStatus(containerInfo.State),
              containerId: containerInfo.ID,
              health: containerInfo.Health?.Status
            };
          } else {
            serviceStatus[serviceName] = { status: 'stopped' };
          }
        } catch (error) {
          serviceStatus[serviceName] = { status: 'unknown' };
        }
      }

      return {
        exists: true,
        services: serviceStatus,
        networks: Object.keys(compose.networks || {}),
        lastModified: stats.mtime
      };

    } catch (error) {
      return { exists: false, services: {}, networks: [] };
    }
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(starshipId: string, targetVersion: number): Promise<RollbackResult> {
    const startTime = Date.now();
    console.log(`[ComposeFileManager] Rolling back starship ${starshipId} to version ${targetVersion}`);

    const result: RollbackResult = {
      success: true,
      targetVersion,
      servicesAffected: [],
      errors: [],
      duration: 0
    };

    try {
      const backupPath = this.getBackupPath(starshipId, targetVersion);
      const composePath = this.getComposePath(starshipId);

      // Verify backup exists
      await fs.access(backupPath);

      // Get current services for comparison
      const currentCompose = await this.loadCompose(composePath);
      const currentServices = Object.keys(currentCompose?.services || {});

      // Stop all current services
      if (currentServices.length > 0) {
        await this.stopAllServices(starshipId);
        result.servicesAffected = currentServices;
      }

      // Restore backup
      await fs.copyFile(backupPath, composePath);

      // Start services from restored compose
      const restoredCompose = await this.loadCompose(composePath);
      if (restoredCompose && Object.keys(restoredCompose.services).length > 0) {
        await this.startAllServices(starshipId);
      }

      console.log(`[ComposeFileManager] Successfully rolled back to version ${targetVersion}`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[ComposeFileManager] Rollback failed:`, error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * List available backup versions
   */
  async listVersions(starshipId: string): Promise<ComposeVersion[]> {
    try {
      const backupPattern = `starship-${starshipId}-*.yml`;
      const files = await fs.readdir(this.backupDir);
      const versions: ComposeVersion[] = [];

      for (const file of files) {
        if (file.startsWith(`starship-${starshipId}-`) && file.endsWith('.yml')) {
          const versionMatch = file.match(/starship-.+-(\d+)\.yml$/);
          if (versionMatch) {
            const version = parseInt(versionMatch[1]);
            const filePath = path.join(this.backupDir, file);
            const stats = await fs.stat(filePath);
            
            // Get service list from backup
            const compose = await this.loadCompose(filePath);
            const services = Object.keys(compose?.services || {});

            versions.push({
              version,
              filePath,
              timestamp: stats.mtime,
              hash: await this.calculateFileHash(filePath),
              services
            });
          }
        }
      }

      return versions.sort((a, b) => b.version - a.version);
    } catch (error) {
      console.error(`[ComposeFileManager] Error listing versions:`, error);
      return [];
    }
  }

  /**
   * Validate a compose configuration
   */
  async validateCompose(starshipId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const composePath = this.getComposePath(starshipId);
    const result: { valid: boolean; errors: string[]; warnings: string[] } = { 
      valid: true, 
      errors: [], 
      warnings: [] 
    };

    try {
      // Check if file exists
      await fs.access(composePath);

      // Validate with docker compose
      const { stderr } = await execAsync(`docker compose -f ${composePath} config -q`);
      
      if (stderr) {
        result.valid = false;
        result.errors.push(stderr);
      }

      // Additional validation
      const compose = await this.loadCompose(composePath);
      if (!compose) {
        result.valid = false;
        result.errors.push('Could not parse compose file');
        return result;
      }

      // Check for common issues
      if (!compose.services || Object.keys(compose.services).length === 0) {
        result.warnings.push('No services defined in compose file');
      }

      if (!compose.networks || Object.keys(compose.networks).length === 0) {
        result.warnings.push('No networks defined in compose file');
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Private helper methods
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.composeDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  private getComposePath(starshipId: string): string {
    return path.join(this.composeDir, `starship-${starshipId}.yml`);
  }

  private getBackupPath(starshipId: string, version?: number): string {
    const timestamp = version || Date.now();
    return path.join(this.backupDir, `starship-${starshipId}-${timestamp}.yml`);
  }

  private async loadCompose(filePath: string): Promise<DockerComposeConfiguration | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return yaml.load(content) as DockerComposeConfiguration;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  private async saveCompose(filePath: string, compose: DockerComposeConfiguration): Promise<void> {
    const yamlContent = yaml.dump(compose, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });

    await fs.writeFile(filePath, yamlContent, 'utf8');
  }

  private createEmptyCompose(starshipId: string): DockerComposeConfiguration {
    const networkName = `starship-${starshipId}`;
    
    return {
      version: '3.8',
      services: {},
      networks: {
        [networkName]: {
          driver: 'bridge',
          name: networkName,
          labels: {
            'starship.id': starshipId,
            'managed-by': 'starships',
            'created-at': new Date().toISOString()
          }
        }
      }
    };
  }

  private async ensureNetworks(compose: DockerComposeConfiguration): Promise<void> {
    if (!compose.networks) {
      return;
    }

    for (const [networkName, networkConfig] of Object.entries(compose.networks)) {
      try {
        await execAsync(`docker network inspect ${networkName}`);
        console.log(`[ComposeFileManager] Network ${networkName} already exists`);
      } catch (error) {
        // Network doesn't exist, create it
        try {
          await execAsync(`docker network create ${networkName} --driver bridge`);
          console.log(`[ComposeFileManager] Created network ${networkName}`);
        } catch (createError) {
          console.error(`[ComposeFileManager] Failed to create network ${networkName}:`, createError);
        }
      }
    }
  }

  private async applyServiceOnly(
    starshipId: string, 
    serviceName: string, 
    action: 'up' | 'down' | 'restart'
  ): Promise<string | undefined> {
    const composePath = this.getComposePath(starshipId);
    let containerId: string | undefined;

    try {
      switch (action) {
        case 'up':
          const { stdout: upOutput } = await execAsync(
            `docker compose -f ${composePath} up -d --no-recreate ${serviceName}`
          );
          // Extract container ID from output
          const upMatch = upOutput.match(/([a-f0-9]{12})/);
          containerId = upMatch ? upMatch[1] : undefined;
          break;

        case 'down':
          await execAsync(`docker compose -f ${composePath} stop ${serviceName}`);
          await execAsync(`docker compose -f ${composePath} rm -f ${serviceName}`);
          break;

        case 'restart':
          await execAsync(`docker compose -f ${composePath} restart ${serviceName}`);
          const { stdout: restartOutput } = await execAsync(
            `docker compose -f ${composePath} ps -q ${serviceName}`
          );
          containerId = restartOutput.trim();
          break;
      }

      console.log(`[ComposeFileManager] Applied ${action} to service ${serviceName}`);
      return containerId;

    } catch (error) {
      console.error(`[ComposeFileManager] Failed to ${action} service ${serviceName}:`, error);
      throw error;
    }
  }

  private async createBackup(starshipId: string): Promise<void> {
    const composePath = this.getComposePath(starshipId);
    const backupPath = this.getBackupPath(starshipId);

    try {
      await fs.access(composePath);
      await fs.copyFile(composePath, backupPath);
      
      // Clean up old backups
      await this.cleanupOldBackups(starshipId);
      
      console.log(`[ComposeFileManager] Created backup at ${backupPath}`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Original file doesn't exist, nothing to backup
        return;
      }
      throw error;
    }
  }

  private async cleanupOldBackups(starshipId: string): Promise<void> {
    try {
      const versions = await this.listVersions(starshipId);
      
      if (versions.length > this.maxVersions) {
        const toDelete = versions.slice(this.maxVersions);
        
        for (const version of toDelete) {
          await fs.unlink(version.filePath);
          console.log(`[ComposeFileManager] Deleted old backup version ${version.version}`);
        }
      }
    } catch (error) {
      console.warn(`[ComposeFileManager] Failed to cleanup old backups:`, error);
    }
  }

  private async rollbackLastChange(starshipId: string): Promise<void> {
    const versions = await this.listVersions(starshipId);
    
    if (versions.length > 0) {
      const lastVersion = versions[0];
      await this.rollbackToVersion(starshipId, lastVersion.version);
    }
  }

  private requiresRestart(oldService: DockerService, newService: DockerService): boolean {
    // Compare critical fields that require container restart
    const criticalFields: (keyof DockerService)[] = ['image', 'command', 'environment', 'volumes'];
    
    for (const field of criticalFields) {
      if (JSON.stringify(oldService[field]) !== JSON.stringify(newService[field])) {
        return true;
      }
    }
    
    return false;
  }

  private parseContainerStatus(state: string): 'running' | 'stopped' | 'error' | 'unknown' {
    switch (state?.toLowerCase()) {
      case 'running':
        return 'running';
      case 'exited':
      case 'stopped':
        return 'stopped';
      case 'error':
      case 'dead':
        return 'error';
      default:
        return 'unknown';
    }
  }

  private async stopAllServices(starshipId: string): Promise<void> {
    const composePath = this.getComposePath(starshipId);
    
    try {
      await execAsync(`docker compose -f ${composePath} down`);
      console.log(`[ComposeFileManager] Stopped all services for starship ${starshipId}`);
    } catch (error) {
      console.error(`[ComposeFileManager] Failed to stop services:`, error);
    }
  }

  private async startAllServices(starshipId: string): Promise<void> {
    const composePath = this.getComposePath(starshipId);
    
    try {
      await execAsync(`docker compose -f ${composePath} up -d`);
      console.log(`[ComposeFileManager] Started all services for starship ${starshipId}`);
    } catch (error) {
      console.error(`[ComposeFileManager] Failed to start services:`, error);
    }
  }

  private async cleanupEmptyCompose(starshipId: string): Promise<void> {
    const composePath = this.getComposePath(starshipId);
    
    try {
      await fs.unlink(composePath);
      console.log(`[ComposeFileManager] Removed empty compose file for starship ${starshipId}`);
    } catch (error) {
      console.error(`[ComposeFileManager] Failed to cleanup empty compose:`, error);
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      // Simple hash implementation - could use crypto module for production
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash).toString(16);
    } catch (error) {
      return 'unknown';
    }
  }
}