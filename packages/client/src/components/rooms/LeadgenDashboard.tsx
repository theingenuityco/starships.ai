'use client'

import React, { useMemo } from 'react'
import type { IcpProfile, RoomPinnedDataset, RoomPinnedTaskBoard, StarshipDatasetColumn } from '@starships/protocol'
import { useStarshipDatasets, useDatasetRows } from '@/hooks/useDatasets'
import { MetricGrid } from '@/components/widgets/MetricGrid'
import type { Metric } from '@/components/widgets/MetricGrid'
import { DataTable } from '@/components/widgets/DataTable'
import type { DataColumn, DataColumnDataType } from '@/components/widgets/DataTable'
import { AgentActivityColumn } from '@/components/dashboard/AgentActivityColumn'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import Icon from '@/components/primitives/Icon'
import Link from 'next/link'

interface LeadgenDashboardProps {
  starshipId: string
  starshipSlug: string
  roomSlug: string
  roomName: string | null | undefined
  pinnedDatasets: RoomPinnedDataset[]
  pinnedTaskBoards: RoomPinnedTaskBoard[]
}

// Column priority ordering for the lead feed tables
const PRIORITY_COLUMNS_ACCOUNTS = ['company_name', 'name', 'status', 'industry', 'website', 'location', 'employee_count']
const PRIORITY_COLUMNS_CONTACTS = ['first_name', 'last_name', 'name', 'email', 'lead_status', 'title', 'company', 'linkedin_url']

// Sort order for account/contact status fields (best leads first)
const STATUS_SORT_ORDER: Record<string, number> = { qualified: 0, researched: 1, new: 2, disqualified: 3 }
const CONTACT_SORT_ORDER: Record<string, number> = {
  qualified: 0, responded: 1, connected: 2, attempted: 3, new: 4, unqualified: 5, do_not_contact: 6,
}

function datasetColumnsToTableColumns(cols: StarshipDatasetColumn[], priority: string[]): DataColumn[] {
  const sorted = [...cols].sort((a, b) => {
    const ai = priority.indexOf(a.name)
    const bi = priority.indexOf(b.name)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return sorted.map((c) => ({
    key: c.name,
    label: c.name.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
    dataType: c.type as DataColumnDataType | undefined,
    format: c.format,
    enumOptions: c.enum?.options,
  }))
}

// --- GoalBanner ---

interface GoalBannerProps {
  icp: IcpProfile
  qualifiedAccountCount: number
}

function GoalBanner({ icp, qualifiedAccountCount }: GoalBannerProps) {
  const headlineParts = [
    icp.traits.companySize,
    icp.traits.industry ? `in ${icp.traits.industry}` : null,
    icp.traits.geography,
  ].filter(Boolean)
  const headline = headlineParts.length > 0 ? headlineParts.join(' · ') : icp.name

  const pills = [icp.traits.industry, icp.traits.companySize, icp.traits.geography, ...icp.traits.roles].filter(Boolean)

  const pct =
    icp.estimatedAccountCount > 0
      ? Math.min(100, Math.round((qualifiedAccountCount / icp.estimatedAccountCount) * 100))
      : 0

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Goal</p>
          <p className="text-sm font-semibold">Finding {headline}</p>
        </div>
        {icp.estimatedAccountCount > 0 && (
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            {qualifiedAccountCount} of {icp.estimatedAccountCount} qualified
          </p>
        )}
      </div>
      {icp.estimatedAccountCount > 0 && <Progress value={pct} className="h-1.5" />}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <span key={p} className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-0.5">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// --- LeadFeed ---

interface LeadFeedProps {
  accountRows: Array<Record<string, unknown>>
  accountColumns: StarshipDatasetColumn[]
  contactRows: Array<Record<string, unknown>>
  contactColumns: StarshipDatasetColumn[]
  accountsLoading: boolean
  contactsLoading: boolean
}

function LeadFeed({ accountRows, accountColumns, contactRows, contactColumns, accountsLoading, contactsLoading }: LeadFeedProps) {
  const mappedAccountCols = useMemo(
    () => datasetColumnsToTableColumns(accountColumns, PRIORITY_COLUMNS_ACCOUNTS),
    [accountColumns],
  )
  const mappedContactCols = useMemo(
    () => datasetColumnsToTableColumns(contactColumns, PRIORITY_COLUMNS_CONTACTS),
    [contactColumns],
  )

  const sortedAccountRows = useMemo(
    () =>
      [...accountRows].sort(
        (a, b) =>
          (STATUS_SORT_ORDER[String(a['status'] ?? 'new')] ?? 99) -
          (STATUS_SORT_ORDER[String(b['status'] ?? 'new')] ?? 99),
      ),
    [accountRows],
  )
  const sortedContactRows = useMemo(
    () =>
      [...contactRows].sort(
        (a, b) =>
          (CONTACT_SORT_ORDER[String(a['lead_status'] ?? 'new')] ?? 99) -
          (CONTACT_SORT_ORDER[String(b['lead_status'] ?? 'new')] ?? 99),
      ),
    [contactRows],
  )

  return (
    <Tabs defaultValue="accounts" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Leads Ready to Act On</h2>
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="accounts">
        <DataTable
          columns={mappedAccountCols}
          data={sortedAccountRows}
          loading={accountsLoading}
          showSearch
          showRowCount
          showExportCsv
          editable={false}
          pageSize={20}
          outerBorder
          showTitle={false}
        />
      </TabsContent>
      <TabsContent value="contacts">
        <DataTable
          columns={mappedContactCols}
          data={sortedContactRows}
          loading={contactsLoading}
          showSearch
          showRowCount
          showExportCsv
          editable={false}
          pageSize={20}
          outerBorder
          showTitle={false}
        />
      </TabsContent>
    </Tabs>
  )
}

// --- LeadgenDashboard ---

export function LeadgenDashboard({ starshipId, starshipSlug, roomSlug, roomName, pinnedDatasets }: LeadgenDashboardProps) {
  const { data: allDatasets = [] } = useStarshipDatasets(starshipId)

  const { accountsDatasetId, contactsDatasetId, icpDatasetId } = useMemo(() => {
    const pinnedIds = new Set(pinnedDatasets.map((p) => p.datasetId))
    const pinned = allDatasets.filter((d) => pinnedIds.has(d.id))
    return {
      accountsDatasetId: pinned.find((d) => d.slug.includes('accounts'))?.id ?? null,
      contactsDatasetId: pinned.find((d) => d.slug.includes('contacts'))?.id ?? null,
      icpDatasetId: allDatasets.find((d) => d.slug.includes('icp'))?.id ?? null,
    }
  }, [allDatasets, pinnedDatasets])

  const { data: accountsPage, isLoading: accountsLoading } = useDatasetRows(
    starshipId,
    accountsDatasetId ?? '',
    200,
    0,
    undefined,
    Boolean(accountsDatasetId),
  )

  const { data: contactsPage, isLoading: contactsLoading } = useDatasetRows(
    starshipId,
    contactsDatasetId ?? '',
    200,
    0,
    undefined,
    Boolean(contactsDatasetId),
  )

  const { data: icpPage } = useDatasetRows(starshipId, icpDatasetId ?? '', 1, 0, undefined, Boolean(icpDatasetId))

  const accountRows = accountsPage?.data ?? []
  const contactRows = contactsPage?.data ?? []

  const qualifiedAccounts = accountRows.filter((r) => r['status'] === 'qualified').length
  const qualifiedContacts = contactRows.filter((r) => r['lead_status'] === 'qualified').length

  const activeIcp = useMemo((): IcpProfile | null => {
    const row = icpPage?.data?.[0]
    if (!row) return null
    const traits = row['traits'] as IcpProfile['traits'] | undefined
    return {
      id: String(row['id'] ?? ''),
      name: String(row['name'] ?? ''),
      description: String(row['description'] ?? ''),
      traits: {
        industry: String(traits?.industry ?? ''),
        roles: Array.isArray(traits?.roles) ? traits.roles.map(String) : [],
        companySize: String(traits?.companySize ?? ''),
        geography: String(traits?.geography ?? ''),
      },
      estimatedAccountCount: Number(row['estimatedAccountCount'] ?? 0),
    }
  }, [icpPage])

  const icpLoading = Boolean(icpDatasetId) && !icpPage

  const summaryMetrics = useMemo((): Metric[] => {
    const totalAccounts = accountsPage?.pagination.total ?? accountRows.length
    const totalContacts = contactsPage?.pagination.total ?? contactRows.length
    return [
      { label: 'Total Accounts', value: totalAccounts, icon: 'building' },
      { label: 'Qualified Accounts', value: qualifiedAccounts, icon: 'check-circle', trend: 'up', trendValue: 'qualified' },
      { label: 'Total Contacts', value: totalContacts, icon: 'users' },
      { label: 'Qualified Contacts', value: qualifiedContacts, icon: 'user-check', trend: 'up', trendValue: 'qualified' },
    ]
  }, [accountRows, contactRows, accountsPage, contactsPage, qualifiedAccounts, qualifiedContacts])

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
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Goal banner */}
          {icpLoading ? (
            <Skeleton className="h-[112px] w-full rounded-xl" />
          ) : activeIcp ? (
            <GoalBanner icp={activeIcp} qualifiedAccountCount={qualifiedAccounts} />
          ) : null}

          {/* KPI metrics */}
          <MetricGrid metrics={summaryMetrics} columns={4} />

          {/* Two-column main area */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <LeadFeed
              accountRows={accountRows}
              accountColumns={accountsPage?.columns ?? []}
              contactRows={contactRows}
              contactColumns={contactsPage?.columns ?? []}
              accountsLoading={accountsLoading}
              contactsLoading={contactsLoading}
            />
            <div className="rounded-xl border border-border/40 overflow-hidden max-h-[600px]">
              <AgentActivityColumn starshipId={starshipId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
