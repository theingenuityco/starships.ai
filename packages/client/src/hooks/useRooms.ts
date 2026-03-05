import api from '@/lib/api'
import type { ApiResponse, RoomModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedView, RoomToolAssignment, TaskBoardModel } from '@starships/protocol'
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
  tools: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'tools'] as const,
  participation: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'participation'] as const,
  participants: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'participants'] as const,
  inviteApprovalsPending: (roomConversationId: string, conversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'invite-approvals', 'pending', conversationId] as const,
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
    queryFn: async (): Promise<{ views: RoomPinnedView[]; datasets: RoomPinnedDataset[]; taskBoards: RoomPinnedTaskBoard[] }> => {
      const response: FetchResponse<ApiResponse<{ views: RoomPinnedView[]; datasets: RoomPinnedDataset[]; taskBoards: RoomPinnedTaskBoard[] }>> = await api.get(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/pins`
      )
      return {
        views: response.data.data?.views || [],
        datasets: response.data.data?.datasets || [],
        taskBoards: response.data.data?.taskBoards || [],
      }
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 10_000,
  })
}

export type RoomToolItem = {
  assignment: RoomToolAssignment
  tool: { id: string; name: string; slug: string; description: string; createdAt: string; updatedAt: string }
}

export function useRoomTools(roomConversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.tools(roomConversationId),
    queryFn: async (): Promise<{ items: RoomToolItem[] }> => {
      const response: FetchResponse<ApiResponse<{ items: RoomToolItem[] }>> = await api.get(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/tools`)
      return { items: Array.isArray(response.data.data?.items) ? response.data.data!.items : [] }
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
      const response: FetchResponse<ApiResponse<{ joined: boolean; created: boolean }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/join`, {})
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
      const response: FetchResponse<ApiResponse<{ left: boolean; removed: boolean }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/leave`, {})
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
      const response: FetchResponse<ApiResponse<{ userIds: string[]; agentIds: string[] }>> = await api.get(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/participants`)
      return {
        userIds: (response.data.data?.userIds || []).map((x: unknown) => String(x)).filter(Boolean),
        agentIds: (response.data.data?.agentIds || []).map((x: unknown) => String(x)).filter(Boolean),
      }
    },
    enabled: !!roomConversationId && enabled,
    staleTime: 5_000,
  })
}

export function useAddRoomMember(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { userId: string; role?: 'member' | 'admin' }) => {
      const userId = String(args.userId || '').trim()
      if (!userId) throw new Error('Missing userId')
      const response: FetchResponse<ApiResponse<{ created: boolean }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/members`, {
        userId,
        ...(args.role ? { role: args.role } : {}),
      })
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      toast.success('Participant added')
    },
    onError: (error: unknown) => {
      toast.error('Failed to add participant', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useRemoveRoomMember(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const uid = String(userId || '').trim()
      if (!uid) throw new Error('Missing userId')
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(
        `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/members/${encodeURIComponent(uid)}`
      )
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      toast.success('Participant removed')
    },
    onError: (error: unknown) => {
      toast.error('Failed to remove participant', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useAddRoomAgent(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { agentId: string }) => {
      const agentId = String(args.agentId || '').trim()
      if (!agentId) throw new Error('Missing agentId')
      const response: FetchResponse<ApiResponse<{ created: boolean }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/agents`, {
        agentId,
      })
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      toast.success('Agent added')
    },
    onError: (error: unknown) => {
      toast.error('Failed to add agent', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useRemoveRoomAgent(roomConversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (agentId: string) => {
      const aid = String(agentId || '').trim()
      if (!aid) throw new Error('Missing agentId')
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/agents/${encodeURIComponent(aid)}`)
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomConversationId) })
      toast.success('Agent removed')
    },
    onError: (error: unknown) => {
      toast.error('Failed to remove agent', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useRoomInviteApprovalsPending(roomConversationId: string, conversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ROOM_QUERY_KEYS.inviteApprovalsPending(roomConversationId, conversationId),
    queryFn: async (): Promise<{ approvals: PendingRoomInviteApproval[] }> => {
      const response: FetchResponse<ApiResponse<{ approvals: PendingRoomInviteApproval[] }>> = await api.get(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/invite-approvals/pending`, {
        params: { conversationId },
      })
      return { approvals: Array.isArray(response.data.data?.approvals) ? response.data.data!.approvals : [] }
    },
    enabled: !!roomConversationId && !!conversationId && enabled,
    // Avoid polling: live updates are driven by SSE ui_actions invalidating this query.
    // Keep a moderate staleTime for hydration and "missed SSE" recovery without hammering the API.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/views/${encodeURIComponent(viewId)}`)
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
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/datasets/${encodeURIComponent(datasetId)}`)
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
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/task-boards/${encodeURIComponent(boardId)}`)
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

export function useAssignRoomTool(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { toolId: string; permission?: 'allow' | 'ask' | 'deny' }) => {
      const response: FetchResponse<ApiResponse<{ assignment: RoomToolAssignment }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/tools`, {
        toolId: args.toolId,
        ...(args.permission ? { permission: args.permission } : {}),
      })
      return response.data.data?.assignment
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.tools(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to assign tool', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUnassignRoomTool(roomId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (toolId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/rooms/${encodeURIComponent(roomId)}/tools/${encodeURIComponent(toolId)}`)
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.tools(roomId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to unassign tool', { description: getSafeErrorMessage(error) })
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
      const response: FetchResponse<ApiResponse<{ datasets: RoomPinnedDataset[] }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/datasets/reorder`, { datasetIds })
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
      const response: FetchResponse<ApiResponse<{ taskBoards: RoomPinnedTaskBoard[] }>> = await api.post(`/api/v1/rooms/${encodeURIComponent(roomId)}/pins/task-boards/reorder`, { boardIds })
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
