import { useState, useEffect, useCallback } from 'react'
import { Agent, agentAPI } from '@/lib/api'

interface UseAgentPaginationOptions {
  pageSize?: number
  category?: Agent['category']
  authorId?: string
  searchQuery?: string
  isPublic?: boolean
}

interface UseAgentPaginationResult {
  agents: Agent[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
  totalLoaded: number
}

/**
 * Hook for paginated agent loading with lazy loading support
 */
export function useAgentPagination(
  options: UseAgentPaginationOptions = {}
): UseAgentPaginationResult {
  const { pageSize = 20, category, authorId, searchQuery, isPublic } = options

  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)

  const loadAgents = useCallback(
    async (reset: boolean = false) => {
      if (loading) return

      setLoading(true)
      setError(null)

      try {
        let newAgents: Agent[] = []
        const currentOffset = reset ? 0 : offset

        // Determine which API method to use based on options
        if (searchQuery) {
          newAgents = await agentAPI.search(searchQuery)
          // Search returns all results, so we need to slice for pagination
          const start = currentOffset
          const end = start + pageSize
          newAgents = newAgents.slice(start, end)
        } else if (category) {
          newAgents = await agentAPI.getByCategory(category)
          // Category returns all results, slice for pagination
          const start = currentOffset
          const end = start + pageSize
          newAgents = newAgents.slice(start, end)
        } else if (authorId) {
          newAgents = await agentAPI.getByAuthor(authorId)
          // Author returns all results, slice for pagination
          const start = currentOffset
          const end = start + pageSize
          newAgents = newAgents.slice(start, end)
        } else if (isPublic) {
          newAgents = await agentAPI.getPublic(pageSize, currentOffset)
        } else {
          // Default: get all agents with client-side pagination
          const allAgents = await agentAPI.getAll()
          const start = currentOffset
          const end = start + pageSize
          newAgents = allAgents.slice(start, end)
        }

        if (reset) {
          setAgents(newAgents)
          setOffset(pageSize)
        } else {
          setAgents(prev => [...prev, ...newAgents])
          setOffset(prev => prev + pageSize)
        }

        // Check if there are more items to load
        setHasMore(newAgents.length === pageSize)
      } catch (err) {
        console.error('Failed to load agents:', err)
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    },
    [pageSize, category, authorId, searchQuery, isPublic, offset, loading]
  )

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadAgents(false)
    }
  }, [loadAgents, loading, hasMore])

  const refresh = useCallback(() => {
    setOffset(0)
    setHasMore(true)
    loadAgents(true)
  }, [loadAgents])

  // Load initial data when options change
  useEffect(() => {
    refresh()
  }, [category, authorId, searchQuery, isPublic, pageSize])

  return {
    agents,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalLoaded: agents.length,
  }
}

/**
 * Hook for infinite scroll behavior
 */
export function useInfiniteScroll(
  loadMore: () => void,
  hasMore: boolean,
  loading: boolean,
  threshold: number = 100
) {
  useEffect(() => {
    const handleScroll = () => {
      if (loading || !hasMore) return

      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
      const clientHeight = document.documentElement.clientHeight || window.innerHeight

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        loadMore()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadMore, hasMore, loading, threshold])
}
