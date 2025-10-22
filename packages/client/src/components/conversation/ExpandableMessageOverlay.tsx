'use client'

import { ConversationMessageList } from './ConversationMessageList'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'

interface ExpandableMessageOverlayProps {
  mode: 'collapsed' | 'semi' | 'expanded'
  conversationId: string | null
  starshipId: string
  budgetTokens?: number
  onExpand?: () => void
  onToggle?: () => void
}

export function ExpandableMessageOverlay({ mode, conversationId, starshipId, budgetTokens, onExpand, onToggle }: ExpandableMessageOverlayProps) {
  if (!conversationId) return null

  const isExpanded = mode === 'expanded'
  const isSemi = mode === 'semi'
  const containerMaxHeight = isExpanded ? '60vh' : isSemi ? '28vh' : '0'
  const listHeight = containerMaxHeight
  const visible = isExpanded || isSemi

  return (
    <div
      className={cn('transition-all duration-300 ease-out overflow-hidden relative', visible ? 'border-b border-border/20 pb-4' : '')}
      style={{
        maxHeight: containerMaxHeight,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onMouseDown={e => {
        // Prevent blur event from firing when clicking in overlay
        e.preventDefault()
      }}
    >
      {/* Message List - Scrollable */}
      <div className="overflow-y-auto overflow-x-hidden transition-all duration-300 ease-out" style={{ height: listHeight }}>
        <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={80} />
      </div>

      {/* Toggle affordance (icon button) shown in semi/expanded */}
      {visible && (onToggle || onExpand) && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 rounded-full text-primary"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              try {
                if (onToggle) onToggle()
                else onExpand?.()
              } catch {}
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Icon name={isExpanded ? 'chevron-down' : 'chevron-up'} className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
