import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

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

