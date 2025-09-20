import api from '@/lib/api'
import type { ApiResponse, CreateStarshipRequest, StarshipModel, UpdateStarshipRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Extended Starship interface for client compatibility with optimistic updates
export interface ClientStarship extends StarshipModel {
  loading?: boolean
  error?: boolean
}

// Centralized query keys following TanStack Query best practices
export const STARSHIP_QUERY_KEYS = {
  all: ['starships'] as const,
  lists: () => [...STARSHIP_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: any) => [...STARSHIP_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...STARSHIP_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...STARSHIP_QUERY_KEYS.details(), id] as const,
  byOwner: (ownerId: string) => [...STARSHIP_QUERY_KEYS.all, 'owner', ownerId] as const,
  agents: (starshipId: string) => [...STARSHIP_QUERY_KEYS.detail(starshipId), 'agents'] as const,
} as const

/**
 * Get starship by ID
 */
export function useStarship(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.detail(starshipId),
    queryFn: async (): Promise<StarshipModel> => {
      const response: FetchResponse<ApiResponse<StarshipModel>> = await api.get(`/api/v1/starships/${starshipId}`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get starships by owner
 */
export function useUserStarships(userId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.byOwner(userId),
    queryFn: async (): Promise<StarshipModel[]> => {
      const response: FetchResponse<ApiResponse<StarshipModel[]>> = await api.get(`/api/v1/users/${userId}/starships`)
      return response.data.data
    },
    enabled: !!userId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get starship by slug
 */
export function useStarshipBySlug(slug: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...STARSHIP_QUERY_KEYS.all, 'slug', slug] as const,
    queryFn: async (): Promise<StarshipModel> => {
      const response: FetchResponse<ApiResponse<StarshipModel>> = await api.get(`/api/v1/starships/${slug}`)
      return response.data.data
    },
    enabled: !!slug && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes - starship data rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false, // Don't refetch when switching between conversations
    refetchOnMount: false, // Use cached data if available
  })
}

/**
 * Get all starships (for backward compatibility)
 * @deprecated Use useUserStarships instead
 */
export function useStarships(options?: { enabled?: boolean }) {
  // Since we don't have a user context here, we'll need to get it from auth
  // For now, return a mock structure that matches the expected API
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.lists(),
    queryFn: async () => {
      const response: FetchResponse<ApiResponse<StarshipModel[]>> = await api.get('/api/v1/starships')
      return { starships: response.data.data }
    },
    enabled: options?.enabled ?? true, // Add enabled option with default true for backward compatibility
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get starship agents
 */
export function useStarshipAgents(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_QUERY_KEYS.agents(starshipId),
    queryFn: async () => {
      const response: FetchResponse<ApiResponse<any[]>> = await api.get(`/api/v1/starships/${starshipId}/agents`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

/**
 * Create a new starship
 */
export function useCreateStarship() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateStarshipRequest): Promise<StarshipModel> => {
      const response: FetchResponse<ApiResponse<StarshipModel>> = await api.post('/api/v1/starships', data)
      return response.data.data
    },
    onSuccess: (starship, variables) => {
      // Invalidate user's starship list
      queryClient.invalidateQueries({
        queryKey: STARSHIP_QUERY_KEYS.byOwner(starship.ownerId),
      })

      // Add to cache optimistically
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.byOwner(starship.ownerId), (old: StarshipModel[] | undefined) => {
        if (!old) return [starship]
        return [starship, ...old]
      })

      toast.success('Starship created successfully!', {
        description: `${starship.name} is ready for deployment.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create starship'
      toast.error('Failed to create starship', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update starship
 */
export function useUpdateStarship() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ starshipId, updates }: { starshipId: string; updates: UpdateStarshipRequest }): Promise<StarshipModel> => {
      const response: FetchResponse<ApiResponse<StarshipModel>> = await api.put(`/api/v1/starships/${starshipId}`, updates)
      return response.data.data
    },
    onSuccess: (updatedStarship, variables) => {
      // Update the specific starship in cache
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.detail(variables.starshipId), updatedStarship)

      // Update starship in owner's list
      queryClient.setQueryData(STARSHIP_QUERY_KEYS.byOwner(updatedStarship.ownerId), (old: StarshipModel[] | undefined) => {
        if (!old) return [updatedStarship]
        return old.map(starship => (starship.id === variables.starshipId ? updatedStarship : starship))
      })

      toast.success('Starship updated successfully!', {
        description: `${updatedStarship.name} has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update starship'
      toast.error('Failed to update starship', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete starship
 */
export function useDeleteStarship() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (starshipId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/starships/${starshipId}`)
      return response.data.data
    },
    onMutate: async starshipId => {
      // Get starship details to know which caches to update
      const starship = queryClient.getQueryData(STARSHIP_QUERY_KEYS.detail(starshipId)) as StarshipModel | undefined

      if (starship?.ownerId) {
        await queryClient.cancelQueries({
          queryKey: STARSHIP_QUERY_KEYS.byOwner(starship.ownerId),
        })

        // Optimistically remove the starship
        queryClient.setQueryData(STARSHIP_QUERY_KEYS.byOwner(starship.ownerId), (old: StarshipModel[] | undefined) => {
          if (!old) return old
          return old.filter(s => s.id !== starshipId)
        })
      }

      return { starship }
    },
    onSuccess: (data, starshipId, context) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) })

      if (context?.starship) {
        toast.success('Starship deleted successfully!', {
          description: `${context.starship.name} has been decommissioned.`,
        })
      } else {
        toast.success('Starship deleted successfully!')
      }
    },
    onError: (error: any, starshipId, context) => {
      // Rollback optimistic deletion
      if (context?.starship) {
        queryClient.invalidateQueries({
          queryKey: STARSHIP_QUERY_KEYS.byOwner(context.starship.ownerId),
        })
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete starship'
      toast.error('Failed to delete starship', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Utility hook for managing selected starship with local storage
 */
export function useSelectedStarship() {
  const setSelectedStarship = (starshipId: string | null) => {
    if (typeof window !== 'undefined') {
      if (starshipId) {
        localStorage.setItem('selectedStarshipId', starshipId)
      } else {
        localStorage.removeItem('selectedStarshipId')
      }
    }
  }

  const getSelectedStarshipId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedStarshipId')
    }
    return null
  }

  const clearSelectedStarship = () => setSelectedStarship(null)

  return {
    setSelectedStarship,
    getSelectedStarshipId,
    clearSelectedStarship,
  }
}

/**
 * Utility hook for starship classes
 */
export function useStarshipClasses() {
  const classes = [
    {
      value: 'scout',
      label: 'Scout Class',
      description: 'Lightweight exploration vessel',
      maxAgents: 3,
      price: 'Free',
    },
    {
      value: 'cruiser',
      label: 'Cruiser Class',
      description: 'Balanced multi-purpose starship',
      maxAgents: 5,
      price: '$29/month',
    },
    {
      value: 'draught',
      label: 'Draught Class',
      description: 'Heavy-duty industrial vessel',
      maxAgents: 10,
      price: '$99/month',
    },
  ] as const

  const getClassInfo = (starshipClass: string) => {
    return classes.find(cls => cls.value === starshipClass)
  }

  return {
    classes,
    getClassInfo,
  }
}
