import { HealthMonitorService, HealthStatus, HealthAlert, AlertRule, MonitoringConfig } from '../HealthMonitorService';
import { MCPProtocolHandler } from '../MCPProtocolHandler';
import { MCPServerConnector } from '@starships/models';
import { exec } from 'child_process';

// Mock dependencies
jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;

// Mock timers
jest.useFakeTimers();

describe('HealthMonitorService', () => {
  let healthMonitor: HealthMonitorService;
  let mockMCPProtocolHandler: jest.Mocked<MCPProtocolHandler>;

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

  const mockConfig: MonitoringConfig = {
    checkInterval: 1000, // 1 second for testing
    healthRetention: 1, // 1 day
    alertCooldown: 1, // 1 minute
    containerStatsEnabled: true,
    mcpHealthEnabled: true,
    systemHealthEnabled: true,
    maxConcurrentChecks: 5
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MCP Protocol Handler
    mockMCPProtocolHandler = {
      getConnection: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    healthMonitor = new HealthMonitorService(mockMCPProtocolHandler, mockConfig);

    // Setup default successful exec mocks
    mockExec.mockImplementation((command, callback) => {
      const cmd = command.toString();
      
      if (cmd.includes('docker inspect')) {
        const containerInfo = {
          State: {
            Running: true,
            ExitCode: 0,
            StartedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
            RestartCount: 0
          }
        };
        callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
      } else if (cmd.includes('docker stats')) {
        callback(null, { stdout: '25.5%:123.4MiB / 512MiB', stderr: '' } as any);
      } else if (cmd.includes('docker version')) {
        callback(null, { stdout: '24.0.0', stderr: '' } as any);
      } else if (cmd.includes('df /data')) {
        callback(null, { stdout: 'Use%\n 75%', stderr: '' } as any);
      } else if (cmd.includes('uptime')) {
        callback(null, { stdout: 'load average: 0.85, 0.90, 0.80', stderr: '' } as any);
      } else {
        callback(null, { stdout: '', stderr: '' } as any);
      }
    });

    // Setup MCP handler mocks
    mockMCPProtocolHandler.getConnection.mockReturnValue({
      id: 'conn-123',
      connectorId: 'connector-123',
      serviceName: 'mcp-starship-456-github',
      url: 'tcp://mcp-starship-456-github:3000',
      status: 'connected',
      lastActivity: new Date(),
      reconnectAttempts: 0,
      maxReconnectAttempts: 3,
      requestCount: 10,
      errorCount: 1
    } as any);

    mockMCPProtocolHandler.healthCheck.mockResolvedValue({
      healthy: true,
      latency: 150
    });
  });

  afterEach(() => {
    healthMonitor.removeAllListeners();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultMonitor = new HealthMonitorService(mockMCPProtocolHandler);
      const dashboardData = defaultMonitor.getDashboardData();
      
      expect(dashboardData.overview.totalServices).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customConfig = { checkInterval: 5000, healthRetention: 14 };
      const customMonitor = new HealthMonitorService(mockMCPProtocolHandler, customConfig);
      
      expect((customMonitor as any).config.checkInterval).toBe(5000);
      expect((customMonitor as any).config.healthRetention).toBe(14);
    });

    it('should setup default alert rules', () => {
      const alertRules = (healthMonitor as any).alertRules;
      expect(alertRules.size).toBeGreaterThan(0);
      expect(alertRules.has('unhealthy-service')).toBe(true);
      expect(alertRules.has('high-latency')).toBe(true);
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring a connector', async () => {
      const monitoringStartedSpy = jest.fn();
      healthMonitor.on('monitoringStarted', monitoringStartedSpy);

      await healthMonitor.startMonitoring(mockConnector);

      expect(monitoringStartedSpy).toHaveBeenCalledWith(mockConnector);
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), mockConfig.checkInterval);

      const metrics = healthMonitor.getHealthMetrics(mockConnector.id);
      expect(metrics).toBeDefined();
      expect(metrics?.connectorId).toBe(mockConnector.id);
      expect(metrics?.starshipId).toBe(mockConnector.starshipId);
    });

    it('should not start monitoring if already monitoring', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await healthMonitor.startMonitoring(mockConnector);
      await healthMonitor.startMonitoring(mockConnector); // Second call

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HealthMonitor] Already monitoring connector connector-123'
      );

      consoleSpy.mockRestore();
    });

    it('should perform initial health check', async () => {
      const healthCheckSpy = jest.fn();
      healthMonitor.on('healthCheckCompleted', healthCheckSpy);

      await healthMonitor.startMonitoring(mockConnector);

      expect(healthCheckSpy).toHaveBeenCalledWith(
        mockConnector,
        expect.objectContaining({
          overall: expect.any(String),
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring a connector', async () => {
      const monitoringStoppedSpy = jest.fn();
      healthMonitor.on('monitoringStopped', monitoringStoppedSpy);

      await healthMonitor.startMonitoring(mockConnector);
      await healthMonitor.stopMonitoring(mockConnector.id);

      expect(monitoringStoppedSpy).toHaveBeenCalledWith(mockConnector.id);
      expect(clearInterval).toHaveBeenCalled();
    });

    it('should keep metrics after stopping monitoring', async () => {
      await healthMonitor.startMonitoring(mockConnector);
      const metricsBefore = healthMonitor.getHealthMetrics(mockConnector.id);
      
      await healthMonitor.stopMonitoring(mockConnector.id);
      const metricsAfter = healthMonitor.getHealthMetrics(mockConnector.id);

      expect(metricsBefore).toBeDefined();
      expect(metricsAfter).toBeDefined();
      expect(metricsAfter?.connectorId).toBe(mockConnector.id);
    });
  });

  describe('performHealthCheck', () => {
    it('should perform comprehensive health check', async () => {
      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.overall).toBe('healthy');
      expect(healthStatus.container.status).toBe('running');
      expect(healthStatus.mcp.connected).toBe(true);
      expect(healthStatus.system.dockerDaemon).toBe(true);
      expect(healthStatus.checks.length).toBeGreaterThan(0);
      expect(healthStatus.timestamp).toBeInstanceOf(Date);
    });

    it('should handle container health check failure', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          callback(new Error('Container not found'), null as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.container.status).toBe('error');
      expect(healthStatus.checks.some(check => 
        check.type === 'container' && check.status === 'fail'
      )).toBe(true);
    });

    it('should handle MCP health check failure', async () => {
      mockMCPProtocolHandler.getConnection.mockReturnValue(undefined);

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.mcp.connected).toBe(false);
      expect(healthStatus.checks.some(check => 
        check.type === 'mcp' && check.status === 'fail'
      )).toBe(true);
    });

    it('should detect high resource usage', async () => {
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker inspect')) {
          const containerInfo = {
            State: { Running: true, ExitCode: 0, StartedAt: new Date().toISOString(), RestartCount: 0 }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else if (cmd.includes('docker stats')) {
          // High CPU and memory usage
          callback(null, { stdout: '85.5%:480MiB / 512MiB', stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.checks.some(check => 
        check.id === 'container-cpu-high' && check.status === 'warn'
      )).toBe(true);
      expect(healthStatus.checks.some(check => 
        check.id === 'container-memory-high' && check.status === 'warn'
      )).toBe(true);
    });

    it('should detect container restarts', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          const containerInfo = {
            State: { 
              Running: true, 
              ExitCode: 0, 
              StartedAt: new Date().toISOString(), 
              RestartCount: 5 // High restart count
            }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.checks.some(check => 
        check.id === 'container-restarts' && check.status === 'warn'
      )).toBe(true);
    });

    it('should detect high MCP latency', async () => {
      mockMCPProtocolHandler.healthCheck.mockResolvedValue({
        healthy: true,
        latency: 1500 // High latency
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.checks.some(check => 
        check.id === 'mcp-latency-high' && check.status === 'warn'
      )).toBe(true);
    });

    it('should detect high MCP error rate', async () => {
      mockMCPProtocolHandler.getConnection.mockReturnValue({
        id: 'conn-123',
        connectorId: 'connector-123',
        serviceName: 'mcp-starship-456-github',
        url: 'tcp://mcp-starship-456-github:3000',
        status: 'connected',
        lastActivity: new Date(),
        reconnectAttempts: 0,
        maxReconnectAttempts: 3,
        requestCount: 100,
        errorCount: 15 // 15% error rate
      } as any);

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.checks.some(check => 
        check.id === 'mcp-error-rate-high' && check.status === 'warn'
      )).toBe(true);
    });

    it('should handle system health check errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const cmd = command.toString();
        
        if (cmd.includes('docker version')) {
          callback(new Error('Docker daemon not running'), null as any);
        } else if (cmd.includes('df /data')) {
          callback(null, { stdout: 'Use%\n 95%', stderr: '' } as any); // High disk usage
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.system.dockerDaemon).toBe(false);
      expect(healthStatus.checks.some(check => 
        check.id === 'docker-daemon-error' && check.status === 'fail'
      )).toBe(true);
      expect(healthStatus.checks.some(check => 
        check.id === 'disk-space-critical' && check.status === 'fail'
      )).toBe(true);
    });

    it('should emit healthCheckCompleted event', async () => {
      const healthCheckSpy = jest.fn();
      healthMonitor.on('healthCheckCompleted', healthCheckSpy);

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthCheckSpy).toHaveBeenCalledWith(mockConnector, healthStatus);
    });

    it('should handle complete health check failure', async () => {
      const healthCheckErrorSpy = jest.fn();
      healthMonitor.on('healthCheckError', healthCheckErrorSpy);

      // Mock all exec calls to fail
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('System failure'), null as any);
      });

      const healthStatus = await healthMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.overall).toBe('unknown');
      expect(healthCheckErrorSpy).toHaveBeenCalled();
    });
  });

  describe('alerting system', () => {
    beforeEach(async () => {
      await healthMonitor.startMonitoring(mockConnector);
    });

    it('should trigger unhealthy service alert', async () => {
      const alertSpy = jest.fn();
      healthMonitor.on('alertTriggered', alertSpy);

      // Mock unhealthy container
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          const containerInfo = {
            State: { Running: false, ExitCode: 1, StartedAt: new Date().toISOString(), RestartCount: 0 }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      await healthMonitor.performHealthCheck(mockConnector);

      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'critical',
        type: 'unhealthy',
        connectorId: mockConnector.id
      }));
    });

    it('should trigger high latency alert', async () => {
      const alertSpy = jest.fn();
      healthMonitor.on('alertTriggered', alertSpy);

      mockMCPProtocolHandler.healthCheck.mockResolvedValue({
        healthy: true,
        latency: 1500 // Above threshold
      });

      await healthMonitor.performHealthCheck(mockConnector);

      expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'warning',
        type: 'high_latency',
        connectorId: mockConnector.id
      }));
    });

    it('should respect alert cooldown', async () => {
      const alertSpy = jest.fn();
      healthMonitor.on('alertTriggered', alertSpy);

      // Mock unhealthy container
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          const containerInfo = {
            State: { Running: false, ExitCode: 1, StartedAt: new Date().toISOString(), RestartCount: 0 }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      // First check should trigger alert
      await healthMonitor.performHealthCheck(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Second check within cooldown should not trigger
      await healthMonitor.performHealthCheck(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Advance time past cooldown
      jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Third check should trigger alert again
      await healthMonitor.performHealthCheck(mockConnector);
      expect(alertSpy).toHaveBeenCalledTimes(2);
    });

    it('should get active alerts', async () => {
      // Trigger an alert
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          const containerInfo = {
            State: { Running: false, ExitCode: 1, StartedAt: new Date().toISOString(), RestartCount: 0 }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      await healthMonitor.performHealthCheck(mockConnector);

      const allAlerts = healthMonitor.getActiveAlerts();
      const connectorAlerts = healthMonitor.getActiveAlerts(mockConnector.id);

      expect(allAlerts.length).toBeGreaterThan(0);
      expect(connectorAlerts.length).toBeGreaterThan(0);
      expect(connectorAlerts[0].connectorId).toBe(mockConnector.id);
    });

    it('should resolve alerts', async () => {
      const alertResolvedSpy = jest.fn();
      healthMonitor.on('alertResolved', alertResolvedSpy);

      // Trigger an alert first
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker inspect')) {
          const containerInfo = {
            State: { Running: false, ExitCode: 1, StartedAt: new Date().toISOString(), RestartCount: 0 }
          };
          callback(null, { stdout: JSON.stringify(containerInfo), stderr: '' } as any);
        } else {
          callback(null, { stdout: '', stderr: '' } as any);
        }
      });

      await healthMonitor.performHealthCheck(mockConnector);

      const alerts = healthMonitor.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      await healthMonitor.resolveAlert(alertId);

      expect(alertResolvedSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: alertId,
        resolved: expect.any(Date)
      }));

      const remainingAlerts = healthMonitor.getActiveAlerts();
      expect(remainingAlerts.find(a => a.id === alertId)).toBeUndefined();
    });
  });

  describe('metrics and dashboard', () => {
    beforeEach(async () => {
      await healthMonitor.startMonitoring(mockConnector);
    });

    it('should update health metrics', async () => {
      await healthMonitor.performHealthCheck(mockConnector);

      const metrics = healthMonitor.getHealthMetrics(mockConnector.id);
      
      expect(metrics).toBeDefined();
      expect(metrics?.totalChecks).toBe(2); // Initial + manual check
      expect(metrics?.healthHistory.length).toBeGreaterThan(0);
      expect(metrics?.lastHealthCheck).toBeInstanceOf(Date);
    });

    it('should provide dashboard data', async () => {
      // Add another connector for more interesting dashboard data
      const mockConnector2 = {
        ...mockConnector,
        id: 'connector-456',
        dockerServiceName: 'mcp-starship-456-slack'
      };

      await healthMonitor.startMonitoring(mockConnector2);
      
      // Perform health checks
      await healthMonitor.performHealthCheck(mockConnector);
      await healthMonitor.performHealthCheck(mockConnector2);

      const dashboardData = healthMonitor.getDashboardData();

      expect(dashboardData.overview.totalServices).toBe(2);
      expect(dashboardData.overview.healthyServices).toBeGreaterThan(0);
      expect(dashboardData.services).toHaveLength(2);
      
      const service = dashboardData.services.find(s => s.connectorId === mockConnector.id);
      expect(service).toBeDefined();
      expect(service?.serviceName).toBe(mockConnector.dockerServiceName);
      expect(service?.starshipId).toBe(mockConnector.starshipId);
    });

    it('should retain health history within retention period', async () => {
      const metrics = healthMonitor.getHealthMetrics(mockConnector.id);
      expect(metrics).toBeDefined();

      // Simulate old health check data
      const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      metrics!.healthHistory.push({
        timestamp: oldTimestamp,
        status: 'healthy',
        checks: 5,
        failures: 0
      });

      // Perform health check to trigger cleanup
      await healthMonitor.performHealthCheck(mockConnector);

      // Old data should be cleaned up (retention is 1 day in test config)
      const updatedMetrics = healthMonitor.getHealthMetrics(mockConnector.id);
      const hasOldData = updatedMetrics?.healthHistory.some(
        h => h.timestamp.getTime() === oldTimestamp.getTime()
      );
      expect(hasOldData).toBe(false);
    });
  });

  describe('periodic monitoring', () => {
    it('should perform periodic health checks', async () => {
      const healthCheckSpy = jest.fn();
      healthMonitor.on('healthCheckCompleted', healthCheckSpy);

      await healthMonitor.startMonitoring(mockConnector);
      
      // Clear the initial health check call
      healthCheckSpy.mockClear();

      // Advance timer to trigger periodic check
      jest.advanceTimersByTime(mockConfig.checkInterval);

      expect(healthCheckSpy).toHaveBeenCalledTimes(1);

      // Advance timer again
      jest.advanceTimersByTime(mockConfig.checkInterval);

      expect(healthCheckSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle periodic check errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock health check to throw error
      jest.spyOn(healthMonitor, 'performHealthCheck').mockRejectedValue(new Error('Check failed'));

      await healthMonitor.startMonitoring(mockConnector);

      // Advance timer to trigger periodic check
      jest.advanceTimersByTime(mockConfig.checkInterval);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Health check failed for connector-123:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await healthMonitor.startMonitoring(mockConnector);
      
      const dashboardBefore = healthMonitor.getDashboardData();
      expect(dashboardBefore.overview.totalServices).toBe(1);

      await healthMonitor.shutdown();

      expect(clearInterval).toHaveBeenCalled();
      
      const dashboardAfter = healthMonitor.getDashboardData();
      expect(dashboardAfter.overview.totalServices).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should parse memory values correctly', () => {
      const parseMemoryValue = (healthMonitor as any).parseMemoryValue;
      
      expect(parseMemoryValue('512MiB')).toBe(512);
      expect(parseMemoryValue('1GiB')).toBe(1024);
      expect(parseMemoryValue('1024KiB')).toBe(1);
      expect(parseMemoryValue('256')).toBe(256);
    });

    it('should calculate overall health correctly', () => {
      const calculateOverallHealth = (healthMonitor as any).calculateOverallHealth;

      const healthyChecks = [
        { status: 'pass' },
        { status: 'pass' },
        { status: 'pass' }
      ];
      expect(calculateOverallHealth(healthyChecks)).toBe('healthy');

      const degradedChecks = [
        { status: 'pass' },
        { status: 'warn' },
        { status: 'pass' }
      ];
      expect(calculateOverallHealth(degradedChecks)).toBe('degraded');

      const unhealthyChecks = [
        { status: 'pass' },
        { status: 'fail' },
        { status: 'pass' }
      ];
      expect(calculateOverallHealth(unhealthyChecks)).toBe('unhealthy');

      const emptyChecks = [];
      expect(calculateOverallHealth(emptyChecks)).toBe('unknown');
    });
  });

  describe('configuration variations', () => {
    it('should work with container stats disabled', async () => {
      const configWithoutContainerStats = { ...mockConfig, containerStatsEnabled: false };
      const customMonitor = new HealthMonitorService(mockMCPProtocolHandler, configWithoutContainerStats);

      const healthStatus = await customMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.container.status).toBe('unknown');
      expect(healthStatus.checks.some(check => check.type === 'container')).toBe(false);
    });

    it('should work with MCP health disabled', async () => {
      const configWithoutMCPHealth = { ...mockConfig, mcpHealthEnabled: false };
      const customMonitor = new HealthMonitorService(mockMCPProtocolHandler, configWithoutMCPHealth);

      const healthStatus = await customMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.mcp.connected).toBe(false);
      expect(healthStatus.checks.some(check => check.type === 'mcp')).toBe(false);
    });

    it('should work with system health disabled', async () => {
      const configWithoutSystemHealth = { ...mockConfig, systemHealthEnabled: false };
      const customMonitor = new HealthMonitorService(mockMCPProtocolHandler, configWithoutSystemHealth);

      const healthStatus = await customMonitor.performHealthCheck(mockConnector);

      expect(healthStatus.system.dockerDaemon).toBe(false);
      expect(healthStatus.checks.some(check => check.type === 'system')).toBe(false);
    });
  });
});