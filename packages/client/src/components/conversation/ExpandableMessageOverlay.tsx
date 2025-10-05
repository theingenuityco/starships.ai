'use client'

import { useEffect, useRef } from 'react'
import { ConversationMessageList } from './ConversationMessageList'
import { ConversationContextBar } from './ConversationContextBar'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ExpandableMessageOverlayProps {
  isExpanded: boolean
  onCollapse: () => void
  conversationId: string | null
  starshipId: string
  budgetTokens?: number
  inputHeight?: number
}

export function ExpandableMessageOverlay({ isExpanded, onCollapse, conversationId, starshipId, budgetTokens, inputHeight = 160 }: ExpandableMessageOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle click outside to collapse
  useEffect(() => {
    if (!isExpanded) return

    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        // Check if the click is on the input area (which should keep it expanded)
        const inputArea = document.querySelector('[data-message-input]')
        if (inputArea && inputArea.contains(event.target as Node)) {
          return
        }
        onCollapse()
      }
    }

    // Delay adding the listener to avoid immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded, onCollapse])

  // Handle escape key to collapse
  useEffect(() => {
    if (!isExpanded) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCollapse()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isExpanded, onCollapse])

  if (!conversationId) return null

  return (
    <>
      {/* Backdrop */}
      <div className={cn('fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 z-40', isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none')} onClick={onCollapse} />

      {/* Overlay Container */}
      <div
        ref={overlayRef}
        className={cn(
          'fixed left-0 right-0 bg-background border border-border/40 rounded-t-2xl shadow-2xl transition-all duration-300 ease-out z-50',
          'flex flex-col overflow-hidden',
          isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
        style={{
          bottom: `${inputHeight}px`,
          maxHeight: `calc(100vh - ${inputHeight + 100}px)`,
          marginLeft: '5.5rem', // Account for fixed navigation
        }}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
          <h3 className="text-sm font-medium text-foreground">Conversation History</h3>
          <Button variant="ghost" size="icon" onClick={onCollapse} className="h-7 w-7 rounded-full hover:bg-muted/50">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Context Bar */}
        {budgetTokens !== undefined && <ConversationContextBar conversationId={conversationId} budgetTokens={budgetTokens} />}

        {/* Message List */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationMessageList conversationId={conversationId} starshipId={starshipId} bottomPaddingPx={24} />
        </div>
      </div>
    </>
  )
}
