/**
 * Performance Optimizer for MCP Tools
 * 
 * Optimizes MCP tool usage through caching, batching, and intelligent routing
 */

import { MCPToolGateway } from '@starships/core';
import { LRUCache } from 'lru-cache';
import { ToolUsageAnalytics, ToolInvocationEvent } from './ToolUsageAnalytics';

interface CacheConfig {
  maxSize: number;
  ttl: number;
  updateOnGet?: boolean;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  enabledTools: string[];
}

interface OptimizationConfig {
  caching: {
    enabled: boolean;
    configs: Map<string, CacheConfig>;
  };
  batching: {
    enabled: boolean;
    config: BatchConfig;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

export class PerformanceOptimizer {
  private caches: Map<string, LRUCache<string, any>> = new Map();
  private batchQueues: Map<string, BatchQueue> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private analytics: ToolUsageAnalytics;
  private config: OptimizationConfig;

  constructor(
    private gateway: MCPToolGateway,
    analytics: ToolUsageAnalytics,
    config: Partial<OptimizationConfig> = {}
  ) {
    this.analytics = analytics;
    this.config = this.mergeConfig(config);
    this.initializeOptimizations();
  }

  /**
   * Optimized tool invocation
   */
  async invokeTool(
    starshipId: string,
    toolName: string,
    params: any,
    options: { bypassCache?: boolean; priority?: 'high' | 'normal' | 'low' } = {}
  ): Promise<any> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    let result: any;

    try {
      // Check rate limits
      if (this.config.rateLimit.enabled) {
        const rateLimiter = this.getRateLimiter(toolName);
        if (!rateLimiter.tryAcquire()) {
          throw new Error('Rate limit exceeded');
        }
      }

      // Check circuit breaker
      if (this.config.circuitBreaker.enabled) {
        const breaker = this.getCircuitBreaker(toolName);
        if (!breaker.canExecute()) {
          throw new Error('Circuit breaker is open');
        }
      }

      // Check cache
      if (this.config.caching.enabled && !options.bypassCache) {
        const cached = this.getCachedResult(toolName, params);
        if (cached !== undefined) {
          result = cached;
          this.recordCacheHit(toolName);
          return result;
        }
      }

      // Check if tool supports batching
      if (this.config.batching.enabled && this.supportsBatching(toolName)) {
        result = await this.batchInvocation(starshipId, toolName, params);
      } else {
        // Direct invocation
        result = await this.gateway.invokeTool(starshipId, toolName, params);
      }

      // Update cache
      if (this.config.caching.enabled && result.success) {
        this.setCachedResult(toolName, params, result);
      }

      // Update circuit breaker
      if (this.config.circuitBreaker.enabled) {
        this.getCircuitBreaker(toolName).recordSuccess();
      }

    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      // Update circuit breaker
      if (this.config.circuitBreaker.enabled) {
        this.getCircuitBreaker(toolName).recordFailure();
      }

      throw err;
    } finally {
      // Record analytics
      const event: ToolInvocationEvent = {
        starshipId,
        agentId: 'unknown', // Would need to be passed in
        toolName,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        success,
        error,
        inputSize: JSON.stringify(params).length,
        outputSize: result ? JSON.stringify(result).length : 0
      };
      
      this.analytics.recordInvocation(event);
    }

    return result;
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): OptimizationStats {
    const stats: OptimizationStats = {
      caching: {
        hitRate: this.calculateCacheHitRate(),
        totalHits: this.getTotalCacheHits(),
        totalMisses: this.getTotalCacheMisses(),
        memorySaved: this.calculateMemorySaved()
      },
      batching: {
        totalBatches: this.getTotalBatches(),
        averageBatchSize: this.getAverageBatchSize(),
        latencySaved: this.calculateBatchingLatencySaved()
      },
      circuitBreaker: {
        openCircuits: this.getOpenCircuits(),
        totalTrips: this.getTotalCircuitTrips()
      },
      rateLimit: {
        throttledRequests: this.getThrottledRequests(),
        averageUtilization: this.getAverageRateLimitUtilization()
      }
    };

    return stats;
  }

  /**
   * Update optimization configuration dynamically
   */
  updateConfig(updates: Partial<OptimizationConfig>): void {
    this.config = this.mergeConfig(updates);
    this.reinitializeOptimizations();
  }

  /**
   * Clear all caches
   */
  clearCaches(toolName?: string): void {
    if (toolName) {
      this.caches.get(toolName)?.clear();
    } else {
      this.caches.forEach(cache => cache.clear());
    }
  }

  private initializeOptimizations(): void {
    // Initialize caches
    if (this.config.caching.enabled) {
      this.config.caching.configs.forEach((config, toolName) => {
        this.caches.set(toolName, new LRUCache({
          max: config.maxSize,
          ttl: config.ttl,
          updateAgeOnGet: config.updateOnGet
        }));
      });
    }

    // Initialize batch queues
    if (this.config.batching.enabled) {
      this.config.batching.config.enabledTools.forEach(toolName => {
        this.batchQueues.set(toolName, new BatchQueue(
          toolName,
          this.config.batching.config.maxBatchSize,
          this.config.batching.config.maxWaitTime,
          this.processBatch.bind(this)
        ));
      });
    }

    // Initialize circuit breakers
    if (this.config.circuitBreaker.enabled) {
      // Circuit breakers are created on demand
    }

    // Initialize rate limiters
    if (this.config.rateLimit.enabled) {
      // Rate limiters are created on demand
    }
  }

  private reinitializeOptimizations(): void {
    // Clear existing optimizations
    this.caches.clear();
    this.batchQueues.forEach(queue => queue.stop());
    this.batchQueues.clear();
    this.circuitBreakers.clear();
    this.rateLimiters.clear();

    // Reinitialize
    this.initializeOptimizations();
  }

  private getCachedResult(toolName: string, params: any): any {
    const cache = this.caches.get(toolName);
    if (!cache) return undefined;

    const key = this.generateCacheKey(params);
    return cache.get(key);
  }

  private setCachedResult(toolName: string, params: any, result: any): void {
    const cache = this.caches.get(toolName);
    if (!cache) return;

    const key = this.generateCacheKey(params);
    cache.set(key, result);
  }

  private generateCacheKey(params: any): string {
    return JSON.stringify(params);
  }

  private supportsBatching(toolName: string): boolean {
    return this.config.batching.config.enabledTools.includes(toolName);
  }

  private async batchInvocation(
    starshipId: string,
    toolName: string,
    params: any
  ): Promise<any> {
    const queue = this.batchQueues.get(toolName);
    if (!queue) {
      return this.gateway.invokeTool(starshipId, toolName, params);
    }

    return queue.add({ starshipId, params });
  }

  private async processBatch(
    toolName: string,
    items: Array<{ starshipId: string; params: any; resolve: (value: any) => void; reject: (error: any) => void }>
  ): Promise<void> {
    try {
      // Group by starshipId for efficiency
      const groups = new Map<string, typeof items>();
      items.forEach(item => {
        if (!groups.has(item.starshipId)) {
          groups.set(item.starshipId, []);
        }
        groups.get(item.starshipId)!.push(item);
      });

      // Process each group
      for (const [starshipId, groupItems] of groups) {
        const batchParams = groupItems.map(item => item.params);
        
        // Invoke batch operation
        const results = await this.gateway.invokeTool(starshipId, `${toolName}_batch`, {
          batch: batchParams
        });

        // Distribute results
        if (Array.isArray(results)) {
          groupItems.forEach((item, index) => {
            item.resolve(results[index]);
          });
        } else {
          // Fallback to individual calls
          for (const item of groupItems) {
            try {
              const result = await this.gateway.invokeTool(starshipId, toolName, item.params);
              item.resolve(result);
            } catch (error) {
              item.reject(error);
            }
          }
        }
      }
    } catch (error) {
      items.forEach(item => item.reject(error));
    }
  }

  private getCircuitBreaker(toolName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(toolName)) {
      this.circuitBreakers.set(toolName, new CircuitBreaker(
        this.config.circuitBreaker.failureThreshold,
        this.config.circuitBreaker.resetTimeout
      ));
    }
    return this.circuitBreakers.get(toolName)!;
  }

  private getRateLimiter(toolName: string): RateLimiter {
    if (!this.rateLimiters.has(toolName)) {
      this.rateLimiters.set(toolName, new RateLimiter(
        this.config.rateLimit.maxRequests,
        this.config.rateLimit.windowMs
      ));
    }
    return this.rateLimiters.get(toolName)!;
  }

  private mergeConfig(partial: Partial<OptimizationConfig>): OptimizationConfig {
    const defaultConfig: OptimizationConfig = {
      caching: {
        enabled: true,
        configs: new Map([
          ['sequentialthinking', { maxSize: 100, ttl: 300000 }],
          ['memory', { maxSize: 500, ttl: 600000 }]
        ])
      },
      batching: {
        enabled: true,
        config: {
          maxBatchSize: 10,
          maxWaitTime: 100,
          enabledTools: ['memory', 'evaluate']
        }
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000
      },
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        windowMs: 60000
      }
    };

    return {
      caching: { ...defaultConfig.caching, ...partial.caching },
      batching: { ...defaultConfig.batching, ...partial.batching },
      circuitBreaker: { ...defaultConfig.circuitBreaker, ...partial.circuitBreaker },
      rateLimit: { ...defaultConfig.rateLimit, ...partial.rateLimit }
    };
  }

  // Statistics calculation methods
  private cacheHits = 0;
  private cacheMisses = 0;

  private recordCacheHit(toolName: string): void {
    this.cacheHits++;
  }

  private calculateCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? this.cacheHits / total : 0;
  }

  private getTotalCacheHits(): number {
    return this.cacheHits;
  }

  private getTotalCacheMisses(): number {
    return this.cacheMisses;
  }

  private calculateMemorySaved(): number {
    // Estimate based on cache hits and average response size
    return this.cacheHits * 1024; // Rough estimate
  }

  private getTotalBatches(): number {
    let total = 0;
    this.batchQueues.forEach(queue => {
      total += queue.getBatchCount();
    });
    return total;
  }

  private getAverageBatchSize(): number {
    let totalSize = 0;
    let totalBatches = 0;
    
    this.batchQueues.forEach(queue => {
      const stats = queue.getStats();
      totalSize += stats.totalItems;
      totalBatches += stats.batchCount;
    });

    return totalBatches > 0 ? totalSize / totalBatches : 0;
  }

  private calculateBatchingLatencySaved(): number {
    // Estimate based on batch count and average latency
    return this.getTotalBatches() * 50; // 50ms saved per batch
  }

  private getOpenCircuits(): number {
    let count = 0;
    this.circuitBreakers.forEach(breaker => {
      if (!breaker.canExecute()) count++;
    });
    return count;
  }

  private getTotalCircuitTrips(): number {
    let total = 0;
    this.circuitBreakers.forEach(breaker => {
      total += breaker.getTrips();
    });
    return total;
  }

  private getThrottledRequests(): number {
    let total = 0;
    this.rateLimiters.forEach(limiter => {
      total += limiter.getThrottledCount();
    });
    return total;
  }

  private getAverageRateLimitUtilization(): number {
    let totalUtilization = 0;
    let count = 0;
    
    this.rateLimiters.forEach(limiter => {
      totalUtilization += limiter.getUtilization();
      count++;
    });

    return count > 0 ? totalUtilization / count : 0;
  }
}

/**
 * Batch Queue for grouping tool invocations
 */
class BatchQueue {
  private queue: Array<{
    starshipId: string;
    params: any;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private timer: NodeJS.Timeout | null = null;
  private batchCount = 0;
  private totalItems = 0;

  constructor(
    private toolName: string,
    private maxBatchSize: number,
    private maxWaitTime: number,
    private processBatch: (toolName: string, items: Array<{ starshipId: string; params: any; resolve: (value: any) => void; reject: (error: any) => void }>) => Promise<void>
  ) {}

  async add(item: { starshipId: string; params: any }): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...item, resolve, reject });
      this.totalItems++;

      if (this.queue.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];
    this.batchCount++;

    await this.processBatch(this.toolName, batch);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  getBatchCount(): number {
    return this.batchCount;
  }

  getStats(): { batchCount: number; totalItems: number } {
    return { batchCount: this.batchCount, totalItems: this.totalItems };
  }
}

/**
 * Circuit Breaker for fault tolerance
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private trips = 0;

  constructor(
    private failureThreshold: number,
    private resetTimeout: number
  ) {}

  canExecute(): boolean {
    if (this.state === 'closed') return true;
    
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }

    return true; // half-open
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.trips++;
    }
  }

  getTrips(): number {
    return this.trips;
  }
}

/**
 * Rate Limiter for controlling request rate
 */
class RateLimiter {
  private requests: number[] = [];
  private throttledCount = 0;

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  tryAcquire(): boolean {
    const now = Date.now();
    
    // Remove old requests
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    this.throttledCount++;
    return false;
  }

  getThrottledCount(): number {
    return this.throttledCount;
  }

  getUtilization(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length / this.maxRequests;
  }
}

// Type definitions
export interface OptimizationStats {
  caching: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    memorySaved: number;
  };
  batching: {
    totalBatches: number;
    averageBatchSize: number;
    latencySaved: number;
  };
  circuitBreaker: {
    openCircuits: number;
    totalTrips: number;
  };
  rateLimit: {
    throttledRequests: number;
    averageUtilization: number;
  };
}