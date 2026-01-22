import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error('Failed to revoke invite', { description: getSafeErrorMessage(error) })
    },
  })
}

