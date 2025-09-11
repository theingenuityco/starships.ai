import api from '@/lib/api'
import type { AgentModel, ApiResponse, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Extended Agent interface for client compatibility with optimistic updates
export interface ClientAgent extends AgentModel {
  loading?: boolean
  error?: boolean
}

// Agent filters for search and filtering
export interface AgentFilters {
  category?: 'general' | 'coding' | 'creative' | 'analysis' | 'support'
  authorId?: string
  starshipId?: string
  isPublic?: boolean
  tags?: string[]
}

// Centralized query keys following TanStack Query best practices
export const AGENT_QUERY_KEYS = {
  all: ['agents'] as const,
  lists: () => [...AGENT_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: AgentFilters) => [...AGENT_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...AGENT_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...AGENT_QUERY_KEYS.details(), id] as const,
  byStarship: (starshipId: string) => [...AGENT_QUERY_KEYS.all, 'starship', starshipId] as const,
  byAuthor: (authorId: string) => [...AGENT_QUERY_KEYS.all, 'author', authorId] as const,
  byUser: (userId: string) => [...AGENT_QUERY_KEYS.all, 'user', userId] as const,
  public: () => [...AGENT_QUERY_KEYS.all, 'public'] as const,
  search: (query: string, filters?: AgentFilters) => [...AGENT_QUERY_KEYS.all, 'search', query, { filters }] as const,
  analytics: (agentId: string) => [...AGENT_QUERY_KEYS.detail(agentId), 'analytics'] as const,
} as const

/**
 * Get agent by ID
 */
export function useAgent(agentId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.detail(agentId),
    queryFn: async (): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<AgentModel>> = await api.get(`/api/v1/agents/${agentId}`)
      return response.data.data
    },
    enabled: !!agentId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get agents by starship
 */
export function useStarshipAgents(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get(`/api/v1/starships/${starshipId}/agents`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get agents by author/user
 */
export function useUserAgents(userId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.byUser(userId),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get(`/api/v1/users/${userId}/agents`)
      return response.data.data
    },
    enabled: !!userId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get public agents
 */
export function usePublicAgents(limit: number = 50, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.public(),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get('/api/v1/agents/public', {
        params: { limit, page: 1 },
      })
      return response.data.data
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Get agents with filters
 */
export function useAgents(filters?: AgentFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.list(filters),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get('/api/v1/agents', {
        params: filters,
      })
      return response.data.data
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Search agents
 */
export function useSearchAgents(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.search(query),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get('/api/v1/agents/search', {
        params: { q: query },
      })
      return response.data.data
    },
    enabled: !!query && query.trim().length > 0 && enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get agent analytics
 */
export function useAgentAnalytics(agentId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.analytics(agentId),
    queryFn: async (): Promise<{
      id: string
      name: string
      usageCount: number
      rating: number
      createdAt: string
      updatedAt: string
      category: string
      isPublic: boolean
    }> => {
      const response: FetchResponse<
        ApiResponse<{
          id: string
          name: string
          usageCount: number
          rating: number
          createdAt: string
          updatedAt: string
          category: string
          isPublic: boolean
        }>
      > = await api.get(`/api/v1/agents/${agentId}/analytics`)
      return response.data.data
    },
    enabled: !!agentId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Create a new agent
 */
export function useCreateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateAgentRequest): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<AgentModel>> = await api.post('/api/v1/agents', data)
      return response.data.data
    },
    onSuccess: (agent, variables) => {
      // Invalidate relevant agent lists
      queryClient.invalidateQueries({
        queryKey: AGENT_QUERY_KEYS.byStarship(variables.starshipId),
      })

      if (agent.authorId) {
        queryClient.invalidateQueries({
          queryKey: AGENT_QUERY_KEYS.byUser(agent.authorId),
        })
      }

      queryClient.invalidateQueries({
        queryKey: AGENT_QUERY_KEYS.lists(),
      })

      // Add to specific caches optimistically
      if (variables.starshipId) {
        queryClient.setQueryData(AGENT_QUERY_KEYS.byStarship(variables.starshipId), (old: AgentModel[] | undefined) => {
          if (!old) return [agent]
          return [...old, agent]
        })
      }

      if (agent.authorId) {
        queryClient.setQueryData(AGENT_QUERY_KEYS.byUser(agent.authorId), (old: AgentModel[] | undefined) => {
          if (!old) return [agent]
          return [...old, agent]
        })
      }

      toast.success('Agent created successfully!', {
        description: `${agent.name} has been created and deployed to the starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create agent'
      toast.error('Failed to create agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update agent
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ agentId, updates }: { agentId: string; updates: UpdateAgentRequest }): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<AgentModel>> = await api.put(`/api/v1/agents/${agentId}`, updates)
      return response.data.data
    },
    onSuccess: (updatedAgent, variables) => {
      // Update the specific agent in cache
      queryClient.setQueryData(AGENT_QUERY_KEYS.detail(variables.agentId), updatedAgent)

      // Update agent in all relevant lists
      if (updatedAgent.starshipId) {
        queryClient.setQueryData(AGENT_QUERY_KEYS.byStarship(updatedAgent.starshipId), (old: AgentModel[] | undefined) => {
          if (!old) return [updatedAgent]
          return old.map(agent => (agent.id === variables.agentId ? updatedAgent : agent))
        })
      }

      if (updatedAgent.authorId) {
        queryClient.setQueryData(AGENT_QUERY_KEYS.byUser(updatedAgent.authorId), (old: AgentModel[] | undefined) => {
          if (!old) return [updatedAgent]
          return old.map(agent => (agent.id === variables.agentId ? updatedAgent : agent))
        })
      }

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.lists() })

      toast.success('Agent updated successfully!', {
        description: `${updatedAgent.name} has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update agent'
      toast.error('Failed to update agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/agents/${agentId}`)
      return response.data.data
    },
    onMutate: async agentId => {
      // Get agent details to know which caches to update
      const agent = queryClient.getQueryData(AGENT_QUERY_KEYS.detail(agentId)) as AgentModel | undefined

      if (agent?.starshipId) {
        await queryClient.cancelQueries({
          queryKey: AGENT_QUERY_KEYS.byStarship(agent.starshipId),
        })

        // Optimistically remove the agent
        queryClient.setQueryData(AGENT_QUERY_KEYS.byStarship(agent.starshipId), (old: AgentModel[] | undefined) => {
          if (!old) return old
          return old.filter(a => a.id !== agentId)
        })
      }

      if (agent?.authorId) {
        queryClient.setQueryData(AGENT_QUERY_KEYS.byUser(agent.authorId), (old: AgentModel[] | undefined) => {
          if (!old) return old
          return old.filter(a => a.id !== agentId)
        })
      }

      return { agent }
    },
    onSuccess: (data, agentId, context) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: AGENT_QUERY_KEYS.detail(agentId) })

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.lists() })

      if (context?.agent) {
        toast.success('Agent deleted successfully!', {
          description: `${context.agent.name} has been removed from the starship.`,
        })
      } else {
        toast.success('Agent deleted successfully!')
      }
    },
    onError: (error: any, agentId, context) => {
      // Rollback optimistic deletions
      if (context?.agent) {
        if (context.agent.starshipId) {
          queryClient.invalidateQueries({
            queryKey: AGENT_QUERY_KEYS.byStarship(context.agent.starshipId),
          })
        }
        if (context.agent.authorId) {
          queryClient.invalidateQueries({
            queryKey: AGENT_QUERY_KEYS.byUser(context.agent.authorId),
          })
        }
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete agent'
      toast.error('Failed to delete agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Deploy agent to starship (update starship assignment)
 */
export function useDeployAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ agentId, starshipId }: { agentId: string; starshipId: string }): Promise<{ message: string; agent: AgentModel }> => {
      const response: FetchResponse<ApiResponse<{ message: string; agent: AgentModel }>> = await api.put(`/api/v1/agents/${agentId}/starship`, { starshipId })
      return response.data.data
    },
    onSuccess: (data, variables) => {
      const { agent } = data

      // Update agent in cache
      queryClient.setQueryData(AGENT_QUERY_KEYS.detail(variables.agentId), agent)

      // Move agent between starship caches
      // Remove from old starship cache (we don't know the old starshipId, so invalidate all)
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.all })

      // Add to new starship cache
      queryClient.setQueryData(AGENT_QUERY_KEYS.byStarship(variables.starshipId), (old: AgentModel[] | undefined) => {
        if (!old) return [agent]
        const filtered = old.filter(a => a.id !== variables.agentId)
        return [...filtered, agent]
      })

      toast.success('Agent deployed successfully!', {
        description: `${agent.name} has been deployed to the new starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to deploy agent'
      toast.error('Failed to deploy agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Rate agent
 */
export function useRateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ agentId, rating }: { agentId: string; rating: number }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/agents/${agentId}/ratings`, { rating })
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // Invalidate agent details and analytics to refetch latest ratings
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(variables.agentId) })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.analytics(variables.agentId) })

      toast.success('Rating submitted successfully!', {
        description: `You rated this agent ${variables.rating} stars.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to rate agent'
      toast.error('Failed to rate agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Track agent usage
 */
export function useTrackAgentUsage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/agents/${agentId}/usage`)
      return response.data.data
    },
    onSuccess: (data, agentId) => {
      // Update agent usage count in cache optimistically
      queryClient.setQueryData(AGENT_QUERY_KEYS.detail(agentId), (old: AgentModel | undefined) => {
        if (!old) return old
        return { ...old, usageCount: (old.usageCount || 0) + 1 }
      })

      // Invalidate analytics to get fresh usage stats
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.analytics(agentId) })
    },
    onError: (error: any) => {
      console.error('Failed to track agent usage:', error)
      // Silent error - usage tracking is not critical for UX
    },
  })
}

/**
 * Utility hook for managing agent filters with local storage
 */
export function useAgentFilters() {
  const setFilters = (filters: AgentFilters) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentFilters', JSON.stringify(filters))
    }
  }

  const getFilters = (): AgentFilters | null => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('agentFilters')
      return stored ? JSON.parse(stored) : null
    }
    return null
  }

  const clearFilters = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('agentFilters')
    }
  }

  return {
    setFilters,
    getFilters,
    clearFilters,
  }
}

/**
 * Utility hook for managing selected agent with local storage
 */
export function useSelectedAgent() {
  const setSelectedAgent = (agentId: string | null) => {
    if (typeof window !== 'undefined') {
      if (agentId) {
        localStorage.setItem('selectedAgentId', agentId)
      } else {
        localStorage.removeItem('selectedAgentId')
      }
    }
  }

  const getSelectedAgentId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedAgentId')
    }
    return null
  }

  const clearSelectedAgent = () => setSelectedAgent(null)

  return {
    setSelectedAgent,
    getSelectedAgentId,
    clearSelectedAgent,
  }
}

/**
 * Utility hook for agent categories
 */
export function useAgentCategories() {
  const categories = [
    { value: 'general', label: 'General Assistant', description: 'All-purpose AI assistant' },
    { value: 'coding', label: 'Code Assistant', description: 'Specialized in programming and development' },
    { value: 'creative', label: 'Creative Assistant', description: 'Content creation and artistic tasks' },
    { value: 'analysis', label: 'Analysis Assistant', description: 'Data analysis and insights' },
    { value: 'support', label: 'Support Assistant', description: 'Customer service and help desk' },
  ] as const

  const getCategoryInfo = (category: string) => {
    return categories.find(cat => cat.value === category)
  }

  return {
    categories,
    getCategoryInfo,
  }
}
