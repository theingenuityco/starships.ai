import api from '@/lib/api'
import type { ApiResponse, AcceptStarshipInviteResponse, CreateStarshipInviteRequest, CreateStarshipInviteResponse, StarshipModel } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'

export function useCreateStarshipInvite(starshipId: string) {
  return useMutation({
    mutationFn: async (payload: CreateStarshipInviteRequest): Promise<CreateStarshipInviteResponse> => {
      const res: FetchResponse<ApiResponse<CreateStarshipInviteResponse>> = await api.post(`/api/v1/starships/${starshipId}/invites`, payload)
      return res.data.data
    },
    onSuccess: data => {
      toast.success('Invite created', {
        description: data.inviteUrl ? 'Invite link generated and email sent.' : 'Invite created.',
      })
    },
    onError: (error: any) => {
      toast.error('Failed to create invite', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useAcceptStarshipInvite(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string): Promise<StarshipModel> => {
      const res: FetchResponse<ApiResponse<AcceptStarshipInviteResponse>> = await api.post('/api/v1/starship-invites/accept', { token })
      return res.data.data.starship
    },
    onSuccess: (_starship, _token) => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.byOwner(userId) })
      }
    },
    onError: (error: unknown) => {
      toast.error('Failed to accept invite', { description: getSafeErrorMessage(error) })
    },
  })
}
