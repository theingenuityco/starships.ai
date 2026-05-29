'use client'

import Icon from '@/components/primitives/Icon'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import { normalizeConversationTitle } from '@/lib/normalizeConversationTitle'
import { useDemo } from '@/components/demo/DemoContext'
import { activityStatus, demoRoomActivity, isDemoRoomSlug } from '@/components/demo/demoActivity'
import { DemoStatusIndicator } from '@/components/demo/DemoStatusIndicator'
import { AnimatePresence, motion } from 'motion/react'
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

  // Demo: a demo room resolves to the shared per-room activity (the same items
  // Mission Control's log renders) instead of a network fetch — one row per
  // agent conversation, with its live status, all driven by the beat clock.
  const { active: demoActive, beat } = useDemo()
  const isDemoRoom = demoActive && isDemoRoomSlug(props.roomSlug)
  const demoItems = useMemo(() => (isDemoRoom ? demoRoomActivity(props.roomSlug, beat) : []), [isDemoRoom, props.roomSlug, beat])

  const history = useChildConversationsPaged(props.roomConversationId ?? null, {
    enabled: Boolean(props.roomConversationId) && !isDemoRoom,
    limit: 4,
  })

  const recent = useMemo(() => {
    if (isDemoRoom) return demoItems.slice(0, 3)
    const list = Array.isArray(history.conversations) ? history.conversations : []
    return list
      .slice()
      .sort((a: any, b: any) => {
        const at = Date.parse(String(a?.updatedAt || a?.createdAt || '')) || 0
        const bt = Date.parse(String(b?.updatedAt || b?.createdAt || '')) || 0
        return bt - at
      })
      .slice(0, 3)
  }, [history.conversations, isDemoRoom, demoItems])

  const moreCount = isDemoRoom ? Math.max(0, demoItems.length - 3) : Math.max(0, Number(history.total ?? 0) - 3)

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
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="ml-2 pl-2 pr-1 pb-1 overflow-hidden"
    >
      {/* Entry/exit + reorder animation mirrors Mission Control's activity log:
          opacity-only enter/exit with `layout="position"` so rows slide to their
          new slot as the beat clock adds/removes conversations. */}
      <div className="space-y-0.5">
        <AnimatePresence initial={false} mode="popLayout">
          {recent.map((c: any, idx: number) => {
            const id = String(c?.id || '').trim()
            if (!id) return null
            const matchesActive = Boolean(props.activeConversationId && String(props.activeConversationId) === id)
            const isActive = matchesActive || Boolean(props.highlightFirst && !props.activeConversationId && idx === 0)
            const titleRaw = String(c?.action ?? c?.title ?? '').trim()
            const titleNorm = isDemoRoom ? titleRaw : normalizeConversationTitle(titleRaw)
            const title = titleNorm || 'Untitled conversation'
            // Demo: live/needs-you/just-completed get a status marker; everything
            // else (idle, already-done) falls back to the normal conversation icon.
            // The marker cross-fades between states via DemoStatusIndicator.
            const demoStatus = isDemoRoom ? activityStatus(c.state, c.at) : 'idle'
            return (
              <motion.button
                key={`room:${props.roomSlug}:recent:${id}`}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                type="button"
                className={cn(
                  'flex items-center w-full h-7 px-2 gap-1.5 rounded-lg border border-transparent text-xs font-normal transition-colors overflow-hidden',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30]'
                )}
                onClick={() => openConversation(id)}
                title={title}
              >
                {isDemoRoom ? (
                  <DemoStatusIndicator
                    status={demoStatus}
                    className="opacity-90"
                    idleFallback={<Icon name="message-square" className="h-3 w-3 opacity-80" />}
                  />
                ) : (
                  <Icon name="message-square" className="h-3 w-3 flex-shrink-0 opacity-80" />
                )}
                <span className="flex-1 min-w-0 truncate text-left">{title}</span>
              </motion.button>
            )
          })}

          {moreCount > 0 ? (
            <motion.button
              key={`room:${props.roomSlug}:more`}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              type="button"
              onClick={openHistoryPane}
              className={cn(
                "ml-2 mt-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              )}
              aria-label={`Open history for room ${props.roomSlug}`}
              title="Open history"
            >
              +{moreCount} more
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

