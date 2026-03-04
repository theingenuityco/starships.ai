'use client'

import React, { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useStarshipBySlug } from '@/hooks/useStarships'
import type { TaskBoardModel, TaskBoardDetailsResponse, TaskCardModel } from '@starships/protocol'
import { KanbanBoard } from '@/components/tasks/KanbanBoard'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'
import api from '@/lib/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'

function unwrapApiData<T>(response: unknown): T {
  // Our client returns { data: ApiResponse<T> } where ApiResponse has shape { data: T }.
  // Keep this intentionally loose to avoid importing internal response types here.
  return ((response as any)?.data?.data ?? (response as any)?.data) as T
}

const taskBoardsClient = {
  listBoardsByStarship: async (starshipId: string): Promise<TaskBoardModel[]> => {
    const res = await api.get(`/api/v1/starships/${starshipId}/task-boards`)
    const data = unwrapApiData<{ boards: TaskBoardModel[] }>(res)
    return Array.isArray(data?.boards) ? data.boards : []
  },
  createBoard: async (payload: { starshipId: string; name: string; createDefaultColumns: boolean }): Promise<TaskBoardDetailsResponse> => {
    const { starshipId, ...body } = payload
    const res = await api.post(`/api/v1/starships/${starshipId}/task-boards`, body)
    return unwrapApiData<TaskBoardDetailsResponse>(res)
  },
  getBoard: async (starshipId: string, boardIdOrSlug: string): Promise<TaskBoardDetailsResponse> => {
    const res = await api.get(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardIdOrSlug)}`)
    return unwrapApiData<TaskBoardDetailsResponse>(res)
  },
  archiveBoard: async (starshipId: string, boardIdOrSlug: string): Promise<TaskBoardModel> => {
    const res = await api.delete(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardIdOrSlug)}`)
    return unwrapApiData<TaskBoardModel>(res)
  },
  listCards: async (starshipId: string, boardIdOrSlug: string): Promise<TaskCardModel[]> => {
    const res = await api.get(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardIdOrSlug)}/cards`)
    const data = unwrapApiData<{ cards: TaskCardModel[] }>(res)
    return Array.isArray(data?.cards) ? data.cards : []
  },
  createCard: async (starshipId: string, boardIdOrSlug: string, payload: { columnName: string; title: string }): Promise<TaskCardModel> => {
    const res = await api.post(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardIdOrSlug)}/cards`, payload)
    return unwrapApiData<TaskCardModel>(res)
  },
  moveCard: async (cardId: string, move: { toColumnName: string; toPos: number }): Promise<TaskCardModel> => {
    const res = await api.post(`/api/v1/task-cards/${cardId}/move`, move)
    return unwrapApiData<TaskCardModel>(res)
  },
  archiveCard: async (cardId: string): Promise<TaskCardModel> => {
    const res = await api.delete(`/api/v1/task-cards/${cardId}`)
    return unwrapApiData<TaskCardModel>(res)
  },
  hardDeleteBoard: async (starshipId: string, boardIdOrSlug: string): Promise<void> => {
    await api.delete(`/api/v1/starships/${starshipId}/task-boards/${encodeURIComponent(boardIdOrSlug)}/hard-delete`)
  },
} as const

export default function StarshipTasksPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const queryClient = useQueryClient()
  const { user, isInstanceAdmin } = useAuth()

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id || ''
  const { data: membersAndInvites } = useStarshipMembersAndInvites(String(starshipId || ''), Boolean(starshipId))
  const canHardDelete = Boolean(
    isInstanceAdmin === true ||
      (user?.id && membersAndInvites?.members?.some((m) => String(m.userId) === String(user.id) && (m.role === 'owner' || m.role === 'admin')))
  )

  const [newBoardName, setNewBoardName] = useState('')
  const [createBoardOpen, setCreateBoardOpen] = useState(false)
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState<'archive' | 'hard'>('archive')

  const { data: boards = [], isLoading: boardsLoading } = useQuery<TaskBoardModel[]>({
    queryKey: ['task-boards', starshipId],
    queryFn: async () => {
      if (!starshipId) return []
      return await taskBoardsClient.listBoardsByStarship(starshipId)
    },
    enabled: !!starshipId,
    staleTime: 10_000,
  })

  const effectiveBoardId = useMemo(() => {
    if (selectedBoardId) return selectedBoardId
    return boards[0]?.id || ''
  }, [boards, selectedBoardId])

  const { data: boardDetails, isLoading: boardLoading } = useQuery<TaskBoardDetailsResponse>({
    queryKey: ['task-board', starshipId, effectiveBoardId],
    queryFn: async () => {
      if (!effectiveBoardId) throw new Error('No board selected')
      if (!starshipId) throw new Error('Missing starship id')
      return await taskBoardsClient.getBoard(starshipId, effectiveBoardId)
    },
    enabled: !!starshipId && !!effectiveBoardId,
    staleTime: 10_000,
  })

  const { data: cards = [], isLoading: cardsLoading } = useQuery<TaskCardModel[]>({
    queryKey: ['task-cards', starshipId, effectiveBoardId],
    queryFn: async () => {
      if (!effectiveBoardId) return []
      if (!starshipId) return []
      return await taskBoardsClient.listCards(starshipId, effectiveBoardId)
    },
    enabled: !!starshipId && !!effectiveBoardId,
    staleTime: 5_000,
  })

  const createBoardMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!starshipId) throw new Error('Missing starship id')
      return await taskBoardsClient.createBoard({
        starshipId,
        name,
        createDefaultColumns: true,
      })
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['task-boards', starshipId] })
      setSelectedBoardId(created.board.id)
      setNewBoardName('')
      setCreateBoardOpen(false)
    },
    onError: (error) => {
      toast.error('Failed to create board', { description: getSafeErrorMessage(error) })
    },
  })

  const createCardMutation = useMutation({
    mutationFn: async (args: { columnName: string; title: string }) => {
      if (!effectiveBoardId) throw new Error('No board selected')
      if (!starshipId) throw new Error('Missing starship id')
      return await taskBoardsClient.createCard(starshipId, effectiveBoardId, { columnName: args.columnName, title: args.title })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', starshipId, effectiveBoardId] })
    },
  })

  const archiveBoardMutation = useMutation({
    mutationFn: async (boardIdOrSlug: string) => {
      if (!starshipId) throw new Error('Missing starship id')
      return await taskBoardsClient.archiveBoard(starshipId, boardIdOrSlug)
    },
    onSuccess: async (_, deletedBoardIdOrSlug) => {
      const deletingId = String(deletedBoardIdOrSlug || '')
      if (deletingId && effectiveBoardId === deletingId) {
        setSelectedBoardId('')
      } else if (selectedBoardId && deletingId && selectedBoardId === deletingId) {
        setSelectedBoardId('')
      }
      await queryClient.invalidateQueries({ queryKey: ['task-boards', starshipId] })
      await queryClient.invalidateQueries({ queryKey: ['task-board', starshipId] })
      await queryClient.invalidateQueries({ queryKey: ['task-cards', starshipId] })
    },
    onError: (error) => {
      toast.error('Failed to delete board', { description: getSafeErrorMessage(error) })
    },
  })

  const hardDeleteBoardMutation = useMutation({
    mutationFn: async (boardIdOrSlug: string) => {
      if (!starshipId) throw new Error('Missing starship id')
      return await taskBoardsClient.hardDeleteBoard(starshipId, boardIdOrSlug)
    },
    onSuccess: async (_, deletedBoardIdOrSlug) => {
      const deletingId = String(deletedBoardIdOrSlug || '')
      if (deletingId && effectiveBoardId === deletingId) setSelectedBoardId('')
      await queryClient.invalidateQueries({ queryKey: ['task-boards', starshipId] })
      await queryClient.invalidateQueries({ queryKey: ['task-board', starshipId] })
      await queryClient.invalidateQueries({ queryKey: ['task-cards', starshipId] })
    },
    onError: (error) => {
      toast.error('Failed to delete board', { description: getSafeErrorMessage(error) })
    },
  })

  const moveCardMutation = useMutation({
    mutationFn: async (args: { cardId: string; toColumnName: string; toPos: number }) => {
      return await taskBoardsClient.moveCard(args.cardId, { toColumnName: args.toColumnName, toPos: args.toPos })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', starshipId, effectiveBoardId] })
    },
  })

  const archiveCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      return await taskBoardsClient.archiveCard(cardId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-cards', starshipId, effectiveBoardId] })
    },
  })

  const onConfirmDeleteBoard = async () => {
    const target = deleteBoardTarget
    if (!target) return
    if (deleteMode === 'hard') {
      if (!canHardDelete) {
        toast.error('Only owners/admins can permanently delete boards')
        return
      }
      if (hardDeleteBoardMutation.isPending) return
      setDeletingBoardId(target.id)
      try {
        await hardDeleteBoardMutation.mutateAsync(target.id)
        toast.success('Board deleted permanently', { description: `${target.name} and its cards were deleted.` })
        setDeleteBoardTarget(null)
      } finally {
        setDeletingBoardId((prev) => (prev === target.id ? null : prev))
      }
      return
    }

    if (archiveBoardMutation.isPending) return
    setDeletingBoardId(target.id)
    try {
      await archiveBoardMutation.mutateAsync(target.id)
      toast.success('Board deleted', { description: `${target.name} was archived.` })
      setDeleteBoardTarget(null)
    } catch (error) {
      // handled by onError, but keep selection state consistent
    } finally {
      setDeletingBoardId((prev) => (prev === target.id ? null : prev))
    }
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="list" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Tasks</h3>
                    </div>

                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span
                        className="block min-w-0 truncate font-medium leading-snug text-muted-foreground"
                        title="Kanban boards scoped to this starship, usable by agents and humans."
                      >
                        Kanban boards scoped to this starship, usable by agents and humans.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent min-h-full')}>
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {/* Sidebar: boards list */}
            <Card className="border-border/60 shadow-none lg:w-[320px] shrink-0">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon name="list" className="h-4 w-4" />
                    Boards
                  </CardTitle>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-primary hover:text-primary"
                    disabled={!starshipId}
                    onClick={() => {
                      setNewBoardName('')
                      setCreateBoardOpen(true)
                    }}
                  >
                    <Icon name="plus" className="h-4 w-4 mr-1.5" />
                    New
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-2 pt-2">
                {boardsLoading ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : (
                  <ScrollArea className="h-[220px] lg:h-[520px]">
                    <div className="space-y-1 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNewBoardName('')
                          setCreateBoardOpen(true)
                        }}
                        disabled={!starshipId}
                        className={cn(
                          'w-full flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm',
                          'text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors',
                          !starshipId && 'opacity-60 cursor-not-allowed'
                        )}
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
                          <Icon name="plus" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">Create new board</span>
                      </button>

                      {boards.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          No boards yet.
                          <div className="mt-1">Create one to start tracking tasks.</div>
                        </div>
                      ) : (
                        boards.map(b => {
                          const isActive = b.id === effectiveBoardId
                          const canDelete = Boolean(starshipId && b?.id)
                          return (
                            <div
                              key={b.id}
                              className={cn(
                                'w-full flex items-center gap-2 rounded-lg pr-1 transition-colors group',
                                isActive ? 'bg-muted/60' : 'hover:bg-muted/40'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedBoardId(b.id)}
                                className={cn('flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-sm text-left text-foreground')}
                                aria-current={isActive ? 'page' : undefined}
                              >
                                <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-border/50', isActive ? 'bg-background/70' : 'bg-muted/30')}>
                                  <Icon name="layout" className="h-4 w-4 text-muted-foreground" />
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                    aria-label="Board actions"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Icon name="dots-vertical" className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem
                                    disabled={!canDelete}
                                    onClick={() => {
                                      if (!canDelete) return
                                      setDeleteMode('archive')
                                      setDeleteBoardTarget({ id: String(b.id), name: String(b.name || 'Board') })
                                    }}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <Icon name="archive" className="h-4 w-4" />
                                    Archive
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!canDelete || !canHardDelete}
                                    onClick={() => {
                                      if (!canDelete || !canHardDelete) return
                                      setDeleteMode('hard')
                                      setDeleteBoardTarget({ id: String(b.id), name: String(b.name || 'Board') })
                                    }}
                                    className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive disabled:opacity-60"
                                  >
                                    <Icon name="trash" className="h-4 w-4" />
                                    Delete permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                )}

                <div className="px-4 pb-3 pt-2 text-xs text-muted-foreground leading-relaxed">
                  <div className="font-medium text-foreground/90 mb-1">Agent usage</div>
                  <div>Agents can manage boards/cards via Starships connector actions using `state.starshipId` / `runtimeEnv.STARSHIP_ID`.</div>
                </div>
              </CardContent>
            </Card>

            {/* Main: kanban */}
            <Card className="border-border/60 shadow-none flex-1 min-w-0">
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
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-[420px] w-[320px]" />
                      ))}
                    </div>
                  </div>
                ) : !boardDetails?.board?.id ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">{boards.length === 0 ? 'Create your first board to start tracking tasks.' : 'Select a board.'}</div>
                ) : (
                  <div className={cn('space-y-3')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold truncate">{boardDetails.board.name}</div>
                    </div>
                    <KanbanBoard
                      columns={boardDetails.columns || []}
                      cards={cards}
                      onCreateCard={async (columnName, title) => {
                        await createCardMutation.mutateAsync({ columnName, title })
                      }}
                      onMoveCard={async ({ cardId, toColumnName, toPos }) => {
                        await moveCardMutation.mutateAsync({ cardId, toColumnName, toPos })
                      }}
                      onArchiveCard={async cardId => {
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

      <Dialog
        open={createBoardOpen}
        onOpenChange={open => {
          setCreateBoardOpen(open)
          if (open) setNewBoardName('')
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create board</DialogTitle>
            <DialogDescription>Boards are scoped to this starship.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const name = newBoardName.trim()
              if (!name) return
              if (!starshipId) return
              createBoardMutation.mutate(name)
            }}
          >
            <Input
              value={newBoardName}
              onChange={e => setNewBoardName(e.target.value)}
              placeholder="e.g. Roadmap, Bugs, Launch"
              className="h-10"
              disabled={!starshipId || createBoardMutation.isPending}
              autoFocus
            />

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateBoardOpen(false)} disabled={createBoardMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!starshipId || !newBoardName.trim() || createBoardMutation.isPending}>
                {createBoardMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteBoardTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (!archiveBoardMutation.isPending && !hardDeleteBoardMutation.isPending) setDeleteBoardTarget(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">{deleteMode === 'hard' ? 'Delete board permanently' : 'Archive board'}</DialogTitle>
            <DialogDescription>
              {deleteMode === 'hard'
                ? 'This will permanently delete the board, its columns, and all cards. This action cannot be undone.'
                : 'This will archive the board so it no longer appears in the list.'}
            </DialogDescription>
          </DialogHeader>

          {deleteBoardTarget ? (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="h-4 w-4 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">You’re about to delete:</p>
                  <p className="text-destructive/80 break-words">{deleteBoardTarget.name}</p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteBoardTarget(null)}
              disabled={archiveBoardMutation.isPending || hardDeleteBoardMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDeleteBoard}
              disabled={!deleteBoardTarget || archiveBoardMutation.isPending || hardDeleteBoardMutation.isPending || (deleteMode === 'hard' && !canHardDelete)}
            >
              {(archiveBoardMutation.isPending || hardDeleteBoardMutation.isPending) && deletingBoardId === deleteBoardTarget?.id
                ? 'Deleting…'
                : deleteMode === 'hard'
                  ? 'Delete permanently'
                  : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

