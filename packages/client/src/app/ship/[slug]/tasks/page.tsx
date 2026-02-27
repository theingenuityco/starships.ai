'use client'

import React, { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { taskBoardAPI } from '@/lib/api'
import type { TaskBoardModel, TaskBoardDetailsResponse, TaskCardModel } from '@starships/protocol'
import { KanbanBoard } from '@/components/tasks/KanbanBoard'

export default function StarshipTasksPage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()

  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''

  const [newBoardName, setNewBoardName] = useState('')
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')

  const { data: boards = [], isLoading: boardsLoading } = useQuery<TaskBoardModel[]>({
    queryKey: ['task-boards', starshipId],
    queryFn: async () => {
      if (!starshipId) return []
      return await taskBoardAPI.listBoardsByStarship(starshipId)
    },
    enabled: !!starshipId,
    staleTime: 10_000,
  })

  const effectiveBoardId = useMemo(() => {
    if (selectedBoardId) return selectedBoardId
    return boards[0]?.id || ''
  }, [boards, selectedBoardId])

  const { data: boardDetails, isLoading: boardLoading } = useQuery<TaskBoardDetailsResponse>({
    queryKey: ['task-board', effectiveBoardId],
    queryFn: async () => {
      if (!effectiveBoardId) throw new Error('No board selected')
      return await taskBoardAPI.getBoard(effectiveBoardId)
    },
    enabled: !!effectiveBoardId,
    staleTime: 10_000,
  })

  const { data: cards = [], isLoading: cardsLoading } = useQuery<TaskCardModel[]>({
    queryKey: ['task-cards', effectiveBoardId],
    queryFn: async () => {
      if (!effectiveBoardId) return []
      return await taskBoardAPI.listCards(effectiveBoardId)
    },
    enabled: !!effectiveBoardId,
    staleTime: 5_000,
  })

  const createBoardMutation = useMutation({
    mutationFn: async (name: string) => {
      return await taskBoardAPI.createBoard({
        starshipId,
        name,
        createDefaultColumns: true,
      })
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['task-boards', starshipId] })
      setSelectedBoardId(created.board.id)
      setNewBoardName('')
    },
  })

  const createCardMutation = useMutation({
    mutationFn: async (args: { columnId: string; title: string }) => {
      if (!effectiveBoardId) throw new Error('No board selected')
      return await taskBoardAPI.createCard(effectiveBoardId, { columnId: args.columnId, title: args.title })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', effectiveBoardId] })
    },
  })

  const moveCardMutation = useMutation({
    mutationFn: async (args: { cardId: string; toColumnId: string; toPos: number }) => {
      return await taskBoardAPI.moveCard(args.cardId, { toColumnId: args.toColumnId, toPos: args.toPos })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', effectiveBoardId] })
    },
  })

  const archiveCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      return await taskBoardAPI.archiveCard(cardId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', effectiveBoardId] })
    },
  })

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-7xl mx-auto space-y-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="list" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Tasks</h1>
              </div>
              <p className="text-muted-foreground mt-2">Kanban boards scoped to this starship, usable by agents and humans.</p>
            </div>

            <Card className="frosted-glass-card shadow-frosted-lg">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon name="list" className="h-4 w-4" />
                  Boards
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-3 items-start">
                  <div className="space-y-2">
                    {boardsLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select value={effectiveBoardId} onValueChange={(v) => setSelectedBoardId(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder={boards.length ? 'Select a board' : 'No boards yet'} />
                        </SelectTrigger>
                        <SelectContent>
                          {boards.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const name = newBoardName.trim()
                        if (!name || !starshipId) return
                        createBoardMutation.mutate(name)
                      }}
                    >
                      <Input value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="New board name" className="h-9" />
                      <Button type="submit" className="h-9" disabled={!newBoardName.trim() || createBoardMutation.isPending || !starshipId}>
                        Create
                      </Button>
                    </form>
                  </div>

                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <div className="font-medium text-foreground/90 mb-1">Agent usage</div>
                    <div>
                      Agents can manage these tasks via Starships connector actions (e.g. list boards, create cards, move cards) using
                      `state.starshipId` / `runtimeEnv.STARSHIP_ID`.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="frosted-glass-card shadow-frosted-lg">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon name="workflow" className="h-4 w-4" />
                  Kanban
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {boardLoading || cardsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-7 w-[240px]" />
                    <div className="flex gap-4 overflow-hidden">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[420px] w-[320px]" />
                      ))}
                    </div>
                  </div>
                ) : !boardDetails?.board?.id ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">
                    {boards.length === 0 ? 'Create your first board to start tracking tasks.' : 'Select a board.'}
                  </div>
                ) : (
                  <div className={cn('space-y-3')}>
                    <div className="text-sm font-semibold">{boardDetails.board.name}</div>
                    <KanbanBoard
                      columns={boardDetails.columns || []}
                      cards={cards}
                      onCreateCard={async (columnId, title) => {
                        await createCardMutation.mutateAsync({ columnId, title })
                      }}
                      onMoveCard={async ({ cardId, toColumnId, toPos }) => {
                        await moveCardMutation.mutateAsync({ cardId, toColumnId, toPos })
                      }}
                      onArchiveCard={async (cardId) => {
                        await archiveCardMutation.mutateAsync(cardId)
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

