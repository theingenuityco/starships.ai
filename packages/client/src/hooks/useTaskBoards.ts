import { taskBoardAPI } from '@/lib/api'
import type { TaskBoardDetailsResponse, TaskCardModel } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'

export const TASK_BOARD_QUERY_KEYS = {
  all: ['task-boards'] as const,
  byId: (boardId: string) => [...TASK_BOARD_QUERY_KEYS.all, 'board', boardId] as const,
  cards: (boardId: string) => [...TASK_BOARD_QUERY_KEYS.byId(boardId), 'cards'] as const,
}

export function useTaskBoardDetails(boardId: string, enabled = true) {
  return useQuery({
    queryKey: TASK_BOARD_QUERY_KEYS.byId(boardId),
    queryFn: (): Promise<TaskBoardDetailsResponse> => taskBoardAPI.getBoard(boardId),
    enabled: Boolean(boardId) && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useTaskBoardCards(boardId: string, enabled = true) {
  return useQuery({
    queryKey: TASK_BOARD_QUERY_KEYS.cards(boardId),
    queryFn: (): Promise<TaskCardModel[]> => taskBoardAPI.listCards(boardId),
    enabled: Boolean(boardId) && enabled,
    staleTime: 5 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}
