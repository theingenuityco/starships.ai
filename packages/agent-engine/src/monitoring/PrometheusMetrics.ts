/**
 * Prometheus Metrics for MCP Tool Monitoring
 * 
 * Exposes MCP tool metrics in Prometheus format
 */

import { Registry, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { ToolUsageAnalytics } from './ToolUsageAnalytics';
import { PerformanceOptimizer } from './PerformanceOptimizer';
import { MonitoringDashboard } from './MonitoringDashboard';

export interface PrometheusConfig {
  prefix: string;
  labels: string[];
  buckets: {
    latency: number[];
    size: number[];
  };
  percentiles: number[];
}

export class PrometheusMetrics {
  private registry: Registry;
  
  // Counters
  private toolInvocationTotal!: Counter;
  private toolInvocationSuccess!: Counter;
  private toolInvocationFailure!: Counter;
  private cacheHits!: Counter;
  private cacheMisses!: Counter;
  private throttledRequests!: Counter;
  private circuitBreakerTrips!: Counter;

  // Histograms
  private toolLatency!: Histogram;
  private inputSize!: Histogram;
  private outputSize!: Histogram;
  private batchSize!: Histogram;

  // Gauges
  private activeCircuits!: Gauge;
  private cacheSize!: Gauge;
  private queueLength!: Gauge;
  private errorRate!: Gauge;
  private successRate!: Gauge;

  // Summaries
  private toolLatencySummary!: Summary;

  constructor(
    private analytics: ToolUsageAnalytics,
    private optimizer: PerformanceOptimizer,
    private dashboard: MonitoringDashboard,
    private config: PrometheusConfig = {
      prefix: 'mcp_',
      labels: ['tool_name', 'starship_id', 'agent_id'],
      buckets: {
        latency: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
        size: [100, 1000, 10000, 100000, 1000000]
      },
      percentiles: [0.5, 0.9, 0.95, 0.99]
    }
  ) {
    this.registry = new Registry();
    this.initializeMetrics();
    this.setupEventListeners();
  }

  /**
   * Get the Prometheus registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get metrics in Prometheus text format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Update all metrics
   */
  updateMetrics(): void {
    this.updateAnalyticsMetrics();
    this.updateOptimizationMetrics();
    this.updateDashboardMetrics();
  }

  private initializeMetrics(): void {
    // Tool invocation counters
    this.toolInvocationTotal = new Counter({
      name: `${this.config.prefix}tool_invocation_total`,
      help: 'Total number of tool invocations',
      labelNames: this.config.labels,
      registers: [this.registry]
    });

    this.toolInvocationSuccess = new Counter({
      name: `${this.config.prefix}tool_invocation_success_total`,
      help: 'Total number of successful tool invocations',
      labelNames: this.config.labels,
      registers: [this.registry]
    });

    this.toolInvocationFailure = new Counter({
      name: `${this.config.prefix}tool_invocation_failure_total`,
      help: 'Total number of failed tool invocations',
      labelNames: [...this.config.labels, 'error_type'],
      registers: [this.registry]
    });

    // Cache metrics
    this.cacheHits = new Counter({
      name: `${this.config.prefix}cache_hits_total`,
      help: 'Total number of cache hits',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    this.cacheMisses = new Counter({
      name: `${this.config.prefix}cache_misses_total`,
      help: 'Total number of cache misses',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    // Rate limiting metrics
    this.throttledRequests = new Counter({
      name: `${this.config.prefix}throttled_requests_total`,
      help: 'Total number of throttled requests',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    // Circuit breaker metrics
    this.circuitBreakerTrips = new Counter({
      name: `${this.config.prefix}circuit_breaker_trips_total`,
      help: 'Total number of circuit breaker trips',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    // Latency histogram
    this.toolLatency = new Histogram({
      name: `${this.config.prefix}tool_latency_milliseconds`,
      help: 'Tool invocation latency in milliseconds',
      labelNames: this.config.labels,
      buckets: this.config.buckets.latency,
      registers: [this.registry]
    });

    // Size histograms
    this.inputSize = new Histogram({
      name: `${this.config.prefix}input_size_bytes`,
      help: 'Tool input size in bytes',
      labelNames: ['tool_name'],
      buckets: this.config.buckets.size,
      registers: [this.registry]
    });

    this.outputSize = new Histogram({
      name: `${this.config.prefix}output_size_bytes`,
      help: 'Tool output size in bytes',
      labelNames: ['tool_name'],
      buckets: this.config.buckets.size,
      registers: [this.registry]
    });

    this.batchSize = new Histogram({
      name: `${this.config.prefix}batch_size`,
      help: 'Batch processing size',
      labelNames: ['tool_name'],
      buckets: [1, 2, 5, 10, 20, 50, 100],
      registers: [this.registry]
    });

    // Gauges
    this.activeCircuits = new Gauge({
      name: `${this.config.prefix}active_circuits`,
      help: 'Number of currently open circuit breakers',
      registers: [this.registry]
    });

    this.cacheSize = new Gauge({
      name: `${this.config.prefix}cache_size`,
      help: 'Current cache size',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    this.queueLength = new Gauge({
      name: `${this.config.prefix}queue_length`,
      help: 'Current queue length for batch processing',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    this.errorRate = new Gauge({
      name: `${this.config.prefix}error_rate`,
      help: 'Current error rate (0-1)',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    this.successRate = new Gauge({
      name: `${this.config.prefix}success_rate`,
      help: 'Current success rate (0-1)',
      labelNames: ['tool_name'],
      registers: [this.registry]
    });

    // Summary for detailed latency percentiles
    this.toolLatencySummary = new Summary({
      name: `${this.config.prefix}tool_latency_summary_milliseconds`,
      help: 'Tool invocation latency summary',
      labelNames: this.config.labels,
      percentiles: this.config.percentiles,
      registers: [this.registry]
    });
  }

  private setupEventListeners(): void {
    // Listen to tool invocation events
    this.analytics.on('invocation', (event) => {
      this.recordInvocation(event);
    });

    // Listen to anomaly events
    this.analytics.on('anomaly', (anomaly) => {
      this.recordAnomaly(anomaly);
    });

    // Listen to dashboard alerts
    this.dashboard.on('alert', (alert) => {
      this.recordAlert(alert);
    });

    // Periodic metric updates
    setInterval(() => this.updateMetrics(), 30000);
  }

  private recordInvocation(event: any): void {
    const labels = {
      tool_name: event.toolName,
      starship_id: event.starshipId,
      agent_id: event.agentId
    };

    // Increment total counter
    this.toolInvocationTotal.inc(labels);

    // Record success/failure
    if (event.success) {
      this.toolInvocationSuccess.inc(labels);
    } else {
      this.toolInvocationFailure.inc({
        ...labels,
        error_type: this.classifyError(event.error)
      });
    }

    // Record latency
    this.toolLatency.observe(labels, event.duration);
    this.toolLatencySummary.observe(labels, event.duration);

    // Record sizes
    this.inputSize.observe({ tool_name: event.toolName }, event.inputSize);
    this.outputSize.observe({ tool_name: event.toolName }, event.outputSize);
  }

  private recordAnomaly(anomaly: any): void {
    // Anomalies could be recorded as custom metrics or events
    // For now, we'll increment relevant counters based on anomaly type
    if (anomaly.type === 'error_spike') {
      // This is already captured in failure counters
    } else if (anomaly.type === 'high_latency') {
      // This is captured in latency histograms
    }
  }

  private recordAlert(alert: any): void {
    // Alerts could be exposed as a gauge metric
    // For now, we'll track them in the dashboard metrics
  }

  private updateAnalyticsMetrics(): void {
    const allMetrics = this.analytics.getAllMetrics();
    const performanceReport = this.analytics.getPerformanceReport();

    // Update per-tool metrics
    allMetrics.forEach((metrics, toolName) => {
      const successRate = metrics.invocationCount > 0
        ? metrics.successCount / metrics.invocationCount
        : 0;
      
      const errorRate = metrics.invocationCount > 0
        ? metrics.failureCount / metrics.invocationCount
        : 0;

      this.successRate.set({ tool_name: toolName }, successRate);
      this.errorRate.set({ tool_name: toolName }, errorRate);
    });
  }

  private updateOptimizationMetrics(): void {
    const stats = this.optimizer.getOptimizationStats();

    // Update cache metrics
    // Note: These would need to be tracked incrementally in production
    // as Prometheus counters should only increase

    // Update circuit breaker gauge
    this.activeCircuits.set(stats.circuitBreaker.openCircuits);

    // Update rate limiting metrics
    // Note: throttledRequests counter would be incremented in real-time
  }

  private updateDashboardMetrics(): void {
    const dashboardState = this.dashboard.getDashboardState();

    // Could expose dashboard health as a gauge
    const healthValue = dashboardState.health === 'healthy' ? 0 :
                       dashboardState.health === 'degraded' ? 1 : 2;
    
    // You could add a dashboard health gauge here if needed
  }

  private classifyError(error?: string): string {
    if (!error) return 'unknown';
    
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('rate limit')) return 'rate_limit';
    if (error.includes('circuit breaker')) return 'circuit_breaker';
    if (error.includes('validation')) return 'validation';
    if (error.includes('network')) return 'network';
    
    return 'other';
  }

  /**
   * Create custom metric
   */
  createCustomMetric(
    name: string,
    type: 'counter' | 'gauge' | 'histogram' | 'summary',
    help: string,
    labelNames?: string[],
    buckets?: number[]
  ): Counter | Gauge | Histogram | Summary {
    const metricName = `${this.config.prefix}${name}`;
    
    switch (type) {
      case 'counter':
        return new Counter({
          name: metricName,
          help,
          labelNames: labelNames || [],
          registers: [this.registry]
        });
      
      case 'gauge':
        return new Gauge({
          name: metricName,
          help,
          labelNames: labelNames || [],
          registers: [this.registry]
        });
      
      case 'histogram':
        return new Histogram({
          name: metricName,
          help,
          labelNames: labelNames || [],
          buckets: buckets || this.config.buckets.latency,
          registers: [this.registry]
        });
      
      case 'summary':
        return new Summary({
          name: metricName,
          help,
          labelNames: labelNames || [],
          percentiles: this.config.percentiles,
          registers: [this.registry]
        });
    }
  }

  /**
   * Export metrics for specific tools
   */
  getToolMetrics(toolNames: string[]): any {
    const metrics: any = {};
    
    toolNames.forEach(toolName => {
      const toolMetrics = this.analytics.getToolMetrics(toolName);
      if (toolMetrics) {
        metrics[toolName] = {
          invocations: toolMetrics.invocationCount,
          successes: toolMetrics.successCount,
          failures: toolMetrics.failureCount,
          avgLatency: toolMetrics.averageLatency,
          successRate: toolMetrics.invocationCount > 0
            ? toolMetrics.successCount / toolMetrics.invocationCount
            : 0
        };
      }
    });

    return metrics;
  }

  /**
   * Get metrics endpoint handler for Express
   */
  getMetricsHandler() {
    return async (req: any, res: any) => {
      try {
        res.set('Content-Type', this.registry.contentType);
        const metrics = await this.registry.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).end(error);
      }
    };
  }
}