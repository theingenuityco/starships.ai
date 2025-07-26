/**
 * HealthMonitorService - Comprehensive health monitoring for MCP deployments
 * 
 * This service monitors container health, MCP protocol connectivity, and system metrics.
 * It provides real-time health tracking, alerting, and health dashboard data for
 * MCP servers running in Docker containers.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MCPServerConnector } from '@starships/models';
import { MCPProtocolHandler } from './MCPProtocolHandler';

const execAsync = promisify(exec);

export interface HealthStatus {
  overall: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  container: ContainerHealth;
  mcp: MCPHealth;
  system: SystemHealth;
  timestamp: Date;
  checks: HealthCheck[];
}

export interface ContainerHealth {
  status: 'running' | 'stopped' | 'error' | 'unknown';
  containerId?: string;
  uptime?: number;
  restartCount?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  networkConnections?: number;
}

export interface MCPHealth {
  connected: boolean;
  latency?: number;
  lastRequest?: Date;
  requestCount?: number;
  errorCount?: number;
  errorRate?: number;
}

export interface SystemHealth {
  dockerDaemon: boolean;
  networkConnectivity: boolean;
  diskSpace: number;
  systemLoad: number;
}

export interface HealthCheck {
  id: string;
  name: string;  
  type: 'container' | 'mcp' | 'system' | 'custom';
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  timestamp: Date;
}

export interface HealthMetrics {
  connectorId: string;
  starshipId: string;
  serviceName: string;
  healthHistory: {
    timestamp: Date;
    status: HealthStatus['overall'];
    checks: number;
    failures: number;
  }[];
  uptime: number;
  totalChecks: number;
  failedChecks: number;
  averageLatency: number;
  lastHealthCheck: Date;
}

export interface AlertRule {
  id: string;
  connectorId?: string;
  starshipId?: string;
  condition: 'unhealthy' | 'high_latency' | 'container_restart' | 'error_rate';
  threshold?: number;
  enabled: boolean;
  cooldown: number; // Minutes between alerts
  lastTriggered?: Date;
}

export interface HealthAlert {
  id: string;
  connectorId: string;
  starshipId: string;
  serviceName: string;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  message: string;
  timestamp: Date;
  resolved?: Date;
  metadata?: Record<string, any>;
}

export interface MonitoringConfig {
  checkInterval: number; // Milliseconds
  healthRetention: number; // Days
  alertCooldown: number; // Minutes
  containerStatsEnabled: boolean;
  mcpHealthEnabled: boolean;
  systemHealthEnabled: boolean;
  maxConcurrentChecks: number;
}

/**
 * Comprehensive health monitoring service for MCP deployments
 */
export class HealthMonitorService extends EventEmitter {
  private monitoredConnectors: Map<string, MCPServerConnector> = new Map();
  private healthMetrics: Map<string, HealthMetrics> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, HealthAlert> = new Map();
  private monitoringTimers: Map<string, NodeJS.Timeout> = new Map();
  
  private config: MonitoringConfig;
  private mcpProtocolHandler: MCPProtocolHandler;
  private startTime: number;

  constructor(
    mcpProtocolHandler: MCPProtocolHandler,
    config?: Partial<MonitoringConfig>
  ) {
    super();
    
    this.mcpProtocolHandler = mcpProtocolHandler;
    this.config = {
      checkInterval: 30000, // 30 seconds
      healthRetention: 7, // 7 days
      alertCooldown: 15, // 15 minutes
      containerStatsEnabled: true,
      mcpHealthEnabled: true,
      systemHealthEnabled: true,
      maxConcurrentChecks: 10,
      ...config
    };

    this.startTime = Date.now();
    this.setupDefaultAlertRules();
  }

  /**
   * Start monitoring a connector
   */
  async startMonitoring(connector: MCPServerConnector): Promise<void> {
    console.log(`[HealthMonitor] Starting monitoring for ${connector.dockerServiceName}`);

    if (this.monitoredConnectors.has(connector.id)) {
      console.warn(`[HealthMonitor] Already monitoring connector ${connector.id}`);
      return;
    }

    this.monitoredConnectors.set(connector.id, connector);
    
    // Initialize metrics
    this.healthMetrics.set(connector.id, {
      connectorId: connector.id,
      starshipId: connector.starshipId,
      serviceName: connector.dockerServiceName || 'unknown',
      healthHistory: [],
      uptime: 0,
      totalChecks: 0,
      failedChecks: 0,
      averageLatency: 0,
      lastHealthCheck: new Date()
    });

    // Start periodic health checks
    const timer = setInterval(async () => {
      try {
        await this.performHealthCheck(connector);
      } catch (error) {
        console.error(`[HealthMonitor] Health check failed for ${connector.id}:`, error);
      }
    }, this.config.checkInterval);

    this.monitoringTimers.set(connector.id, timer);

    // Perform initial health check
    await this.performHealthCheck(connector);

    console.log(`[HealthMonitor] Monitoring started for ${connector.dockerServiceName}`);
    this.emit('monitoringStarted', connector);
  }

  /**
   * Stop monitoring a connector
   */
  async stopMonitoring(connectorId: string): Promise<void> {
    console.log(`[HealthMonitor] Stopping monitoring for connector ${connectorId}`);

    const timer = this.monitoringTimers.get(connectorId);
    if (timer) {
      clearInterval(timer);
      this.monitoringTimers.delete(connectorId);
    }

    this.monitoredConnectors.delete(connectorId);
    
    // Keep metrics for historical purposes
    console.log(`[HealthMonitor] Monitoring stopped for connector ${connectorId}`);
    this.emit('monitoringStopped', connectorId);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(connector: MCPServerConnector): Promise<HealthStatus> {
    const startTime = Date.now();
    console.log(`[HealthMonitor] Performing health check for ${connector.dockerServiceName}`);

    const checks: HealthCheck[] = [];
    let containerHealth: ContainerHealth = { status: 'unknown' };
    let mcpHealth: MCPHealth = { connected: false };
    let systemHealth: SystemHealth = {
      dockerDaemon: false,
      networkConnectivity: false,
      diskSpace: 0,
      systemLoad: 0
    };

    try {
      // 1. Container Health Check
      if (this.config.containerStatsEnabled) {
        containerHealth = await this.checkContainerHealth(connector, checks);
      }

      // 2. MCP Protocol Health Check
      if (this.config.mcpHealthEnabled) {
        mcpHealth = await this.checkMCPHealth(connector, checks);
      }

      // 3. System Health Check
      if (this.config.systemHealthEnabled) {
        systemHealth = await this.checkSystemHealth(checks);
      }

      // 4. Determine overall health status
      const overall = this.calculateOverallHealth(checks);

      const healthStatus: HealthStatus = {
        overall,
        container: containerHealth,
        mcp: mcpHealth,
        system: systemHealth,
        timestamp: new Date(),
        checks
      };

      // Update metrics
      await this.updateHealthMetrics(connector.id, healthStatus, Date.now() - startTime);

      // Update connector status in database
      await this.updateConnectorHealthStatus(connector, healthStatus);

      // Check for alerts
      await this.evaluateAlerts(connector, healthStatus);

      console.log(`[HealthMonitor] Health check completed for ${connector.dockerServiceName}: ${overall}`);
      this.emit('healthCheckCompleted', connector, healthStatus);

      return healthStatus;

    } catch (error) {
      const errorCheck: HealthCheck = {
        id: 'health-check-error',
        name: 'Health Check Execution',
        type: 'system',
        status: 'fail',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
      
      checks.push(errorCheck);

      const errorStatus: HealthStatus = {
        overall: 'unknown',
        container: containerHealth,
        mcp: mcpHealth,
        system: systemHealth,
        timestamp: new Date(),
        checks
      };

      console.error(`[HealthMonitor] Health check error for ${connector.dockerServiceName}:`, error);
      this.emit('healthCheckError', connector, error);

      return errorStatus;
    }
  }

  /**
   * Check container health and performance
   */
  private async checkContainerHealth(
    connector: MCPServerConnector, 
    checks: HealthCheck[]
  ): Promise<ContainerHealth> {
    const startTime = Date.now();
    
    try {
      if (!connector.dockerContainerId) {
        checks.push({
          id: 'container-id-missing',
          name: 'Container ID Available',
          type: 'container',
          status: 'fail',
          message: 'No container ID available',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
        return { status: 'unknown' };
      }

      // Get container status
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect ${connector.dockerContainerId} --format '{{json .}}'`
      );
      
      const containerInfo = JSON.parse(inspectOutput);
      const state = containerInfo.State;
      
      const containerHealth: ContainerHealth = {
        status: state.Running ? 'running' : 
                state.ExitCode === 0 ? 'stopped' : 'error',
        containerId: connector.dockerContainerId,
        uptime: state.Running ? 
          Math.floor((Date.now() - new Date(state.StartedAt).getTime()) / 1000) : 0,
        restartCount: state.RestartCount || 0
      };

      // Container status check
      checks.push({
        id: 'container-status',
        name: 'Container Status',
        type: 'container',
        status: containerHealth.status === 'running' ? 'pass' : 'fail',
        message: `Container is ${containerHealth.status}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      // Get container stats if running
      if (containerHealth.status === 'running') {
        try {
          const { stdout: statsOutput } = await execAsync(
            `docker stats ${connector.dockerContainerId} --no-stream --format "{{.CPUPerc}}:{{.MemUsage}}"`
          );
          
          const [cpuPerc, memUsage] = statsOutput.trim().split(':');
          containerHealth.cpuUsage = parseFloat(cpuPerc.replace('%', ''));
          
          // Parse memory usage (format: "123.4MiB / 512MiB")
          const memParts = memUsage.split(' / ');
          if (memParts.length === 2) {
            const used = this.parseMemoryValue(memParts[0]);
            const total = this.parseMemoryValue(memParts[1]);
            containerHealth.memoryUsage = total > 0 ? (used / total) * 100 : 0;
          }

          // Performance checks
          if (containerHealth.cpuUsage && containerHealth.cpuUsage > 80) {
            checks.push({
              id: 'container-cpu-high',
              name: 'CPU Usage',
              type: 'container',
              status: 'warn',
              message: `High CPU usage: ${containerHealth.cpuUsage.toFixed(1)}%`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          } else {
            checks.push({
              id: 'container-cpu',
              name: 'CPU Usage',
              type: 'container',
              status: 'pass',
              message: `CPU usage: ${containerHealth.cpuUsage?.toFixed(1) || 0}%`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          }

          if (containerHealth.memoryUsage && containerHealth.memoryUsage > 90) {
            checks.push({
              id: 'container-memory-high',
              name: 'Memory Usage',
              type: 'container',
              status: 'warn',
              message: `High memory usage: ${containerHealth.memoryUsage.toFixed(1)}%`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          } else {
            checks.push({
              id: 'container-memory',
              name: 'Memory Usage',
              type: 'container',
              status: 'pass',
              message: `Memory usage: ${containerHealth.memoryUsage?.toFixed(1) || 0}%`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          }

        } catch (statsError) {
          checks.push({
            id: 'container-stats-error',
            name: 'Container Statistics',
            type: 'container',
            status: 'warn',
            message: 'Could not retrieve container statistics',
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        }
      }

      // Restart count check
      if (containerHealth.restartCount && containerHealth.restartCount > 3) {
        checks.push({
          id: 'container-restarts',
          name: 'Container Restarts',
          type: 'container',
          status: 'warn',
          message: `Container has restarted ${containerHealth.restartCount} times`,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      return containerHealth;

    } catch (error) {
      checks.push({
        id: 'container-health-error',
        name: 'Container Health Check',
        type: 'container',
        status: 'fail',
        message: `Container health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      return { status: 'error' };
    }
  }

  /**
   * Check MCP protocol connectivity and performance
   */
  private async checkMCPHealth(
    connector: MCPServerConnector, 
    checks: HealthCheck[]
  ): Promise<MCPHealth> {
    const startTime = Date.now();

    try {
      // Get connection from protocol handler
      const connection = this.mcpProtocolHandler.getConnection(connector.id);
      
      if (!connection) {
        checks.push({
          id: 'mcp-no-connection',
          name: 'MCP Connection',
          type: 'mcp',
          status: 'fail',
          message: 'No MCP connection available',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
        
        return { connected: false };
      }

      // Perform health check via protocol handler
      const healthResult = await this.mcpProtocolHandler.healthCheck(connector.id);
      
      const mcpHealth: MCPHealth = {
        connected: healthResult.healthy,
        latency: healthResult.latency,
        lastRequest: connection.lastActivity,
        requestCount: connection.requestCount,
        errorCount: connection.errorCount,
        errorRate: connection.requestCount > 0 ? 
          (connection.errorCount / connection.requestCount) * 100 : 0
      };

      // Connection status check
      checks.push({
        id: 'mcp-connectivity',
        name: 'MCP Connectivity',
        type: 'mcp',
        status: mcpHealth.connected ? 'pass' : 'fail',
        message: mcpHealth.connected ? 
          `Connected (latency: ${mcpHealth.latency}ms)` : 
          `Not connected: ${healthResult.error}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      // Latency check
      if (mcpHealth.latency && mcpHealth.latency > 1000) {
        checks.push({
          id: 'mcp-latency-high',
          name: 'MCP Latency',
          type: 'mcp',
          status: 'warn',
          message: `High latency: ${mcpHealth.latency}ms`,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      } else if (mcpHealth.latency) {
        checks.push({
          id: 'mcp-latency',
          name: 'MCP Latency',
          type: 'mcp',
          status: 'pass',
          message: `Latency: ${mcpHealth.latency}ms`,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      // Error rate check
      if (mcpHealth.errorRate && mcpHealth.errorRate > 10) {
        checks.push({
          id: 'mcp-error-rate-high',
          name: 'MCP Error Rate',
          type: 'mcp',
          status: 'warn',
          message: `High error rate: ${mcpHealth.errorRate.toFixed(1)}%`,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      return mcpHealth;

    } catch (error) {
      checks.push({
        id: 'mcp-health-error',
        name: 'MCP Health Check',
        type: 'mcp',
        status: 'fail',
        message: `MCP health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      return { connected: false };
    }
  }

  /**
   * Check system health (Docker daemon, disk space, etc.)
   */
  private async checkSystemHealth(checks: HealthCheck[]): Promise<SystemHealth> {
    const startTime = Date.now();
    
    const systemHealth: SystemHealth = {
      dockerDaemon: false,
      networkConnectivity: false,
      diskSpace: 0,
      systemLoad: 0
    };

    try {
      // Check Docker daemon
      try {
        await execAsync('docker version --format "{{.Server.Version}}"');
        systemHealth.dockerDaemon = true;
        
        checks.push({
          id: 'docker-daemon',
          name: 'Docker Daemon',
          type: 'system',
          status: 'pass',
          message: 'Docker daemon is running',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      } catch (error) {
        checks.push({
          id: 'docker-daemon-error',
          name: 'Docker Daemon',
          type: 'system',
          status: 'fail',
          message: 'Docker daemon is not accessible',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      // Check disk space
      try {
        const { stdout } = await execAsync('df /data --output=pcent | tail -n1');
        const diskUsage = parseInt(stdout.trim().replace('%', ''));
        systemHealth.diskSpace = 100 - diskUsage;

        if (diskUsage > 90) {
          checks.push({
            id: 'disk-space-critical',
            name: 'Disk Space',
            type: 'system',
            status: 'fail',
            message: `Critical disk usage: ${diskUsage}%`,
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        } else if (diskUsage > 80) {
          checks.push({
            id: 'disk-space-warning',
            name: 'Disk Space',
            type: 'system',
            status: 'warn',
            message: `High disk usage: ${diskUsage}%`,
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        } else {
          checks.push({
            id: 'disk-space',
            name: 'Disk Space',
            type: 'system',
            status: 'pass',
            message: `Disk usage: ${diskUsage}%`,
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        }
      } catch (error) {
        checks.push({
          id: 'disk-space-error',
          name: 'Disk Space Check',
          type: 'system',
          status: 'warn',
          message: 'Could not check disk space',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      // Check system load (simplified)
      try {
        const { stdout } = await execAsync('uptime');
        const loadMatch = stdout.match(/load average: ([\d.]+)/);
        if (loadMatch) {
          systemHealth.systemLoad = parseFloat(loadMatch[1]);
          
          if (systemHealth.systemLoad > 2.0) {
            checks.push({
              id: 'system-load-high',
              name: 'System Load',
              type: 'system',
              status: 'warn',
              message: `High system load: ${systemHealth.systemLoad}`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          } else {
            checks.push({
              id: 'system-load',
              name: 'System Load',
              type: 'system',
              status: 'pass',
              message: `System load: ${systemHealth.systemLoad}`,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        checks.push({
          id: 'system-load-error',
          name: 'System Load Check',
          type: 'system',
          status: 'warn',
          message: 'Could not check system load',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      systemHealth.networkConnectivity = true; // Simplified for now

    } catch (error) {
      checks.push({
        id: 'system-health-error',
        name: 'System Health Check',
        type: 'system',
        status: 'fail',
        message: `System health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });
    }

    return systemHealth;
  }

  /**
   * Calculate overall health status based on individual checks
   */
  private calculateOverallHealth(checks: HealthCheck[]): HealthStatus['overall'] {
    const failures = checks.filter(check => check.status === 'fail').length;
    const warnings = checks.filter(check => check.status === 'warn').length;
    const total = checks.length;

    if (failures > 0) {
      return 'unhealthy';
    } else if (warnings > 0) {
      return 'degraded';
    } else if (total > 0) {
      return 'healthy';
    } else {
      return 'unknown';
    }
  }

  /**
   * Update health metrics for a connector
   */
  private async updateHealthMetrics(
    connectorId: string, 
    healthStatus: HealthStatus, 
    checkDuration: number
  ): Promise<void> {
    const metrics = this.healthMetrics.get(connectorId);
    if (!metrics) return;

    metrics.totalChecks++;
    if (healthStatus.overall === 'unhealthy') {
      metrics.failedChecks++;
    }

    // Update average latency
    if (healthStatus.mcp.latency) {
      metrics.averageLatency = 
        (metrics.averageLatency * (metrics.totalChecks - 1) + healthStatus.mcp.latency) / 
        metrics.totalChecks;
    }

    metrics.lastHealthCheck = healthStatus.timestamp;

    // Add to history
    metrics.healthHistory.push({
      timestamp: healthStatus.timestamp,
      status: healthStatus.overall,
      checks: healthStatus.checks.length,
      failures: healthStatus.checks.filter(c => c.status === 'fail').length
    });

    // Keep only recent history
    const retentionTime = Date.now() - (this.config.healthRetention * 24 * 60 * 60 * 1000);
    metrics.healthHistory = metrics.healthHistory.filter(
      h => h.timestamp.getTime() > retentionTime
    );
  }

  /**
   * Update connector health status in database
   */
  private async updateConnectorHealthStatus(
    connector: MCPServerConnector, 
    healthStatus: HealthStatus
  ): Promise<void> {
    try {
      // This would typically update the database
      // For now, we'll just log the update
      console.log(`[HealthMonitor] Updating health status for ${connector.id}: ${healthStatus.overall}`);
      
      // In a real implementation:
      // await this.connectorRepository.updateHealthStatus(connector.id, {
      //   dockerHealthStatus: healthStatus.overall === 'healthy' ? 'healthy' : 'unhealthy',
      //   dockerLastHealthCheck: healthStatus.timestamp.toISOString()
      // });
      
    } catch (error) {
      console.error(`[HealthMonitor] Failed to update connector health status:`, error);
    }
  }

  /**
   * Evaluate alert rules and trigger alerts if necessary
   */
  private async evaluateAlerts(connector: MCPServerConnector, healthStatus: HealthStatus): Promise<void> {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;
      
      // Check if rule applies to this connector
      if (rule.connectorId && rule.connectorId !== connector.id) continue;
      if (rule.starshipId && rule.starshipId !== connector.starshipId) continue;

      // Check cooldown
      if (rule.lastTriggered) {
        const cooldownMs = rule.cooldown * 60 * 1000;
        if (Date.now() - rule.lastTriggered.getTime() < cooldownMs) {
          continue;
        }
      }

      // Evaluate condition
      let shouldAlert = false;
      let alertMessage = '';
      let severity: HealthAlert['severity'] = 'info';

      switch (rule.condition) {
        case 'unhealthy':
          shouldAlert = healthStatus.overall === 'unhealthy';
          alertMessage = 'Service is unhealthy';
          severity = 'critical';
          break;
        
        case 'high_latency':
          if (rule.threshold && healthStatus.mcp.latency) {
            shouldAlert = healthStatus.mcp.latency > rule.threshold;
            alertMessage = `High latency: ${healthStatus.mcp.latency}ms`;
            severity = 'warning';
          }
          break;
        
        case 'container_restart':
          if (rule.threshold && healthStatus.container.restartCount) {
            shouldAlert = healthStatus.container.restartCount > rule.threshold;
            alertMessage = `Container restarted ${healthStatus.container.restartCount} times`;
            severity = 'warning';
          }
          break;
        
        case 'error_rate':
          if (rule.threshold && healthStatus.mcp.errorRate) {
            shouldAlert = healthStatus.mcp.errorRate > rule.threshold;
            alertMessage = `High error rate: ${healthStatus.mcp.errorRate.toFixed(1)}%`;
            severity = 'warning';
          }
          break;
      }

      if (shouldAlert) {
        await this.triggerAlert(rule, connector, severity, alertMessage, healthStatus);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(
    rule: AlertRule,
    connector: MCPServerConnector,
    severity: HealthAlert['severity'],
    message: string,
    healthStatus: HealthStatus
  ): Promise<void> {
    const alertId = `${rule.id}-${connector.id}-${Date.now()}`;
    
    const alert: HealthAlert = {
      id: alertId,
      connectorId: connector.id,
      starshipId: connector.starshipId,
      serviceName: connector.dockerServiceName || 'unknown',
      severity,
      type: rule.condition,
      message,
      timestamp: new Date(),
      metadata: {
        ruleId: rule.id,
        healthStatus: healthStatus.overall,
        checkCount: healthStatus.checks.length
      }
    };

    this.activeAlerts.set(alertId, alert);
    rule.lastTriggered = new Date();

    console.log(`[HealthMonitor] Alert triggered: ${alert.severity} - ${alert.message}`);
    this.emit('alertTriggered', alert);
  }

  /**
   * Get health metrics for a connector
   */
  getHealthMetrics(connectorId: string): HealthMetrics | undefined {
    return this.healthMetrics.get(connectorId);
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(connectorId?: string): HealthAlert[] {
    const alerts = Array.from(this.activeAlerts.values());
    return connectorId ? alerts.filter(alert => alert.connectorId === connectorId) : alerts;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = new Date();
      this.activeAlerts.delete(alertId);
      
      console.log(`[HealthMonitor] Alert resolved: ${alertId}`);
      this.emit('alertResolved', alert);
    }
  }

  /**
   * Get dashboard data for all monitored connectors
   */
  getDashboardData(): {
    overview: {
      totalServices: number;
      healthyServices: number;
      unhealthyServices: number;
      degradedServices: number;
      activeAlerts: number;
    };
    services: Array<{
      connectorId: string;
      starshipId: string;
      serviceName: string;
      status: HealthStatus['overall'];
      uptime: number;
      lastCheck: Date;
      alertCount: number;
    }>;
  } {
    const services = Array.from(this.healthMetrics.values()).map(metrics => ({
      connectorId: metrics.connectorId,
      starshipId: metrics.starshipId,
      serviceName: metrics.serviceName,
      status: metrics.healthHistory.length > 0 ? 
        metrics.healthHistory[metrics.healthHistory.length - 1].status : 
        'unknown' as HealthStatus['overall'],
      uptime: metrics.uptime,
      lastCheck: metrics.lastHealthCheck,
      alertCount: this.getActiveAlerts(metrics.connectorId).length
    }));

    const overview = {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      unhealthyServices: services.filter(s => s.status === 'unhealthy').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      activeAlerts: this.activeAlerts.size
    };

    return { overview, services };
  }

  /**
   * Shutdown monitoring service
   */
  async shutdown(): Promise<void> {
    console.log('[HealthMonitor] Shutting down health monitoring service');

    // Stop all monitoring timers
    for (const timer of this.monitoringTimers.values()) {
      clearInterval(timer);
    }
    this.monitoringTimers.clear();

    // Clear data
    this.monitoredConnectors.clear();
    this.activeAlerts.clear();

    console.log('[HealthMonitor] Health monitoring service shutdown complete');
  }

  /**
   * Private helper methods
   */
  private parseMemoryValue(memStr: string): number {
    const value = parseFloat(memStr);
    if (memStr.includes('GiB')) return value * 1024;
    if (memStr.includes('MiB')) return value;
    if (memStr.includes('KiB')) return value / 1024;
    return value;
  }

  private setupDefaultAlertRules(): void {
    // Default alert rules
    const defaultRules: AlertRule[] = [
      {
        id: 'unhealthy-service',
        condition: 'unhealthy',
        enabled: true,
        cooldown: 15
      },
      {
        id: 'high-latency',
        condition: 'high_latency',
        threshold: 1000,
        enabled: true,
        cooldown: 30
      },
      {
        id: 'frequent-restarts',
        condition: 'container_restart',
        threshold: 3,
        enabled: true,
        cooldown: 60
      },
      {
        id: 'high-error-rate',
        condition: 'error_rate',
        threshold: 10,
        enabled: true,
        cooldown: 30
      }
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }
}