'use client'

import Icon from '@/components/primitives/Icon'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationSummaryBar, type ConversationParticipantItem } from '@/components/conversation/ConversationSummaryBar'
import { ThreadNotificationMenu } from '@/components/conversation/ThreadNotificationMenu'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import { useConversationAgents } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { AgentModel } from '@starships/protocol'
import type { MessageModel } from '@starships/protocol'
import { useEffect, useMemo, useRef, useState } from 'react'

export function ThreadPane(props: {
  starshipId: string
  starshipSlug?: string
  conversationId: string | null
  pinnedFirstMessage?: MessageModel | null
  /** When set (and conversationId is null), this pane acts as a draft thread. */
  draftParentConversationId?: string | null
  draftTitle?: string | null
  onThreadCreated?: (conversationId: string) => void
  selectedAgent: AgentModel | null
  onAgentChange: (agent: AgentModel | null) => void
  onClose: () => void
  /** Optional extra classes for the outer container (header+body+composer live inside). */
  className?: string
}) {
  const { starshipId, starshipSlug, conversationId, pinnedFirstMessage, draftParentConversationId, draftTitle, onThreadCreated, selectedAgent, onAgentChange, onClose, className } = props
  const { userId, userName, userEmail, userAvatar } = useAuth()
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [inputHeight, setInputHeight] = useState<number>(160)

  // Safety/repair:
  // Threads are not channels. The server rejects messages for non-channel conversations with 0 linked agents.
  // If we encounter a legacy/broken thread with no agents, treat it as a draft: first reply will create
  // a new properly-initialized child conversation and re-link the parent message.
  const { data: conversationAgents = [], isLoading: agentsLoading } = useConversationAgents(conversationId)
  const isBrokenThread = useMemo(() => {
    if (!conversationId) return false
    if (agentsLoading) return false
    return !Array.isArray(conversationAgents) || conversationAgents.length < 1
  }, [agentsLoading, conversationAgents, conversationId])

  // IMPORTANT:
  // Even if a thread has 0 linked agents, we still keep the conversation id mounted so:
  // - the thread can display/persist messages (human-only threads)
  // - the composer can use the persist-only path without dropping out of "thread context"
  // The server rejects agent execution for 0-agent non-channel conversations, but persisting messages is allowed.
  const effectiveConversationId = conversationId

  const draftParticipants = useMemo<ConversationParticipantItem[] | null>(() => {
    if (effectiveConversationId) return null

    const items: ConversationParticipantItem[] = []
    const seen = new Set<string>()

    const addHuman = (args: { id?: string | null; name?: string | null; avatarUrl?: string | null }) => {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const avatarUrl = typeof args.avatarUrl === 'string' ? args.avatarUrl.trim() : ''
      const label = name || (id ? `User ${id.slice(0, 6)}` : 'User')
      const key = id ? `human:${id}` : name ? `human:name:${name}` : `human:unknown:${label}`
      if (seen.has(key)) return
      seen.add(key)
      items.push({ kind: 'human', key, label, ...(avatarUrl ? { avatarUrl } : null) })
    }

    const addAgent = (args: { id?: string | null; name?: string | null; slug?: string | null; avatarAttachmentId?: string | null }) => {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
      const label = name || slug || (id ? `Agent ${id.slice(0, 6)}` : 'Agent')
      const key = `agent:${id || label}`
      if (seen.has(key)) return
      seen.add(key)
      const seed = name || slug || id || label
      const avatarAttachmentId = typeof args.avatarAttachmentId === 'string' ? args.avatarAttachmentId.trim() : ''
      items.push({ kind: 'agent', key, label, seed, ...(avatarAttachmentId ? { avatarAttachmentId } : null) })
    }

    // 1) Message author ("who the message belongs to")
    if (pinnedFirstMessage) {
      const role = typeof (pinnedFirstMessage as any)?.role === 'string' ? String((pinnedFirstMessage as any).role) : ''
      if (role === 'user') {
        addHuman({
          id: typeof (pinnedFirstMessage as any)?.userId === 'string' ? String((pinnedFirstMessage as any).userId) : null,
          name: typeof (pinnedFirstMessage as any)?.userName === 'string' ? String((pinnedFirstMessage as any).userName) : null,
          avatarUrl: typeof (pinnedFirstMessage as any)?.userAvatar === 'string' ? String((pinnedFirstMessage as any).userAvatar) : null,
        })
      } else if (role === 'assistant') {
        addAgent({
          id: typeof (pinnedFirstMessage as any)?.agentId === 'string' ? String((pinnedFirstMessage as any).agentId) : null,
          name: typeof (pinnedFirstMessage as any)?.agentName === 'string' ? String((pinnedFirstMessage as any).agentName) : null,
          avatarAttachmentId: null,
        })
      }
    }

    // 2) Thread initiator (current user)
    addHuman({ id: userId ?? null, name: userName ?? userEmail ?? null, avatarUrl: userAvatar ?? null })

    // 3) Selected agent (who will respond in the thread)
    if (selectedAgent) {
      addAgent({
        id: typeof (selectedAgent as any)?.id === 'string' ? String((selectedAgent as any).id) : null,
        name: typeof (selectedAgent as any)?.name === 'string' ? String((selectedAgent as any).name) : null,
        slug: typeof (selectedAgent as any)?.slug === 'string' ? String((selectedAgent as any).slug) : null,
        avatarAttachmentId: typeof (selectedAgent as any)?.avatarAttachmentId === 'string' ? String((selectedAgent as any).avatarAttachmentId) : null,
      })
    }

    return items.length > 0 ? items : null
  }, [effectiveConversationId, pinnedFirstMessage, selectedAgent, userAvatar, userEmail, userId, userName])

  const participantsHint = useMemo<ConversationParticipantItem[] | null>(() => {
    if (!effectiveConversationId) return null
    if (!pinnedFirstMessage) return null

    const items: ConversationParticipantItem[] = []
    const seen = new Set<string>()

    const addHuman = (args: { id?: string | null; name?: string | null; avatarUrl?: string | null }) => {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const avatarUrl = typeof args.avatarUrl === 'string' ? args.avatarUrl.trim() : ''
      const label = name || (id ? `User ${id.slice(0, 6)}` : 'User')
      const key = id ? `human:${id}` : name ? `human:name:${name}` : `human:unknown:${label}`
      if (seen.has(key)) return
      seen.add(key)
      items.push({ kind: 'human', key, label, ...(avatarUrl ? { avatarUrl } : null) })
    }

    const addAgent = (args: { id?: string | null; name?: string | null; slug?: string | null; avatarAttachmentId?: string | null }) => {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
      const label = name || slug || (id ? `Agent ${id.slice(0, 6)}` : 'Agent')
      const key = `agent:${id || label}`
      if (seen.has(key)) return
      seen.add(key)
      const seed = name || slug || id || label
      const avatarAttachmentId = typeof args.avatarAttachmentId === 'string' ? args.avatarAttachmentId.trim() : ''
      items.push({ kind: 'agent', key, label, seed, ...(avatarAttachmentId ? { avatarAttachmentId } : null) })
    }

    // Ensure the linked/pinned message author is always included, even if they haven't posted in the thread yet.
    const role = typeof (pinnedFirstMessage as any)?.role === 'string' ? String((pinnedFirstMessage as any).role) : ''
    if (role === 'user') {
      addHuman({
        id: typeof (pinnedFirstMessage as any)?.userId === 'string' ? String((pinnedFirstMessage as any).userId) : null,
        name: typeof (pinnedFirstMessage as any)?.userName === 'string' ? String((pinnedFirstMessage as any).userName) : null,
        avatarUrl: typeof (pinnedFirstMessage as any)?.userAvatar === 'string' ? String((pinnedFirstMessage as any).userAvatar) : null,
      })
    } else if (role === 'assistant') {
      addAgent({
        id: typeof (pinnedFirstMessage as any)?.agentId === 'string' ? String((pinnedFirstMessage as any).agentId) : null,
        name: typeof (pinnedFirstMessage as any)?.agentName === 'string' ? String((pinnedFirstMessage as any).agentName) : null,
        avatarAttachmentId: null,
      })
    }

    // Also include current user so the header is stable even before the first thread message is sent.
    addHuman({ id: userId ?? null, name: userName ?? userEmail ?? null, avatarUrl: userAvatar ?? null })

    return items.length > 0 ? items : null
  }, [effectiveConversationId, pinnedFirstMessage, userAvatar, userEmail, userId, userName])

  // Match the main conversation interface: reserve scroll space for the docked composer so the last
  // message isn't hidden behind it (and keep the padding consistent with channels).
  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return

    const update = () => {
      try {
        const rect = el.getBoundingClientRect()
        setInputHeight(Math.ceil(rect.height))
      } catch {
        // ignore
      }
    }

    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [effectiveConversationId])

  return (
    <ConversationStreamProvider conversationId={effectiveConversationId} starshipId={starshipId}>
      <div className={cn('flex flex-col h-full min-h-0 w-full min-w-0', className)}>
        <ConversationSummaryBar
          conversationId={effectiveConversationId}
          starshipId={starshipId}
          modelId={(selectedAgent as any)?.model ?? null}
          titleRightSlot={
            effectiveConversationId ? <ThreadNotificationMenu conversationId={effectiveConversationId} starshipId={starshipId} /> : null
          }
          mobileLeftSlot={
            <button
              type="button"
              className={cn(
                'mx-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
              onClick={onClose}
              aria-label="Back to conversation"
              title="Back"
            >
              <Icon name="arrow-left" className="h-5 w-5" />
            </button>
          }
          maxTokens={
            typeof (selectedAgent as any)?.maxTokens === 'number'
              ? (selectedAgent as any).maxTokens
              : typeof (selectedAgent as any)?.maxTokens === 'string'
                ? Number((selectedAgent as any).maxTokens)
                : null
          }
          fallbackTitle={draftTitle ?? 'New thread'}
          fallbackSubtitle={effectiveConversationId ? undefined : 'Draft (not saved)'}
          participantsOverride={draftParticipants}
          participantsHint={participantsHint}
          rightSlot={
            <>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                onClick={onClose}
                aria-label="Close thread"
                title="Close thread"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </>
          }
        />

        <div className="flex-1 min-h-0">
          <ConversationMessageList
            conversationId={effectiveConversationId}
            starshipId={starshipId}
            bottomPaddingPx={inputHeight + 12}
            pinnedFirstMessage={pinnedFirstMessage ?? null}
            contentWidth="full"
          />
        </div>

        {/* Match the main conversation interface "docked composer" spacing/structure */}
        <div ref={inputContainerRef} className="px-0 sm:px-4 md:px-6 pt-1.5 pb-[env(safe-area-inset-bottom)] sm:pb-3">
          <div className="w-full sm:max-w-3xl lg:max-w-4xl sm:mx-auto pointer-events-auto opacity-100 relative" data-message-input>
            <ConversationMessageInput
              selectedAgent={selectedAgent}
              starshipId={starshipId}
              conversationId={effectiveConversationId}
              onConversationStart={cid => {
                onThreadCreated?.(cid)
              }}
              newConversationParentConversationId={draftParentConversationId ?? null}
              newConversationTitleOverride={draftTitle ?? null}
              linkMessageToNewConversation={
                pinnedFirstMessage && draftParentConversationId
                  ? {
                      parentConversationId: draftParentConversationId,
                      messageId: String((pinnedFirstMessage as any).id),
                      content: String((pinnedFirstMessage as any)?.content ?? ''),
                      createdAt: typeof (pinnedFirstMessage as any)?.createdAt === 'string' ? String((pinnedFirstMessage as any).createdAt) : null,
                      role: typeof (pinnedFirstMessage as any)?.role === 'string' ? String((pinnedFirstMessage as any).role) : null,
                      userName: typeof (pinnedFirstMessage as any)?.userName === 'string' ? String((pinnedFirstMessage as any).userName) : null,
                      agentName: typeof (pinnedFirstMessage as any)?.agentName === 'string' ? String((pinnedFirstMessage as any).agentName) : null,
                      attachmentIds: Array.isArray((pinnedFirstMessage as any)?.attachmentIds) ? ((pinnedFirstMessage as any).attachmentIds as string[]) : null,
                    }
                  : null
              }
              disabled={false}
              minimal={true}
              onAgentChange={onAgentChange}
              starshipSlug={starshipSlug}
            />
          </div>
        </div>
      </div>
    </ConversationStreamProvider>
  )
}
