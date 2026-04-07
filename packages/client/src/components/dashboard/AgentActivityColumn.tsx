'use client'

import React, { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useStarshipConversations } from '@/hooks/useConversations'
import { useStarshipRooms } from '@/hooks/useRooms'
import type { AgentModel, ConversationModel, ConversationStatus } from '@starships/protocol'

interface AgentActivityColumnProps {
  starshipId: string | undefined
}

function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

type TimeBucket = 'hour' | 'today' | 'yesterday' | 'older'

const BUCKET_LABELS: Record<TimeBucket, string> = {
  hour: 'Last hour',
  today: 'Earlier today',
  yesterday: 'Yesterday',
  older: 'Older',
}

function timeBucket(dateStr: string | undefined): TimeBucket {
  if (!dateStr) return 'older'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return 'hour'
  if (mins < 24 * 60) return 'today'
  if (mins < 48 * 60) return 'yesterday'
  return 'older'
}

const STATUS_BADGE: Partial<Record<ConversationStatus, { label: string; className: string }>> = {
  completed: {
    label: 'Done',
    className: 'text-muted-foreground bg-muted/50 border-border/40',
  },
  paused: {
    label: 'Paused',
    className: 'text-amber-600 bg-amber-500/10 border-amber-400/30 dark:text-amber-400',
  },
}

const AVATAR_COLOURS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-pink-500',
]

function avatarColour(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length]!
}

function AgentAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const colour = avatarColour(name)
  const initial = name.charAt(0).toUpperCase()
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]'
  return (
    <span className={cn('flex items-center justify-center rounded-full font-semibold text-white flex-shrink-0', colour, sizeClass)}>
      {initial}
    </span>
  )
}

export function AgentActivityColumn({ starshipId }: AgentActivityColumnProps) {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const { data: conversationsData, isLoading: convsLoading } = useStarshipConversations(
    starshipId ?? '',
    !!starshipId
  )

  const { data: roomsData } = useStarshipRooms(starshipId ?? '', !!starshipId)

  const { roomConvIdToSlug, roomConvIdToName } = useMemo(() => {
    const slugMap: Record<string, string> = {}
    const nameMap: Record<string, string> = {}
    for (const room of roomsData?.rooms ?? []) {
      slugMap[room.conversationId] = room.slug
      nameMap[room.conversationId] = room.name
    }
    return { roomConvIdToSlug: slugMap, roomConvIdToName: nameMap }
  }, [roomsData])

  const convParentMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of (conversationsData?.conversations ?? []) as ConversationModel[]) {
      if (c.parentConversationId) m[c.id] = c.parentConversationId
    }
    return m
  }, [conversationsData])

  function resolveRoomConvId(convId: string): string | undefined {
    let current: string | undefined = convId
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      if (roomConvIdToName[current]) return current
      visited.add(current)
      current = convParentMap[current]
    }
    return undefined
  }

  const { runningConvs, recentConvs } = useMemo(() => {
    const convs = (conversationsData?.conversations ?? []) as Array<
      ConversationModel & { agents: AgentModel[] }
    >
    const sorted = convs
      .filter(c => c.status !== 'archived')
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      )
      .slice(0, 30)
    return {
      runningConvs: sorted.filter(c => c.hasActiveTurn),
      recentConvs: sorted.filter(c => !c.hasActiveTurn).slice(0, 20),
    }
  }, [conversationsData])

  const grouped = useMemo(() => {
    const order: TimeBucket[] = ['hour', 'today', 'yesterday', 'older']
    const map = new Map<TimeBucket, typeof recentConvs>()
    for (const conv of recentConvs) {
      const bucket = timeBucket(conv.updatedAt ?? conv.createdAt)
      if (!map.has(bucket)) map.set(bucket, [])
      map.get(bucket)!.push(conv)
    }
    return order.filter(b => map.has(b)).map(b => ({ bucket: b, items: map.get(b)! }))
  }, [recentConvs])

  const totalConvs = runningConvs.length + recentConvs.length

  function convHref(conv: ConversationModel): string {
    const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
    const roomSlug = roomConvId ? roomConvIdToSlug[roomConvId] : undefined
    if (!roomSlug) return `/ship/${slug}/rooms`
    return conv.parentConversationId
      ? `/ship/${slug}/rooms/${roomSlug}/conversation/${conv.id}`
      : `/ship/${slug}/rooms/${roomSlug}`
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 flex-shrink-0">
          <Icon name="activity" className="h-3.5 w-3.5 text-violet-500" />
        </div>
        <span className="text-sm font-semibold">Agent Activity</span>
        {runningConvs.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-bold px-1.5 h-[18px]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            {runningConvs.length} live
          </span>
        )}
        {totalConvs > 0 && runningConvs.length === 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-bold px-1.5 h-[18px] min-w-[18px]">
            {totalConvs}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="py-3">
          {convsLoading ? (
            <div className="space-y-3 px-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <Skeleton className="h-2.5 w-28" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : totalConvs === 0 ? (
            <div className="py-12 text-center px-4">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                <Icon name="activity" className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground/70 mb-1">No activity yet</p>
              <p className="text-xs text-muted-foreground">Agent conversations will appear here</p>
            </div>
          ) : (
            <>
              {/* Running now */}
              {runningConvs.length > 0 && (
                <div className="px-3 mb-3">
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-green-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                        Running now
                      </span>
                    </div>
                    <div className="divide-y divide-green-500/10">
                      {runningConvs.map(conv => {
                        const agent = (conv as any).agents?.[0]
                        const agentName = agent?.name ?? 'Agent'
                        const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
                        const roomName = roomConvId ? roomConvIdToName[roomConvId] : undefined
                        return (
                          <button
                            key={conv.id}
                            type="button"
                            onClick={() => router.push(convHref(conv))}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-green-500/5 transition-colors group"
                          >
                            <AgentAvatar name={agentName} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground/90 truncate group-hover:text-foreground transition-colors">
                                {conv.title || 'Untitled'}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {agentName}{roomName && <> · {roomName}</>}
                              </p>
                            </div>
                            <Icon name="arrow-right" className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline */}
              {grouped.map(({ bucket, items }) => (
                <div key={bucket}>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide">
                      {BUCKET_LABELS[bucket]}
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>

                  <div className="px-3 space-y-0.5">
                    {items.map(conv => {
                      const agent = (conv as any).agents?.[0]
                      const agentName = agent?.name ?? 'Agent'
                      const badge = STATUS_BADGE[conv.status] ?? null
                      const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
                      const roomName = roomConvId ? roomConvIdToName[roomConvId] : undefined

                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => router.push(convHref(conv))}
                          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left group hover:bg-muted/40 transition-colors"
                        >
                          <AgentAvatar name={agentName} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground/80 truncate group-hover:text-foreground transition-colors">
                              {conv.title || 'Untitled'}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                              {agentName}{roomName && <> · {roomName}</>}
                              <span className="mx-1 opacity-50">·</span>
                              {relativeTime(conv.updatedAt ?? conv.createdAt)}
                            </p>
                          </div>
                          {badge && (
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] h-4 px-1.5 flex-shrink-0 font-normal', badge.className)}
                            >
                              {badge.label}
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
