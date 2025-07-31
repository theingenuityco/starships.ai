import { LogAggregator, LoggingConfig, LogEntry, LogQuery, LogMetrics, PerformanceMetrics } from '../LogAggregator';
import { MCPServerConnector } from '@starships/models';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { Readable } from 'stream';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
  },
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock timers
jest.useFakeTimers();

describe('LogAggregator', () => {
  let logAggregator: LogAggregator;
  
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

  const mockConfig: LoggingConfig = {
    driver: 'json-file',
    options: {
      'max-size': '5m',
      'max-file': '2',
      'labels': 'starship.id,connector.id,template.slug'
    },
    retention: {
      days: 3,
      maxSize: 50
    },
    aggregation: {
      enabled: true,
      bufferSize: 100,
      flushInterval: 1000
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    logAggregator = new LogAggregator(mockConfig);

    // Mock successful filesystem operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readFile.mockResolvedValue('');
    mockFs.writeFile.mockResolvedValue();
    mockFs.appendFile.mockResolvedValue();
    mockFs.stat.mockResolvedValue({
      size: 1024,
      mtime: new Date(),
      isDirectory: () => false
    } as any);

    // Mock successful exec operations
    mockExec.mockImplementation((command, callback) => {
      const cmd = command.toString();
      
      if (cmd.includes('docker logs')) {
        callback(null, { stdout: '', stderr: '' } as any);
      } else if (cmd.includes('docker ps')) {
        callback(null, { stdout: 'container1\ncontainer2', stderr: '' } as any);
      } else if (cmd.includes('docker stats')) {
        callback(null, { stdout: '25.5%:123MiB / 512MiB:1.2MB / 3.4MB:5.6MB / 7.8MB', stderr: '' } as any);
      } else if (cmd.includes('docker version')) {
        callback(null, { stdout: '24.0.0', stderr: '' } as any);
      } else if (cmd.includes('top -bn1')) {
        callback(null, { stdout: 'Cpu(s): 15.2%us', stderr: '' } as any);
      } else if (cmd.includes('free')) {
        callback(null, { stdout: '75.5', stderr: '' } as any);
      } else if (cmd.includes('df /')) {
        callback(null, { stdout: '85', stderr: '' } as any);
      } else if (cmd.includes('du -sm')) {
        callback(null, { stdout: '25', stderr: '' } as any);
      } else {
        callback(null, { stdout: '', stderr: '' } as any);
      }
    });
  });

  afterEach(() => {
    logAggregator.removeAllListeners();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultAggregator = new LogAggregator();
      expect((defaultAggregator as any).config.driver).toBe('json-file');
      expect((defaultAggregator as any).config.retention.days).toBe(7);
    });

    it('should initialize with custom config', () => {
      expect((logAggregator as any).config.retention.days).toBe(3);
      expect((logAggregator as any).config.aggregation.bufferSize).toBe(100);
    });

    it('should create required directories', () => {
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/logs', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/metrics', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/logs/aggregated', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('/data/logs/raw', { recursive: true });
    });

    it('should start periodic timers', () => {
      expect(setInterval).toHaveBeenCalledTimes(3); // flush, metrics, rotation
    });
  });

  describe('startLogStream', () => {
    it('should start log stream for connector', async () => {
      const streamStartedSpy = jest.fn();
      logAggregator.on('streamStarted', streamStartedSpy);

      const streamId = await logAggregator.startLogStream(mockConnector);

      expect(streamId).toBeDefined();
      expect(streamId).toMatch(/^connector-123-\d+$/);
      expect(streamStartedSpy).toHaveBeenCalledWith(streamId, expect.objectContaining({
        id: streamId,
        connectorId: mockConnector.id,
        starshipId: mockConnector.starshipId
      }));

      const stream = logAggregator.getLogStream(streamId);
      expect(stream).toBeDefined();
      expect(stream?.connected).toBe(true);
    });

    it('should reject if container ID is missing', async () => {
      const invalidConnector = { ...mockConnector, dockerContainerId: undefined };

      await expect(logAggregator.startLogStream(invalidConnector)).rejects.toThrow(
        'Container ID is required for log streaming'
      );
    });

    it('should apply log stream filters', async () => {
      const filters = {
        level: 'error' as const,
        search: 'database'
      };

      const streamId = await logAggregator.startLogStream(mockConnector, filters);
      const stream = logAggregator.getLogStream(streamId);

      expect(stream?.filters).toEqual(filters);
    });

    it('should handle stream errors', async () => {
      const streamErrorSpy = jest.fn();
      logAggregator.on('streamError', streamErrorSpy);

      const streamId = await logAggregator.startLogStream(mockConnector);
      const stream = logAggregator.getLogStream(streamId);

      // Simulate stream error
      stream?.stream.emit('error', new Error('Stream error'));

      expect(streamErrorSpy).toHaveBeenCalledWith(streamId, expect.any(Error));
    });

    it('should handle stream end', async () => {
      const streamEndedSpy = jest.fn();
      logAggregator.on('streamEnded', streamEndedSpy);

      const streamId = await logAggregator.startLogStream(mockConnector);
      const stream = logAggregator.getLogStream(streamId);

      // Simulate stream end
      stream?.stream.emit('end');

      expect(streamEndedSpy).toHaveBeenCalledWith(streamId);
      expect(stream?.connected).toBe(false);
    });
  });

  describe('stopLogStream', () => {
    it('should stop active log stream', async () => {
      const streamStoppedSpy = jest.fn();
      logAggregator.on('streamStopped', streamStoppedSpy);

      const streamId = await logAggregator.startLogStream(mockConnector);
      await logAggregator.stopLogStream(streamId);

      expect(streamStoppedSpy).toHaveBeenCalledWith(streamId);
      expect(logAggregator.getLogStream(streamId)).toBeUndefined();
    });

    it('should handle non-existent stream gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await logAggregator.stopLogStream('non-existent-stream');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LogAggregator] Log stream non-existent-stream not found'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getActiveLogStreams', () => {
    it('should return all active streams', async () => {
      const streamId1 = await logAggregator.startLogStream(mockConnector);
      const connector2 = { ...mockConnector, id: 'connector-456', starshipId: 'starship-789' };
      const streamId2 = await logAggregator.startLogStream(connector2);

      const allStreams = logAggregator.getActiveLogStreams();
      expect(allStreams).toHaveLength(2);

      const starshipStreams = logAggregator.getActiveLogStreams('starship-456');
      expect(starshipStreams).toHaveLength(1);
      expect(starshipStreams[0].starshipId).toBe('starship-456');
    });

    it('should filter out disconnected streams', async () => {
      const streamId = await logAggregator.startLogStream(mockConnector);
      const stream = logAggregator.getLogStream(streamId);
      
      // Simulate disconnection
      if (stream) {
        stream.connected = false;
      }

      const activeStreams = logAggregator.getActiveLogStreams();
      expect(activeStreams).toHaveLength(0);
    });
  });

  describe('queryLogs', () => {
    beforeEach(() => {
      // Mock log files
      mockFs.readdir.mockResolvedValue(['logs-2025-01-25.log', 'logs-2025-01-24.log'] as any);
      
      const sampleLogEntries = [
        { timestamp: new Date('2025-01-25T10:00:00Z'), level: 'info', message: 'Test log 1', starshipId: 'starship-456' },
        { timestamp: new Date('2025-01-25T11:00:00Z'), level: 'error', message: 'Test error', starshipId: 'starship-456' },
        { timestamp: new Date('2025-01-25T12:00:00Z'), level: 'warn', message: 'Test warning', starshipId: 'starship-789' }
      ];

      mockFs.readFile.mockResolvedValue(
        sampleLogEntries.map(entry => JSON.stringify(entry)).join('\n')
      );
    });

    it('should query logs with basic filters', async () => {
      const query: LogQuery = {
        starshipId: 'starship-456',
        level: 'error',
        limit: 10
      };

      const result = await logAggregator.queryLogs(query);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].level).toBe('error');
      expect(result.entries[0].starshipId).toBe('starship-456');
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should query logs with time range', async () => {
      const query: LogQuery = {
        startTime: new Date('2025-01-25T10:30:00Z'),
        endTime: new Date('2025-01-25T11:30:00Z')
      };

      const result = await logAggregator.queryLogs(query);

      expect(result.entries.length).toBeGreaterThan(0);
      result.entries.forEach(entry => {
        expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(query.startTime!.getTime());
        expect(entry.timestamp.getTime()).toBeLessThanOrEqual(query.endTime!.getTime());
      });
    });

    it('should query logs with search term', async () => {
      const query: LogQuery = {
        search: 'error'
      };

      const result = await logAggregator.queryLogs(query);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].message).toContain('error');
    });

    it('should handle pagination', async () => {
      const query: LogQuery = {
        limit: 1,
        offset: 1
      };

      const result = await logAggregator.queryLogs(query);

      expect(result.entries).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('should handle query errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(logAggregator.queryLogs({})).rejects.toThrow('Permission denied');
    });

    it('should handle invalid JSON in log files', async () => {
      mockFs.readFile.mockResolvedValue('invalid json\n{"valid": "json"}');

      const result = await logAggregator.queryLogs({});

      // Should skip invalid lines and process valid ones
      expect(result.entries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('addLogEntry', () => {
    it('should add log entry to buffer', async () => {
      const logEntrySpy = jest.fn();
      logAggregator.on('logEntry', logEntrySpy);

      const entry: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test log entry',
        source: 'application',
        starshipId: 'starship-456',
        connectorId: 'connector-123'
      };

      await logAggregator.addLogEntry(entry);

      expect(logEntrySpy).toHaveBeenCalledWith(entry);
      expect((logAggregator as any).logBuffer).toContain(entry);
    });

    it('should flush buffer when full', async () => {
      const flushSpy = jest.spyOn(logAggregator as any, 'flushLogBuffer');

      // Fill buffer to capacity
      for (let i = 0; i < mockConfig.aggregation.bufferSize; i++) {
        await logAggregator.addLogEntry({
          timestamp: new Date(),
          level: 'info',
          message: `Test entry ${i}`,
          source: 'application',
          starshipId: 'starship-456'
        });
      }

      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('getLogMetrics', () => {
    beforeEach(() => {
      mockFs.readdir.mockResolvedValue(['logs-2025-01-25.log'] as any);
      mockFs.stat.mockResolvedValue({ size: 2048 } as any);
      
      const logEntries = [
        { level: 'info', source: 'container', message: 'Info message' },
        { level: 'error', source: 'application', message: 'Error message' },
        { level: 'warn', source: 'system', message: 'Warning message' }
      ];

      mockFs.readFile.mockResolvedValue(
        logEntries.map(entry => JSON.stringify(entry)).join('\n')
      );
    });

    it('should calculate log metrics correctly', async () => {
      const metrics = await logAggregator.getLogMetrics();

      expect(metrics.totalEntries).toBeGreaterThan(0);
      expect(metrics.entriesByLevel).toHaveProperty('info');
      expect(metrics.entriesByLevel).toHaveProperty('error');
      expect(metrics.entriesBySource).toHaveProperty('container');
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.retentionUsage).toBeGreaterThan(0);
      expect(metrics.lastUpdate).toBeInstanceOf(Date);
    });

    it('should filter metrics by starship ID', async () => {
      const metrics = await logAggregator.getLogMetrics('starship-456');

      expect(metrics).toBeDefined();
      expect(typeof metrics.totalEntries).toBe('number');
    });

    it('should handle metrics calculation errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('File system error'));

      await expect(logAggregator.getLogMetrics()).rejects.toThrow('File system error');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should collect and return performance metrics', async () => {
      const metrics = await logAggregator.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.containerMetrics).toBeDefined();
      expect(metrics.systemMetrics).toBeDefined();
      expect(metrics.mcpMetrics).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should cache performance metrics', async () => {
      const metrics1 = await logAggregator.getPerformanceMetrics();
      const metrics2 = await logAggregator.getPerformanceMetrics();

      expect(metrics1.timestamp).toEqual(metrics2.timestamp);
    });

    it('should handle metrics collection errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Docker not available'), null as any);
      });

      const metrics = await logAggregator.getPerformanceMetrics();

      // Should return default/empty metrics on error
      expect(metrics.systemMetrics.containerCount).toBe(0);
      expect(metrics.systemMetrics.dockerVersion).toBe('unknown');
    });
  });

  describe('getDashboardData', () => {
    beforeEach(() => {
      // Mock successful metrics collection
      jest.spyOn(logAggregator, 'getLogMetrics').mockResolvedValue({
        totalEntries: 1000,
        entriesByLevel: { info: 800, warn: 150, error: 50 },
        entriesBySource: { container: 500, application: 300, system: 200 },
        errorRate: 5.0,
        averageLogSize: 256,
        logVelocity: 120,
        retentionUsage: 25.5,
        lastUpdate: new Date()
      });

      jest.spyOn(logAggregator, 'queryLogs').mockResolvedValue({
        entries: [
          {
            timestamp: new Date(),
            level: 'error',
            message: 'Database connection failed',
            source: 'application',
            starshipId: 'starship-456'
          }
        ],
        total: 1,
        hasMore: false
      });
    });

    it('should return comprehensive dashboard data', async () => {
      const dashboardData = await logAggregator.getDashboardData();

      expect(dashboardData.logMetrics).toBeDefined();
      expect(dashboardData.performanceMetrics).toBeDefined();
      expect(dashboardData.activeStreams).toBe(0);
      expect(dashboardData.recentErrors).toHaveLength(1);
      expect(dashboardData.systemHealth).toBeDefined();
      expect(dashboardData.systemHealth.diskUsage).toBe(25);
      expect(dashboardData.systemHealth.logRotationStatus).toBe('healthy');
      expect(dashboardData.systemHealth.retentionCompliance).toBe(true);
    });

    it('should filter dashboard data by starship ID', async () => {
      const dashboardData = await logAggregator.getDashboardData('starship-456');

      expect(dashboardData).toBeDefined();
      expect(logAggregator.getLogMetrics).toHaveBeenCalledWith('starship-456');
    });

    it('should handle dashboard data errors', async () => {
      jest.spyOn(logAggregator, 'getLogMetrics').mockRejectedValue(new Error('Metrics error'));

      await expect(logAggregator.getDashboardData()).rejects.toThrow('Metrics error');
    });
  });

  describe('getDockerLoggingConfig', () => {
    it('should return Docker logging configuration', () => {
      const config = logAggregator.getDockerLoggingConfig('test-service');

      expect(config.driver).toBe('json-file');
      expect(config.options['max-size']).toBe('5m');
      expect(config.options['max-file']).toBe('2');
      expect(config.options.tag).toBe('test-service-{{.ImageName}}-{{.Name}}-{{.ID}}');
    });
  });

  describe('periodic operations', () => {
    it('should flush log buffer periodically', async () => {
      const flushSpy = jest.spyOn(logAggregator as any, 'flushLogBuffer');

      // Add entry to buffer
      await logAggregator.addLogEntry({
        timestamp: new Date(),
        level: 'info',
        message: 'Test entry',
        source: 'application',
        starshipId: 'starship-456'
      });

      // Advance timer to trigger flush
      jest.advanceTimersByTime(mockConfig.aggregation.flushInterval);

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should collect metrics periodically', async () => {
      const collectSpy = jest.spyOn(logAggregator as any, 'collectPerformanceMetrics');

      // Advance timer to trigger metrics collection
      jest.advanceTimersByTime(60000); // 1 minute

      expect(collectSpy).toHaveBeenCalled();
    });

    it('should perform log rotation periodically', async () => {
      const rotationSpy = jest.spyOn(logAggregator as any, 'performLogRotation');

      // Advance timer to trigger log rotation
      jest.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day

      expect(rotationSpy).toHaveBeenCalled();
    });
  });

  describe('log parsing and filtering', () => {
    it('should parse Docker log entries correctly', () => {
      const parseMethod = (logAggregator as any).parseDockerLogEntry;
      const chunk = '2025-01-25T10:30:00.123456789Z This is a test log message';

      const entry = parseMethod(chunk, mockConnector);

      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.message).toContain('test log message');
      expect(entry.starshipId).toBe(mockConnector.starshipId);
      expect(entry.connectorId).toBe(mockConnector.id);
      expect(entry.source).toBe('container');
    });

    it('should detect log levels from message content', () => {
      const parseMethod = (logAggregator as any).parseDockerLogEntry;

      const errorChunk = '2025-01-25T10:30:00.123Z ERROR: Database connection failed';
      const warnChunk = '2025-01-25T10:30:00.123Z WARN: Memory usage high';
      const debugChunk = '2025-01-25T10:30:00.123Z DEBUG: Processing request';

      expect(parseMethod(errorChunk, mockConnector).level).toBe('error');
      expect(parseMethod(warnChunk, mockConnector).level).toBe('warn');
      expect(parseMethod(debugChunk, mockConnector).level).toBe('debug');
    });

    it('should handle unparseable log entries', () => {
      const parseMethod = (logAggregator as any).parseDockerLogEntry;
      const invalidChunk = 'invalid log format';

      const entry = parseMethod(invalidChunk, mockConnector);

      expect(entry.message).toContain('invalid log format');
      expect(entry.level).toBe('info'); // Default level
    });

    it('should filter log entries correctly', () => {
      const matchesFilters = (logAggregator as any).matchesFilters;

      const entry: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Database connection failed',
        source: 'application',
        starshipId: 'starship-456'
      };

      expect(matchesFilters(entry, { level: 'error' })).toBe(true);
      expect(matchesFilters(entry, { level: 'info' })).toBe(false);
      expect(matchesFilters(entry, { search: 'database' })).toBe(true);
      expect(matchesFilters(entry, { search: 'network' })).toBe(false);
      expect(matchesFilters(entry, { level: 'error', search: 'database' })).toBe(true);
      expect(matchesFilters(entry, { level: 'info', search: 'database' })).toBe(false);
    });
  });

  describe('resource parsing utilities', () => {
    it('should parse memory usage correctly', () => {
      const parseMemoryUsage = (logAggregator as any).parseMemoryUsage;

      expect(parseMemoryUsage('123.4MiB / 512MiB')).toBeCloseTo(24.1, 1);
      expect(parseMemoryUsage('256MiB / 1GiB')).toBeCloseTo(25.0, 1);
      expect(parseMemoryUsage('invalid format')).toBe(0);
    });

    it('should parse network IO correctly', () => {
      const parseNetworkIO = (logAggregator as any).parseNetworkIO;

      const result = parseNetworkIO('1.23MB / 456kB');
      expect(result.rx).toBeCloseTo(1230000, 0);
      expect(result.tx).toBeCloseTo(456000, 0);
    });

    it('should parse data sizes correctly', () => {
      const parseDataSize = (logAggregator as any).parseDataSize;

      expect(parseDataSize('1GB')).toBe(1024 * 1024 * 1024);
      expect(parseDataSize('512MB')).toBe(512 * 1024 * 1024);
      expect(parseDataSize('256kB')).toBe(256 * 1024);
      expect(parseDataSize('123')).toBe(123);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      // Start a stream
      const streamId = await logAggregator.startLogStream(mockConnector);
      
      // Add entries to buffer
      await logAggregator.addLogEntry({
        timestamp: new Date(),
        level: 'info',
        message: 'Test entry',
        source: 'application',
        starshipId: 'starship-456'
      });

      const flushSpy = jest.spyOn(logAggregator as any, 'flushLogBuffer');

      await logAggregator.shutdown();

      expect(clearInterval).toHaveBeenCalledTimes(3); // flush, metrics, rotation timers
      expect(logAggregator.getLogStream(streamId)).toBeUndefined();
      expect(flushSpy).toHaveBeenCalled(); // Should flush remaining logs
    });
  });

  describe('error handling', () => {
    it('should handle log buffer flush errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFs.appendFile.mockRejectedValue(new Error('Disk full'));

      await logAggregator.addLogEntry({
        timestamp: new Date(),
        level: 'info',
        message: 'Test entry',
        source: 'application',
        starshipId: 'starship-456'
      });

      // Trigger flush
      await (logAggregator as any).flushLogBuffer();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LogAggregator] Failed to flush log buffer:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle log rotation errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await (logAggregator as any).performLogRotation();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LogAggregator] Log rotation failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle performance metrics collection errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Command failed'), null as any);
      });

      await (logAggregator as any).collectPerformanceMetrics();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LogAggregator] Failed to collect performance metrics:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('metrics collection edge cases', () => {
    it('should handle empty container list', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.toString().includes('docker ps')) {
          callback(null, { stdout: '', stderr: '' } as any);
        } else {
          callback(null, { stdout: '0', stderr: '' } as any);
        }
      });

      const metrics = await logAggregator.getPerformanceMetrics();

      expect(Object.keys(metrics.containerMetrics)).toHaveLength(0);
      expect(metrics.systemMetrics.containerCount).toBe(0);
    });

    it('should handle system command failures gracefully', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Command not found'), null as any);
      });

      const metrics = await logAggregator.getPerformanceMetrics();

      expect(metrics.systemMetrics.totalCpuUsage).toBe(0);
      expect(metrics.systemMetrics.totalMemoryUsage).toBe(0);
      expect(metrics.systemMetrics.diskUsage).toBe(0);
    });
  });
});