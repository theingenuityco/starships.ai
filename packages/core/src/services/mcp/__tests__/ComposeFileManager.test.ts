import { ComposeFileManager, UpdateResult, RollbackResult, ComposeVersion } from '../ComposeFileManager';
import { DockerService, DockerComposeConfiguration } from '../DockerComposeGenerator';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import * as yaml from 'js-yaml';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    copyFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

jest.mock('child_process');
jest.mock('js-yaml');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('ComposeFileManager', () => {
  let manager: ComposeFileManager;

  const mockService: DockerService = {
    image: 'test-image:latest',
    container_name: 'mcp-starship-123-test',
    networks: ['starship-starship-123'],
    restart: 'unless-stopped',
    labels: {
      'starship.id': 'starship-123',
      'connector.id': 'connector-456',
      'template.slug': 'test',
      'managed-by': 'starships'
    },
    environment: {
      TEST_VAR: 'test-value'
    }
  };

  const mockCompose: DockerComposeConfiguration = {
    version: '3.8',
    services: {
      'mcp-starship-123-test': mockService
    },
    networks: {
      'starship-starship-123': {
        driver: 'bridge',
        name: 'starship-starship-123'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ComposeFileManager();

    // Mock successful directory creation
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({
      mtime: new Date('2025-01-25T12:00:00Z')
    } as any);

    // Mock YAML operations
    mockYaml.load.mockReturnValue(mockCompose);
    mockYaml.dump.mockReturnValue('mocked-yaml-content');

    // Mock successful exec operations
    mockExec.mockImplementation((command, callback) => {
      const cmd = command.toString();
      if (cmd.includes('docker-compose') && cmd.includes('up')) {
        callback(null, { stdout: 'Container abc123def456 started', stderr: '' } as any);
      } else if (cmd.includes('docker-compose') && cmd.includes('ps')) {
        callback(null, { stdout: '{"ID":"abc123","State":"running","Health":{"Status":"healthy"}}', stderr: '' } as any);
      } else if (cmd.includes('docker-compose') && cmd.includes('config')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else if (cmd.includes('docker network inspect')) {
        callback(null, { stdout: '[]', stderr: '' } as any);
      } else if (cmd.includes('docker network create')) {
        callback(null, { stdout: 'network created', stderr: '' } as any);
      } else {
        callback(null, { stdout: '', stderr: '' } as any);
      }
    });
  });

  describe('constructor', () => {
    it('should ensure directories are created', () => {
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/docker/compose-files', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/docker/compose-backups', { recursive: true });
    });
  });

  describe('addService', () => {
    it('should add new service to empty compose file', async () => {
      // Mock compose file doesn't exist
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const result = await manager.addService('starship-123', 'mcp-starship-123-test', mockService);

      expect(result.success).toBe(true);
      expect(result.action).toBe('add');
      expect(result.serviceName).toBe('mcp-starship-123-test');
      expect(result.containerId).toBe('abc123def456');
      expect(result.errors).toHaveLength(0);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/data/docker/compose-files/starship-starship-123.yml',
        'mocked-yaml-content',
        'utf8'
      );
    });

    it('should add service to existing compose file', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const result = await manager.addService('starship-123', 'mcp-starship-123-new', mockService);

      expect(result.success).toBe(true);
      expect(mockYaml.load).toHaveBeenCalledWith('existing-compose-content');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle service that already exists by updating', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock existing service in compose
      const existingCompose = {
        ...mockCompose,
        services: {
          'mcp-starship-123-test': { ...mockService, image: 'old-image:latest' }
        }
      };
      mockYaml.load.mockReturnValue(existingCompose);

      const result = await manager.addService('starship-123', 'mcp-starship-123-test', mockService);

      expect(result.warnings).toContain('Service mcp-starship-123-test already exists, updating instead');
      expect(result.action).toBe('update');
    });

    it('should create backup before adding service', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      await manager.addService('starship-123', 'new-service', mockService);

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        '/data/docker/compose-files/starship-starship-123.yml',
        expect.stringMatching(/\/data\/docker\/compose-backups\/starship-starship-123-\d+\.yml/)
      );
    });

    it('should handle add service failure with rollback', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock docker-compose up failure
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('up')) {
          callback(new Error('Container failed to start'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const result = await manager.addService('starship-123', 'failing-service', mockService);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Failed to add service: Container failed to start');
      expect(result.warnings).toContain('Automatically rolled back failed changes');
    });
  });

  describe('updateService', () => {
    it('should update existing service', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const updatedService = { ...mockService, image: 'updated-image:latest' };
      const result = await manager.updateService('starship-123', 'mcp-starship-123-test', updatedService);

      expect(result.success).toBe(true);
      expect(result.action).toBe('update');
      expect(result.warnings).toContain('Service configuration changed, restarting container');
    });

    it('should handle non-existent service by adding', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock compose without the service
      const emptyCompose = {
        ...mockCompose,
        services: {}
      };
      mockYaml.load.mockReturnValue(emptyCompose);

      const result = await manager.updateService('starship-123', 'non-existent-service', mockService);

      expect(result.warnings).toContain('Service non-existent-service does not exist, adding instead');
      expect(result.action).toBe('add');
    });

    it('should not restart when only labels change', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const updatedService = {
        ...mockService,
        labels: { ...mockService.labels, 'new.label': 'new-value' }
      };

      const result = await manager.updateService('starship-123', 'mcp-starship-123-test', updatedService);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('No restart required, configuration updated');
    });

    it('should handle compose file not found error', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await manager.updateService('starship-123', 'test-service', mockService);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Compose file does not exist');
    });
  });

  describe('removeService', () => {
    it('should remove existing service', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      const result = await manager.removeService('starship-123', 'mcp-starship-123-test');

      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should cleanup empty compose when no services remain', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();
      mockFs.unlink.mockResolvedValue();

      // Mock compose with only one service
      const singleServiceCompose = {
        ...mockCompose,
        services: {
          'mcp-starship-123-test': mockService
        }
      };
      mockYaml.load.mockReturnValue(singleServiceCompose);

      await manager.removeService('starship-123', 'mcp-starship-123-test');

      expect(mockFs.unlink).toHaveBeenCalledWith('/data/docker/compose-files/starship-starship-123.yml');
    });

    it('should handle non-existent service gracefully', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');
      mockFs.copyFile.mockResolvedValue();

      // Mock compose without the service
      const emptyCompose = {
        ...mockCompose,
        services: {}
      };
      mockYaml.load.mockReturnValue(emptyCompose);

      const result = await manager.removeService('starship-123', 'non-existent-service');

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Service non-existent-service does not exist, nothing to remove');
    });

    it('should handle compose file not found gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await manager.removeService('starship-123', 'test-service');

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Compose file does not exist, nothing to remove');
    });
  });

  describe('getComposeStatus', () => {
    it('should return compose status with service information', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');

      const status = await manager.getComposeStatus('starship-123');

      expect(status.exists).toBe(true);
      expect(status.services).toHaveProperty('mcp-starship-123-test');
      expect(status.services['mcp-starship-123-test']).toEqual({
        status: 'running',
        containerId: 'abc123',
        health: 'healthy'
      });
      expect(status.networks).toContain('starship-starship-123');
      expect(status.lastModified).toEqual(new Date('2025-01-25T12:00:00Z'));
    });

    it('should handle non-existent compose file', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const status = await manager.getComposeStatus('starship-123');

      expect(status.exists).toBe(false);
      expect(status.services).toEqual({});
      expect(status.networks).toEqual([]);
    });

    it('should handle container status parsing errors', async () => {
      mockFs.readFile.mockResolvedValue('existing-compose-content');

      // Mock exec failure for container status
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('ps --format json')) {
          callback(new Error('Container not found'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const status = await manager.getComposeStatus('starship-123');

      expect(status.services['mcp-starship-123-test']).toEqual({
        status: 'unknown'
      });
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback to specified version', async () => {
      mockFs.access.mockResolvedValue();
      mockFs.copyFile.mockResolvedValue();
      mockFs.readFile.mockResolvedValue('backup-compose-content');
      
      // Mock current compose with services
      const currentCompose = {
        ...mockCompose,
        services: {
          'service1': mockService,
          'service2': mockService
        }
      };
      mockYaml.load.mockReturnValueOnce(currentCompose).mockReturnValueOnce(mockCompose);

      const result = await manager.rollbackToVersion('starship-123', 12345);

      expect(result.success).toBe(true);
      expect(result.targetVersion).toBe(12345);
      expect(result.servicesAffected).toEqual(['service1', 'service2']);
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        '/data/docker/compose-backups/starship-starship-123-12345.yml',
        '/data/docker/compose-files/starship-starship-123.yml'
      );
    });

    it('should handle backup file not found', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await manager.rollbackToVersion('starship-123', 99999);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Rollback failed: ENOENT');
    });

    it('should handle rollback with no current services', async () => {
      mockFs.access.mockResolvedValue();
      mockFs.copyFile.mockResolvedValue();
      mockFs.readFile.mockResolvedValue('backup-compose-content');
      
      // Mock empty current compose
      const emptyCompose = { ...mockCompose, services: {} };
      mockYaml.load.mockReturnValueOnce(emptyCompose).mockReturnValueOnce(mockCompose);

      const result = await manager.rollbackToVersion('starship-123', 12345);

      expect(result.success).toBe(true);
      expect(result.servicesAffected).toEqual([]);
    });
  });

  describe('listVersions', () => {
    it('should list available backup versions', async () => {
      const mockFiles = [
        'starship-starship-123-12345.yml',
        'starship-starship-123-12346.yml',
        'starship-other-456-12347.yml', // Should be filtered out
        'not-a-starship-file.txt' // Should be filtered out
      ];

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile.mockResolvedValue('backup-compose-content');

      const versions = await manager.listVersions('starship-123');

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(12346); // Should be sorted descending
      expect(versions[1].version).toBe(12345);
      expect(versions[0].services).toEqual(['mcp-starship-123-test']);
    });

    it('should handle empty backup directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const versions = await manager.listVersions('starship-123');

      expect(versions).toEqual([]);
    });

    it('should handle readdir errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const versions = await manager.listVersions('starship-123');

      expect(versions).toEqual([]);
    });
  });

  describe('validateCompose', () => {
    it('should validate correct compose file', async () => {
      mockFs.readFile.mockResolvedValue('valid-compose-content');

      const result = await manager.validateCompose('starship-123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect docker-compose validation errors', async () => {
      mockFs.readFile.mockResolvedValue('invalid-compose-content');

      // Mock docker-compose config returning error
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('config -q')) {
          callback(null, { stdout: '', stderr: 'Invalid compose file: syntax error' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const result = await manager.validateCompose('starship-123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid compose file: syntax error');
    });

    it('should warn about empty services', async () => {
      mockFs.readFile.mockResolvedValue('empty-compose-content');
      
      const emptyCompose = {
        version: '3.8',
        services: {},
        networks: {}
      };
      mockYaml.load.mockReturnValue(emptyCompose);

      const result = await manager.validateCompose('starship-123');

      expect(result.warnings).toContain('No services defined in compose file');
      expect(result.warnings).toContain('No networks defined in compose file');
    });

    it('should handle compose file not found', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await manager.validateCompose('starship-123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Validation failed: ENOENT');
    });

    it('should handle unparseable compose file', async () => {
      mockFs.readFile.mockResolvedValue('invalid-yaml-content');
      mockYaml.load.mockReturnValue(null);

      const result = await manager.validateCompose('starship-123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Could not parse compose file');
    });
  });

  describe('private helper methods', () => {
    it('should create empty compose with correct structure', () => {
      const emptyCompose = (manager as any).createEmptyCompose('starship-123');

      expect(emptyCompose).toEqual({
        version: '3.8',
        services: {},
        networks: {
          'starship-starship-123': {
            driver: 'bridge',
            name: 'starship-starship-123',
            labels: {
              'starship.id': 'starship-123',
              'managed-by': 'starships',
              'created-at': expect.any(String)
            }
          }
        }
      });
    });

    it('should correctly detect when restart is required', () => {
      const oldService = { ...mockService };
      const newServiceNoRestart = { ...mockService, labels: { ...mockService.labels, 'new.label': 'value' } };
      const newServiceNeedsRestart = { ...mockService, image: 'new-image:latest' };

      expect((manager as any).requiresRestart(oldService, newServiceNoRestart)).toBe(false);
      expect((manager as any).requiresRestart(oldService, newServiceNeedsRestart)).toBe(true);
    });

    it('should correctly parse container status', () => {
      expect((manager as any).parseContainerStatus('running')).toBe('running');
      expect((manager as any).parseContainerStatus('exited')).toBe('stopped');
      expect((manager as any).parseContainerStatus('stopped')).toBe('stopped');
      expect((manager as any).parseContainerStatus('error')).toBe('error');
      expect((manager as any).parseContainerStatus('dead')).toBe('error');
      expect((manager as any).parseContainerStatus('unknown-state')).toBe('unknown');
    });

    it('should correctly generate file paths', () => {
      expect((manager as any).getComposePath('starship-123')).toBe('/data/docker/compose-files/starship-starship-123.yml');
      expect((manager as any).getBackupPath('starship-123', 12345)).toBe('/data/docker/compose-backups/starship-starship-123-12345.yml');
    });
  });

  describe('network management', () => {
    it('should ensure networks exist before creating services', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT')); // No existing compose
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock network doesn't exist initially
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        if (cmd.includes('network inspect')) {
          callback(new Error('Network not found'), null as any);
        } else if (cmd.includes('network create')) {
          callback(null, { stdout: 'network created', stderr: '' } as any);
        } else if (cmd.includes('up')) {
          callback(null, { stdout: 'Container started', stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      await manager.addService('starship-123', 'test-service', mockService);

      // Verify network creation was attempted
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('docker network create starship-starship-123'),
        expect.any(Function)
      );
    });

    it('should handle existing networks gracefully', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.copyFile.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      // Mock network already exists
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        if (cmd.includes('network inspect')) {
          callback(null, { stdout: 'network exists', stderr: '' } as any);
        } else if (cmd.includes('up')) {
          callback(null, { stdout: 'Container started', stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      await manager.addService('starship-123', 'test-service', mockService);

      // Verify network creation was not attempted
      expect(mockExec).not.toHaveBeenCalledWith(
        expect.stringContaining('docker network create'),
        expect.any(Function)
      );
    });
  });

  describe('backup and cleanup', () => {
    it('should cleanup old backups when max versions exceeded', async () => {
      const mockVersions: ComposeVersion[] = Array.from({ length: 12 }, (_, i) => ({
        version: 12357 - i, // Descending order
        filePath: `/data/docker/compose-backups/starship-starship-123-${12357 - i}.yml`,
        timestamp: new Date(),
        hash: `hash${i}`,
        services: ['test-service']
      }));

      // Mock listVersions to return 12 versions (over the 10 limit)
      jest.spyOn(manager, 'listVersions').mockResolvedValue(mockVersions);
      mockFs.unlink.mockResolvedValue();

      await (manager as any).cleanupOldBackups('starship-123');

      // Should delete the 2 oldest versions
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockFs.unlink).toHaveBeenCalledWith('/data/docker/compose-backups/starship-starship-123-12346.yml');
      expect(mockFs.unlink).toHaveBeenCalledWith('/data/docker/compose-backups/starship-starship-123-12345.yml');
    });

    it('should calculate file hash consistently', async () => {
      mockFs.readFile.mockResolvedValue('test content');

      const hash1 = await (manager as any).calculateFileHash('/test/path1');
      const hash2 = await (manager as any).calculateFileHash('/test/path2');

      // Same content should produce same hash
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]+$/); // Should be hex string
    });

    it('should handle file hash calculation errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const hash = await (manager as any).calculateFileHash('/nonexistent/path');

      expect(hash).toBe('unknown');
    });
  });
});