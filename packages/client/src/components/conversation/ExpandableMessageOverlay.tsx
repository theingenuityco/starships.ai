'use client'

import { ConversationMessageList } from './ConversationMessageList'
import { ConversationContextBar } from './ConversationContextBar'
import { cn } from '@/lib/utils'

interface ExpandableMessageOverlayProps {
  isExpanded: boolean
  conversationId: string | null
  starshipId: string
  budgetTokens?: number
}

export function ExpandableMessageOverlay({ isExpanded, conversationId, starshipId, budgetTokens }: ExpandableMessageOverlayProps) {
  if (!conversationId) return null

  return (
    <div className={cn('transition-all duration-300 ease-out overflow-hidden', 'border-b border-border/20', isExpanded ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0')}>
      {/* Context Bar */}
      {budgetTokens !== undefined && <ConversationContextBar conversationId={conversationId} budgetTokens={budgetTokens} />}

      {/* Message List */}
      <div className="overflow-hidden" style={{ height: isExpanded ? '60vh' : '0' }}>
        <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={24} />
      </div>
    </div>
  )
}
