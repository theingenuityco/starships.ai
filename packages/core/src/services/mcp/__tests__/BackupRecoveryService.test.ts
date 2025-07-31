import { BackupRecoveryService, BackupConfig, BackupJob, RestoreJob, BackupMetadata, RecoveryPlan } from '../BackupRecoveryService';
import { MCPServerConnector } from '@starships/models';
import { promises as fs } from 'fs';
import { exec } from 'child_process';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(),
    digest: jest.fn(() => 'mock-checksum-hash')
  }))
}));

// Mock timers
jest.useFakeTimers();

describe('BackupRecoveryService', () => {
  let backupService: BackupRecoveryService;
  
  const mockConnector: MCPServerConnector = {
    id: 'connector-123',
    templateId: 'github-template',
    env: '{"GITHUB_TOKEN": "test-token"}',
    starshipId: 'starship-456',
    name: 'Test GitHub Connector',
    slug: 'github',
    description: 'Test connector',
    isActive: true,
    isPublic: false,
    createdAt: '2025-01-25T00:00:00Z',
    updatedAt: '2025-01-25T00:00:00Z',
    dockerServiceName: 'mcp-starship-456-github',
    dockerStatus: 'running',
    dockerContainerId: 'container-abc123',
    dockerHealthStatus: 'healthy',
    dockerNetworkName: 'starship-starship-456'
  };

  const mockConfig: BackupConfig = {
    enabled: true,
    schedule: {
      workspace: '0 2 * * *',
      containerState: '*/30 * * * *',
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12
      }
    },
    storage: {
      backend: 'local',
      localPath: '/data/backups',
      compression: 'gzip',
      encryption: false
    },
    verification: {
      enabled: true,
      checksumAlgorithm: 'sha256',
      testRestoreEnabled: true
    },
    notifications: {
      enabled: false,
      onSuccess: false,
      onFailure: true
    },
    performance: {
      maxConcurrentBackups: 2,
      ioNiceLevel: 4
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    backupService = new BackupRecoveryService(mockConfig);

    // Mock successful filesystem operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{}'); // Empty metadata file
    mockFs.writeFile.mockResolvedValue();
    mockFs.unlink.mockResolvedValue();
    mockFs.stat.mockResolvedValue({
      size: 1048576, // 1MB
      mtime: new Date(),
      isDirectory: () => false
    } as any);

    // Mock successful exec operations
    mockExec.mockImplementation((command, callback) => {
      const cmd = command.toString();
      
      if (cmd.includes('tar -czf')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else if (cmd.includes('tar -xzf')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else if (cmd.includes('docker export')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else if (cmd.includes('docker import')) {
        callback(null, { stdout: 'sha256:mockimageid\n', stderr: '' } as any);
      } else if (cmd.includes('docker network inspect')) {
        callback(null, { stdout: 'network exists', stderr: '' } as any);
      } else if (cmd.includes('docker ps')) {
        callback(null, { stdout: 'container1\ncontainer2', stderr: '' } as any);
      } else if (cmd.includes('test -d')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else {
        callback(null, { stdout: '', stderr: '' } as any);
      }
    });
  });

  afterEach(() => {
    backupService.removeAllListeners();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultService = new BackupRecoveryService();
      const dashboardData = defaultService.getDashboardData();
      
      expect(dashboardData.overview.totalBackups).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customConfig = { 
        enabled: false,
        storage: { backend: 'local' as const, localPath: '/custom/backup/path', compression: 'lz4' as const, encryption: true }
      };
      const customService = new BackupRecoveryService(customConfig);
      
      expect((customService as any).config.enabled).toBe(false);
      expect((customService as any).config.storage.localPath).toBe('/custom/backup/path');
      expect((customService as any).config.storage.compression).toBe('lz4');
      expect((customService as any).config.storage.encryption).toBe(true);
    });

    it('should initialize default recovery plans', () => {
      const plans = backupService.getRecoveryPlans();
      
      expect(plans.length).toBeGreaterThan(0);
      expect(plans.some(p => p.id === 'single-starship-recovery')).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize service successfully', async () => {
      const serviceInitializedSpy = jest.fn();
      backupService.on('serviceInitialized', serviceInitializedSpy);

      await backupService.initialize();

      expect(serviceInitializedSpy).toHaveBeenCalled();
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/backups', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/backups/workspaces', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/backups/containers', { recursive: true });
    });

    it('should not initialize when disabled', async () => {
      const disabledService = new BackupRecoveryService({ enabled: false });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await disabledService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('[BackupRecoveryService] Backup service is disabled');
      consoleSpy.mockRestore();
    });

    it('should load existing backup metadata', async () => {
      const mockMetadata = {
        'backup-123': {
          id: 'backup-123',
          type: 'workspace',
          starshipId: 'starship-456',
          timestamp: '2025-01-25T10:00:00Z',
          sizeBytes: 1048576,
          checksumHash: 'mock-hash',
          filePath: '/data/backups/workspaces/test.tar.gz',
          retention: {
            category: 'daily',
            expiresAt: '2025-02-01T10:00:00Z'
          },
          verified: true,
          encryptionEnabled: false,
          compressionType: 'gzip',
          version: '1.0'
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));

      await backupService.initialize();

      const backups = backupService.getAllBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0].id).toBe('backup-123');
      expect(backups[0].type).toBe('workspace');
    });

    it('should handle initialization errors gracefully', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(backupService.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('createWorkspaceBackup', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should create workspace backup successfully', async () => {
      const backupStartedSpy = jest.fn();
      const backupCompletedSpy = jest.fn();
      backupService.on('backupStarted', backupStartedSpy);
      backupService.on('backupCompleted', backupCompletedSpy);

      const job = await backupService.createWorkspaceBackup('starship-456');

      expect(job.type).toBe('workspace');
      expect(job.starshipId).toBe('starship-456');
      expect(job.status).toBe('pending');
      expect(backupStartedSpy).toHaveBeenCalledWith(job);

      // Wait for async backup to complete
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      expect(backupCompletedSpy).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('tar -czf'),
        expect.any(Function)
      );
    });

    it('should handle backup options', async () => {
      const options = {
        description: 'Manual backup',
        retention: 'weekly' as const,
        priority: 'high' as const
      };

      const job = await backupService.createWorkspaceBackup('starship-456', options);

      expect(job.metadata.description).toBe('Manual backup');
      expect(job.metadata.retention).toBe('weekly');
      expect(job.metadata.priority).toBe('high');
    });

    it('should handle backup failures', async () => {
      const backupFailedSpy = jest.fn();
      backupService.on('backupFailed', backupFailedSpy);

      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('tar -czf')) {
          callback(new Error('Disk full'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const job = await backupService.createWorkspaceBackup('starship-456');

      // Wait for async backup to fail
      await new Promise(resolve => {
        backupService.once('backupFailed', resolve);
      });

      expect(backupFailedSpy).toHaveBeenCalledWith(job, expect.any(Error));
      
      const updatedJob = backupService.getBackupJob(job.id) as BackupJob;
      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.error).toBe('Disk full');
    });

    it('should create backup metadata', async () => {
      await backupService.createWorkspaceBackup('starship-456');

      // Wait for backup to complete
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      const backups = backupService.getAllBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0].type).toBe('workspace');
      expect(backups[0].starshipId).toBe('starship-456');
      expect(backups[0].sizeBytes).toBe(1048576);
      expect(backups[0].verified).toBe(true);
    });
  });

  describe('createContainerStateBackup', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should create container state backup successfully', async () => {
      const backupStartedSpy = jest.fn();
      const backupCompletedSpy = jest.fn();
      backupService.on('backupStarted', backupStartedSpy);
      backupService.on('backupCompleted', backupCompletedSpy);

      const job = await backupService.createContainerStateBackup(mockConnector);

      expect(job.type).toBe('container_state');
      expect(job.starshipId).toBe(mockConnector.starshipId);
      expect(job.connectorId).toBe(mockConnector.id);
      expect(backupStartedSpy).toHaveBeenCalledWith(job);

      // Wait for async backup to complete
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      expect(backupCompletedSpy).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('docker export'),
        expect.any(Function)
      );
    });

    it('should include container metadata', async () => {
      const job = await backupService.createContainerStateBackup(mockConnector);

      expect(job.metadata.containerInfo.serviceName).toBe(mockConnector.dockerServiceName);
      expect(job.metadata.containerInfo.containerId).toBe(mockConnector.dockerContainerId);
      expect(job.metadata.containerInfo.templateSlug).toBe(mockConnector.slug);
    });

    it('should handle container backup options', async () => {
      const options = {
        description: 'Pre-update snapshot',
        includeVolumes: false
      };

      const job = await backupService.createContainerStateBackup(mockConnector, options);

      expect(job.metadata.description).toBe('Pre-update snapshot');
      expect(job.metadata.includeVolumes).toBe(false);
    });
  });

  describe('restoreWorkspace', () => {
    beforeEach(async () => {
      await backupService.initialize();
      
      // Create a backup first
      await backupService.createWorkspaceBackup('starship-456');
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });
    });

    it('should restore workspace successfully', async () => {
      const restoreStartedSpy = jest.fn();
      const restoreCompletedSpy = jest.fn();
      backupService.on('restoreStarted', restoreStartedSpy);
      backupService.on('restoreCompleted', restoreCompletedSpy);

      const backups = backupService.getAllBackups();
      const backupId = backups[0].id;

      const job = await backupService.restoreWorkspace(backupId, 'starship-789');

      expect(job.type).toBe('workspace');
      expect(job.backupId).toBe(backupId);
      expect(job.targetStarshipId).toBe('starship-789');
      expect(restoreStartedSpy).toHaveBeenCalledWith(job);

      // Wait for async restore to complete
      await new Promise(resolve => {
        backupService.once('restoreCompleted', resolve);
      });

      expect(restoreCompletedSpy).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('tar -xzf'),
        expect.any(Function)
      );
    });

    it('should handle dry run restore', async () => {
      const backups = backupService.getAllBackups();
      const backupId = backups[0].id;

      const job = await backupService.restoreWorkspace(backupId, 'starship-789', { dryRun: true });

      expect(job.dryRun).toBe(true);

      // Wait for restore to complete
      await new Promise(resolve => {
        backupService.once('restoreCompleted', resolve);
      });

      // Should not execute tar command in dry run
      expect(mockExec).not.toHaveBeenCalledWith(
        expect.stringContaining('tar -xzf'),
        expect.any(Function)
      );
    });

    it('should reject restore for non-existent backup', async () => {
      await expect(backupService.restoreWorkspace('non-existent', 'starship-789'))
        .rejects.toThrow('Backup non-existent not found');
    });

    it('should reject restore for wrong backup type', async () => {
      // Create container backup
      await backupService.createContainerStateBackup(mockConnector);
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      const backups = backupService.getAllBackups();
      const containerBackup = backups.find(b => b.type === 'container_state');

      await expect(backupService.restoreWorkspace(containerBackup!.id, 'starship-789'))
        .rejects.toThrow('is not a workspace backup');
    });
  });

  describe('restoreContainerState', () => {
    beforeEach(async () => {
      await backupService.initialize();
      
      // Create a container backup first
      await backupService.createContainerStateBackup(mockConnector);
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });
    });

    it('should restore container state successfully', async () => {
      const restoreStartedSpy = jest.fn();
      const restoreCompletedSpy = jest.fn();
      backupService.on('restoreStarted', restoreStartedSpy);
      backupService.on('restoreCompleted', restoreCompletedSpy);

      const backups = backupService.getAllBackups();
      const containerBackup = backups.find(b => b.type === 'container_state');

      const job = await backupService.restoreContainerState(containerBackup!.id, mockConnector);

      expect(job.type).toBe('container_state');
      expect(job.backupId).toBe(containerBackup!.id);
      expect(job.targetConnectorId).toBe(mockConnector.id);
      expect(restoreStartedSpy).toHaveBeenCalledWith(job);

      // Wait for async restore to complete
      await new Promise(resolve => {
        backupService.once('restoreCompleted', resolve);
      });

      expect(restoreCompletedSpy).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('docker import'),
        expect.any(Function)
      );
    });

    it('should handle restore options', async () => {
      const backups = backupService.getAllBackups();
      const containerBackup = backups.find(b => b.type === 'container_state');

      const job = await backupService.restoreContainerState(
        containerBackup!.id, 
        mockConnector, 
        { dryRun: true, restoreVolumes: false }
      );

      expect(job.dryRun).toBe(true);
    });
  });

  describe('executeRecoveryPlan', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should execute recovery plan successfully', async () => {
      const planStartedSpy = jest.fn();
      const planCompletedSpy = jest.fn();
      backupService.on('recoveryPlanStarted', planStartedSpy);
      backupService.on('recoveryPlanCompleted', planCompletedSpy);

      const plans = backupService.getRecoveryPlans();
      const planId = plans[0].id;

      const result = await backupService.executeRecoveryPlan(planId);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(result.totalSteps);
      expect(result.errors).toHaveLength(0);
      expect(planStartedSpy).toHaveBeenCalledWith(planId, plans[0]);
      expect(planCompletedSpy).toHaveBeenCalledWith(planId, result);
    });

    it('should handle recovery plan dry run', async () => {
      const plans = backupService.getRecoveryPlans();
      const planId = plans[0].id;

      const result = await backupService.executeRecoveryPlan(planId, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.executedSteps).toBe(result.totalSteps);
      
      // Should not execute actual docker commands in dry run
      expect(mockExec).not.toHaveBeenCalledWith(
        expect.stringContaining('docker network inspect'),
        expect.any(Function)
      );
    });

    it('should handle recovery step failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker network inspect')) {
          callback(new Error('Network not found'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const plans = backupService.getRecoveryPlans();
      const planId = plans[0].id;

      const result = await backupService.executeRecoveryPlan(planId, { stopOnError: false });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Network not found');
    });

    it('should stop on required step failure', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('test -d')) {
          callback(new Error('Directory not found'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const plans = backupService.getRecoveryPlans();
      const planId = plans[0].id;

      const result = await backupService.executeRecoveryPlan(planId, { stopOnError: true });

      expect(result.success).toBe(false);
      expect(result.executedSteps).toBeLessThan(result.totalSteps);
    });

    it('should reject non-existent recovery plan', async () => {
      await expect(backupService.executeRecoveryPlan('non-existent'))
        .rejects.toThrow('Recovery plan non-existent not found');
    });
  });

  describe('backup management', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should get backup job status', async () => {
      const job = await backupService.createWorkspaceBackup('starship-456');
      
      const retrievedJob = backupService.getBackupJob(job.id);
      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(job.id);
      expect(retrievedJob?.type).toBe('workspace');
    });

    it('should get backups for specific starship', async () => {
      await backupService.createWorkspaceBackup('starship-456');
      await backupService.createWorkspaceBackup('starship-789');

      // Wait for backups to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const starship456Backups = backupService.getStarshipBackups('starship-456');
      const starship789Backups = backupService.getStarshipBackups('starship-789');

      expect(starship456Backups).toHaveLength(1);
      expect(starship789Backups).toHaveLength(1);
      expect(starship456Backups[0].starshipId).toBe('starship-456');
      expect(starship789Backups[0].starshipId).toBe('starship-789');
    });

    it('should delete backup successfully', async () => {
      const backupDeletedSpy = jest.fn();
      backupService.on('backupDeleted', backupDeletedSpy);

      await backupService.createWorkspaceBackup('starship-456');
      
      // Wait for backup to complete
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      const backups = backupService.getAllBackups();
      const backupId = backups[0].id;

      await backupService.deleteBackup(backupId);

      expect(backupDeletedSpy).toHaveBeenCalledWith(backupId);
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(backupService.getAllBackups()).toHaveLength(0);
    });

    it('should cleanup expired backups', async () => {
      // Mock backup metadata with expired backup
      const expiredBackup: BackupMetadata = {
        id: 'expired-backup',
        type: 'workspace',
        starshipId: 'starship-456',
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        sizeBytes: 1048576,
        checksumHash: 'mock-hash',
        filePath: '/data/backups/expired.tar.gz',
        retention: {
          category: 'daily',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Expired yesterday
        },
        verified: true,
        encryptionEnabled: false,
        compressionType: 'gzip',
        version: '1.0'
      };

      (backupService as any).backupMetadata.set('expired-backup', expiredBackup);

      const cleanupCompletedSpy = jest.fn();
      backupService.on('cleanupCompleted', cleanupCompletedSpy);

      const result = await backupService.cleanupExpiredBackups();

      expect(result.deleted).toBe(1);
      expect(result.freed).toBe(1048576);
      expect(cleanupCompletedSpy).toHaveBeenCalledWith(result);
    });
  });

  describe('dashboard data', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should provide comprehensive dashboard data', async () => {
      // Create some backups
      await backupService.createWorkspaceBackup('starship-456');
      await backupService.createContainerStateBackup(mockConnector);
      
      // Wait for backups to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const dashboardData = backupService.getDashboardData();

      expect(dashboardData.overview.totalBackups).toBeGreaterThan(0);
      expect(dashboardData.overview.totalSize).toBeGreaterThan(0);
      expect(dashboardData.overview.lastBackup).toBeInstanceOf(Date);
      expect(dashboardData.recentJobs.length).toBeGreaterThan(0);
      expect(dashboardData.storage.retention.daily).toBeGreaterThanOrEqual(0);
      expect(dashboardData.recovery.plansAvailable).toBeGreaterThan(0);
    });

    it('should include recovery plan test results', async () => {
      // Execute a recovery plan to generate test results
      const plans = backupService.getRecoveryPlans();
      await backupService.executeRecoveryPlan(plans[0].id, { dryRun: true });

      const dashboardData = backupService.getDashboardData();

      expect(dashboardData.recovery.testResults.passed).toBeGreaterThan(0);
      expect(dashboardData.recovery.lastTested).toBeInstanceOf(Date);
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should shutdown gracefully', async () => {
      await backupService.createWorkspaceBackup('starship-456');
      
      const dashboardBefore = backupService.getDashboardData();
      expect(dashboardBefore.overview.totalBackups).toBeGreaterThan(0);

      await backupService.shutdown();

      expect(mockFs.writeFile).toHaveBeenCalled(); // Metadata save
    });
  });

  describe('helper methods', () => {
    it('should format bytes correctly', () => {
      const formatBytes = (backupService as any).formatBytes;
      
      expect(formatBytes(1024)).toBe('1.0KB');
      expect(formatBytes(1024 * 1024)).toBe('1.0MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB');
      expect(formatBytes(512)).toBe('512B');
    });

    it('should calculate retention dates correctly', () => {
      const calculateRetentionDate = (backupService as any).calculateRetentionDate;
      
      const daily = calculateRetentionDate('daily');
      const weekly = calculateRetentionDate('weekly');
      const monthly = calculateRetentionDate('monthly');

      expect(daily.category).toBe('daily');
      expect(weekly.category).toBe('weekly');
      expect(monthly.category).toBe('monthly');
      expect(daily.expiresAt).toBeInstanceOf(Date);
      expect(weekly.expiresAt.getTime()).toBeGreaterThan(daily.expiresAt.getTime());
      expect(monthly.expiresAt.getTime()).toBeGreaterThan(weekly.expiresAt.getTime());
    });

    it('should generate unique job IDs', () => {
      const generateJobId = (backupService as any).generateJobId;
      
      const id1 = generateJobId('backup');
      const id2 = generateJobId('restore');
      const id3 = generateJobId('backup');

      expect(id1).toMatch(/^backup-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^restore-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id3);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await backupService.initialize();
    });

    it('should handle backup verification failures', async () => {
      mockFs.stat.mockResolvedValue({
        size: 2048, // Different size than expected
        mtime: new Date(),
        isDirectory: () => false
      } as any);

      await backupService.createWorkspaceBackup('starship-456');
      
      // Wait for backup to complete
      await new Promise(resolve => {
        backupService.once('backupCompleted', resolve);
      });

      const verifyBackupIntegrity = (backupService as any).verifyBackupIntegrity;
      const backups = backupService.getAllBackups();
      
      const isValid = await verifyBackupIntegrity(backups[0]);
      expect(isValid).toBe(false);
    });

    it('should handle filesystem errors during backup', async () => {
      const backupFailedSpy = jest.fn();
      backupService.on('backupFailed', backupFailedSpy);

      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const job = await backupService.createWorkspaceBackup('starship-456');

      // Wait for backup to fail
      await new Promise(resolve => {
        backupService.once('backupFailed', resolve);
      });

      expect(backupFailedSpy).toHaveBeenCalled();
      
      const updatedJob = backupService.getBackupJob(job.id) as BackupJob;
      expect(updatedJob.status).toBe('failed');
    });

    it('should handle missing backup files during restore', async () => {
      // Create backup metadata without actual file
      const fakeBackup: BackupMetadata = {
        id: 'fake-backup',
        type: 'workspace',
        starshipId: 'starship-456',
        timestamp: new Date(),
        sizeBytes: 1048576,
        checksumHash: 'fake-hash',
        filePath: '/nonexistent/file.tar.gz',
        retention: {
          category: 'daily',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        verified: false,
        encryptionEnabled: false,
        compressionType: 'gzip',
        version: '1.0'
      };

      (backupService as any).backupMetadata.set('fake-backup', fakeBackup);

      const restoreFailedSpy = jest.fn();
      backupService.on('restoreFailed', restoreFailedSpy);

      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('tar -xzf')) {
          callback(new Error('No such file or directory'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const job = await backupService.restoreWorkspace('fake-backup', 'starship-789');

      // Wait for restore to fail
      await new Promise(resolve => {
        backupService.once('restoreFailed', resolve);
      });

      expect(restoreFailedSpy).toHaveBeenCalled();
    });
  });

  describe('configuration variations', () => {
    it('should work with encryption enabled', () => {
      const encryptedConfig = {
        ...mockConfig,
        storage: { ...mockConfig.storage, encryption: true, encryptionKey: 'base64-encoded-key' }
      };
      const encryptedService = new BackupRecoveryService(encryptedConfig);
      
      expect((encryptedService as any).config.storage.encryption).toBe(true);
      expect((encryptedService as any).config.storage.encryptionKey).toBe('base64-encoded-key');
    });

    it('should work with different compression algorithms', () => {
      const lz4Config = {
        ...mockConfig,
        storage: { ...mockConfig.storage, compression: 'lz4' as const }
      };
      const lz4Service = new BackupRecoveryService(lz4Config);
      
      expect((lz4Service as any).config.storage.compression).toBe('lz4');
    });

    it('should work with S3 backend configuration', () => {
      const s3Config = {
        ...mockConfig,
        storage: { ...mockConfig.storage, backend: 's3' as const }
      };
      const s3Service = new BackupRecoveryService(s3Config);
      
      expect((s3Service as any).config.storage.backend).toBe('s3');
    });

    it('should work with notifications enabled', () => {
      const notificationConfig = {
        ...mockConfig,
        notifications: {
          enabled: true,
          onSuccess: true,
          onFailure: true,
          webhook: 'https://example.com/webhook'
        }
      };
      const notificationService = new BackupRecoveryService(notificationConfig);
      
      expect((notificationService as any).config.notifications.enabled).toBe(true);
      expect((notificationService as any).config.notifications.webhook).toBe('https://example.com/webhook');
    });
  });
});