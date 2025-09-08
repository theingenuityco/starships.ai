import api from '@/lib/api'
import type { ApiResponse, BlueprintModel, CreateBlueprintRequest, UpdateBlueprintRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Blueprint category type for filtering
export type BlueprintCategory = 'general' | 'workflow' | 'automation' | 'integration' | 'analysis'

// Blueprint statistics interface
export interface BlueprintStats {
  blueprint: BlueprintModel
  nodeCount: number
  edgeCount: number
  usageCount: number
}

// Blueprint validation result interface
export interface BlueprintValidation {
  isValid: boolean
  errors: string[]
}

// Centralized query keys with hierarchical structure
export const BLUEPRINT_QUERY_KEYS = {
  all: ['blueprints'] as const,
  lists: () => [...BLUEPRINT_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: { category?: BlueprintCategory; search?: string }) => [...BLUEPRINT_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...BLUEPRINT_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...BLUEPRINT_QUERY_KEYS.details(), id] as const,
  byCategory: (category: BlueprintCategory) => [...BLUEPRINT_QUERY_KEYS.all, 'category', category] as const,
  popular: (limit?: number) => [...BLUEPRINT_QUERY_KEYS.all, 'popular', { limit }] as const,
  stats: (id: string) => [...BLUEPRINT_QUERY_KEYS.detail(id), 'stats'] as const,
  validation: (id: string) => [...BLUEPRINT_QUERY_KEYS.detail(id), 'validation'] as const,
} as const

// Get all blueprints with optional filtering
export function useBlueprints(filters?: { category?: BlueprintCategory; search?: string }, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.list(filters),
    queryFn: async (): Promise<{ blueprints: BlueprintModel[] }> => {
      const params = new URLSearchParams()
      if (filters?.category) params.append('category', filters.category)
      if (filters?.search) params.append('search', filters.search)

      const response: AxiosResponse<ApiResponse<BlueprintModel[]>> = await api.get(`/api/v1/blueprints?${params.toString()}`)
      return { blueprints: response.data.data }
    },
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

// Get blueprint by ID
export function useBlueprint(blueprintId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.detail(blueprintId),
    queryFn: async (): Promise<BlueprintModel> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel>> = await api.get(`/api/v1/blueprints/${blueprintId}`)
      return response.data.data
    },
    enabled: !!blueprintId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get blueprints by category
export function useBlueprintsByCategory(category: BlueprintCategory, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.byCategory(category),
    queryFn: async (): Promise<{ blueprints: BlueprintModel[] }> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel[]>> = await api.get(`/api/v1/blueprints/category/${category}`)
      return { blueprints: response.data.data }
    },
    enabled: !!category && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Get popular blueprints
export function usePopularBlueprints(limit: number = 10, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.popular(limit),
    queryFn: async (): Promise<{ blueprints: BlueprintModel[] }> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel[]>> = await api.get(`/api/v1/blueprints/popular?limit=${limit}`)
      return { blueprints: response.data.data }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })
}

// Get blueprint statistics
export function useBlueprintStats(blueprintId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.stats(blueprintId),
    queryFn: async (): Promise<BlueprintStats> => {
      const response: AxiosResponse<ApiResponse<BlueprintStats>> = await api.get(`/api/v1/blueprints/${blueprintId}/stats`)
      return response.data.data
    },
    enabled: !!blueprintId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Validate blueprint structure
export function useBlueprintValidation(blueprintId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: BLUEPRINT_QUERY_KEYS.validation(blueprintId),
    queryFn: async (): Promise<BlueprintValidation> => {
      const response: AxiosResponse<ApiResponse<BlueprintValidation>> = await api.post(`/api/v1/blueprints/${blueprintId}/validate`)
      return response.data.data
    },
    enabled: !!blueprintId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
  })
}

// Create a new blueprint
export function useCreateBlueprint() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateBlueprintRequest): Promise<BlueprintModel> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel>> = await api.post('/api/v1/blueprints', data)
      return response.data.data
    },
    onMutate: async newBlueprint => {
      // Cancel any outgoing refetches for blueprint lists
      await queryClient.cancelQueries({ queryKey: BLUEPRINT_QUERY_KEYS.lists() })

      // Snapshot the previous blueprint lists
      const previousBlueprints = queryClient.getQueryData(BLUEPRINT_QUERY_KEYS.list())

      // Optimistically add new blueprint to the general list
      const optimisticBlueprint: BlueprintModel = {
        id: `temp-${Date.now()}`,
        ...newBlueprint,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        creating: true, // Add a flag to show loading state
      } as BlueprintModel & { creating?: boolean }

      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), (old: { blueprints: BlueprintModel[] } | undefined) => {
        const blueprints = old?.blueprints || []
        return { blueprints: [optimisticBlueprint, ...blueprints] }
      })

      return { previousBlueprints, optimisticBlueprint }
    },
    onSuccess: (blueprint, variables, context) => {
      // Replace optimistic update with real data
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), (old: { blueprints: BlueprintModel[] } | undefined) => {
        const blueprints = old?.blueprints || []
        const withoutOptimistic = blueprints.filter(b => b.id !== context?.optimisticBlueprint.id)
        return { blueprints: [blueprint, ...withoutOptimistic] }
      })

      // Add to category-specific cache if applicable
      if (blueprint.category) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.byCategory(blueprint.category as BlueprintCategory), (old: { blueprints: BlueprintModel[] } | undefined) => {
          const blueprints = old?.blueprints || []
          return { blueprints: [blueprint, ...blueprints] }
        })
      }

      // Set individual blueprint cache
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.detail(blueprint.id), blueprint)

      toast.success('Blueprint created successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousBlueprints) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), context.previousBlueprints)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create blueprint'
      toast.error('Failed to create blueprint', {
        description: errorMessage,
      })
    },
  })
}

// Update blueprint
export function useUpdateBlueprint() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ blueprintId, updates }: { blueprintId: string; updates: UpdateBlueprintRequest }): Promise<BlueprintModel> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel>> = await api.put(`/api/v1/blueprints/${blueprintId}`, updates)
      return response.data.data
    },
    onMutate: async ({ blueprintId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: BLUEPRINT_QUERY_KEYS.detail(blueprintId) })

      // Snapshot the previous blueprint data
      const previousBlueprint = queryClient.getQueryData(BLUEPRINT_QUERY_KEYS.detail(blueprintId))

      // Optimistically update the blueprint
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.detail(blueprintId), (old: BlueprintModel | undefined) => {
        if (!old) return old
        return {
          ...old,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      })

      return { previousBlueprint, blueprintId }
    },
    onSuccess: (updatedBlueprint, variables) => {
      // Update all caches with the real data
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.detail(variables.blueprintId), updatedBlueprint)

      // Update lists
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.byCategory(updatedBlueprint.category as BlueprintCategory) })

      toast.success('Blueprint updated successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update
      if (context?.previousBlueprint) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.detail(context.blueprintId), context.previousBlueprint)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update blueprint'
      toast.error('Failed to update blueprint', {
        description: errorMessage,
      })
    },
  })
}

// Delete blueprint
export function useDeleteBlueprint() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (blueprintId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.delete(`/api/v1/blueprints/${blueprintId}`)
      return response.data.data
    },
    onMutate: async blueprintId => {
      // Get blueprint details before deletion for rollback
      const blueprint = queryClient.getQueryData(BLUEPRINT_QUERY_KEYS.detail(blueprintId)) as BlueprintModel

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: BLUEPRINT_QUERY_KEYS.lists() })

      // Snapshot previous data
      const previousBlueprints = queryClient.getQueryData(BLUEPRINT_QUERY_KEYS.list())
      const previousCategoryBlueprints = blueprint?.category ? queryClient.getQueryData(BLUEPRINT_QUERY_KEYS.byCategory(blueprint.category as BlueprintCategory)) : null

      // Optimistically remove from lists
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), (old: { blueprints: BlueprintModel[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          blueprints: old.blueprints.filter(b => b.id !== blueprintId),
        }
      })

      if (blueprint?.category) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.byCategory(blueprint.category as BlueprintCategory), (old: { blueprints: BlueprintModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            blueprints: old.blueprints.filter(b => b.id !== blueprintId),
          }
        })
      }

      return { previousBlueprints, previousCategoryBlueprints, blueprint, blueprintId }
    },
    onError: (error: any, blueprintId, context) => {
      // Rollback optimistic updates
      if (context?.previousBlueprints) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), context.previousBlueprints)
      }
      if (context?.previousCategoryBlueprints && context.blueprint?.category) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.byCategory(context.blueprint.category as BlueprintCategory), context.previousCategoryBlueprints)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete blueprint'
      toast.error('Failed to delete blueprint', {
        description: errorMessage,
      })
    },
    onSuccess: (data, blueprintId, context) => {
      // Remove from all caches
      queryClient.removeQueries({ queryKey: BLUEPRINT_QUERY_KEYS.detail(blueprintId) })
      queryClient.removeQueries({ queryKey: BLUEPRINT_QUERY_KEYS.stats(blueprintId) })
      queryClient.removeQueries({ queryKey: BLUEPRINT_QUERY_KEYS.validation(blueprintId) })

      toast.success('Blueprint deleted successfully!')
    },
    onSettled: (data, error, blueprintId) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.popular() })
    },
  })
}

// Clone blueprint
export function useCloneBlueprint() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      blueprintId,
      cloneData,
    }: {
      blueprintId: string
      cloneData: {
        name: string
        description?: string
        category?: BlueprintCategory
        metadata?: Record<string, unknown>
      }
    }): Promise<BlueprintModel> => {
      const response: AxiosResponse<ApiResponse<BlueprintModel>> = await api.post(`/api/v1/blueprints/${blueprintId}/clone`, cloneData)
      return response.data.data
    },
    onSuccess: (clonedBlueprint, variables) => {
      // Add cloned blueprint to lists
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.list(), (old: { blueprints: BlueprintModel[] } | undefined) => {
        const blueprints = old?.blueprints || []
        return { blueprints: [clonedBlueprint, ...blueprints] }
      })

      // Add to category-specific cache
      if (clonedBlueprint.category) {
        queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.byCategory(clonedBlueprint.category as BlueprintCategory), (old: { blueprints: BlueprintModel[] } | undefined) => {
          const blueprints = old?.blueprints || []
          return { blueprints: [clonedBlueprint, ...blueprints] }
        })
      }

      // Set individual blueprint cache
      queryClient.setQueryData(BLUEPRINT_QUERY_KEYS.detail(clonedBlueprint.id), clonedBlueprint)

      // Invalidate original blueprint stats (usage count increased)
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.stats(variables.blueprintId) })
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.detail(variables.blueprintId) })

      toast.success('Blueprint cloned successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to clone blueprint'
      toast.error('Failed to clone blueprint', {
        description: errorMessage,
      })
    },
  })
}

// Track blueprint usage
export function useTrackBlueprintUsage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (blueprintId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.post(`/api/v1/blueprints/${blueprintId}/track-usage`)
      return response.data.data
    },
    onSuccess: (data, blueprintId) => {
      // Invalidate related queries to show updated usage
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.detail(blueprintId) })
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.stats(blueprintId) })
      queryClient.invalidateQueries({ queryKey: BLUEPRINT_QUERY_KEYS.popular() })
    },
    onError: (error: any) => {
      // Silent error for usage tracking - don't show error toast as it's not critical
      console.warn('Failed to track blueprint usage:', error)
    },
  })
}

// Utility hook for managing active blueprint selection with local storage
export function useActiveBlueprint() {
  const setActiveBlueprint = (blueprintId: string | null) => {
    if (blueprintId) {
      localStorage.setItem('activeBlueprintId', blueprintId)
    } else {
      localStorage.removeItem('activeBlueprintId')
    }
  }

  const getActiveBlueprintId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeBlueprintId')
    }
    return null
  }

  return {
    setActiveBlueprint,
    getActiveBlueprintId,
    clearActiveBlueprint: () => setActiveBlueprint(null),
  }
}
