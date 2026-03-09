'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { RoomParticipantsButton } from '@/components/rooms/RoomParticipantsButton'
import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useStarshipAgents } from '@/hooks/useAgents'
import { cn } from '@/lib/utils'
import type { AgentModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedView, RoomToolAssignment } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

export function RoomConversationIndexView(props: {
  starshipId: string
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  roomIsPrivate?: boolean | null
  starshipOwnerId?: string | null
  starshipSlug?: string | null
  /** Optional allowlists to scope @mention and agent selection within room conversations. */
  allowedMentionUserIds?: string[] | null
  allowedMentionAgentIds?: string[] | null
  pinnedViews?: RoomPinnedView[] | null
  pinnedDatasets?: RoomPinnedDataset[] | null
  pinnedTaskBoards?: RoomPinnedTaskBoard[] | null
  assignedTools?: RoomToolAssignment[] | null
  viewLabelById?: Map<string, string> | null
  datasetLabelById?: Map<string, string> | null
  taskBoardLabelById?: Map<string, string> | null
  toolLabelById?: Map<string, string> | null
  toolSlugById?: Map<string, string> | null
  onOpenPinnedView?: (viewId: string) => void
  canManagePins?: boolean | null
  onOpenHistoryPane?: () => void
  onOpenResourcesPane?: () => void
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
  /** Open a draft conversation (no persistence until first message). */
  onCreateDraftConversation?: () => void
  /**
   * Called when the user starts a brand-new conversation from the room starter composer.
   * The returned `conversationId` is the newly created child conversation.
   */
  onConversationStarted?: (args: { conversationId: string; selectedAgent: AgentModel | null }) => void
  onOpenConversation?: (conversationId: string) => void
}) {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const effectiveStarshipSlug = (props.starshipSlug || (params.slug as string | undefined) || '').trim()
  const starterInputRef = useRef<ConversationMessageInputRef | null>(null)
  const participantsButtonRef = useRef<HTMLButtonElement | null>(null)
  const [starterSelectedAgent, setStarterSelectedAgent] = useState<AgentModel | null>(null)
  const [starterTab, setStarterTab] = useState<'suggestions' | 'datasets' | 'views' | 'tasks' | 'tools'>('suggestions')

  // Optional deep-link support: preselect an agent in the room starter composer.
  // Used as a replacement for the removed `/dm/...` routes.
  const preselectAgentId = useMemo(() => {
    const raw = searchParams.get('agentId')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])
  const { data: starshipAgents = [] } = useStarshipAgents(props.starshipId ?? '', Boolean(props.starshipId))
  useEffect(() => {
    if (!preselectAgentId) return
    if (!Array.isArray(starshipAgents) || starshipAgents.length === 0) return
    const match =
      (starshipAgents as AgentModel[]).find(a => String((a as any)?.id || '').trim() === preselectAgentId) ??
      (starshipAgents as AgentModel[]).find(a => String((a as any)?.slug || '').trim() === preselectAgentId) ??
      null
    if (!match) return
    setStarterSelectedAgent(prev => (prev?.id === match.id ? prev : match))
  }, [preselectAgentId, starshipAgents])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const slug = String(props.roomSlug || '').trim()
    if (slug !== 'leadgen') return

    const fromLeadGen = searchParams.get('fromLeadGen') === '1'
    if (!fromLeadGen) return

    const timer = window.setTimeout(() => {
      if (!starterInputRef.current) return

      try {
        const raw = window.sessionStorage.getItem('lead_gen_pending_prompt')
        if (!raw) return

        const parsed = JSON.parse(raw) as { prompt?: string; createdAt?: number }
        const prompt = String(parsed?.prompt || '').trim()
        if (!prompt) return

        const createdAt = typeof parsed?.createdAt === 'number' ? parsed.createdAt : null
        const maxAgeMs = 15 * 60 * 1000
        if (createdAt && Date.now() - createdAt > maxAgeMs) {
          return
        }

        // Prefer tagging the lead-gen Nora agent as a leading mention, when available.
        const noraAgent =
          (starshipAgents as AgentModel[]).find(a => String((a as any)?.slug || '').trim().toLowerCase() === 'nora') ??
          (starshipAgents as AgentModel[]).find(a => String((a as any)?.name || '').trim().toLowerCase() === 'nora') ??
          null

        if (noraAgent && starterInputRef.current.setLeadingMentionAgent) {
          starterInputRef.current.setLeadingMentionAgent(noraAgent, prompt)
        } else {
          starterInputRef.current.setInitialContent?.(prompt)
        }
      } catch {
        // Ignore storage/parsing errors.
      } finally {
        try {
          window.sessionStorage.removeItem('lead_gen_pending_prompt')
        } catch {
          // Ignore cleanup errors.
        }
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [props.roomSlug, searchParams, starshipAgents])

  const starterBadgeClass = (active: boolean) =>
    cn(
      badgeVariants({ variant: active ? 'connected' : 'outline' }),
      'rounded-full px-3 py-1 text-xs font-medium tracking-tight select-none',
      active
        ? 'border border-primary/25 bg-primary/10 text-primary shadow-sm hover:bg-primary/15'
        : 'border border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
    )

  const label = useMemo(() => {
    const name = String(props.roomName || '').trim()
    if (name) return name
    const slug = String(props.roomSlug || '').trim()
    return slug || 'Room'
  }, [props.roomName, props.roomSlug])

  const onCreateConversation = () => {
    if (props.onCreateDraftConversation) {
      props.onCreateDraftConversation()
      return
    }
    if (!effectiveStarshipSlug) return
    const roomSlug = String(props.roomSlug || '').trim()
    if (roomSlug) {
      router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/rooms/${encodeURIComponent(roomSlug)}/conversation/draft`)
      return
    }
    router.push(`/ship/${encodeURIComponent(effectiveStarshipSlug)}/conversations/${encodeURIComponent(props.roomConversationId)}?conversation=draft`)
  }

  const pinnedViews = (props.pinnedViews || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedDatasets = (props.pinnedDatasets || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const pinnedBoards = (props.pinnedTaskBoards || []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const assignedTools = (props.assignedTools || []).slice()
  const hasAnyResources = assignedTools.length > 0 || pinnedViews.length > 0 || pinnedDatasets.length > 0 || pinnedBoards.length > 0

  const openPinnedView = (viewId: string) => {
    const id = String(viewId || '').trim()
    if (!id) return
    props.onOpenPinnedView?.(id)
  }

  const openPinnedDataset = (datasetId: string) => {
    const id = String(datasetId || '').trim()
    if (!id) return
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/datasets/${encodeURIComponent(id)}` : null
    if (!href) return
    router.push(href)
  }

  const openPinnedBoard = () => {
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tasks` : null
    if (!href) return
    router.push(href)
  }

  const openPinnedTool = (toolId: string) => {
    const id = String(toolId || '').trim()
    if (!id) return
    const toolSlug = props.toolSlugById?.get(id) || ''
    const href = effectiveStarshipSlug && toolSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/tool/${encodeURIComponent(toolSlug)}` : null
    if (!href) return
    router.push(href)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConversationSummaryBar
        conversationId={props.roomConversationId}
        starshipId={props.starshipId}
        onParticipantsClick={() => participantsButtonRef.current?.click()}
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
            <RoomParticipantsButton
              starshipId={props.starshipId}
              roomConversationId={props.roomConversationId}
              roomIsPrivate={Boolean(props.roomIsPrivate)}
              starshipOwnerId={props.starshipOwnerId ?? null}
              buttonRef={participantsButtonRef}
              className="sr-only"
            />
            <Button type="button" size="icon" variant="outline" aria-label="History" title="History" onClick={() => props.onOpenHistoryPane?.()}>
              <Icon name="clock" className="h-4 w-4" />
            </Button>
            {props.canManagePins || hasAnyResources ? (
              <Button type="button" size="sm" variant="outline" onClick={() => props.onOpenResourcesPane?.()}>
                <Icon name="pin" className="h-4 w-4 mr-1" />
                Resources
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Room starter (conversation-starter style) */}
      <div className="flex-1 min-h-0 overflow-auto bg-background px-4 py-8">
        <div className="w-full max-w-4xl mx-auto h-full flex">
          <div className="w-full sm:max-w-2xl lg:max-w-3xl sm:mx-auto flex flex-col flex-1 pt-16 sm:pt-20 lg:pt-24 pb-12">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-normal text-foreground">Start a new conversation</h1>
            </div>

            <ConversationMessageInput
              ref={starterInputRef}
              selectedAgent={starterSelectedAgent}
              onAgentChange={setStarterSelectedAgent}
              starshipId={props.starshipId}
              conversationId={null}
              roomConversationId={props.roomConversationId}
              starshipSlug={effectiveStarshipSlug}
              newConversationParentConversationId={props.roomConversationId}
              newConversationTitleOverride="New conversation"
              allowedMentionUserIds={props.allowedMentionUserIds ?? undefined}
              allowedMentionAgentIds={props.allowedMentionAgentIds ?? undefined}
              onConversationStart={conversationId => {
                const cid = String(conversationId || '').trim()
                if (!cid) return
                props.onConversationStarted?.({ conversationId: cid, selectedAgent: starterSelectedAgent })
              }}
            />

              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap" role="tablist" aria-label="Room starter tabs">
                <button type="button" onClick={() => setStarterTab('suggestions')} className={starterBadgeClass(starterTab === 'suggestions')} role="tab" aria-selected={starterTab === 'suggestions'}>
                  Suggestions
                </button>
                <button type="button" onClick={() => setStarterTab('datasets')} className={starterBadgeClass(starterTab === 'datasets')} role="tab" aria-selected={starterTab === 'datasets'}>
                  Datasets
                </button>
                <button type="button" onClick={() => setStarterTab('views')} className={starterBadgeClass(starterTab === 'views')} role="tab" aria-selected={starterTab === 'views'}>
                  Views
                </button>
                <button type="button" onClick={() => setStarterTab('tasks')} className={starterBadgeClass(starterTab === 'tasks')} role="tab" aria-selected={starterTab === 'tasks'}>
                  Tasks
                </button>
                <button type="button" onClick={() => setStarterTab('tools')} className={starterBadgeClass(starterTab === 'tools')} role="tab" aria-selected={starterTab === 'tools'}>
                  Tools
                </button>
              </div>

              <div className="mt-4">
                {starterTab === 'suggestions' ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {[
                      'Suggest 5 conversation ideas for this room.',
                      'Summarize the key topics we should discuss here.',
                      'Draft a concise conversation title and first message.',
                      'What are the most important datasets/views to start with?',
                    ].map(s => (
                      <button key={s} type="button" onClick={() => void starterInputRef.current?.handleSuggestionSubmit(s)} className={starterBadgeClass(false)}>
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}

                {starterTab === 'datasets' ? (
                pinnedDatasets.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {pinnedDatasets.map(p => {
                      const id = String(p.datasetId)
                      const name = props.datasetLabelById?.get(id) || `Dataset ${id.slice(0, 8)}`
                      return (
                        <Button key={`starter:dataset:${id}`} type="button" size="sm" variant="outline" onClick={() => openPinnedDataset(id)}>
                          <Icon name="database" className="h-4 w-4 mr-1.5" />
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    No pinned datasets in this room.
                    {props.onOpenResourcesPane ? (
                      <>
                        {' '}
                        <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => props.onOpenResourcesPane?.()}>
                          Manage resources
                        </button>
                        .
                      </>
                    ) : null}
                  </div>
                )
              ) : null}

              {starterTab === 'views' ? (
                pinnedViews.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {pinnedViews.map(p => {
                      const id = String(p.viewId)
                      const name = props.viewLabelById?.get(id) || `View ${id.slice(0, 8)}`
                      return (
                        <Button key={`starter:view:${id}`} type="button" size="sm" variant="outline" onClick={() => openPinnedView(id)}>
                          <Icon name="layout" className="h-4 w-4 mr-1.5" />
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    No pinned views in this room.
                    {props.onOpenResourcesPane ? (
                      <>
                        {' '}
                        <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => props.onOpenResourcesPane?.()}>
                          Manage resources
                        </button>
                        .
                      </>
                    ) : null}
                  </div>
                )
              ) : null}

              {starterTab === 'tasks' ? (
                pinnedBoards.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {pinnedBoards.map(p => {
                      const id = String(p.boardId)
                      const name = props.taskBoardLabelById?.get(id) || `Board ${id.slice(0, 8)}`
                      return (
                        <Button key={`starter:board:${id}`} type="button" size="sm" variant="outline" onClick={() => openPinnedBoard()}>
                          <Icon name="list" className="h-4 w-4 mr-1.5" />
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    No pinned task boards in this room.
                    {props.onOpenResourcesPane ? (
                      <>
                        {' '}
                        <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => props.onOpenResourcesPane?.()}>
                          Manage resources
                        </button>
                        .
                      </>
                    ) : null}
                  </div>
                )
              ) : null}

              {starterTab === 'tools' ? (
                assignedTools.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {assignedTools.map(a => {
                      const id = String(a.toolId)
                      const name = props.toolLabelById?.get(id) || `Tool ${id.slice(0, 8)}`
                      return (
                        <Button key={`starter:tool:${id}`} type="button" size="sm" variant="outline" onClick={() => openPinnedTool(id)}>
                          <Icon name="workflow" className="h-4 w-4 mr-1.5" />
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    No assigned tools in this room.
                    {props.onOpenResourcesPane ? (
                      <>
                        {' '}
                        <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => props.onOpenResourcesPane?.()}>
                          Manage resources
                        </button>
                        .
                      </>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
