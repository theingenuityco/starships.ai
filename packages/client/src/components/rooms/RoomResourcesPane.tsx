'use client'

import Icon from '@/components/primitives/Icon'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RoomPinnedTable, RoomPinnedDoc, RoomPinnedTaskBoard, RoomPinnedView } from '@starships/protocol'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

export function RoomResourcesPane(props: {
  starshipId: string
  starshipSlug?: string | null
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  pinnedViews?: RoomPinnedView[] | null
  pinnedTables?: RoomPinnedTable[] | null
  pinnedTaskBoards?: RoomPinnedTaskBoard[] | null
  pinnedDocs?: RoomPinnedDoc[] | null
  viewLabelById?: Map<string, string> | null
  tableLabelById?: Map<string, string> | null
  taskBoardLabelById?: Map<string, string> | null
  docLabelById?: Map<string, string> | null
  canManagePins?: boolean | null
  availableViews?: Array<{ id: string; name: string }> | null
  availableTables?: Array<{ id: string; name: string }> | null
  availableTaskBoards?: Array<{ id: string; name: string }> | null
  availableDocs?: Array<{ id: string; title: string }> | null
  onPinView?: (viewId: string) => void
  onUnpinView?: (viewId: string) => void
  onPinTable?: (tableId: string) => void
  onUnpinTable?: (tableId: string) => void
  onPinTaskBoard?: (boardId: string) => void
  onUnpinTaskBoard?: (boardId: string) => void
  onPinDoc?: (docId: string) => void
  onUnpinDoc?: (docId: string) => void
  onOpenPinnedView?: (viewId: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()

  const [pickViewId, setPickViewId] = useState<string>('')
  const [pickTableId, setPickTableId] = useState<string>('')
  const [pickBoardId, setPickBoardId] = useState<string>('')
  const [pickDocId, setPickDocId] = useState<string>('')

  const pinnedViews = (props.pinnedViews || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedTables = (props.pinnedTables || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedBoards = (props.pinnedTaskBoards || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedDocs = (props.pinnedDocs || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const totalSaved = pinnedViews.length + pinnedTables.length + pinnedBoards.length + pinnedDocs.length

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

  const openPinnedTable = (tableId: string) => {
    const id = String(tableId || '').trim()
    if (!id) return
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tables/${encodeURIComponent(id)}` : null
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

  const openPinnedDoc = (docId: string) => {
    const id = String(docId || '').trim()
    if (!id) return
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/docs/${encodeURIComponent(id)}` : null
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

                    <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                      <div className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1">
                        <span className="font-medium leading-none text-muted-foreground">{totalSaved > 0 ? `${totalSaved} saved` : 'No saved resources'}</span>
                      </div>
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
          <div className="text-xs font-medium text-muted-foreground">Tables</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickTableId} onValueChange={setPickTableId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a table" />
                </SelectTrigger>
                <SelectContent>
                  {(props.availableTables || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={() => {
                  const id = pickTableId.trim()
                  if (!id) return
                  props.onPinTable?.(id)
                  setPickTableId('')
                }}
                disabled={!pickTableId.trim()}
              >
                Add
              </Button>
            </div>
          ) : null}
          {pinnedTables.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {pinnedTables.map(p => (
                <div key={`pd:${p.tableId}`} className="flex items-center justify-between gap-2">
                  <Row icon="database" label={props.tableLabelById?.get(String(p.tableId)) || String(p.tableId)} onClick={() => openPinnedTable(String(p.tableId))} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinTable?.(String(p.tableId))}>
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

        <div className="border-t border-border/60 pt-6 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Docs</div>
          {props.canManagePins ? (
            <div className="flex items-center gap-2">
              <Select value={pickDocId} onValueChange={setPickDocId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a doc" />
                </SelectTrigger>
                <SelectContent>
                  {(props.availableDocs || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={() => {
                  const id = pickDocId.trim()
                  if (!id) return
                  props.onPinDoc?.(id)
                  setPickDocId('')
                }}
                disabled={!pickDocId.trim()}
              >
                Add
              </Button>
            </div>
          ) : null}
          {pinnedDocs.length === 0 ? (
            <div className="text-sm text-muted-foreground">None</div>
          ) : (
            <div className="space-y-1">
              {pinnedDocs.map(p => (
                <div key={`pdoc:${p.docId}`} className="flex items-center justify-between gap-2">
                  <Row icon="file-text" label={props.docLabelById?.get(String(p.docId)) || String(p.docId)} onClick={() => openPinnedDoc(String(p.docId))} />
                  {props.canManagePins ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinDoc?.(String(p.docId))}>
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
