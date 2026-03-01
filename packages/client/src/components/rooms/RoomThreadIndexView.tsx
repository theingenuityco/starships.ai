'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AgentModel, RoomPinnedAgent, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedTool, RoomPinnedView } from '@starships/protocol'
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
  pinnedAgents?: RoomPinnedAgent[] | null
  pinnedTools?: RoomPinnedTool[] | null
  viewLabelById?: Map<string, string> | null
  datasetLabelById?: Map<string, string> | null
  taskBoardLabelById?: Map<string, string> | null
  agentLabelById?: Map<string, string> | null
  toolLabelById?: Map<string, string> | null
  agentSlugById?: Map<string, string> | null
  toolSlugById?: Map<string, string> | null
  onOpenPinnedView?: (viewId: string) => void
  canManagePins?: boolean | null
  availableViews?: Array<{ id: string; name: string }> | null
  availableDatasets?: Array<{ id: string; name: string }> | null
  availableTaskBoards?: Array<{ id: string; name: string }> | null
  availableAgents?: Array<{ id: string; name: string }> | null
  availableTools?: Array<{ id: string; name: string }> | null
  onPinView?: (viewId: string) => void
  onUnpinView?: (viewId: string) => void
  onPinDataset?: (datasetId: string) => void
  onUnpinDataset?: (datasetId: string) => void
  onPinTaskBoard?: (boardId: string) => void
  onUnpinTaskBoard?: (boardId: string) => void
  onPinAgent?: (agentId: string) => void
  onUnpinAgent?: (agentId: string) => void
  onPinTool?: (toolId: string) => void
  onUnpinTool?: (toolId: string) => void
  /** Open a draft thread (no persistence until first message). */
  onCreateDraftThread?: () => void
  /**
   * Called when the user starts a brand-new thread conversation from the room starter composer.
   * The returned `conversationId` is the newly created child conversation (thread).
   */
  onThreadConversationStarted?: (args: { conversationId: string; selectedAgent: AgentModel | null }) => void
}) {
  const router = useRouter()
  const params = useParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()
  const [pinsOpen, setPinsOpen] = useState(false)
  const [pickViewId, setPickViewId] = useState<string>('')
  const [pickDatasetId, setPickDatasetId] = useState<string>('')
  const [pickBoardId, setPickBoardId] = useState<string>('')
  const [pickAgentId, setPickAgentId] = useState<string>('')
  const [pickToolId, setPickToolId] = useState<string>('')
  const [starterSelectedAgent, setStarterSelectedAgent] = useState<AgentModel | null>(null)

  const label = useMemo(() => {
    const name = String(props.roomName || '').trim()
    if (name) return name
    const slug = String(props.roomSlug || '').trim()
    return slug || 'Room'
  }, [props.roomName, props.roomSlug])

  const onCreateThread = () => {
    if (props.onCreateDraftThread) {
      props.onCreateDraftThread()
      return
    }
    if (!effectiveStarshipSlug) return
    const roomSlug = String(props.roomSlug || '').trim()
    if (roomSlug) {
      router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/rooms/${encodeURIComponent(roomSlug)}/thread/draft`)
      return
    }
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(props.roomConversationId)}?thread=draft`)
  }

  const pinnedViews = (props.pinnedViews || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedDatasets = (props.pinnedDatasets || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedBoards = (props.pinnedTaskBoards || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedAgents = (props.pinnedAgents || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedTools = (props.pinnedTools || []).slice().sort((a, b) => Number(a.position) - Number(b.position))

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
            <DialogDescription>Pin agents, tools, views, datasets, and task boards to this room.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Pin an agent</div>
              <div className="flex items-center gap-2">
                <Select value={pickAgentId} onValueChange={setPickAgentId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(props.availableAgents || []).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => {
                    const id = pickAgentId.trim()
                    if (!id) return
                    props.onPinAgent?.(id)
                    setPickAgentId('')
                  }}
                  disabled={!pickAgentId.trim()}
                >
                  Pin
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Pin a tool</div>
              <div className="flex items-center gap-2">
                <Select value={pickToolId} onValueChange={setPickToolId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a tool" />
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
                    props.onPinTool?.(id)
                    setPickToolId('')
                  }}
                  disabled={!pickToolId.trim()}
                >
                  Pin
                </Button>
              </div>
            </div>

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
                {pinnedAgents.length === 0 && pinnedTools.length === 0 && pinnedViews.length === 0 && pinnedDatasets.length === 0 && pinnedBoards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No pins yet.</div>
                ) : (
                  <>
                    {pinnedAgents.map(p => (
                      <div key={`pa:${p.agentId}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground mr-2">Agent</span>
                          {props.agentLabelById?.get(String(p.agentId)) || String(p.agentId)}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinAgent?.(String(p.agentId))}>
                          Unpin
                        </Button>
                      </div>
                    ))}
                    {pinnedTools.map(p => (
                      <div key={`pt:${p.toolId}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">
                          <span className="text-muted-foreground mr-2">Tool</span>
                          {props.toolLabelById?.get(String(p.toolId)) || String(p.toolId)}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => props.onUnpinTool?.(String(p.toolId))}>
                          Unpin
                        </Button>
                      </div>
                    ))}
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

      {pinnedAgents.length > 0 || pinnedTools.length > 0 || pinnedViews.length > 0 || pinnedDatasets.length > 0 || pinnedBoards.length > 0 ? (
        <div className="border-b border-border/60 bg-card/40 px-4 py-2">
          <div className="w-full max-w-4xl mx-auto flex flex-wrap gap-2 items-center">
            {pinnedAgents.map(p => {
              const name = props.agentLabelById?.get(String(p.agentId)) || `Agent ${String(p.agentId).slice(0, 8)}`
              const agentSlug = props.agentSlugById?.get(String(p.agentId)) || ''
              const peerKey = agentSlug ? agentSlug : `a:${String(p.agentId)}`
              const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/dm/${encodeURIComponent(peerKey)}` : null
              return (
                <Button key={`agent:${p.agentId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="sparkles" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedViews.map(p => {
              const name = props.viewLabelById?.get(String(p.viewId)) || `View ${String(p.viewId).slice(0, 8)}`
              return (
                <Button key={`view:${p.viewId}`} type="button" size="sm" variant="outline" onClick={() => props.onOpenPinnedView?.(String(p.viewId))}>
                  <Icon name="layout" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedDatasets.map(p => {
              const name = props.datasetLabelById?.get(String(p.datasetId)) || `Dataset ${String(p.datasetId).slice(0, 8)}`
              const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/datasets/${encodeURIComponent(String(p.datasetId))}` : null
              return (
                <Button key={`dataset:${p.datasetId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="database" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedBoards.map(p => {
              const name = props.taskBoardLabelById?.get(String(p.boardId)) || `Board ${String(p.boardId).slice(0, 8)}`
              const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tasks` : null
              return (
                <Button key={`board:${p.boardId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="list" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
            {pinnedTools.map(p => {
              const name = props.toolLabelById?.get(String(p.toolId)) || `Tool ${String(p.toolId).slice(0, 8)}`
              const toolSlug = props.toolSlugById?.get(String(p.toolId)) || ''
              const href = effectiveStarshipSlug && toolSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tool/${encodeURIComponent(toolSlug)}` : null
              return (
                <Button key={`tool:${p.toolId}`} type="button" size="sm" variant="outline" disabled={!href} onClick={() => href && router.push(href)}>
                  <Icon name="workflow" className="h-4 w-4 mr-1.5" />
                  {name}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Room starter (conversation-starter style) */}
      <div className="flex-1 min-h-0 overflow-auto bg-background px-4 py-8">
        <div className="w-full max-w-4xl mx-auto h-full flex">
          <div className="w-full sm:max-w-3xl sm:mx-auto flex flex-col justify-center flex-1">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-normal text-foreground">Start a new thread</h1>
              <p className="text-sm text-muted-foreground mt-2">Your first message creates a new thread in this room.</p>
            </div>

            <ConversationMessageInput
              selectedAgent={starterSelectedAgent}
              onAgentChange={setStarterSelectedAgent}
              starshipId={props.starshipId}
              conversationId={null}
              starshipSlug={effectiveStarshipSlug}
              newConversationParentConversationId={props.roomConversationId}
              newConversationTitleOverride="New thread"
              onConversationStart={conversationId => {
                const cid = String(conversationId || '').trim()
                if (!cid) return
                props.onThreadConversationStarted?.({ conversationId: cid, selectedAgent: starterSelectedAgent })
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
