import { ResourceManager, ResourceConfig, ResourceLimits, ResourceUsage, ResourceAlert } from '../ResourceManager';
import { MCPServerConnector } from '@starships/models';
import { promises as fs } from 'fs';
import { exec } from 'child_process';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock timers
jest.useFakeTimers();

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  
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

  const mockConfig: ResourceConfig = {
    cpu: {
      defaultLimit: '0.5',
      maxLimit: '2.0',
      alertThreshold: 80
    },
    memory: {
      defaultLimit: '512M',
      maxLimit: '2G',
      alertThreshold: 90
    },
    disk: {
      starshipQuotaGB: 1,
      maxQuotaGB: 10,
      alertThreshold: 80
    },
    network: {
      enableBandwidthLimiting: false,
      defaultBandwidthMbps: 100,
      maxBandwidthMbps: 1000
    },
    monitoring: {
      checkInterval: 1000, // 1 second for testing
      alertCooldown: 5000,  // 5 seconds for testing
      retentionDays: 1
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resourceManager = new ResourceManager(mockConfig);

    // Mock successful filesystem operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue();
    mockFs.stat.mockResolvedValue({
      size: 1024,
      mtime: new Date(),
      isDirectory: () => false
    } as any);

    // Mock successful exec operations
    mockExec.mockImplementation((command, callback) => {
      const cmd = command.toString();
      
      if (cmd.includes('docker stats')) {
        callback(null, { stdout: '25.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
      } else if (cmd.includes('docker inspect')) {
        const hostConfig = {
          CpuQuota: 50000,
          CpuPeriod: 100000,
          Memory: 536870912 // 512MB
        };
        callback(null, { stdout: JSON.stringify(hostConfig), stderr: '' } as any);
      } else if (cmd.includes('du -sb')) {
        callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any); // 500MB used
      } else if (cmd.includes('df -B1')) {
        callback(null, { stdout: 'Filesystem 1B-blocks Used Available\n/dev/sda1 10737418240 5368709120 5368709120', stderr: '' } as any);
      } else if (cmd.includes('find')) {
        const mockFiles = [
          '1640995200 1048576 /data/starships/starship-456/old-file1.txt',
          '1640995300 2097152 /data/starships/starship-456/old-file2.txt',
          '1640995400 4194304 /data/starships/starship-456/old-file3.txt'
        ].join('\n');
        callback(null, { stdout: mockFiles, stderr: '' } as any);
      } else {
        callback(null, { stdout: '', stderr: '' } as any);
      }
    });
  });

  afterEach(() => {
    resourceManager.removeAllListeners();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultManager = new ResourceManager();
      const dashboardData = defaultManager.getDashboardData();
      
      expect(dashboardData.overview.totalConnectors).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customConfig = { 
        cpu: { defaultLimit: '1.0', maxLimit: '4.0', alertThreshold: 85 },
        monitoring: { checkInterval: 5000, alertCooldown: 10000, retentionDays: 3 }
      };
      const customManager = new ResourceManager(customConfig);
      
      expect((customManager as any).config.cpu.defaultLimit).toBe('1.0');
      expect((customManager as any).config.cpu.alertThreshold).toBe(85);
      expect((customManager as any).config.monitoring.checkInterval).toBe(5000);
    });
  });

  describe('calculateResourceLimits', () => {
    it('should calculate default resource limits', () => {
      const limits = resourceManager.calculateResourceLimits(mockConnector);
      
      expect(limits.cpuLimit).toBe('0.5');
      expect(limits.memoryLimit).toBe('512M');
      expect(limits.diskQuotaBytes).toBe(1024 * 1024 * 1024); // 1GB
      expect(limits.networkBandwidthMbps).toBeUndefined(); // Disabled by default
    });

    it('should apply resource limit overrides', () => {
      const overrides: Partial<ResourceLimits> = {
        cpuLimit: '1.0',
        memoryLimit: '1G',
        diskQuotaBytes: 2 * 1024 * 1024 * 1024, // 2GB
        networkBandwidthMbps: 200
      };

      const limits = resourceManager.calculateResourceLimits(mockConnector, overrides);
      
      expect(limits.cpuLimit).toBe('1.0');
      expect(limits.memoryLimit).toBe('1G');
      expect(limits.diskQuotaBytes).toBe(2 * 1024 * 1024 * 1024);
      expect(limits.networkBandwidthMbps).toBe(200);
    });

    it('should enable network bandwidth when configured', () => {
      const configWithBandwidth = {
        ...mockConfig,
        network: { ...mockConfig.network, enableBandwidthLimiting: true }
      };
      const managerWithBandwidth = new ResourceManager(configWithBandwidth);
      
      const limits = managerWithBandwidth.calculateResourceLimits(mockConnector);
      
      expect(limits.networkBandwidthMbps).toBe(100); // Default bandwidth
    });
  });

  describe('applyResourceLimits', () => {
    it('should apply resource limits to service configuration', () => {
      const serviceConfig = {
        image: 'test-image',
        environment: { TEST: 'value' },
        volumes: ['/data/starships/starship-456:/workspace']
      };

      const limits: ResourceLimits = {
        cpuLimit: '0.5',
        memoryLimit: '512M',
        diskQuotaBytes: 1024 * 1024 * 1024,
        networkBandwidthMbps: 100
      };

      const updatedConfig = resourceManager.applyResourceLimits(serviceConfig, limits);
      
      expect(updatedConfig.deploy.resources.limits.cpus).toBe('0.5');
      expect(updatedConfig.deploy.resources.limits.memory).toBe('512M');
      expect(updatedConfig.deploy.resources.reservations.cpus).toBe('0.05'); // 10% of limit
      expect(updatedConfig.deploy.resources.reservations.memory).toBe('64.0MB'); // Minimum reservation
    });

    it('should add disk quota to volumes', () => {
      const serviceConfig = {
        volumes: ['/data/starships/starship-456:/workspace']
      };

      const limits: ResourceLimits = {
        cpuLimit: '0.5',
        memoryLimit: '512M',
        diskQuotaBytes: 1024 * 1024 * 1024 // 1GB
      };

      const updatedConfig = resourceManager.applyResourceLimits(serviceConfig, limits);
      
      expect(updatedConfig.volumes[0]).toContain('size=1024m');
    });

    it('should add network bandwidth configuration when enabled', () => {
      const configWithBandwidth = {
        ...mockConfig,
        network: { ...mockConfig.network, enableBandwidthLimiting: true }
      };
      const managerWithBandwidth = new ResourceManager(configWithBandwidth);

      const serviceConfig = {
        environment: { TEST: 'value' }
      };

      const limits: ResourceLimits = {
        cpuLimit: '0.5',
        memoryLimit: '512M',
        diskQuotaBytes: 1024 * 1024 * 1024,
        networkBandwidthMbps: 200
      };

      const updatedConfig = managerWithBandwidth.applyResourceLimits(serviceConfig, limits);
      
      expect(updatedConfig.cap_add).toContain('NET_ADMIN');
      expect(updatedConfig.environment.BANDWIDTH_LIMIT_MBPS).toBe('200');
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring a connector', async () => {
      const monitoringStartedSpy = jest.fn();
      resourceManager.on('monitoringStarted', monitoringStartedSpy);

      await resourceManager.startMonitoring(mockConnector);

      expect(monitoringStartedSpy).toHaveBeenCalledWith(mockConnector);
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), mockConfig.monitoring.checkInterval);

      const metrics = resourceManager.getResourceMetrics(mockConnector.id);
      expect(metrics).toBeDefined();
      expect(metrics?.connectorId).toBe(mockConnector.id);
      expect(metrics?.starshipId).toBe(mockConnector.starshipId);
    });

    it('should not start monitoring if already monitoring', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await resourceManager.startMonitoring(mockConnector);
      await resourceManager.startMonitoring(mockConnector); // Second call

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ResourceManager] Already monitoring connector connector-123'
      );

      consoleSpy.mockRestore();
    });

    it('should perform initial resource collection', async () => {
      const resourceUsageCollectedSpy = jest.fn();
      resourceManager.on('resourceUsageCollected', resourceUsageCollectedSpy);

      await resourceManager.startMonitoring(mockConnector);

      expect(resourceUsageCollectedSpy).toHaveBeenCalledWith(
        mockConnector,
        expect.objectContaining({
          cpu: expect.objectContaining({ usage: expect.any(Number) }),
          memory: expect.objectContaining({ usage: expect.any(Number) }),
          disk: expect.objectContaining({ usage: expect.any(Number) }),
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring a connector', async () => {
      const monitoringStoppedSpy = jest.fn();
      resourceManager.on('monitoringStopped', monitoringStoppedSpy);

      await resourceManager.startMonitoring(mockConnector);
      await resourceManager.stopMonitoring(mockConnector.id);

      expect(monitoringStoppedSpy).toHaveBeenCalledWith(mockConnector.id);
      expect(clearInterval).toHaveBeenCalled();
    });

    it('should keep metrics after stopping monitoring', async () => {
      await resourceManager.startMonitoring(mockConnector);
      const metricsBefore = resourceManager.getResourceMetrics(mockConnector.id);
      
      await resourceManager.stopMonitoring(mockConnector.id);
      const metricsAfter = resourceManager.getResourceMetrics(mockConnector.id);

      expect(metricsBefore).toBeDefined();
      expect(metricsAfter).toBeDefined();
      expect(metricsAfter?.connectorId).toBe(mockConnector.id);
    });
  });

  describe('collectResourceUsage', () => {
    beforeEach(async () => {
      await resourceManager.startMonitoring(mockConnector);
    });

    it('should collect resource usage successfully', async () => {
      const usage = await resourceManager.collectResourceUsage(mockConnector);

      expect(usage.cpu.usage).toBe(25.5);
      expect(usage.cpu.limit).toBe('0.5'); // Calculated from CpuQuota/CpuPeriod
      expect(usage.memory.usage).toBeGreaterThan(0);
      expect(usage.memory.usedBytes).toBeGreaterThan(0);
      expect(usage.disk.usage).toBeGreaterThan(0);
      expect(usage.network.rxBytesPerSec).toBeGreaterThan(0);
      expect(usage.timestamp).toBeInstanceOf(Date);
    });

    it('should reject if container ID is missing', async () => {
      const invalidConnector = { ...mockConnector, dockerContainerId: undefined };

      await expect(resourceManager.collectResourceUsage(invalidConnector))
        .rejects.toThrow('Container ID is required for resource monitoring');
    });

    it('should handle resource collection errors gracefully', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Docker stats failed'), null as any);
      });

      await expect(resourceManager.collectResourceUsage(mockConnector))
        .rejects.toThrow('Docker stats failed');
    });
  });

  describe('resource alerting', () => {
    beforeEach(async () => {
      await resourceManager.startMonitoring(mockConnector);
    });

    it('should trigger CPU high alert', async () => {
      const alertSpy = jest.fn();
      resourceManager.on('resourceAlert', alertSpy);

      // Mock high CPU usage
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '85.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'cpu_high',
        severity: 'warning',
        connectorId: mockConnector.id,
        currentValue: 85.5,
        threshold: mockConfig.cpu.alertThreshold
      }));
    });

    it('should trigger memory high alert', async () => {
      const alertSpy = jest.fn();
      resourceManager.on('resourceAlert', alertSpy);

      // Mock high memory usage
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '25.5%:480MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'memory_high',
        severity: 'warning',
        connectorId: mockConnector.id,
        currentValue: expect.closeTo(93.75, 1), // 480/512 * 100
        threshold: mockConfig.memory.alertThreshold
      }));
    });

    it('should trigger disk quota exceeded alert', async () => {
      const alertSpy = jest.fn();
      resourceManager.on('resourceAlert', alertSpy);

      // Mock high disk usage (900MB out of 1GB)
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('du -sb')) {
          callback(null, { stdout: '943718400\t/data/starships/starship-456', stderr: '' } as any); // 900MB used
        } else if (cmd.includes('docker stats')) {
          callback(null, { stdout: '25.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: 'Filesystem 1B-blocks Used Available\n/dev/sda1 10737418240 5368709120 5368709120', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'disk_quota_exceeded',
        severity: 'warning',
        connectorId: mockConnector.id,
        currentValue: expect.closeTo(87.5, 1), // 900MB/1GB * 100
        threshold: mockConfig.disk.alertThreshold
      }));
    });

    it('should respect alert cooldown', async () => {
      const alertSpy = jest.fn();
      resourceManager.on('resourceAlert', alertSpy);

      // Mock high CPU usage
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '85.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      // First collection should trigger alert
      await resourceManager.collectResourceUsage(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Second collection within cooldown should not trigger
      await resourceManager.collectResourceUsage(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Advance time past cooldown
      jest.advanceTimersByTime(6000); // 6 seconds > 5 second cooldown

      // Third collection should trigger alert again
      await resourceManager.collectResourceUsage(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('quota enforcement', () => {
    beforeEach(async () => {
      await resourceManager.startMonitoring(mockConnector);
    });

    it('should enforce quota when disk usage exceeds 100%', async () => {
      const quotaEnforcedSpy = jest.fn();
      resourceManager.on('quotaEnforced', quotaEnforcedSpy);

      // Mock critical disk usage (1.1GB out of 1GB quota)
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('du -sb')) {
          callback(null, { stdout: '1181116006\t/data/starships/starship-456', stderr: '' } as any); // 1.1GB used
        } else if (cmd.includes('find')) {
          const mockFiles = [
            '1640995200 104857600 /data/starships/starship-456/old-file1.txt',  // 100MB
            '1640995300 209715200 /data/starships/starship-456/old-file2.txt',  // 200MB
            '1640995400 419430400 /data/starships/starship-456/old-file3.txt'   // 400MB
          ].join('\n');
          callback(null, { stdout: mockFiles, stderr: '' } as any);
        } else if (cmd.includes('docker stats')) {
          callback(null, { stdout: '25.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: 'Filesystem 1B-blocks Used Available\n/dev/sda1 10737418240 5368709120 5368709120', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      expect(quotaEnforcedSpy).toHaveBeenCalledWith(
        mockConnector.starshipId,
        expect.objectContaining({
          starshipId: mockConnector.starshipId,
          enforced: true,
          violations: 1
        })
      );

      // Should attempt to remove files
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should get quota enforcement status', async () => {
      await resourceManager.collectResourceUsage(mockConnector);

      const enforcement = resourceManager.getQuotaEnforcement(mockConnector.starshipId);
      
      expect(enforcement).toBeDefined();
      expect(enforcement?.starshipId).toBe(mockConnector.starshipId);
      expect(enforcement?.quotaBytes).toBe(1024 * 1024 * 1024); // 1GB
    });
  });

  describe('metrics and dashboard', () => {
    beforeEach(async () => {
      await resourceManager.startMonitoring(mockConnector);
    });

    it('should update resource metrics', async () => {
      await resourceManager.collectResourceUsage(mockConnector);

      const metrics = resourceManager.getResourceMetrics(mockConnector.id);
      
      expect(metrics).toBeDefined();
      expect(metrics?.resourceHistory.length).toBeGreaterThan(0);
      expect(metrics?.averageCpuUsage).toBeGreaterThan(0);
      expect(metrics?.averageMemoryUsage).toBeGreaterThan(0);
    });

    it('should provide dashboard data', async () => {
      // Add another connector for more interesting dashboard data
      const mockConnector2 = {
        ...mockConnector,
        id: 'connector-456',
        dockerServiceName: 'mcp-starship-456-slack',
        dockerContainerId: 'container-def456'
      };

      await resourceManager.startMonitoring(mockConnector2);
      
      // Perform resource collections
      await resourceManager.collectResourceUsage(mockConnector);
      await resourceManager.collectResourceUsage(mockConnector2);

      const dashboardData = resourceManager.getDashboardData();

      expect(dashboardData.overview.totalConnectors).toBe(2);
      expect(dashboardData.connectors).toHaveLength(2);
      
      const connector = dashboardData.connectors.find(c => c.connectorId === mockConnector.id);
      expect(connector).toBeDefined();
      expect(connector?.serviceName).toBe(mockConnector.dockerServiceName);
      expect(connector?.starshipId).toBe(mockConnector.starshipId);
      expect(connector?.cpu.usage).toBeGreaterThan(0);
      expect(connector?.memory.usage).toBeGreaterThan(0);
    });

    it('should retain metrics history within retention period', async () => {
      const metrics = resourceManager.getResourceMetrics(mockConnector.id);
      expect(metrics).toBeDefined();

      // Simulate old resource data
      const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      metrics!.resourceHistory.push({
        timestamp: oldTimestamp,
        cpu: 50.0,
        memory: 60.0,
        disk: 30.0,
        network: { rx: 1000, tx: 2000 }
      });

      // Perform resource collection to trigger cleanup
      await resourceManager.collectResourceUsage(mockConnector);

      // Old data should be cleaned up (retention is 1 day in test config)
      const updatedMetrics = resourceManager.getResourceMetrics(mockConnector.id);
      const hasOldData = updatedMetrics?.resourceHistory.some(
        h => h.timestamp.getTime() === oldTimestamp.getTime()
      );
      expect(hasOldData).toBe(false);
    });
  });

  describe('alert management', () => {
    beforeEach(async () => {
      await resourceManager.startMonitoring(mockConnector);
    });

    it('should get active alerts', async () => {
      // Trigger an alert
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '85.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      const allAlerts = resourceManager.getActiveAlerts();
      const connectorAlerts = resourceManager.getActiveAlerts(mockConnector.id);

      expect(allAlerts.length).toBeGreaterThan(0);
      expect(connectorAlerts.length).toBeGreaterThan(0);
      expect(connectorAlerts[0].connectorId).toBe(mockConnector.id);
    });

    it('should resolve alerts', async () => {
      const alertResolvedSpy = jest.fn();
      resourceManager.on('alertResolved', alertResolvedSpy);

      // Trigger an alert first
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '85.5%:123.4MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      await resourceManager.collectResourceUsage(mockConnector);

      const alerts = resourceManager.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      await resourceManager.resolveAlert(alertId);

      expect(alertResolvedSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: alertId,
        resolved: expect.any(Date)
      }));

      // Alert should no longer be active
      const remainingAlerts = resourceManager.getActiveAlerts();
      expect(remainingAlerts.find(a => a.id === alertId)).toBeUndefined();
    });
  });

  describe('periodic monitoring', () => {
    it('should perform periodic resource checks', async () => {
      const resourceUsageCollectedSpy = jest.fn();
      resourceManager.on('resourceUsageCollected', resourceUsageCollectedSpy);

      await resourceManager.startMonitoring(mockConnector);
      
      // Clear the initial collection call
      resourceUsageCollectedSpy.mockClear();

      // Advance timer to trigger periodic check
      jest.advanceTimersByTime(mockConfig.monitoring.checkInterval);

      expect(resourceUsageCollectedSpy).toHaveBeenCalledTimes(1);

      // Advance timer again
      jest.advanceTimersByTime(mockConfig.monitoring.checkInterval);

      expect(resourceUsageCollectedSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle periodic check errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock resource collection to throw error
      jest.spyOn(resourceManager, 'collectResourceUsage').mockRejectedValue(new Error('Collection failed'));

      await resourceManager.startMonitoring(mockConnector);

      // Advance timer to trigger periodic check
      jest.advanceTimersByTime(mockConfig.monitoring.checkInterval);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to collect resources for connector-123:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await resourceManager.startMonitoring(mockConnector);
      
      const dashboardBefore = resourceManager.getDashboardData();
      expect(dashboardBefore.overview.totalConnectors).toBe(1);

      await resourceManager.shutdown();

      expect(clearInterval).toHaveBeenCalled();
      
      const dashboardAfter = resourceManager.getDashboardData();
      expect(dashboardAfter.overview.totalConnectors).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should parse memory bytes correctly', () => {
      const parseMemoryBytes = (resourceManager as any).parseMemoryBytes;
      
      expect(parseMemoryBytes('512M')).toBe(512 * 1024 * 1024);
      expect(parseMemoryBytes('1G')).toBe(1024 * 1024 * 1024);
      expect(parseMemoryBytes('1024K')).toBe(1024 * 1024);
      expect(parseMemoryBytes('256')).toBe(256);
    });

    it('should parse network bytes correctly', () => {
      const parseNetworkBytes = (resourceManager as any).parseNetworkBytes;
      
      expect(parseNetworkBytes('1.5MB')).toBe(1.5 * 1024 * 1024);
      expect(parseNetworkBytes('500kB')).toBe(500 * 1024);
      expect(parseNetworkBytes('2GB')).toBe(2 * 1024 * 1024 * 1024);
    });

    it('should format bytes correctly', () => {
      const formatBytes = (resourceManager as any).formatBytes;
      
      expect(formatBytes(1024)).toBe('1.0KB');
      expect(formatBytes(1024 * 1024)).toBe('1.0MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB');
      expect(formatBytes(512)).toBe('512B');
    });

    it('should calculate memory reservation correctly', () => {
      const calculateMemoryReservation = (resourceManager as any).calculateMemoryReservation;
      
      expect(calculateMemoryReservation('512M')).toBe('64.0MB'); // Minimum 64MB
      expect(calculateMemoryReservation('2G')).toBe('214.7MB'); // 10% of 2GB
    });
  });

  describe('configuration variations', () => {
    it('should work with bandwidth limiting enabled', async () => {
      const configWithBandwidth = {
        ...mockConfig,
        network: { ...mockConfig.network, enableBandwidthLimiting: true }
      };
      const managerWithBandwidth = new ResourceManager(configWithBandwidth);

      const limits = managerWithBandwidth.calculateResourceLimits(mockConnector);
      expect(limits.networkBandwidthMbps).toBe(100);

      const serviceConfig = { environment: {} };
      const updatedConfig = managerWithBandwidth.applyResourceLimits(serviceConfig, limits);
      expect(updatedConfig.cap_add).toContain('NET_ADMIN');
    });

    it('should work with different resource thresholds', async () => {
      const strictConfig = {
        ...mockConfig,
        cpu: { ...mockConfig.cpu, alertThreshold: 50 },
        memory: { ...mockConfig.memory, alertThreshold: 70 }
      };
      const strictManager = new ResourceManager(strictConfig);

      await strictManager.startMonitoring(mockConnector);

      const alertSpy = jest.fn();
      strictManager.on('resourceAlert', alertSpy);

      // Mock moderate usage that would trigger strict thresholds
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker stats')) {
          callback(null, { stdout: '55.5%:380MiB / 512MiB:1.2MB / 3.4MB', stderr: '' } as any);
        } else if (cmd.includes('docker inspect')) {
          callback(null, { stdout: JSON.stringify({ CpuQuota: 50000, CpuPeriod: 100000, Memory: 536870912 }), stderr: '' } as any);
        } else {
          callback(null, { stdout: '524288000\t/data/starships/starship-456', stderr: '' } as any);
        }
      });

      await strictManager.collectResourceUsage(mockConnector);

      // Should trigger both CPU and memory alerts with strict thresholds
      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'cpu_high',
        currentValue: 55.5,
        threshold: 50
      }));
      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'memory_high',
        threshold: 70
      }));
    });
  });
});