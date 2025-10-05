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
    <div className={cn('transition-all duration-300 ease-out', 'border-b border-border/20', isExpanded ? 'max-h-[60vh] opacity-100 pointer-events-auto' : 'max-h-0 opacity-0 pointer-events-none')}>
      {/* Message List - Scrollable */}
      <div className="overflow-y-auto overflow-x-hidden mb-4" style={{ height: isExpanded ? '60vh' : '0' }}>
        <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={80} />
      </div>
    </div>
  )
}
