/**
 * Performance Monitor for Parallel Execution
 * 
 * Tracks execution metrics and provides optimization suggestions
 */

export interface PerformanceMetrics {
  timestamp: Date;
  activeTasks: number;
  completedTasks: number;
  throughput: number;
  resourceUtilization: Record<string, number>;
}

interface OptimizationSuggestion {
  type: 'increase-concurrency' | 'rebalance-load' | 'priority-adjustment';
  value: number;
  reason: string;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private startTime: Date;
  private bottlenecks: string[] = [];
  private maxMetricsHistory = 100;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Record performance metrics
   */
  recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }
    
    // Analyze for bottlenecks
    this.analyzeBottlenecks(metrics);
  }

  /**
   * Analyze for performance bottlenecks
   */
  private analyzeBottlenecks(currentMetrics: PerformanceMetrics): void {
    this.bottlenecks = [];
    
    // Check for low throughput
    if (currentMetrics.throughput < 0.5 && currentMetrics.activeTasks > 0) {
      this.bottlenecks.push('Low throughput detected');
    }
    
    // Check for resource imbalance
    const utilizations = Object.values(currentMetrics.resourceUtilization);
    const avgUtilization = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
    const maxUtilization = Math.max(...utilizations);
    const minUtilization = Math.min(...utilizations);
    
    if (maxUtilization - minUtilization > 50) {
      this.bottlenecks.push('Resource utilization imbalance detected');
    }
    
    // Check for underutilization
    if (avgUtilization < 30 && currentMetrics.activeTasks < currentMetrics.completedTasks) {
      this.bottlenecks.push('Overall resource underutilization');
    }
  }

  /**
   * Identify current bottlenecks
   */
  identifyBottlenecks(): string[] {
    return [...this.bottlenecks];
  }

  /**
   * Suggest optimizations based on current state
   */
  suggestOptimizations(state: any): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    
    if (this.metrics.length < 2) {
      return suggestions;
    }
    
    const currentMetrics = this.metrics[this.metrics.length - 1];
    const previousMetrics = this.metrics[this.metrics.length - 2];
    
    // Check if we can increase concurrency
    const avgUtilization = this.calculateAverageUtilization(currentMetrics.resourceUtilization);
    if (avgUtilization < 50 && state.activeTasks > 0) {
      suggestions.push({
        type: 'increase-concurrency',
        value: Math.ceil((100 - avgUtilization) / 20),
        reason: `Average utilization is only ${avgUtilization.toFixed(1)}%`
      });
    }
    
    // Check for load imbalance
    const imbalance = this.calculateLoadImbalance(currentMetrics.resourceUtilization);
    if (imbalance > 30) {
      suggestions.push({
        type: 'rebalance-load',
        value: imbalance,
        reason: `Load imbalance of ${imbalance.toFixed(1)}% detected`
      });
    }
    
    // Check if throughput is declining
    if (currentMetrics.throughput < previousMetrics.throughput * 0.8) {
      suggestions.push({
        type: 'priority-adjustment',
        value: 1,
        reason: 'Throughput declining, consider adjusting task priorities'
      });
    }
    
    return suggestions;
  }

  /**
   * Calculate average resource utilization
   */
  private calculateAverageUtilization(utilization: Record<string, number>): number {
    const values = Object.values(utilization);
    if (values.length === 0) return 0;
    return values.reduce((sum, u) => sum + u, 0) / values.length;
  }

  /**
   * Calculate load imbalance percentage
   */
  private calculateLoadImbalance(utilization: Record<string, number>): number {
    const values = Object.values(utilization);
    if (values.length < 2) return 0;
    
    const max = Math.max(...values);
    const min = Math.min(...values);
    return max - min;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.metrics.length === 0) {
      return {
        averageThroughput: 0,
        averageUtilization: 0,
        totalTime: 0,
        bottlenecks: []
      };
    }
    
    const totalThroughput = this.metrics.reduce((sum, m) => sum + m.throughput, 0);
    const totalUtilization = this.metrics.reduce((sum, m) => 
      sum + this.calculateAverageUtilization(m.resourceUtilization), 0
    );
    
    return {
      averageThroughput: totalThroughput / this.metrics.length,
      averageUtilization: totalUtilization / this.metrics.length,
      totalTime: (Date.now() - this.startTime.getTime()) / 60000, // in minutes
      bottlenecks: this.bottlenecks
    };
  }

  /**
   * Get metrics history
   */
  getMetrics() {
    return {
      history: this.metrics,
      summary: this.getPerformanceSummary(),
      startTime: this.startTime,
      dataPoints: this.metrics.length
    };
  }

  /**
   * Get start time
   */
  getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Reset monitor
   */
  reset(): void {
    this.metrics = [];
    this.startTime = new Date();
    this.bottlenecks = [];
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends() {
    if (this.metrics.length < 5) {
      return {
        throughputTrend: 'insufficient-data',
        utilizationTrend: 'insufficient-data',
        recommendation: 'Collect more data points'
      };
    }
    
    // Analyze recent vs older metrics
    const recentMetrics = this.metrics.slice(-5);
    const olderMetrics = this.metrics.slice(-10, -5);
    
    const recentThroughput = recentMetrics.reduce((sum, m) => sum + m.throughput, 0) / recentMetrics.length;
    const olderThroughput = olderMetrics.reduce((sum, m) => sum + m.throughput, 0) / olderMetrics.length;
    
    const throughputTrend = recentThroughput > olderThroughput * 1.1 ? 'improving' :
                          recentThroughput < olderThroughput * 0.9 ? 'declining' : 'stable';
    
    const recentUtilization = recentMetrics.reduce((sum, m) => 
      sum + this.calculateAverageUtilization(m.resourceUtilization), 0
    ) / recentMetrics.length;
    
    const olderUtilization = olderMetrics.reduce((sum, m) => 
      sum + this.calculateAverageUtilization(m.resourceUtilization), 0
    ) / olderMetrics.length;
    
    const utilizationTrend = recentUtilization > olderUtilization * 1.1 ? 'increasing' :
                           recentUtilization < olderUtilization * 0.9 ? 'decreasing' : 'stable';
    
    let recommendation = 'Performance is stable';
    if (throughputTrend === 'declining' && utilizationTrend === 'increasing') {
      recommendation = 'Consider adding more resources or optimizing task execution';
    } else if (throughputTrend === 'improving' && utilizationTrend === 'decreasing') {
      recommendation = 'Efficiency is improving, consider increasing task load';
    }
    
    return {
      throughputTrend,
      utilizationTrend,
      recommendation
    };
  }
}