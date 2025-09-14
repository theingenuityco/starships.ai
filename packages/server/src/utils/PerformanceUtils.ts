/**
 * Performance utility functions for server services
 * Provides debouncing, memoization, and caching capabilities
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

interface DebouncedFunction<T extends any[]> {
  (...args: T): Promise<any>;
  cancel(): void;
  flush(): Promise<any>;
}

/**
 * Creates a debounced version of a function that delays execution until after
 * the specified delay has passed since the last invocation
 */
export function debounce<T extends any[]>(func: (...args: T) => Promise<any>, delay: number): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: T;
  let latestResolve: (value: any) => void;
  let latestReject: (reason?: any) => void;

  const debouncedFunc = (...args: T): Promise<any> => {
    latestArgs = args;

    return new Promise((resolve, reject) => {
      latestResolve = resolve;
      latestReject = reject;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...latestArgs);
          latestResolve(result);
        } catch (error) {
          latestReject(error);
        }
      }, delay);
    });
  };

  debouncedFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debouncedFunc.flush = async (): Promise<any> => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      return await func(...latestArgs);
    }
    return Promise.resolve();
  };

  return debouncedFunc;
}

/**
 * Creates a memoized version of a function that caches results based on arguments
 * Uses JSON.stringify for key generation, so only works with serializable arguments
 */
export class Memoizer<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 300000) {
    // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  /**
   * Memoizes a function with optional TTL (time to live)
   */
  memoize<Args extends any[]>(
    func: (...args: Args) => Promise<T>,
    options: { ttl?: number; keyGenerator?: (...args: Args) => string } = {}
  ): (...args: Args) => Promise<T> {
    const { ttl = this.defaultTTL, keyGenerator } = options;

    return async (...args: Args): Promise<T> => {
      const key = keyGenerator ? keyGenerator(...args) : this.generateKey(args);
      const now = Date.now();

      // Check if we have a valid cached entry
      const cached = this.cache.get(key);
      if (cached && now < cached.expiresAt) {
        return cached.value;
      }

      // Execute function and cache result
      const result = await func(...args);
      this.cache.set(key, {
        value: result,
        timestamp: now,
        expiresAt: now + ttl,
      });
      return result;
    };
  }

  /**
   * Generates a cache key from function arguments
   */
  private generateKey(args: any[]): string {
    try {
      return JSON.stringify(args);
    } catch {
      // Fallback for non-serializable args
      return args.map((arg) => String(arg)).join('|');
    }
  }

  /**
   * Clears expired entries from cache
   */
  cleanupExpired(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Clears all cached entries
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   */
  getStats(): {
    size: number;
    expired: number;
    memory: number;
  } {
    const now = Date.now();
    let expired = 0;
    let totalMemory = 0;

    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        expired++;
      }
      // Rough memory estimation
      totalMemory += key.length + JSON.stringify(entry.value).length + 32; // overhead
    }

    return {
      size: this.cache.size,
      expired,
      memory: totalMemory,
    };
  }

  /**
   * Removes a specific entry from cache
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidates entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let removedCount = 0;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }
}

/**
 * Rate limiter to prevent API abuse
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Checks if a request is allowed for the given key
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter((timestamp) => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Gets remaining requests for a key
   */
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter((timestamp) => now - timestamp < this.windowMs);

    return Math.max(0, this.maxRequests - validRequests.length);
  }

  /**
   * Gets reset time for a key (when requests will be available again)
   */
  getResetTime(key: string): number {
    const requests = this.requests.get(key) || [];
    if (requests.length === 0) {
      return 0;
    }

    const oldestRequest = Math.min(...requests);
    return oldestRequest + this.windowMs;
  }

  /**
   * Clears all rate limit data
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Clears rate limit data for a specific key
   */
  clearKey(key: string): boolean {
    return this.requests.delete(key);
  }
}

/**
 * Batch processor for handling multiple requests efficiently
 */
export class BatchProcessor<T, R> {
  private queue: Array<{
    input: T;
    resolve: (result: R) => void;
    reject: (error: any) => void;
  }> = [];
  private processing = false;
  private maxBatchSize: number;
  private batchDelay: number;
  private processor: (items: T[]) => Promise<R[]>;

  constructor(processor: (items: T[]) => Promise<R[]>, maxBatchSize: number = 10, batchDelay: number = 100) {
    this.processor = processor;
    this.maxBatchSize = maxBatchSize;
    this.batchDelay = batchDelay;
  }

  /**
   * Adds an item to the batch queue
   */
  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input: item, resolve, reject });

      if (!this.processing) {
        this.processing = true;
        setTimeout(() => this.processBatch(), this.batchDelay);
      }
    });
  }

  /**
   * Processes the current batch
   */
  private async processBatch(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);
    const inputs = batch.map((item) => item.input);

    try {
      const results = await this.processor(inputs);

      if (results.length !== batch.length) {
        throw new Error('Processor must return same number of results as inputs');
      }

      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach((item) => {
        item.reject(error);
      });
    }

    // Process remaining items if any
    if (this.queue.length > 0) {
      setTimeout(() => this.processBatch(), this.batchDelay);
    } else {
      this.processing = false;
    }
  }

  /**
   * Forces processing of current queue
   */
  async flush(): Promise<void> {
    if (this.processing && this.queue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Gets current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private threshold: number;
  private timeout: number;

  constructor(threshold: number = 5, timeout: number = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  /**
   * Executes a function with circuit breaker protection
   */
  async execute<T>(func: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open - too many failures');
      }
    }

    try {
      const result = await func();

      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  }

  /**
   * Gets current circuit breaker state
   */
  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  /**
   * Gets failure count
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Resets the circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailure = 0;
  }
}
