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
    <div
      className={cn('transition-all duration-300 ease-out overflow-hidden', isExpanded ? 'border-b border-border/20 pb-4' : '')}
      style={{
        maxHeight: isExpanded ? '60vh' : '0',
        opacity: isExpanded ? 1 : 0,
        pointerEvents: isExpanded ? 'auto' : 'none',
      }}
      onMouseDown={e => {
        // Prevent blur event from firing when clicking in overlay
        e.preventDefault()
      }}
    >
      {/* Message List - Scrollable */}
      <div className="overflow-y-auto overflow-x-hidden transition-all duration-300 ease-out" style={{ height: isExpanded ? '60vh' : '0' }}>
        <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={80} />
      </div>
    </div>
  )
}
