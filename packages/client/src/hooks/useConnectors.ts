import api from '@/lib/api'
import type {
  ApiResponse,
  ConnectWithApiKeyRequest,
  ConnectWithBasicAuthRequest,
  ConnectorCatalogItem,
  ConnectorCatalogResponse,
  ConnectorListItem,
  ConnectorListResponse,
  ConnectorModel,
  ConnectorProvider,
  StartOAuthRequest,
  StartOAuthResponse,
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
      const response: FetchResponse<ApiResponse<ConnectorListResponse>> = await api.get(`/api/v1/starships/${starshipId}/connectors`)
      return response.data.data.connectors
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useDisconnectConnector(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: ConnectorProvider): Promise<void> => {
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

export function useRefreshConnector(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: ConnectorProvider): Promise<void> => {
      await api.post(`/api/v1/starships/${starshipId}/connectors/${provider}/refresh`)
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId),
      })

      toast.success('Connector refreshed', {
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} connector has been refreshed.`,
      })
    },
    onError: (error: any, provider) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to refresh connector'
      const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Connector'
      toast.error(`Failed to refresh ${providerLabel}`, {
        description: errorMessage,
      })
    },
  })
}

export function useTestConnector(starshipId: string) {
  return useMutation({
    mutationFn: async (provider: ConnectorProvider): Promise<{ ok: boolean; error?: string }> => {
      const response: FetchResponse<ApiResponse<{ ok: boolean; error?: string }>> = await api.post(`/api/v1/starships/${starshipId}/connectors/${provider}/test`)
      return response.data.data
    },
    onError: (error: any, provider) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to test connector'
      const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Connector'
      toast.error(`Failed to test ${providerLabel}`, {
        description: errorMessage,
      })
    },
  })
}

export function useStartOAuthConnector(starshipId: string) {
  return useMutation({
    mutationFn: async (
      input:
        | ConnectorProvider
        | {
            provider: ConnectorProvider
            metadata?: StartOAuthRequest['metadata']
          }
    ): Promise<string> => {
      const provider = typeof input === 'string' ? input : input.provider
      const body: StartOAuthRequest | undefined = typeof input === 'string' ? undefined : { metadata: input.metadata }
      const response: FetchResponse<ApiResponse<StartOAuthResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/connectors/${provider}/start`,
        body,
      )
      return response.data.data.authorizationUrl
    },
    onError: (error: any, provider) => {
      const code = error?.response?.data?.error?.code
      const details = error?.response?.data?.error?.details

      // For dynamic OAuth URLs (e.g. tenant-specific URLs), the UI should prompt for metadata instead of toasting.
      if (code === 'MISSING_REQUIRED_FIELD' && details?.kind === 'connector_oauth_pre_metadata') {
        return
      }

      const errorMessage = error?.response?.data?.error?.message || error?.message || 'Failed to start connector OAuth flow'
      const providerLabel = provider ? String(provider).charAt(0).toUpperCase() + String(provider).slice(1) : 'Connector'
      toast.error(`Failed to connect ${providerLabel}`, { description: errorMessage })
    },
  })
}

export function useConnectApiKeyConnector(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      provider,
      apiKey,
      extraConfig,
    }: {
      provider: ConnectorProvider
      apiKey: string
      extraConfig?: Record<string, unknown>
    }): Promise<ConnectorModel> => {
      const payload: ConnectWithApiKeyRequest = { apiKey, extraConfig }
      const response: FetchResponse<ApiResponse<{ connector: ConnectorModel }>> = await api.post(
        `/api/v1/starships/${starshipId}/connectors/${provider}/api-key`,
        payload
      )
      return response.data.data.connector
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId) })
      toast.success('Connector connected', {
        description: `${String(vars.provider).charAt(0).toUpperCase() + String(vars.provider).slice(1)} connector has been connected.`,
      })
    },
    onError: (error: any, vars) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to connect connector'
      const providerLabel = vars?.provider ? String(vars.provider).charAt(0).toUpperCase() + String(vars.provider).slice(1) : 'Connector'
      toast.error(`Failed to connect ${providerLabel}`, { description: errorMessage })
    },
  })
}

export function useConnectBasicAuthConnector(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      provider,
      username,
      password,
      extraConfig,
    }: {
      provider: ConnectorProvider
      username: string
      password?: string
      extraConfig?: Record<string, unknown>
    }): Promise<ConnectorModel> => {
      const payload: ConnectWithBasicAuthRequest = { username, password, extraConfig }
      const response: FetchResponse<ApiResponse<{ connector: ConnectorModel }>> = await api.post(
        `/api/v1/starships/${starshipId}/connectors/${provider}/basic`,
        payload
      )
      return response.data.data.connector
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId) })
      toast.success('Connector connected', {
        description: `${String(vars.provider).charAt(0).toUpperCase() + String(vars.provider).slice(1)} connector has been connected.`,
      })
    },
    onError: (error: any, vars) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to connect connector'
      const providerLabel = vars?.provider ? String(vars.provider).charAt(0).toUpperCase() + String(vars.provider).slice(1) : 'Connector'
      toast.error(`Failed to connect ${providerLabel}`, { description: errorMessage })
    },
  })
}

export function useStartGoogleDriveOAuth(starshipId: string) {
  // Google Drive connector temporarily disabled on client
  // return useMutation({
  //   mutationFn: async (): Promise<string> => {
  //     const response: FetchResponse<ApiResponse<{ authorizationUrl: string }>> = await api.post(
  //       `/api/v1/starships/${starshipId}/connectors/google_drive/oauth/start`,
  //     )
  //     return response.data.data.authorizationUrl
  //   },
  //   onError: (error: any) => {
  //     const errorMessage = error?.response?.data?.error || error?.message || 'Failed to start Google Drive connection'
  //     toast.error('Failed to connect Google Drive', {
  //       description: errorMessage,
  //     })
  //   },
  // })
  throw new Error('Google Drive connector is currently disabled in the client')
}

export function useConfigureGitHubConnector(starshipId: string) {
  // GitHub connector temporarily disabled on client
  // const queryClient = useQueryClient()
  //
  // return useMutation({
  //   mutationFn: async (payload: {
  //     installationId: string
  //     defaultOwner?: string
  //     defaultRepo?: string
  //   }): Promise<void> => {
  //     await api.post(`/api/v1/starships/${starshipId}/connectors/github/app-config`, payload)
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({
  //       queryKey: CONNECTOR_QUERY_KEYS.byStarship(starshipId),
  //     })
  //     toast.success('GitHub connector configured', {
  //       description: 'GitHub App installation has been linked to this starship.',
  //     })
  //   },
  //   onError: (error: any) => {
  //     const errorMessage =
  //       error?.response?.data?.error || error?.message || 'Failed to configure GitHub connector'
  //     toast.error('Failed to configure GitHub', {
  //       description: errorMessage,
  //     })
  //   },
  // })
  throw new Error('GitHub connector is currently disabled in the client')
}
