import api from '@/lib/api'
import type {
  ApiResponse,
  ConnectorCatalogItem,
  ConnectorCatalogResponse,
  ConnectorListItem,
  ConnectorListResponse,
  ConnectWithApiKeyRequest,
} from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const CONNECTOR_QUERY_KEYS = {
  all: ['connectors'] as const,
  catalog: () => [...CONNECTOR_QUERY_KEYS.all, 'catalog'] as const,
  byStarship: (starshipId: string) => [...CONNECTOR_QUERY_KEYS.all, 'starship', starshipId] as const,
} as const

export function useConnectorCatalog() {
  return useQuery({
    queryKey: CONNECTOR_QUERY_KEYS.catalog(),
    queryFn: async (): Promise<ConnectorCatalogItem[]> => {
      const response: FetchResponse<ApiResponse<ConnectorCatalogResponse>> = await api.get('/api/v1/connectors/catalog')
      return response.data.data.connectors
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useStarshipConnectors(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<ConnectorListItem[]> => {
      const response: FetchResponse<ApiResponse<ConnectorListResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/connectors`,
      )
      return response.data.data.connectors
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useConnectDiscord(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: ConnectWithApiKeyRequest): Promise<ConnectorListItem['metadata']> => {
      const response: FetchResponse<ApiResponse<{ connector: ConnectorListItem }>> = await api.post(
        `/api/v1/starships/${starshipId}/connectors/discord/api-key`,
        payload,
      )
      return response.data.data.connector.metadata
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId),
      })
      toast.success('Discord connected', {
        description: 'Discord connector is now active for this starship.',
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to connect Discord'
      toast.error('Failed to connect Discord', {
        description: errorMessage,
      })
    },
  })
}

export function useDisconnectConnector(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: 'linkedin' | 'discord'): Promise<void> => {
      await api.post(`/api/v1/starships/${starshipId}/connectors/${provider}/disconnect`)
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId),
      })

      toast.success('Connector disconnected', {
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} connector has been disconnected.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to disconnect connector'
      toast.error('Failed to disconnect connector', {
        description: errorMessage,
      })
    },
  })
}

export function useStartLinkedInOAuth(starshipId: string) {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const response: FetchResponse<ApiResponse<{ authorizationUrl: string }>> = await api.post(
        `/api/v1/starships/${starshipId}/connectors/linkedin/oauth/start`,
      )
      return response.data.data.authorizationUrl
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to start LinkedIn connection'
      toast.error('Failed to connect LinkedIn', {
        description: errorMessage,
      })
    },
  })
}


