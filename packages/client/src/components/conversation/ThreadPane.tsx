'use client'

import Icon from '@/components/primitives/Icon'
import { AgentSelector } from '@/components/conversation/AgentSelector'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { ConversationStreamProvider } from '@/hooks/ConversationStreamContext'
import type { AgentModel } from '@starships/protocol'

export function ThreadPane(props: {
  starshipId: string
  starshipSlug?: string
  conversationId: string
  selectedAgent: AgentModel | null
  onAgentChange: (agent: AgentModel | null) => void
  onClose: () => void
  /** Optional extra classes for the outer container (header+body+composer live inside). */
  className?: string
}) {
  const { starshipId, starshipSlug, conversationId, selectedAgent, onAgentChange, onClose, className } = props

  return (
    <ConversationStreamProvider conversationId={conversationId} starshipId={starshipId}>
      <div className={className ?? 'flex flex-col h-full min-h-0'}>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Thread</h3>
              <span className="text-xs text-muted-foreground">in a side pane</span>
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
          <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={180} />
        </div>

        <div className="border-t border-border/60 px-3 py-2">
          <ConversationMessageInput
            selectedAgent={selectedAgent}
            starshipId={starshipId}
            conversationId={conversationId}
            disabled={false}
            minimal={true}
            onAgentChange={onAgentChange}
            starshipSlug={starshipSlug}
          />
        </div>
      </div>
    </ConversationStreamProvider>
  )
}
