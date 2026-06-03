'use client'

import React from 'react'
import type { RoomPinnedDataset, RoomPinnedTaskBoard } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'
import Link from 'next/link'

interface EngineeringDashboardProps {
  starshipId: string
  starshipSlug: string
  roomSlug: string
  roomName: string | null | undefined
  pinnedDatasets: RoomPinnedDataset[]
  pinnedTaskBoards: RoomPinnedTaskBoard[]
}

// NOTE: illustrative data for now. It is shaped to map onto the room's real
// task board, tool-call approvals, and usage ledger when those are wired
// (see engineering-dashboard-spec.md). Copy matches the /use-cases/for-developers
// page: the billing null-deref ticket, branch fix/billing-null, PR #441, the
// crew Forge / Sift / Quill / Anvil / Lens.

type Tone = 'neutral' | 'success' | 'info' | 'warn' | 'danger'

// Literal class strings only — Tailwind v4 generates utilities it can see verbatim
// in source, so do not build these by string manipulation at runtime.
const TONE: Record<Tone, { bar: string; badge: string }> = {
  neutral: { bar: 'border-l-muted-foreground/40', badge: 'bg-muted text-muted-foreground border-border' },
  success: { bar: 'border-l-emerald-500', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  info: { bar: 'border-l-sky-500', badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  warn: { bar: 'border-l-amber-500', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  danger: { bar: 'border-l-rose-500', badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20' },
}

type Card = { id: string; title: string; agent: string; meta: string; tone: Tone; mono?: boolean }
type Column = { key: string; title: string; cards: Card[] }

const COLUMNS: Column[] = [
  {
    key: 'backlog',
    title: 'Backlog',
    cards: [
      { id: 'c1', title: 'Null deref in billing', agent: 'Sift', meta: '#318 · small · testable', tone: 'neutral' },
      { id: 'c2', title: 'Flaky payments test', agent: 'Sift', meta: '#290 · small · testable', tone: 'neutral' },
      { id: 'c3', title: 'Stale dep: zod 3 to 4', agent: 'Sift', meta: '#305 · chore', tone: 'neutral' },
    ],
  },
  {
    key: 'scoped',
    title: 'Scoped',
    cards: [
      { id: 'c4', title: 'Retry on gateway timeout', agent: 'Quill', meta: 'spec ready', tone: 'info' },
      { id: 'c5', title: 'Add refund edge cases', agent: 'Quill', meta: 'spec ready', tone: 'info' },
    ],
  },
  {
    key: 'building',
    title: 'Building',
    cards: [{ id: 'c6', title: 'fix/billing-null', agent: 'Anvil', meta: 'running suite · 142/142', tone: 'warn', mono: true }],
  },
  {
    key: 'review',
    title: 'In review',
    cards: [
      { id: 'c7', title: '#441 null deref fix', agent: 'Lens', meta: 'checks green · +38 −4', tone: 'success' },
      { id: 'c8', title: '#438 payments retry', agent: 'Lens', meta: 'needs a test', tone: 'warn' },
    ],
  },
  {
    key: 'merged',
    title: 'Merged',
    cards: [{ id: 'c9', title: '#439 cache on logout', agent: 'Anvil', meta: 'merged · 2h ago', tone: 'success' }],
  },
  {
    key: 'blocked',
    title: 'Blocked',
    cards: [{ id: 'c10', title: 'OAuth token refresh', agent: 'Forge', meta: 'needs a secret', tone: 'danger' }],
  },
]

type Stat = { label: string; value: string; icon: string; tone: Tone }
const STATS: Stat[] = [
  { label: 'In flight', value: '7', icon: 'activity', tone: 'info' },
  { label: 'Awaiting you', value: '2', icon: 'eye', tone: 'warn' },
  { label: 'Merged this week', value: '12', icon: 'check-circle', tone: 'success' },
  { label: 'Burn today', value: '$3.40', icon: 'coins', tone: 'neutral' },
]

type Approval = { id: string; agent: string; text: string; primary: string; secondary: string; tone: Tone }
const APPROVALS: Approval[] = [
  { id: 'a1', agent: 'Anvil', text: 'wants to open a PR for fix/billing-null. 142 tests passed.', primary: 'Approve', secondary: 'View diff', tone: 'success' },
  { id: 'a2', agent: 'Lens', text: 'flagged a missing test on #438 before it can merge.', primary: 'Review', secondary: 'Dismiss', tone: 'warn' },
]

type Shipped = { id: string; pr: string; title: string; add: number; del: number; agent: string; when: string }
const SHIPPED: Shipped[] = [
  { id: 's1', pr: '#439', title: 'Cache invalidation on logout', add: 24, del: 6, agent: 'Anvil', when: '2h ago' },
  { id: 's2', pr: '#437', title: 'Bump zod to 4.0', add: 112, del: 98, agent: 'Anvil', when: '5h ago' },
  { id: 's3', pr: '#431', title: 'Null guard in webhook handler', add: 9, del: 2, agent: 'Anvil', when: '1d ago' },
]

type Crew = { name: string; role: string; status: string; working?: boolean }
const CREW: Crew[] = [
  { name: 'Forge', role: 'Conductor', status: 'routing work' },
  { name: 'Sift', role: 'Triage', status: 'idle' },
  { name: 'Quill', role: 'Spec', status: 'writing spec' },
  { name: 'Anvil', role: 'Builder', status: 'running tests', working: true },
  { name: 'Lens', role: 'Review', status: 'reviewing #441' },
]

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium', TONE[tone].badge)}>
      {children}
    </span>
  )
}

function AgentChip({ name }: { name: string }) {
  const initials = name.slice(0, 1).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white', avatarColour(name))}>
        {initials}
      </span>
      <span className="text-xs font-medium text-foreground">{name}</span>
    </span>
  )
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', TONE[stat.tone].badge)}>
        <Icon name={stat.icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums">{stat.value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{stat.label}</p>
      </div>
    </div>
  )
}

function PipelineCardView({ card }: { card: Card }) {
  return (
    <div className={cn('rounded-md border border-l-2 border-border bg-card p-2.5 shadow-sm', TONE[card.tone].bar)}>
      <p className={cn('text-sm leading-snug text-foreground', card.mono && 'font-mono text-[13px]')}>{card.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <AgentChip name={card.agent} />
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{card.meta}</p>
    </div>
  )
}

function PipelineBoard() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="list" size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Pipeline</span>
        </div>
        <Badge tone="info">7 in flight</Badge>
      </div>
      <div className="flex gap-3 overflow-x-auto p-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex w-[180px] shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{col.title}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{col.cards.length}</span>
            </div>
            {col.cards.map((card) => (
              <PipelineCardView key={card.id} card={card} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function NeedsYou() {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="eye" size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Needs you</span>
        </div>
        <Badge tone="warn">2 waiting</Badge>
      </div>
      <div>
        {APPROVALS.map((a) => (
          <div key={a.id} className="flex flex-col gap-2.5 border-b border-border px-4 py-3 last:border-0">
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{a.agent}</span> {a.text}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', TONE[a.tone].badge)}
              >
                {a.primary}
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                {a.secondary}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Shipped() {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="check-circle" size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Shipped</span>
        </div>
        <span className="text-xs text-muted-foreground">12 this week · all green</span>
      </div>
      <div>
        {SHIPPED.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Icon name="check" size={12} className="text-emerald-600 dark:text-emerald-400" />
            </span>
            <span className="font-mono text-xs text-muted-foreground">{s.pr}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.title}</span>
            <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">+{s.add}</span>
            <span className="font-mono text-xs text-rose-500">−{s.del}</span>
            <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">{s.when}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrewStrip() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Crew</span>
      <div className="flex flex-1 flex-wrap gap-2">
        {CREW.map((m) => (
          <span
            key={m.name}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1',
              m.working ? 'border-border bg-muted' : 'border-border',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', m.working ? 'animate-pulse bg-amber-500' : 'bg-muted-foreground/40')} />
            <span className="text-xs font-medium text-foreground">{m.name}</span>
            <span className="text-[11px] text-muted-foreground">{m.status}</span>
          </span>
        ))}
      </div>
      <span className="font-mono text-xs text-muted-foreground">1.2M tokens · $3.40</span>
    </div>
  )
}

export function EngineeringDashboard({ starshipSlug, roomSlug, roomName }: EngineeringDashboardProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-none items-center gap-3 border-b border-border/60 px-4 py-3">
        <Link
          href={`/ship/${starshipSlug}/rooms/${roomSlug}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="arrow-left" size={16} />
          <span>{roomName ?? roomSlug}</span>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">Dashboard</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
          <Icon name="clock" size={13} />
          Runs on a schedule
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {STATS.map((s) => (
              <StatCard key={s.label} stat={s} />
            ))}
          </div>

          <PipelineBoard />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <NeedsYou />
            <Shipped />
          </div>

          <CrewStrip />
        </div>
      </div>
    </div>
  )
}
