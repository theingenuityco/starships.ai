'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useNotificationsStream } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Filter = 'all' | 'mentions' | 'dms' | 'reactions'

export default function NotificationsPage() {
  const params = useParams()
  const slug = typeof (params as any)?.slug === 'string' ? String((params as any).slug) : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null

  const [filter, setFilter] = useState<Filter>('all')
  const { notifications, unread, isLoading, markRead, markSeen } = useNotificationsStream(starshipId, Boolean(starshipId))

  const filtered = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : []
    if (filter === 'mentions') return list.filter(n => n.type === 'mention')
    if (filter === 'dms') return list.filter(n => n.type === 'dm')
    if (filter === 'reactions') return list.filter(n => n.type === 'reaction')
    return list
  }, [notifications, filter])

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {unread?.totalUnread ? `${unread.totalUnread} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => markSeen()} disabled={isLoading}>
            Mark seen
          </Button>
          <Button
            onClick={() => markRead()}
            disabled={isLoading || !(unread?.totalUnread > 0)}
          >
            Mark all read
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant={filter === 'all' ? 'default' : 'secondary'} onClick={() => setFilter('all')}>
          All
        </Button>
        <Button variant={filter === 'mentions' ? 'default' : 'secondary'} onClick={() => setFilter('mentions')}>
          Mentions
        </Button>
        <Button variant={filter === 'dms' ? 'default' : 'secondary'} onClick={() => setFilter('dms')}>
          Direct messages
        </Button>
        <Button variant={filter === 'reactions' ? 'default' : 'secondary'} onClick={() => setFilter('reactions')}>
          Reactions
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const isUnread = !n.readAt
              return (
                <div
                  key={n.id}
                  className={cn(
                    'rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3',
                    isUnread && 'ring-1 ring-border'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', isUnread ? 'text-foreground' : 'text-muted-foreground')}>
                        {n.type === 'mention' ? 'Mention' : n.type === 'dm' ? 'Direct message' : 'Reaction'}
                      </span>
                      {isUnread ? <span className="inline-block w-2 h-2 rounded-full bg-destructive" /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      Conversation: {n.conversationId}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => markRead({ conversationId: n.conversationId })}
                      disabled={!isUnread}
                    >
                      Mark read
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

