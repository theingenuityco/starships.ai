/**
 * ToolDiscoveryCache - Caches MCP tool discovery results with TTL
 * 
 * This cache reduces the overhead of repeatedly discovering tools from MCP servers,
 * improving performance for agent operations.
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  connectorId: string;
  templateSlug: string;
}

export interface MCPResource {
  name: string;
  description: string;
  uri: string;
  mimeType?: string;
  connectorId: string;
  templateSlug: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class ToolDiscoveryCache {
  private toolCache: Map<string, CacheEntry<MCPTool[]>> = new Map();
  private resourceCache: Map<string, CacheEntry<MCPResource[]>> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) { // Default 5 minutes
    this.ttlMs = ttlMs;
    console.log(`[ToolDiscoveryCache] Initialized with TTL: ${ttlMs}ms`);
  }

  /**
   * Get cached tools for a starship
   */
  get(starshipId: string): MCPTool[] | null {
    const entry = this.toolCache.get(starshipId);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      console.log(`[ToolDiscoveryCache] Cache expired for starship ${starshipId}`);
      this.toolCache.delete(starshipId);
      return null;
    }

    console.log(`[ToolDiscoveryCache] Cache hit for starship ${starshipId} - ${entry.data.length} tools`);
    return entry.data;
  }

  /**
   * Set tools in cache
   */
  set(starshipId: string, tools: MCPTool[]): void {
    this.toolCache.set(starshipId, {
      data: tools,
      timestamp: Date.now()
    });
    console.log(`[ToolDiscoveryCache] Cached ${tools.length} tools for starship ${starshipId}`);
  }

  /**
   * Get cached resources for a starship
   */
  getResources(starshipId: string): MCPResource[] | null {
    const entry = this.resourceCache.get(starshipId);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      console.log(`[ToolDiscoveryCache] Resource cache expired for starship ${starshipId}`);
      this.resourceCache.delete(starshipId);
      return null;
    }

    console.log(`[ToolDiscoveryCache] Resource cache hit for starship ${starshipId} - ${entry.data.length} resources`);
    return entry.data;
  }

  /**
   * Set resources in cache
   */
  setResources(starshipId: string, resources: MCPResource[]): void {
    this.resourceCache.set(starshipId, {
      data: resources,
      timestamp: Date.now()
    });
    console.log(`[ToolDiscoveryCache] Cached ${resources.length} resources for starship ${starshipId}`);
  }

  /**
   * Delete cache entry for a starship
   */
  delete(starshipId: string): void {
    this.toolCache.delete(starshipId);
    this.resourceCache.delete(starshipId);
    console.log(`[ToolDiscoveryCache] Cleared cache for starship ${starshipId}`);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const toolSize = this.toolCache.size;
    const resourceSize = this.resourceCache.size;
    this.toolCache.clear();
    this.resourceCache.clear();
    console.log(`[ToolDiscoveryCache] Cleared all cache entries (${toolSize} tool entries, ${resourceSize} resource entries)`);
  }
  
  /**
   * Clear cache for a specific starship (alias for delete method)
   */
  clearForStarship(starshipId: string): void {
    this.delete(starshipId);
  }
  
  /**
   * Clear all cache (alias for clear method)
   */
  clearAll(): void {
    this.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    toolCacheSize: number;
    resourceCacheSize: number;
    totalMemoryUsage: number;
  } {
    let totalMemoryUsage = 0;

    // Estimate memory usage (rough approximation)
    this.toolCache.forEach((entry) => {
      totalMemoryUsage += JSON.stringify(entry.data).length;
    });

    this.resourceCache.forEach((entry) => {
      totalMemoryUsage += JSON.stringify(entry.data).length;
    });

    return {
      toolCacheSize: this.toolCache.size,
      resourceCacheSize: this.resourceCache.size,
      totalMemoryUsage
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removedTools = 0;
    let removedResources = 0;

    // Clean up tool cache
    for (const [starshipId, entry] of this.toolCache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.toolCache.delete(starshipId);
        removedTools++;
      }
    }

    // Clean up resource cache
    for (const [starshipId, entry] of this.resourceCache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.resourceCache.delete(starshipId);
        removedResources++;
      }
    }

    if (removedTools > 0 || removedResources > 0) {
      console.log(`[ToolDiscoveryCache] Cleanup: removed ${removedTools} tool entries, ${removedResources} resource entries`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 60000): NodeJS.Timeout { // Default 1 minute
    return setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
}