'use client'

import Icon from '@/components/primitives/Icon'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import { useConversationAgents } from '@/hooks/useConversations'
import type { AgentModel } from '@starships/protocol'
import type { MessageModel } from '@starships/protocol'
import { useMemo } from 'react'

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

  const effectiveConversationId = isBrokenThread ? null : conversationId

  return (
    <ConversationStreamProvider conversationId={effectiveConversationId} starshipId={starshipId}>
      <div className={className ?? 'flex flex-col h-full min-h-0'}>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Thread</h3>
              {effectiveConversationId ? <span className="text-xs text-muted-foreground">in a side pane</span> : <span className="text-xs text-muted-foreground">draft (not saved)</span>}
            </div>
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <AgentSelector selectedAgent={selectedAgent as any} onAgentChange={onAgentChange as any} starshipId={starshipId} compact={true} />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              onClick={onClose}
              aria-label="Close thread"
              title="Close thread"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ConversationMessageList conversationId={effectiveConversationId} starshipId={starshipId} bottomPaddingPx={180} pinnedFirstMessage={pinnedFirstMessage ?? null} />
        </div>

        {/* Match the main conversation interface "docked composer" spacing/structure */}
        <div className="px-4 pb-4 pt-2">
          <div className="w-full pointer-events-auto opacity-100 relative" data-message-input>
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
                pinnedFirstMessage && draftParentConversationId ? { parentConversationId: draftParentConversationId, messageId: String((pinnedFirstMessage as any).id) } : null
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
