import api from '@/lib/api'
import type { ApiResponse, CreateStarshipRequest, DeployStarshipOption, StarshipModel, UpdateStarshipRequest } from '@starships/protocol'
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

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
 * Pick the "primary" starship for a user from an accessible list.
 *
 * Priority:
 * 1) If the user owns any starships: prefer an owned starship
 *    - Use selected starship only if it is also owned
 *    - Otherwise use the first owned starship
 * 2) If the user owns no starships: selected starship (if present)
 * 3) Fallback: first starship in the list
 */
export function pickPrimaryStarshipForUser(
  starships: StarshipModel[] | undefined | null,
  userId: string | undefined | null,
  selectedStarshipId?: string | null
): StarshipModel | null {
  const list = Array.isArray(starships) ? starships : []
  if (!list.length) return null

  const uid = typeof userId === 'string' ? userId : ''
  const selectedId = typeof selectedStarshipId === 'string' && selectedStarshipId.trim() ? selectedStarshipId : null

  const selected = selectedId ? (list.find(s => s.id === selectedId) ?? null) : null
  const firstOwned = uid ? (list.find(s => s.ownerId === uid) ?? null) : null
  const ownedCount = uid ? list.reduce((n, s) => (s.ownerId === uid ? n + 1 : n), 0) : 0

  // If the user owns at least one starship, prefer an owned starship.
  // Only honor selectedStarshipId when it is ALSO owned by the user.
  let choice: StarshipModel | null = null
  let reason:
    | 'selected_owned'
    | 'owned_first'
    | 'selected_no_owned_available'
    | 'fallback_first' = 'fallback_first'

  if (uid && ownedCount > 0) {
    if (selected && selected.ownerId === uid) {
      choice = selected
      reason = 'selected_owned'
    } else {
      choice = firstOwned
      reason = 'owned_first'
    }
  } else if (selected) {
    choice = selected
    reason = 'selected_no_owned_available'
  } else {
    choice = list[0] ?? null
    reason = 'fallback_first'
  }

  return choice
}

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

export interface UseOwnedStarshipsForDeployOptions {
  /** When true, skip fetching user starships (e.g. when user is not authenticated). */
  enabled?: boolean
  /** When set, use this as the only deploy target (e.g. when deploying from a specific starship context). */
  explicitStarship?: DeployStarshipOption | null
}

/**
 * Returns owned starships suitable for marketplace deploy (filtered by ownerId, minimal shape).
 * Use this instead of duplicating filter/map logic in deploy CTAs and modals.
 */
export function useOwnedStarshipsForDeploy(userId: string, options: UseOwnedStarshipsForDeployOptions = {}): { ownedStarships: DeployStarshipOption[]; primaryStarship: DeployStarshipOption | null } {
  const { enabled = true, explicitStarship } = options
  const { data: starships = [] } = useUserStarships(userId, enabled && explicitStarship == null)

  return useMemo(() => {
    if (explicitStarship != null && explicitStarship.id) {
      return { ownedStarships: [explicitStarship], primaryStarship: explicitStarship }
    }
    const owned = (starships as StarshipModel[]).filter(s => s.ownerId === userId).map(s => ({ id: s.id, slug: s.slug, name: s.name }))
    return { ownedStarships: owned, primaryStarship: owned[0] ?? null }
  }, [userId, starships, explicitStarship])
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
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to create starship', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Ensure the current user has at least one starship (creates default if none).
 * Used when user has no starships; invite-joiners never need this.
 */
export function useEnsureDefaultStarship() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<StarshipModel> => {
      const response: FetchResponse<ApiResponse<{ starship: StarshipModel }>> = await api.post('/api/v1/users/me/ensure-default-starship')
      return response.data.data.starship
    },
    onSuccess: starship => {
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.byOwner(starship.ownerId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to create workspace', { description: getSafeErrorMessage(error) })
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
      const errorMessage = getSafeErrorMessage(error)
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

      const errorMessage = getSafeErrorMessage(error)
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
