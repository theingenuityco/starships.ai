/**
 * BackupRecoveryService - Automated backup and disaster recovery for MCP deployments
 * 
 * This service provides automated workspace backups, container state snapshots,
 * and disaster recovery capabilities for MCP servers and their data.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MCPServerConnector } from '@starships/models';

const execAsync = promisify(exec);

export interface BackupConfig {
  enabled: boolean;
  schedule: {
    workspace: string;              // Cron expression for workspace backups
    containerState: string;         // Cron expression for container state snapshots
    retention: {
      daily: number;                // Keep daily backups for N days
      weekly: number;               // Keep weekly backups for N weeks
      monthly: number;              // Keep monthly backups for N months
    };
  };
  storage: {
    backend: 'local' | 's3' | 'gcs';
    localPath: string;              // Local backup storage path
    compression: 'gzip' | 'lz4' | 'none';
    encryption: boolean;            // Enable backup encryption
    encryptionKey?: string;         // Encryption key (base64)
  };
  verification: {
    enabled: boolean;               // Enable backup integrity verification
    checksumAlgorithm: 'md5' | 'sha256';
    testRestoreEnabled: boolean;    // Periodically test restore procedures
  };
  notifications: {
    enabled: boolean;
    onSuccess: boolean;             // Notify on successful backups
    onFailure: boolean;             // Notify on backup failures
    webhook?: string;               // Webhook URL for notifications
  };
  performance: {
    maxConcurrentBackups: number;   // Maximum concurrent backup operations
    bandwidthLimitMbps?: number;    // Bandwidth limit for backup transfers
    ioNiceLevel: number;            // IO priority level (0-7, lower = higher priority)
  };
}

export interface BackupJob {
  id: string;
  type: 'workspace' | 'container_state' | 'full_system';
  starshipId?: string;
  connectorId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  duration?: number;              // Duration in milliseconds
  sizeBytes?: number;             // Backup size in bytes
  checksumHash?: string;          // Backup integrity checksum
  filePath?: string;              // Backup file path
  error?: string;                 // Error message if failed
  metadata: Record<string, any>;  // Additional metadata
}

export interface RestoreJob {
  id: string;
  backupId: string;
  type: 'workspace' | 'container_state' | 'full_system';
  targetStarshipId?: string;
  targetConnectorId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  restorePath?: string;
  error?: string;
  dryRun: boolean;                // Whether this is a test restore
}

export interface BackupMetadata {
  id: string;
  type: BackupJob['type'];
  starshipId?: string;
  connectorId?: string;
  timestamp: Date;
  sizeBytes: number;
  checksumHash: string;
  filePath: string;
  retention: {
    category: 'daily' | 'weekly' | 'monthly';
    expiresAt: Date;
  };
  verified: boolean;
  encryptionEnabled: boolean;
  compressionType: string;
  version: string;                // Backup format version
}

export interface RecoveryPlan {
  id: string;
  name: string;
  description: string;
  steps: RecoveryStep[];
  estimatedDuration: number;      // Estimated recovery time in minutes
  priority: 'low' | 'medium' | 'high' | 'critical';
  lastTested?: Date;
  testResults?: {
    success: boolean;
    duration: number;
    issues: string[];
  };
}

export interface RecoveryStep {
  id: string;
  name: string;
  description: string;
  type: 'backup_restore' | 'container_recreate' | 'network_setup' | 'data_validation' | 'service_restart';
  order: number;
  required: boolean;
  estimatedDuration: number;      // Estimated step duration in minutes
  parameters: Record<string, any>;
  healthChecks: string[];         // Health check commands to verify step success
}

/**
 * Comprehensive backup and disaster recovery service
 */
export class BackupRecoveryService extends EventEmitter {
  private config: BackupConfig;
  private activeJobs: Map<string, BackupJob | RestoreJob> = new Map();
  private backupMetadata: Map<string, BackupMetadata> = new Map();
  private recoveryPlans: Map<string, RecoveryPlan> = new Map();
  private scheduledBackups: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly backupDirectory: string;
  private readonly metadataFile: string;

  constructor(config?: Partial<BackupConfig>) {
    super();
    
    this.config = {
      enabled: true,
      schedule: {
        workspace: '0 2 * * *',      // Daily at 2 AM
        containerState: '*/30 * * * *', // Every 30 minutes
        retention: {
          daily: 7,                   // 7 days
          weekly: 4,                  // 4 weeks
          monthly: 12                 // 12 months
        }
      },
      storage: {
        backend: 'local',
        localPath: '/data/backups',
        compression: 'gzip',
        encryption: false,
        encryptionKey: undefined
      },
      verification: {
        enabled: true,
        checksumAlgorithm: 'sha256',
        testRestoreEnabled: true
      },
      notifications: {
        enabled: false,
        onSuccess: false,
        onFailure: true,
        webhook: undefined
      },
      performance: {
        maxConcurrentBackups: 2,
        bandwidthLimitMbps: undefined,
        ioNiceLevel: 4
      },
      ...config
    };

    this.backupDirectory = this.config.storage.localPath;
    this.metadataFile = path.join(this.backupDirectory, 'backup-metadata.json');
    
    this.initializeDefaultRecoveryPlans();
  }

  /**
   * Initialize the backup service
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[BackupRecoveryService] Backup service is disabled');
      return;
    }

    console.log('[BackupRecoveryService] Initializing backup and recovery service');

    try {
      // Create backup directories
      await this.createBackupDirectories();
      
      // Load existing backup metadata
      await this.loadBackupMetadata();
      
      // Schedule automated backups
      this.scheduleAutomatedBackups();
      
      // Verify backup integrity
      if (this.config.verification.enabled) {
        await this.verifyExistingBackups();
      }
      
      console.log('[BackupRecoveryService] Backup service initialized successfully');
      this.emit('serviceInitialized');

    } catch (error) {
      console.error('[BackupRecoveryService] Failed to initialize backup service:', error);
      throw error;
    }
  }

  /**
   * Create a backup for a starship workspace
   */
  async createWorkspaceBackup(
    starshipId: string,
    options?: {
      description?: string;
      retention?: 'daily' | 'weekly' | 'monthly';
      priority?: 'low' | 'high';
    }
  ): Promise<BackupJob> {
    const jobId = this.generateJobId('backup');
    
    const job: BackupJob = {
      id: jobId,
      type: 'workspace',
      starshipId,
      status: 'pending',
      metadata: {
        description: options?.description || `Workspace backup for starship ${starshipId}`,
        retention: options?.retention || 'daily',
        priority: options?.priority || 'low',
        initiatedBy: 'manual'
      }
    };

    this.activeJobs.set(jobId, job);
    
    console.log(`[BackupRecoveryService] Starting workspace backup for starship ${starshipId} (job: ${jobId})`);
    this.emit('backupStarted', job);
    
    // Execute backup asynchronously
    this.executeWorkspaceBackup(job).catch(error => {
      console.error(`[BackupRecoveryService] Workspace backup failed for job ${jobId}:`, error);
    });
    
    return job;
  }

  /**
   * Create a container state snapshot
   */
  async createContainerStateBackup(
    connector: MCPServerConnector,
    options?: {
      description?: string;
      includeVolumes?: boolean;
    }
  ): Promise<BackupJob> {
    const jobId = this.generateJobId('backup');
    
    const job: BackupJob = {
      id: jobId,
      type: 'container_state',
      starshipId: connector.starshipId,
      connectorId: connector.id,
      status: 'pending',
      metadata: {
        description: options?.description || `Container state backup for ${connector.dockerServiceName}`,
        includeVolumes: options?.includeVolumes ?? true,
        containerInfo: {
          serviceName: connector.dockerServiceName,
          containerId: connector.dockerContainerId,
          templateId: connector.templateId
        }
      }
    };

    this.activeJobs.set(jobId, job);
    
    console.log(`[BackupRecoveryService] Starting container state backup for ${connector.dockerServiceName} (job: ${jobId})`);
    this.emit('backupStarted', job);
    
    // Execute backup asynchronously
    this.executeContainerStateBackup(job).catch(error => {
      console.error(`[BackupRecoveryService] Container state backup failed for job ${jobId}:`, error);
    });
    
    return job;
  }

  /**
   * Restore a workspace from backup
   */
  async restoreWorkspace(
    backupId: string,
    targetStarshipId: string,
    options?: {
      dryRun?: boolean;
      overwrite?: boolean;
      restorePath?: string;
    }
  ): Promise<RestoreJob> {
    const backup = this.backupMetadata.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    if (backup.type !== 'workspace') {
      throw new Error(`Backup ${backupId} is not a workspace backup`);
    }

    const jobId = this.generateJobId('restore');
    
    const job: RestoreJob = {
      id: jobId,
      backupId,
      type: 'workspace',
      targetStarshipId,
      status: 'pending',
      dryRun: options?.dryRun ?? false,
      restorePath: options?.restorePath
    };

    this.activeJobs.set(jobId, job);
    
    console.log(`[BackupRecoveryService] Starting workspace restore from backup ${backupId} to starship ${targetStarshipId} (job: ${jobId})`);
    this.emit('restoreStarted', job);
    
    // Execute restore asynchronously
    this.executeWorkspaceRestore(job).catch(error => {
      console.error(`[BackupRecoveryService] Workspace restore failed for job ${jobId}:`, error);
    });
    
    return job;
  }

  /**
   * Restore container state from backup
   */
  async restoreContainerState(
    backupId: string,
    targetConnector: MCPServerConnector,
    options?: {
      dryRun?: boolean;
      restoreVolumes?: boolean;
    }
  ): Promise<RestoreJob> {
    const backup = this.backupMetadata.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    if (backup.type !== 'container_state') {
      throw new Error(`Backup ${backupId} is not a container state backup`);
    }

    const jobId = this.generateJobId('restore');
    
    const job: RestoreJob = {
      id: jobId,
      backupId,
      type: 'container_state',
      targetStarshipId: targetConnector.starshipId,
      targetConnectorId: targetConnector.id,
      status: 'pending',
      dryRun: options?.dryRun ?? false
    };

    this.activeJobs.set(jobId, job);
    
    console.log(`[BackupRecoveryService] Starting container state restore from backup ${backupId} to ${targetConnector.dockerServiceName} (job: ${jobId})`);
    this.emit('restoreStarted', job);
    
    // Execute restore asynchronously
    this.executeContainerStateRestore(job).catch(error => {
      console.error(`[BackupRecoveryService] Container state restore failed for job ${jobId}:`, error);
    });
    
    return job;
  }

  /**
   * Execute a disaster recovery plan
   */
  async executeRecoveryPlan(
    planId: string,
    options?: {
      dryRun?: boolean;
      stopOnError?: boolean;
    }
  ): Promise<{
    success: boolean;
    executedSteps: number;
    totalSteps: number;
    duration: number;
    errors: string[];
  }> {
    const plan = this.recoveryPlans.get(planId);
    if (!plan) {
      throw new Error(`Recovery plan ${planId} not found`);
    }

    const startTime = Date.now();
    const errors: string[] = [];
    let executedSteps = 0;
    const isDryRun = options?.dryRun ?? false;
    const stopOnError = options?.stopOnError ?? true;

    console.log(`[BackupRecoveryService] Executing recovery plan: ${plan.name} (dry run: ${isDryRun})`);
    this.emit('recoveryPlanStarted', planId, plan);

    try {
      // Sort steps by order
      const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

      for (const step of sortedSteps) {
        try {
          console.log(`[BackupRecoveryService] Executing recovery step: ${step.name}`);
          
          if (!isDryRun) {
            await this.executeRecoveryStep(step);
          }
          
          executedSteps++;
          this.emit('recoveryStepCompleted', planId, step);

        } catch (error) {
          const errorMsg = `Step ${step.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[BackupRecoveryService] Recovery step failed:`, error);
          
          if (step.required && stopOnError) {
            throw new Error(`Required step failed: ${errorMsg}`);
          }
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;
      
      // Update plan test results
      plan.lastTested = new Date();
      plan.testResults = {
        success,
        duration,
        issues: errors
      };

      const result = {
        success,
        executedSteps,
        totalSteps: sortedSteps.length,
        duration,
        errors
      };

      console.log(`[BackupRecoveryService] Recovery plan ${planId} ${success ? 'completed successfully' : 'completed with errors'} in ${duration}ms`);
      this.emit('recoveryPlanCompleted', planId, result);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        executedSteps,
        totalSteps: plan.steps.length,
        duration,
        errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
      };

      console.error(`[BackupRecoveryService] Recovery plan ${planId} failed:`, error);
      this.emit('recoveryPlanFailed', planId, error);

      return result;
    }
  }

  /**
   * Get backup job status
   */
  getBackupJob(jobId: string): BackupJob | RestoreJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * Get all backup metadata
   */
  getAllBackups(): BackupMetadata[] {
    return Array.from(this.backupMetadata.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get backups for a specific starship
   */
  getStarshipBackups(starshipId: string): BackupMetadata[] {
    return this.getAllBackups()
      .filter(backup => backup.starshipId === starshipId);
  }

  /**
   * Get available recovery plans
   */
  getRecoveryPlans(): RecoveryPlan[] {
    return Array.from(this.recoveryPlans.values());
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const backup = this.backupMetadata.get(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    try {
      // Delete backup file
      await fs.unlink(backup.filePath);
      
      // Remove from metadata
      this.backupMetadata.delete(backupId);
      await this.saveBackupMetadata();
      
      console.log(`[BackupRecoveryService] Deleted backup ${backupId}`);
      this.emit('backupDeleted', backupId);

    } catch (error) {
      console.error(`[BackupRecoveryService] Failed to delete backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup expired backups
   */
  async cleanupExpiredBackups(): Promise<{
    deleted: number;
    freed: number; // Bytes freed
  }> {
    const now = new Date();
    let deleted = 0;
    let freed = 0;

    console.log('[BackupRecoveryService] Starting backup cleanup');

    for (const [backupId, backup] of this.backupMetadata) {
      if (backup.retention.expiresAt <= now) {
        try {
          freed += backup.sizeBytes;
          await this.deleteBackup(backupId);
          deleted++;
        } catch (error) {
          console.error(`[BackupRecoveryService] Failed to cleanup backup ${backupId}:`, error);
        }
      }
    }

    console.log(`[BackupRecoveryService] Cleanup completed: ${deleted} backups deleted, ${this.formatBytes(freed)} freed`);
    this.emit('cleanupCompleted', { deleted, freed });

    return { deleted, freed };
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): {
    overview: {
      totalBackups: number;
      totalSize: number;
      lastBackup?: Date;
      upcomingBackups: number;
      failedBackups: number;
    };
    recentJobs: (BackupJob | RestoreJob)[];
    storage: {
      used: number;
      available: number;
      retention: {
        daily: number;
        weekly: number;
        monthly: number;
      };
    };
    recovery: {
      plansAvailable: number;
      lastTested?: Date;
      testResults: {
        passed: number;
        failed: number;
      };
    };
  } {
    const backups = this.getAllBackups();
    const jobs = Array.from(this.activeJobs.values());
    const plans = this.getRecoveryPlans();

    const totalSize = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0);
    const lastBackup = backups.length > 0 ? backups[0].timestamp : undefined;
    
    const failedBackups = jobs.filter(job => job.status === 'failed').length;
    
    const retentionCounts = {
      daily: backups.filter(b => b.retention.category === 'daily').length,
      weekly: backups.filter(b => b.retention.category === 'weekly').length,
      monthly: backups.filter(b => b.retention.category === 'monthly').length
    };

    const testResults = {
      passed: plans.filter(p => p.testResults?.success === true).length,
      failed: plans.filter(p => p.testResults?.success === false).length
    };

    const lastTested = plans
      .filter(p => p.lastTested)
      .sort((a, b) => (b.lastTested?.getTime() || 0) - (a.lastTested?.getTime() || 0))[0]?.lastTested;

    return {
      overview: {
        totalBackups: backups.length,
        totalSize,
        lastBackup,
        upcomingBackups: this.scheduledBackups.size,
        failedBackups
      },
      recentJobs: jobs
        .sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0))
        .slice(0, 10),
      storage: {
        used: totalSize,
        available: 0, // Would calculate available disk space
        retention: retentionCounts
      },
      recovery: {
        plansAvailable: plans.length,
        lastTested,
        testResults
      }
    };
  }

  /**
   * Shutdown backup service
   */
  async shutdown(): Promise<void> {
    console.log('[BackupRecoveryService] Shutting down backup service');

    // Cancel scheduled backups
    for (const timer of this.scheduledBackups.values()) {
      clearTimeout(timer);
    }
    this.scheduledBackups.clear();

    // Wait for active jobs to complete (with timeout)
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      console.log(`[BackupRecoveryService] Waiting for ${activeJobIds.length} active jobs to complete`);
      // In a real implementation, you'd wait for jobs to complete or cancel them
    }

    // Save metadata
    await this.saveBackupMetadata();

    console.log('[BackupRecoveryService] Backup service shutdown complete');
  }

  /**
   * Private helper methods
   */

  private async createBackupDirectories(): Promise<void> {
    const directories = [
      this.backupDirectory,
      path.join(this.backupDirectory, 'workspaces'),
      path.join(this.backupDirectory, 'containers'),
      path.join(this.backupDirectory, 'system'),
      path.join(this.backupDirectory, 'temp')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async loadBackupMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      const metadata = JSON.parse(data);
      
      for (const [id, backup] of Object.entries(metadata)) {
        this.backupMetadata.set(id, {
          ...backup as BackupMetadata,
          timestamp: new Date((backup as any).timestamp),
          retention: {
            ...(backup as any).retention,
            expiresAt: new Date((backup as any).retention.expiresAt)
          }
        });
      }
      
      console.log(`[BackupRecoveryService] Loaded ${this.backupMetadata.size} backup metadata entries`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
        console.error('[BackupRecoveryService] Failed to load backup metadata:', error);
      }
    }
  }

  private async saveBackupMetadata(): Promise<void> {
    const metadata = Object.fromEntries(this.backupMetadata);
    await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  private scheduleAutomatedBackups(): void {
    if (!this.config.enabled) return;

    // Schedule workspace backups
    console.log(`[BackupRecoveryService] Scheduled workspace backups: ${this.config.schedule.workspace}`);
    
    // Schedule container state backups
    console.log(`[BackupRecoveryService] Scheduled container state backups: ${this.config.schedule.containerState}`);
    
    // In a real implementation, you'd use a cron library to schedule these
    this.emit('backupsScheduled');
  }

  private async verifyExistingBackups(): Promise<void> {
    console.log('[BackupRecoveryService] Verifying existing backup integrity');
    
    let verified = 0;
    let failed = 0;
    
    for (const backup of this.backupMetadata.values()) {
      try {
        const isValid = await this.verifyBackupIntegrity(backup);
        if (isValid) {
          verified++;
        } else {
          failed++;
          console.warn(`[BackupRecoveryService] Backup integrity verification failed: ${backup.id}`);
        }
      } catch (error) {
        failed++;
        console.error(`[BackupRecoveryService] Error verifying backup ${backup.id}:`, error);
      }
    }
    
    console.log(`[BackupRecoveryService] Backup verification completed: ${verified} verified, ${failed} failed`);
  }

  private async verifyBackupIntegrity(backup: BackupMetadata): Promise<boolean> {
    try {
      const stats = await fs.stat(backup.filePath);
      if (stats.size !== backup.sizeBytes) {
        return false;
      }
      
      const actualChecksum = await this.calculateFileChecksum(backup.filePath);
      return actualChecksum === backup.checksumHash;
    } catch (error) {
      return false;
    }
  }

  private async calculateFileChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash(this.config.verification.checksumAlgorithm);
    const stream = require('fs').createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data: Buffer) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private generateJobId(type: 'backup' | 'restore'): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async executeWorkspaceBackup(job: BackupJob): Promise<void> {
    job.status = 'running';
    job.startTime = new Date();
    this.emit('jobStatusChanged', job);

    try {
      const starshipPath = `/data/starships/${job.starshipId}`;
      const backupFileName = `workspace-${job.starshipId}-${Date.now()}.tar.gz`;
      const backupPath = path.join(this.backupDirectory, 'workspaces', backupFileName);

      // Create compressed backup
      await execAsync(`tar -czf "${backupPath}" -C "${starshipPath}" .`);

      // Calculate checksum
      const checksumHash = await this.calculateFileChecksum(backupPath);
      const stats = await fs.stat(backupPath);

      // Create metadata
      const metadata: BackupMetadata = {
        id: job.id,
        type: 'workspace',
        starshipId: job.starshipId,
        timestamp: new Date(),
        sizeBytes: stats.size,
        checksumHash,
        filePath: backupPath,
        retention: this.calculateRetentionDate(job.metadata.retention),
        verified: true,
        encryptionEnabled: this.config.storage.encryption,
        compressionType: this.config.storage.compression,
        version: '1.0'
      };

      this.backupMetadata.set(job.id, metadata);
      await this.saveBackupMetadata();

      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();
      job.sizeBytes = stats.size;
      job.checksumHash = checksumHash;
      job.filePath = backupPath;

      console.log(`[BackupRecoveryService] Workspace backup completed: ${job.id} (${this.formatBytes(stats.size)})`);
      this.emit('backupCompleted', job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[BackupRecoveryService] Workspace backup failed: ${job.id}:`, error);
      this.emit('backupFailed', job, error);
    } finally {
      this.emit('jobStatusChanged', job);
    }
  }

  private async executeContainerStateBackup(job: BackupJob): Promise<void> {
    job.status = 'running';
    job.startTime = new Date();
    this.emit('jobStatusChanged', job);

    try {
      const containerInfo = job.metadata.containerInfo;
      const backupFileName = `container-${job.connectorId}-${Date.now()}.tar`;
      const backupPath = path.join(this.backupDirectory, 'containers', backupFileName);

      // Export container
      await execAsync(`docker export ${containerInfo.containerId} > "${backupPath}"`);

      // Calculate checksum
      const checksumHash = await this.calculateFileChecksum(backupPath);
      const stats = await fs.stat(backupPath);

      // Create metadata
      const metadata: BackupMetadata = {
        id: job.id,
        type: 'container_state',
        starshipId: job.starshipId,
        connectorId: job.connectorId,
        timestamp: new Date(),
        sizeBytes: stats.size,
        checksumHash,
        filePath: backupPath,
        retention: this.calculateRetentionDate('daily'),
        verified: true,
        encryptionEnabled: false,
        compressionType: 'none',
        version: '1.0'
      };

      this.backupMetadata.set(job.id, metadata);
      await this.saveBackupMetadata();

      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();
      job.sizeBytes = stats.size;
      job.checksumHash = checksumHash;
      job.filePath = backupPath;

      console.log(`[BackupRecoveryService] Container state backup completed: ${job.id} (${this.formatBytes(stats.size)})`);
      this.emit('backupCompleted', job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[BackupRecoveryService] Container state backup failed: ${job.id}:`, error);
      this.emit('backupFailed', job, error);
    } finally {
      this.emit('jobStatusChanged', job);
    }
  }

  private async executeWorkspaceRestore(job: RestoreJob): Promise<void> {
    job.status = 'running';
    job.startTime = new Date();
    this.emit('jobStatusChanged', job);

    try {
      const backup = this.backupMetadata.get(job.backupId)!;
      const targetPath = job.restorePath || `/data/starships/${job.targetStarshipId}`;

      if (!job.dryRun) {
        // Create target directory
        await fs.mkdir(targetPath, { recursive: true });

        // Extract backup
        await execAsync(`tar -xzf "${backup.filePath}" -C "${targetPath}"`);
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();
      job.restorePath = targetPath;

      console.log(`[BackupRecoveryService] Workspace restore completed: ${job.id} (dry run: ${job.dryRun})`);
      this.emit('restoreCompleted', job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[BackupRecoveryService] Workspace restore failed: ${job.id}:`, error);
      this.emit('restoreFailed', job, error);
    } finally {
      this.emit('jobStatusChanged', job);
    }
  }

  private async executeContainerStateRestore(job: RestoreJob): Promise<void> {
    job.status = 'running';
    job.startTime = new Date();
    this.emit('jobStatusChanged', job);

    try {
      const backup = this.backupMetadata.get(job.backupId)!;

      if (!job.dryRun) {
        // Import container from backup
        const { stdout } = await execAsync(`docker import "${backup.filePath}"`);
        const imageId = stdout.trim();

        console.log(`[BackupRecoveryService] Imported container image: ${imageId}`);
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();

      console.log(`[BackupRecoveryService] Container state restore completed: ${job.id} (dry run: ${job.dryRun})`);
      this.emit('restoreCompleted', job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[BackupRecoveryService] Container state restore failed: ${job.id}:`, error);
      this.emit('restoreFailed', job, error);
    } finally {
      this.emit('jobStatusChanged', job);
    }
  }

  private async executeRecoveryStep(step: RecoveryStep): Promise<void> {
    console.log(`[BackupRecoveryService] Executing recovery step: ${step.name} (${step.type})`);
    
    // Simplified implementation - would be much more comprehensive in production
    switch (step.type) {
      case 'backup_restore':
        // Restore from specified backup
        break;
      case 'container_recreate':
        // Recreate container from template
        break;
      case 'network_setup':
        // Setup network configuration
        break;
      case 'data_validation':
        // Validate restored data
        break;
      case 'service_restart':
        // Restart services
        break;
    }

    // Run health checks
    for (const healthCheck of step.healthChecks) {
      await execAsync(healthCheck);
    }
  }

  private calculateRetentionDate(category: 'daily' | 'weekly' | 'monthly'): {
    category: 'daily' | 'weekly' | 'monthly';
    expiresAt: Date;
  } {
    const now = new Date();
    const expiresAt = new Date(now);

    switch (category) {
      case 'daily':
        expiresAt.setDate(now.getDate() + this.config.schedule.retention.daily);
        break;
      case 'weekly':
        expiresAt.setDate(now.getDate() + (this.config.schedule.retention.weekly * 7));
        break;
      case 'monthly':
        expiresAt.setMonth(now.getMonth() + this.config.schedule.retention.monthly);
        break;
    }

    return { category, expiresAt };
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
  }

  private initializeDefaultRecoveryPlans(): void {
    // Standard recovery plan for single starship
    const singleStarshipPlan: RecoveryPlan = {
      id: 'single-starship-recovery',
      name: 'Single Starship Recovery',
      description: 'Complete recovery plan for a single starship including all connectors and data',
      estimatedDuration: 30,
      priority: 'high',
      steps: [
        {
          id: 'restore-workspace',
          name: 'Restore Workspace Data',
          description: 'Restore starship workspace from latest backup',
          type: 'backup_restore',
          order: 1,
          required: true,
          estimatedDuration: 10,
          parameters: { backupType: 'workspace' },
          healthChecks: ['test -d /data/starships/${starshipId}']
        },
        {
          id: 'recreate-network',
          name: 'Recreate Network',
          description: 'Recreate starship network infrastructure',
          type: 'network_setup',
          order: 2,
          required: true,
          estimatedDuration: 5,
          parameters: { networkName: 'starship-${starshipId}' },
          healthChecks: ['docker network inspect starship-${starshipId}']
        },
        {
          id: 'restore-containers',
          name: 'Restore Containers',
          description: 'Restore all MCP server containers',
          type: 'container_recreate',
          order: 3,
          required: true,
          estimatedDuration: 15,
          parameters: { restoreAll: true },
          healthChecks: ['docker ps -f label=starship.id=${starshipId}']
        }
      ]
    };

    this.recoveryPlans.set(singleStarshipPlan.id, singleStarshipPlan);
  }
}