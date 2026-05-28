'use client'

/**
 * Mission-control composite page — staged single-frame demo surface used for the
 * hero-video shoot. Mock-fed and gated off in production. Keyboard control:
 *   Space / ArrowRight  — advance to the next beat
 *   Backspace / ArrowLeft — go back one beat
 *   R                   — reset to beat 0
 *
 * Frame (Variation D — cards as a unified global feed):
 *   ┌────────────────────────────────────────────────┬───────────────────┐
 *   │ Cards (one feed across all rooms)              │ YOUR QUEUE        │
 *   │ ┌──────────────────────────────────────────┐   │ (top of column)   │
 *   │ │ [Engin] PR #432 ...     IN REVIEW   ◉    │   ├───────────────────┤
 *   │ ├──────────────────────────────────────────┤   │ Activity          │
 *   │ │ [Sup]   #1042 ...       TRIAGED          │   │  unified log      │
 *   │ ├──────────────────────────────────────────┤   │                   │
 *   │ │ [Ops]   May invoices    RUNNING          │   │                   │
 *   │ │ ...                                      │   │                   │
 *   │ └──────────────────────────────────────────┘   │                   │
 *   └────────────────────────────────────────────────┴───────────────────┘
 *   Each card carries a room badge instead of being grouped under a room
 *   lane. Cards needing your attention are pinned at the top, then ordered
 *   by recency. The right column stacks YOUR QUEUE on top and the unified
 *   Activity log filling the rest.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { avatarColour, agentChipColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipRooms } from '@/hooks/useRooms'
import type { AgentModel } from '@starships/protocol'

// ─── Beats ───────────────────────────────────────────────────────────────────

type Beat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
const MAX_BEAT: Beat = 7

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0', avatarColour(name), className)}>
      {getInitials(name)}
    </div>
  )
}

function formatAgo(secs: number): string {
  if (secs < 30) return 'now'
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.round(secs / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

// ─── Unified feed card ───────────────────────────────────────────────────────

type RoomKey = 'Support' | 'Engineering' | 'Ops'

type CardType = 'ticket' | 'pr' | 'run'

type StatusKind =
  | 'new'
  | 'triaged'
  | 'resolved'
  | 'scoped'
  | 'building'
  | 'in-review'
  | 'merged'
  | 'running'

type FeedCardIndicator = { icon?: string; label: string }

type FeedCard = {
  id: string
  type: CardType
  room: RoomKey
  /** The task board this card lives on (e.g. "Engineering Pipeline"). */
  board: string
  /** Optional display id shown before the title (e.g. "#1042" or "fix/mobile-signin"). */
  displayId?: string
  title: string
  /** Longer body — 2-3 sentences, line-clamped in the card. */
  description?: string
  /** Agent or person assigned to this task. */
  assignee?: string
  /** Small meta indicators rendered in the footer (e.g. "12 checks", "142 tests"). */
  indicators?: FeedCardIndicator[]
  /** The column the card sits in (e.g. "IN REVIEW"). */
  status: string
  statusKind: StatusKind
  primary?: boolean
  needsYou?: boolean
  /** Seconds ago. 0 = now. Smaller = more recent. */
  at: number
}

const TYPE_ICON: Record<CardType, string> = {
  ticket: 'mail',
  pr: 'git-branch',
  run: 'list',
}

const STATUS_CLS: Record<StatusKind, string> = {
  new:         'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40',
  triaged:     'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/40',
  resolved:    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40',
  scoped:      'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/40',
  building:    'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/40',
  'in-review': 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/40',
  merged:      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40',
  running:     'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40',
}

const LIVE_KINDS = new Set<StatusKind>(['building', 'running', 'in-review'])
const DONE_KINDS = new Set<StatusKind>(['resolved', 'merged'])

// Single shared card surface so UnifiedCard, RunningNowCard, and any future card-shaped
// elements all share the same bg + border treatment.
const CARD_SURFACE = 'rounded-lg border border-border/60 bg-card shadow-sm'

function UnifiedCard({ card }: { card: FeedCard }) {
  const isLive = LIVE_KINDS.has(card.statusKind)
  const isDone = DONE_KINDS.has(card.statusKind)

  return (
    <div
      className={cn(
        'group relative overflow-hidden transition-all duration-500',
        CARD_SURFACE,
        card.needsYou
          ? 'border-primary/60 ring-2 ring-primary/40 shadow-md shadow-primary/15'
          : card.primary
            ? 'border-primary/40 ring-1 ring-primary/20'
            : null,
        isDone && !card.primary && !card.needsYou && 'opacity-60'
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 py-2.5 pl-3 pr-2.5">
        {/* Type icon — neutral framing */}
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground"
          title={`${card.room} · ${card.type}`}
        >
          <Icon name={TYPE_ICON[card.type]} weight="bold" className="h-3.5 w-3.5" />
        </span>

        {/* Body: title, board+id meta, description, footer */}
        <div className="min-w-0 space-y-1.5">
          {/* Title */}
          <p className="truncate text-xs font-semibold leading-snug">{card.title}</p>

          {/* Board · displayId */}
          <p className="truncate text-[10px] text-muted-foreground/60">
            <span className="text-muted-foreground/80">{card.board}</span>
            {card.displayId ? <span className="font-mono"> · {card.displayId}</span> : null}
          </p>

          {/* Description */}
          {card.description ? (
            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{card.description}</p>
          ) : null}

          {/* Footer: assignee + indicators */}
          {card.assignee || (card.indicators && card.indicators.length > 0) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              {card.assignee ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={card.assignee} className="h-4 w-4 text-[8px]" />
                  <span className="text-[10px] font-medium text-foreground/80">{card.assignee}</span>
                </span>
              ) : null}
              {card.indicators?.map((ind) => (
                <span key={ind.label} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                  {ind.icon ? <Icon name={ind.icon} weight="bold" className="h-3 w-3" /> : null}
                  {ind.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Status badge + age */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              STATUS_CLS[card.statusKind]
            )}
          >
            {isLive ? <span className="h-1 w-1 rounded-full bg-current animate-pulse" /> : null}
            {card.status}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40">
            {formatAgo(card.at)}
          </span>
        </div>
      </div>

      {/* Needs-you action footer */}
      {card.needsYou ? (
        <div className="flex items-center gap-2 border-t border-primary/30 bg-primary/10 px-3 py-1.5">
          <Icon name="alert-circle" weight="bold" className="h-3 w-3 animate-pulse text-primary" />
          <span className="text-[11px] font-medium text-primary">Awaiting your review</span>
          <span className="ml-auto text-[10px] text-muted-foreground">in your queue →</span>
        </div>
      ) : null}
    </div>
  )
}

// ─── Section header for the feed (Needs your attention / Active / Done) ─────

function SectionHeader({ label, icon, tone, count }: { label: string; icon?: string; tone: 'primary' | 'active' | 'done'; count: number }) {
  const toneCls =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'active'
        ? 'text-foreground/70'
        : 'text-muted-foreground/50'
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
      {icon ? <Icon name={icon} weight="bold" className={cn('h-3.5 w-3.5', toneCls)} /> : null}
      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', toneCls)}>{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40">{count}</span>
      <span className="h-px flex-1 bg-border/30" />
    </div>
  )
}

// ─── Activity items (shape + visual language match AgentActivityColumn on /dashboard) ──

type ActivityItem = {
  id: string
  agent: string
  /** Used as the item title — what happened. */
  action: string
  /** Optional preview line under the title (mirrors conv.lastMessage.content). */
  detail?: string
  state: 'done' | 'working' | 'needs-you'
  /** Seconds ago. 0 = now. Used for bucketing & sorting. */
  at: number
}

type GlobalActivityItem = ActivityItem & { room: string }

type TimeBucket = 'hour' | 'today' | 'older'

const BUCKET_LABELS: Record<TimeBucket, string> = {
  hour: 'Last hour',
  today: 'Earlier today',
  older: 'Older',
}

function bucketFor(at: number): TimeBucket {
  if (at < 3600) return 'hour'
  if (at < 86400) return 'today'
  return 'older'
}

// The timeline line is centred at: px-3 (12px) + half of w-6 (12px) = 24px from left.
const TIMELINE_ITEM_LEFT = 'px-3'

function BucketSeparator({ label, count, tone = 'muted' }: { label: string; count: number; tone?: 'muted' | 'live' }) {
  const isLive = tone === 'live'
  return (
    <div className={cn('flex items-start gap-3', TIMELINE_ITEM_LEFT)}>
      <div className="flex w-6 shrink-0 flex-col items-center self-stretch">
        <div className="w-px bg-border/60" style={{ height: 22 }} />
        {isLive ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
        ) : (
          <div className="h-2 w-2 shrink-0 rounded-full bg-border/60" />
        )}
        <div className="w-px bg-border/60" style={{ height: 22 }} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingTop: 19 }}>
        <span className={cn('whitespace-nowrap text-xs font-semibold uppercase tracking-widest', isLive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70')}>
          {label}
        </span>
        <span className={cn(
          'inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold tabular-nums',
          isLive
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground/60'
        )}>{count}</span>
        <div className="h-px flex-1 bg-border/60" />
      </div>
    </div>
  )
}

function TimelineItem({ item, isLast, starshipSlug }: { item: GlobalActivityItem; isLast: boolean; starshipSlug: string }) {
  const roomHref = starshipSlug ? `/ship/${starshipSlug}/rooms/${item.room.toLowerCase()}` : null

  return (
    <div className={cn('flex items-start gap-3', TIMELINE_ITEM_LEFT)}>
      <div className="flex w-6 shrink-0 flex-col items-center self-stretch">
        <div className="w-px bg-border/60" style={{ height: 8 }} />
        <Avatar name={item.agent} className="h-6 w-6 text-[10px]" />
        {!isLast ? <div className="w-px flex-1 bg-border/60" /> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1 py-2">
        <div className="flex items-baseline gap-1 min-w-0 text-sm leading-snug text-foreground">
          {starshipSlug ? (
            <Link href={`/ship/${starshipSlug}/agent/${item.agent.toLowerCase()}`} className="shrink-0 hover:underline">{item.agent}</Link>
          ) : (
            <span className="shrink-0 font-bold">{item.agent}</span>
          )}
          <span className="shrink-0 text-muted-foreground">is</span>
          {roomHref ? (
            <Link href={roomHref} className="truncate hover:underline min-w-0">{item.action}</Link>
          ) : (
            <span className="truncate font-bold min-w-0">{item.action}</span>
          )}
          <span className="shrink-0 text-muted-foreground">at</span>
          {roomHref ? (
            <Link href={roomHref} className="shrink-0 hover:underline">#{item.room}</Link>
          ) : (
            <span className="shrink-0 font-bold">#{item.room}</span>
          )}
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] tabular-nums text-muted-foreground">{formatAgo(item.at)}</span>
        </div>
        {item.detail ? (
          <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
        ) : null}
      </div>
    </div>
  )
}

type ActivityBucket = {
  key: string
  label: string
  tone: 'live' | 'muted'
  items: GlobalActivityItem[]
}

function ActivityPane({ items, className, starshipSlug = '' }: { items: GlobalActivityItem[]; className?: string; starshipSlug?: string }) {
  const { buckets, liveCount } = useMemo(() => {
    const live: GlobalActivityItem[] = []
    const past: GlobalActivityItem[] = []
    for (const it of items) {
      if (it.state === 'working' || it.state === 'needs-you') live.push(it)
      else past.push(it)
    }
    const byRecency = (a: GlobalActivityItem, b: GlobalActivityItem) => a.at - b.at
    live.sort(byRecency)
    past.sort(byRecency)

    const grouped = new Map<TimeBucket, GlobalActivityItem[]>()
    for (const it of past) {
      const bucket = bucketFor(it.at)
      const arr = grouped.get(bucket) ?? []
      arr.push(it)
      grouped.set(bucket, arr)
    }

    const out: ActivityBucket[] = []
    if (live.length > 0) {
      out.push({ key: 'live', label: 'Running now', tone: 'live', items: live })
    }
    const order: TimeBucket[] = ['hour', 'today', 'older']
    for (const b of order) {
      const arr = grouped.get(b)
      if (arr) out.push({ key: b, label: BUCKET_LABELS[b], tone: 'muted', items: arr })
    }

    return { buckets: out, liveCount: live.length }
  }, [items])

  const total = items.length

  return (
    <section className={cn('min-w-0 flex flex-col', className)}>
      <div className="flex-1 min-h-0 overflow-y-auto pt-1 pb-2">
        {total === 0 ? (
          <p className="px-1 pt-2 text-xs text-muted-foreground/40">No activity yet.</p>
        ) : (
          buckets.map((bucket, groupIdx) => (
            <div key={bucket.key}>
              <BucketSeparator label={bucket.label} count={bucket.items.length} tone={bucket.tone} />
              {bucket.items.map((it, i) => {
                const isLast = groupIdx === buckets.length - 1 && i === bucket.items.length - 1
                return <TimelineItem key={it.id} item={it} isLast={isLast} starshipSlug={starshipSlug} />
              })}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ─── YOUR REVIEW banner (top of right column) ─────────────────────────────────

type ReviewState =
  | { kind: 'idle' }
  | {
      kind: 'pending'
      agent: string
      pr: string
      branch: string
      title: string
      checks: string
      tests: string
      diff: string
    }
  | { kind: 'shipping' }

function ReviewBanner({
  state,
  onApprove,
  onRequestChanges,
  className,
}: {
  state: ReviewState
  onApprove: () => void
  onRequestChanges: () => void
  className?: string
}) {
  // Matches the ApprovalsPanel pattern on /dashboard: header row (label + status chip),
  // then content below — no outer card chrome.

  if (state.kind === 'idle') {
    return (
      <section className={cn('flex flex-col', className)}>
        <div className="flex items-center gap-2 px-1 py-2.5">
          <Icon name="alert-circle" weight="bold" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="text-sm font-semibold tracking-tight">Your Queue</span>
          <span className="ml-2 inline-flex h-[18px] items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 text-[10px] font-bold text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            up to date
          </span>
        </div>
        <p className="px-1 pt-1 pb-2 text-xs text-muted-foreground/70">Nothing waiting on you.</p>
      </section>
    )
  }

  if (state.kind === 'shipping') {
    return (
      <section className={cn('flex flex-col', className)}>
        <div className="flex items-center gap-2 px-1 py-2.5">
          <Icon name="alert-circle" weight="bold" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="text-sm font-semibold tracking-tight">Your Queue</span>
          <span className="ml-2 inline-flex h-[18px] items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 text-[10px] font-bold text-emerald-500">
            <Icon name="check" weight="bold" className="h-3 w-3" />
            approved
          </span>
        </div>
        <p className="px-1 pt-1 pb-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Shipping…</p>
      </section>
    )
  }

  return (
    <section className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 px-1 py-2.5">
        <Icon name="alert-circle" weight="bold" className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
        <span className="text-sm font-semibold tracking-tight">Your Queue</span>
        <span className="ml-2 inline-flex h-[18px] items-center gap-1.5 rounded-full bg-primary/15 px-2 text-[10px] font-bold text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          review needed
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">{state.pr}</span>
      </div>

      <div className="space-y-3 px-1 pt-1 pb-2">
        {/* Agent + branch */}
        <div className="flex items-center gap-2.5">
          <Avatar name={state.agent} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0">
            <p className="text-xs leading-tight text-muted-foreground">
              <span className="font-semibold text-foreground">{state.agent}</span> opened a pull request
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">{state.branch}</p>
          </div>
        </div>

        {/* PR title + stats */}
        <div>
          <p className="text-sm font-medium leading-snug">{state.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Icon name="check" weight="bold" className="h-3 w-3" />
              {state.checks}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Icon name="check" weight="bold" className="h-3 w-3" />
              tests {state.tests}
            </span>
            <span className="font-mono text-muted-foreground/60">{state.diff}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onRequestChanges}>
            Request changes
          </Button>
          <Button variant="default" size="sm" className="flex-1" onClick={onApprove}>
            Approve
          </Button>
        </div>
      </div>
    </section>
  )
}

// ─── Demo state ──────────────────────────────────────────────────────────────

function useBeatMachine() {
  const [beat, setBeat] = useState<Beat>(0)
  const advance = useCallback(() => {
    setBeat((b) => (b < MAX_BEAT ? ((b + 1) as Beat) : b))
  }, [])
  const rewind = useCallback(() => {
    setBeat((b) => (b > 0 ? ((b - 1) as Beat) : b))
  }, [])
  const reset = useCallback(() => setBeat(0), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault()
        rewind()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, rewind, reset])

  return { beat, advance, rewind, reset }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionControlPage(): React.JSX.Element {
  if (process.env.NODE_ENV === 'production') notFound()

  const { beat, advance, rewind } = useBeatMachine()

  // Wire up the real ConversationMessageInput (reused from the rooms page).
  // Mission-control is dev-only and sits under /ship/[slug], so we resolve the
  // starship from the slug and target the first available room as the parent.
  const params = useParams<{ slug: string }>()
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''
  const { data: roomsData } = useStarshipRooms(starshipId, Boolean(starshipId))
  const firstRoom = roomsData?.rooms?.[0] ?? null
  const [starterSelectedAgent, setStarterSelectedAgent] = useState<AgentModel | null>(null)

  const { userName } = useAuth()
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 5) return 'Working late'
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])
  const firstName = useMemo(() => {
    const raw = typeof userName === 'string' ? userName.trim() : ''
    if (!raw) return ''
    return raw.split(/\s+/)[0] ?? ''
  }, [userName])

  // YOUR REVIEW state — pending at b=4, shipping flash at b=5, idle elsewhere.
  const reviewState: ReviewState = useMemo(() => {
    if (beat === 4) {
      return {
        kind: 'pending',
        agent: 'Anvil',
        pr: 'PR #432',
        branch: 'fix/mobile-signin',
        title: 'Fix mobile sign-in button',
        checks: '12 checks passed',
        tests: '142 / 142',
        diff: '+38 −4 · 2 files',
      }
    }
    if (beat === 5) return { kind: 'shipping' }
    return { kind: 'idle' }
  }, [beat])

  // ── Unified feed cards ────────────────────────────────────────────────────

  const feedCards: FeedCard[] = useMemo(() => {
    const cards: FeedCard[] = []

    // Support principal: ticket #1042 (Priya) on the Support Tickets board.
    if (beat >= 1) {
      const status = beat >= 6 ? 'RESOLVED' : beat >= 2 ? 'TRIAGED' : 'NEW'
      const statusKind: StatusKind = beat >= 6 ? 'resolved' : beat >= 2 ? 'triaged' : 'new'
      const assignee = beat >= 6 ? 'Reply' : 'Triage'
      const indicators: FeedCardIndicator[] = beat >= 2
        ? [
            { label: 'bug · mobile · auth' },
            { icon: 'alert-circle', label: 'priority high' },
          ]
        : []
      cards.push({
        id: 'ticket-1042',
        type: 'ticket',
        room: 'Support',
        board: 'Support Tickets',
        displayId: '#1042',
        title: 'Login button does nothing on mobile',
        description:
          'Priya R. — "Sign in button does nothing on iPhone Safari, tried Chrome too, no luck. This started after the update yesterday." Repro confirmed on iOS 17.',
        assignee,
        indicators,
        status,
        statusKind,
        primary: true,
        at: beat >= 6 ? 0 : beat >= 2 ? 60 : 30,
      })
    }

    // Engineering principal: fix/mobile-signin on the Engineering Pipeline.
    if (beat >= 2) {
      const status =
        beat >= 6 ? 'MERGED' : beat >= 4 ? 'IN REVIEW' : beat >= 3 ? 'BUILDING' : 'SCOPED'
      const statusKind: StatusKind =
        beat >= 6 ? 'merged' : beat >= 4 ? 'in-review' : beat >= 3 ? 'building' : 'scoped'
      const assignee = beat >= 3 ? 'Anvil' : 'Quill'
      const indicators: FeedCardIndicator[] = []
      if (beat >= 3) indicators.push({ icon: 'git-branch', label: '+38 −4 · 2 files' })
      if (beat > 3) indicators.push({ icon: 'check', label: '142 / 142 tests' })
      if (beat >= 4) indicators.push({ icon: 'check', label: '12 checks' })
      cards.push({
        id: 'eng-mobile-signin',
        type: 'pr',
        room: 'Engineering',
        board: 'Engineering Pipeline',
        displayId: 'fix/mobile-signin',
        title: 'Fix mobile sign-in button',
        description:
          'iOS Safari resize race — the sign-in button captures a stale handler ref before the viewport resize. Guard the handler against stale refs and add a regression test that reproduces the original failure.',
        assignee,
        indicators,
        status,
        statusKind,
        primary: true,
        needsYou: beat === 4,
        at: beat >= 6 ? 0 : beat >= 4 ? 60 : beat >= 3 ? 30 : 120,
      })
    }

    // Ambient cards — real work happening in parallel across the fleet.
    cards.push(
      {
        id: 'ticket-1041',
        type: 'ticket',
        room: 'Support',
        board: 'Support Tickets',
        displayId: '#1041',
        title: "CSV export missing column 'plan'",
        description:
          'Marco V. — "After yesterday\'s update my billing-page CSV exports are missing the \'plan\' column. Need it for internal reconciliation." Flagged for engineering as a data-layer issue.',
        assignee: 'Triage',
        indicators: [{ label: 'bug · data' }, { label: 'priority medium' }],
        status: 'TRIAGED',
        statusKind: 'triaged',
        at: 3600,
      },
      {
        id: 'ticket-1040',
        type: 'ticket',
        room: 'Support',
        board: 'Support Tickets',
        displayId: '#1040',
        title: "Billing receipt PDF won't open",
        description:
          'Sam K. — "Both Chrome and Firefox download the PDF but it opens blank. Worked fine last week." Fix shipped in today\'s deploy; replied with a fresh download link.',
        assignee: 'Reply',
        indicators: [{ icon: 'check', label: 'resolved 1h ago' }],
        status: 'RESOLVED',
        statusKind: 'resolved',
        at: 3600,
      },
      {
        id: 'eng-billing',
        type: 'pr',
        room: 'Engineering',
        board: 'Engineering Pipeline',
        displayId: 'fix/billing-null',
        title: 'Null deref in billing',
        description:
          'Payment-retry path can deref a null charge when the upstream gateway times out mid-request. Adds a null-guard and a tracking event for the timeout case.',
        assignee: 'Anvil',
        indicators: [
          { icon: 'git-branch', label: '+24 −6 · 3 files' },
          { icon: 'check', label: '142 / 142 tests' },
        ],
        status: 'IN REVIEW',
        statusKind: 'in-review',
        at: 1800,
      },
      {
        id: 'eng-zod',
        type: 'pr',
        room: 'Engineering',
        board: 'Engineering Pipeline',
        displayId: 'chore/dep-zod',
        title: 'Bump zod to latest',
        description:
          'Pin zod to 3.23.x for the new discriminated-union helpers. No breaking changes expected — schemas pass type-check on the upgraded version.',
        assignee: 'Sift',
        status: 'SCOPED',
        statusKind: 'scoped',
        at: 5400,
      },
      {
        id: 'ops-invoices',
        type: 'run',
        room: 'Ops',
        board: 'Operations',
        title: 'May invoices · 38 / 42',
        description:
          'Weekly invoice sweep. 38 of 42 May invoices sent so far. 4 invoices on EU customers awaiting tax-id confirmation — emailed for VAT IDs, queued for retry tomorrow.',
        assignee: 'Janus',
        indicators: [{ icon: 'check', label: '38 sent' }, { label: '4 pending VAT' }],
        status: 'RUNNING',
        statusKind: 'running',
        at: 60,
      }
    )

    return cards
  }, [beat])

  // Group cards by attention level for section headers.
  const grouped = useMemo(() => {
    const needsYou: FeedCard[] = []
    const active: FeedCard[] = []
    const done: FeedCard[] = []
    for (const c of feedCards) {
      if (c.needsYou) needsYou.push(c)
      else if (DONE_KINDS.has(c.statusKind)) done.push(c)
      else active.push(c)
    }
    const byRecency = (a: FeedCard, b: FeedCard) => a.at - b.at
    needsYou.sort(byRecency)
    active.sort(byRecency)
    done.sort(byRecency)
    return { needsYou, active, done }
  }, [feedCards])

  // ── Activity items (right pane) ──────────────────────────────────────────

  const supportItems: ActivityItem[] = useMemo(() => {
    const out: ActivityItem[] = []
    if (beat >= 6) out.push({
      id: 's-reply', agent: 'Reply', state: 'done', at: 0,
      action: 'Replying to Priya R. on #1042',
      detail: 'Sent a 47-word reply confirming the iOS Safari fix is live as of today\'s deploy. Used her exact wording for the issue, named the fix specifically, no support theatre. Ticket closed and resolved_at stamped.',
    })
    if (beat >= 2) out.push({
      id: 's-triage-done', agent: 'Triage', state: 'done', at: beat >= 6 ? 240 : 60,
      action: 'Triaging ticket #1042',
      detail: 'Classified as bug · mobile · auth · priority high. The "Sign in button does nothing" pattern matches 2 other open tickets — flagging Engineering with a note to look at iOS Safari resize handling.',
    })
    if (beat === 1) out.push({
      id: 's-triage-working', agent: 'Triage', state: 'working', at: 0,
      action: 'Triaging ticket #1042',
      detail: 'Reading the body now. Looks like a UI event-handler issue on the sign-in button specific to mobile Safari. Repro-ing on the iOS simulator to confirm category and priority.',
    })
    if (beat >= 1) out.push({
      id: 's-arrival', agent: 'Inbox', state: 'done', at: beat >= 6 ? 300 : beat >= 2 ? 120 : 0,
      action: 'New ticket #1042 from Priya R.',
      detail: 'Subject: Can\'t log in on mobile. Body: "Sign in button does nothing on iPhone Safari, tried Chrome too, no luck. This started after the update yesterday."',
    })
    out.push({
      id: 's-old-1', agent: 'Reply', state: 'done', at: 3600,
      action: 'Replying on #1040 (billing PDF)',
      detail: 'Confirmed to Sam K. that the billing-receipt PDF render fix is in today\'s deploy. Provided a fresh download link and closed the ticket. NPS survey scheduled for tomorrow.',
    })
    out.push({
      id: 's-old-2', agent: 'Triage', state: 'done', at: 10800,
      action: 'Flagging #1041 for engineering',
      detail: 'Marco V.\'s CSV export — the column "plan" went missing after yesterday\'s update. Routed to Engineering as a data-layer issue and added a tracking dataset row.',
    })
    return out
  }, [beat])

  const engineeringItems: ActivityItem[] = useMemo(() => {
    const out: ActivityItem[] = []
    if (beat >= 6) out.push({
      id: 'e-deploy', agent: 'CI', state: 'done', at: 0,
      action: 'Deploying PR #432 to production',
      detail: 'Build 4823 done, edge cache flushed, post-deploy smoke tests all green. Monitoring sign-in latency for the next 5 minutes — currently flat at 38ms p95.',
    })
    if (beat >= 6) out.push({
      id: 'e-merge', agent: 'Anvil', state: 'done', at: 30,
      action: 'Merging fix/mobile-signin to main',
      detail: 'Squash-merged onto main. Cleanup branch deleted. Linked ticket #1042 auto-closed. Picking up the next item from the engineering backlog now.',
    })
    if (beat === 4) out.push({
      id: 'e-open', agent: 'Anvil', state: 'needs-you', at: 0,
      action: 'Opening PR #432 for review',
      detail: 'All 12 checks are green and the full test suite passed on a real checkout. The diff is +38 −4 across 2 files — should take 30 seconds to skim, it\'s a tight UI fix. Ready when you are.',
    })
    if (beat > 4) out.push({
      id: 'e-open-done', agent: 'Anvil', state: 'done', at: beat >= 6 ? 120 : 60,
      action: 'Opening PR #432 for review',
      detail: 'All 12 checks are green and the full test suite passed on a real checkout. Diff is +38 −4 across 2 files.',
    })
    if (beat === 3) out.push({
      id: 'e-tests', agent: 'Anvil', state: 'working', at: 0,
      action: 'Running tests on fix/mobile-signin',
      detail: 'Spinning up iOS Safari at 390×844, replaying the resize sequence. 47 of 142 tests passed so far. Estimated 18 more seconds before the regression test runs.',
    })
    if (beat > 3) out.push({
      id: 'e-tests-done', agent: 'Anvil', state: 'done', at: beat >= 6 ? 180 : 30,
      action: 'Running tests on fix/mobile-signin',
      detail: 'All 142 tests passed in 24.3 seconds. The new Safari-resize regression test passes cleanly. Pushing the branch now.',
    })
    if (beat >= 3) out.push({
      id: 'e-fix', agent: 'Anvil', state: 'done', at: beat >= 6 ? 240 : 60,
      action: 'Implementing fix for mobile sign-in',
      detail: 'Three-line change inside SignInButton.tsx — guarding the resize handler against a stale ref. Wrote a regression test that reproduces the original failure before the fix.',
    })
    if (beat >= 2) out.push({
      id: 'e-spec', agent: 'Quill', state: 'done', at: beat >= 6 ? 300 : 120,
      action: 'Scoping ticket #1042',
      detail: 'Reproduced on iPhone 14 Pro Safari at 390×844. The button stops responding after a viewport resize because the handler ref is captured before the resize, not after. Acceptance: button stays responsive across orientation and resize.',
    })
    out.push({
      id: 'e-old-1', agent: 'Sift', state: 'done', at: 7200,
      action: 'Queuing fix/billing-null',
      detail: 'Small, test-verifiable, isolated to packages/server/src/billing. Created card in Backlog and dataset row in tracking. No blockers, picking next from the issues feed.',
    })
    return out
  }, [beat])

  const opsItems: ActivityItem[] = useMemo(
    () => [
      {
        id: 'o-1', agent: 'Janus', state: 'working', at: 60,
        action: 'Running weekly invoice sweep',
        detail: 'Stripe API responsive. 38 of 42 May invoices sent so far. 4 invoices on EU customers awaiting tax-id confirmation — emailed for VAT IDs, will retry tomorrow.',
      },
      {
        id: 'o-2', agent: 'Lin', state: 'done', at: 2400,
        action: 'Reconciling May Stripe payouts',
        detail: 'Reconciled $24,830.42 across 142 charges and 3 refunds totaling $89 against the accounting ledger. No discrepancies. Posted summary to the finance Notion page.',
      },
      {
        id: 'o-3', agent: 'Janus', state: 'done', at: 7200,
        action: 'Quarterly access-key rotation',
        detail: 'Rotated prod and staging IAM keys per the security runbook. New keys deployed to GitHub Actions, Vercel, and Datadog. Old keys revoked, audit log entry created.',
      },
    ],
    []
  )

  const unifiedActivity: GlobalActivityItem[] = useMemo(() => {
    const combined: GlobalActivityItem[] = [
      ...supportItems.map((i) => ({ ...i, room: 'Support' })),
      ...engineeringItems.map((i) => ({ ...i, room: 'Engineering' })),
      ...opsItems.map((i) => ({ ...i, room: 'Ops' })),
    ]
    combined.sort((a, b) => a.at - b.at)
    return combined
  }, [supportItems, engineeringItems, opsItems])

  return (
    <div className="relative h-full w-full bg-background text-foreground">

      <div className="relative h-full flex flex-col">
        <PageHeader icon="dashboard" title="Mission Control" />

        {/* Body: greeting + input + activity (left) + approval + cards (right). */}
        <div className="flex-1 min-h-0 flex gap-4 p-5 overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="mx-auto w-full max-w-3xl pt-2 space-y-3">
              <h2 className="text-2xl font-normal text-foreground">
                {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
              </h2>
              <ConversationMessageInput
                selectedAgent={starterSelectedAgent}
                onAgentChange={setStarterSelectedAgent}
                starshipId={starshipId}
                conversationId={null}
                roomConversationId={firstRoom?.conversationId ?? null}
                roomManagerAgentId={firstRoom?.managerAgentId ?? null}
                starshipSlug={slug}
                newConversationParentConversationId={firstRoom?.conversationId ?? null}
                newConversationTitleOverride="New conversation"
              />
            </div>
            <ActivityPane className="flex-1 min-h-0 mx-auto w-full max-w-3xl" items={unifiedActivity} starshipSlug={slug} />
          </div>

          <div className="w-[480px] shrink-0 flex flex-col gap-4 min-h-0">
            <ReviewBanner state={reviewState} onApprove={advance} onRequestChanges={rewind} />
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {grouped.needsYou.length > 0 ? (
                <>
                  <SectionHeader label="Needs your attention" icon="alert-circle" tone="primary" count={grouped.needsYou.length} />
                  {grouped.needsYou.map((card) => (
                    <UnifiedCard key={card.id} card={card} />
                  ))}
                </>
              ) : null}
              {grouped.active.length > 0 ? (
                <>
                  <SectionHeader label="Active" tone="active" count={grouped.active.length} />
                  {grouped.active.map((card) => (
                    <UnifiedCard key={card.id} card={card} />
                  ))}
                </>
              ) : null}
              {grouped.done.length > 0 ? (
                <>
                  <SectionHeader label="Recently done" tone="done" count={grouped.done.length} />
                  {grouped.done.map((card) => (
                    <UnifiedCard key={card.id} card={card} />
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
