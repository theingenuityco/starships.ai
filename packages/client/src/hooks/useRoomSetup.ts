import api from '@/lib/api'
import type { ApiResponse, RoomSetupStatus } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

// Local mirror of the API client's response envelope (see useRooms.ts).
interface FetchResponse<T = unknown> {
  data: T
}

export const ROOM_SETUP_QUERY_KEYS = {
  status: (roomConversationId: string) => ['rooms', 'setup', roomConversationId] as const,
} as const

/**
 * Setup state for a room (or null if the room has no setup process). Drives the setup
 * gate: which required connectors are connected, whether the room's data is seeded.
 */
export function useRoomSetupStatus(roomConversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_SETUP_QUERY_KEYS.status(roomConversationId),
    queryFn: async (): Promise<RoomSetupStatus | null> => {
      const response: FetchResponse<ApiResponse<{ setup: RoomSetupStatus | null }>> = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/setup-status`
      )
      return response.data.data?.setup ?? null
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/** Manually (re-)run a room's setup processing (e.g. re-import GitHub repositories). */
export function useRunRoomSetup(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<RoomSetupStatus | null> => {
      const response: FetchResponse<ApiResponse<{ setup: RoomSetupStatus }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/setup-run`,
        {}
      )
      return response.data.data?.setup ?? null
    },
    onSuccess: async (setup) => {
      await qc.invalidateQueries({ queryKey: ROOM_SETUP_QUERY_KEYS.status(roomConversationId) })
      if (setup?.summary) toast.success('Room setup complete', { description: setup.summary })
    },
    onError: (error: unknown) => {
      toast.error('Failed to run room setup', { description: getSafeErrorMessage(error) })
    },
  })
}
