'use client'

import React, { useMemo, useState } from 'react'
import type { RoomPinnedTable, RoomPinnedTaskBoard } from '@starships/protocol'
import { useStarshipTables, useTableRows } from '@/hooks/useTables'
import type { TableRowFilter } from '@/hooks/useTables'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import { adaptDataTable, downloadTableAsCsv, sanitizeFilename } from '@/lib/export'
import Icon from '@/components/primitives/Icon'
import Link from 'next/link'

interface LeadgenDashboardProps {
  starshipId: string
  starshipSlug: string
  roomSlug: string
  roomName: string | null | undefined
  pinnedTables: RoomPinnedTable[]
  pinnedTaskBoards: RoomPinnedTaskBoard[]
}

// --- Status badge configs ---

const ACCOUNT_STATUS: Record<string, { label: string; cls: string }> = {
  qualified:    { label: 'Qualified',    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  researched:   { label: 'Researched',   cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  new:          { label: 'New',          cls: 'bg-muted text-muted-foreground border-border' },
  disqualified: { label: 'Disqualified', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
}

const CONTACT_STATUS: Record<string, { label: string; cls: string }> = {
  qualified:      { label: 'Qualified',      cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  responded:      { label: 'Responded',      cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  connected:      { label: 'Connected',      cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  attempted:      { label: 'Attempted',      cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  new:            { label: 'New',            cls: 'bg-muted text-muted-foreground border-border' },
  unqualified:    { label: 'Unqualified',    cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  do_not_contact: { label: 'Do Not Contact', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20' },
}

// --- Sorting ---

const ACCOUNT_SORT: Record<string, number> = { qualified: 0, researched: 1, new: 2, disqualified: 3 }
const CONTACT_SORT: Record<string, number> = {
  qualified: 0, responded: 1, connected: 2, attempted: 3, new: 4, unqualified: 5, do_not_contact: 6,
}

// --- Helpers ---

function getStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim()
  }
  return ''
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function getAccountKey(row: Record<string, unknown>, primaryKey: string | null | undefined): string | null {
  if (primaryKey && row[primaryKey] != null) return String(row[primaryKey])
  for (const k of ['account_id', 'id', 'account_name', 'name', 'company_name']) {
    if (row[k] != null) return String(row[k])
  }
  return null
}

function isContactLinkedToAccount(contact: Record<string, unknown>, accountKey: string): boolean {
  const ref = contact['account']
  if (!ref || typeof ref !== 'object') return false
  const r = ref as Record<string, unknown>
  if (r['key'] !== undefined) return String(r['key']) === accountKey
  return String(ref) === accountKey
}

// --- StatusBadge ---

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; cls: string }> }) {
  const cfg = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border' }
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// --- EntityAvatar ---

function EntityAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = getInitials(name) || '?'
  const color = avatarColour(name)
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0', dim, color)}>
      {initials}
    </div>
  )
}

// --- ContactsSubTable ---

function ContactsSubTable({
  contacts,
  loading,
}: {
  contacts: Array<Record<string, unknown>>
  loading: boolean
}) {
  if (loading) {
    return <p className="text-xs text-muted-foreground py-1">Loading contacts…</p>
  }

  if (contacts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Icon name="user" className="h-3.5 w-3.5" />
        No contacts found for this account
      </p>
    )
  }

  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border/60">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">LinkedIn</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact, i) => {
            const fullName = getStr(contact, 'first_name') + (getStr(contact, 'last_name') ? ' ' + getStr(contact, 'last_name') : '') || getStr(contact, 'name', 'full_name', 'contact_name')
            const title = getStr(contact, 'title', 'job_title', 'role')
            const leadStatus = getStr(contact, 'lead_status', 'status')
            const email = getStr(contact, 'email', 'email_address')
            const linkedin = getStr(contact, 'linkedin_url', 'linkedin')
            return (
              <tr key={i} className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors')}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <EntityAvatar name={fullName || '?'} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{fullName || '—'}</p>
                      {title && <p className="text-xs text-muted-foreground truncate">{title}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {leadStatus ? <StatusBadge status={leadStatus} map={CONTACT_STATUS} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon name="mail" className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[180px]">{email}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {linkedin ? (
                    <a
                      href={linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon name="external-link" className="h-3.5 w-3.5" />
                      <span>View</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// --- AccountsTable ---

const PAGE_SIZE = 25

interface IcpProfile {
  /** Value used as the Select option key. Equals String(icpId) when available, otherwise the array index. */
  id: string
  /** The numeric icp_id from data_json — present only for rows created via the upsert API (autoincrement). Null for directly-seeded rows. */
  icpId: number | null
  name: string
  targetIndustries: string
}

interface AccountsTableProps {
  rows: Array<Record<string, unknown>>
  allContactRows: Array<Record<string, unknown>>
  loading: boolean
  contactsLoading: boolean
  primaryKey: string | null | undefined
  tableName?: string
  icpProfiles: IcpProfile[]
  icpFilter: string
  onIcpFilterChange: (value: string) => void
}

function AccountsTable({ rows, allContactRows, loading, contactsLoading, primaryKey, tableName, icpProfiles, icpFilter, onIcpFilterChange }: AccountsTableProps) {
  const [query, setQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const name = getStr(row, 'company_name', 'name', 'account_name')
      const industry = getStr(row, 'industry')
      const location = getStr(row, 'location', 'city', 'country')
      return name.toLowerCase().includes(q) || industry.toLowerCase().includes(q) || location.toLowerCase().includes(q)
    })
  }, [rows, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(totalPages, Math.max(1, page))
  const pageStart = (safePage - 1) * PAGE_SIZE
  const visibleRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const toggleExpand = (i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleQueryChange = (q: string) => {
    setQuery(q)
    setPage(1)
    setExpandedRows(new Set())
  }

  const handleExport = () => {
    const cols = [
      { key: 'company', label: 'Company', format: 'text' as const },
      { key: 'status', label: 'Status', format: 'text' as const },
      { key: 'industry', label: 'Industry', format: 'text' as const },
      { key: 'location', label: 'Location', format: 'text' as const },
      { key: 'employees', label: 'Employees', format: 'text' as const },
      { key: 'website', label: 'Website', format: 'text' as const },
    ]
    const data = rows.map((r) => ({
      company: getStr(r, 'company_name', 'name', 'account_name'),
      status: getStr(r, 'status'),
      industry: getStr(r, 'industry'),
      location: getStr(r, 'location', 'city', 'country'),
      employees: getStr(r, 'employee_count', 'employee_range', 'employees', 'company_size'),
      website: getStr(r, 'website', 'website_url'),
    }))
    downloadTableAsCsv(adaptDataTable(cols, data), `${sanitizeFilename(tableName ?? 'accounts')}-${Date.now()}.csv`)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search accounts…"
              className="h-9 pl-9"
            />
          </div>
          {icpProfiles.length > 0 && (
            <Select value={icpFilter} onValueChange={(v) => { onIcpFilterChange(v); setPage(1); setExpandedRows(new Set()) }}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Filter by ICP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ICPs</SelectItem>
                {icpProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filtered.length.toLocaleString()} accounts</span>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Icon name="download" className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Employees</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Website</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-5 bg-muted/40 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {query.trim() ? 'No accounts match your search' : 'No accounts yet'}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, i) => {
                  const isExpanded = expandedRows.has(pageStart + i)
                  const companyName = getStr(row, 'company_name', 'name', 'account_name')
                  const status = getStr(row, 'status')
                  const industry = getStr(row, 'industry')
                  const location = getStr(row, 'location', 'city', 'country')
                  const employees = getStr(row, 'employee_count', 'employee_range', 'employees', 'company_size')
                  const website = getStr(row, 'website', 'website_url')
                  const accountKey = getAccountKey(row, primaryKey)
                  const linkedContacts = accountKey
                    ? allContactRows
                        .filter((c) => isContactLinkedToAccount(c, accountKey))
                        .sort((a, b) => (CONTACT_SORT[getStr(a, 'lead_status')] ?? 99) - (CONTACT_SORT[getStr(b, 'lead_status')] ?? 99))
                    : []

                  return (
                    <React.Fragment key={pageStart + i}>
                      <tr
                        className={cn(
                          'border-b transition-colors hover:bg-muted/30 cursor-pointer',
                          isExpanded && 'bg-muted/20',
                          !isExpanded && 'last:border-0',
                        )}
                        onClick={() => toggleExpand(pageStart + i)}
                      >
                        {/* Expand chevron */}
                        <td className="w-8 px-3 py-3.5">
                          <Icon
                            name="chevron-right"
                            className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-90')}
                          />
                        </td>

                        {/* Company */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <EntityAvatar name={companyName || '?'} />
                            <div className="min-w-0">
                              <p className="font-medium leading-tight truncate">{companyName || '—'}</p>
                              {website && (
                                <a
                                  href={website.startsWith('http') ? website : `https://${website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate block max-w-[200px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {website.replace(/^https?:\/\//, '')}
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {status ? <StatusBadge status={status} map={ACCOUNT_STATUS} /> : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Industry */}
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{industry || '—'}</td>

                        {/* Location */}
                        <td className="px-4 py-3.5">
                          {location ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0" />
                              {location}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Employees */}
                        <td className="px-4 py-3.5">
                          {employees ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Icon name="users" className="h-3.5 w-3.5 shrink-0" />
                              {employees}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Website (icon only) */}
                        <td className="px-4 py-3.5">
                          {website ? (
                            <a
                              href={website.startsWith('http') ? website : `https://${website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Icon name="external-link" className="h-3.5 w-3.5" />
                              Visit
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded contacts */}
                      {isExpanded && (
                        <tr className="border-b last:border-0 bg-muted/10">
                          <td colSpan={7} className="px-6 py-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              Contacts · {linkedContacts.length}
                            </p>
                            <ContactsSubTable contacts={linkedContacts} loading={contactsLoading} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border text-sm text-muted-foreground bg-muted/20">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
              <Icon name="chevron-left" className="h-4 w-4" />
            </Button>
            <span>Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
              <Icon name="chevron-right" className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- LeadgenDashboard ---

export function LeadgenDashboard({ starshipId, starshipSlug, roomSlug, roomName, pinnedTables }: LeadgenDashboardProps) {
  const [icpFilter, setIcpFilter] = useState<string>('all')
  const { data: allTables = [] } = useStarshipTables(starshipId)

  const { accountsTable, contactsTableId, icpProfilesTableId } = useMemo(() => {
    const pinnedIds = new Set(pinnedTables.map((p) => p.tableId))
    const pinned = allTables.filter((d) => pinnedIds.has(d.id))
    return {
      accountsTable: pinned.find((d) => d.slug.includes('accounts')) ?? null,
      contactsTableId: pinned.find((d) => d.slug.includes('contacts'))?.id ?? null,
      icpProfilesTableId: pinned.find((d) => d.slug === 'icp-profiles')?.id ?? null,
    }
  }, [allTables, pinnedTables])

  const { data: icpProfilesPage } = useTableRows(
    starshipId,
    icpProfilesTableId ?? '',
    100,
    0,
    undefined,
    Boolean(icpProfilesTableId),
  )

  const icpProfiles = useMemo<IcpProfile[]>(() => {
    return (icpProfilesPage?.data ?? []).map((row, i) => {
      const rawId = row['icp_id']
      const icpId = typeof rawId === 'number' && Number.isFinite(rawId) ? rawId : null
      return {
        id: icpId !== null ? String(icpId) : String(i),
        icpId,
        name: getStr(row, 'icp_name') || `ICP ${i + 1}`,
        targetIndustries: getStr(row, 'target_industries'),
      }
    })
  }, [icpProfilesPage?.data])

  const accountFilters = useMemo<TableRowFilter[]>(() => {
    if (icpFilter === 'all') return []
    const icp = icpProfiles.find((p) => p.id === icpFilter)
    if (!icp) return []

    if (icp.icpId !== null) {
      // Rows created via the upsert API have icp_id in data_json and a valid row_key.
      // Accounts reference ICPs via the icp_profile column as a JSON object
      // { "kind": "table_row", "tableIdOrSlug": "icp-profiles", "key": <icp_id> }.
      // PostgreSQL jsonb serialises keys alphabetically with a space after the colon, so the
      // text representation is:
      //   {"tableIdOrSlug": "icp-profiles", "key": <id>, "kind": "table_row"}
      // Using contains on `"key": <id>,` uniquely identifies this ICP without false positives.
      return [{ column: 'icp_profile', op: 'contains', value: `"key": ${icp.icpId},` }]
    }

    // Seeded rows (direct appendMany, no autoincrement) have neither icp_id nor row_key.
    // Accounts seeded alongside them don't have icp_profile set either, so fall back to
    // matching on the industry string — the most reliable criteria field (both values come
    // from the same onboarding input). Avoid employee_range (enum vs free-text mismatch)
    // and country (value-format differences).
    if (icp.targetIndustries) {
      return [{ column: 'industry', op: 'contains', value: icp.targetIndustries }]
    }

    return []
  }, [icpFilter, icpProfiles])

  const { data: accountsPage, isLoading: accountsLoading } = useTableRows(
    starshipId,
    accountsTable?.id ?? '',
    200,
    0,
    undefined,
    Boolean(accountsTable?.id),
    accountFilters,
  )

  const { data: contactsPage, isLoading: contactsLoading } = useTableRows(
    starshipId,
    contactsTableId ?? '',
    500,
    0,
    undefined,
    Boolean(contactsTableId),
  )

  const accountRows = useMemo(
    () =>
      [...(accountsPage?.data ?? [])].sort(
        (a, b) => (ACCOUNT_SORT[getStr(a, 'status')] ?? 99) - (ACCOUNT_SORT[getStr(b, 'status')] ?? 99),
      ),
    [accountsPage?.data],
  )

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
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <AccountsTable
            rows={accountRows}
            allContactRows={contactsPage?.data ?? []}
            loading={accountsLoading}
            contactsLoading={contactsLoading}
            primaryKey={accountsTable?.primaryKey}
            tableName={accountsTable?.name}
            icpProfiles={icpProfiles}
            icpFilter={icpFilter}
            onIcpFilterChange={setIcpFilter}
          />
        </div>
      </div>
    </div>
  )
}
