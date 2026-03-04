'use client'

import Icon from '@/components/primitives/Icon'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedView, RoomToolAssignment } from '@starships/protocol'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

export function RoomResourcesPane(props: {
  starshipId: string
  starshipSlug?: string | null
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  pinnedViews?: RoomPinnedView[] | null
  pinnedDatasets?: RoomPinnedDataset[] | null
  pinnedTaskBoards?: RoomPinnedTaskBoard[] | null
  assignedTools?: RoomToolAssignment[] | null
  viewLabelById?: Map<string, string> | null
  datasetLabelById?: Map<string, string> | null
  taskBoardLabelById?: Map<string, string> | null
  toolLabelById?: Map<string, string> | null
  toolSlugById?: Map<string, string> | null
  canManagePins?: boolean | null
  availableViews?: Array<{ id: string; name: string }> | null
  availableDatasets?: Array<{ id: string; name: string }> | null
  availableTaskBoards?: Array<{ id: string; name: string }> | null
  availableTools?: Array<{ id: string; name: string }> | null
  onPinView?: (viewId: string) => void
  onUnpinView?: (viewId: string) => void
  onPinDataset?: (datasetId: string) => void
  onUnpinDataset?: (datasetId: string) => void
  onPinTaskBoard?: (boardId: string) => void
  onUnpinTaskBoard?: (boardId: string) => void
  onAssignTool?: (toolId: string) => void
  onUnassignTool?: (toolId: string) => void
  onOpenPinnedView?: (viewId: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()

  const [pickViewId, setPickViewId] = useState<string>('')
  const [pickDatasetId, setPickDatasetId] = useState<string>('')
  const [pickBoardId, setPickBoardId] = useState<string>('')
  const [pickToolId, setPickToolId] = useState<string>('')

  const pinnedViews = (props.pinnedViews || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedDatasets = (props.pinnedDatasets || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedBoards = (props.pinnedTaskBoards || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const assignedTools = (props.assignedTools || []).slice()
  const totalSaved = assignedTools.length + pinnedViews.length + pinnedDatasets.length + pinnedBoards.length

  const roomLabel = useMemo(() => {
    const name = String(props.roomName || '').trim()
    if (name) return name
    const slug = String(props.roomSlug || '').trim()
    return slug || 'Room'
  }, [props.roomName, props.roomSlug])

  const openPinnedView = (viewId: string) => {
    const id = String(viewId || '').trim()
    if (!id) return
    props.onClose()
    props.onOpenPinnedView?.(id)
  }

  const openPinnedDataset = (datasetId: string) => {
    const id = String(datasetId || '').trim()
    if (!id) return
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/datasets/${encodeURIComponent(id)}` : null
    if (!href) return
    props.onClose()
    router.push(href)
  }

  const openPinnedBoard = () => {
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tasks` : null
    if (!href) return
    props.onClose()
    router.push(href)
  }

  const openPinnedTool = (toolId: string) => {
    const id = String(toolId || '').trim()
    if (!id) return
    const toolSlug = props.toolSlugById?.get(id) || ''
    const href = effectiveStarshipSlug && toolSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tool/${encodeURIComponent(toolSlug)}` : null
    if (!href) return
    props.onClose()
    router.push(href)
  }

  const Row = (rowProps: { icon: string; label: string; onClick: () => void }) => {
    return (
      <Button
        type="button"
        variant="ghost"
        className="group relative rounded-lg flex items-center gap-2 w-full h-9 px-2 text-[13px] font-medium border border-transparent justify-start text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted"
        onClick={rowProps.onClick}
      >
        <Icon name={rowProps.icon as any} className="h-4 w-4" />
        <span className="min-w-0 truncate">{rowProps.label}</span>
      </Button>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full min-w-0">
      {/* Header (match thread pane placement/spacing) */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <span className="mx-2 inline-flex h-8 w-8" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center text-foreground hover:text-foreground transition-colors"
                        onClick={props.onClose}
                        aria-label="Back to room"
                        title="Back to room"
                      >
                        <Icon name="arrow-left" className="h-4 w-4" />
                      </button>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">
                        <span className="inline-flex items-center whitespace-nowrap text-foreground">
                          <span>{roomLabel}</span>
                          <span className="mx-1">/</span>
                        </span>
                        Resources
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground min-h-6">
                      <span className="font-medium leading-none text-muted-foreground">{totalSaved > 0 ? `${totalSaved} saved` : 'No saved resources'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <NotificationMenu type="room" roomId={props.roomConversationId} starshipId={props.starshipId} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto px-0 sm:px-4 md:px-6 py-4 space-y-6">
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Tools</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickToolId} onValueChange={setPickToolId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a tool" />
                </SelectTrigger>
                <SelectContent>
                  {(props.availableTools || []).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={() => {
                  const id = pickToolId.trim()
                  if (!id) return
                  props.onAssignTool?.(id)
                  setPickToolId('')
                }}
                disabled={!pickToolId.trim()}
              >
                Add
              </Button>
            </div>
          ) : null}
          {assignedTools.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {assignedTools.map(a => (
                <div key={`rt:${a.toolId}`} className="flex items-center justify-between gap-2">
                  <Row icon="workflow" label={props.toolLabelById?.get(String(a.toolId)) || String(a.toolId)} onClick={() => openPinnedTool(String(a.toolId))} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnassignTool?.(String(a.toolId))}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-6 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Views</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickViewId} onValueChange={setPickViewId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a view" />
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
                Add
              </Button>
            </div>
          ) : null}
          {pinnedViews.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {pinnedViews.map(p => (
                <div key={`pv:${p.viewId}`} className="flex items-center justify-between gap-2">
                  <Row icon="layout" label={props.viewLabelById?.get(String(p.viewId)) || String(p.viewId)} onClick={() => openPinnedView(String(p.viewId))} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinView?.(String(p.viewId))}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-6 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Datasets</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickDatasetId} onValueChange={setPickDatasetId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a dataset" />
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
                Add
              </Button>
            </div>
          ) : null}
          {pinnedDatasets.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {pinnedDatasets.map(p => (
                <div key={`pd:${p.datasetId}`} className="flex items-center justify-between gap-2">
                  <Row icon="database" label={props.datasetLabelById?.get(String(p.datasetId)) || String(p.datasetId)} onClick={() => openPinnedDataset(String(p.datasetId))} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinDataset?.(String(p.datasetId))}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-6 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Task boards</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickBoardId} onValueChange={setPickBoardId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a task board" />
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
                Add
              </Button>
            </div>
          ) : null}
          {pinnedBoards.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {pinnedBoards.map(p => (
                <div key={`pb:${p.boardId}`} className="flex items-center justify-between gap-2">
                  <Row icon="list" label={props.taskBoardLabelById?.get(String(p.boardId)) || String(p.boardId)} onClick={() => openPinnedBoard()} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinTaskBoard?.(String(p.boardId))}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
