import api from '@/lib/api'
import type { ApiResponse, RoomModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedTool, RoomPinnedView, TaskBoardModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

// Import FetchResponse type (kept local to avoid cross-hook coupling).
interface FetchResponse<T = unknown> {
  data: T
}

export const ROOM_QUERY_KEYS = {
  all: ['rooms'] as const,
  byStarship: (starshipId: string) => [...ROOM_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (roomConversationId: string) => [...ROOM_QUERY_KEYS.all, 'detail', roomConversationId] as const,
  pins: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'pins'] as const,
  participation: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'participation'] as const,
  participants: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'participants'] as const,
  inviteApprovalsPending: (roomConversationId: string, conversationId: string) =>
    [...ROOM_QUERY_KEYS.detail(roomConversationId), 'invite-approvals', 'pending', conversationId] as const,
} as const

export type PendingRoomInviteApproval = {
  id: string
  roomConversationId: string
  conversationId: string
  messageId: string
  createdAt: string
  requestedByUserId: string | null
  requestedByLabel: string | null
  users: Array<{ id: string; label: string }>
  agents: Array<{ id: string; label: string }>
}

export function useStarshipRooms(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ rooms: RoomModel[] }> => {
      const response: FetchResponse<ApiResponse<{ rooms: RoomModel[] }>> = await api.get(`/api/v1/starships/${starshipId}/rooms`)
      return { rooms: response.data.data?.rooms || [] }
    },
    enabled: !!starshipId && enabled,
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 5 * 60 * 1000,
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 10 * 60 * 1000,
  })
}

export function useRoomPins(roomConversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.pins(roomConversationId),
    queryFn: async (): Promise<{ views: RoomPinnedView[]; datasets: RoomPinnedDataset[]; taskBoards: RoomPinnedTaskBoard[]; tools: RoomPinnedTool[] }> => {
      const response: FetchResponse<
        ApiResponse<{ views: RoomPinnedView[]; datasets: RoomPinnedDataset[]; taskBoards: RoomPinnedTaskBoard[]; tools: RoomPinnedTool[] }>
      > = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/pins`
      )
      return {
        views: response.data.data?.views || [],
        datasets: response.data.data?.datasets || [],
        taskBoards: response.data.data?.taskBoards || [],
        tools: response.data.data?.tools || [],
      }
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 10_000,
  })
}

export function useRoomParticipation(roomConversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.participation(roomConversationId),
    queryFn: async (): Promise<{ isParticipant: boolean; isPrivate: boolean; canJoin: boolean }> => {
      const response: FetchResponse<ApiResponse<{ isParticipant: boolean; isPrivate: boolean; canJoin: boolean }>> = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/participation`
      )
      return {
        isParticipant: Boolean(response.data.data?.isParticipant),
        isPrivate: Boolean(response.data.data?.isPrivate),
        canJoin: Boolean(response.data.data?.canJoin),
      }
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 5_000,
  })
}

export function useJoinRoom(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response: FetchResponse<ApiResponse<{ joined: boolean; created: boolean }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/join`,
        {}
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participation(roomConversationId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomConversationId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to join room', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useLeaveRoom(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response: FetchResponse<ApiResponse<{ left: boolean; removed: boolean }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/leave`,
        {}
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participation(roomConversationId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomConversationId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to leave room', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useRoomParticipants(roomConversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.participants(roomConversationId),
    queryFn: async (): Promise<{ userIds: string[]; agentIds: string[] }> => {
      const response: FetchResponse<ApiResponse<{ userIds: string[]; agentIds: string[] }>> = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/participants`
      )
      return {
        userIds: (response.data.data?.userIds || []).map((x: unknown) => String(x)).filter(Boolean),
        agentIds: (response.data.data?.agentIds || []).map((x: unknown) => String(x)).filter(Boolean),
      }
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 5_000,
  })
}

export function useRoomInviteApprovalsPending(roomConversationId: string, conversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.inviteApprovalsPending(roomConversationId, conversationId),
    queryFn: async (): Promise<{ approvals: PendingRoomInviteApproval[] }> => {
      const response: FetchResponse<ApiResponse<{ approvals: PendingRoomInviteApproval[] }>> = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/invite-approvals/pending`,
        { params: { conversationId } }
      )
      return { approvals: Array.isArray(response.data.data?.approvals) ? response.data.data!.approvals : [] }
    },
    enabled: !!roomConversationId && !!conversationId && enabled,
    staleTime: 2_000,
  })
}

export function useApproveRoomInviteApproval(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { approvalId: string; conversationId: string }) => {
      const response: FetchResponse<ApiResponse<{ status: string }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/invite-approvals/${encodeURIComponent(args.approvalId)}/approve`,
        {}
      )
      return response.data.data
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.inviteApprovalsPending(roomConversationId, vars.conversationId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to approve invite', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useDenyRoomInviteApproval(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { approvalId: string; conversationId: string }) => {
      const response: FetchResponse<ApiResponse<{ status: string }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/invite-approvals/${encodeURIComponent(args.approvalId)}/deny`,
        {}
      )
      return response.data.data
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.inviteApprovalsPending(roomConversationId, vars.conversationId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to deny invite', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useCreateRoom(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { slug: string; name: string; isPrivate?: boolean; topic?: string | null }) => {
      const response: FetchResponse<ApiResponse<{ room: RoomModel; conversationId: string }>> = await api.post(`/api/v1/starships/${starshipId}/rooms`, {
        slug: args.slug,
        name: args.name,
        isPrivate: args.isPrivate,
        topic: args.topic ?? null,
      })
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to create room', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUpdateRoom(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { roomId: string; name?: string; isPrivate?: boolean; topic?: string | null }) => {
      const response: FetchResponse<ApiResponse<{ room: RoomModel }>> = await api.patch(`/api/v1/rooms/${encodeURIComponent(args.roomId)}`, {
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.isPrivate !== undefined ? { isPrivate: args.isPrivate } : {}),
        ...(args.topic !== undefined ? { topic: args.topic } : {}),
      })
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to update room', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useDeleteRoom(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (roomId: string) => {
      const response: FetchResponse<ApiResponse<{ deleted: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomId)}`)
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to delete room', { description: getSafeErrorMessage(error) })
    },
  })
}

export function usePinRoomView(roomId: string, starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { viewId: string; position?: number }) => {
      const response: FetchResponse<ApiResponse<{ pin: RoomPinnedView }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/views`, {
        viewId: args.viewId,
        ...(args.position !== undefined ? { position: args.position } : {}),
      })
      return response.data.data?.pin
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to pin view', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUnpinRoomView(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (viewId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/views/${encodeURIComponent(viewId)}`
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to unpin view', { description: getSafeErrorMessage(error) })
    },
  })
}

export function usePinRoomDataset(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { datasetId: string; position?: number }) => {
      const response: FetchResponse<ApiResponse<{ pin: RoomPinnedDataset }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/datasets`, {
        datasetId: args.datasetId,
        ...(args.position !== undefined ? { position: args.position } : {}),
      })
      return response.data.data?.pin
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to pin dataset', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUnpinRoomDataset(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (datasetId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/datasets/${encodeURIComponent(datasetId)}`
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to unpin dataset', { description: getSafeErrorMessage(error) })
    },
  })
}

export function usePinRoomTaskBoard(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { boardId: string; position?: number }) => {
      const response: FetchResponse<ApiResponse<{ pin: RoomPinnedTaskBoard }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/task-boards`, {
        boardId: args.boardId,
        ...(args.position !== undefined ? { position: args.position } : {}),
      })
      return response.data.data?.pin
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to pin task board', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUnpinRoomTaskBoard(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boardId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/task-boards/${encodeURIComponent(boardId)}`
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to unpin task board', { description: getSafeErrorMessage(error) })
    },
  })
}

export function usePinRoomTool(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { toolId: string; position?: number }) => {
      const response: FetchResponse<ApiResponse<{ pin: RoomPinnedTool }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/tools`, {
        toolId: args.toolId,
        ...(args.position !== undefined ? { position: args.position } : {}),
      })
      return response.data.data?.pin
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to pin tool', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUnpinRoomTool(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (toolId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/tools/${encodeURIComponent(toolId)}`
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to unpin tool', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useReorderPinnedRoomTools(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (toolIds: string[]) => {
      const response: FetchResponse<ApiResponse<{ tools: RoomPinnedTool[] }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/tools/reorder`, {
        toolIds,
      })
      return response.data.data?.tools || []
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
  })
}

export function useReorderPinnedRoomViews(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (viewIds: string[]) => {
      const response: FetchResponse<ApiResponse<{ views: RoomPinnedView[] }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/views/reorder`, {
        viewIds,
      })
      return response.data.data?.views || []
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
  })
}

export function useReorderPinnedRoomDatasets(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (datasetIds: string[]) => {
      const response: FetchResponse<ApiResponse<{ datasets: RoomPinnedDataset[] }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/datasets/reorder`,
        { datasetIds }
      )
      return response.data.data?.datasets || []
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
  })
}

export function useReorderPinnedRoomTaskBoards(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boardIds: string[]) => {
      const response: FetchResponse<ApiResponse<{ taskBoards: RoomPinnedTaskBoard[] }>> = await api.post(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/pins/task-boards/reorder`,
        { boardIds }
      )
      return response.data.data?.taskBoards || []
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.pins(roomId) })
    },
  })
}

export function useStarshipTaskBoards(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['task-boards', starshipId],
    queryFn: async (): Promise<TaskBoardModel[]> => {
      const res: FetchResponse<ApiResponse<{ boards: TaskBoardModel[] }>> = await api.get(`/api/v1/starships/${starshipId}/task-boards`)
      return (res.data.data?.boards || []) as TaskBoardModel[]
    },
    enabled: !!starshipId && enabled,
    staleTime: 10_000,
  })
}

