'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import type { RoomPinnedTable, RoomPinnedTaskBoard } from '@starships/protocol'
import { useStarshipTables, useTableRows } from '@/hooks/useTables'
import { useDemo } from '@/components/demo/DemoContext'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'

interface SupportRoomDashboardProps {
  starshipId: string
  starshipSlug: string
  roomSlug: string
  roomName: string | null | undefined
  pinnedTables: RoomPinnedTable[]
  pinnedTaskBoards: RoomPinnedTaskBoard[]
}

type Status = 'NEW' | 'TRIAGED' | 'RESOLVED'

const COLUMNS: { key: Status; title: string; cls: string }[] = [
  { key: 'NEW',      title: 'New',      cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  { key: 'TRIAGED',  title: 'Triaged',  cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  { key: 'RESOLVED', title: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
]

const PRIORITY_CLS: Record<string, string> = {
  high:   'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
  low:    'bg-muted text-muted-foreground border-border',
}

function getStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim()
  }
  return ''
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const m = Math.round(diffSec / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function CustomerAvatar({ name }: { name: string }) {
  const initials = getInitials(name)
  const color = avatarColour(name)
  return (
    <div className={cn('rounded-full w-7 h-7 text-[10px] flex items-center justify-center font-semibold text-white shrink-0', color)}>
      {initials}
    </div>
  )
}

function TicketCard({ row }: { row: Record<string, unknown> }) {
  const customer = getStr(row, 'customer_name', 'name', 'customer')
  const subject = getStr(row, 'subject', 'title')
  const message = getStr(row, 'message', 'body')
  const priority = getStr(row, 'priority').toLowerCase()
  const category = getStr(row, 'category')
  const tags = getStr(row, 'tags')
  const createdAt = getStr(row, 'created_at', 'createdAt')

  return (
    <div className="rounded-md border border-border/60 bg-card/90 px-3 py-2.5 text-sm shadow-sm">
      <div className="flex items-start gap-2.5">
        <CustomerAvatar name={customer || '?'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium leading-tight truncate">{customer || 'Customer'}</p>
            {createdAt ? (
              <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                {relativeTime(createdAt)}
              </span>
            ) : null}
          </div>
          {subject ? <p className="mt-0.5 text-[13px] font-medium leading-snug truncate">{subject}</p> : null}
          {message ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{message}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {priority ? (
              <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', PRIORITY_CLS[priority] ?? PRIORITY_CLS.low)}>
                {priority}
              </span>
            ) : null}
            {category ? (
              <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {category}
              </span>
            ) : null}
            {tags
              ? tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).map((t) => (
                  <span key={t} className="inline-flex items-center rounded-md border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                    {t}
                  </span>
                ))
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function TicketColumn({ title, status, cls, rows }: { title: string; status: Status; cls: string; rows: Record<string, unknown>[] }) {
  return (
    <div className="flex flex-col min-h-0 w-full max-w-[340px]">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', cls)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', status === 'NEW' ? 'bg-amber-500 animate-pulse' : status === 'TRIAGED' ? 'bg-blue-500' : 'bg-emerald-500')} />
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground/60">
            Nothing here
          </div>
        ) : (
          rows.map((row, i) => (
            <TicketCard key={String(row['ticket_id'] ?? row['id'] ?? i)} row={row} />
          ))
        )}
      </div>
    </div>
  )
}

// Demo beat-state: ticket #1042 (Priya R.) moves NEW → TRIAGED → RESOLVED in
// lockstep with the Mission Control beats, alongside a few static tickets for
// texture. Used only while the hero-video demo is running. Thresholds mirror the
// hub card in mission-control/page.tsx: NEW @6, TRIAGED @11, RESOLVED @37.
function demoTickets(beat: number): Record<string, unknown>[] {
  const principalStatus = beat >= 37 ? 'RESOLVED' : beat >= 11 ? 'TRIAGED' : 'NEW'
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  return [
    {
      ticket_id: '1042',
      customer_name: 'Priya R.',
      subject: 'Login button does nothing on mobile',
      message: 'Sign in button does nothing on iPhone Safari, tried Chrome too, no luck. This started after the update yesterday.',
      priority: 'high',
      category: 'auth',
      tags: 'mobile, bug',
      status: principalStatus,
      created_at: minsAgo(4),
    },
    {
      ticket_id: '1043',
      customer_name: 'Marcus T.',
      subject: 'Billing page shows the wrong currency',
      message: 'My invoices show USD but my account is set to EUR.',
      priority: 'medium',
      category: 'billing',
      tags: 'billing',
      status: 'NEW',
      created_at: minsAgo(11),
    },
    {
      ticket_id: '1039',
      customer_name: 'Dana K.',
      subject: 'Export to CSV times out on large workspaces',
      message: 'Exporting more than ~50k rows just spins and then fails.',
      priority: 'medium',
      category: 'exports',
      tags: 'performance',
      status: 'TRIAGED',
      created_at: minsAgo(38),
    },
    {
      ticket_id: '1031',
      customer_name: 'Owen B.',
      subject: 'Password reset email not arriving',
      message: 'Requested a reset three times, nothing in inbox or spam.',
      priority: 'low',
      category: 'auth',
      tags: 'email',
      status: 'RESOLVED',
      created_at: minsAgo(140),
    },
  ]
}

export function SupportRoomDashboard({ starshipId, starshipSlug, roomSlug, roomName, pinnedTables }: SupportRoomDashboardProps) {
  const { active: demoActive, beat } = useDemo()
  const { data: allTables = [] } = useStarshipTables(starshipId)

  const ticketsTable = useMemo(() => {
    const pinnedIds = new Set(pinnedTables.map((p) => p.tableId))
    const pinned = allTables.filter((d) => pinnedIds.has(d.id))
    return pinned.find((d) => d.slug === 'tickets' || d.slug.includes('ticket')) ?? null
  }, [allTables, pinnedTables])

  const { data: ticketsPage, isLoading } = useTableRows(
    starshipId,
    ticketsTable?.id ?? '',
    500,
    0,
    undefined,
    Boolean(ticketsTable?.id) && !demoActive
  )

  const grouped = useMemo<Record<Status, Record<string, unknown>[]>>(() => {
    const empty: Record<Status, Record<string, unknown>[]> = { NEW: [], TRIAGED: [], RESOLVED: [] }
    const sourceRows = demoActive ? demoTickets(beat) : (ticketsPage?.data ?? [])
    for (const row of sourceRows) {
      const raw = getStr(row, 'status').toUpperCase()
      const status: Status = raw === 'TRIAGED' ? 'TRIAGED' : raw === 'RESOLVED' ? 'RESOLVED' : 'NEW'
      empty[status].push(row)
    }
    const byCreated = (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const at = Date.parse(getStr(a, 'created_at')) || 0
      const bt = Date.parse(getStr(b, 'created_at')) || 0
      return bt - at
    }
    empty.NEW.sort(byCreated)
    empty.TRIAGED.sort(byCreated)
    empty.RESOLVED.sort(byCreated)
    return empty
  }, [ticketsPage?.data, demoActive, beat])

  const total = grouped.NEW.length + grouped.TRIAGED.length + grouped.RESOLVED.length

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
        <span className="text-sm font-medium">Dashboard</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <Icon name="list" className="h-3.5 w-3.5" />
          {total} tickets
        </span>
      </div>

      {/* KPI strip */}
      <div className="flex-none grid grid-cols-3 gap-3 px-4 py-3 border-b border-border/60">
        {COLUMNS.map((col) => (
          <div key={col.key} className="rounded-md border border-border/60 bg-card/70 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{col.title}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{grouped[col.key].length}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden">
        <div className="h-full flex md:flex-row flex-col gap-4 px-4 py-4 md:overflow-x-auto">
          {isLoading && total === 0 ? (
            <div className="w-full text-center py-12 text-sm text-muted-foreground">Loading tickets…</div>
          ) : !demoActive && !ticketsTable ? (
            <div className="w-full text-center py-12 text-sm text-muted-foreground">
              No tickets table pinned to this room.
            </div>
          ) : (
            COLUMNS.map((col) => (
              <TicketColumn key={col.key} title={col.title} status={col.key} cls={col.cls} rows={grouped[col.key]} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
