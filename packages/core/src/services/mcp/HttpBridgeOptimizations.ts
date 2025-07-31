/**
 * HTTP Bridge Performance Optimizations
 * 
 * This module provides performance enhancements for the MCP HTTP Bridge
 */

// Simple LRU Cache implementation for HTTP bridge optimization
class SimpleLRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V> = new Map();

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
}

interface RequestCacheEntry {
  response: any;
  timestamp: number;
  requestHash: string;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  threshold: number;
  timeout: number; // Recovery timeout in ms
}

/**
 * Request caching for frequently accessed tools
 */
export class HTTPBridgeCache {
  private cache: SimpleLRUCache<string, RequestCacheEntry>;
  private config: CacheConfig;

  constructor(config: CacheConfig = { maxSize: 1000, ttl: 5 * 60 * 1000 }) { // 5 minutes default
    this.config = config;
    this.cache = new SimpleLRUCache(config.maxSize);
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(method: string, params: any): string {
    const paramsStr = JSON.stringify(params, Object.keys(params).sort());
    return `${method}:${Buffer.from(paramsStr).toString('base64')}`;
  }

  /**
   * Check if request can be cached
   */
  private isCacheable(method: string): boolean {
    const cacheableMethods = [
      'tools/list',
      'resources/list',
      'capabilities/get'
    ];
    return cacheableMethods.includes(method);
  }

  /**
   * Get cached response if available
   */
  get(method: string, params: any): any | null {
    if (!this.isCacheable(method)) {
      return null;
    }

    const key = this.generateCacheKey(method, params);
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < this.config.ttl) {
      return entry.response;
    }

    return null;
  }

  /**
   * Cache response
   */
  set(method: string, params: any, response: any): void {
    if (!this.isCacheable(method)) {
      return;
    }

    const key = this.generateCacheKey(method, params);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      requestHash: key
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize
    };
  }
}

/**
 * Circuit breaker for failing MCP servers
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;

  constructor(
    threshold: number = 5,
    timeout: number = 60000 // 1 minute
  ) {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold,
      timeout
    };
  }

  /**
   * Execute request with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() - this.state.lastFailureTime > this.state.timeout) {
        this.state.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.state.failures = 0;
    this.state.state = 'closed';
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failures >= this.state.threshold) {
      this.state.state = 'open';
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): { state: string; failures: number; isOpen: boolean } {
    return {
      state: this.state.state,
      failures: this.state.failures,
      isOpen: this.state.state === 'open'
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state.failures = 0;
    this.state.lastFailureTime = 0;
    this.state.state = 'closed';
  }
}

/**
 * Rate limiter for API abuse prevention
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowSize: number;
  private maxRequests: number;

  constructor(maxRequests: number = 100, windowSizeMs: number = 60000) { // 100 requests per minute
    this.maxRequests = maxRequests;
    this.windowSize = windowSizeMs;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(timestamp => 
      now - timestamp < this.windowSize
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    
    return true;
  }

  /**
   * Get remaining requests for client
   */
  getRemainingRequests(clientId: string): number {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    const validRequests = clientRequests.filter(timestamp => 
      now - timestamp < this.windowSize
    );

    return Math.max(0, this.maxRequests - validRequests.length);
  }

  /**
   * Get rate limit status
   */
  getStatus(clientId: string): { remaining: number; resetTime: number } {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    const validRequests = clientRequests.filter(t => now - t < this.windowSize);
    const oldestRequest = validRequests.length > 0 ? Math.min(...validRequests) : now;
    
    return {
      remaining: this.getRemainingRequests(clientId),
      resetTime: oldestRequest + this.windowSize
    };
  }
}

/**
 * Connection pool for MCP server processes
 */
export class MCPConnectionPool {
  private activeConnections: Map<string, any> = new Map();
  private connectionQueue: Map<string, Promise<any>> = new Map();
  private maxConnections: number;

  constructor(maxConnections: number = 10) {
    this.maxConnections = maxConnections;
  }

  /**
   * Get or create connection to MCP server
   */
  async getConnection(serverId: string, createFn: () => Promise<any>): Promise<any> {
    // Check if connection already exists
    if (this.activeConnections.has(serverId)) {
      return this.activeConnections.get(serverId);
    }

    // Check if connection is being created
    if (this.connectionQueue.has(serverId)) {
      return await this.connectionQueue.get(serverId);
    }

    // Create new connection
    const connectionPromise = this.createConnection(serverId, createFn);
    this.connectionQueue.set(serverId, connectionPromise);

    try {
      const connection = await connectionPromise;
      this.activeConnections.set(serverId, connection);
      return connection;
    } finally {
      this.connectionQueue.delete(serverId);
    }
  }

  /**
   * Create new connection
   */
  private async createConnection(serverId: string, createFn: () => Promise<any>): Promise<any> {
    if (this.activeConnections.size >= this.maxConnections) {
      // Remove oldest connection
      const oldestKey = this.activeConnections.keys().next().value;
      if (oldestKey !== undefined) {
        this.releaseConnection(oldestKey);
      }
    }

    return await createFn();
  }

  /**
   * Release connection
   */
  releaseConnection(serverId: string): void {
    const connection = this.activeConnections.get(serverId);
    if (connection && typeof connection.close === 'function') {
      connection.close();
    }
    this.activeConnections.delete(serverId);
  }

  /**
   * Get pool statistics
   */
  getStats(): { activeConnections: number; maxConnections: number; queuedConnections: number } {
    return {
      activeConnections: this.activeConnections.size,
      maxConnections: this.maxConnections,
      queuedConnections: this.connectionQueue.size
    };
  }
}

/**
 * JSON optimization utilities
 */
export class JSONOptimizer {
  /**
   * Fast JSON parsing with error handling
   */
  static safeParse(jsonString: string): any | null {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('JSON parsing error:', error);
      return null;
    }
  }

  /**
   * Optimized JSON stringification
   */
  static stringify(obj: any): string {
    try {
      return JSON.stringify(obj, null, 0); // No indentation for performance
    } catch (error) {
      console.error('JSON stringification error:', error);
      return '{}';
    }
  }

  /**
   * Compress response data
   */
  static compressResponse(response: any): any {
    // Remove null/undefined values
    if (typeof response === 'object' && response !== null) {
      const compressed: any = Array.isArray(response) ? [] : {};
      
      for (const [key, value] of Object.entries(response)) {
        if (value !== null && value !== undefined) {
          compressed[key] = typeof value === 'object' ? this.compressResponse(value) : value;
        }
      }
      
      return compressed;
    }
    
    return response;
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private metrics: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();

  /**
   * Start timing an operation
   */
  startTiming(operationName: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.recordMetric(operationName, duration);
    };
  }

  /**
   * Record metric
   */
  private recordMetric(operationName: string, duration: number): void {
    const existing = this.metrics.get(operationName) || { count: 0, totalTime: 0, avgTime: 0 };
    existing.count++;
    existing.totalTime += duration;
    existing.avgTime = existing.totalTime / existing.count;
    
    this.metrics.set(operationName, existing);
  }

  /**
   * Get all metrics
   */
  getMetrics(): Record<string, { count: number; totalTime: number; avgTime: number }> {
    const result: Record<string, any> = {};
    for (const [name, metric] of this.metrics) {
      result[name] = { ...metric };
    }
    return result;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
  }
}

// Export optimized HTTP bridge configuration
export const OPTIMIZED_HTTP_BRIDGE_CONFIG = {
  cache: {
    maxSize: 1000,
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  circuitBreaker: {
    threshold: 5,
    timeout: 60000 // 1 minute
  },
  rateLimiter: {
    maxRequests: 100,
    windowSizeMs: 60000 // 1 minute
  },
  connectionPool: {
    maxConnections: 10
  },
  performance: {
    enableMetrics: true,
    enableCompression: true
  }
};