/**
 * Simple client-side cache for API responses
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 5 * 60 * 1000 // 5 minutes

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// Export singleton instance
export const apiCache = new SimpleCache()

// Cache keys for different API endpoints
export const CACHE_KEYS = {
  AGENTS_ALL: 'agents:all',
  AGENTS_BY_CATEGORY: (category: string) => `agents:category:${category}`,
  AGENTS_BY_AUTHOR: (authorId: string) => `agents:author:${authorId}`,
  AGENTS_BY_STARSHIP: (starshipId: string) => `agents:starship:${starshipId}`,
  AGENTS_PUBLIC: (limit: number, offset: number) => `agents:public:${limit}:${offset}`,
  AGENTS_SEARCH: (query: string) => `agents:search:${query}`,
  AGENT_BY_ID: (id: string) => `agent:${id}`,
  STARSHIP_BY_ID: (id: string) => `starship:${id}`,
  STARSHIP_AGENTS: (id: string) => `starship:${id}:agents`,
  // Template cache keys
  TEMPLATES_ALL: 'templates:all',
  TEMPLATES_BY_CATEGORY: (category: string) => `templates:category:${category}`,
  TEMPLATES_BY_AUTHOR: (authorId: string) => `templates:author:${authorId}`,
  TEMPLATES_PUBLIC: (limit: number, offset: number) => `templates:public:${limit}:${offset}`,
  TEMPLATES_SEARCH: (query: string) => `templates:search:${query}`,
  TEMPLATE_BY_ID: (id: string) => `template:${id}`,
  // NEW: Connector Instance cache keys
  CONNECTOR_INSTANCES_BY_STARSHIP: (starshipId: string) =>
    `connector-instances:starship:${starshipId}`,
}

// Helper function to invalidate related caches when agents are modified
export const invalidateAgentCaches = (agentId?: string) => {
  console.log(
    '[CACHE] Invalidating agent caches',
    agentId ? `for agent ${agentId}` : 'for all agents'
  )

  if (agentId) {
    apiCache.invalidate(CACHE_KEYS.AGENT_BY_ID(agentId))
    console.log('[CACHE] Invalidated specific agent cache:', CACHE_KEYS.AGENT_BY_ID(agentId))
  }

  // Invalidate all agent list caches
  apiCache.invalidatePattern('^agents:')
  console.log('[CACHE] Invalidated all agent list caches with pattern: ^agents:')

  apiCache.invalidatePattern('^starship:.*:agents$')
  console.log('[CACHE] Invalidated all starship agent caches with pattern: ^starship:.*:agents$')

  // Invalidate starships list cache since agent assignments may have changed
  apiCache.invalidate('starships:list')
  console.log('[CACHE] Invalidated starships list cache')

  // Log remaining cache keys for debugging
  const stats = apiCache.getStats()
  console.log('[CACHE] Remaining cache keys after invalidation:', stats.keys)
}

// Helper function to invalidate template caches
export const invalidateTemplateCaches = (templateId?: string) => {
  if (templateId) {
    apiCache.invalidate(CACHE_KEYS.TEMPLATE_BY_ID(templateId))
  }

  // Invalidate all template list caches
  apiCache.invalidatePattern('^templates:')
}

// Deprecated: MCP functionality has been removed
export const invalidateMCPServerCaches = (starshipId?: string) => {
  console.warn('[CACHE] MCP functionality has been removed - cache invalidation skipped')
}

// NEW: Helper function to invalidate connector instance caches
export const invalidateConnectorInstanceCaches = (starshipId?: string) => {
  console.log(
    '[CACHE] Invalidating connector instance caches',
    starshipId ? `for starship ${starshipId}` : 'for all instances'
  )

  if (starshipId) {
    apiCache.invalidate(CACHE_KEYS.CONNECTOR_INSTANCES_BY_STARSHIP(starshipId))
    console.log('[CACHE] Invalidated connector instances cache for starship:', starshipId)
  } else {
    // Invalidate all starship-specific connector instance caches
    apiCache.invalidatePattern('^connector-instances:starship:')
    console.log(
      '[CACHE] Invalidated all starship connector instance caches with pattern: ^connector-instances:starship:'
    )
  }

  // Log remaining cache keys for debugging
  const stats = apiCache.getStats()
  console.log('[CACHE] Remaining cache keys after connector instance invalidation:', stats.keys)
}
