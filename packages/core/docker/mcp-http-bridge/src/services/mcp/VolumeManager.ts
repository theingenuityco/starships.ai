/**
 * VolumeManager - Manages Docker volume creation, permissions, and cleanup
 * 
 * This service handles the complete lifecycle of Docker volumes for MCP servers,
 * including directory structure creation, permission management, and secure isolation.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDockerServiceTemplate } from './DockerServiceTemplate';

const execAsync = promisify(exec);

export interface VolumeConfig {
  starshipId: string;
  templateSlug: string;
  volumeType: 'filesystem' | 'credentials' | 'memory' | 'workspace' | 'logs';
  permissions: 'rw' | 'ro';
  owner?: string;
  group?: string;
}

export interface VolumeInfo {
  path: string;
  exists: boolean;
  permissions: string;
  size: number;
  createdAt: Date;
  lastAccessed: Date;
}

export interface VolumeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BackupConfig {
  enabled: boolean;
  schedule?: string;
  retention?: number; // days
  destination?: string;
}

/**
 * Volume management service for MCP server containers
 */
export class VolumeManager {
  private static readonly BASE_PATH = '/data';
  private static readonly STARSHIPS_PATH = '/data/starships';
  private static readonly DOCKER_PATH = '/data/docker';
  private static readonly COMPOSE_FILES_PATH = '/data/docker/compose-files';
  private static readonly IMAGES_PATH = '/data/docker/images';
  
  // Security settings
  private static readonly STARSHIP_DIR_MODE = 0o750;  // rwxr-x---
  private static readonly VOLUME_DIR_MODE = 0o755;    // rwxr-xr-x
  private static readonly CREDENTIAL_DIR_MODE = 0o700; // rwx------
  private static readonly LOG_DIR_MODE = 0o755;       // rwxr-xr-x

  constructor() {
    this.ensureBaseDirectories();
  }

  /**
   * Ensure base directory structure exists
   */
  private async ensureBaseDirectories(): Promise<void> {
    try {
      console.log('[VolumeManager] Ensuring base directory structure');
      
      const directories = [
        VolumeManager.BASE_PATH,
        VolumeManager.STARSHIPS_PATH,
        VolumeManager.DOCKER_PATH,
        VolumeManager.COMPOSE_FILES_PATH,
        VolumeManager.IMAGES_PATH,
        path.join(VolumeManager.IMAGES_PATH, 'node'),
        path.join(VolumeManager.IMAGES_PATH, 'python')
      ];

      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true, mode: VolumeManager.VOLUME_DIR_MODE });
      }

      console.log('[VolumeManager] Base directory structure created');
    } catch (error) {
      console.error('[VolumeManager] Failed to create base directories:', error);
      throw error;
    }
  }

  /**
   * Create complete volume structure for a starship
   */
  async createStarshipVolumeStructure(starshipId: string): Promise<void> {
    console.log(`[VolumeManager] Creating volume structure for starship ${starshipId}`);

    try {
      const starshipPath = this.getStarshipPath(starshipId);
      
      // Create starship base directory
      await fs.mkdir(starshipPath, { recursive: true, mode: VolumeManager.STARSHIP_DIR_MODE });

      // Create standard volume subdirectories
      const volumeDirectories = [
        { name: 'filesystem', mode: VolumeManager.VOLUME_DIR_MODE },
        { name: 'credentials', mode: VolumeManager.CREDENTIAL_DIR_MODE },
        { name: 'memory', mode: VolumeManager.VOLUME_DIR_MODE },
        { name: 'workspace', mode: VolumeManager.VOLUME_DIR_MODE },
        { name: 'logs', mode: VolumeManager.LOG_DIR_MODE }
      ];

      for (const volumeDir of volumeDirectories) {
        const volumePath = path.join(starshipPath, volumeDir.name);
        await fs.mkdir(volumePath, { recursive: true, mode: volumeDir.mode });
        console.log(`[VolumeManager] Created volume directory: ${volumePath}`);
      }

      // Set proper ownership (if running as root/with sudo)
      await this.setVolumeOwnership(starshipPath);

      console.log(`[VolumeManager] Volume structure created for starship ${starshipId}`);
    } catch (error) {
      console.error(`[VolumeManager] Failed to create volume structure for ${starshipId}:`, error);
      throw error;
    }
  }

  /**
   * Create volumes for a specific MCP server template
   */
  async createTemplateVolumes(starshipId: string, templateSlug: string): Promise<void> {
    console.log(`[VolumeManager] Creating volumes for ${templateSlug} on starship ${starshipId}`);

    try {
      // Get template requirements
      const template = getDockerServiceTemplate(templateSlug);
      if (!template || !template.volumes) {
        console.log(`[VolumeManager] No volumes required for template ${templateSlug}`);
        return;
      }

      // Ensure starship structure exists
      await this.createStarshipVolumeStructure(starshipId);

      // Create template-specific volumes
      for (const volume of template.volumes) {
        const volumePath = volume.source.replace('{starshipId}', starshipId);
        const volumeDir = path.dirname(volumePath);
        const targetName = path.basename(volumePath);

        // Create the volume directory if it doesn't exist
        await fs.mkdir(volumePath, { recursive: true, mode: VolumeManager.VOLUME_DIR_MODE });

        // Set special permissions for credential volumes
        if (targetName.includes('credential')) {
          await fs.chmod(volumePath, VolumeManager.CREDENTIAL_DIR_MODE);
        }

        console.log(`[VolumeManager] Created template volume: ${volumePath}`);
      }

    } catch (error) {
      console.error(`[VolumeManager] Failed to create template volumes for ${templateSlug}:`, error);
      throw error;
    }
  }

  /**
   * Set proper ownership for volume directories
   */
  private async setVolumeOwnership(volumePath: string): Promise<void> {
    try {
      // In production, this would set proper user/group ownership
      // For now, we'll use a safe default that works in most environments
      
      // Check if we can change ownership (requires appropriate permissions)
      const { stdout } = await execAsync('id -u');
      const isRoot = stdout.trim() === '0';

      if (isRoot) {
        // Set ownership to a safe user (e.g., docker user if available)
        try {
          await execAsync(`chown -R 1000:1000 "${volumePath}"`);
          console.log(`[VolumeManager] Set ownership for ${volumePath}`);
        } catch (error) {
          console.warn(`[VolumeManager] Could not set ownership for ${volumePath}:`, error);
        }
      }
    } catch (error) {
      console.warn('[VolumeManager] Could not determine user ID for ownership:', error);
    }
  }

  /**
   * Validate volume structure and permissions
   */
  async validateVolumeStructure(starshipId: string): Promise<VolumeValidationResult> {
    const result: VolumeValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      console.log(`[VolumeManager] Validating volume structure for starship ${starshipId}`);

      const starshipPath = this.getStarshipPath(starshipId);
      
      // Check if starship directory exists
      try {
        await fs.access(starshipPath);
      } catch {
        result.errors.push(`Starship directory does not exist: ${starshipPath}`);
        result.isValid = false;
        return result;
      }

      // Validate standard directories
      const requiredDirs = ['filesystem', 'credentials', 'memory', 'workspace', 'logs'];
      
      for (const dirName of requiredDirs) {
        const dirPath = path.join(starshipPath, dirName);
        
        try {
          const stats = await fs.stat(dirPath);
          
          if (!stats.isDirectory()) {
            result.errors.push(`${dirName} is not a directory: ${dirPath}`);
            result.isValid = false;
          }

          // Check permissions
          const mode = stats.mode & parseInt('777', 8);
          const expectedMode = dirName === 'credentials' 
            ? VolumeManager.CREDENTIAL_DIR_MODE & parseInt('777', 8)
            : VolumeManager.VOLUME_DIR_MODE & parseInt('777', 8);

          if (mode !== expectedMode) {
            result.warnings.push(
              `Incorrect permissions for ${dirName}: got ${mode.toString(8)}, expected ${expectedMode.toString(8)}`
            );
          }

        } catch (error) {
          result.errors.push(`Cannot access ${dirName} directory: ${dirPath}`);
          result.isValid = false;
        }
      }

      // Check disk space
      const diskUsage = await this.getDiskUsage(starshipPath);
      if (diskUsage > 0.9) { // 90% full
        result.warnings.push(`Volume disk usage is high: ${(diskUsage * 100).toFixed(1)}%`);
      }

      console.log(`[VolumeManager] Validation completed for ${starshipId}: ${result.isValid ? 'PASS' : 'FAIL'}`);
      
    } catch (error) {
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Get disk usage for a path
   */
  private async getDiskUsage(volumePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`df "${volumePath}" | tail -1 | awk '{print $5}' | sed 's/%//'`);
      return parseInt(stdout.trim()) / 100;
    } catch (error) {
      console.warn(`[VolumeManager] Could not get disk usage for ${volumePath}:`, error);
      return 0;
    }
  }

  /**
   * Get volume information
   */
  async getVolumeInfo(starshipId: string, volumeType: string): Promise<VolumeInfo | null> {
    try {
      const volumePath = path.join(this.getStarshipPath(starshipId), volumeType);
      const stats = await fs.stat(volumePath);

      return {
        path: volumePath,
        exists: true,
        permissions: (stats.mode & parseInt('777', 8)).toString(8),
        size: await this.getDirectorySize(volumePath),
        createdAt: stats.birthtime,
        lastAccessed: stats.atime
      };
    } catch (error) {
      console.warn(`[VolumeManager] Could not get volume info for ${starshipId}/${volumeType}:`, error);
      return null;
    }
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sb "${dirPath}" | cut -f1`);
      return parseInt(stdout.trim());
    } catch (error) {
      console.warn(`[VolumeManager] Could not get directory size for ${dirPath}:`, error);
      return 0;
    }
  }

  /**
   * Clean up all volumes for a starship
   */
  async cleanupStarshipVolumes(starshipId: string): Promise<boolean> {
    console.log(`[VolumeManager] Cleaning up volumes for starship ${starshipId}`);

    try {
      const starshipPath = this.getStarshipPath(starshipId);
      
      // Check if directory exists
      try {
        await fs.access(starshipPath);
      } catch {
        console.log(`[VolumeManager] Volume directory does not exist for ${starshipId}`);
        return true; // Already cleaned up
      }

      // Remove the entire starship directory
      await fs.rm(starshipPath, { recursive: true, force: true });
      
      console.log(`[VolumeManager] Successfully cleaned up volumes for starship ${starshipId}`);
      return true;
    } catch (error) {
      console.error(`[VolumeManager] Failed to cleanup volumes for ${starshipId}:`, error);
      return false;
    }
  }

  /**
   * Create backup of starship volumes
   */
  async createVolumeBackup(starshipId: string, backupConfig: BackupConfig): Promise<string | null> {
    if (!backupConfig.enabled) {
      console.log(`[VolumeManager] Backup disabled for starship ${starshipId}`);
      return null;
    }

    console.log(`[VolumeManager] Creating backup for starship ${starshipId}`);

    try {
      const starshipPath = this.getStarshipPath(starshipId);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `starship-${starshipId}-${timestamp}.tar.gz`;
      const backupPath = path.join(backupConfig.destination || '/tmp', backupName);

      // Create compressed backup
      await execAsync(`tar -czf "${backupPath}" -C "${path.dirname(starshipPath)}" "${path.basename(starshipPath)}"`);

      console.log(`[VolumeManager] Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error(`[VolumeManager] Backup failed for ${starshipId}:`, error);
      return null;
    }
  }

  /**
   * Restore volumes from backup
   */
  async restoreVolumeBackup(starshipId: string, backupPath: string): Promise<boolean> {
    console.log(`[VolumeManager] Restoring volumes for starship ${starshipId} from ${backupPath}`);

    try {
      // Verify backup file exists
      await fs.access(backupPath);

      // Clean existing volumes
      await this.cleanupStarshipVolumes(starshipId);

      // Extract backup
      const starshipsPath = VolumeManager.STARSHIPS_PATH;
      await execAsync(`tar -xzf "${backupPath}" -C "${starshipsPath}"`);

      console.log(`[VolumeManager] Successfully restored volumes for starship ${starshipId}`);
      return true;
    } catch (error) {
      console.error(`[VolumeManager] Restore failed for ${starshipId}:`, error);
      return false;
    }
  }

  /**
   * List all starship volumes
   */
  async listStarshipVolumes(): Promise<{ starshipId: string; volumeCount: number; totalSize: number }[]> {
    try {
      const starshipDirs = await fs.readdir(VolumeManager.STARSHIPS_PATH);
      const results = [];

      for (const starshipId of starshipDirs) {
        const starshipPath = this.getStarshipPath(starshipId);
        
        try {
          const stat = await fs.stat(starshipPath);
          if (stat.isDirectory()) {
            const volumeDirs = await fs.readdir(starshipPath);
            const totalSize = await this.getDirectorySize(starshipPath);
            
            results.push({
              starshipId,
              volumeCount: volumeDirs.length,
              totalSize
            });
          }
        } catch (error) {
          console.warn(`[VolumeManager] Could not read starship directory ${starshipId}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('[VolumeManager] Failed to list starship volumes:', error);
      return [];
    }
  }

  /**
   * Test volume isolation between starships
   */
  async testVolumeIsolation(starshipId1: string, starshipId2: string): Promise<boolean> {
    console.log(`[VolumeManager] Testing volume isolation between ${starshipId1} and ${starshipId2}`);

    try {
      // Create test data in starship1
      const testFile1 = path.join(this.getStarshipPath(starshipId1), 'workspace', 'test.txt');
      const testData1 = `Test data for ${starshipId1}`;
      await fs.writeFile(testFile1, testData1);

      // Create test data in starship2
      const testFile2 = path.join(this.getStarshipPath(starshipId2), 'workspace', 'test.txt');
      const testData2 = `Test data for ${starshipId2}`;
      await fs.writeFile(testFile2, testData2);

      // Verify data integrity
      const readData1 = await fs.readFile(testFile1, 'utf8');
      const readData2 = await fs.readFile(testFile2, 'utf8');

      const isolated = readData1 === testData1 && readData2 === testData2;

      // Cleanup test files
      await fs.unlink(testFile1).catch(() => {});
      await fs.unlink(testFile2).catch(() => {});

      console.log(`[VolumeManager] Volume isolation test: ${isolated ? 'PASS' : 'FAIL'}`);
      return isolated;
    } catch (error) {
      console.error('[VolumeManager] Volume isolation test failed:', error);
      return false;
    }
  }

  /**
   * Get starship volume path
   */
  private getStarshipPath(starshipId: string): string {
    return path.join(VolumeManager.STARSHIPS_PATH, starshipId);
  }

  /**
   * Get volume mount paths for Docker Compose
   */
  getVolumeMountPaths(starshipId: string, templateSlug: string): string[] {
    const template = getDockerServiceTemplate(templateSlug);
    if (!template || !template.volumes) {
      return [];
    }

    return template.volumes.map(volume => {
      const hostPath = volume.source.replace('{starshipId}', starshipId);
      return `${hostPath}:${volume.target}:${volume.mode}`;
    });
  }

  /**
   * Monitor volume usage
   */
  async getVolumeUsageStats(): Promise<{
    totalStarships: number;
    totalVolumes: number;
    totalSize: number;
    averageSize: number;
    diskUsage: number;
  }> {
    try {
      const starshipVolumes = await this.listStarshipVolumes();
      const totalSize = starshipVolumes.reduce((sum, sv) => sum + sv.totalSize, 0);
      const totalVolumes = starshipVolumes.reduce((sum, sv) => sum + sv.volumeCount, 0);
      const diskUsage = await this.getDiskUsage(VolumeManager.STARSHIPS_PATH);

      return {
        totalStarships: starshipVolumes.length,
        totalVolumes,
        totalSize,
        averageSize: starshipVolumes.length > 0 ? totalSize / starshipVolumes.length : 0,
        diskUsage
      };
    } catch (error) {
      console.error('[VolumeManager] Failed to get usage stats:', error);
      return {
        totalStarships: 0,
        totalVolumes: 0,
        totalSize: 0,
        averageSize: 0,
        diskUsage: 0
      };
    }
  }
}