'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import { normalizeConversationTitle } from '@/lib/normalizeConversationTitle'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

export function RoomNestedRecentConversations(props: {
  starshipSlug: string
  roomSlug: string
  roomConversationId: string
  activeConversationId?: string | null
  onNavigate?: () => void
}) {
  const router = useRouter()

  const history = useChildConversationsPaged(props.roomConversationId ?? null, { enabled: Boolean(props.roomConversationId), limit: 4 })

  const recent = useMemo(() => {
    const list = Array.isArray(history.conversations) ? history.conversations : []
    return list
      .slice()
      .sort((a: any, b: any) => {
        const at = Date.parse(String(a?.updatedAt || a?.createdAt || '')) || 0
        const bt = Date.parse(String(b?.updatedAt || b?.createdAt || '')) || 0
        return bt - at
      })
      .slice(0, 3)
  }, [history.conversations])

  const moreCount = Math.max(0, Number(history.total ?? 0) - 3)

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
    <div className="ml-2 pl-2 pr-1 pb-1">
      <div className="space-y-0.5">
        {recent.map((c: any, idx: number) => {
          const id = String(c?.id || '').trim()
          if (!id) return null
          const isActive = Boolean(props.activeConversationId && String(props.activeConversationId) === id)
          const titleRaw = String(c?.title || '').trim()
          const titleNorm = normalizeConversationTitle(titleRaw)
          const title = titleNorm || 'Untitled conversation'
          const when = c?.updatedAt || c?.createdAt
          const whenText = when ? formatDistanceToNow(new Date(when), { addSuffix: false }) : ''
          return (
            <Button
              key={`room:${props.roomSlug}:recent:${id}`}
              type="button"
              variant="ghost"
              className={cn(
                // Match NavigationItem compact sidebar row styling + add connector branch.
                "relative w-full h-7 px-2 justify-start text-left text-[12px] font-medium rounded-lg border border-transparent gap-2 min-w-0",
                "bg-transparent hover:bg-transparent focus-visible:bg-transparent",
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => openConversation(id)}
              title={title}
            >
              <Icon name="message-square" className="h-3 w-3 flex-shrink-0 opacity-80" />
              <div className="min-w-0 flex-1">
                <span className="block w-full" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
              </div>
              {whenText ? <span className="flex-shrink-0 text-[10px] text-muted-foreground">{whenText}</span> : null}
            </Button>
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

