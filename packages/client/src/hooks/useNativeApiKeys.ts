import api from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Native API Key interface
export interface NativeApiKey {
  toolName: string
  apiKey: string
  config?: Record<string, string>
  createdAt: string
  updatedAt?: string
}

// Centralized query keys following TanStack Query best practices
export const NATIVE_API_KEY_QUERY_KEYS = {
  all: ['nativeApiKeys'] as const,
  lists: () => [...NATIVE_API_KEY_QUERY_KEYS.all, 'list'] as const,
  list: (starshipId: string) => [...NATIVE_API_KEY_QUERY_KEYS.lists(), starshipId] as const,
  details: () => [...NATIVE_API_KEY_QUERY_KEYS.all, 'detail'] as const,
  detail: (starshipId: string, toolName: string) => [...NATIVE_API_KEY_QUERY_KEYS.details(), starshipId, toolName] as const,
  byStarship: (starshipId: string) => [...NATIVE_API_KEY_QUERY_KEYS.all, 'starship', starshipId] as const,
} as const

/**
 * Get native API keys for a starship
 */
export function useNativeApiKeys(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: NATIVE_API_KEY_QUERY_KEYS.byStarship(starshipId),
    queryFn: async () => {
      try {
        const response = await api.get(`/api/v1/starships/${starshipId}/native-api-keys`)
        // Use proper API response extraction
        return response.data.data as Record<string, string>
      } catch (error) {
        console.error('Failed to load native API keys:', error)
        // Return empty object if failed to maintain compatibility
        return {} as Record<string, string>
      }
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get specific native API key for a tool
 */
export function useNativeApiKey(starshipId: string, toolName: string, enabled: boolean = true) {
  return useQuery({
    queryKey: NATIVE_API_KEY_QUERY_KEYS.detail(starshipId, toolName),
    queryFn: async () => {
      const response = await api.get(`/api/v1/starships/${starshipId}/native-api-keys/${toolName}`)
      return response.data.data as { apiKey: string; config?: Record<string, string> }
    },
    enabled: !!starshipId && !!toolName && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Save or update native API key
 */
export function useSaveNativeApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { starshipId: string; toolName: string; apiKey: string; config?: Record<string, string> }) => {
      const response = await api.post(`/api/v1/starships/${data.starshipId}/native-api-keys`, {
        toolName: data.toolName,
        apiKey: data.apiKey,
        config: data.config,
      })
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // Update the specific API key in cache optimistically
      queryClient.setQueryData(NATIVE_API_KEY_QUERY_KEYS.byStarship(variables.starshipId), (old: Record<string, string> | undefined) => {
        return {
          ...old,
          [variables.toolName]: variables.apiKey,
        }
      })

      // Update the specific tool key cache
      queryClient.setQueryData(NATIVE_API_KEY_QUERY_KEYS.detail(variables.starshipId, variables.toolName), {
        apiKey: variables.apiKey,
        config: variables.config,
      })

      toast.success('API key saved successfully!', {
        description: `${variables.toolName} configuration has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to save API key'
      toast.error('Failed to save API key', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete native API key
 */
export function useDeleteNativeApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { starshipId: string; toolName: string }) => {
      const response = await api.delete(`/api/v1/starships/${data.starshipId}/native-api-keys/${data.toolName}`)
      return response.data.data
    },
    onMutate: async ({ starshipId, toolName }) => {
      // Cancel any ongoing refetches
      await queryClient.cancelQueries({
        queryKey: NATIVE_API_KEY_QUERY_KEYS.byStarship(starshipId),
      })

      // Snapshot the previous value
      const previousKeys = queryClient.getQueryData(NATIVE_API_KEY_QUERY_KEYS.byStarship(starshipId))

      // Optimistically remove the API key
      queryClient.setQueryData(NATIVE_API_KEY_QUERY_KEYS.byStarship(starshipId), (old: Record<string, string> | undefined) => {
        if (!old) return old
        const { [toolName]: removed, ...rest } = old
        return rest
      })

      // Remove the specific tool key cache
      queryClient.removeQueries({
        queryKey: NATIVE_API_KEY_QUERY_KEYS.detail(starshipId, toolName),
      })

      return { previousKeys, starshipId, toolName }
    },
    onSuccess: (data, variables) => {
      toast.success('API key deleted successfully!', {
        description: `${variables.toolName} configuration has been removed.`,
      })
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic update
      if (context?.previousKeys) {
        queryClient.setQueryData(NATIVE_API_KEY_QUERY_KEYS.byStarship(context.starshipId), context.previousKeys)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete API key'
      toast.error('Failed to delete API key', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Utility hook to get configured tools count
 */
export function useConfiguredToolsCount(starshipId: string) {
  const { data: apiKeys } = useNativeApiKeys(starshipId)

  const configuredCount = Object.values(apiKeys || {}).filter(key => key && key.length > 0).length

  return configuredCount
}
