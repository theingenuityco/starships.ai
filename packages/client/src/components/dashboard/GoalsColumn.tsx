'use client'

import React, { useMemo } from 'react'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import type { TaskBoardModel, TaskCardModel, TaskColumnModel } from '@starships/protocol'

interface GoalsColumnProps {
  starshipId: string | undefined
}

const taskBoardsClient = {
  listBoardsByStarship: async (starshipId: string): Promise<TaskBoardModel[]> => {
    const res = await api.get<ApiResponse<{ boards: TaskBoardModel[] }>>(`/api/v1/starships/${starshipId}/task-boards`)
    return res.data.data?.boards ?? []
  },
  getBoard: async (starshipId: string, boardId: string): Promise<{ columns?: TaskColumnModel[] }> => {
    const res = await api.get<ApiResponse<{ columns?: TaskColumnModel[] }>>(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardId)}`)
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

  type BoardData = { columns: Record<string, string>; cards: TaskCardModel[]; isLoading: boolean }

  const boardDataQueries = useQueries({
    queries: boards.map(board => ({
      queryKey: ['task-board-full', starshipId, board.id],
      queryFn: async (): Promise<BoardData> => {
        const [details, cards] = await Promise.all([
          taskBoardsClient.getBoard(starshipId!, board.id),
          taskBoardsClient.listCards(starshipId!, board.id),
        ])
        const columns: Record<string, string> = {}
        for (const col of (details?.columns ?? []) as TaskColumnModel[]) {
          columns[col.id] = col.title
        }
        return { columns, cards, isLoading: false }
      },
      enabled: !!starshipId && !!board.id,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    })),
  }) as UseQueryResult<BoardData>[]

  const totalActiveCards = useMemo(() => {
    return boardDataQueries.reduce((sum, q) => {
      return sum + (q.data?.cards ?? []).filter(c => !c.archived).length
    }, 0)
  }, [boardDataQueries])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="list" className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-tight">Goals</span>
          {totalActiveCards > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-blue-500/15 text-blue-500 text-[10px] font-bold px-1.5 h-[18px] min-w-[18px] tabular-nums">
              {totalActiveCards}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 -mr-1"
          onClick={() => router.push(`/ship/${slug}/tasks`)}
        >
          View all
          <Icon name="arrow-right" className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-4 space-y-3">
          {boardsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2.5">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
                <Icon name="list" className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No task boards yet</p>
              <p className="text-xs text-muted-foreground mb-4">Create a board to start tracking goals</p>
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
              const q = boardDataQueries[boardIdx]
              const cards = q?.data?.cards ?? []
              const colNames = q?.data?.columns ?? {}
              const activeCards = cards.filter(c => !c.archived)
              const doneCards = activeCards.filter(c => isDoneColumn(colNames[c.columnId] ?? ''))
              const total = activeCards.length
              const done = doneCards.length
              const progressPct = total > 0 ? Math.round((done / total) * 100) : 0
              const cardsLoading = q?.isLoading

              return (
                <div key={board.id} className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="px-3 pt-2.5 pb-2 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="layout" className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                      <span className="text-xs font-semibold text-foreground truncate flex-1 leading-tight">
                        {board.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                        {done}/{total}
                      </span>
                    </div>
                    {total > 0 && (
                      <Progress value={progressPct} className="h-1.5" />
                    )}
                  </div>

                  <div className="p-1.5 space-y-px">
                    {cardsLoading ? (
                      <>
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-full rounded-md" />
                      </>
                    ) : activeCards.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 px-2 py-2.5">No tasks yet</p>
                    ) : (
                      <>
                        {activeCards.slice(0, 6).map(card => {
                          const colName = colNames[card.columnId] ?? null
                          const isDone = colName ? isDoneColumn(colName) : false
                          return (
                            <div
                              key={card.id}
                              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors group cursor-default"
                            >
                              <div className={cn(
                                'h-3.5 w-3.5 rounded-full flex-shrink-0 flex items-center justify-center border transition-colors',
                                isDone
                                  ? 'bg-blue-500 border-blue-500'
                                  : 'border-border bg-transparent'
                              )}>
                                {isDone && <Icon name="check" className="h-2 w-2 text-white" />}
                              </div>
                              <span className={cn(
                                'flex-1 text-xs truncate leading-snug',
                                isDone ? 'text-muted-foreground/50 line-through' : 'text-foreground/90'
                              )}>
                                {card.title}
                              </span>
                              {colName && !isDone && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 px-1.5 flex-shrink-0 font-normal text-muted-foreground/70 border-border/50"
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
                            className="w-full text-left text-[10px] text-muted-foreground/60 px-2 py-1.5 hover:text-muted-foreground transition-colors"
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
      </div>
    </div>
  )
}
