'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { AgentDeploymentModal } from '@/components/connectors/AgentDeploymentModal'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useAgent } from '@/hooks/useAgents'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

interface ConnectorsSettingsContentProps {
  slug: string
}

type ConnectorView = 'all' | 'connected' | 'unconnected'

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
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), 250)
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

  return (
    <div className="relative flex flex-col h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-3">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <div className="flex items-baseline gap-2 min-w-0 w-full">
                  <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                    <Icon name="plug" weight="bold" className="h-5 w-5" />
                  </span>
                  <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">Connectors</h3>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground min-h-6">
                  <span className="font-medium leading-none">
                    {typeof connectorStats?.total === 'number' ? (
                      <>
                        <span className="text-foreground tabular-nums">{connectorStats.total}</span> connectors ·{' '}
                        <span className="text-foreground tabular-nums">{connectorStats.connected}</span> connected
                      </>
                    ) : (
                      <>—</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6" style={{ paddingBottom: 32 }}>
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8">
            <Tabs
              value={viewFromUrl}
              onValueChange={value => {
                if (typeof window === 'undefined') return
                const nextView = (value === 'connected' || value === 'unconnected' || value === 'all' ? value : 'all') as ConnectorView
                const params = new URLSearchParams(window.location.search)
                if (nextView === 'all') params.delete('view')
                else params.set('view', nextView)
                const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
                router.replace(next)
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-start gap-1 overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="connected">Connected</TabsTrigger>
                    <TabsTrigger value="unconnected">Unconnected</TabsTrigger>
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
            />
          ) : null}
        </div>
      </div>

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
