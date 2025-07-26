/**
 * ResourceManager - Resource allocation and monitoring for MCP deployments
 * 
 * This service manages container resource limits, disk quotas, and network constraints.
 * It provides resource monitoring, alerting, and enforcement for MCP servers running
 * in Docker containers.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MCPServerConnector } from '@starships/models';

const execAsync = promisify(exec);

export interface ResourceConfig {
  cpu: {
    defaultLimit: string;           // '0.5' for 0.5 cores
    maxLimit: string;               // '2.0' for maximum 2 cores
    alertThreshold: number;         // 80% CPU usage alert
  };
  memory: {
    defaultLimit: string;           // '512M' 
    maxLimit: string;               // '2G'
    alertThreshold: number;         // 90% memory usage alert
  };
  disk: {
    starshipQuotaGB: number;        // 1GB per starship workspace
    maxQuotaGB: number;             // 10GB maximum per starship
    alertThreshold: number;         // 80% disk usage alert
  };
  network: {
    enableBandwidthLimiting: boolean;
    defaultBandwidthMbps: number;   // 100 Mbps default
    maxBandwidthMbps: number;       // 1000 Mbps maximum
  };
  monitoring: {
    checkInterval: number;          // 30 seconds
    alertCooldown: number;          // 5 minutes between alerts
    retentionDays: number;          // 7 days of metrics retention
  };
}

export interface ResourceLimits {
  cpuLimit: string;                 // Docker CPU limit
  memoryLimit: string;              // Docker memory limit
  diskQuotaBytes: number;           // Disk quota in bytes
  networkBandwidthMbps?: number;    // Network bandwidth limit
}

export interface ResourceUsage {
  cpu: {
    usage: number;                  // Percentage
    limit: string;                  // Limit string (e.g., '0.5')
    throttledTime?: number;         // CPU throttled time in ms
  };
  memory: {
    usage: number;                  // Percentage
    usedBytes: number;              // Used memory in bytes
    limitBytes: number;             // Memory limit in bytes
    swapUsage?: number;             // Swap usage in bytes
  };
  disk: {
    usage: number;                  // Percentage
    usedBytes: number;              // Used disk in bytes
    quotaBytes: number;             // Disk quota in bytes
    availableBytes: number;         // Available disk space
  };
  network: {
    rxBytesPerSec: number;          // Receive rate
    txBytesPerSec: number;          // Transmit rate
    bandwidthLimitMbps?: number;    // Bandwidth limit
  };
  timestamp: Date;
}

export interface ResourceMetrics {
  connectorId: string;
  starshipId: string;
  serviceName: string;
  resourceHistory: {
    timestamp: Date;
    cpu: number;
    memory: number;
    disk: number;
    network: { rx: number; tx: number };
  }[];
  totalViolations: number;
  lastViolation?: Date;
  averageCpuUsage: number;
  averageMemoryUsage: number;
  peakCpuUsage: number;
  peakMemoryUsage: number;
}

export interface ResourceAlert {
  id: string;
  connectorId: string;
  starshipId: string;
  serviceName: string;
  type: 'cpu_high' | 'memory_high' | 'disk_quota_exceeded' | 'network_throttle';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  resolved?: Date;
}

export interface QuotaEnforcement {
  starshipId: string;
  quotaBytes: number;
  usedBytes: number;
  enforced: boolean;
  lastCheck: Date;
  violations: number;
}

/**
 * Comprehensive resource management service for MCP deployments
 */
export class ResourceManager extends EventEmitter {
  private config: ResourceConfig;
  private resourceMetrics: Map<string, ResourceMetrics> = new Map();
  private activeAlerts: Map<string, ResourceAlert> = new Map();
  private quotaEnforcements: Map<string, QuotaEnforcement> = new Map();
  private monitoringTimers: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly dataDirectory = '/data';
  private readonly starshipsDirectory = '/data/starships';

  constructor(config?: Partial<ResourceConfig>) {
    super();
    
    this.config = {
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
        enableBandwidthLimiting: false, // Disabled by default
        defaultBandwidthMbps: 100,
        maxBandwidthMbps: 1000
      },
      monitoring: {
        checkInterval: 30000,          // 30 seconds
        alertCooldown: 300000,         // 5 minutes
        retentionDays: 7
      },
      ...config
    };
  }

  /**
   * Calculate resource limits for a connector
   */
  calculateResourceLimits(
    connector: MCPServerConnector,
    overrides?: Partial<ResourceLimits>
  ): ResourceLimits {
    const limits: ResourceLimits = {
      cpuLimit: overrides?.cpuLimit || this.config.cpu.defaultLimit,
      memoryLimit: overrides?.memoryLimit || this.config.memory.defaultLimit,
      diskQuotaBytes: overrides?.diskQuotaBytes || 
        this.config.disk.starshipQuotaGB * 1024 * 1024 * 1024,
      networkBandwidthMbps: this.config.network.enableBandwidthLimiting ?
        overrides?.networkBandwidthMbps || this.config.network.defaultBandwidthMbps :
        undefined
    };

    console.log(`[ResourceManager] Calculated limits for ${connector.id}:`, limits);
    return limits;
  }

  /**
   * Apply resource limits to a Docker service configuration
   */
  applyResourceLimits(serviceConfig: any, limits: ResourceLimits): any {
    return {
      ...serviceConfig,
      deploy: {
        ...serviceConfig.deploy,
        resources: {
          limits: {
            cpus: limits.cpuLimit,
            memory: limits.memoryLimit
          },
          reservations: {
            cpus: (parseFloat(limits.cpuLimit) * 0.1).toString(), // 10% reservation
            memory: this.calculateMemoryReservation(limits.memoryLimit)
          }
        }
      },
      // Add disk quota as volume options if supported
      ...(limits.diskQuotaBytes && {
        volumes: serviceConfig.volumes?.map((volume: string) => {
          if (volume.includes('/data/starships/')) {
            return `${volume}:size=${Math.round(limits.diskQuotaBytes / (1024 * 1024))}m`;
          }
          return volume;
        }) || []
      }),
      // Add network bandwidth limits using tc (traffic control)
      ...(limits.networkBandwidthMbps && this.config.network.enableBandwidthLimiting && {
        cap_add: ['NET_ADMIN'],
        environment: {
          ...serviceConfig.environment,
          BANDWIDTH_LIMIT_MBPS: limits.networkBandwidthMbps.toString()
        }
      })
    };
  }

  /**
   * Start monitoring resource usage for a connector
   */  
  async startMonitoring(connector: MCPServerConnector): Promise<void> {
    console.log(`[ResourceManager] Starting resource monitoring for ${connector.dockerServiceName}`);

    if (this.monitoringTimers.has(connector.id)) {
      console.warn(`[ResourceManager] Already monitoring connector ${connector.id}`);
      return;
    }

    // Initialize metrics
    this.resourceMetrics.set(connector.id, {
      connectorId: connector.id,
      starshipId: connector.starshipId,
      serviceName: connector.dockerServiceName || 'unknown',
      resourceHistory: [],
      totalViolations: 0,
      averageCpuUsage: 0,
      averageMemoryUsage: 0,
      peakCpuUsage: 0,
      peakMemoryUsage: 0
    });

    // Initialize quota enforcement
    const limits = this.calculateResourceLimits(connector);
    await this.initializeQuotaEnforcement(connector.starshipId, limits.diskQuotaBytes);

    // Start periodic monitoring
    const timer = setInterval(async () => {
      try {
        await this.collectResourceUsage(connector);
      } catch (error) {
        console.error(`[ResourceManager] Failed to collect resources for ${connector.id}:`, error);
      }
    }, this.config.monitoring.checkInterval);

    this.monitoringTimers.set(connector.id, timer);

    // Perform initial resource check
    await this.collectResourceUsage(connector);

    console.log(`[ResourceManager] Resource monitoring started for ${connector.dockerServiceName}`);
    this.emit('monitoringStarted', connector);
  }

  /**
   * Stop monitoring resource usage for a connector
   */
  async stopMonitoring(connectorId: string): Promise<void> {
    console.log(`[ResourceManager] Stopping resource monitoring for connector ${connectorId}`);

    const timer = this.monitoringTimers.get(connectorId);
    if (timer) {
      clearInterval(timer);
      this.monitoringTimers.delete(connectorId);
    }

    // Keep metrics for historical purposes
    console.log(`[ResourceManager] Resource monitoring stopped for connector ${connectorId}`);
    this.emit('monitoringStopped', connectorId);
  }

  /**
   * Collect current resource usage for a connector
   */
  async collectResourceUsage(connector: MCPServerConnector): Promise<ResourceUsage> {
    if (!connector.dockerContainerId) {
      throw new Error('Container ID is required for resource monitoring');
    }

    try {
      const [containerStats, diskUsage] = await Promise.all([
        this.getContainerStats(connector.dockerContainerId),
        this.getDiskUsage(connector.starshipId)
      ]);

      const resourceUsage: ResourceUsage = {
        cpu: containerStats.cpu,
        memory: containerStats.memory,
        disk: diskUsage,
        network: containerStats.network,
        timestamp: new Date()
      };

      // Update metrics
      await this.updateResourceMetrics(connector.id, resourceUsage);

      // Check for violations and alerts
      await this.checkResourceViolations(connector, resourceUsage);

      console.log(`[ResourceManager] Resource usage collected for ${connector.dockerServiceName}`);
      this.emit('resourceUsageCollected', connector, resourceUsage);

      return resourceUsage;

    } catch (error) {
      console.error(`[ResourceManager] Failed to collect resource usage for ${connector.dockerServiceName}:`, error);
      throw error;
    }
  }

  /**
   * Get container statistics from Docker
   */
  private async getContainerStats(containerId: string): Promise<{
    cpu: ResourceUsage['cpu'];
    memory: ResourceUsage['memory'];
    network: ResourceUsage['network'];
  }> {
    try {
      // Get container stats
      const { stdout: statsOutput } = await execAsync(
        `docker stats ${containerId} --no-stream --format "{{.CPUPerc}}:{{.MemUsage}}:{{.NetIO}}"`
      );

      const [cpuPerc, memUsage, netIO] = statsOutput.trim().split(':');

      // Get container inspect for limits
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect ${containerId}  --format "{{json .HostConfig}}"`
      );
      
      const hostConfig = JSON.parse(inspectOutput);

      // Parse CPU usage
      const cpuUsage = parseFloat(cpuPerc.replace('%', ''));
      const cpuLimit = hostConfig.CpuQuota && hostConfig.CpuPeriod ? 
        (hostConfig.CpuQuota / hostConfig.CpuPeriod).toString() : '1.0';

      // Parse memory usage
      const memParts = memUsage.split(' / ');
      const usedBytes = this.parseMemoryBytes(memParts[0]);
      const limitBytes = memParts.length > 1 ? 
        this.parseMemoryBytes(memParts[1]) : 
        hostConfig.Memory || 512 * 1024 * 1024; // Default 512MB

      // Parse network I/O
      const netParts = netIO.split(' / ');
      const rxBytesPerSec = this.parseNetworkBytes(netParts[0]);
      const txBytesPerSec = netParts.length > 1 ? 
        this.parseNetworkBytes(netParts[1]) : 0;

      return {
        cpu: {
          usage: cpuUsage,
          limit: cpuLimit,
          throttledTime: 0 // Would need more detailed stats for this
        },
        memory: {
          usage: limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0,
          usedBytes,
          limitBytes,
          swapUsage: 0 // Simplified
        },
        network: {
          rxBytesPerSec,
          txBytesPerSec,
          bandwidthLimitMbps: this.config.network.enableBandwidthLimiting ? 
            this.config.network.defaultBandwidthMbps : undefined
        }
      };

    } catch (error) {
      console.error(`[ResourceManager] Failed to get container stats for ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Get disk usage for a starship workspace
   */
  private async getDiskUsage(starshipId: string): Promise<ResourceUsage['disk']> {
    const starshipPath = path.join(this.starshipsDirectory, starshipId);
    const quotaEnforcement = this.quotaEnforcements.get(starshipId);
    const quotaBytes = quotaEnforcement?.quotaBytes || 
      this.config.disk.starshipQuotaGB * 1024 * 1024 * 1024;

    try {
      // Ensure directory exists
      await fs.mkdir(starshipPath, { recursive: true });

      // Get disk usage
      const { stdout: duOutput } = await execAsync(`du -sb "${starshipPath}"`);
      const usedBytes = parseInt(duOutput.split('\t')[0]);

      // Get available space on the filesystem
      const { stdout: dfOutput } = await execAsync(`df -B1 "${starshipPath}"`);
      const lines = dfOutput.trim().split('\n');
      const [, , availableStr] = lines[1].split(/\s+/);
      const availableBytes = parseInt(availableStr);

      return {
        usage: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
        usedBytes,
        quotaBytes,
        availableBytes
      };

    } catch (error) {
      console.error(`[ResourceManager] Failed to get disk usage for starship ${starshipId}:`, error);
      return {
        usage: 0,
        usedBytes: 0,
        quotaBytes,
        availableBytes: quotaBytes
      };
    }
  }

  /**
   * Update resource metrics for a connector
   */
  private async updateResourceMetrics(
    connectorId: string, 
    usage: ResourceUsage
  ): Promise<void> {
    const metrics = this.resourceMetrics.get(connectorId);
    if (!metrics) return;

    // Add to history
    metrics.resourceHistory.push({
      timestamp: usage.timestamp,
      cpu: usage.cpu.usage,
      memory: usage.memory.usage,
      disk: usage.disk.usage,
      network: {
        rx: usage.network.rxBytesPerSec,
        tx: usage.network.txBytesPerSec
      }
    });

    // Update aggregated metrics
    const history = metrics.resourceHistory;
    const totalEntries = history.length;

    if (totalEntries > 0) {
      metrics.averageCpuUsage = history.reduce((sum, h) => sum + h.cpu, 0) / totalEntries;
      metrics.averageMemoryUsage = history.reduce((sum, h) => sum + h.memory, 0) / totalEntries;
      metrics.peakCpuUsage = Math.max(...history.map(h => h.cpu));
      metrics.peakMemoryUsage = Math.max(...history.map(h => h.memory));
    }

    // Keep only recent history
    const retentionTime = Date.now() - (this.config.monitoring.retentionDays * 24 * 60 * 60 * 1000);
    metrics.resourceHistory = metrics.resourceHistory.filter(
      h => h.timestamp.getTime() > retentionTime
    );
  }

  /**
   * Check for resource violations and trigger alerts
   */
  private async checkResourceViolations(
    connector: MCPServerConnector, 
    usage: ResourceUsage
  ): Promise<void> {
    const alerts: ResourceAlert[] = [];

    // Check CPU usage
    if (usage.cpu.usage > this.config.cpu.alertThreshold) {
      alerts.push({
        id: `cpu-high-${connector.id}-${Date.now()}`,
        connectorId: connector.id,
        starshipId: connector.starshipId,
        serviceName: connector.dockerServiceName || 'unknown',
        type: 'cpu_high',
        severity: usage.cpu.usage > 95 ? 'critical' : 'warning',
        message: `High CPU usage: ${usage.cpu.usage.toFixed(1)}% (limit: ${usage.cpu.limit})`,
        currentValue: usage.cpu.usage,
        threshold: this.config.cpu.alertThreshold,
        timestamp: new Date()
      });
    }

    // Check memory usage
    if (usage.memory.usage > this.config.memory.alertThreshold) {
      alerts.push({
        id: `memory-high-${connector.id}-${Date.now()}`,
        connectorId: connector.id,
        starshipId: connector.starshipId,
        serviceName: connector.dockerServiceName || 'unknown',
        type: 'memory_high',
        severity: usage.memory.usage > 95 ? 'critical' : 'warning',
        message: `High memory usage: ${usage.memory.usage.toFixed(1)}% (${this.formatBytes(usage.memory.usedBytes)} / ${this.formatBytes(usage.memory.limitBytes)})`,
        currentValue: usage.memory.usage,
        threshold: this.config.memory.alertThreshold,
        timestamp: new Date()
      });
    }

    // Check disk quota
    if (usage.disk.usage > this.config.disk.alertThreshold) {
      const severity = usage.disk.usage > 95 ? 'critical' : 'warning';
      alerts.push({
        id: `disk-quota-${connector.id}-${Date.now()}`,
        connectorId: connector.id,
        starshipId: connector.starshipId,
        serviceName: connector.dockerServiceName || 'unknown',
        type: 'disk_quota_exceeded',
        severity,
        message: `Disk quota usage: ${usage.disk.usage.toFixed(1)}% (${this.formatBytes(usage.disk.usedBytes)} / ${this.formatBytes(usage.disk.quotaBytes)})`,
        currentValue: usage.disk.usage,
        threshold: this.config.disk.alertThreshold,
        timestamp: new Date()
      });

      // Enforce quota if critical
      if (severity === 'critical') {
        await this.enforceQuota(connector.starshipId, usage.disk);
      }
    }

    // Process alerts (considering cooldown)
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  /**
   * Process and potentially trigger an alert
   */
  private async processAlert(alert: ResourceAlert): Promise<void> {
    // Check cooldown for similar alerts
    const similarAlerts = Array.from(this.activeAlerts.values())
      .filter(a => 
        a.connectorId === alert.connectorId && 
        a.type === alert.type &&
        !a.resolved
      );

    if (similarAlerts.length > 0) {
      const lastAlert = similarAlerts[0];
      const cooldownPassed = Date.now() - lastAlert.timestamp.getTime() > this.config.monitoring.alertCooldown;
      
      if (!cooldownPassed) {
        console.log(`[ResourceManager] Alert ${alert.type} for ${alert.connectorId} in cooldown`);
        return;
      }
    }

    // Store and emit alert
    this.activeAlerts.set(alert.id, alert);
    
    // Update violation count
    const metrics = this.resourceMetrics.get(alert.connectorId);
    if (metrics) {
      metrics.totalViolations++;
      metrics.lastViolation = alert.timestamp;
    }

    console.log(`[ResourceManager] Alert triggered: ${alert.severity} - ${alert.message}`);
    this.emit('resourceAlert', alert);
  }

  /**
   * Initialize quota enforcement for a starship
   */
  private async initializeQuotaEnforcement(
    starshipId: string, 
    quotaBytes: number
  ): Promise<void> {
    if (this.quotaEnforcements.has(starshipId)) {
      return; // Already initialized
    }

    const enforcement: QuotaEnforcement = {
      starshipId,
      quotaBytes,
      usedBytes: 0,
      enforced: false,
      lastCheck: new Date(),
      violations: 0
    };

    this.quotaEnforcements.set(starshipId, enforcement);
    console.log(`[ResourceManager] Quota enforcement initialized for starship ${starshipId}: ${this.formatBytes(quotaBytes)}`);
  }

  /**
   * Enforce disk quota for a starship
   */
  private async enforceQuota(
    starshipId: string, 
    diskUsage: ResourceUsage['disk']
  ): Promise<void> {
    const enforcement = this.quotaEnforcements.get(starshipId);
    if (!enforcement) return;

    enforcement.usedBytes = diskUsage.usedBytes;
    enforcement.lastCheck = new Date();
    enforcement.violations++;

    if (diskUsage.usage > 100) {
      // Critical: Remove oldest files to free space
      console.warn(`[ResourceManager] Enforcing quota for starship ${starshipId} - removing oldest files`);
      await this.removeOldestFiles(starshipId, diskUsage.usedBytes - diskUsage.quotaBytes);
      enforcement.enforced = true;
    }

    this.emit('quotaEnforced', starshipId, enforcement);
  }

  /**
   * Remove oldest files to enforce quota
   */
  private async removeOldestFiles(starshipId: string, bytesToFree: number): Promise<void> {
    const starshipPath = path.join(this.starshipsDirectory, starshipId);
    
    try {
      // Get all files sorted by modification time (oldest first)
      const { stdout } = await execAsync(
        `find "${starshipPath}" -type f -exec stat -c '%Y %s %n' {} \\; | sort -n`
      );

      const files = stdout.trim().split('\n')
        .filter(line => line)
        .map(line => {
          const [mtime, size, name] = line.split(' ', 3);
          return {
            path: name,
            size: parseInt(size),
            mtime: parseInt(mtime)
          };
        });

      let freedBytes = 0;
      const filesToRemove: string[] = [];

      // Select files to remove (oldest first)
      for (const file of files) {
        filesToRemove.push(file.path);
        freedBytes += file.size;
        
        if (freedBytes >= bytesToFree) {
          break;
        }
      }

      // Remove selected files
      for (const filePath of filesToRemove) {
        try {
          await fs.unlink(filePath);
          console.log(`[ResourceManager] Removed file for quota enforcement: ${filePath}`);
        } catch (error) {
          console.warn(`[ResourceManager] Failed to remove file ${filePath}:`, error);
        }
      }

      console.log(`[ResourceManager] Freed ${this.formatBytes(freedBytes)} for starship ${starshipId}`);

    } catch (error) {
      console.error(`[ResourceManager] Failed to enforce quota for starship ${starshipId}:`, error);
    }
  }

  /**
   * Get resource metrics for a connector
   */
  getResourceMetrics(connectorId: string): ResourceMetrics | undefined {
    return this.resourceMetrics.get(connectorId);
  }

  /**
   * Get all active resource alerts
   */
  getActiveAlerts(connectorId?: string): ResourceAlert[] {
    const alerts = Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved);
    
    return connectorId ? 
      alerts.filter(alert => alert.connectorId === connectorId) : 
      alerts;
  }

  /**
   * Get quota enforcement status for a starship
   */
  getQuotaEnforcement(starshipId: string): QuotaEnforcement | undefined {
    return this.quotaEnforcements.get(starshipId);
  }

  /**
   * Resolve a resource alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = new Date();
      console.log(`[ResourceManager] Alert resolved: ${alertId}`);
      this.emit('alertResolved', alert);
    }
  }

  /**
   * Get resource dashboard data
   */
  getDashboardData(): {
    overview: {
      totalConnectors: number;
      cpuAlerts: number;
      memoryAlerts: number;
      diskAlerts: number;
      activeQuotas: number;
    };
    connectors: Array<{
      connectorId: string;
      starshipId: string;
      serviceName: string;
      cpu: { usage: number; limit: string };
      memory: { usage: number; limitMB: number };
      disk: { usage: number; quotaGB: number };
      alertCount: number;
      lastCheck: Date;
    }>;
  } {
    const connectors = Array.from(this.resourceMetrics.values()).map(metrics => {
      const latestHistory = metrics.resourceHistory[metrics.resourceHistory.length - 1];
      const alertCount = this.getActiveAlerts(metrics.connectorId).length;
      
      return {
        connectorId: metrics.connectorId,
        starshipId: metrics.starshipId,
        serviceName: metrics.serviceName,
        cpu: {
          usage: latestHistory?.cpu || 0,
          limit: this.config.cpu.defaultLimit
        },
        memory: {
          usage: latestHistory?.memory || 0,
          limitMB: parseInt(this.config.memory.defaultLimit.replace('M', ''))
        },
        disk: {
          usage: latestHistory?.disk || 0,
          quotaGB: this.config.disk.starshipQuotaGB
        },
        alertCount,
        lastCheck: latestHistory?.timestamp || new Date()
      };
    });

    const alerts = this.getActiveAlerts();
    
    return {
      overview: {
        totalConnectors: connectors.length,
        cpuAlerts: alerts.filter(a => a.type === 'cpu_high').length,
        memoryAlerts: alerts.filter(a => a.type === 'memory_high').length,
        diskAlerts: alerts.filter(a => a.type === 'disk_quota_exceeded').length,
        activeQuotas: this.quotaEnforcements.size
      },
      connectors
    };
  }

  /**
   * Shutdown resource manager
   */
  async shutdown(): Promise<void> {
    console.log('[ResourceManager] Shutting down resource manager');

    // Stop all monitoring timers
    for (const timer of this.monitoringTimers.values()) {
      clearInterval(timer);
    }
    this.monitoringTimers.clear();

    // Clear data
    this.resourceMetrics.clear();
    this.activeAlerts.clear();
    this.quotaEnforcements.clear();

    console.log('[ResourceManager] Resource manager shutdown complete');
  }

  /**
   * Private helper methods
   */
  private calculateMemoryReservation(memoryLimit: string): string {
    const limitBytes = this.parseMemoryBytes(memoryLimit);
    const reservationBytes = Math.max(limitBytes * 0.1, 64 * 1024 * 1024); // At least 64MB
    return this.formatBytes(reservationBytes);
  }

  private parseMemoryBytes(memStr: string): number {
    const value = parseFloat(memStr);
    if (memStr.includes('G')) return value * 1024 * 1024 * 1024;
    if (memStr.includes('M')) return value * 1024 * 1024;
    if (memStr.includes('K')) return value * 1024;
    return value;
  }

  private parseNetworkBytes(netStr: string): number {
    const value = parseFloat(netStr);
    if (netStr.includes('GB')) return value * 1024 * 1024 * 1024;
    if (netStr.includes('MB')) return value * 1024 * 1024;
    if (netStr.includes('kB')) return value * 1024;
    return value;
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
}