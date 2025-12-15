import api from '@/lib/api'
import type { ApiResponse, ConnectorSecretSummary, ConnectorSecretResponse, ConnectorSecretListResponse, CreateConnectorSecretRequest, UpdateConnectorSecretRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Centralized query keys following TanStack Query best practices
export const CONNECTOR_SECRETS_QUERY_KEYS = {
  all: ['connector-secrets'] as const,
  lists: () => [...CONNECTOR_SECRETS_QUERY_KEYS.all, 'list'] as const,
  list: (starshipId: string) => [...CONNECTOR_SECRETS_QUERY_KEYS.lists(), starshipId] as const,
  details: () => [...CONNECTOR_SECRETS_QUERY_KEYS.all, 'detail'] as const,
  detail: (starshipId: string, secretId: string) => [...CONNECTOR_SECRETS_QUERY_KEYS.details(), starshipId, secretId] as const,
  byStarship: (starshipId: string) => [...CONNECTOR_SECRETS_QUERY_KEYS.all, 'starship', starshipId] as const,
} as const

/**
 * List connector secrets for a starship
 */
export function useConnectorSecrets(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<ConnectorSecretSummary[]> => {
      const response: FetchResponse<ApiResponse<ConnectorSecretListResponse>> = await api.get(`/api/v1/starships/${starshipId}/connector-secrets`)
      return response.data.data.secrets
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}

/**
 * Get a single connector secret by ID
 */
export function useConnectorSecret(starshipId: string, secretId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONNECTOR_SECRETS_QUERY_KEYS.detail(starshipId, secretId),
    queryFn: async (): Promise<ConnectorSecretSummary> => {
      const response: FetchResponse<ApiResponse<ConnectorSecretResponse>> = await api.get(`/api/v1/starships/${starshipId}/connector-secrets/${secretId}`)
      return response.data.data.connectorSecret
    },
    enabled: !!starshipId && !!secretId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Create a new connector secret
 */
export function useCreateConnectorSecret(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateConnectorSecretRequest): Promise<ConnectorSecretSummary> => {
      const response: FetchResponse<ApiResponse<ConnectorSecretResponse>> = await api.post(`/api/v1/starships/${starshipId}/connector-secrets`, data)
      return response.data.data.connectorSecret
    },
    onSuccess: connectorSecret => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId),
      })

      queryClient.setQueryData(CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId), (old: ConnectorSecretSummary[] | undefined) => {
        if (!old) return [connectorSecret]
        return [connectorSecret, ...old]
      })

      toast.success('Secret created successfully!', {
        description: `${connectorSecret.key} has been added to your starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create secret'
      toast.error('Failed to create secret', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update a connector secret
 */
export function useUpdateConnectorSecret(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ secretId, updates }: { secretId: string; updates: UpdateConnectorSecretRequest }): Promise<ConnectorSecretSummary> => {
      const response: FetchResponse<ApiResponse<ConnectorSecretResponse>> = await api.put(`/api/v1/starships/${starshipId}/connector-secrets/${secretId}`, updates)
      return response.data.data.connectorSecret
    },
    onSuccess: (updatedSecret, { secretId }) => {
      queryClient.setQueryData(CONNECTOR_SECRETS_QUERY_KEYS.detail(starshipId, secretId), updatedSecret)

      queryClient.setQueryData(CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId), (old: ConnectorSecretSummary[] | undefined) => {
        if (!old) return [updatedSecret]
        return old.map(secret => (secret.id === secretId ? updatedSecret : secret))
      })

      toast.success('Secret updated successfully!', {
        description: `${updatedSecret.key} has been updated.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update secret'
      toast.error('Failed to update secret', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete a connector secret
 */
export function useDeleteConnectorSecret(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (secretId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/starships/${starshipId}/connector-secrets/${secretId}`)
      return response.data.data
    },
    onMutate: async secretId => {
      const secret = queryClient.getQueryData(CONNECTOR_SECRETS_QUERY_KEYS.detail(starshipId, secretId)) as ConnectorSecretSummary | undefined

      if (secret) {
        await queryClient.cancelQueries({
          queryKey: CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId),
        })

        queryClient.setQueryData(CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId), (old: ConnectorSecretSummary[] | undefined) => {
          if (!old) return old
          return old.filter(v => v.id !== secretId)
        })
      }

      return { secret }
    },
    onSuccess: (_data, secretId, context) => {
      queryClient.removeQueries({ queryKey: CONNECTOR_SECRETS_QUERY_KEYS.detail(starshipId, secretId) })

      if (context?.secret) {
        toast.success('Secret deleted successfully!', {
          description: `${context.secret.key} has been removed from your starship.`,
        })
      } else {
        toast.success('Secret deleted successfully!')
      }
    },
    onError: (error: any, _secretId, context) => {
      if (context?.secret) {
        queryClient.invalidateQueries({
          queryKey: CONNECTOR_SECRETS_QUERY_KEYS.byStarship(starshipId),
        })
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete secret'
      toast.error('Failed to delete secret', {
        description: errorMessage,
      })
    },
  })
}
