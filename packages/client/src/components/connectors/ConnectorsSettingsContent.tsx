'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { AgentDeploymentModal } from '@/components/connectors/AgentDeploymentModal'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useAgent } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { MobileBottomFilterBar } from '@/components/layout/MobileBottomFilterBar'

interface ConnectorsSettingsContentProps {
  slug: string
}

type ConnectorView = 'all' | 'connected' | 'unconnected'
const SEARCH_DEBOUNCE_MS = 400

export function ConnectorsSettingsContent({ slug }: ConnectorsSettingsContentProps) {
  const { user, isInstanceAdmin, isLoading: authLoading } = useAuth()
  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [connectorStats, setConnectorStats] = useState<{ total: number; connected: number } | null>(null)
  const handleStatsChange = useCallback((stats: { total: number; connected: number }) => {
    setConnectorStats(prev => (prev && prev.total === stats.total && prev.connected === stats.connected ? prev : stats))
  }, [])

  const viewFromUrl = useMemo<ConnectorView>(() => {
    const raw = (searchParams?.get('view') || '').trim()
    if (raw === 'connected' || raw === 'unconnected' || raw === 'all') return raw
    return 'all'
  }, [searchParams])

  const qFromUrl = useMemo(() => (searchParams?.get('q') || '').trim(), [searchParams])
  const [searchValue, setSearchValue] = useState(qFromUrl)
  const [debouncedQuery, setDebouncedQuery] = useState(qFromUrl)

  useEffect(() => {
    setSearchValue(qFromUrl)
    setDebouncedQuery(qFromUrl)
  }, [qFromUrl])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchValue])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const q = debouncedQuery.trim()
    if (q) params.set('q', q)
    else params.delete('q')
    const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
    router.replace(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])
  
  // Get agent info from URL params
  const agentId = searchParams?.get('agentId') || ''
  const agentSlug = searchParams?.get('agentSlug') || ''
  const agentName = searchParams?.get('agentName') || ''
  const agentRole = searchParams?.get('agentRole') || ''
  const [showDeploymentModal, setShowDeploymentModal] = useState(false)
  
  // Fetch agent details if agentId is provided (for avatar)
  const { data: agent } = useAgent(agentId, !!agentId)
  
  // Show modal when agent params are present
  useEffect(() => {
    if (agentId && agentSlug && agentName && agentRole) {
      setShowDeploymentModal(true)
    }
  }, [agentId, agentSlug, agentName, agentRole])

  // Members should not see connectors. Redirect non-owners away from this page.
  useEffect(() => {
    if (authLoading) return
    if (starshipLoading) return
    if (!user?.id) return
    if (!starship?.id) return

    const canManage = Boolean(isInstanceAdmin === true || String(starship.ownerId) === String(user.id))
    if (!canManage) {
      router.replace(`/ship/${slug}`)
    }
  }, [authLoading, isInstanceAdmin, router, slug, starship?.id, starship?.ownerId, starshipLoading, user?.id])
  
  // Clean up URL params when modal closes
  const handleModalClose = (open: boolean) => {
    setShowDeploymentModal(open)
    if (!open && typeof window !== 'undefined') {
      // Remove agent params from URL
      const params = new URLSearchParams(window.location.search)
      params.delete('agentId')
      params.delete('agentSlug')
      params.delete('agentName')
      params.delete('agentRole')
      const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      router.replace(newUrl)
    }
  }

  // If we already know this user can't manage connectors, don't render the page (avoid UI flash).
  if (!authLoading && !starshipLoading && user?.id && starship?.id) {
    const canManage = Boolean(isInstanceAdmin === true || String(starship.ownerId) === String(user.id))
    if (!canManage) return null
  }

  const totalCount = typeof connectorStats?.total === 'number' ? connectorStats.total : null
  const connectedCount = typeof connectorStats?.connected === 'number' ? connectorStats.connected : null
  const unconnectedCount = typeof totalCount === 'number' && typeof connectedCount === 'number' ? Math.max(0, totalCount - connectedCount) : null

  const setView = useCallback(
    (raw: string) => {
      if (typeof window === 'undefined') return
      const nextView = (raw === 'connected' || raw === 'unconnected' || raw === 'all' ? raw : 'all') as ConnectorView
      const params = new URLSearchParams(window.location.search)
      if (nextView === 'all') params.delete('view')
      else params.set('view', nextView)
      const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      router.replace(next)
    },
    [router]
  )

  const mobileFilterOptions = useMemo(() => {
    const withCount = (label: string, n: number | null) => (typeof n === 'number' ? `${label} (${n})` : label)
    return [
      { value: 'all', label: withCount('All', totalCount) },
      { value: 'connected', label: withCount('Connected', connectedCount) },
      { value: 'unconnected', label: withCount('Unconnected', unconnectedCount) },
    ]
  }, [connectedCount, totalCount, unconnectedCount])

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-3">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="-ml-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="plug" weight="bold" className="h-5 w-5" />
                      </span>
                      <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">Connectors</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs leading-snug text-muted-foreground min-h-6">
                      <span className="font-medium leading-snug text-muted-foreground">
                        Connect services and apps to give your starship access to the tools and data it needs.
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
            <Tabs
              value={viewFromUrl}
              onValueChange={value => setView(value)}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-center sm:justify-start gap-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
                    <TabsTrigger value="all" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>All</span>
                        {typeof totalCount === 'number' ? (
                          <Badge
                            variant={viewFromUrl === 'all' ? 'default' : 'secondary'}
                            className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums"
                          >
                            {totalCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="connected" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Connected</span>
                        {typeof connectedCount === 'number' ? (
                          <Badge
                            variant={viewFromUrl === 'connected' ? 'default' : 'secondary'}
                            className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums"
                          >
                            {connectedCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="unconnected" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Unconnected</span>
                        {typeof unconnectedCount === 'number' ? (
                          <Badge
                            variant={viewFromUrl === 'unconnected' ? 'default' : 'secondary'}
                            className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums"
                          >
                            {unconnectedCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value)}
                      placeholder="Search connectors"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search connectors"
                    />
                  </div>
                </div>
              </div>
            </Tabs>
          </div>

          {starshipLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !starship ? (
            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>Starship not found. Please check the URL and try again.</AlertDescription>
            </Alert>
          ) : starship.id ? (
            <StarshipConnectorsPanel
              starshipId={starship.id}
              maxColumns={2}
              onStatsChange={handleStatsChange}
              statusFilter={viewFromUrl}
              catalogQuery={debouncedQuery}
              layout="list"
            />
          ) : null}
        </div>
      </div>

      <MobileBottomFilterBar
        filterValue={viewFromUrl}
        onFilterChange={setView}
        filterOptions={mobileFilterOptions}
        filterPlaceholder="Filter"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search connectors"
      />

      {/* Agent Deployment Modal */}
      {agentId && agentSlug && agentName && agentRole && (
        <AgentDeploymentModal
          open={showDeploymentModal}
          onOpenChange={handleModalClose}
          agentName={agentName}
          agentRole={agentRole}
          agentSlug={agentSlug}
          agentId={agentId}
          starshipSlug={slug}
          agent={agent}
        />
      )}
    </div>
  )
}
