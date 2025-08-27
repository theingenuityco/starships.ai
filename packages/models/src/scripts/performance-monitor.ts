import { getConnection } from '../helpers/database';

/**
 * Database Performance Monitoring and Query Optimization
 * 
 * Provides real-time performance monitoring, query analysis,
 * and optimization recommendations for the workflow system.
 */

export interface QueryMetrics {
  queryId: string;
  queryType: string;
  executionTime: number;
  timestamp: string;
  parameters?: any;
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
  details?: any;
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
    parameters?: any,
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
      indexesUsed
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
    memoryUsage: any;
    indexStats: any;
  }> {
    try {
      // Get database statistics
      const dbStats = await this.connection.executeQuery(
        `CALL db.stats.retrieve('GRAPH COUNTS') YIELD data
         RETURN data`
      );

      // Get index statistics (if available)
      const indexStats = await this.connection.executeQuery(
        `SHOW INDEXES YIELD name, type, state, populationPercent
         RETURN collect({
           name: name,
           type: type,
           state: state,
           populationPercent: populationPercent
         }) as indexes`
      );

      return {
        activeConnections: 1, // Neo4j doesn't expose this easily
        queryQueueLength: 0,
        memoryUsage: dbStats[0]?.data || {},
        indexStats: indexStats[0]?.indexes || []
      };

    } catch (error) {
      console.error('Failed to get current stats:', error);
      return {
        activeConnections: 0,
        queryQueueLength: 0,
        memoryUsage: {},
        indexStats: []
      };
    }
  }

  /**
   * Generate performance report for a time period
   */
  async generateReport(periodHours: number = 1): Promise<PerformanceReport> {
    const cutoffTime = new Date(Date.now() - periodHours * 60 * 60 * 1000);
    const recentMetrics = this.queryMetrics.filter(
      m => new Date(m.timestamp) > cutoffTime
    );

    // Calculate summary statistics
    const totalQueries = recentMetrics.length;
    const averageExecutionTime = totalQueries > 0 
      ? recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / totalQueries 
      : 0;
    
    const slowQueries = recentMetrics.filter(m => m.executionTime > this.SLOW_QUERY_THRESHOLD).length;
    const fastQueries = totalQueries - slowQueries;

    // Get slowest queries
    const slowestQueries = recentMetrics
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10);

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
        errorRate: 0 // Would need error tracking
      },
      slowestQueries,
      indexUsage,
      recommendations,
      alerts
    };
  }

  /**
   * Analyze index usage and effectiveness
   */
  private async analyzeIndexUsage(): Promise<IndexUsageStats[]> {
    try {
      const indexes = await this.connection.executeQuery<{
        name: string;
        type: string;
        state: string;
        populationPercent: number;
      }>(
        `SHOW INDEXES 
         YIELD name, type, state, populationPercent
         WHERE name CONTAINS 'workflow' OR name CONTAINS 'starship' OR name CONTAINS 'agent'
         RETURN name, type, state, populationPercent`
      );

      return indexes.map(index => {
        // Calculate usage from recent queries
        const usageCount = this.queryMetrics.filter(m => 
          m.indexesUsed?.includes(index.name)
        ).length;

        let effectiveness: 'high' | 'medium' | 'low' | 'unused' = 'unused';
        if (usageCount > 100) effectiveness = 'high';
        else if (usageCount > 10) effectiveness = 'medium';
        else if (usageCount > 0) effectiveness = 'low';

        return {
          indexName: index.name,
          usageCount,
          averageSelectivity: index.populationPercent / 100,
          lastUsed: new Date().toISOString(), // Would need actual tracking
          effectiveness
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
  private generateRecommendations(
    metrics: QueryMetrics[], 
    indexUsage: IndexUsageStats[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze slow queries
    const slowQueries = metrics.filter(m => m.executionTime > this.SLOW_QUERY_THRESHOLD);
    if (slowQueries.length > metrics.length * 0.1) {
      recommendations.push('🐌 High percentage of slow queries detected. Consider query optimization.');
    }

    // Analyze query patterns
    const queryTypes = new Map<string, number>();
    metrics.forEach(m => {
      queryTypes.set(m.queryType, (queryTypes.get(m.queryType) || 0) + 1);
    });

    const mostCommonQuery = Array.from(queryTypes.entries())
      .sort((a, b) => b[1] - a[1])[0];

    if (mostCommonQuery && mostCommonQuery[1] > metrics.length * 0.3) {
      recommendations.push(`🔄 Query type "${mostCommonQuery[0]}" represents ${Math.round(mostCommonQuery[1] / metrics.length * 100)}% of queries. Consider caching.`);
    }

    // Analyze index usage
    const unusedIndexes = indexUsage.filter(i => i.effectiveness === 'unused');
    if (unusedIndexes.length > 0) {
      recommendations.push(`🗂️ ${unusedIndexes.length} indexes are unused and could be dropped to save space.`);
    }

    const lowEffectivenessIndexes = indexUsage.filter(i => i.effectiveness === 'low');
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
    const workflowQueries = metrics.filter(m => m.queryType.includes('workflow'));
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
  private generateAlerts(
    metrics: QueryMetrics[], 
    indexUsage: IndexUsageStats[]
  ): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    // Critical slow queries
    const criticalSlowQueries = metrics.filter(m => m.executionTime > this.VERY_SLOW_QUERY_THRESHOLD);
    if (criticalSlowQueries.length > 0) {
      alerts.push({
        severity: 'critical',
        type: 'slow_query',
        message: `${criticalSlowQueries.length} queries exceeded ${this.VERY_SLOW_QUERY_THRESHOLD}ms threshold`,
        timestamp: new Date().toISOString(),
        details: { count: criticalSlowQueries.length, threshold: this.VERY_SLOW_QUERY_THRESHOLD }
      });
    }

    // High query volume
    if (metrics.length > 5000) {
      alerts.push({
        severity: 'warning',
        type: 'high_volume',
        message: `High query volume detected: ${metrics.length} queries in recent period`,
        timestamp: new Date().toISOString(),
        details: { queryCount: metrics.length }
      });
    }

    // Index issues
    const failedIndexes = indexUsage.filter(i => i.indexName.includes('FAILED'));
    if (failedIndexes.length > 0) {
      alerts.push({
        severity: 'critical',
        type: 'index_failure',
        message: `${failedIndexes.length} indexes are in failed state`,
        timestamp: new Date().toISOString(),
        details: { failedIndexes: failedIndexes.map(i => i.indexName) }
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
      parameters: metric.parameters
    });
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const initialCount = this.queryMetrics.length;
    
    this.queryMetrics = this.queryMetrics.filter(
      m => new Date(m.timestamp) > cutoffTime
    );

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
        alerts: report.alerts.length
      });

      // Log critical alerts
      const criticalAlerts = report.alerts.filter(a => a.severity === 'critical');
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
      await this.connection.executeWrite(
        `CREATE (pr:PerformanceReport {
          id: $reportId,
          timestamp: $timestamp,
          period: $period,
          summary: $summary,
          alertCount: $alertCount,
          recommendationCount: $recommendationCount,
          data: $data
        })`,
        {
          reportId: `perf_report_${Date.now()}`,
          timestamp: report.timestamp,
          period: report.period,
          summary: report.summary,
          alertCount: report.alerts.length,
          recommendationCount: report.recommendations.length,
          data: JSON.stringify(report)
        }
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
      const reports = await this.connection.executeQuery<{
        timestamp: string;
        summary: any;
      }>(
        `MATCH (pr:PerformanceReport)
         WHERE datetime(pr.timestamp) > datetime() - duration({days: $days})
         RETURN pr.timestamp as timestamp, pr.summary as summary
         ORDER BY pr.timestamp ASC`,
        { days }
      );

      const queryVolumeByDay: Array<{ date: string; count: number }> = [];
      const averageResponseTimeByDay: Array<{ date: string; avgTime: number }> = [];
      const slowQueryTrend: Array<{ date: string; slowQueries: number }> = [];

      reports.forEach(report => {
        const date = report.timestamp.split('T')[0];
        const summary = report.summary;

        queryVolumeByDay.push({ date, count: summary.totalQueries });
        averageResponseTimeByDay.push({ date, avgTime: summary.averageExecutionTime });
        slowQueryTrend.push({ date, slowQueries: summary.slowQueries });
      });

      return {
        queryVolumeByDay,
        averageResponseTimeByDay,
        slowQueryTrend
      };

    } catch (error) {
      console.error('Failed to get performance trends:', error);
      return {
        queryVolumeByDay: [],
        averageResponseTimeByDay: [],
        slowQueryTrend: []
      };
    }
  }

  /**
   * Optimize query cache based on usage patterns
   */
  async optimizeQueryCache(): Promise<void> {
    try {
      // Update cache TTL based on query patterns
      const cacheNodes = await this.connection.executeQuery<{
        id: string;
        type: string;
        lastUpdated: number;
      }>(
        `MATCH (cache:QueryCache)
         RETURN cache.id as id, cache.type as type, cache.lastUpdated as lastUpdated`
      );

      for (const cache of cacheNodes) {
        const relatedQueries = this.queryMetrics.filter(m =>
          m.queryType.includes(cache.type.replace('_', ''))
        );

        // Adjust TTL based on query frequency
        let newTTL = 300000; // 5 minutes default
        if (relatedQueries.length > 100) {
          newTTL = 60000; // 1 minute for high-frequency queries
        } else if (relatedQueries.length < 10) {
          newTTL = 600000; // 10 minutes for low-frequency queries
        }

        await this.connection.executeWrite(
          `MATCH (cache:QueryCache {id: $cacheId})
           SET cache.ttl = $newTTL, cache.optimizedAt = datetime().epochMillis`,
          { cacheId: cache.id, newTTL }
        );
      }

      console.log('🔧 Query cache optimized based on usage patterns');

    } catch (error) {
      console.error('Failed to optimize query cache:', error);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();