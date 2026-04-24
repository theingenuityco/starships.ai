'use client'

import React, { useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useStarshipConversations } from '@/hooks/useConversations'
import { useStarshipRooms } from '@/hooks/useRooms'
import type { AgentModel, ConversationModel, ConversationStatus } from '@starships/protocol'
import { relativeTime, avatarColour, agentChipColour, durationText } from './utils'

interface AgentActivityColumnProps {
  starshipId: string | undefined
}

type TypedConv = ConversationModel & { agents: AgentModel[] }

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
    className: 'text-amber-500 bg-amber-500/10 border-amber-500/20 dark:text-amber-400',
  },
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

// The timeline line is centered at: px-5 (20px) + half of w-6 (12px) = 32px from container left
const TIMELINE_ITEM_LEFT = 'px-5'

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

  const resolveRoomConvId = useCallback((convId: string): string | undefined => {
    let current: string | undefined = convId
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      if (roomConvIdToName[current]) return current
      visited.add(current)
      current = convParentMap[current]
    }
    return undefined
  }, [roomConvIdToName, convParentMap])

  const { runningConvs, recentConvs, totalUnfiltered } = useMemo(() => {
    const convs = (conversationsData?.conversations ?? []) as TypedConv[]
    const active = convs.filter(c => c.status !== 'archived')
    const sorted = active
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      )
      .slice(0, 30)
    return {
      totalUnfiltered: active.length,
      runningConvs: sorted.filter(c => c.hasActiveTurn),
      recentConvs: sorted.filter(c => !c.hasActiveTurn).slice(0, 20),
    }
  }, [conversationsData])

  const grouped = useMemo(() => {
    const order: TimeBucket[] = ['hour', 'today', 'yesterday', 'older']
    const map = new Map<TimeBucket, TypedConv[]>()
    for (const conv of recentConvs) {
      const bucket = timeBucket(conv.updatedAt ?? conv.createdAt)
      if (!map.has(bucket)) map.set(bucket, [])
      map.get(bucket)!.push(conv)
    }
    return order.filter(b => map.has(b)).map(b => ({ bucket: b, items: map.get(b)! }))
  }, [recentConvs])

  const totalConvs = runningConvs.length + recentConvs.length

  const convHref = useCallback((conv: ConversationModel): string => {
    const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
    const roomSlug = roomConvId ? roomConvIdToSlug[roomConvId] : undefined
    if (!roomSlug) return `/ship/${slug}/rooms`
    return conv.parentConversationId
      ? `/ship/${slug}/rooms/${roomSlug}/conversation/${conv.id}`
      : `/ship/${slug}/rooms/${roomSlug}`
  }, [resolveRoomConvId, roomConvIdToSlug, slug])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5">
        <Icon name="activity" className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Agent Activity</span>
        {runningConvs.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 text-green-500 text-[10px] font-bold px-2 h-[18px]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            {runningConvs.length} live
          </span>
        )}
        {totalConvs > 0 && runningConvs.length === 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-bold px-1.5 h-[18px] min-w-[18px] tabular-nums">
            {totalConvs}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {convsLoading ? (
          <div className="space-y-4 px-5 pt-3 pb-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-6 w-6 rounded-full flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : totalConvs === 0 ? (
          <div className="py-20 text-center px-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
              <Icon name="activity" className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No activity yet</p>
            <p className="text-xs text-muted-foreground">Agent conversations will appear here</p>
          </div>
        ) : (
          <div className="py-3">
            {/* ── Running now card ──────────────────────────────────── */}
            <div className="mx-5 mb-1 rounded-lg border border-border/40 overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
                <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', runningConvs.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-border/40')} />
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider', runningConvs.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/40')}>
                  Running now
                </span>
                {runningConvs.length > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">
                    {runningConvs.length} active
                  </span>
                )}
              </div>

              {runningConvs.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
                    <Icon name="activity" className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/60">No active runs</p>
                    <p className="text-[11px] text-muted-foreground/40">Agents will appear here when they&apos;re working</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs mt-1"
                    onClick={() => router.push(`/ship/${slug}/rooms`)}
                  >
                    Go to rooms
                    <Icon name="arrow-right" className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ) : (
                /* Card items */
                <div className="divide-y divide-border/40">
                  {runningConvs.map(conv => {
                    const agent = conv.agents?.[0]
                    const agentName = agent?.name ?? 'Agent'
                    const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
                    const roomName = roomConvId ? roomConvIdToName[roomConvId] : undefined
                    const startedAgo = relativeTime(conv.createdAt)
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => router.push(convHref(conv))}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors group"
                      >
                        <AgentAvatar name={agentName} size="sm" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-xs font-medium text-foreground truncate leading-snug group-hover:text-foreground transition-colors">
                            {conv.title || 'Untitled'}
                          </p>
                          {conv.lastMessage?.content && (
                            <p className="text-[11px] text-muted-foreground/55 truncate">
                              {conv.lastMessage.content}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border', agentChipColour(agentName))}>
                              {agentName}
                            </span>
                            {roomName && (
                              <span className="inline-flex items-center text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/40 bg-muted/30">
                                {roomName}
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-1 text-[10px] text-green-500/70 flex-shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                              started {startedAgo}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Connector from card bottom to timeline — only when both sections are present */}
            {grouped.length > 0 && (
              <div className={cn('flex gap-3', TIMELINE_ITEM_LEFT)}>
                <div className="w-6 flex justify-center flex-shrink-0">
                  <div className="w-px bg-border/40" style={{ height: 20 }} />
                </div>
              </div>
            )}

            {/* ── Time-bucketed past conversations ──────────────────── */}
            {grouped.map(({ bucket, items }, groupIdx) => (
              <div key={bucket}>
                {/* Bucket separator */}
                <div className={cn('flex items-start gap-3 pr-5', TIMELINE_ITEM_LEFT)}>
                  <div className="flex flex-col items-center flex-shrink-0 w-6 self-stretch">
                    <div className="w-px bg-border/40" style={{ height: 14 }} />
                    <div className="h-[7px] w-[7px] rotate-45 rounded-[1px] bg-background border border-border/40 flex-shrink-0" />
                    <div className="w-px bg-border/40" style={{ height: 14 }} />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0" style={{ paddingTop: 11 }}>
                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest whitespace-nowrap">
                      {BUCKET_LABELS[bucket]}
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                </div>

                {/* Items */}
                {items.map((conv, itemIdx) => {
                  const isLast = groupIdx === grouped.length - 1 && itemIdx === items.length - 1
                  const isRoomCreation = !!roomConvIdToName[conv.id]

                  // ── Room creation event ───────────────────────────
                  if (isRoomCreation) {
                    const roomName = roomConvIdToName[conv.id]!
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => router.push(convHref(conv))}
                        className={cn('w-full flex items-start gap-3 text-left hover:bg-muted/30 transition-colors group', TIMELINE_ITEM_LEFT)}
                      >
                        <div className="flex flex-col items-center flex-shrink-0 w-6 self-stretch">
                          <div className="w-px bg-border/40" style={{ height: 8 }} />
                          <div className="h-6 w-6 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-indigo-400">#</span>
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-border/40" />}
                        </div>
                        <div className="flex-1 min-w-0 py-2 space-y-1">
                          <p className="text-xs font-medium text-foreground/75 truncate group-hover:text-foreground transition-colors leading-snug">
                            {roomName}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-indigo-400/60 font-medium">Room created</span>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-auto">
                              {relativeTime(conv.createdAt)}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  }

                  // ── Agent run ─────────────────────────────────────
                  const agent = conv.agents?.[0]
                  const agentName = agent?.name ?? 'Agent'
                  const badge = STATUS_BADGE[conv.status] ?? null
                  const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
                  const roomName = roomConvId ? roomConvIdToName[roomConvId] : undefined
                  const duration = conv.status === 'completed' ? durationText(conv.createdAt, conv.updatedAt) : ''

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => router.push(convHref(conv))}
                      className={cn('w-full flex items-start gap-3 text-left hover:bg-muted/30 transition-colors group', TIMELINE_ITEM_LEFT)}
                    >
                      {/* Left column: avatar + connecting line */}
                      <div className="flex flex-col items-center flex-shrink-0 w-6 self-stretch">
                        <div className="w-px bg-border/40" style={{ height: 8 }} />
                        <AgentAvatar name={agentName} size="sm" />
                        {!isLast && <div className="w-px flex-1 bg-border/40" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 py-2 space-y-1.5">
                        <p className="text-xs font-medium text-foreground/80 truncate group-hover:text-foreground transition-colors leading-snug">
                          {conv.title || 'Untitled'}
                        </p>
                        {conv.lastMessage?.content && (
                          <p className="text-[11px] text-muted-foreground/50 truncate">
                            {conv.lastMessage.content}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border', agentChipColour(agentName))}>
                            {agentName}
                          </span>
                          {roomName && (
                            <span className="inline-flex items-center text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/40 bg-muted/30">
                              {roomName}
                            </span>
                          )}
                          {conv.status === 'paused' && (
                            <span className="inline-flex items-center text-[10px] text-amber-500/80 px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5">
                              Paused
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                            {duration && (
                              <span className="text-[10px] text-muted-foreground/35 tabular-nums">{duration}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                              {relativeTime(conv.updatedAt ?? conv.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}

            {totalUnfiltered > totalConvs && (
              <div className={cn('py-3', TIMELINE_ITEM_LEFT)}>
                <p className="text-[10px] text-muted-foreground/35 pl-9">
                  Showing {totalConvs} of {totalUnfiltered} conversations
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
