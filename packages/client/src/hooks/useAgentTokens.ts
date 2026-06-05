import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

// Connection-token metadata as returned by the server. The raw secret is NEVER
// included here — it is only present in the one-time mint response.
export interface PublicAgentToken {
  id: string
  agentId: string
  name: string | null
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface MintTokenResult {
  token: string // sk-ship-… raw secret, shown exactly once
  record: PublicAgentToken
}

export const AGENT_TOKEN_QUERY_KEYS = {
  all: ['agent-tokens'] as const,
  byStarship: (starshipId: string) => [...AGENT_TOKEN_QUERY_KEYS.all, 'starship', starshipId] as const,
}

/** List connection tokens (metadata only) for a starship. */
export function useStarshipAgentTokens(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_TOKEN_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<PublicAgentToken[]> => {
      const response: FetchResponse<ApiResponse<PublicAgentToken[]>> = await api.get(
        `/api/v1/starships/${starshipId}/agent-tokens`
      )
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

/** Mint a new connection token for an agent. Raw secret is returned once. */
export function useMintAgentToken(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { agentId: string; name?: string; expiresAt?: string }): Promise<MintTokenResult> => {
      const response: FetchResponse<ApiResponse<MintTokenResult>> = await api.post(
        `/api/v1/starships/${starshipId}/agent-tokens`,
        input
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_TOKEN_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to create connection token', { description: getSafeErrorMessage(error) })
    },
  })
}

/** Revoke a connection token by id. */
export function useRevokeAgentToken(starshipId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tokenId: string): Promise<{ revoked: boolean }> => {
      const response: FetchResponse<ApiResponse<{ revoked: boolean }>> = await api.delete(`/api/v1/agent-tokens/${tokenId}`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_TOKEN_QUERY_KEYS.byStarship(starshipId) })
      toast.success('Token revoked')
    },
    onError: (error: unknown) => {
      toast.error('Failed to revoke token', { description: getSafeErrorMessage(error) })
    },
  })
}
