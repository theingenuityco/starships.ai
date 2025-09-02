/**
 * Simple Performance Monitor
 * Provides basic performance tracking for database operations
 */

export interface QueryMetrics {
  operation: string;
  duration: number;
  parameters?: any;
  resultCount: number;
  tags?: string[];
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics

  /**
   * Record a database query performance metric
   */
  recordQuery(
    operation: string,
    duration: number,
    parameters?: any,
    resultCount: number = 0,
    tags?: string[]
  ): void {
    const metric: QueryMetrics = {
      operation,
      duration,
      parameters,
      resultCount,
      tags,
      timestamp: Date.now(),
    };

    // Keep only the most recent metrics - ensure we don't exceed maxMetrics
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics = this.metrics.slice(-(this.maxMetrics - 1));
    }
    
    this.metrics.push(metric);

    // Log slow queries
    if (duration > 1000) {
      console.warn(`🐌 Slow query detected: ${operation} took ${duration}ms`);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalQueries: number;
    averageDuration: number;
    slowQueries: number;
    recentQueries: QueryMetrics[];
  } {
    if (this.metrics.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        recentQueries: [],
      };
    }

    const totalDuration = this.metrics.reduce((sum, metric) => sum + metric.duration, 0);
    const averageDuration = totalDuration / this.metrics.length;
    const slowQueries = this.metrics.filter((metric) => metric.duration > 1000).length;

    return {
      totalQueries: this.metrics.length,
      averageDuration: Math.round(averageDuration),
      slowQueries,
      recentQueries: this.metrics.slice(-10), // Last 10 queries
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get metrics for a specific operation
   */
  getMetricsForOperation(operation: string): QueryMetrics[] {
    return this.metrics.filter((metric) => metric.operation === operation);
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();