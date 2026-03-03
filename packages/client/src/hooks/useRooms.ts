import api from '@/lib/api'
import type { ApiResponse, RoomModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedTool, RoomPinnedView, TaskBoardModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

// Import FetchResponse type (kept local to avoid cross-hook coupling).
interface FetchResponse<T = any> {
  data: T
}

export const ROOM_QUERY_KEYS = {
  all: ['rooms'] as const,
  byStarship: (starshipId: string) => [...ROOM_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (roomConversationId: string) => [...ROOM_QUERY_KEYS.all, 'detail', roomConversationId] as const,
  pins: (roomConversationId: string) => [...ROOM_QUERY_KEYS.detail(roomConversationId), 'pins'] as const,
} as const

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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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

