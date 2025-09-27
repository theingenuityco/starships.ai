import api from '@/lib/api'
import type {
  ApiResponse,
  EnvironmentSummary,
  EnvironmentVariableResponse,
  EnvironmentVariableListResponse,
  CreateEnvironmentVariableRequest,
  UpdateEnvironmentVariableRequest,
} from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Centralized query keys following TanStack Query best practices
export const ENVIRONMENT_QUERY_KEYS = {
  all: ['environment-variables'] as const,
  lists: () => [...ENVIRONMENT_QUERY_KEYS.all, 'list'] as const,
  list: (starshipId: string) => [...ENVIRONMENT_QUERY_KEYS.lists(), starshipId] as const,
  details: () => [...ENVIRONMENT_QUERY_KEYS.all, 'detail'] as const,
  detail: (starshipId: string, variableId: string) => [...ENVIRONMENT_QUERY_KEYS.details(), starshipId, variableId] as const,
  byStarship: (starshipId: string) => [...ENVIRONMENT_QUERY_KEYS.all, 'starship', starshipId] as const,
} as const

/**
 * Get environment variables for a starship
 */
export function useEnvironmentVariables(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<EnvironmentSummary[]> => {
      const response: FetchResponse<ApiResponse<EnvironmentVariableListResponse>> = await api.get(`/api/v1/starships/${starshipId}/environment`)
      return response.data.data.variables
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}

/**
 * Get a single environment variable by ID
 */
export function useEnvironmentVariable(starshipId: string, variableId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.detail(starshipId, variableId),
    queryFn: async (): Promise<EnvironmentSummary> => {
      const response: FetchResponse<ApiResponse<EnvironmentVariableResponse>> = await api.get(`/api/v1/starships/${starshipId}/environment/${variableId}`)
      return response.data.data.environment
    },
    enabled: !!starshipId && !!variableId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Create a new environment variable
 */
export function useCreateEnvironmentVariable(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateEnvironmentVariableRequest): Promise<EnvironmentSummary> => {
      const response: FetchResponse<ApiResponse<EnvironmentVariableResponse>> = await api.post(`/api/v1/starships/${starshipId}/environment`, data)
      return response.data.data.environment
    },
    onSuccess: environmentVariable => {
      // Invalidate and refetch environment variables list
      queryClient.invalidateQueries({
        queryKey: ENVIRONMENT_QUERY_KEYS.byStarship(starshipId),
      })

      // Add to cache optimistically
      queryClient.setQueryData(ENVIRONMENT_QUERY_KEYS.byStarship(starshipId), (old: EnvironmentSummary[] | undefined) => {
        if (!old) return [environmentVariable]
        return [environmentVariable, ...old]
      })

      toast.success('Environment variable created successfully!', {
        description: `${environmentVariable.key} has been added to your starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create environment variable'
      toast.error('Failed to create environment variable', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update an environment variable
 */
export function useUpdateEnvironmentVariable(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ variable, updates }: { variable: EnvironmentSummary; updates: UpdateEnvironmentVariableRequest }): Promise<EnvironmentSummary> => {
      const response: FetchResponse<ApiResponse<EnvironmentVariableResponse>> = await api.put(`/api/v1/starships/${starshipId}/environment/${variable.key}`, updates)
      return response.data.data.environment
    },
    onSuccess: (updatedVariable, { variable }) => {
      // Update the specific environment variable in cache
      queryClient.setQueryData(ENVIRONMENT_QUERY_KEYS.detail(starshipId, variable.id), updatedVariable)

      // Update variable in the starship's list
      queryClient.setQueryData(ENVIRONMENT_QUERY_KEYS.byStarship(starshipId), (old: EnvironmentSummary[] | undefined) => {
        if (!old) return [updatedVariable]
        return old.map(v => (v.id === variable.id ? updatedVariable : v))
      })

      toast.success('Environment variable updated successfully!', {
        description: `${updatedVariable.key} has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update environment variable'
      toast.error('Failed to update environment variable', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete an environment variable
 */
export function useDeleteEnvironmentVariable(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variable: EnvironmentSummary) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/starships/${starshipId}/environment/${variable.key}`)
      return response.data.data
    },
    onMutate: async variable => {
      await queryClient.cancelQueries({
        queryKey: ENVIRONMENT_QUERY_KEYS.byStarship(starshipId),
      })

      // Optimistically remove the variable
      queryClient.setQueryData(ENVIRONMENT_QUERY_KEYS.byStarship(starshipId), (old: EnvironmentSummary[] | undefined) => {
        if (!old) return old
        return old.filter(v => v.id !== variable.id)
      })

      return { variable }
    },
    onSuccess: (data, variable, context) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: ENVIRONMENT_QUERY_KEYS.detail(starshipId, variable.id) })

      toast.success('Environment variable deleted successfully!', {
        description: `${variable.key} has been removed from your starship.`,
      })
    },
    onError: (error: any, variable, context) => {
      // Rollback optimistic deletion
      if (context?.variable) {
        queryClient.invalidateQueries({
          queryKey: ENVIRONMENT_QUERY_KEYS.byStarship(starshipId),
        })
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete environment variable'
      toast.error('Failed to delete environment variable', {
        description: errorMessage,
      })
    },
  })
}
