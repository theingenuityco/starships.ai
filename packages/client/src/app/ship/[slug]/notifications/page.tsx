'use client'

import Icon from '@/components/primitives/Icon'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useNotificationsStream } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { MobileBottomFilterBar } from '@/components/layout/MobileBottomFilterBar'

type Filter = 'all' | 'mentions' | 'reactions'

function safeDistanceToNow(input: string): string {
  try {
    const d = new Date(input)
    if (Number.isNaN(d.getTime())) return ''
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return ''
  }
}

function getConversationLabel(args: {
  starshipSlug: string
  conversationId: string
  threadParentConversationId?: string | null
}): {
  primary: string
  secondary?: string
  href: string
} {
  const shipSlug = String(args.starshipSlug || '').trim()
  const shipBase = shipSlug ? `/ship/${encodeURIComponent(shipSlug)}` : ''

  const cid = String(args.conversationId || '').trim()
  const parentId = String(args.threadParentConversationId || '').trim()
  if (parentId) {
    return {
      primary: 'a conversation',
      secondary: 'Thread',
      href: `${shipBase}/conversations/${encodeURIComponent(parentId)}?thread=${encodeURIComponent(cid)}`,
    }
  }

  return {
    primary: 'a conversation',
    secondary: cid ? `Conversation ${cid.slice(0, 8)}` : undefined,
    href: `${shipBase}/conversations/${encodeURIComponent(cid)}`,
  }
}

function getNotificationSentence(args: { type: string; locationLabel: string }): { title: string; iconName: 'tag' | 'chat' | 'smiley' | 'bell' } {
  const t = String(args.type || '')
  if (t === 'mention') return { title: `You were mentioned in ${args.locationLabel}`, iconName: 'tag' }
  if (t === 'dm') return { title: `New message in ${args.locationLabel}`, iconName: 'chat' }
  if (t === 'channel') return { title: `New message in ${args.locationLabel}`, iconName: 'chat' }
  if (t === 'reaction') return { title: `Your message got a reaction in ${args.locationLabel}`, iconName: 'smiley' }
  return { title: 'New notification', iconName: 'bell' }
}

export default function NotificationsPage() {
  const params = useParams()
  const slug = typeof (params as any)?.slug === 'string' ? String((params as any).slug) : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ?? null

  const [filter, setFilter] = useState<Filter>('all')
  const { notifications, unread, isLoading, markRead, hasMoreBefore, isLoadingOlder, loadOlder } = useNotificationsStream(starshipId, Boolean(starshipId))

  const filtered = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : []
    if (filter === 'mentions') return list.filter(n => n.type === 'mention')
    if (filter === 'reactions') return list.filter(n => n.type === 'reaction')
    return list
  }, [notifications, filter])

  const unreadItems = useMemo(() => filtered.filter(n => !n.readAt), [filtered])
  const readItems = useMemo(() => filtered.filter(n => Boolean(n.readAt)), [filtered])

  const filterCounts = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : []
    const counts: Record<Filter, number> = { all: list.length, mentions: 0, reactions: 0 }
    for (const n of list as any[]) {
      const t = String((n as any)?.type || '')
      if (t === 'mention') counts.mentions += 1
      else if (t === 'reaction') counts.reactions += 1
    }
    return counts
  }, [notifications])

  const mobileFilterOptions = useMemo(() => {
    const withCount = (label: string, n: number) => `${label} (${n})`
    return [
      { value: 'all', label: withCount('All', filterCounts.all) },
      { value: 'mentions', label: withCount('Mentions', filterCounts.mentions) },
      { value: 'reactions', label: withCount('Reactions', filterCounts.reactions) },
    ]
  }, [filterCounts])

  const renderRow = (n: any) => {
    const isUnread = !n.readAt
    const location = (() => {
      const cid = typeof n?.conversationId === 'string' ? String(n.conversationId).trim() : ''
      const parentId = typeof n?.threadParentConversationId === 'string' ? String(n.threadParentConversationId).trim() : ''
      return getConversationLabel({
        starshipSlug: slug,
        conversationId: cid,
        threadParentConversationId: parentId || null,
      })
    })()
    const sentence = getNotificationSentence({ type: n.type, locationLabel: location.primary })
    const timeAgo = safeDistanceToNow(n.createdAt)
    return (
      <div key={n.id} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3', isUnread && 'ring-1 ring-border')}>
        <Link href={location.href} className={cn('min-w-0 flex-1 group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md')} aria-label={sentence.title}>
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border', isUnread ? 'bg-muted/40 text-foreground' : 'bg-muted/10 text-muted-foreground')}>
              <Icon name={sentence.iconName} weight={isUnread ? 'bold' : 'regular'} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate', isUnread ? 'text-foreground' : 'text-muted-foreground', 'group-hover:text-foreground')}>{sentence.title}</span>
                {isUnread ? <span className="inline-block w-2 h-2 rounded-full bg-destructive" aria-label="Unread" /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">{location.secondary ? `${location.primary} · ${location.secondary}` : location.primary}</span>
                {timeAgo ? <span aria-label={`Received ${timeAgo}`}>{timeAgo}</span> : null}
              </div>
            </div>
          </div>
        </Link>
        {isUnread ? (
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" variant="secondary" onClick={() => markRead({ conversationId: n.conversationId })} aria-label="Mark this notification read">
              Mark read
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="bell" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Notifications</h3>
                    </div>

                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span
                        className="block min-w-0 truncate font-medium leading-snug"
                        title={unread?.totalUnread ? `${unread.totalUnread} unread` : 'All caught up'}
                      >
                        {unread?.totalUnread ? `${unread.totalUnread} unread` : 'All caught up'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <Tabs value={filter} onValueChange={value => setFilter(value as Filter)}>
              <div className="flex justify-start">
                <TabsList className="w-full sm:w-auto flex-nowrap justify-center sm:justify-start gap-1 overflow-x-auto custom-scrollbar">
                  <TabsTrigger value="all" className="flex-1 sm:flex-none min-w-0 justify-center">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="mentions" className="flex-1 sm:flex-none min-w-0 justify-center">
                    Mentions
                  </TabsTrigger>
                  <TabsTrigger value="reactions" className="flex-1 sm:flex-none min-w-0 justify-center">
                    Reactions
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : unreadItems.length === 0 && readItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <div className="space-y-10">
              {unreadItems.length > 0 ? (
                <div>
                  <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Unread</h3>
                      <span className="text-xs text-muted-foreground tabular-nums">({unreadItems.length})</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-primary hover:text-primary"
                      onClick={() => markRead()}
                      disabled={isLoading || unreadItems.length === 0}
                      aria-label="Mark all unread notifications read"
                    >
                      <Icon name="check-circle" className="h-4 w-4 mr-1.5" />
                      Mark all read
                    </Button>
                  </div>
                  <div className="space-y-2">{unreadItems.map(renderRow)}</div>
                </div>
              ) : null}

              {readItems.length > 0 ? (
                <div>
                  <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Read</h3>
                      <span className="text-xs text-muted-foreground tabular-nums">({readItems.length})</span>
                    </div>
                  </div>
                  <div className="space-y-2">{readItems.map(renderRow)}</div>
                </div>
              ) : null}
            </div>
          )}

          {hasMoreBefore ? (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={() => loadOlder()} disabled={isLoadingOlder || isLoading} className="h-8">
                {isLoadingOlder ? 'Loading…' : 'Load older'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <MobileBottomFilterBar filterValue={filter} onFilterChange={v => setFilter(v as Filter)} filterOptions={mobileFilterOptions} filterPlaceholder="Filter" />
    </div>
  )
}
