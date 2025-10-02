import { getConnection } from '@/helpers/database';

/**
 * Database Performance Monitoring and Query Optimization for PostgreSQL
 *
 * Provides real-time performance monitoring, query analysis,
 * and optimization recommendations for the workflow system.
 */

export interface QueryMetrics {
  queryId: string;
  queryType: string;
  executionTime: number;
  timestamp: string;
  parameters?: Record<string, unknown>;
  resultCount?: number;
  indexesUsed?: string[];
  plannerEstimate?: number;
  actualRows?: number;
}

export interface PerformanceReport {
  timestamp: string;
  period: string;
  summary: {
    totalQueries: number;
    averageExecutionTime: number;
    slowQueries: number;
    fastQueries: number;
    errorRate: number;
  };
  slowestQueries: QueryMetrics[];
  indexUsage: IndexUsageStats[];
  recommendations: string[];
  alerts: PerformanceAlert[];
}

export interface IndexUsageStats {
  indexName: string;
  usageCount: number;
  averageSelectivity: number;
  lastUsed: string;
  effectiveness: 'high' | 'medium' | 'low' | 'unused';
}

export interface PerformanceAlert {
  severity: 'critical' | 'warning' | 'info';
  type: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private connection = getConnection();
  private queryMetrics: QueryMetrics[] = [];
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 second
  private readonly VERY_SLOW_QUERY_THRESHOLD = 5000; // 5 seconds

  /**
   * Start monitoring query performance
   */
  startMonitoring(): void {
    console.log('🔍 Performance monitoring started');

    // Set up periodic reporting
    setInterval(() => {
      this.generatePeriodicReport();
    }, 300000); // Every 5 minutes

    // Set up cache cleanup
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Every hour
  }

  /**
   * Record query execution metrics
   */
  recordQuery(
    queryType: string,
    executionTime: number,
    parameters?: Record<string, unknown>,
    resultCount?: number,
    indexesUsed?: string[]
  ): void {
    const metric: QueryMetrics = {
      queryId: `${queryType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      queryType,
      executionTime,
      timestamp: new Date().toISOString(),
      parameters,
      resultCount,
      indexesUsed,
    };

    this.queryMetrics.push(metric);

    // Alert on slow queries
    if (executionTime > this.VERY_SLOW_QUERY_THRESHOLD) {
      this.alertSlowQuery(metric, 'critical');
    } else if (executionTime > this.SLOW_QUERY_THRESHOLD) {
      this.alertSlowQuery(metric, 'warning');
    }

    // Keep only recent metrics in memory
    if (this.queryMetrics.length > 10000) {
      this.queryMetrics = this.queryMetrics.slice(-5000);
    }
  }

  /**
   * Get current performance statistics
   */
  async getCurrentStats(): Promise<{
    activeConnections: number;
    queryQueueLength: number;
    memoryUsage: Record<string, unknown>;
    indexStats: Record<string, unknown>[];
  }> {
    try {
      // Get database statistics
      const dbStats = await this.connection.query<{
        total_connections: string;
        active_connections: string;
        database_size: string;
      }>(`
        SELECT 
          (SELECT setting FROM pg_settings WHERE name = 'max_connections') as total_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          pg_size_pretty(pg_database_size(current_database())) as database_size
      `);

      // Get index statistics
      const indexStats = await this.connection.query<{
        schemaname: string;
        tablename: string;
        indexname: string;
        idx_scan: number;
        idx_tup_read: number;
        idx_tup_fetch: number;
      }>(`
        SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 20
      `);

      const dbStat = dbStats[0] || { total_connections: '0', active_connections: '0', database_size: '0' };

      return {
        activeConnections: parseInt(dbStat.active_connections || '0'),
        queryQueueLength: 0, // PostgreSQL doesn't expose queue length directly
        memoryUsage: {
          totalConnections: dbStat.total_connections,
          activeConnections: dbStat.active_connections,
          databaseSize: dbStat.database_size,
        },
        indexStats: indexStats.map((stat) => ({
          name: stat.indexname,
          table: stat.tablename,
          scans: stat.idx_scan,
          tupsRead: stat.idx_tup_read,
          tupsFetch: stat.idx_tup_fetch,
        })),
      };
    } catch (error) {
      console.error('Failed to get current stats:', error);
      return {
        activeConnections: 0,
        queryQueueLength: 0,
        memoryUsage: {},
        indexStats: [],
      };
    }
  }

  /**
   * Generate performance report for a time period
   */
  async generateReport(periodHours: number = 1): Promise<PerformanceReport> {
    const cutoffTime = new Date(Date.now() - periodHours * 60 * 60 * 1000);
    const recentMetrics = this.queryMetrics.filter((m) => new Date(m.timestamp) > cutoffTime);

    // Calculate summary statistics
    const totalQueries = recentMetrics.length;
    const averageExecutionTime = totalQueries > 0 ? recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / totalQueries : 0;

    const slowQueries = recentMetrics.filter((m) => m.executionTime > this.SLOW_QUERY_THRESHOLD).length;
    const fastQueries = totalQueries - slowQueries;

    // Get slowest queries
    const slowestQueries = recentMetrics.sort((a, b) => b.executionTime - a.executionTime).slice(0, 10);

    // Analyze index usage
    const indexUsage = await this.analyzeIndexUsage();

    // Generate recommendations
    const recommendations = this.generateRecommendations(recentMetrics, indexUsage);

    // Generate alerts
    const alerts = this.generateAlerts(recentMetrics, indexUsage);

    return {
      timestamp: new Date().toISOString(),
      period: `${periodHours} hour(s)`,
      summary: {
        totalQueries,
        averageExecutionTime: Math.round(averageExecutionTime),
        slowQueries,
        fastQueries,
        errorRate: 0, // Would need error tracking
      },
      slowestQueries,
      indexUsage,
      recommendations,
      alerts,
    };
  }

  /**
   * Analyze index usage and effectiveness
   */
  private async analyzeIndexUsage(): Promise<IndexUsageStats[]> {
    try {
      const indexes = await this.connection.query<{
        indexname: string;
        tablename: string;
        idx_scan: number;
        size: string;
      }>(`
        SELECT 
          i.indexname,
          i.tablename,
          i.idx_scan,
          pg_size_pretty(pg_relation_size(c.oid)) as size
        FROM pg_stat_user_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        WHERE i.schemaname = 'public'
        ORDER BY i.idx_scan DESC
      `);

      return indexes.map((index) => {
        let effectiveness: 'high' | 'medium' | 'low' | 'unused' = 'unused';
        if (index.idx_scan > 1000) effectiveness = 'high';
        else if (index.idx_scan > 100) effectiveness = 'medium';
        else if (index.idx_scan > 0) effectiveness = 'low';

        return {
          indexName: index.indexname,
          usageCount: index.idx_scan,
          averageSelectivity: 0.5, // Would need actual statistics
          lastUsed: new Date().toISOString(),
          effectiveness,
        };
      });
    } catch (error) {
      console.error('Failed to analyze index usage:', error);
      return [];
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: QueryMetrics[], indexUsage: IndexUsageStats[]): string[] {
    const recommendations: string[] = [];

    // Analyze slow queries
    const slowQueries = metrics.filter((m) => m.executionTime > this.SLOW_QUERY_THRESHOLD);
    if (slowQueries.length > metrics.length * 0.1) {
      recommendations.push('🐌 High percentage of slow queries detected. Consider query optimization.');
    }

    // Analyze query patterns
    const queryTypes = new Map<string, number>();
    metrics.forEach((m) => {
      queryTypes.set(m.queryType, (queryTypes.get(m.queryType) || 0) + 1);
    });

    const mostCommonQuery = Array.from(queryTypes.entries()).sort((a, b) => b[1] - a[1])[0];

    if (mostCommonQuery && mostCommonQuery[1] > metrics.length * 0.3) {
      recommendations.push(
        `🔄 Query type "${mostCommonQuery[0]}" represents ${Math.round((mostCommonQuery[1] / metrics.length) * 100)}% of queries. Consider caching.`
      );
    }

    // Analyze index usage
    const unusedIndexes = indexUsage.filter((i) => i.effectiveness === 'unused');
    if (unusedIndexes.length > 0) {
      recommendations.push(`🗂️ ${unusedIndexes.length} indexes are unused and could be dropped to save space.`);
    }

    const lowEffectivenessIndexes = indexUsage.filter((i) => i.effectiveness === 'low');
    if (lowEffectivenessIndexes.length > 0) {
      recommendations.push(`📊 ${lowEffectivenessIndexes.length} indexes have low effectiveness. Review their necessity.`);
    }

    // Memory and performance recommendations
    if (metrics.length > 1000) {
      const avgTime = metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length;
      if (avgTime > 500) {
        recommendations.push('⚡ Average query time is high. Consider connection pooling and query optimization.');
      }
    }

    // Workflow-specific recommendations
    const workflowQueries = metrics.filter((m) => m.queryType.includes('workflow'));
    if (workflowQueries.length > 0) {
      const avgWorkflowTime = workflowQueries.reduce((sum, m) => sum + m.executionTime, 0) / workflowQueries.length;
      if (avgWorkflowTime > 200) {
        recommendations.push('🚀 Workflow queries are slower than optimal. Consider optimizing workflow-specific queries.');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Performance looks good! No immediate optimizations needed.');
    }

    return recommendations;
  }

  /**
   * Generate performance alerts
   */
  private generateAlerts(metrics: QueryMetrics[], indexUsage: IndexUsageStats[]): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    // Critical slow queries
    const criticalSlowQueries = metrics.filter((m) => m.executionTime > this.VERY_SLOW_QUERY_THRESHOLD);
    if (criticalSlowQueries.length > 0) {
      alerts.push({
        severity: 'critical',
        type: 'slow_query',
        message: `${criticalSlowQueries.length} queries exceeded ${this.VERY_SLOW_QUERY_THRESHOLD}ms threshold`,
        timestamp: new Date().toISOString(),
        details: { count: criticalSlowQueries.length, threshold: this.VERY_SLOW_QUERY_THRESHOLD },
      });
    }

    // High query volume
    if (metrics.length > 5000) {
      alerts.push({
        severity: 'warning',
        type: 'high_volume',
        message: `High query volume detected: ${metrics.length} queries in recent period`,
        timestamp: new Date().toISOString(),
        details: { queryCount: metrics.length },
      });
    }

    // Too many unused indexes
    const unusedIndexes = indexUsage.filter((i) => i.effectiveness === 'unused');
    if (unusedIndexes.length > 10) {
      alerts.push({
        severity: 'warning',
        type: 'unused_indexes',
        message: `${unusedIndexes.length} indexes are unused and consuming space`,
        timestamp: new Date().toISOString(),
        details: { unusedIndexes: unusedIndexes.map((i) => i.indexName) },
      });
    }

    return alerts;
  }

  /**
   * Alert on slow query
   */
  private alertSlowQuery(metric: QueryMetrics, severity: 'critical' | 'warning'): void {
    console.warn(`${severity === 'critical' ? '🚨' : '⚠️'} Slow query detected:`, {
      queryType: metric.queryType,
      executionTime: `${metric.executionTime}ms`,
      timestamp: metric.timestamp,
      parameters: metric.parameters,
    });
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const initialCount = this.queryMetrics.length;

    this.queryMetrics = this.queryMetrics.filter((m) => new Date(m.timestamp) > cutoffTime);

    const cleanedCount = initialCount - this.queryMetrics.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old query metrics`);
    }
  }

  /**
   * Generate periodic performance report
   */
  private async generatePeriodicReport(): Promise<void> {
    try {
      const report = await this.generateReport(1); // Last hour

      console.log('📊 Performance Report:', {
        period: report.period,
        totalQueries: report.summary.totalQueries,
        averageTime: `${report.summary.averageExecutionTime}ms`,
        slowQueries: report.summary.slowQueries,
        alerts: report.alerts.length,
      });

      // Log critical alerts
      const criticalAlerts = report.alerts.filter((a) => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        console.error('🚨 Critical performance alerts:', criticalAlerts);
      }

      // Store report in database for historical analysis
      await this.storePerformanceReport(report);
    } catch (error) {
      console.error('Failed to generate periodic report:', error);
    }
  }

  /**
   * Store performance report in database
   */
  private async storePerformanceReport(report: PerformanceReport): Promise<void> {
    try {
      // Ensure performance_reports table exists
      await this.connection.query(`
        CREATE TABLE IF NOT EXISTS performance_reports (
          id VARCHAR(255) PRIMARY KEY,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          period VARCHAR(50) NOT NULL,
          summary JSONB NOT NULL,
          alert_count INTEGER DEFAULT 0,
          recommendation_count INTEGER DEFAULT 0,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      await this.connection.query(
        `
        INSERT INTO performance_reports (id, timestamp, period, summary, alert_count, recommendation_count, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          `perf_report_${Date.now()}`,
          report.timestamp,
          report.period,
          JSON.stringify(report.summary),
          report.alerts.length,
          report.recommendations.length,
          JSON.stringify(report),
        ]
      );
    } catch (error) {
      console.error('Failed to store performance report:', error);
    }
  }

  /**
   * Get historical performance trends
   */
  async getPerformanceTrends(days: number = 7): Promise<{
    queryVolumeByDay: Array<{ date: string; count: number }>;
    averageResponseTimeByDay: Array<{ date: string; avgTime: number }>;
    slowQueryTrend: Array<{ date: string; slowQueries: number }>;
  }> {
    try {
      const reports = await this.connection.query<{
        timestamp: string;
        summary: string;
      }>(`
        SELECT timestamp, summary
        FROM performance_reports 
        WHERE timestamp > NOW() - INTERVAL '${days} days'
        ORDER BY timestamp ASC
      `);

      const queryVolumeByDay: Array<{ date: string; count: number }> = [];
      const averageResponseTimeByDay: Array<{ date: string; avgTime: number }> = [];
      const slowQueryTrend: Array<{ date: string; slowQueries: number }> = [];

      reports.forEach((report) => {
        const date = report.timestamp.split('T')[0];
        const summary = JSON.parse(report.summary);

        queryVolumeByDay.push({ date, count: summary.totalQueries });
        averageResponseTimeByDay.push({ date, avgTime: summary.averageExecutionTime });
        slowQueryTrend.push({ date, slowQueries: summary.slowQueries });
      });

      return {
        queryVolumeByDay,
        averageResponseTimeByDay,
        slowQueryTrend,
      };
    } catch (error) {
      console.error('Failed to get performance trends:', error);
      return {
        queryVolumeByDay: [],
        averageResponseTimeByDay: [],
        slowQueryTrend: [],
      };
    }
  }

  /**
   * Optimize query patterns based on usage
   */
  async optimizeQueryCache(): Promise<void> {
    try {
      console.log('🔧 Query cache optimization not yet implemented for PostgreSQL');
      // TODO: Implement PostgreSQL-specific query optimization
      // Could involve analyzing pg_stat_statements, updating work_mem settings, etc.
    } catch (error) {
      console.error('Failed to optimize query cache:', error);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
