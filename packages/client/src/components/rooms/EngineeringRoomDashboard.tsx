'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import type { RoomPinnedDataset, RoomPinnedTaskBoard } from '@starships/protocol'
import { useStarshipDatasets, useDatasetRows } from '@/hooks/useDatasets'
import { useDemo } from '@/components/demo/DemoContext'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'

interface EngineeringRoomDashboardProps {
  starshipId: string
  starshipSlug: string
  roomSlug: string
  roomName: string | null | undefined
  pinnedDatasets: RoomPinnedDataset[]
  pinnedTaskBoards: RoomPinnedTaskBoard[]
}

// The engineering pipeline lanes, left → right. A change of plan only ever
// moves a card to the right (or, on rework, back one lane).
type ColKey = 'BACKLOG' | 'SCOPED' | 'BUILDING' | 'IN_REVIEW' | 'MERGED'

const COLUMNS: { key: ColKey; title: string; dot: string; cls: string }[] = [
  { key: 'BACKLOG',   title: 'Backlog',   dot: 'bg-slate-400',  cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20' },
  { key: 'SCOPED',    title: 'Scoped',    dot: 'bg-violet-500', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  { key: 'BUILDING',  title: 'Building',  dot: 'bg-blue-500',   cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  { key: 'IN_REVIEW', title: 'In Review', dot: 'bg-amber-500',  cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  { key: 'MERGED',    title: 'Merged',    dot: 'bg-emerald-500', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
]

const PRIORITY_CLS: Record<string, string> = {
  high:   'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
  low:    'bg-muted text-muted-foreground border-border',
}

type PipelineCard = {
  id: string
  column: ColKey
  title: string
  branch?: string
  assignee?: string
  priority?: 'high' | 'medium' | 'low'
  /** e.g. "+38 −4". */
  diff?: string
  files?: number
  /** e.g. "12 checks". */
  checks?: string
  /** e.g. "142 / 142". */
  tests?: string
  /** Linked support ticket, e.g. "#1042". */
  linkedTicket?: string
  /** Waiting on a human merge approval (the pivot). */
  needsYou?: boolean
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function AgentAvatar({ name }: { name: string }) {
  return (
    <div className={cn('rounded-full w-5 h-5 text-[9px] flex items-center justify-center font-semibold text-white shrink-0', avatarColour(name))}>
      {getInitials(name)}
    </div>
  )
}

// ── Demo pipeline ────────────────────────────────────────────────────────────
// Mirrors the Mission Control beats: the fix/mobile-signin card moves Backlog →
// Scoped → Building → In Review → (waits on you at beat 9) → Merged, while a few
// static items give the board texture.
function demoCards(beat: number): PipelineCard[] {
  const principalColumn: ColKey =
    beat >= 11 ? 'MERGED' : beat >= 8 ? 'IN_REVIEW' : beat >= 5 ? 'BUILDING' : beat >= 4 ? 'SCOPED' : 'BACKLOG'
  const principalAssignee = beat >= 10 ? 'Anvil' : beat >= 8 ? 'Lens' : beat >= 5 ? 'Anvil' : beat >= 4 ? 'Quill' : undefined

  const principal: PipelineCard = {
    id: 'eng-mobile-signin',
    column: principalColumn,
    title: 'Fix mobile sign-in button',
    branch: 'fix/mobile-signin',
    assignee: principalAssignee,
    priority: 'high',
    linkedTicket: '#1042',
    diff: beat >= 5 ? '+38 −4' : undefined,
    files: beat >= 5 ? 2 : undefined,
    tests: beat >= 7 ? '142 / 142' : undefined,
    checks: beat >= 8 ? '12 checks' : undefined,
    needsYou: beat === 9,
  }

  const texture: PipelineCard[] = [
    { id: 'eng-rate-limit', column: 'BACKLOG', title: 'Add rate-limit headers to public API', priority: 'medium' },
    { id: 'eng-node22',     column: 'SCOPED',  title: 'Upgrade build image to Node 22', assignee: 'Quill', priority: 'low', branch: 'chore/node-22' },
    { id: 'eng-avatars',    column: 'MERGED',  title: 'Cache avatar thumbnails at the edge', assignee: 'Anvil', branch: 'perf/avatar-cache', diff: '+64 −12', files: 4 },
  ]

  return [principal, ...texture]
}

function PipelineCardView({ card }: { card: PipelineCard }) {
  const isMerged = card.column === 'MERGED'
  return (
    <motion.div
      layoutId={card.id}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'rounded-md border bg-card/90 px-3 py-2.5 text-sm shadow-sm',
        card.needsYou ? 'border-amber-500/60 ring-1 ring-amber-500/25' : 'border-border/60',
        isMerged && 'opacity-70'
      )}
    >
      {card.branch ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Icon name="git-branch" className="h-3 w-3 shrink-0" />
          <span className="font-mono truncate">{card.branch}</span>
        </div>
      ) : null}
      <p className={cn('mt-1 text-[13px] font-medium leading-snug', isMerged && 'line-through text-muted-foreground')}>{card.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.priority ? (
          <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', PRIORITY_CLS[card.priority])}>
            {card.priority}
          </span>
        ) : null}
        {card.linkedTicket ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Icon name="link" className="h-2.5 w-2.5" />
            {card.linkedTicket}
          </span>
        ) : null}
        {card.diff ? (
          <span className="inline-flex items-center rounded-md border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
            {card.diff}{typeof card.files === 'number' ? ` · ${card.files} files` : ''}
          </span>
        ) : null}
      </div>

      {card.tests || card.checks || card.assignee || card.needsYou ? (
        <div className="mt-2 flex items-center gap-2">
          {card.assignee ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <AgentAvatar name={card.assignee} />
              <span className="font-medium text-foreground/80">{card.assignee}</span>
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-2">
            {card.tests ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Icon name="check" className="h-3 w-3" />
                {card.tests}
              </span>
            ) : null}
            {card.checks ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Icon name="check" className="h-3 w-3" />
                {card.checks}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {card.needsYou ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
          <Icon name="bell" weight="bold" className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Ready to merge — waiting on you</span>
        </div>
      ) : null}
    </motion.div>
  )
}

function PipelineColumn({ col, cards }: { col: (typeof COLUMNS)[number]; cards: PipelineCard[] }) {
  return (
    <div className="flex flex-col min-h-0 w-full md:w-[280px] md:shrink-0">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', col.cls)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', col.dot, (col.key === 'BUILDING' || col.key === 'IN_REVIEW') && 'animate-pulse')} />
          {col.title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {cards.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground/60">
            Nothing here
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {cards.map((card) => (
              <PipelineCardView key={card.id} card={card} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

export function EngineeringRoomDashboard({ starshipId, starshipSlug, roomSlug, roomName, pinnedDatasets }: EngineeringRoomDashboardProps) {
  const { active: demoActive, beat } = useDemo()

  // Real-data path (used outside the demo): pull rows from a pinned pipeline /
  // pull-requests dataset and bucket them by status. Mirrors SupportRoomDashboard.
  const { data: allDatasets = [] } = useStarshipDatasets(starshipId)
  const pipelineDataset = useMemo(() => {
    const pinnedIds = new Set(pinnedDatasets.map((p) => p.datasetId))
    const pinned = allDatasets.filter((d) => pinnedIds.has(d.id))
    return (
      pinned.find((d) => d.slug === 'pull-requests' || d.slug.includes('pipeline') || d.slug.includes('pull') || d.slug.includes('pr')) ?? null
    )
  }, [allDatasets, pinnedDatasets])

  const { data: rowsPage, isLoading } = useDatasetRows(
    starshipId,
    pipelineDataset?.id ?? '',
    500,
    0,
    undefined,
    Boolean(pipelineDataset?.id) && !demoActive
  )

  const grouped = useMemo<Record<ColKey, PipelineCard[]>>(() => {
    const empty: Record<ColKey, PipelineCard[]> = { BACKLOG: [], SCOPED: [], BUILDING: [], IN_REVIEW: [], MERGED: [] }

    const cards: PipelineCard[] = demoActive
      ? demoCards(beat)
      : (rowsPage?.data ?? []).map((row, i) => {
          const get = (...keys: string[]): string => {
            for (const k of keys) {
              const v = row[k]
              if (v !== null && v !== undefined && String(v).trim()) return String(v).trim()
            }
            return ''
          }
          const raw = get('status', 'column', 'stage').toUpperCase().replace(/[\s-]+/g, '_')
          const column: ColKey =
            raw === 'MERGED' || raw === 'DONE' ? 'MERGED'
            : raw === 'IN_REVIEW' || raw === 'REVIEW' ? 'IN_REVIEW'
            : raw === 'BUILDING' || raw === 'IN_PROGRESS' ? 'BUILDING'
            : raw === 'SCOPED' || raw === 'TRIAGED' ? 'SCOPED'
            : 'BACKLOG'
          return {
            id: String(get('id', 'pr_id', 'branch') || i),
            column,
            title: get('title', 'subject', 'name') || 'Untitled',
            branch: get('branch', 'head'),
            assignee: get('assignee', 'agent', 'owner'),
            priority: (get('priority').toLowerCase() as PipelineCard['priority']) || undefined,
            linkedTicket: get('ticket', 'linked_ticket', 'ticket_id'),
          }
        })

    for (const c of cards) empty[c.column].push(c)
    return empty
  }, [demoActive, beat, rowsPage?.data])

  const total = COLUMNS.reduce((sum, c) => sum + grouped[c.key].length, 0)
  const showEmptyState = !demoActive && !pipelineDataset

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <Link
          href={`/ship/${starshipSlug}/rooms/${roomSlug}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="arrow-left" className="h-4 w-4" />
          <span>{roomName ?? roomSlug}</span>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">Pipeline</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <Icon name="git-branch" className="h-3.5 w-3.5" />
          {total} in flight
        </span>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden">
        <div className="h-full flex md:flex-row flex-col gap-4 px-4 py-4 md:overflow-x-auto">
          {isLoading && total === 0 ? (
            <div className="w-full text-center py-12 text-sm text-muted-foreground">Loading pipeline…</div>
          ) : showEmptyState ? (
            <div className="w-full text-center py-12 text-sm text-muted-foreground">
              No pipeline dataset pinned to this room.
            </div>
          ) : (
            COLUMNS.map((col) => <PipelineColumn key={col.key} col={col} cards={grouped[col.key]} />)
          )}
        </div>
      </div>
    </div>
  )
}
