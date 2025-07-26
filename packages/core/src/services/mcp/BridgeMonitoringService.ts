/**
 * BridgeMonitoringService - Comprehensive monitoring and logging for HTTP Bridge
 * 
 * This service provides metrics collection, logging, alerting, and observability
 * for HTTP bridge containers and MCP protocol operations.
 */

import { MCPServerConnectorRepository } from '@starships/models';
import { serviceRegistry } from './ServiceRegistry';

export interface BridgeMetrics {
  connectorId: string;
  containerName: string;
  httpRequestCount: number;
  mcpRequestCount: number;
  errorCount: number;
  averageResponseTime: number;
  healthCheckCount: number;
  healthCheckFailures: number;
  uptimeSeconds: number;
  lastActivity: string;
  resourceUsage?: ContainerResourceUsage;
}

export interface ContainerResourceUsage {
  cpuUsagePercent: number;
  memoryUsageMB: number;
  memoryLimitMB: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

export interface BridgeLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  connectorId: string;
  containerName: string;
  component: 'bridge' | 'mcp' | 'health' | 'capability' | 'monitoring';
  message: string;
  correlationId?: string;
  requestId?: string;
  responseTime?: number;
  httpStatusCode?: number;
  mcpMethod?: string;
  error?: {
    code: number;
    message: string;
    stack?: string;
  };
  metadata?: any;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  threshold: number;
  duration: number; // seconds
  enabled: boolean;
  lastTriggered?: string;
}

export interface AlertCondition {
  metric: 'error_rate' | 'response_time' | 'health_failures' | 'cpu_usage' | 'memory_usage';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  timeWindow: number; // seconds
}

export interface Alert {
  id: string;
  ruleId: string;
  connectorId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  triggeredAt: string;
  resolvedAt?: string;
  currentValue: number;
  threshold: number;
  metadata?: any;
}

export class BridgeMonitoringService {
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private metrics: Map<string, BridgeMetrics> = new Map();
  private logs: BridgeLogEntry[] = [];
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private logRetentionDays: number = 30;
  private maxLogEntries: number = 100000;
  private metricsInterval: number = 60000; // 1 minute

  constructor(mcpConnectorRepo?: MCPServerConnectorRepository) {
    this.mcpConnectorRepo = mcpConnectorRepo || new MCPServerConnectorRepository();
    this.initializeDefaultAlertRules();
    this.startLogCleanup();
  }

  /**
   * Start monitoring for a specific connector
   */
  async startMonitoring(connectorId: string): Promise<void> {
    console.log(`[BridgeMonitoring] Starting monitoring for connector ${connectorId}`);
    
    // Stop existing monitoring if any
    this.stopMonitoring(connectorId);
    
    // Initialize metrics
    const connector = await this.mcpConnectorRepo.findById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const containerName = connector.dockerServiceName || `mcp-${connector.starshipId}-${connectorId}`;
    
    this.metrics.set(connectorId, {
      connectorId,
      containerName,
      httpRequestCount: 0,
      mcpRequestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      healthCheckCount: 0,
      healthCheckFailures: 0,
      uptimeSeconds: 0,
      lastActivity: new Date().toISOString()
    });

    // Start metrics collection
    const interval = setInterval(async () => {
      try {
        await this.collectMetrics(connectorId);
        await this.evaluateAlerts(connectorId);
      } catch (error) {
        this.logError(connectorId, 'monitoring', 'Failed to collect metrics', error);
      }
    }, this.metricsInterval);

    this.monitoringIntervals.set(connectorId, interval);
    
    this.logInfo(connectorId, 'monitoring', `Started monitoring for ${containerName}`);
  }

  /**
   * Stop monitoring for a specific connector
   */
  stopMonitoring(connectorId: string): void {
    const interval = this.monitoringIntervals.get(connectorId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(connectorId);
      console.log(`[BridgeMonitoring] Stopped monitoring for connector ${connectorId}`);
    }
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(connectorId: string, responseTime: number, statusCode: number, requestId?: string): void {
    const metrics = this.metrics.get(connectorId);
    if (!metrics) return;

    metrics.httpRequestCount++;
    if (statusCode >= 400) {
      metrics.errorCount++;
    }
    
    // Update average response time (exponential moving average)
    metrics.averageResponseTime = metrics.averageResponseTime === 0 
      ? responseTime
      : (metrics.averageResponseTime * 0.9) + (responseTime * 0.1);
    
    metrics.lastActivity = new Date().toISOString();

    this.logInfo(connectorId, 'bridge', `HTTP request completed`, {
      requestId,
      responseTime,
      statusCode,
      averageResponseTime: Math.round(metrics.averageResponseTime)
    });
  }

  /**
   * Record MCP protocol operation
   */
  recordMCPRequest(connectorId: string, method: string, responseTime: number, success: boolean, requestId?: string): void {
    const metrics = this.metrics.get(connectorId);
    if (!metrics) return;

    metrics.mcpRequestCount++;
    if (!success) {
      metrics.errorCount++;
    }
    
    metrics.lastActivity = new Date().toISOString();

    this.logInfo(connectorId, 'mcp', `MCP ${method} ${success ? 'succeeded' : 'failed'}`, {
      requestId,
      method,
      responseTime,
      success
    });
  }

  /**
   * Record health check result
   */
  recordHealthCheck(connectorId: string, success: boolean, responseTime: number): void {
    const metrics = this.metrics.get(connectorId);
    if (!metrics) return;

    metrics.healthCheckCount++;
    if (!success) {
      metrics.healthCheckFailures++;
    }
    
    metrics.lastActivity = new Date().toISOString();

    this.logInfo(connectorId, 'health', `Health check ${success ? 'passed' : 'failed'}`, {
      responseTime,
      success,
      failureRate: (metrics.healthCheckFailures / metrics.healthCheckCount * 100).toFixed(2) + '%'
    });
  }

  /**
   * Get current metrics for a connector
   */
  getMetrics(connectorId: string): BridgeMetrics | null {
    return this.metrics.get(connectorId) || null;
  }

  /**
   * Get metrics for all monitored connectors
   */
  getAllMetrics(): BridgeMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get recent logs for a connector
   */
  getLogs(connectorId: string, limit: number = 100): BridgeLogEntry[] {
    return this.logs
      .filter(log => log.connectorId === connectorId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all recent logs
   */
  getAllLogs(limit: number = 1000): BridgeLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  /**
   * Get active alerts for a connector
   */
  getAlerts(connectorId: string): Alert[] {
    return this.alerts.filter(alert => 
      alert.connectorId === connectorId && !alert.resolvedAt
    );
  }

  /**
   * Get all active alerts
   */
  getAllActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolvedAt);
  }

  /**
   * Collect metrics from container and service registry
   */
  private async collectMetrics(connectorId: string): Promise<void> {
    const metrics = this.metrics.get(connectorId);
    if (!metrics) return;

    const connector = await this.mcpConnectorRepo.findById(connectorId);
    if (!connector?.starshipId) return;

    // Get service endpoint status
    const serviceEndpoint = serviceRegistry.getService(connector.starshipId, connectorId);
    if (serviceEndpoint) {
      // Update uptime based on service status
      if (serviceEndpoint.status === 'healthy') {
        metrics.uptimeSeconds += this.metricsInterval / 1000;
      }
    }

    // TODO: Collect Docker container resource usage via Docker API
    // This would require Docker client integration for production use
    try {
      const resourceUsage = await this.collectContainerResources(metrics.containerName);
      metrics.resourceUsage = resourceUsage;
    } catch (error) {
      // Resource collection is optional, log but don't fail
      this.logDebug(connectorId, 'monitoring', 'Could not collect container resources', { error: error instanceof Error ? error.message : error });
    }
  }

  /**
   * Collect container resource usage (placeholder implementation)
   */
  private async collectContainerResources(containerName: string): Promise<ContainerResourceUsage | undefined> {
    // TODO: Implement Docker API integration for production
    // For now, return undefined to indicate resources not available
    // In production, this would use Docker client to get container stats
    
    // Example implementation would be:
    // const docker = new Docker();
    // const container = docker.getContainer(containerName);
    // const stats = await container.stats({ stream: false });
    // return parseDockerStats(stats);
    
    return undefined;
  }

  /**
   * Evaluate alert rules for a connector
   */
  private async evaluateAlerts(connectorId: string): Promise<void> {
    const metrics = this.metrics.get(connectorId);
    if (!metrics) return;

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      const currentValue = this.getMetricValue(metrics, rule.condition.metric);
      const shouldTrigger = this.evaluateCondition(currentValue, rule.condition.operator, rule.threshold);
      
      const existingAlert = this.alerts.find(alert => 
        alert.ruleId === rule.id && 
        alert.connectorId === connectorId && 
        !alert.resolvedAt
      );

      if (shouldTrigger && !existingAlert) {
        // Trigger new alert
        const alert: Alert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ruleId: rule.id,
          connectorId,
          severity: this.getSeverityForRule(rule),
          message: `${rule.name}: ${rule.condition.metric} is ${currentValue} (threshold: ${rule.threshold})`,
          triggeredAt: new Date().toISOString(),
          currentValue,
          threshold: rule.threshold,
          metadata: { rule, metrics }
        };

        this.alerts.push(alert);
        rule.lastTriggered = alert.triggeredAt;
        
        this.logWarn(connectorId, 'monitoring', `Alert triggered: ${alert.message}`, { alert });
        
      } else if (!shouldTrigger && existingAlert) {
        // Resolve existing alert
        existingAlert.resolvedAt = new Date().toISOString();
        this.logInfo(connectorId, 'monitoring', `Alert resolved: ${existingAlert.message}`, { alert: existingAlert });
      }
    }
  }

  /**
   * Get metric value for alert evaluation
   */
  private getMetricValue(metrics: BridgeMetrics, metric: AlertCondition['metric']): number {
    switch (metric) {
      case 'error_rate':
        const totalRequests = metrics.httpRequestCount + metrics.mcpRequestCount;
        return totalRequests > 0 ? (metrics.errorCount / totalRequests) * 100 : 0;
      case 'response_time':
        return metrics.averageResponseTime;
      case 'health_failures':
        return metrics.healthCheckCount > 0 ? (metrics.healthCheckFailures / metrics.healthCheckCount) * 100 : 0;
      case 'cpu_usage':
        return metrics.resourceUsage?.cpuUsagePercent || 0;
      case 'memory_usage':
        return metrics.resourceUsage?.memoryUsageMB || 0;
      default:
        return 0;
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, operator: AlertCondition['operator'], threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * Get severity level for alert rule
   */
  private getSeverityForRule(rule: AlertRule): Alert['severity'] {
    // Simple severity mapping based on metric type
    switch (rule.condition.metric) {
      case 'error_rate':
        return rule.threshold > 50 ? 'critical' : rule.threshold > 25 ? 'high' : 'medium';
      case 'response_time':
        return rule.threshold > 5000 ? 'critical' : rule.threshold > 2000 ? 'high' : 'medium';
      case 'health_failures':
        return rule.threshold > 75 ? 'critical' : rule.threshold > 50 ? 'high' : 'medium';
      case 'cpu_usage':
      case 'memory_usage':
        return rule.threshold > 90 ? 'critical' : rule.threshold > 75 ? 'high' : 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        condition: { metric: 'error_rate', operator: 'gt', timeWindow: 300 },
        threshold: 10, // 10% error rate
        duration: 60,
        enabled: true
      },
      {
        id: 'slow-response-time',
        name: 'Slow Response Time',
        condition: { metric: 'response_time', operator: 'gt', timeWindow: 300 },
        threshold: 2000, // 2 seconds
        duration: 120,
        enabled: true
      },
      {
        id: 'health-check-failures',
        name: 'Health Check Failures',
        condition: { metric: 'health_failures', operator: 'gt', timeWindow: 600 },
        threshold: 50, // 50% failure rate
        duration: 180,
        enabled: true
      },
      {
        id: 'high-cpu-usage',
        name: 'High CPU Usage',
        condition: { metric: 'cpu_usage', operator: 'gt', timeWindow: 300 },
        threshold: 80, // 80% CPU usage
        duration: 300,
        enabled: true
      },
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        condition: { metric: 'memory_usage', operator: 'gt', timeWindow: 300 },
        threshold: 512, // 512MB memory usage
        duration: 300,
        enabled: true
      }
    ];
  }

  /**
   * Start log cleanup process
   */
  private startLogCleanup(): void {
    // Clean up logs every hour
    setInterval(() => {
      this.cleanupLogs();
    }, 3600000); // 1 hour
  }

  /**
   * Clean up old logs and resolved alerts
   */
  private cleanupLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.logRetentionDays);
    const cutoffTime = cutoffDate.toISOString();

    // Remove old logs
    const oldLogCount = this.logs.length;
    this.logs = this.logs.filter(log => log.timestamp > cutoffTime);
    
    // Limit total log entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    // Remove old resolved alerts
    const oldAlertCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => 
      !alert.resolvedAt || alert.resolvedAt > cutoffTime
    );

    if (oldLogCount !== this.logs.length || oldAlertCount !== this.alerts.length) {
      console.log(`[BridgeMonitoring] Cleaned up logs: ${oldLogCount} -> ${this.logs.length}, alerts: ${oldAlertCount} -> ${this.alerts.length}`);
    }
  }

  /**
   * Logging helper methods
   */
  private logDebug(connectorId: string, component: BridgeLogEntry['component'], message: string, metadata?: any): void {
    this.addLogEntry('debug', connectorId, component, message, metadata);
  }

  private logInfo(connectorId: string, component: BridgeLogEntry['component'], message: string, metadata?: any): void {
    this.addLogEntry('info', connectorId, component, message, metadata);
  }

  private logWarn(connectorId: string, component: BridgeLogEntry['component'], message: string, metadata?: any): void {
    this.addLogEntry('warn', connectorId, component, message, metadata);
  }

  private logError(connectorId: string, component: BridgeLogEntry['component'], message: string, error?: any): void {
    const errorMetadata = error instanceof Error ? {
      error: {
        code: 0,
        message: error.message,
        stack: error.stack
      }
    } : { error };
    
    this.addLogEntry('error', connectorId, component, message, errorMetadata);
  }

  /**
   * Add log entry
   */
  private addLogEntry(level: BridgeLogEntry['level'], connectorId: string, component: BridgeLogEntry['component'], message: string, metadata?: any): void {
    const metrics = this.metrics.get(connectorId);
    const containerName = metrics?.containerName || 'unknown';

    const logEntry: BridgeLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      connectorId,
      containerName,
      component,
      message,
      metadata
    };

    this.logs.push(logEntry);
    
    // Also log to console for development
    const logPrefix = `[BridgeMonitoring:${containerName}]`;
    switch (level) {
      case 'debug':
        console.debug(logPrefix, message, metadata || '');
        break;
      case 'info':
        console.log(logPrefix, message, metadata || '');
        break;
      case 'warn':
        console.warn(logPrefix, message, metadata || '');
        break;
      case 'error':
        console.error(logPrefix, message, metadata || '');
        break;
    }
  }

  /**
   * Get monitoring status summary
   */
  getMonitoringStatus(): {
    activeConnectors: number;
    totalMetrics: number;
    totalLogs: number;
    activeAlerts: number;
    alertRules: number;
  } {
    return {
      activeConnectors: this.monitoringIntervals.size,
      totalMetrics: this.metrics.size,
      totalLogs: this.logs.length,
      activeAlerts: this.alerts.filter(a => !a.resolvedAt).length,
      alertRules: this.alertRules.filter(r => r.enabled).length
    };
  }

  /**
   * Cleanup - stop all monitoring
   */
  cleanup(): void {
    console.log(`[BridgeMonitoring] Cleaning up monitoring for ${this.monitoringIntervals.size} connectors`);
    
    for (const [connectorId, interval] of this.monitoringIntervals) {
      clearInterval(interval);
    }
    
    this.monitoringIntervals.clear();
    this.metrics.clear();
    this.logs.length = 0;
    this.alerts.length = 0;
  }
}

// Export singleton instance
export const bridgeMonitoringService = new BridgeMonitoringService();