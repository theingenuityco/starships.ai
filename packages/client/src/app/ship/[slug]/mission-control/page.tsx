'use client'

/**
 * Mission-control composite page — staged single-frame demo surface used for the
 * hero-video shoot. Mock-fed and gated off in production. It auto-plays on
 * load: one granular step every 2s, holds on the final state, then loops back.
 * Keyboard control (any key pauses auto-play):
 *   Space / ArrowRight  — advance to the next beat
 *   Backspace / ArrowLeft — go back one beat
 *   P                   — toggle auto-play
 *   R                   — restart from the top (re-enables auto-play)
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

import React, { useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipRooms } from '@/hooks/useRooms'
import { useDemo } from '@/components/demo/DemoContext'
import { supportActivity, engineeringActivity, growthActivity } from '@/components/demo/demoActivity'
import type { AgentModel } from '@starships/protocol'

// ─── Shared animation variants ───────────────────────────────────────────────

// Every animated row/card uses `layout="position"` (animate position only, let
// height snap) + opacity-only enter/exit, all inside a single AnimatePresence
// per pane with stable keys. So an item that changes stage stays mounted and
// slides to its new slot rather than exiting one list and entering another.

// One-shot tint that replays whenever `signal` changes (and on mount). The
// keyed span remounts on each new signal, so it draws the eye to the row/card
// that just changed state, then fades out. Sits behind content (crisp text).
function ChangeFlash({ signal, className }: { signal: React.Key; className?: string }) {
  return (
    <motion.span
      key={signal}
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeOut' }}
    />
  )
}

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

type RoomKey = 'Support' | 'Engineering' | 'Growth'

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

function UnifiedCard({ card, onApprove }: { card: FeedCard; onApprove?: () => void }) {
  const isLive = LIVE_KINDS.has(card.statusKind)
  const isDone = DONE_KINDS.has(card.statusKind)
  const needsYou = Boolean(card.needsYou)

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'group relative overflow-hidden',
        CARD_SURFACE,
        isDone && 'opacity-60',
        needsYou && 'border-amber-500/60 ring-1 ring-amber-500/25 shadow-md'
      )}
    >
      <ChangeFlash signal={needsYou ? 'needs-you' : card.statusKind} className="inset-0 rounded-lg bg-amber-600/20" />
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 py-2.5 pl-3 pr-2.5">
        {/* Checkbox */}
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
          <span
            className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-300',
              isDone
                ? 'border-emerald-500 bg-emerald-500'
                : isLive
                  ? 'border-amber-500'
                  : 'border-border/60'
            )}
          >
            {isDone ? (
              <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5 text-white" aria-hidden>
                <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : isLive ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            ) : null}
          </span>
        </span>

        {/* Body: title, board + assignee, indicators */}
        <div className="min-w-0 space-y-1.5">
          {/* Title */}
          <p className={cn('truncate text-sm font-normal leading-snug', isDone && 'line-through text-muted-foreground')}>{card.title}</p>

          {/* Assignee · Board */}
          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground/60">
            {card.assignee ? (
              <>
                <Avatar name={card.assignee} className="h-4 w-4 text-[8px]" />
                <span className="font-medium text-foreground/80">{card.assignee}</span>
                <span>·</span>
              </>
            ) : null}
            <span className="text-muted-foreground/80">{card.board}</span>
          </div>

        </div>

        {/* Status badge + age, or the Approve gate when this card needs you */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium transition-colors duration-500',
              needsYou ? 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300' : STATUS_CLS[card.statusKind]
            )}
          >
            {isLive ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse transition-colors duration-500" /> : null}
            {card.status}
          </span>
          {needsYou ? (
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Icon name="check" weight="bold" className="h-3 w-3" />
              Approve
            </button>
          ) : (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40">
              {formatAgo(card.at)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Section header for the feed (Needs your attention / Active / Done) ─────

function SectionHeader({ label, icon, tone, count }: { label: string; icon?: string; tone: 'primary' | 'active' | 'done'; count: number }) {
  const toneCls =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'active'
        ? 'text-foreground/70'
        : 'text-muted-foreground/70'
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
      {icon ? <Icon name={icon} weight="bold" className={cn('h-3.5 w-3.5', toneCls)} /> : null}
      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', toneCls)}>{label}</span>
      <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 font-mono text-[9px] tabular-nums text-muted-foreground/60">{count}</span>
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

function BucketSeparator({ label, count, tone = 'muted' }: { label: string; count: number; tone?: 'muted' | 'live' | 'attention' }) {
  const isLive = tone === 'live'
  const isAttention = tone === 'attention'
  const isAccent = isLive || isAttention
  const textCls = isLive
    ? 'text-emerald-600 dark:text-emerald-400'
    : isAttention
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground/70'
  const dotCls = isLive
    ? 'bg-emerald-500'
    : isAttention
      ? 'bg-amber-500'
      : 'bg-border/60'
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('flex items-start gap-3', TIMELINE_ITEM_LEFT)}
    >
      <div className="flex w-6 shrink-0 flex-col items-center self-stretch">
        <div className="w-px bg-border/60" style={{ height: 22 }} />
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotCls, isAccent && 'animate-pulse')} />
        <div className="w-px bg-border/60" style={{ height: 22 }} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingTop: 19 }}>
        <span className={cn('whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em]', textCls)}>
          {label}
        </span>
        {count > 0 ? (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 font-mono text-[9px] tabular-nums text-muted-foreground/60">{count}</span>
        ) : null}
        <div className="h-px flex-1 bg-border/30" />
      </div>
    </motion.div>
  )
}

function TimelineItem({ item, isLast, starshipSlug }: { item: GlobalActivityItem; isLast: boolean; starshipSlug: string }) {
  const roomHref = starshipSlug ? `/ship/${starshipSlug}/rooms/${item.room.toLowerCase()}` : null

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('relative flex items-start gap-3', TIMELINE_ITEM_LEFT)}
    >
      <ChangeFlash signal={item.state} className="inset-x-1 inset-y-1 rounded-md bg-amber-600/15" />
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
          <span className="shrink-0 text-muted-foreground">in</span>
          {roomHref ? (
            <Link href={roomHref} className="shrink-0 hover:underline">#{item.room}</Link>
          ) : (
            <span className="shrink-0 font-bold">#{item.room}</span>
          )}
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] tabular-nums text-muted-foreground">{formatAgo(item.at)}</span>
        </div>
        {item.detail ? (
          <p className="truncate text-xs text-muted-foreground/50">{item.detail}</p>
        ) : null}
      </div>
    </motion.div>
  )
}

type ActivityBucket = {
  key: string
  label: string
  tone: 'live' | 'muted'
  items: GlobalActivityItem[]
}

function ActivityPane({
  items,
  className,
  starshipSlug = '',
  attention,
}: {
  items: GlobalActivityItem[]
  className?: string
  starshipSlug?: string
  attention?: React.ReactNode
}) {
  const { buckets } = useMemo(() => {
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
    out.push({ key: 'live', label: 'Running now', tone: live.length > 0 ? 'live' : 'muted', items: live })
    const order: TimeBucket[] = ['hour', 'today', 'older']
    for (const b of order) {
      const arr = grouped.get(b)
      if (arr) out.push({ key: b, label: BUCKET_LABELS[b], tone: 'muted', items: arr })
    }

    return { buckets: out, liveCount: live.length }
  }, [items])

  const total = items.length

  // Flatten separators + items into one presence tree so an item that changes
  // bucket (e.g. working → done) stays mounted and slides via `layout`, rather
  // than exiting one bucket's AnimatePresence and re-entering another's.
  const lastBucketIdx = buckets.length - 1
  const rows: React.ReactNode[] = []
  buckets.forEach((bucket, groupIdx) => {
    rows.push(<BucketSeparator key={`sep-${bucket.key}`} label={bucket.label} count={bucket.items.length} tone={bucket.tone} />)
    if (bucket.key === 'live' && bucket.items.length === 0) {
      rows.push(
        <motion.div
          key="live-empty"
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={cn('flex items-start gap-3', TIMELINE_ITEM_LEFT)}
        >
          <div className="flex w-6 shrink-0 flex-col items-center self-stretch">
            <div className="w-px bg-border/60" style={{ height: 8 }} />
            <div className="w-px flex-1 bg-border/60" />
          </div>
          <p className="py-2 text-xs text-muted-foreground/40">All quiet. No agents running right now.</p>
        </motion.div>
      )
    } else {
      bucket.items.forEach((it, i) => {
        const isLast = groupIdx === lastBucketIdx && i === bucket.items.length - 1
        rows.push(<TimelineItem key={it.id} item={it} isLast={isLast} starshipSlug={starshipSlug} />)
      })
    }
  })

  return (
    <section className={cn('min-w-0', className)}>
      <div className="relative pt-1 pb-2">
        <AnimatePresence>
          {attention ? (
            <motion.div key="attention" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
              {attention}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {total === 0 ? (
          <p className="px-3 pt-2 text-xs text-muted-foreground/40">No activity yet.</p>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {rows}
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionControlPage(): React.JSX.Element {
  if (process.env.NODE_ENV === 'production') notFound()

  // The beat clock lives in DemoProvider (mounted in client-layout) so the same
  // timeline drives this page, the nav sidebar, and the room boards together.
  // `advance` lets the Approve gate move the story forward on click (the "you
  // say yes" beat), in addition to auto-play.
  const { beat, advance } = useDemo()

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

  // ── Unified feed cards ────────────────────────────────────────────────────

  const feedCards: FeedCard[] = useMemo(() => {
    const cards: FeedCard[] = []

    // Support principal: ticket #1042 (Priya) on the Support Tickets board.
    // Opens on beat 2 (beat 1 belongs to the Growth TAM card alone): the ticket
    // first lands in Ongoing as it's being received (beat 2), settles to NEW in
    // Active (beat 3), then is triaged (beat 4). Becomes a gate at the pivot
    // (beat 9): the drafted reply is waiting on you.
    if (beat >= 2) {
      const status =
        beat >= 11 ? 'RESOLVED' : beat >= 10 ? 'REPLYING' : beat >= 9 ? 'REPLY READY' : beat >= 4 ? 'TRIAGED' : beat >= 3 ? 'NEW' : 'RECEIVING'
      const statusKind: StatusKind =
        beat >= 11 ? 'resolved' : beat >= 10 ? 'running' : beat >= 4 ? 'triaged' : beat >= 3 ? 'new' : 'running'
      const assignee = 'Sara: Customer Support'
      const indicators: FeedCardIndicator[] = beat >= 4
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
        needsYou: beat === 9,
        at: (beat - (beat >= 11 ? 11 : beat >= 10 ? 10 : beat >= 9 ? 9 : beat >= 4 ? 4 : beat >= 3 ? 3 : 2)) * 30,
      })
    }

    // Engineering principal: fix/mobile-signin on the Engineering Pipeline.
    // Reaches review, then waits at the pivot (beat 9) for your merge approval.
    if (beat >= 4) {
      const status =
        beat >= 11 ? 'MERGED' : beat >= 10 ? 'MERGING' : beat >= 9 ? 'READY TO MERGE' : beat >= 8 ? 'IN REVIEW' : beat >= 5 ? 'BUILDING' : 'SCOPED'
      const statusKind: StatusKind =
        beat >= 11 ? 'merged' : beat >= 10 ? 'running' : beat >= 8 ? 'in-review' : beat >= 5 ? 'building' : 'scoped'
      const assignee =
        beat >= 9 ? 'Ravi: Release Engineer' : beat >= 5 ? 'Mason: Product Engineer' : 'Avery: Product Manager'
      const indicators: FeedCardIndicator[] = []
      if (beat >= 5) indicators.push({ icon: 'git-branch', label: '+38 −4 · 2 files' })
      if (beat >= 7) indicators.push({ icon: 'check', label: '142 / 142 tests' })
      if (beat >= 8) indicators.push({ icon: 'check', label: '12 checks' })
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
        needsYou: beat === 9,
        at: (beat - (beat >= 11 ? 11 : beat >= 10 ? 10 : beat >= 9 ? 9 : beat >= 8 ? 8 : beat >= 5 ? 5 : 4)) * 30,
      })
    }

    // Growth principal: the Q2 outbound pipeline running in parallel the whole
    // time — TAM → contacts → verify → QA → a clean list ready for outreach.
    if (beat >= 1) {
      const status =
        beat >= 8 ? 'LIST READY' : beat >= 7 ? 'QA' : beat >= 5 ? 'VERIFYING' : beat >= 3 ? 'FINDING CONTACTS' : 'BUILDING TAM'
      const statusKind: StatusKind = beat >= 8 ? 'resolved' : 'running'
      const assignee = beat >= 7 ? 'Otis: Lead Enrichment' : 'Nisha: Lead Generation'
      const indicators: FeedCardIndicator[] = []
      if (beat >= 2) indicators.push({ label: '1,240 accounts' })
      if (beat >= 4) indicators.push({ label: '3,800 contacts' })
      if (beat >= 6) indicators.push({ icon: 'check', label: '3,640 verified' })
      cards.push({
        id: 'growth-q2-outbound',
        type: 'run',
        room: 'Growth',
        board: 'Growth Pipeline',
        title: 'Build the Q2 outbound pipeline',
        description:
          'Expand the ideal customer profile into a target account list, find decision-makers at each, verify their emails, and hand over a clean list of buyers ready for outreach.',
        assignee,
        indicators,
        status,
        statusKind,
        at: (beat - (beat >= 8 ? 8 : beat >= 7 ? 7 : beat >= 5 ? 5 : beat >= 3 ? 3 : 1)) * 30,
      })
    }

    return cards
  }, [beat])

  // Group cards: anything waiting on you is pulled into its own bucket (rendered
  // first), then ongoing (live), active (queued/scoped), and done.
  const grouped = useMemo(() => {
    const needsAttention: FeedCard[] = []
    const ongoing: FeedCard[] = []
    const active: FeedCard[] = []
    const done: FeedCard[] = []
    for (const c of feedCards) {
      if (c.needsYou) needsAttention.push(c)
      else if (DONE_KINDS.has(c.statusKind)) done.push(c)
      else if (LIVE_KINDS.has(c.statusKind)) ongoing.push(c)
      else active.push(c)
    }
    const byRecency = (a: FeedCard, b: FeedCard) => a.at - b.at
    needsAttention.sort(byRecency)
    ongoing.sort(byRecency)
    active.sort(byRecency)
    done.sort(byRecency)
    return { needsAttention, ongoing, active, done }
  }, [feedCards])

  // ── Activity items (right pane) ──────────────────────────────────────────

  // The three rooms' activity is built from the shared demoActivity module so the
  // Mission Control feed and the nav sidebar's nested conversations never drift.
  const supportItems: ActivityItem[] = useMemo(() => supportActivity(beat), [beat])
  const engineeringItems: ActivityItem[] = useMemo(() => engineeringActivity(beat), [beat])
  const growthItems: ActivityItem[] = useMemo(() => growthActivity(beat), [beat])

  const unifiedActivity: GlobalActivityItem[] = useMemo(() => {
    const combined: GlobalActivityItem[] = [
      ...supportItems.map((i) => ({ ...i, room: 'Support' })),
      ...engineeringItems.map((i) => ({ ...i, room: 'Engineering' })),
      ...growthItems.map((i) => ({ ...i, room: 'Growth' })),
    ]
    combined.sort((a, b) => a.at - b.at)
    return combined
  }, [supportItems, engineeringItems, growthItems])

  // Flatten the three task sections into one presence tree so a card that
  // changes stage (e.g. Active → Done) stays mounted and slides to its new
  // section via `layout`, instead of exiting one section and re-entering another.
  const taskRows: React.ReactNode[] = []
  const pushTaskSection = (
    key: string,
    label: string,
    tone: 'primary' | 'active' | 'done',
    cards: FeedCard[],
    emptyText: string | null,
    opts?: { icon?: string; onApprove?: () => void }
  ) => {
    // emptyText === null means "hide the whole section when there's nothing in it"
    // (used for the Needs-your-attention rail, which only exists at the pivot).
    if (cards.length === 0 && emptyText === null) return
    taskRows.push(
      <motion.div key={`hdr-${key}`} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        <SectionHeader label={label} tone={tone} count={cards.length} icon={opts?.icon} />
      </motion.div>
    )
    if (cards.length === 0) {
      taskRows.push(
        <motion.p key={`empty-${key}`} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="px-1 py-1 text-xs text-muted-foreground/40">
          {emptyText}
        </motion.p>
      )
    } else {
      cards.forEach((card) => taskRows.push(<UnifiedCard key={card.id} card={card} onApprove={opts?.onApprove} />))
    }
  }
  pushTaskSection('attention', 'Needs your attention', 'primary', grouped.needsAttention, null, { icon: 'bell', onApprove: advance })
  pushTaskSection('ongoing', 'Ongoing', 'active', grouped.ongoing, 'No ongoing tasks.')
  pushTaskSection('active', 'Active', 'active', grouped.active, 'No active tasks.')
  pushTaskSection('done', 'Recently done', 'done', grouped.done, 'Nothing done yet.')

  return (
    <div className="relative w-full bg-background text-foreground">

      <div className="relative flex flex-col">
        <PageHeader icon="dashboard" title="Mission Control" />

        {/* Body: greeting + input + activity (left) + approval + cards (right). */}
        <div className="flex gap-4 p-5">
          <div className="flex-1 min-w-0 flex flex-col">
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
            <div className="mx-auto mt-4 w-full max-w-3xl rounded-xl border border-border/50 bg-background">
              <div className="border-b border-border/50 px-4 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Activity</span>
              </div>
              <ActivityPane
                items={unifiedActivity}
                starshipSlug={slug}
              />
            </div>
          </div>

          <div className="w-[480px] shrink-0 flex flex-col gap-4">
            <div className="rounded-xl border border-border/50 bg-background space-y-0">
              <div className="border-b border-border/50 px-4 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Tasks</span>
              </div>
              <div className="relative flex flex-col gap-2 p-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {taskRows}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
