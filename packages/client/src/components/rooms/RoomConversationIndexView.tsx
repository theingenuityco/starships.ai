'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationSummaryBar } from '@/components/conversation/ConversationSummaryBar'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import type { ConversationMessageInputRef } from '@/components/conversation/ConversationMessageInput'
import { RoomParticipantsButton } from '@/components/rooms/RoomParticipantsButton'
import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LEAD_GEN_PROMPT_CARDS } from '@/app/use-cases/lead-gen-prompts'
import { useStarshipAgents } from '@/hooks/useAgents'
import { cn } from '@/lib/utils'
import type { AgentModel, RoomPinnedDataset, RoomPinnedTaskBoard, RoomPinnedView, RoomToolAssignment } from '@starships/protocol'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

export function RoomConversationIndexView(props: {
  starshipId: string
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  roomIsPrivate?: boolean | null
  roomManagerAgentId?: string | null
  /** Optional provenance tag for bundle-provisioned rooms (e.g. "lead-generation"). */
  roomProvisionedByBundle?: string | null
  starshipOwnerId?: string | null
  starshipSlug?: string | null
  onOpenParticipantsPane?: () => void
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
  const [starterTab, setStarterTab] = useState<'suggestions' | 'datasets'>('suggestions')

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

  // Default the starter agent to the room manager when available,
  // so users can send messages without manually selecting an agent.
  useEffect(() => {
    const mgrId = typeof props.roomManagerAgentId === 'string' ? props.roomManagerAgentId.trim() : ''
    if (!mgrId) return
    if (!Array.isArray(starshipAgents) || starshipAgents.length === 0) return

    const mgr =
      (starshipAgents as AgentModel[]).find(a => String((a as any)?.id || '').trim() === mgrId) ??
      (starshipAgents as AgentModel[]).find(a => String((a as any)?.slug || '').trim() === mgrId) ??
      null
    if (!mgr) return
    setStarterSelectedAgent(prev => (prev?.id ? prev : mgr))
  }, [props.roomManagerAgentId, starshipAgents])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const slug = String(props.roomSlug || '').trim()
    const isLeadGenRoom =
      String(props.roomProvisionedByBundle || '').trim() === 'lead-generation' || slug === 'leadgen'
    if (!isLeadGenRoom) return

    const timer = window.setTimeout(() => {
      if (!starterInputRef.current) return

      try {
        const raw = window.sessionStorage.getItem('lead_gen_pending_prompt')
        if (!raw) return

        // Optional safety: only hydrate when the pending prompt was captured for this starship.
        const lastStarshipId = window.sessionStorage.getItem('lead_gen_last_starship_id')
        if (props.starshipId && lastStarshipId && lastStarshipId !== props.starshipId) {
          return
        }

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
          (starshipAgents as AgentModel[]).find(
            a =>
              String((a as any)?.slug || '')
                .trim()
                .toLowerCase() === 'nora'
          ) ??
          (starshipAgents as AgentModel[]).find(
            a =>
              String((a as any)?.name || '')
                .trim()
                .toLowerCase() === 'nora'
          ) ??
          null

        if (noraAgent && starterInputRef.current.setLeadingMentionAgent) {
          // Ensure Nora is the active starter agent as well.
          setStarterSelectedAgent(prev => (prev?.id ? prev : noraAgent))
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
  }, [props.starshipId, props.roomSlug, props.roomProvisionedByBundle, starshipAgents])

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

  const isLeadGenRoom =
    String(props.roomProvisionedByBundle || '').trim() === 'lead-generation' ||
    String(props.roomSlug || '').trim().toLowerCase() === 'leadgen'

  const isLobbyRoom = String(props.roomSlug || '').trim().toLowerCase() === 'lobby'

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

  const openPinnedDataset = (datasetId: string) => {
    const id = String(datasetId || '').trim()
    if (!id) return
    const href = effectiveStarshipSlug ? `/ship/${encodeURIComponent(effectiveStarshipSlug)}/datasets/${encodeURIComponent(id)}` : null
    if (!href) return
    router.push(href)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConversationSummaryBar
        conversationId={props.roomConversationId}
        starshipId={props.starshipId}
        onParticipantsClick={() => props.onOpenParticipantsPane?.()}
        titleRightSlot={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
              aria-label="History"
              title="History"
              onClick={() => props.onOpenHistoryPane?.()}
            >
              <Icon name="clock" weight="bold" className="h-4 w-4" />
            </Button>
            {props.canManagePins ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                aria-label="Resources"
                title="Resources"
                onClick={() => props.onOpenResourcesPane?.()}
              >
                <Icon name="pin" weight="bold" className="h-4 w-4" />
              </Button>
            ) : null}
            {isLeadGenRoom && effectiveStarshipSlug && props.roomSlug ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                aria-label="Dashboard"
                title="Dashboard"
                asChild
              >
                <Link href={`/ship/${encodeURIComponent(effectiveStarshipSlug)}/rooms/${encodeURIComponent(props.roomSlug)}/dashboard`}>
                  <Icon name="bar-chart" weight="bold" className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <NotificationMenu type="room" roomId={props.roomConversationId} starshipId={props.starshipId} />
          </>
        }
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
      />

      {/* Room starter (conversation-starter style) */}
      <div className="flex-1 min-h-0 overflow-auto room-conversation-bg px-4 py-8 flex flex-col">
        <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0">
          <div className="w-full sm:max-w-2xl lg:max-w-3xl sm:mx-auto flex flex-col flex-1 min-h-0 pt-16 sm:pt-20 lg:pt-24 pb-12">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-normal text-foreground">
                {isLeadGenRoom ? "Let's generate leads" : 'Start a new conversation'}
              </h1>
            </div>

            <ConversationMessageInput
              ref={starterInputRef}
              selectedAgent={starterSelectedAgent}
              onAgentChange={setStarterSelectedAgent}
              starshipId={props.starshipId}
              conversationId={null}
              roomConversationId={props.roomConversationId}
              roomManagerAgentId={props.roomManagerAgentId ?? null}
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
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="lightbulb" className="h-3.5 w-3.5" />
                    <span>Suggestions</span>
                  </span>
                </button>
                <button type="button" onClick={() => setStarterTab('datasets')} className={starterBadgeClass(starterTab === 'datasets')} role="tab" aria-selected={starterTab === 'datasets'}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="database" className="h-3.5 w-3.5" />
                    <span>Database</span>
                  </span>
                </button>
              </div>

              <div className="mt-4">
                {starterTab === 'suggestions' ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {isLeadGenRoom
                      ? LEAD_GEN_PROMPT_CARDS.map(card => (
                          <button
                            key={card.title}
                            type="button"
                            onClick={() => starterInputRef.current?.setInitialContent(card.description)}
                            className={starterBadgeClass(false)}
                          >
                            {card.title}
                          </button>
                        ))
                      : [
                          'Suggest 5 conversation ideas for this room.',
                          'Summarize the key topics we should discuss here.',
                          'Draft a concise conversation title and first message.',
                          'What are the most important databases to start with?',
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

            </div>
          </div>
        </div>
      </div>

      {isLobbyRoom ? (
        <div className="flex-none room-conversation-bg px-4 py-5 sm:py-6 flex flex-col items-center gap-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
          <Button
            asChild
            size="lg"
            className="relative inline-flex items-center justify-center h-11 px-6 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap text-white bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition border-0 gap-2"
          >
            <Link href="/use-cases/lead-generation" className="inline-flex items-center gap-2">
              Generate Leads
              <Icon name="chevron-right" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
