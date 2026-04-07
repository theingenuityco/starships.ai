'use client'

import React, { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import type { TaskBoardModel, TaskBoardDetailsResponse, TaskCardModel, TaskColumnModel } from '@starships/protocol'

interface GoalsColumnProps {
  starshipId: string | undefined
}

const taskBoardsClient = {
  listBoardsByStarship: async (starshipId: string): Promise<TaskBoardModel[]> => {
    const res = await api.get<ApiResponse<{ boards: TaskBoardModel[] }>>(`/api/v1/starships/${starshipId}/task-boards`)
    return res.data.data?.boards ?? []
  },
  getBoard: async (starshipId: string, boardId: string): Promise<TaskBoardDetailsResponse> => {
    const res = await api.get<ApiResponse<TaskBoardDetailsResponse>>(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardId)}`)
    return res.data.data
  },
  listCards: async (starshipId: string, boardId: string): Promise<TaskCardModel[]> => {
    const res = await api.get<ApiResponse<{ cards: TaskCardModel[] }>>(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardId)}/cards`)
    return res.data.data?.cards ?? []
  },
}

const DONE_KEYWORDS = ['done', 'completed', 'finished', 'closed', 'resolved', 'shipped', 'released']

function isDoneColumn(name: string): boolean {
  const lower = name.toLowerCase()
  return DONE_KEYWORDS.some(k => lower.includes(k))
}

export function GoalsColumn({ starshipId }: GoalsColumnProps) {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  const { data: boards = [], isLoading: boardsLoading } = useQuery<TaskBoardModel[]>({
    queryKey: ['task-boards', starshipId],
    queryFn: () => taskBoardsClient.listBoardsByStarship(starshipId!),
    enabled: !!starshipId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const boardDetailQueries = useQueries({
    queries: boards.map(board => ({
      queryKey: ['task-board', starshipId, board.id],
      queryFn: () => taskBoardsClient.getBoard(starshipId!, board.id),
      enabled: !!starshipId && !!board.id,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  })

  const cardQueries = useQueries({
    queries: boards.map(board => ({
      queryKey: ['task-cards', starshipId, board.id],
      queryFn: () => taskBoardsClient.listCards(starshipId!, board.id),
      enabled: !!starshipId && !!board.id,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    })),
  })

  const columnNamesByBoard = useMemo(() => {
    const map: Record<string, Record<string, string>> = {}
    boards.forEach((board, idx) => {
      const details = boardDetailQueries[idx]?.data
      map[board.id] = {}
      if (Array.isArray(details?.columns)) {
        for (const col of details!.columns as TaskColumnModel[]) {
          map[board.id][col.id] = col.title
        }
      }
    })
    return map
  }, [boards, boardDetailQueries])

  const totalActiveCards = useMemo(() => {
    return cardQueries.reduce((sum, q) => {
      return sum + (q.data ?? []).filter(c => c.archivedAt == null).length
    }, 0)
  }, [cardQueries])

  const isLoading = boardsLoading

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 flex-shrink-0">
            <Icon name="list" className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <span className="text-sm font-semibold">Goals</span>
          {totalActiveCards > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-1.5 h-[18px] min-w-[18px]">
              {totalActiveCards}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/ship/${slug}/tasks`)}
        >
          View all
          <Icon name="arrow-right" className="ml-1 h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {isLoading ? (
            <div className="space-y-3 px-1 pt-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-8 w-full rounded-md" />
                  <Skeleton className="h-8 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                <Icon name="list" className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground/70 mb-1">No task boards yet</p>
              <p className="text-xs text-muted-foreground mb-3">Create a board to track your goals</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => router.push(`/ship/${slug}/tasks`)}
              >
                Create a board
              </Button>
            </div>
          ) : (
            boards.map((board, boardIdx) => {
              const cards = cardQueries[boardIdx]?.data ?? []
              const activeCards = cards.filter(c => c.archivedAt == null)
              const colNames = columnNamesByBoard[board.id] ?? {}
              const doneCards = activeCards.filter(c => isDoneColumn(colNames[c.columnId] ?? ''))
              const total = activeCards.length
              const done = doneCards.length
              const progressPct = total > 0 ? Math.round((done / total) * 100) : 0
              const cardsLoading = cardQueries[boardIdx]?.isLoading

              return (
                <div key={board.id} className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
                  {/* Board header */}
                  <div className="px-3 py-2.5 border-b border-border/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon name="layout" className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                      <span className="text-xs font-semibold text-foreground/80 truncate flex-1">
                        {board.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 tabular-nums">
                        {done}/{total}
                      </span>
                    </div>
                    {total > 0 && (
                      <Progress value={progressPct} className="h-1 bg-blue-500/10" />
                    )}
                  </div>

                  {/* Cards */}
                  <div className="p-1.5 space-y-0.5">
                    {cardsLoading ? (
                      <>
                        <Skeleton className="h-7 w-full rounded" />
                        <Skeleton className="h-7 w-full rounded" />
                      </>
                    ) : activeCards.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-2">No tasks yet</p>
                    ) : (
                      <>
                        {activeCards.slice(0, 6).map(card => {
                          const colName = colNames[card.columnId] ?? null
                          const isDone = colName ? isDoneColumn(colName) : false
                          return (
                            <div
                              key={card.id}
                              className={cn(
                                'flex items-center gap-2 rounded-md px-2 py-1.5 group',
                                'hover:bg-muted/50 transition-colors'
                              )}
                            >
                              <div className={cn(
                                'h-3.5 w-3.5 rounded flex-shrink-0 flex items-center justify-center border',
                                isDone
                                  ? 'bg-blue-500 border-blue-500 text-white'
                                  : 'border-border/60 bg-background'
                              )}>
                                {isDone && <Icon name="check" className="h-2 w-2" />}
                              </div>
                              <span className={cn(
                                'flex-1 text-xs truncate',
                                isDone ? 'text-muted-foreground line-through' : 'text-foreground/90'
                              )}>
                                {card.title}
                              </span>
                              {colName && !isDone && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 px-1 flex-shrink-0 font-normal border-border/40 text-muted-foreground"
                                >
                                  {colName}
                                </Badge>
                              )}
                            </div>
                          )
                        })}
                        {activeCards.length > 6 && (
                          <button
                            type="button"
                            onClick={() => router.push(`/ship/${slug}/tasks`)}
                            className="w-full text-left text-[10px] text-muted-foreground px-2 py-1 hover:text-foreground transition-colors"
                          >
                            +{activeCards.length - 6} more tasks
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
