'use client'

import Icon from '@/components/primitives/Icon'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { Button } from '@/components/ui/button'
import { useChildConversationsPaged } from '@/hooks/useConversations'
import { normalizeConversationTitle } from '@/lib/normalizeConversationTitle'
import type { ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'
import { useMemo } from 'react'

export function RoomHistoryPane(props: {
  starshipId: string
  roomConversationId: string
  roomSlug?: string | null
  roomName?: string | null
  onOpenConversation: (conversationId: string) => void
  onClose: () => void
}) {
  const roomLabel = useMemo(() => {
    const name = String(props.roomName || '').trim()
    if (name) return name
    const slug = String(props.roomSlug || '').trim()
    return slug || 'Room'
  }, [props.roomName, props.roomSlug])

  const history = useChildConversationsPaged(props.roomConversationId ?? null, { enabled: Boolean(props.roomConversationId), limit: 25 })

  const sorted = useMemo(() => {
    const list = Array.isArray(history.conversations) ? history.conversations : []
    return list
      .slice()
      .sort((a: any, b: any) => {
        const at = Date.parse(String(a?.updatedAt || a?.createdAt || '')) || 0
        const bt = Date.parse(String(b?.updatedAt || b?.createdAt || '')) || 0
        return bt - at
      })
  }, [history.conversations])

  const totalLabel = useMemo(() => {
    const n = sorted.length
    if (history.isLoading) return 'Loading…'
    if (n === 0) return 'No conversations'
    return n === 1 ? '1 conversation' : `${n} conversations`
  }, [history.isLoading, sorted.length])

  const openConversation = (c: ConversationModel | any) => {
    const id = String(c?.id || '').trim()
    if (!id) return
    props.onClose()
    props.onOpenConversation(id)
  }

  const Row = (rowProps: { conversationId: string; title: string; whenText: string; agents: any[]; onClick: () => void }) => {
    const participantsLabel = (() => {
      const agents = Array.isArray(rowProps.agents) ? rowProps.agents : []
      const selfLabel = 'You'
      const names = [selfLabel]
        .concat(
          agents
            .map(a => String((a as any)?.name || (a as any)?.slug || '').trim())
            .filter(Boolean)
        )
      const unique = Array.from(new Set(names))
      if (unique.length === 0) return 'No participants'
      const firstTwo = unique.slice(0, 2)
      const rest = unique.length - firstTwo.length
      return rest > 0 ? `${firstTwo.join(', ')} +${rest}` : firstTwo.join(', ')
    })()

    return (
      <Button
        type="button"
        variant="ghost"
        className="group relative rounded-lg flex items-start gap-2 w-full h-auto px-2 py-2 text-[13px] font-medium border border-transparent justify-start text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted"
        onClick={rowProps.onClick}
      >
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="min-w-0 flex items-center gap-2">
            <span className="min-w-0 truncate">{rowProps.title}</span>
          </div>
          <div className="min-w-0 flex items-center gap-2 text-[11px] text-muted-foreground" title={participantsLabel} aria-label={`Participants: ${participantsLabel}`}>
            <span className="min-w-0 truncate">{participantsLabel}</span>
          </div>
        </div>
        {rowProps.whenText ? <span className="text-[11px] text-muted-foreground flex-shrink-0">{rowProps.whenText}</span> : null}
      </Button>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full min-w-0">
      {/* Header (match thread pane placement/spacing) */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <span className="mx-2 inline-flex h-8 w-8" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center text-foreground hover:text-foreground transition-colors"
                        onClick={props.onClose}
                        aria-label="Back to room"
                        title="Back to room"
                      >
                        <Icon name="arrow-left" className="h-4 w-4" />
                      </button>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">
                        <span className="inline-flex items-center whitespace-nowrap text-foreground">
                          <span>{roomLabel}</span>
                          <span className="mx-1">/</span>
                        </span>
                        History
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                      <div className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1">
                        <span className="font-medium leading-none text-muted-foreground">{totalLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <NotificationMenu type="room" roomId={props.roomConversationId} starshipId={props.starshipId} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto px-0 sm:px-4 md:px-6 py-4 space-y-3">
        {history.isLoading ? <div className="text-sm text-muted-foreground px-4 sm:px-0">Loading…</div> : null}

        {!history.isLoading ? (
          sorted.length > 0 ? (
            <div className="space-y-1">
              {sorted.map((c: any) => {
                const id = String(c?.id || '').trim()
                if (!id) return null
                const titleRaw = String(c?.title || '').trim()
                const titleNorm = normalizeConversationTitle(titleRaw)
                const title = titleNorm || 'Untitled conversation'
                const when = c?.updatedAt || c?.createdAt
                const whenText = when ? formatDistanceToNow(new Date(when), { addSuffix: false }) : ''
                const agents = Array.isArray(c?.agents) ? (c.agents as any[]) : []
                return <Row key={`history:${id}`} conversationId={id} title={title} whenText={whenText} agents={agents} onClick={() => openConversation(c)} />
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground px-4 sm:px-0">No conversations yet.</div>
          )
        ) : null}

        {history.hasMoreBefore ? (
          <div className="flex justify-center pb-4 pt-2">
            <button
              type="button"
              className={[
                'text-xs px-3 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors',
                history.isFetchingNextPage ? 'opacity-60 pointer-events-none' : '',
              ].join(' ')}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

