import api from '@/lib/api'
import type { ApiResponse, PaginationMeta } from '@starships/protocol'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

export type StarshipMemberRole = 'owner' | 'admin' | 'collaborator'
export type StarshipInviteRole = 'admin' | 'collaborator'

export type StarshipMemberListItem = {
  userId: string
  role: StarshipMemberRole
  createdAt: string
  email: string | null
  displayName: string | null
  avatar: string | null
}

export type StarshipInviteListItem = {
  invitedEmail: string
  invitedByUserId: string | null
  role: StarshipInviteRole
  createdAt: string
  expiresAt: string
}

export type StarshipMembersAndInvitesResponse = {
  members: StarshipMemberListItem[]
  invites: StarshipInviteListItem[]
}

export const STARSHIP_MEMBERS_QUERY_KEYS = {
  all: ['starships', 'members'] as const,
  byStarship: (starshipId: string) => [...STARSHIP_MEMBERS_QUERY_KEYS.all, starshipId] as const,
  byStarshipPaged: (starshipId: string, limit: number) => [...STARSHIP_MEMBERS_QUERY_KEYS.all, starshipId, 'paged', { limit }] as const,
}

export function useStarshipMembersAndInvites(starshipId: string, enabled: boolean) {
  return useQuery({
    queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipId),
    enabled: Boolean(enabled && starshipId),
    queryFn: async (): Promise<StarshipMembersAndInvitesResponse> => {
      const res: FetchResponse<ApiResponse<StarshipMembersAndInvitesResponse>> = await api.get(`/api/v1/starships/${starshipId}/members`)
      return res.data.data
    },
    retry: false,
  })
}

export type StarshipMembersAndInvitesPage = StarshipMembersAndInvitesResponse & { pagination: PaginationMeta | null }

export function useInfiniteStarshipMembers(starshipId: string, enabled: boolean, options?: { limit?: number }) {
  const limit = options?.limit ?? 50
  return useInfiniteQuery({
    queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarshipPaged(starshipId, limit),
    enabled: Boolean(enabled && starshipId),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<StarshipMembersAndInvitesPage> => {
      const page = typeof pageParam === 'number' ? pageParam : Number(pageParam)
      const res: FetchResponse<ApiResponse<StarshipMembersAndInvitesResponse>> = await api.get(`/api/v1/starships/${starshipId}/members`, {
        params: { page, limit },
      })
      return {
        ...res.data.data,
        pagination: res.data.meta?.pagination ?? null,
      }
    },
    getNextPageParam: last => {
      const p = last?.pagination
      if (!p) return undefined
      return p.has_next ? p.page + 1 : undefined
    },
    retry: false,
  })
}

export function useRemoveStarshipMember(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberUserId: string): Promise<{ removed: boolean }> => {
      const res: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/starships/${starshipId}/members/${memberUserId}`)
      return res.data.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipId) })
      toast.success('Member removed')
    },
    onError: (error: unknown) => {
      toast.error('Failed to remove member', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useRevokeStarshipInvite(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string): Promise<{ revokedCount: number }> => {
      const url = `/api/v1/starships/${starshipId}/invites?${new URLSearchParams({ email }).toString()}`
      const res: FetchResponse<ApiResponse<{ revokedCount: number }>> = await api.delete(url)
      return res.data.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: STARSHIP_MEMBERS_QUERY_KEYS.byStarship(starshipId) })
      toast.success('Invite revoked', { description: `Revoked ${data.revokedCount} invite(s).` })
    },
    onError: (error: unknown) => {
      toast.error('Failed to revoke invite', { description: getSafeErrorMessage(error) })
    },
  })
}

