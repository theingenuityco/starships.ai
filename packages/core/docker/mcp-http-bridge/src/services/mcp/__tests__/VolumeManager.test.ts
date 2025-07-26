import { VolumeManager, VolumeConfig, VolumeValidationResult, BackupConfig } from '../VolumeManager';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import * as path from 'path';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    chmod: jest.fn(),
  },
}));

jest.mock('child_process');
jest.mock('../DockerServiceTemplate');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExec = exec as jest.MockedFunction<typeof exec>;

// Mock getDockerServiceTemplate
const mockGetDockerServiceTemplate = jest.fn();
jest.doMock('../DockerServiceTemplate', () => ({
  getDockerServiceTemplate: mockGetDockerServiceTemplate,
}));

describe('VolumeManager', () => {
  let volumeManager: VolumeManager;

  beforeEach(() => {
    jest.clearAllMocks();
    volumeManager = new VolumeManager();
    
    // Mock successful directory creation
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should ensure base directories are created', async () => {
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data', expect.objectContaining({ recursive: true }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships', expect.objectContaining({ recursive: true }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/docker', expect.objectContaining({ recursive: true }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/docker/compose-files', expect.objectContaining({ recursive: true }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/docker/images', expect.objectContaining({ recursive: true }));
    });
  });

  describe('createStarshipVolumeStructure', () => {
    it('should create complete volume structure for a starship', async () => {
      const starshipId = 'starship-123';

      await volumeManager.createStarshipVolumeStructure(starshipId);

      // Verify starship base directory creation
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123', expect.objectContaining({
        recursive: true,
        mode: 0o750
      }));

      // Verify volume subdirectories creation
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/filesystem', expect.objectContaining({ mode: 0o755 }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/credentials', expect.objectContaining({ mode: 0o700 }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/memory', expect.objectContaining({ mode: 0o755 }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/workspace', expect.objectContaining({ mode: 0o755 }));
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/logs', expect.objectContaining({ mode: 0o755 }));
    });

    it('should handle directory creation errors', async () => {
      const starshipId = 'starship-456';
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(volumeManager.createStarshipVolumeStructure(starshipId)).rejects.toThrow('Permission denied');
    });
  });

  describe('createTemplateVolumes', () => {
    it('should create volumes for filesystem template', async () => {
      const starshipId = 'starship-123';
      const templateSlug = 'filesystem';

      mockGetDockerServiceTemplate.mockReturnValue({
        slug: 'filesystem',
        volumes: [
          {
            source: '/data/starships/{starshipId}/filesystem',
            target: '/workspace',
            mode: 'rw'
          }
        ]
      });

      await volumeManager.createTemplateVolumes(starshipId, templateSlug);

      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/filesystem', expect.objectContaining({
        recursive: true,
        mode: 0o755
      }));
    });

    it('should create credential volumes with restricted permissions', async () => {
      const starshipId = 'starship-123';
      const templateSlug = 'gdrive';

      mockGetDockerServiceTemplate.mockReturnValue({
        slug: 'gdrive',
        volumes: [
          {
            source: '/data/starships/{starshipId}/credentials',
            target: '/credentials',
            mode: 'ro'
          }
        ]
      });

      await volumeManager.createTemplateVolumes(starshipId, templateSlug);

      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/starships/starship-123/credentials', expect.anything());
      expect(mockFs.chmod).toHaveBeenCalledWith('/data/starships/starship-123/credentials', 0o700);
    });

    it('should handle templates with no volumes', async () => {
      const starshipId = 'starship-123';
      const templateSlug = 'github';

      mockGetDockerServiceTemplate.mockReturnValue({
        slug: 'github',
        image: 'ghcr.io/github/github-mcp-server'
        // No volumes property
      });

      await volumeManager.createTemplateVolumes(starshipId, templateSlug);

      // Should not create any template-specific volumes
      expect(mockFs.mkdir).toHaveBeenCalledTimes(1); // Only base structure
    });

    it('should handle template not found', async () => {
      const starshipId = 'starship-123';
      const templateSlug = 'nonexistent';

      mockGetDockerServiceTemplate.mockReturnValue(null);

      await volumeManager.createTemplateVolumes(starshipId, templateSlug);

      // Should not create any volumes
      expect(mockFs.mkdir).toHaveBeenCalledTimes(1); // Only base structure
    });
  });

  describe('validateVolumeStructure', () => {
    it('should validate correct volume structure', async () => {
      const starshipId = 'starship-123';

      // Mock successful access to all directories
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        mode: 0o100755, // Directory with 755 permissions
        birthtime: new Date(),
        atime: new Date()
      } as any);

      // Mock disk usage command
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('df')) {
          callback(null, { stdout: '25%', stderr: '' } as any);
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const result = await volumeManager.validateVolumeStructure(starshipId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect missing starship directory', async () => {
      const starshipId = 'nonexistent-starship';

      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      const result = await volumeManager.validateVolumeStructure(starshipId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Starship directory does not exist: /data/starships/nonexistent-starship');
    });

    it('should detect missing subdirectories', async () => {
      const starshipId = 'starship-123';

      // Mock starship directory exists
      mockFs.access.mockResolvedValueOnce(undefined);
      
      // Mock filesystem directory missing
      mockFs.stat.mockRejectedValueOnce(new Error('Directory not found'));
      
      // Mock other directories exist
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        mode: 0o100755,
        birthtime: new Date(),
        atime: new Date()
      } as any);

      const result = await volumeManager.validateVolumeStructure(starshipId);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('filesystem'))).toBe(true);
    });

    it('should detect incorrect permissions', async () => {
      const starshipId = 'starship-123';

      mockFs.access.mockResolvedValue(undefined);
      
      // Mock credentials directory with wrong permissions
      mockFs.stat.mockImplementation((path) => {
        if (path.toString().includes('credentials')) {
          return Promise.resolve({
            isDirectory: () => true,
            mode: 0o100755, // Should be 700, but is 755
            birthtime: new Date(),
            atime: new Date()
          } as any);
        }
        return Promise.resolve({
          isDirectory: () => true,
          mode: 0o100755,
          birthtime: new Date(),
          atime: new Date()
        } as any);
      });

      const result = await volumeManager.validateVolumeStructure(starshipId);

      expect(result.warnings.some(warning => warning.includes('Incorrect permissions for credentials'))).toBe(true);
    });

    it('should warn about high disk usage', async () => {
      const starshipId = 'starship-123';

      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        mode: 0o100755,
        birthtime: new Date(),
        atime: new Date()
      } as any);

      // Mock high disk usage (95%)
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('df')) {
          callback(null, { stdout: '95%', stderr: '' } as any);
        }
      });

      const result = await volumeManager.validateVolumeStructure(starshipId);

      expect(result.warnings.some(warning => warning.includes('Volume disk usage is high'))).toBe(true);
    });
  });

  describe('getVolumeInfo', () => {
    it('should return volume information', async () => {
      const starshipId = 'starship-123';
      const volumeType = 'filesystem';

      const mockStats = {
        mode: 0o100755,
        birthtime: new Date('2025-01-01'),
        atime: new Date('2025-01-25'),
      };

      mockFs.stat.mockResolvedValue(mockStats as any);
      
      // Mock directory size calculation
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('du -sb')) {
          callback(null, { stdout: '1048576', stderr: '' } as any); // 1MB
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const info = await volumeManager.getVolumeInfo(starshipId, volumeType);

      expect(info).toEqual({
        path: '/data/starships/starship-123/filesystem',
        exists: true,
        permissions: '755',
        size: 1048576,
        createdAt: mockStats.birthtime,
        lastAccessed: mockStats.atime
      });
    });

    it('should return null for non-existent volume', async () => {
      const starshipId = 'starship-123';
      const volumeType = 'nonexistent';

      mockFs.stat.mockRejectedValue(new Error('Path not found'));

      const info = await volumeManager.getVolumeInfo(starshipId, volumeType);

      expect(info).toBeNull();
    });
  });

  describe('cleanupStarshipVolumes', () => {
    it('should successfully cleanup starship volumes', async () => {
      const starshipId = 'starship-123';

      mockFs.access.mockResolvedValue(undefined); // Directory exists
      mockFs.rm.mockResolvedValue(undefined);

      const result = await volumeManager.cleanupStarshipVolumes(starshipId);

      expect(result).toBe(true);
      expect(mockFs.rm).toHaveBeenCalledWith('/data/starships/starship-123', {
        recursive: true,
        force: true
      });
    });

    it('should handle cleanup when directory does not exist', async () => {
      const starshipId = 'nonexistent-starship';

      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      const result = await volumeManager.cleanupStarshipVolumes(starshipId);

      expect(result).toBe(true); // Should return true (already cleaned)
      expect(mockFs.rm).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      const starshipId = 'starship-123';

      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      const result = await volumeManager.cleanupStarshipVolumes(starshipId);

      expect(result).toBe(false);
    });
  });

  describe('backup and restore', () => {
    it('should create volume backup when enabled', async () => {
      const starshipId = 'starship-123';
      const backupConfig: BackupConfig = {
        enabled: true,
        destination: '/backups'
      };

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('tar -czf')) {
          callback(null, { stdout: '', stderr: '' } as any);
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const backupPath = await volumeManager.createVolumeBackup(starshipId, backupConfig);

      expect(backupPath).toMatch(/\/backups\/starship-starship-123-.*\.tar\.gz/);
    });

    it('should not create backup when disabled', async () => {
      const starshipId = 'starship-123';
      const backupConfig: BackupConfig = {
        enabled: false
      };

      const backupPath = await volumeManager.createVolumeBackup(starshipId, backupConfig);

      expect(backupPath).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should restore volume backup successfully', async () => {
      const starshipId = 'starship-123';
      const backupPath = '/backups/starship-starship-123-backup.tar.gz';

      mockFs.access.mockResolvedValue(undefined); // Backup file exists
      mockFs.rm.mockResolvedValue(undefined); // Cleanup succeeds
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('tar -xzf')) {
          callback(null, { stdout: '', stderr: '' } as any);
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const result = await volumeManager.restoreVolumeBackup(starshipId, backupPath);

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(backupPath);
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('tar -xzf'), expect.any(Function));
    });

    it('should handle restore failure when backup file does not exist', async () => {
      const starshipId = 'starship-123';
      const backupPath = '/backups/nonexistent.tar.gz';

      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await volumeManager.restoreVolumeBackup(starshipId, backupPath);

      expect(result).toBe(false);
    });
  });

  describe('listStarshipVolumes', () => {
    it('should list all starship volumes', async () => {
      mockFs.readdir.mockResolvedValueOnce(['starship-123', 'starship-456'] as any);
      
      mockFs.stat.mockImplementation((path) => {
        return Promise.resolve({
          isDirectory: () => true
        } as any);
      });

      mockFs.readdir.mockImplementation((path) => {
        if (path.toString().includes('starship-123')) {
          return Promise.resolve(['filesystem', 'credentials', 'workspace'] as any);
        } else if (path.toString().includes('starship-456')) {
          return Promise.resolve(['filesystem', 'memory'] as any);
        }
        return Promise.resolve([] as any);
      });

      // Mock directory size
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('du -sb')) {
          callback(null, { stdout: '2048000', stderr: '' } as any); // 2MB per starship
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const volumes = await volumeManager.listStarshipVolumes();

      expect(volumes).toEqual([
        { starshipId: 'starship-123', volumeCount: 3, totalSize: 2048000 },
        { starshipId: 'starship-456', volumeCount: 2, totalSize: 2048000 }
      ]);
    });
  });

  describe('testVolumeIsolation', () => {
    it('should verify volumes are isolated between starships', async () => {
      const starshipId1 = 'starship-123';
      const starshipId2 = 'starship-456';

      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockImplementation((path) => {
        if (path.toString().includes('starship-123')) {
          return Promise.resolve(`Test data for ${starshipId1}`);
        } else if (path.toString().includes('starship-456')) {
          return Promise.resolve(`Test data for ${starshipId2}`);
        }
        return Promise.reject(new Error('File not found'));
      });
      mockFs.unlink.mockResolvedValue();

      const isolated = await volumeManager.testVolumeIsolation(starshipId1, starshipId2);

      expect(isolated).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should detect isolation failure', async () => {
      const starshipId1 = 'starship-123';
      const starshipId2 = 'starship-456';

      mockFs.writeFile.mockResolvedValue();
      
      // Mock data corruption (both files return same data)
      mockFs.readFile.mockResolvedValue('Corrupted data');
      mockFs.unlink.mockResolvedValue();

      const isolated = await volumeManager.testVolumeIsolation(starshipId1, starshipId2);

      expect(isolated).toBe(false);
    });
  });

  describe('getVolumeMountPaths', () => {
    it('should return correct mount paths for template', () => {
      const starshipId = 'starship-123';
      const templateSlug = 'filesystem';

      mockGetDockerServiceTemplate.mockReturnValue({
        slug: 'filesystem',
        volumes: [
          {
            source: '/data/starships/{starshipId}/filesystem',
            target: '/workspace',
            mode: 'rw'
          }
        ]
      });

      const mountPaths = volumeManager.getVolumeMountPaths(starshipId, templateSlug);

      expect(mountPaths).toEqual([
        '/data/starships/starship-123/filesystem:/workspace:rw'
      ]);
    });

    it('should return empty array for templates without volumes', () => {
      const starshipId = 'starship-123';
      const templateSlug = 'github';

      mockGetDockerServiceTemplate.mockReturnValue({
        slug: 'github',
        image: 'ghcr.io/github/github-mcp-server'
      });

      const mountPaths = volumeManager.getVolumeMountPaths(starshipId, templateSlug);

      expect(mountPaths).toEqual([]);
    });
  });

  describe('getVolumeUsageStats', () => {
    it('should return usage statistics', async () => {
      // Mock listStarshipVolumes result
      jest.spyOn(volumeManager, 'listStarshipVolumes').mockResolvedValue([
        { starshipId: 'starship-123', volumeCount: 3, totalSize: 1048576 },
        { starshipId: 'starship-456', volumeCount: 2, totalSize: 2097152 }
      ]);

      // Mock disk usage
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('df')) {
          callback(null, { stdout: '45%', stderr: '' } as any);
        } else {
          callback(new Error('Command not found'), null as any);
        }
      });

      const stats = await volumeManager.getVolumeUsageStats();

      expect(stats).toEqual({
        totalStarships: 2,
        totalVolumes: 5,
        totalSize: 3145728, // 1MB + 2MB
        averageSize: 1572864, // (1MB + 2MB) / 2
        diskUsage: 0.45
      });
    });

    it('should handle stats retrieval errors', async () => {
      jest.spyOn(volumeManager, 'listStarshipVolumes').mockRejectedValue(new Error('Permission denied'));

      const stats = await volumeManager.getVolumeUsageStats();

      expect(stats).toEqual({
        totalStarships: 0,
        totalVolumes: 0,
        totalSize: 0,
        averageSize: 0,
        diskUsage: 0
      });
    });
  });
});