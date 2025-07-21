import { getConnection } from '../connection';
import { performanceMonitor } from '../scripts/performance-monitor';

/**
 * Optimized Base Repository with Caching and Performance Monitoring
 * 
 * Provides enhanced database operations with built-in caching,
 * query optimization, and performance monitoring for all repositories.
 */

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
  keyPrefix: string; // Cache key prefix
}

export interface QueryOptions {
  useCache?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
  timeout?: number;
  retries?: number;
  logPerformance?: boolean;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class OptimizedBaseRepository {
  protected connection = getConnection();
  protected repositoryName: string;
  private cache = new Map<string, { data: any; expires: number }>();
  private cacheConfig: CacheConfig;

  constructor(repositoryName: string, cacheConfig?: Partial<CacheConfig>) {
    this.repositoryName = repositoryName;
    this.cacheConfig = {
      ttl: 300000, // 5 minutes default
      maxSize: 1000,
      keyPrefix: repositoryName.toLowerCase(),
      ...cacheConfig
    };

    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  /**
   * Execute query with caching and performance monitoring
   */
  protected async executeOptimizedQuery<T>(
    query: string,
    parameters?: any,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    const queryType = this.extractQueryType(query);
    const cacheKey = options.cacheKey || this.generateCacheKey(query, parameters);

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cached = this.getFromCache<T[]>(cacheKey);
        if (cached) {
          if (options.logPerformance !== false) {
            performanceMonitor.recordQuery(
              `${this.repositoryName}.${queryType}`,
              Date.now() - startTime,
              parameters,
              cached.length,
              ['cache_hit']
            );
          }
          return cached;
        }
      }

      // Execute query with retries
      const result = await this.executeWithRetries<T>(query, parameters, options.retries || 1);

      // Cache the result
      if (options.useCache !== false && result.length > 0) {
        this.setCache(cacheKey, result, options.cacheTTL || this.cacheConfig.ttl);
      }

      // Record performance metrics
      if (options.logPerformance !== false) {
        performanceMonitor.recordQuery(
          `${this.repositoryName}.${queryType}`,
          Date.now() - startTime,
          parameters,
          result.length
        );
      }

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Record failed query
      if (options.logPerformance !== false) {
        performanceMonitor.recordQuery(
          `${this.repositoryName}.${queryType}_ERROR`,
          executionTime,
          parameters,
          0
        );
      }

      throw this.enhanceError(error, query, parameters);
    }
  }

  /**
   * Execute write operation with performance monitoring
   */
  protected async executeOptimizedWrite<T>(
    query: string,
    parameters?: any,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    const queryType = this.extractQueryType(query);

    try {
      const result = await this.executeWithRetries<T>(query, parameters, options.retries || 1);

      // Invalidate related cache entries
      this.invalidateRelatedCache(queryType);

      // Record performance metrics
      if (options.logPerformance !== false) {
        performanceMonitor.recordQuery(
          `${this.repositoryName}.${queryType}`,
          Date.now() - startTime,
          parameters,
          result.length
        );
      }

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Record failed query
      if (options.logPerformance !== false) {
        performanceMonitor.recordQuery(
          `${this.repositoryName}.${queryType}_ERROR`,
          executionTime,
          parameters,
          0
        );
      }

      throw this.enhanceError(error, query, parameters);
    }
  }

  /**
   * Execute paginated query with optimization
   */
  protected async executePaginatedQuery<T>(
    baseQuery: string,
    countQuery: string,
    parameters: any,
    page: number = 1,
    limit: number = 20,
    options: QueryOptions = {}
  ): Promise<PaginationResult<T>> {
    const offset = (page - 1) * limit;
    const paginatedQuery = `${baseQuery} SKIP $offset LIMIT $limit`;
    const paginatedParams = { ...parameters, offset, limit };

    // Execute count and data queries in parallel
    const [totalResult, itemsResult] = await Promise.all([
      this.executeOptimizedQuery<{ count: number }>(countQuery, parameters, {
        ...options,
        cacheKey: options.cacheKey ? `${options.cacheKey}_count` : undefined
      }),
      this.executeOptimizedQuery<T>(paginatedQuery, paginatedParams, {
        ...options,
        cacheKey: options.cacheKey ? `${options.cacheKey}_page_${page}_${limit}` : undefined
      })
    ]);

    const total = totalResult[0]?.count || 0;
    const items = itemsResult;

    return {
      items,
      total,
      page,
      limit,
      hasNext: offset + limit < total,
      hasPrev: page > 1
    };
  }

  /**
   * Bulk insert with optimization
   */
  protected async executeBulkInsert<T>(
    entities: T[],
    createQuery: string,
    batchSize: number = 100
  ): Promise<T[]> {
    const results: T[] = [];
    
    // Process in batches to avoid memory issues
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      
      const batchResult = await this.executeOptimizedWrite<T>(
        createQuery,
        { entities: batch },
        { logPerformance: true }
      );
      
      results.push(...batchResult);
    }

    return results;
  }

  /**
   * Execute query with automatic retries
   */
  private async executeWithRetries<T>(
    query: string,
    parameters?: any,
    maxRetries: number = 1
  ): Promise<T[]> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (query.trim().toUpperCase().startsWith('CREATE') || 
            query.trim().toUpperCase().startsWith('SET') ||
            query.trim().toUpperCase().startsWith('DELETE') ||
            query.trim().toUpperCase().startsWith('MERGE')) {
          return await this.connection.executeWrite<T>(query, parameters);
        } else {
          return await this.connection.executeQuery<T>(query, parameters);
        }
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'TransientError',
      'ServiceUnavailable',
      'ConnectionError',
      'TimeoutError'
    ];

    return retryableErrors.some(errorType => 
      error.name?.includes(errorType) || error.message?.includes(errorType)
    );
  }

  /**
   * Extract query type for monitoring
   */
  private extractQueryType(query: string): string {
    const trimmed = query.trim().toUpperCase();
    
    if (trimmed.startsWith('MATCH')) return 'SELECT';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('MERGE')) return 'UPSERT';
    if (trimmed.startsWith('SET')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CALL')) return 'PROCEDURE';
    if (trimmed.startsWith('SHOW')) return 'SHOW';
    
    return 'UNKNOWN';
  }

  /**
   * Generate cache key from query and parameters
   */
  private generateCacheKey(query: string, parameters?: any): string {
    const queryHash = this.hashString(query);
    const paramHash = parameters ? this.hashString(JSON.stringify(parameters)) : '';
    return `${this.cacheConfig.keyPrefix}:${queryHash}:${paramHash}`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get item from cache
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Set item in cache
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    // Enforce cache size limit
    if (this.cache.size >= this.cacheConfig.maxSize) {
      // Remove oldest entries (simple LRU)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  /**
   * Invalidate cache entries related to a query type
   */
  private invalidateRelatedCache(queryType: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.cache) {
      if (key.startsWith(this.cacheConfig.keyPrefix)) {
        // Invalidate all cache for write operations
        if (['CREATE', 'UPDATE', 'DELETE', 'UPSERT'].includes(queryType)) {
          keysToDelete.push(key);
        }
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, value] of this.cache) {
      if (now > value.expires) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired cache entries for ${this.repositoryName}`);
    }
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(error: any, query: string, parameters?: any): Error {
    const enhancedError = new Error(
      `${this.repositoryName} query failed: ${error.message}`
    );
    
    (enhancedError as any).originalError = error;
    (enhancedError as any).query = query.substring(0, 200) + (query.length > 200 ? '...' : '');
    (enhancedError as any).parameters = parameters;
    (enhancedError as any).repository = this.repositoryName;
    
    return enhancedError;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const memoryUsage = JSON.stringify([...this.cache.entries()]).length;
    
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRate: 0, // Would need hit/miss tracking
      memoryUsage
    };
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log(`🗑️ Cleared all cache for ${this.repositoryName}`);
  }

  /**
   * Warm up cache with common queries
   */
  async warmupCache(queries: Array<{ query: string; parameters?: any; cacheKey?: string }>): Promise<void> {
    console.log(`🔥 Warming up cache for ${this.repositoryName} with ${queries.length} queries`);
    
    const promises = queries.map(({ query, parameters, cacheKey }) =>
      this.executeOptimizedQuery(query, parameters, {
        useCache: true,
        cacheKey,
        logPerformance: false
      }).catch(error => {
        console.warn(`Cache warmup failed for query: ${error.message}`);
      })
    );
    
    await Promise.allSettled(promises);
    console.log(`✅ Cache warmup completed for ${this.repositoryName}`);
  }

  /**
   * Execute query with query hints for optimization
   */
  protected async executeWithHints<T>(
    query: string,
    parameters?: any,
    hints: {
      useIndex?: string;
      joinOrder?: string[];
      plannerHints?: string[];
    } = {}
  ): Promise<T[]> {
    let optimizedQuery = query;

    // Add index hints
    if (hints.useIndex) {
      optimizedQuery = `USING INDEX ${hints.useIndex} ${optimizedQuery}`;
    }

    // Add planner hints
    if (hints.plannerHints && hints.plannerHints.length > 0) {
      const hintString = hints.plannerHints.join(' ');
      optimizedQuery = `${hintString} ${optimizedQuery}`;
    }

    return this.executeOptimizedQuery<T>(optimizedQuery, parameters);
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQuery(query: string, parameters?: any): Promise<{
    executionTime: number;
    resultCount: number;
    indexesUsed: string[];
    suggestions: string[];
  }> {
    const startTime = Date.now();
    
    try {
      // Execute EXPLAIN to get query plan
      const explainQuery = `EXPLAIN ${query}`;
      const explainResult = await this.connection.executeQuery(explainQuery, parameters);
      
      // Execute actual query
      const result = await this.connection.executeQuery(query, parameters);
      const executionTime = Date.now() - startTime;
      
      // Analyze results and generate suggestions
      const suggestions: string[] = [];
      
      if (executionTime > 1000) {
        suggestions.push('Query is slow (>1s). Consider adding indexes or optimizing WHERE clauses.');
      }
      
      if (result.length > 10000) {
        suggestions.push('Large result set. Consider adding pagination or more specific filters.');
      }
      
      return {
        executionTime,
        resultCount: result.length,
        indexesUsed: [], // Would need to parse explain plan
        suggestions
      };
      
    } catch (error) {
      throw this.enhanceError(error, query, parameters);
    }
  }
}