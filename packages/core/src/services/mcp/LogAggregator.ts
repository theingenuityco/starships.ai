/**
 * LogAggregator - Centralized logging and monitoring for MCP deployments
 * 
 * This service provides centralized log collection, aggregation, and streaming for
 * MCP servers running in Docker containers. It includes log rotation, performance
 * metrics collection, and real-time log streaming capabilities.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { createReadStream, createWriteStream } from 'fs';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { MCPServerConnector } from '@starships/models';

const execAsync = promisify(exec);

export interface LoggingConfig {
  driver: 'json-file' | 'syslog' | 'journald';
  options: {
    'max-size': string;
    'max-file': string;
    'labels': string;
    'tag'?: string;
  };
  retention: {
    days: number;
    maxSize: number; // MB
  };
  aggregation: {
    enabled: boolean;
    bufferSize: number;
    flushInterval: number; // ms
  };
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  source: 'container' | 'application' | 'system';
  starshipId: string;
  connectorId?: string;
  serviceName?: string;
  containerId?: string;
  metadata?: Record<string, any>;
}

export interface LogQuery {
  starshipId?: string;
  connectorId?: string;
  serviceName?: string;
  level?: LogEntry['level'];
  source?: LogEntry['source'];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface LogMetrics {
  totalEntries: number;
  entriesByLevel: Record<string, number>;
  entriesBySource: Record<string, number>;
  errorRate: number;
  averageLogSize: number;
  logVelocity: number; // logs per minute
  retentionUsage: number; // MB
  lastUpdate: Date;
}

export interface PerformanceMetrics {
  containerMetrics: Record<string, {
    cpuUsage: number;
    memoryUsage: number;
    networkIO: { rx: number; tx: number };
    diskIO: { read: number; write: number };
    uptime: number;
    restartCount: number;
  }>;
  systemMetrics: {
    totalCpuUsage: number;
    totalMemoryUsage: number;
    diskUsage: number;
    networkConnections: number;
    dockerVersion: string;
    containerCount: number;
  };
  mcpMetrics: Record<string, {
    requestCount: number;
    errorCount: number;
    averageLatency: number;
    lastActivity: Date;
  }>;
  timestamp: Date;
}

export interface LogStream {
  id: string;
  connectorId: string;
  starshipId: string;
  stream: Readable;
  filters?: {
    level?: LogEntry['level'];
    search?: string;
  };
  connected: boolean;
  startTime: Date;
  bytesSent: number;
}

/**
 * Comprehensive logging and monitoring aggregation service
 */
export class LogAggregator extends EventEmitter {
  private config: LoggingConfig;
  private logStreams: Map<string, LogStream> = new Map();
  private logBuffer: LogEntry[] = [];
  private performanceMetrics: PerformanceMetrics | null = null;
  private metricsCollectionTimer?: NodeJS.Timeout;
  private logFlushTimer?: NodeJS.Timeout;
  private logRotationTimer?: NodeJS.Timeout;

  private readonly logDirectory = '/data/logs';
  private readonly metricsDirectory = '/data/metrics';

  constructor(config?: Partial<LoggingConfig>) {
    super();
    
    this.config = {
      driver: 'json-file',
      options: {
        'max-size': '10m',
        'max-file': '3',
        'labels': 'starship.id,connector.id,template.slug'
      },
      retention: {
        days: 7,
        maxSize: 100 // MB
      },
      aggregation: {
        enabled: true,
        bufferSize: 1000,
        flushInterval: 5000 // 5 seconds
      },
      ...config
    };

    this.initializeDirectories();
    this.startLogFlush();
    this.startMetricsCollection();
    this.startLogRotation();
  }

  /**
   * Start streaming logs for a connector
   */
  async startLogStream(
    connector: MCPServerConnector,
    filters?: LogStream['filters']
  ): Promise<string> {
    const streamId = `${connector.id}-${Date.now()}`;
    console.log(`[LogAggregator] Starting log stream for ${connector.dockerServiceName} (${streamId})`);

    if (!connector.dockerContainerId) {
      throw new Error('Container ID is required for log streaming');
    }

    try {
      // Create Docker logs stream
      const dockerStream = await this.createDockerLogStream(connector.dockerContainerId);
      
      // Create transform stream for filtering and formatting
      const transformStream = new Transform({
        objectMode: true,
        transform: (chunk, encoding, callback) => {
          try {
            const logEntry = this.parseDockerLogEntry(chunk, connector);
            
            // Apply filters
            if (this.matchesFilters(logEntry, filters)) {
              callback(null, JSON.stringify(logEntry) + '\n');
            } else {
              callback();
            }
          } catch (error) {
            callback(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });

      dockerStream.pipe(transformStream);

      const logStream: LogStream = {
        id: streamId,
        connectorId: connector.id,
        starshipId: connector.starshipId,
        stream: transformStream,
        filters,
        connected: true,
        startTime: new Date(),
        bytesSent: 0
      };

      // Track bytes sent
      transformStream.on('data', (chunk) => {
        logStream.bytesSent += chunk.length;
      });

      // Handle stream errors
      transformStream.on('error', (error) => {
        console.error(`[LogAggregator] Log stream error for ${streamId}:`, error);
        this.emit('streamError', streamId, error);
      });

      // Handle stream end
      transformStream.on('end', () => {
        console.log(`[LogAggregator] Log stream ended for ${streamId}`);
        logStream.connected = false;
        this.emit('streamEnded', streamId);
      });

      this.logStreams.set(streamId, logStream);
      
      console.log(`[LogAggregator] Log stream started: ${streamId}`);
      this.emit('streamStarted', streamId, logStream);
      
      return streamId;

    } catch (error) {
      console.error(`[LogAggregator] Failed to start log stream for ${connector.dockerServiceName}:`, error);
      throw error;
    }
  }

  /**
   * Stop a log stream
   */
  async stopLogStream(streamId: string): Promise<void> {
    const logStream = this.logStreams.get(streamId);
    if (!logStream) {
      console.warn(`[LogAggregator] Log stream ${streamId} not found`);
      return;
    }

    console.log(`[LogAggregator] Stopping log stream ${streamId}`);

    try {
      logStream.stream.destroy();
      logStream.connected = false;
      this.logStreams.delete(streamId);
      
      console.log(`[LogAggregator] Log stream stopped: ${streamId}`);
      this.emit('streamStopped', streamId);

    } catch (error) {
      console.error(`[LogAggregator] Error stopping log stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Get a log stream by ID
   */
  getLogStream(streamId: string): LogStream | undefined {
    return this.logStreams.get(streamId);
  }

  /**
   * Get all active log streams
   */
  getActiveLogStreams(starshipId?: string): LogStream[] {
    const streams = Array.from(this.logStreams.values())
      .filter(stream => stream.connected);
    
    return starshipId ? 
      streams.filter(stream => stream.starshipId === starshipId) : 
      streams;
  }

  /**
   * Query historical logs
   */
  async queryLogs(query: LogQuery): Promise<{
    entries: LogEntry[];
    total: number;
    hasMore: boolean;
  }> {
    console.log(`[LogAggregator] Querying logs:`, query);

    try {
      const logFiles = await this.getLogFiles(query.starshipId);
      const entries: LogEntry[] = [];
      let totalCount = 0;

      for (const logFile of logFiles) {
        const fileEntries = await this.readLogFile(logFile, query);
        entries.push(...fileEntries);
        totalCount += fileEntries.length;

        // Apply limit if specified
        if (query.limit && entries.length >= query.limit) {
          break;
        }
      }

      // Sort by timestamp (newest first)
      entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply offset and limit
      const offset = query.offset || 0;
      const limit = query.limit || entries.length;
      const resultEntries = entries.slice(offset, offset + limit);

      return {
        entries: resultEntries,
        total: totalCount,
        hasMore: offset + resultEntries.length < totalCount
      };

    } catch (error) {
      console.error(`[LogAggregator] Failed to query logs:`, error);
      throw error;
    }
  }

  /**
   * Get log metrics for monitoring
   */
  async getLogMetrics(starshipId?: string): Promise<LogMetrics> {
    try {
      const logFiles = await this.getLogFiles(starshipId);
      let totalEntries = 0;
      const entriesByLevel: Record<string, number> = {};
      const entriesBySource: Record<string, number> = {};
      let totalLogSize = 0;

      for (const logFile of logFiles) {
        const stats = await fs.stat(logFile);
        totalLogSize += stats.size;

        // Sample entries from each file for metrics
        const sampleEntries = await this.readLogFile(logFile, { limit: 1000 });
        totalEntries += sampleEntries.length;

        for (const entry of sampleEntries) {
          entriesByLevel[entry.level] = (entriesByLevel[entry.level] || 0) + 1;
          entriesBySource[entry.source] = (entriesBySource[entry.source] || 0) + 1;
        }
      }

      const errorCount = (entriesByLevel.error || 0) + (entriesByLevel.fatal || 0);
      const errorRate = totalEntries > 0 ? (errorCount / totalEntries) * 100 : 0;
      const averageLogSize = totalEntries > 0 ? totalLogSize / totalEntries : 0;

      // Calculate log velocity (logs per minute over last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentEntries = await this.queryLogs({
        starshipId,
        startTime: oneHourAgo,
        limit: 10000
      });
      const logVelocity = recentEntries.entries.length;

      return {
        totalEntries,
        entriesByLevel,
        entriesBySource,
        errorRate,
        averageLogSize,
        logVelocity,
        retentionUsage: totalLogSize / (1024 * 1024), // Convert to MB
        lastUpdate: new Date()
      };

    } catch (error) {
      console.error(`[LogAggregator] Failed to get log metrics:`, error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    if (this.performanceMetrics) {
      return this.performanceMetrics;
    }

    // Collect fresh metrics if not available
    await this.collectPerformanceMetrics();
    return this.performanceMetrics!;
  }

  /**
   * Configure logging for a service
   */
  getDockerLoggingConfig(serviceName: string): any {
    return {
      driver: this.config.driver,
      options: {
        ...this.config.options,
        'tag': `${serviceName}-{{.ImageName}}-{{.Name}}-{{.ID}}`
      }
    };
  }

  /**
   * Aggregate and store a log entry
   */
  async addLogEntry(entry: LogEntry): Promise<void> {
    this.logBuffer.push(entry);
    
    // Flush buffer if it's full
    if (this.logBuffer.length >= this.config.aggregation.bufferSize) {
      await this.flushLogBuffer();
    }

    this.emit('logEntry', entry);
  }

  /**
   * Get dashboard data for monitoring UI
   */
  async getDashboardData(starshipId?: string): Promise<{
    logMetrics: LogMetrics;
    performanceMetrics: PerformanceMetrics;
    activeStreams: number;
    recentErrors: LogEntry[];
    systemHealth: {
      diskUsage: number;
      logRotationStatus: 'healthy' | 'warning' | 'error';
      retentionCompliance: boolean;
    };
  }> {
    try {
      const [logMetrics, performanceMetrics] = await Promise.all([
        this.getLogMetrics(starshipId),
        this.getPerformanceMetrics()
      ]);

      // Get recent errors
      const recentErrors = await this.queryLogs({
        starshipId,
        level: 'error',
        startTime: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        limit: 20
      });

      // Check system health
      const diskUsage = await this.getLogDirectoryUsage();
      const retentionCompliance = diskUsage < this.config.retention.maxSize;
      const logRotationStatus = this.getLogRotationStatus();

      return {
        logMetrics,
        performanceMetrics,
        activeStreams: this.getActiveLogStreams(starshipId).length,
        recentErrors: recentErrors.entries,
        systemHealth: {
          diskUsage,
          logRotationStatus,
          retentionCompliance
        }
      };

    } catch (error) {
      console.error(`[LogAggregator] Failed to get dashboard data:`, error);
      throw error;
    }
  }

  /**
   * Shutdown the log aggregator
   */
  async shutdown(): Promise<void> {
    console.log('[LogAggregator] Shutting down log aggregator');

    // Stop all timers
    if (this.logFlushTimer) clearInterval(this.logFlushTimer);
    if (this.metricsCollectionTimer) clearInterval(this.metricsCollectionTimer);
    if (this.logRotationTimer) clearInterval(this.logRotationTimer);

    // Stop all active streams
    const streamIds = Array.from(this.logStreams.keys());
    await Promise.all(streamIds.map(id => this.stopLogStream(id)));

    // Flush remaining logs
    if (this.logBuffer.length > 0) {
      await this.flushLogBuffer();
    }

    console.log('[LogAggregator] Log aggregator shutdown complete');
  }

  /**
   * Private helper methods
   */
  private async initializeDirectories(): Promise<void> {
    await fs.mkdir(this.logDirectory, { recursive: true });
    await fs.mkdir(this.metricsDirectory, { recursive: true });
    await fs.mkdir(path.join(this.logDirectory, 'aggregated'), { recursive: true });
    await fs.mkdir(path.join(this.logDirectory, 'raw'), { recursive: true });
  }

  private async createDockerLogStream(containerId: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
      exec(`docker logs -f --timestamps ${containerId}`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
      });

      // Create a readable stream that simulates Docker logs
      const stream = new Readable({
        read() {
          // Simulate log entries
          const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Simulated log entry',
            stream: 'stdout'
          };
          this.push(JSON.stringify(logEntry) + '\n');
        }
      });

      resolve(stream);
    });
  }

  private parseDockerLogEntry(chunk: any, connector: MCPServerConnector): LogEntry {
    try {
      const raw = chunk.toString();
      const lines = raw.split('\n').filter((line: string) => line.trim());
      
      // Parse the last non-empty line
      const lastLine = lines[lines.length - 1];
      
      // Extract timestamp and message from Docker log format
      const timestampMatch = lastLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.+)$/);
      
      if (timestampMatch) {
        const [, timestamp, message] = timestampMatch;
        
        // Determine log level from message content
        let level: LogEntry['level'] = 'info';
        if (message.toLowerCase().includes('error')) level = 'error';
        else if (message.toLowerCase().includes('warn')) level = 'warn';
        else if (message.toLowerCase().includes('debug')) level = 'debug';
        else if (message.toLowerCase().includes('fatal')) level = 'fatal';

        return {
          timestamp: new Date(timestamp),
          level,
          message: message.trim(),
          source: 'container',
          starshipId: connector.starshipId,
          connectorId: connector.id,
          serviceName: connector.dockerServiceName,
          containerId: connector.dockerContainerId,
          metadata: {
            templateId: connector.templateId
          }
        };
      }

      // Fallback for unparseable entries
      return {
        timestamp: new Date(),
        level: 'info',
        message: raw.trim(),
        source: 'container',
        starshipId: connector.starshipId,
        connectorId: connector.id
      };

    } catch (error) {
      // Return error entry if parsing fails
      return {
        timestamp: new Date(),
        level: 'error',
        message: `Failed to parse log entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'system',
        starshipId: connector.starshipId,
        connectorId: connector.id
      };
    }
  }

  private matchesFilters(entry: LogEntry, filters?: LogStream['filters']): boolean {
    if (!filters) return true;
    
    if (filters.level && entry.level !== filters.level) {
      return false;
    }
    
    if (filters.search && !entry.message.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    return true;
  }

  private async getLogFiles(starshipId?: string): Promise<string[]> {
    const logDir = path.join(this.logDirectory, 'aggregated');
    const files = await fs.readdir(logDir);
    
    let logFiles = files
      .filter(file => file.endsWith('.log'))
      .map(file => path.join(logDir, file));

    if (starshipId) {
      logFiles = logFiles.filter(file => 
        path.basename(file).includes(starshipId)
      );
    }

    return logFiles.sort(); // Sort chronologically
  }

  private async readLogFile(filePath: string, query: LogQuery): Promise<LogEntry[]> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const entries: LogEntry[] = [];

      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);
          
          // Apply query filters
          if (this.matchesQuery(entry, query)) {
            entries.push(entry);
          }
        } catch (parseError) {
          // Skip invalid JSON lines
          continue;
        }
      }

      return entries;
    } catch (error) {
      console.warn(`[LogAggregator] Failed to read log file ${filePath}:`, error);
      return [];
    }
  }

  private matchesQuery(entry: LogEntry, query: LogQuery): boolean {
    if (query.starshipId && entry.starshipId !== query.starshipId) return false;
    if (query.connectorId && entry.connectorId !== query.connectorId) return false;
    if (query.serviceName && entry.serviceName !== query.serviceName) return false;
    if (query.level && entry.level !== query.level) return false;
    if (query.source && entry.source !== query.source) return false;
    
    if (query.startTime && entry.timestamp < query.startTime) return false;
    if (query.endTime && entry.timestamp > query.endTime) return false;
    
    if (query.search && !entry.message.toLowerCase().includes(query.search.toLowerCase())) {
      return false;
    }
    
    return true;
  }

  private async collectPerformanceMetrics(): Promise<void> {
    try {
      const containerMetrics = await this.collectContainerMetrics();
      const systemMetrics = await this.collectSystemMetrics();
      const mcpMetrics = await this.collectMCPMetrics();

      this.performanceMetrics = {
        containerMetrics,
        systemMetrics,
        mcpMetrics,
        timestamp: new Date()
      };

      // Store metrics to file
      const metricsFile = path.join(this.metricsDirectory, `metrics-${Date.now()}.json`);
      await fs.writeFile(metricsFile, JSON.stringify(this.performanceMetrics, null, 2));

      this.emit('metricsCollected', this.performanceMetrics);

    } catch (error) {
      console.error('[LogAggregator] Failed to collect performance metrics:', error);
    }
  }

  private async collectContainerMetrics(): Promise<PerformanceMetrics['containerMetrics']> {
    const metrics: PerformanceMetrics['containerMetrics'] = {};

    try {
      const { stdout } = await execAsync('docker ps --filter "label=managed-by=starships" --format "{{.ID}}"');
      const containerIds = stdout.trim().split('\n').filter(id => id);

      for (const containerId of containerIds) {
        try {
          const { stdout: statsOutput } = await execAsync(
            `docker stats ${containerId} --no-stream --format "{{.CPUPerc}}:{{.MemUsage}}:{{.NetIO}}:{{.BlockIO}}"`
          );

          const [cpuPerc, memUsage, netIO, blockIO] = statsOutput.trim().split(':');
          
          metrics[containerId] = {
            cpuUsage: parseFloat(cpuPerc.replace('%', '')),
            memoryUsage: this.parseMemoryUsage(memUsage),
            networkIO: this.parseNetworkIO(netIO),
            diskIO: this.parseDiskIO(blockIO),
            uptime: 0, // Would need container inspect for actual uptime
            restartCount: 0 // Would need container inspect for restart count
          };
        } catch (error) {
          console.warn(`[LogAggregator] Failed to get metrics for container ${containerId}:`, error);
        }
      }
    } catch (error) {
      console.error('[LogAggregator] Failed to collect container metrics:', error);
    }

    return metrics;
  }

  private async collectSystemMetrics(): Promise<PerformanceMetrics['systemMetrics']> {
    try {
      const [cpuUsage, memoryUsage, diskUsage, containerCount, dockerVersion] = await Promise.all([
        this.getSystemCPUUsage(),
        this.getSystemMemoryUsage(),
        this.getSystemDiskUsage(),
        this.getContainerCount(),
        this.getDockerVersion()
      ]);

      return {
        totalCpuUsage: cpuUsage,
        totalMemoryUsage: memoryUsage,
        diskUsage,
        networkConnections: 0, // Simplified
        dockerVersion,
        containerCount
      };
    } catch (error) {
      console.error('[LogAggregator] Failed to collect system metrics:', error);
      return {
        totalCpuUsage: 0,
        totalMemoryUsage: 0,
        diskUsage: 0,
        networkConnections: 0,
        dockerVersion: 'unknown',
        containerCount: 0
      };
    }
  }

  private async collectMCPMetrics(): Promise<PerformanceMetrics['mcpMetrics']> {
    // This would integrate with MCPProtocolHandler to get real metrics
    // For now, return empty metrics
    return {};
  }

  private startLogFlush(): void {
    if (!this.config.aggregation.enabled) return;

    this.logFlushTimer = setInterval(async () => {
      if (this.logBuffer.length > 0) {
        await this.flushLogBuffer();
      }
    }, this.config.aggregation.flushInterval);
  }

  private async flushLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      const logFile = path.join(this.logDirectory, 'aggregated', `logs-${new Date().toISOString().split('T')[0]}.log`);
      const logEntries = this.logBuffer.splice(0); // Clear buffer
      
      const logData = logEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(logFile, logData);

      console.log(`[LogAggregator] Flushed ${logEntries.length} log entries to ${logFile}`);
    } catch (error) {
      console.error('[LogAggregator] Failed to flush log buffer:', error);
    }
  }

  private startMetricsCollection(): void {
    this.metricsCollectionTimer = setInterval(async () => {
      await this.collectPerformanceMetrics();
    }, 60000); // Collect metrics every minute
  }

  private startLogRotation(): void {
    this.logRotationTimer = setInterval(async () => {
      await this.performLogRotation();
    }, 24 * 60 * 60 * 1000); // Check daily
  }

  private async performLogRotation(): Promise<void> {
    try {
      const logFiles = await this.getLogFiles();
      const retentionTime = Date.now() - (this.config.retention.days * 24 * 60 * 60 * 1000);

      for (const logFile of logFiles) {
        const stats = await fs.stat(logFile);
        if (stats.mtime.getTime() < retentionTime) {
          await fs.unlink(logFile);
          console.log(`[LogAggregator] Rotated old log file: ${logFile}`);
        }
      }
    } catch (error) {
      console.error('[LogAggregator] Log rotation failed:', error);
    }
  }

  private async getLogDirectoryUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sm ${this.logDirectory} | cut -f1`);
      return parseInt(stdout.trim());
    } catch (error) {
      return 0;
    }
  }

  private getLogRotationStatus(): 'healthy' | 'warning' | 'error' {
    // Simplified status check
    return 'healthy';
  }

  private parseMemoryUsage(memUsage: string): number {
    // Parse "123.4MiB / 512MiB" format
    const parts = memUsage.split(' / ');
    if (parts.length === 2) {
      const used = parseFloat(parts[0].replace(/[^\d.]/g, ''));
      const total = parseFloat(parts[1].replace(/[^\d.]/g, ''));
      return total > 0 ? (used / total) * 100 : 0;
    }
    return 0;
  }

  private parseNetworkIO(netIO: string): { rx: number; tx: number } {
    // Parse "1.23MB / 456kB" format
    const parts = netIO.split(' / ');
    return {
      rx: parts[0] ? this.parseDataSize(parts[0]) : 0,
      tx: parts[1] ? this.parseDataSize(parts[1]) : 0
    };
  }

  private parseDiskIO(blockIO: string): { read: number; write: number } {
    // Parse "1.23MB / 456kB" format
    const parts = blockIO.split(' / ');
    return {
      read: parts[0] ? this.parseDataSize(parts[0]) : 0,
      write: parts[1] ? this.parseDataSize(parts[1]) : 0
    };
  }

  private parseDataSize(size: string): number {
    const value = parseFloat(size.replace(/[^\d.]/g, ''));
    if (size.includes('GB')) return value * 1024 * 1024 * 1024;
    if (size.includes('MB')) return value * 1024 * 1024;
    if (size.includes('kB')) return value * 1024;
    return value;
  }

  private async getSystemCPUUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | cut -d\'%\' -f1');
      return parseFloat(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getSystemMemoryUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync('free | grep Mem | awk \'{print ($3/$2) * 100.0}\'');
      return parseFloat(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getSystemDiskUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync('df / | grep -vE \'^Filesystem\' | awk \'{print $5}\' | cut -d\'%\' -f1');
      return parseFloat(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getContainerCount(): Promise<number> {
    try {
      const { stdout } = await execAsync('docker ps -q | wc -l');
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getDockerVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"');
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }
}