'use client'

import { useConversationDetail } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useMemo, useEffect, useRef, type ReactNode } from 'react'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'

export type ConversationParticipantItem = { kind: 'human'; key: string; label: string; avatarUrl?: string } | { kind: 'agent'; key: string; label: string; seed: string; avatarAttachmentId?: string }

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
  /** Optional override for the active model id (e.g. selected agent model). */
  modelId?: string | null
  /** Optional override for the max token budget (used as denominator). */
  maxTokens?: number | null
  /** Optional prefix shown before the title (e.g. "#" for channels). */
  titlePrefix?: ReactNode
  /** Optional content prepended inside the title text (e.g. "room/"). */
  titlePrepend?: ReactNode
  /**
   * Optional mobile-only left slot (replaces the hamburger/menu toggle).
   * Useful for "Back" when a thread is open on small screens.
   */
  mobileLeftSlot?: ReactNode
  /** Optional right-side content aligned to the title row (far right of the title container). */
  titleRightSlot?: ReactNode
  /** Optional right-side content (e.g. controls). */
  rightSlot?: ReactNode
  /** Optional title to show when `conversationId` is null (e.g. draft thread). */
  fallbackTitle?: string
  /** @deprecated No longer rendered. Kept for API compatibility. */
  fallbackSubtitle?: string
  /** @deprecated No longer rendered. Kept for API compatibility. */
  thirdLineSlot?: ReactNode
  /** @deprecated No longer rendered. Kept for API compatibility. */
  participantsOverride?: ConversationParticipantItem[] | null
  /** @deprecated No longer rendered. Kept for API compatibility. */
  participantsHint?: ConversationParticipantItem[] | null
  /** @deprecated No longer rendered. Kept for API compatibility. */
  onParticipantsClick?: (() => void) | null
}

function normalizeConversationTitle(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return t
  // Back-compat: older DM conversations were titled like "DM • Alice".
  const m = t.match(/^DM\s*[•·:\-–—]\s*(.+)$/i)
  if (m?.[1]) {
    const rest = String(m[1]).trim()
    return rest || t
  }
  // Back-compat: older thread titles were created like "Thread: <snippet>".
  const tm = t.match(/^Thread\s*:\s*(.+)$/i)
  if (tm?.[1]) {
    const rest = String(tm[1]).trim()
    return rest || t
  }
  return t
}

export function ConversationSummaryBar({
  conversationId,
  starshipId: _starshipId,
  modelId: _modelId,
  maxTokens: _maxTokens,
  titlePrefix,
  titlePrepend,
  mobileLeftSlot,
  titleRightSlot,
  rightSlot,
  fallbackTitle,
}: ConversationSummaryBarProps) {
  const { data: currentConversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId)

  const isDataReady = !isLoadingConversation && !!currentConversation

  const animationKey = useMemo(() => conversationId || 'none', [conversationId])

  const isInitialMountRef = useRef(true)
  const renderedPlaceholderForConversationRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialMountRef.current = false
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    renderedPlaceholderForConversationRef.current = false
  }, [conversationId])

  if (!conversationId || !isDataReady) {
    renderedPlaceholderForConversationRef.current = true
    const effectiveFallbackTitle = typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0 ? fallbackTitle.trim() : !conversationId ? 'Draft' : 'Loading...'

    return (
      <div className="sticky top-0 z-10 border-b border-border/60">
        <div className="h-10 px-4 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="flex-shrink-0 md:hidden">{mobileLeftSlot ?? <MobileNavToggleButton className="mx-1" />}</span>
            {titlePrefix ? <span className="flex-shrink-0 text-muted-foreground leading-none">{titlePrefix}</span> : null}
            <h3 className="flex-1 text-sm font-semibold text-foreground truncate min-w-0">
              {titlePrepend ? <span>{titlePrepend}</span> : null}
              <span className="opacity-50">{effectiveFallbackTitle}</span>
            </h3>
          </div>
          {titleRightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{titleRightSlot}</div> : null}
          {rightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{rightSlot}</div> : null}
        </div>
      </div>
    )
  }

  const title = normalizeConversationTitle(currentConversation?.title || `Conversation ${String(conversationId).slice(0, 8)}`)

  return (
    <motion.div
      key={animationKey}
      initial={isInitialMountRef.current || renderedPlaceholderForConversationRef.current ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        isInitialMountRef.current || renderedPlaceholderForConversationRef.current
          ? { duration: 0 }
          : {
              duration: 0.5,
              delay: 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }
      }
      className={cn('sticky top-0 z-10 border-b border-border/60')}
    >
      <div className="h-10 px-4 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className="flex-shrink-0 md:hidden">{mobileLeftSlot ?? <MobileNavToggleButton className="mx-1" />}</span>
          {titlePrefix ? <span className="flex-shrink-0 text-muted-foreground leading-none">{titlePrefix}</span> : null}
          <h3 className="flex-1 text-sm font-semibold text-foreground truncate min-w-0">
            {titlePrepend ? <span>{titlePrepend}</span> : null}
            {title}
          </h3>
        </div>
        {titleRightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{titleRightSlot}</div> : null}
        {rightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{rightSlot}</div> : null}
      </div>
    </motion.div>
  )
}
