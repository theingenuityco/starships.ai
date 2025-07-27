/**
 * Monitoring Dashboard for MCP Tool Usage
 * 
 * Provides real-time monitoring and visualization data for MCP tools
 */

import { EventEmitter } from 'events';
import { ToolUsageAnalytics } from './ToolUsageAnalytics';
import { PerformanceOptimizer } from './PerformanceOptimizer';

export interface DashboardMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendValue?: number;
  status: 'normal' | 'warning' | 'critical';
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'alert';
  title: string;
  data: any;
  refreshInterval: number;
}

export interface DashboardAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  toolName?: string;
  resolved: boolean;
}

export interface DashboardConfig {
  refreshInterval: number;
  retentionPeriod: number;
  alertThresholds: {
    errorRate: number;
    latency: number;
    cacheHitRate: number;
  };
}

export class MonitoringDashboard extends EventEmitter {
  private metrics: Map<string, DashboardMetric> = new Map();
  private widgets: Map<string, DashboardWidget> = new Map();
  private alerts: Map<string, DashboardAlert> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private historicalData: Map<string, any[]> = new Map();

  constructor(
    private analytics: ToolUsageAnalytics,
    private optimizer: PerformanceOptimizer,
    private config: DashboardConfig = {
      refreshInterval: 5000,
      retentionPeriod: 3600000, // 1 hour
      alertThresholds: {
        errorRate: 0.1,
        latency: 5000,
        cacheHitRate: 0.5
      }
    }
  ) {
    super();
    this.initialize();
  }

  /**
   * Start the dashboard monitoring
   */
  start(): void {
    if (this.refreshTimer) return;

    this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), this.config.refreshInterval);
  }

  /**
   * Stop the dashboard monitoring
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get current dashboard state
   */
  getDashboardState(): {
    metrics: DashboardMetric[];
    widgets: DashboardWidget[];
    alerts: DashboardAlert[];
    health: 'healthy' | 'degraded' | 'critical';
  } {
    return {
      metrics: Array.from(this.metrics.values()),
      widgets: Array.from(this.widgets.values()),
      alerts: Array.from(this.alerts.values()).filter(a => !a.resolved),
      health: this.calculateHealthStatus()
    };
  }

  /**
   * Get specific metric
   */
  getMetric(metricId: string): DashboardMetric | undefined {
    return this.metrics.get(metricId);
  }

  /**
   * Get specific widget data
   */
  getWidget(widgetId: string): DashboardWidget | undefined {
    return this.widgets.get(widgetId);
  }

  /**
   * Create custom alert
   */
  createAlert(alert: Omit<DashboardAlert, 'id' | 'timestamp' | 'resolved'>): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullAlert: DashboardAlert = {
      id: alertId,
      ...alert,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.set(alertId, fullAlert);
    this.emit('alert', fullAlert);
    return alertId;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
    }
  }

  /**
   * Get historical data for a metric
   */
  getHistoricalData(metricId: string, duration?: number): any[] {
    const data = this.historicalData.get(metricId) || [];
    if (!duration) return data;

    const cutoff = Date.now() - duration;
    return data.filter(point => point.timestamp >= cutoff);
  }

  private initialize(): void {
    // Initialize core metrics
    this.initializeMetrics();
    
    // Initialize widgets
    this.initializeWidgets();

    // Set up event listeners
    this.setupEventListeners();
  }

  private initializeMetrics(): void {
    // Tool usage metrics
    this.metrics.set('total_invocations', {
      id: 'total_invocations',
      name: 'Total Invocations',
      value: 0,
      unit: 'count',
      trend: 'stable',
      status: 'normal'
    });

    this.metrics.set('success_rate', {
      id: 'success_rate',
      name: 'Success Rate',
      value: 100,
      unit: '%',
      trend: 'stable',
      status: 'normal'
    });

    this.metrics.set('avg_latency', {
      id: 'avg_latency',
      name: 'Average Latency',
      value: 0,
      unit: 'ms',
      trend: 'stable',
      status: 'normal'
    });

    // Optimization metrics
    this.metrics.set('cache_hit_rate', {
      id: 'cache_hit_rate',
      name: 'Cache Hit Rate',
      value: 0,
      unit: '%',
      trend: 'stable',
      status: 'normal'
    });

    this.metrics.set('throttled_requests', {
      id: 'throttled_requests',
      name: 'Throttled Requests',
      value: 0,
      unit: 'count',
      trend: 'stable',
      status: 'normal'
    });

    this.metrics.set('open_circuits', {
      id: 'open_circuits',
      name: 'Open Circuits',
      value: 0,
      unit: 'count',
      trend: 'stable',
      status: 'normal'
    });
  }

  private initializeWidgets(): void {
    // Tool usage chart
    this.widgets.set('tool_usage_chart', {
      id: 'tool_usage_chart',
      type: 'chart',
      title: 'Tool Usage Over Time',
      data: {
        type: 'line',
        series: []
      },
      refreshInterval: 30000
    });

    // Top tools table
    this.widgets.set('top_tools_table', {
      id: 'top_tools_table',
      type: 'table',
      title: 'Most Used Tools',
      data: {
        headers: ['Tool', 'Count', 'Success Rate', 'Avg Latency'],
        rows: []
      },
      refreshInterval: 60000
    });

    // Error distribution chart
    this.widgets.set('error_distribution', {
      id: 'error_distribution',
      type: 'chart',
      title: 'Error Distribution',
      data: {
        type: 'pie',
        series: []
      },
      refreshInterval: 60000
    });

    // Performance trends
    this.widgets.set('performance_trends', {
      id: 'performance_trends',
      type: 'chart',
      title: 'Performance Trends',
      data: {
        type: 'multi-line',
        series: {
          latency: [],
          successRate: [],
          throughput: []
        }
      },
      refreshInterval: 30000
    });

    // Active alerts
    this.widgets.set('active_alerts', {
      id: 'active_alerts',
      type: 'alert',
      title: 'Active Alerts',
      data: {
        alerts: []
      },
      refreshInterval: 10000
    });
  }

  private setupEventListeners(): void {
    // Listen to analytics events
    this.analytics.on('invocation', (event) => {
      this.updateMetricsFromEvent(event);
    });

    this.analytics.on('anomaly', (anomaly) => {
      this.handleAnomaly(anomaly);
    });
  }

  private refresh(): void {
    try {
      // Update metrics
      this.updateMetrics();

      // Update widgets
      this.updateWidgets();

      // Check for alerts
      this.checkAlerts();

      // Clean up old historical data
      this.cleanupHistoricalData();

      // Emit refresh event
      this.emit('refresh', this.getDashboardState());
    } catch (error) {
      console.error('Dashboard refresh error:', error);
    }
  }

  private updateMetrics(): void {
    const performanceReport = this.analytics.getPerformanceReport();
    const optimizationStats = this.optimizer.getOptimizationStats();

    // Update tool usage metrics
    this.updateMetric('total_invocations', performanceReport.totalInvocations);
    this.updateMetric('success_rate', performanceReport.successRate * 100);
    this.updateMetric('avg_latency', performanceReport.averageLatency);

    // Update optimization metrics
    this.updateMetric('cache_hit_rate', optimizationStats.caching.hitRate * 100);
    this.updateMetric('throttled_requests', optimizationStats.rateLimit.throttledRequests);
    this.updateMetric('open_circuits', optimizationStats.circuitBreaker.openCircuits);
  }

  private updateMetric(id: string, value: number): void {
    const metric = this.metrics.get(id);
    if (!metric) return;

    const previousValue = metric.value;
    metric.value = value;

    // Calculate trend
    if (value > previousValue * 1.1) {
      metric.trend = 'up';
      metric.trendValue = ((value - previousValue) / previousValue) * 100;
    } else if (value < previousValue * 0.9) {
      metric.trend = 'down';
      metric.trendValue = ((previousValue - value) / previousValue) * 100;
    } else {
      metric.trend = 'stable';
      metric.trendValue = 0;
    }

    // Update status
    metric.status = this.calculateMetricStatus(id, value);

    // Store historical data
    this.addHistoricalDataPoint(id, { timestamp: Date.now(), value });
  }

  private calculateMetricStatus(metricId: string, value: number): 'normal' | 'warning' | 'critical' {
    switch (metricId) {
      case 'success_rate':
        if (value < 80) return 'critical';
        if (value < 90) return 'warning';
        return 'normal';

      case 'avg_latency':
        if (value > this.config.alertThresholds.latency) return 'critical';
        if (value > this.config.alertThresholds.latency * 0.8) return 'warning';
        return 'normal';

      case 'cache_hit_rate':
        if (value < this.config.alertThresholds.cacheHitRate * 100 * 0.5) return 'critical';
        if (value < this.config.alertThresholds.cacheHitRate * 100) return 'warning';
        return 'normal';

      case 'open_circuits':
        if (value > 5) return 'critical';
        if (value > 2) return 'warning';
        return 'normal';

      default:
        return 'normal';
    }
  }

  private updateWidgets(): void {
    // Update tool usage chart
    this.updateToolUsageChart();

    // Update top tools table
    this.updateTopToolsTable();

    // Update error distribution
    this.updateErrorDistribution();

    // Update performance trends
    this.updatePerformanceTrends();

    // Update active alerts widget
    this.updateActiveAlertsWidget();
  }

  private updateToolUsageChart(): void {
    const widget = this.widgets.get('tool_usage_chart');
    if (!widget) return;

    const performanceReport = this.analytics.getPerformanceReport();
    widget.data.series = performanceReport.performanceTrends.map(trend => ({
      x: trend.timestamp,
      y: trend.invocationCount
    }));
  }

  private updateTopToolsTable(): void {
    const widget = this.widgets.get('top_tools_table');
    if (!widget) return;

    const performanceReport = this.analytics.getPerformanceReport();
    const allMetrics = this.analytics.getAllMetrics();

    widget.data.rows = performanceReport.topTools.map(({ tool, count }) => {
      const metrics = allMetrics.get(tool);
      return [
        tool,
        count,
        metrics ? `${((metrics.successCount / metrics.invocationCount) * 100).toFixed(1)}%` : 'N/A',
        metrics ? `${metrics.averageLatency.toFixed(0)}ms` : 'N/A'
      ];
    });
  }

  private updateErrorDistribution(): void {
    const widget = this.widgets.get('error_distribution');
    if (!widget) return;

    const performanceReport = this.analytics.getPerformanceReport();
    widget.data.series = Array.from(performanceReport.errorSummary.entries())
      .map(([error, count]) => ({
        name: error,
        value: count
      }));
  }

  private updatePerformanceTrends(): void {
    const widget = this.widgets.get('performance_trends');
    if (!widget) return;

    const historicalLatency = this.getHistoricalData('avg_latency', 3600000);
    const historicalSuccess = this.getHistoricalData('success_rate', 3600000);
    const historicalInvocations = this.getHistoricalData('total_invocations', 3600000);

    widget.data.series = {
      latency: historicalLatency,
      successRate: historicalSuccess,
      throughput: this.calculateThroughput(historicalInvocations)
    };
  }

  private updateActiveAlertsWidget(): void {
    const widget = this.widgets.get('active_alerts');
    if (!widget) return;

    widget.data.alerts = Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }

  private checkAlerts(): void {
    // Check error rate
    const successRate = this.metrics.get('success_rate')?.value || 100;
    const errorRate = (100 - successRate) / 100;
    
    if (errorRate > this.config.alertThresholds.errorRate) {
      this.createAlert({
        severity: 'critical',
        title: 'High Error Rate',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}% (threshold: ${this.config.alertThresholds.errorRate * 100}%)`
      });
    }

    // Check latency
    const avgLatency = this.metrics.get('avg_latency')?.value || 0;
    if (avgLatency > this.config.alertThresholds.latency) {
      this.createAlert({
        severity: 'warning',
        title: 'High Latency',
        message: `Average latency is ${avgLatency}ms (threshold: ${this.config.alertThresholds.latency}ms)`
      });
    }

    // Check cache hit rate
    const cacheHitRate = this.metrics.get('cache_hit_rate')?.value || 0;
    if (cacheHitRate < this.config.alertThresholds.cacheHitRate * 100) {
      this.createAlert({
        severity: 'info',
        title: 'Low Cache Hit Rate',
        message: `Cache hit rate is ${cacheHitRate.toFixed(1)}% (threshold: ${this.config.alertThresholds.cacheHitRate * 100}%)`
      });
    }
  }

  private updateMetricsFromEvent(event: any): void {
    // This would be called in real-time as events occur
  }

  private handleAnomaly(anomaly: any): void {
    const alert = {
      severity: anomaly.type === 'error_spike' ? 'critical' as const : 'warning' as const,
      title: `Anomaly Detected: ${anomaly.type}`,
      message: `Tool ${anomaly.tool} - Value: ${anomaly.value} (Threshold: ${anomaly.threshold})`,
      toolName: anomaly.tool
    };

    this.createAlert(alert);
  }

  private addHistoricalDataPoint(metricId: string, dataPoint: any): void {
    if (!this.historicalData.has(metricId)) {
      this.historicalData.set(metricId, []);
    }

    const data = this.historicalData.get(metricId)!;
    data.push(dataPoint);

    // Keep only recent data
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.historicalData.set(
      metricId,
      data.filter(point => point.timestamp >= cutoff)
    );
  }

  private cleanupHistoricalData(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;
    
    this.historicalData.forEach((data, metricId) => {
      this.historicalData.set(
        metricId,
        data.filter(point => point.timestamp >= cutoff)
      );
    });
  }

  private calculateHealthStatus(): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved && a.severity === 'critical').length;
    
    const warningAlerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved && a.severity === 'warning').length;

    if (criticalAlerts > 0) return 'critical';
    if (warningAlerts > 2) return 'degraded';
    
    const criticalMetrics = Array.from(this.metrics.values())
      .filter(m => m.status === 'critical').length;
    
    if (criticalMetrics > 0) return 'critical';
    
    const warningMetrics = Array.from(this.metrics.values())
      .filter(m => m.status === 'warning').length;
    
    if (warningMetrics > 2) return 'degraded';

    return 'healthy';
  }

  private calculateThroughput(invocationData: any[]): any[] {
    if (invocationData.length < 2) return [];

    return invocationData.slice(1).map((point, index) => {
      const prevPoint = invocationData[index];
      const timeDiff = (point.timestamp - prevPoint.timestamp) / 1000; // seconds
      const invocationDiff = point.value - prevPoint.value;
      
      return {
        timestamp: point.timestamp,
        value: invocationDiff / timeDiff // invocations per second
      };
    });
  }
}