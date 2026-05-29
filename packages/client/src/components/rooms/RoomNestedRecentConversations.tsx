'use client'

import Icon from '@/components/primitives/Icon'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import { normalizeConversationTitle } from '@/lib/normalizeConversationTitle'
import { useDemo } from '@/components/demo/DemoContext'
import { demoRoomConversations } from '@/components/demo/demoRooms'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

export function RoomNestedRecentConversations(props: {
  starshipSlug: string
  roomSlug: string
  roomConversationId: string
  activeConversationId?: string | null
  /**
   * Demo only: when set and no explicit activeConversationId matches, highlight
   * the most-recent conversation so the hero-video "camera" lands on a thread
   * under the spotlighted room. Inert outside the demo.
   */
  highlightFirst?: boolean
  onNavigate?: () => void
}) {
  const router = useRouter()

  // Demo: a synthetic room id resolves to mock threads instead of a network
  // fetch, so the spotlighted room shows a real-looking conversation on beat.
  const { active: demoActive } = useDemo()
  const demoConversations = demoActive ? demoRoomConversations(props.roomConversationId) : null
  const isDemoRoom = Boolean(demoConversations)

  const history = useChildConversationsPaged(props.roomConversationId ?? null, {
    enabled: Boolean(props.roomConversationId) && !isDemoRoom,
    limit: 4,
  })

  const recent = useMemo(() => {
    const list = isDemoRoom ? (demoConversations ?? []) : Array.isArray(history.conversations) ? history.conversations : []
    return list
      .slice()
      .sort((a: any, b: any) => {
        const at = Date.parse(String(a?.updatedAt || a?.createdAt || '')) || 0
        const bt = Date.parse(String(b?.updatedAt || b?.createdAt || '')) || 0
        return bt - at
      })
      .slice(0, 3)
  }, [history.conversations, isDemoRoom, demoConversations])

  const moreCount = isDemoRoom ? 0 : Math.max(0, Number(history.total ?? 0) - 3)

  const openConversation = (conversationId: string) => {
    const cid = String(conversationId || '').trim()
    if (!cid) return
    router.push(`/ship/${encodeURIComponent(props.starshipSlug)}/rooms/${encodeURIComponent(props.roomSlug)}/conversation/${encodeURIComponent(cid)}`)
    props.onNavigate?.()
  }

  const openHistoryPane = () => {
    router.push(`/ship/${encodeURIComponent(props.starshipSlug)}/rooms/${encodeURIComponent(props.roomSlug)}?pane=history`)
    props.onNavigate?.()
  }

  if (history.isLoading) {
    return <div className="text-[11px] text-muted-foreground pl-7 pr-1 py-1.5">Loading…</div>
  }

  if (!history.isLoading && recent.length === 0) {
    return null
  }

  return (
    <div className="ml-2 pl-2 pr-1 pb-1 overflow-hidden">
      <div className="space-y-0.5">
        {recent.map((c: any, idx: number) => {
          const id = String(c?.id || '').trim()
          if (!id) return null
          const matchesActive = Boolean(props.activeConversationId && String(props.activeConversationId) === id)
          const isActive = matchesActive || Boolean(props.highlightFirst && !props.activeConversationId && idx === 0)
          const titleRaw = String(c?.title || '').trim()
          const titleNorm = normalizeConversationTitle(titleRaw)
          const title = titleNorm || 'Untitled conversation'
          return (
            <button
              key={`room:${props.roomSlug}:recent:${id}`}
              type="button"
              className={cn(
                'flex items-center w-full h-7 px-2 gap-1.5 rounded-lg border border-transparent text-[12px] font-medium transition-colors overflow-hidden',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30]'
              )}
              onClick={() => openConversation(id)}
              title={title}
            >
              <Icon name="message-square" className="h-3 w-3 flex-shrink-0 opacity-80" />
              <span className="flex-1 min-w-0 truncate">{title}</span>
            </button>
          )
        })}

        {moreCount > 0 ? (
          <button
            type="button"
            onClick={openHistoryPane}
            className={cn(
              "ml-2 mt-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            )}
            aria-label={`Open history for room ${props.roomSlug}`}
            title="Open history"
          >
            +{moreCount} more
          </button>
        ) : null}
      </div>
    </div>
  )
}

