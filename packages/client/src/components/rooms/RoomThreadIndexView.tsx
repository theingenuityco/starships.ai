'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import type { AgentModel, ConversationModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedView } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

export function RoomThreadIndexView(props: {
  starshipId: string
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  roomIsPrivate?: boolean | null
  starshipSlug?: string | null
  pinnedViews?: RoomPinnedView[] | null
  pinnedDatasets?: RoomPinnedDataset[] | null
  pinnedTaskBoards?: RoomPinnedTaskBoard[] | null
  viewLabelById?: Map<string, string> | null
  datasetLabelById?: Map<string, string> | null
  taskBoardLabelById?: Map<string, string> | null
  onOpenPinnedView?: (viewId: string) => void
  canManagePins?: boolean | null
  availableViews?: Array<{ id: string; name: string }> | null
  availableDatasets?: Array<{ id: string; name: string }> | null
  availableTaskBoards?: Array<{ id: string; name: string }> | null
  onPinView?: (viewId: string) => void
  onUnpinView?: (viewId: string) => void
  onPinDataset?: (datasetId: string) => void
  onUnpinDataset?: (datasetId: string) => void
  onPinTaskBoard?: (boardId: string) => void
  onUnpinTaskBoard?: (boardId: string) => void
  /** Open a draft thread (no persistence until first message). */
  onCreateDraftThread?: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()
  const [pinsOpen, setPinsOpen] = useState(false)
  const [pickViewId, setPickViewId] = useState<string>('')
  const [pickDatasetId, setPickDatasetId] = useState<string>('')
  const [pickBoardId, setPickBoardId] = useState<string>('')

  const { conversations: children, isLoading, isError, error, hasMoreBefore, isFetchingNextPage, fetchNextPage, refetch } = useChildConversationsPaged(props.roomConversationId, {
    enabled: true,
    limit: 10,
  })

  const sortedChildren = useMemo(() => {
    const list = Array.isArray(children) ? children.slice() : []
    list.sort((a: any, b: any) => {
      const aAt = Date.parse(String((a as any)?.updatedAt || (a as any)?.createdAt || '0'))
      const bAt = Date.parse(String((b as any)?.updatedAt || (b as any)?.createdAt || '0'))
      return bAt - aAt
    })
    return list as Array<ConversationModel & { agents: AgentModel[] }>
  }, [children])

  const label = useMemo(() => {
    const name = String(props.roomName || '').trim()
    if (name) return name
    const slug = String(props.roomSlug || '').trim()
    return slug || 'Room'
  }, [props.roomName, props.roomSlug])

  const onOpenChild = (conversationId: string) => {
    if (!effectiveStarshipSlug) return
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(conversationId)}`)
  }

  const onCreateThread = () => {
    if (props.onCreateDraftThread) {
      props.onCreateDraftThread()
      return
    }
    if (!effectiveStarshipSlug) return
    const roomSlug = String(props.roomSlug || '').trim()
    if (roomSlug) {
      router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/rooms/${encodeURIComponent(roomSlug)}?thread=draft`)
      return
    }
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(props.roomConversationId)}?thread=draft`)
  }

  const pinnedViews = (props.pinnedViews || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedDatasets = (props.pinnedDatasets || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedBoards = (props.pinnedTaskBoards || []).slice().sort((a, b) => Number(a.position) - Number(b.position))

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConversationSummaryBar
        conversationId={props.roomConversationId}
        starshipId={props.starshipId}
        titleRightSlot={<NotificationMenu type="room" roomId={props.roomConversationId} starshipId={props.starshipId} />}
        titlePrefix={
          <span className="relative inline-flex items-center justify-center h-4 w-4">
            <Icon name="hash" className="h-4 w-4" />
            {props.roomIsPrivate ? (
              <span className="absolute bottom-0.5 right-0.5 inline-flex h-2 w-2 items-center justify-center rounded-[2px] bg-card text-foreground" title="Private room" aria-label="Private room">
                <Icon name="lock" weight="fill" label="Private room" className="h-2 w-2" />
              </span>
            ) : null}
          </span>
        }
        fallbackTitle={label}
        rightSlot={
          <div className="flex items-center gap-2">
            {props.canManagePins ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setPinsOpen(true)}>
                <Icon name="pin" className="h-4 w-4 mr-1" />
                Pins
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={onCreateThread} disabled={!effectiveStarshipSlug} className="shrink-0">
              <Icon name="plus" className="h-4 w-4 mr-1" />
              New thread
            </Button>
          </div>
        }
      />

      <Dialog open={pinsOpen} onOpenChange={setPinsOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Room pins</DialogTitle>
            <DialogDescription>Pin views, datasets, and task boards to this room.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Pin a view</div>
              <div className="flex items-center gap-2">
                <Select value={pickViewId} onValueChange={setPickViewId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a view" />
                  </SelectTrigger>
                  <SelectContent>
                    {(props.availableViews || []).map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => {
                    const id = pickViewId.trim()
                    if (!id) return
                    props.onPinView?.(id)
                    setPickViewId('')
                  }}
                  disabled={!pickViewId.trim()}
                >
                  Pin
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Pin a dataset</div>
              <div className="flex items-center gap-2">
                <Select value={pickDatasetId} onValueChange={setPickDatasetId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {(props.availableDatasets || []).map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => {
                    const id = pickDatasetId.trim()
                    if (!id) return
                    props.onPinDataset?.(id)
                    setPickDatasetId('')
                  }}
                  disabled={!pickDatasetId.trim()}
                >
                  Pin
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Pin a task board</div>
              <div className="flex items-center gap-2">
                <Select value={pickBoardId} onValueChange={setPickBoardId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a board" />
                  </SelectTrigger>
                  <SelectContent>
                    {(props.availableTaskBoards || []).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => {
                    const id = pickBoardId.trim()
                    if (!id) return
                    props.onPinTaskBoard?.(id)
                    setPickBoardId('')
                  }}
                  disabled={!pickBoardId.trim()}
                >
                  Pin
                </Button>
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Currently pinned</div>
              <div className="space-y-2">
                {(pinnedViews.length === 0 && pinnedDatasets.length === 0 && pinnedBoards.length === 0) ? (
                  <div className="text-sm text-muted-foreground">No pins yet.</div>
                ) : (
                  <>
                    {pinnedViews.map(p => (
                      <div key={`pv:${p.viewId}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground mr-2">View</span>
                          {props.viewLabelById?.get(String(p.viewId)) || String(p.viewId)}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinView?.(String(p.viewId))}>
                          Unpin
                        </Button>
                      </div>
                    ))}
                    {pinnedDatasets.map(p => (
                      <div key={`pd:${p.datasetId}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground mr-2">Dataset</span>
                          {props.datasetLabelById?.get(String(p.datasetId)) || String(p.datasetId)}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinDataset?.(String(p.datasetId))}>
                          Unpin
                        </Button>
                      </div>
                    ))}
                    {pinnedBoards.map(p => (
                      <div key={`pb:${p.boardId}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground mr-2">Board</span>
                          {props.taskBoardLabelById?.get(String(p.boardId)) || String(p.boardId)}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinTaskBoard?.(String(p.boardId))}>
                          Unpin
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPinsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(pinnedViews.length > 0 || pinnedDatasets.length > 0 || pinnedBoards.length > 0) ? (
        <div className="border-b border-border/60 bg-card/40 px-4 py-2">
          <div className="w-full max-w-4xl mx-auto flex flex-wrap gap-2 items-center">
            {pinnedViews.map((p) => {
              const name = props.viewLabelById?.get(String(p.viewId)) || `View ${String(p.viewId).slice(0, 8)}`
              return (
                <Button key={`view:${p.viewId}`} type="button" size="sm" variant="outline" onClick={() => props.onOpenPinnedView?.(String(p.viewId))}>
                  <Icon name="layout" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedDatasets.map((p) => {
              const name = props.datasetLabelById?.get(String(p.datasetId)) || `Dataset ${String(p.datasetId).slice(0, 8)}`
              const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/datasets/${encodeURIComponent(String(p.datasetId))}` : null
              return (
                <Button key={`dataset:${p.datasetId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="database" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedBoards.map((p) => {
              const name = props.taskBoardLabelById?.get(String(p.boardId)) || `Board ${String(p.boardId).slice(0, 8)}`
              const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tasks` : null
              return (
                <Button key={`board:${p.boardId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="list" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
        <div className="w-full max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                <Icon name="warning" className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground">Couldn’t load threads</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md break-words">
                {(() => {
                  const msg = (error as any)?.message ? String((error as any).message) : ''
                  return msg || 'Please try again.'
                })()}
              </p>
              <Button className="mt-4" type="button" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : sortedChildren.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                <Icon name="message-square" className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground">No threads yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">Create a thread to start a new conversation.</p>
              <Button className="mt-4" type="button" onClick={onCreateThread} disabled={!effectiveStarshipSlug}>
                <Icon name="plus" className="h-4 w-4 mr-1" />
                New thread
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {sortedChildren.map(child => {
                  const id = String((child as any)?.id || '')
                  const title = String((child as any)?.title || '').trim() || `Conversation ${id.slice(0, 8)}`
                  const agents = Array.isArray((child as any)?.agents) ? ((child as any).agents as AgentModel[]) : []
                  const updatedAt = String((child as any)?.updatedAt || (child as any)?.createdAt || '')
                  const when = updatedAt ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true }) : ''

                  const agentLabel = agents
                    .map(a => String((a as any)?.name || (a as any)?.slug || '').trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ')

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenChild(id)}
                      className="group text-left rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-colors p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-foreground">{title}</p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{agentLabel ? `Agents: ${agentLabel}` : 'Agents: —'}</p>
                        </div>
                        <Icon name="chevron-right" className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {when ? <p className="text-[11px] text-muted-foreground mt-2">{when}</p> : null}
                    </button>
                  )
                })}
              </div>

              {hasMoreBefore ? (
                <div className="flex justify-center pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'Loading…' : 'Load more threads'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

