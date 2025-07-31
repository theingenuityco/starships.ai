/**
 * Tool Usage Analytics for MCP Tools
 * 
 * Tracks and analyzes MCP tool usage patterns across agents
 */

import { MCPToolGateway } from '@starships/core';
import { EventEmitter } from 'events';

export interface ToolUsageMetrics {
  toolName: string;
  invocationCount: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  lastUsed: Date;
  errorPatterns: Map<string, number>;
}

export interface ToolInvocationEvent {
  starshipId: string;
  agentId: string;
  toolName: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
  inputSize: number;
  outputSize: number;
}

export interface UsagePattern {
  pattern: string;
  frequency: number;
  avgSuccessRate: number;
  commonErrors: string[];
  recommendations: string[];
}

export class ToolUsageAnalytics extends EventEmitter {
  private metrics: Map<string, ToolUsageMetrics> = new Map();
  private invocationHistory: ToolInvocationEvent[] = [];
  private patternAnalyzer: PatternAnalyzer;
  private readonly maxHistorySize = 10000;

  constructor() {
    super();
    this.patternAnalyzer = new PatternAnalyzer();
  }

  /**
   * Record a tool invocation
   */
  recordInvocation(event: ToolInvocationEvent): void {
    // Update metrics
    const metrics = this.getOrCreateMetrics(event.toolName);
    metrics.invocationCount++;
    
    if (event.success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
      if (event.error) {
        const errorCount = metrics.errorPatterns.get(event.error) || 0;
        metrics.errorPatterns.set(event.error, errorCount + 1);
      }
    }

    // Update latency metrics
    const latencies = this.getLatenciesForTool(event.toolName);
    latencies.push(event.duration);
    metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    metrics.maxLatency = Math.max(...latencies);
    metrics.minLatency = Math.min(...latencies);
    metrics.lastUsed = event.timestamp;

    // Add to history
    this.invocationHistory.push(event);
    if (this.invocationHistory.length > this.maxHistorySize) {
      this.invocationHistory.shift();
    }

    // Emit event
    this.emit('invocation', event);

    // Check for anomalies
    this.checkForAnomalies(event);
  }

  /**
   * Get usage metrics for a specific tool
   */
  getToolMetrics(toolName: string): ToolUsageMetrics | undefined {
    return this.metrics.get(toolName);
  }

  /**
   * Get all tool metrics
   */
  getAllMetrics(): Map<string, ToolUsageMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get usage patterns
   */
  getUsagePatterns(starshipId?: string): UsagePattern[] {
    const relevantHistory = starshipId
      ? this.invocationHistory.filter(event => event.starshipId === starshipId)
      : this.invocationHistory;

    return this.patternAnalyzer.analyzePatterns(relevantHistory);
  }

  /**
   * Get tool performance report
   */
  getPerformanceReport(timeWindow?: { start: Date; end: Date }): PerformanceReport {
    const filteredHistory = timeWindow
      ? this.invocationHistory.filter(
          event => event.timestamp >= timeWindow.start && event.timestamp <= timeWindow.end
        )
      : this.invocationHistory;

    return {
      totalInvocations: filteredHistory.length,
      successRate: this.calculateSuccessRate(filteredHistory),
      averageLatency: this.calculateAverageLatency(filteredHistory),
      topTools: this.getTopTools(filteredHistory),
      errorSummary: this.getErrorSummary(filteredHistory),
      performanceTrends: this.calculatePerformanceTrends(filteredHistory)
    };
  }

  /**
   * Get recommendations for tool usage optimization
   */
  getOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Check for high-latency tools
    this.metrics.forEach((metrics, toolName) => {
      if (metrics.averageLatency > 5000) {
        recommendations.push({
          type: 'performance',
          severity: 'high',
          tool: toolName,
          message: `Tool ${toolName} has high average latency (${metrics.averageLatency}ms)`,
          suggestion: 'Consider caching results or optimizing the tool implementation'
        });
      }
    });

    // Check for low success rates
    this.metrics.forEach((metrics, toolName) => {
      const successRate = metrics.successCount / metrics.invocationCount;
      if (successRate < 0.8) {
        recommendations.push({
          type: 'reliability',
          severity: 'medium',
          tool: toolName,
          message: `Tool ${toolName} has low success rate (${(successRate * 100).toFixed(1)}%)`,
          suggestion: 'Review error patterns and improve error handling'
        });
      }
    });

    // Check for underutilized tools
    const avgInvocations = this.calculateAverageInvocations();
    this.metrics.forEach((metrics, toolName) => {
      if (metrics.invocationCount < avgInvocations * 0.1) {
        recommendations.push({
          type: 'utilization',
          severity: 'low',
          tool: toolName,
          message: `Tool ${toolName} is underutilized`,
          suggestion: 'Consider if this tool is necessary or needs better documentation'
        });
      }
    });

    return recommendations;
  }

  private getOrCreateMetrics(toolName: string): ToolUsageMetrics {
    if (!this.metrics.has(toolName)) {
      this.metrics.set(toolName, {
        toolName,
        invocationCount: 0,
        successCount: 0,
        failureCount: 0,
        averageLatency: 0,
        maxLatency: 0,
        minLatency: Infinity,
        lastUsed: new Date(),
        errorPatterns: new Map()
      });
    }
    return this.metrics.get(toolName)!;
  }

  private getLatenciesForTool(toolName: string): number[] {
    return this.invocationHistory
      .filter(event => event.toolName === toolName)
      .map(event => event.duration);
  }

  private checkForAnomalies(event: ToolInvocationEvent): void {
    const metrics = this.metrics.get(event.toolName);
    if (!metrics) return;

    // Check for latency anomaly
    if (event.duration > metrics.averageLatency * 3) {
      this.emit('anomaly', {
        type: 'high_latency',
        tool: event.toolName,
        value: event.duration,
        threshold: metrics.averageLatency * 3,
        event
      });
    }

    // Check for error spike
    const recentErrors = this.invocationHistory
      .filter(e => e.toolName === event.toolName && !e.success)
      .filter(e => e.timestamp > new Date(Date.now() - 60000)); // Last minute

    if (recentErrors.length > 5) {
      this.emit('anomaly', {
        type: 'error_spike',
        tool: event.toolName,
        value: recentErrors.length,
        threshold: 5,
        event
      });
    }
  }

  private calculateSuccessRate(events: ToolInvocationEvent[]): number {
    if (events.length === 0) return 0;
    const successCount = events.filter(e => e.success).length;
    return successCount / events.length;
  }

  private calculateAverageLatency(events: ToolInvocationEvent[]): number {
    if (events.length === 0) return 0;
    const totalLatency = events.reduce((sum, e) => sum + e.duration, 0);
    return totalLatency / events.length;
  }

  private getTopTools(events: ToolInvocationEvent[]): Array<{ tool: string; count: number }> {
    const toolCounts = new Map<string, number>();
    events.forEach(event => {
      toolCounts.set(event.toolName, (toolCounts.get(event.toolName) || 0) + 1);
    });

    return Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getErrorSummary(events: ToolInvocationEvent[]): Map<string, number> {
    const errorCounts = new Map<string, number>();
    events
      .filter(e => !e.success && e.error)
      .forEach(event => {
        errorCounts.set(event.error!, (errorCounts.get(event.error!) || 0) + 1);
      });
    return errorCounts;
  }

  private calculatePerformanceTrends(events: ToolInvocationEvent[]): PerformanceTrend[] {
    // Group events by hour
    const hourlyGroups = new Map<string, ToolInvocationEvent[]>();
    
    events.forEach(event => {
      const hourKey = new Date(event.timestamp).toISOString().slice(0, 13);
      if (!hourlyGroups.has(hourKey)) {
        hourlyGroups.set(hourKey, []);
      }
      hourlyGroups.get(hourKey)!.push(event);
    });

    return Array.from(hourlyGroups.entries())
      .map(([hour, hourEvents]) => ({
        timestamp: new Date(hour + ':00:00Z'),
        invocationCount: hourEvents.length,
        successRate: this.calculateSuccessRate(hourEvents),
        averageLatency: this.calculateAverageLatency(hourEvents)
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateAverageInvocations(): number {
    const totalInvocations = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + m.invocationCount, 0);
    return totalInvocations / this.metrics.size;
  }
}

/**
 * Pattern Analyzer for identifying usage patterns
 */
class PatternAnalyzer {
  analyzePatterns(events: ToolInvocationEvent[]): UsagePattern[] {
    const patterns: UsagePattern[] = [];

    // Analyze sequential tool usage
    const sequentialPatterns = this.findSequentialPatterns(events);
    patterns.push(...sequentialPatterns);

    // Analyze temporal patterns
    const temporalPatterns = this.findTemporalPatterns(events);
    patterns.push(...temporalPatterns);

    // Analyze error patterns
    const errorPatterns = this.findErrorPatterns(events);
    patterns.push(...errorPatterns);

    return patterns;
  }

  private findSequentialPatterns(events: ToolInvocationEvent[]): UsagePattern[] {
    const patterns: UsagePattern[] = [];
    const sequences = new Map<string, number>();

    // Find common tool sequences
    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].starshipId === events[i + 1].starshipId) {
        const sequence = `${events[i].toolName} → ${events[i + 1].toolName}`;
        sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
      }
    }

    // Convert to patterns
    sequences.forEach((count, sequence) => {
      if (count > 5) {
        patterns.push({
          pattern: sequence,
          frequency: count,
          avgSuccessRate: this.calculateSequenceSuccessRate(sequence, events),
          commonErrors: [],
          recommendations: [`Consider creating a combined tool for ${sequence}`]
        });
      }
    });

    return patterns;
  }

  private findTemporalPatterns(events: ToolInvocationEvent[]): UsagePattern[] {
    // Analyze usage by time of day, day of week, etc.
    return [];
  }

  private findErrorPatterns(events: ToolInvocationEvent[]): UsagePattern[] {
    const errorGroups = new Map<string, ToolInvocationEvent[]>();
    
    events
      .filter(e => !e.success && e.error)
      .forEach(event => {
        const key = `${event.toolName}:${event.error}`;
        if (!errorGroups.has(key)) {
          errorGroups.set(key, []);
        }
        errorGroups.get(key)!.push(event);
      });

    return Array.from(errorGroups.entries())
      .filter(([, events]) => events.length > 3)
      .map(([key, events]) => {
        const [toolName, error] = key.split(':');
        return {
          pattern: `Error in ${toolName}`,
          frequency: events.length,
          avgSuccessRate: 0,
          commonErrors: [error],
          recommendations: [`Investigate recurring error: ${error}`]
        };
      });
  }

  private calculateSequenceSuccessRate(sequence: string, events: ToolInvocationEvent[]): number {
    const [tool1, tool2] = sequence.split(' → ');
    let totalSequences = 0;
    let successfulSequences = 0;

    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].toolName === tool1 && events[i + 1].toolName === tool2 &&
          events[i].starshipId === events[i + 1].starshipId) {
        totalSequences++;
        if (events[i].success && events[i + 1].success) {
          successfulSequences++;
        }
      }
    }

    return totalSequences > 0 ? successfulSequences / totalSequences : 0;
  }
}

// Type definitions
interface PerformanceReport {
  totalInvocations: number;
  successRate: number;
  averageLatency: number;
  topTools: Array<{ tool: string; count: number }>;
  errorSummary: Map<string, number>;
  performanceTrends: PerformanceTrend[];
}

interface PerformanceTrend {
  timestamp: Date;
  invocationCount: number;
  successRate: number;
  averageLatency: number;
}

interface OptimizationRecommendation {
  type: 'performance' | 'reliability' | 'utilization';
  severity: 'low' | 'medium' | 'high';
  tool: string;
  message: string;
  suggestion: string;
}