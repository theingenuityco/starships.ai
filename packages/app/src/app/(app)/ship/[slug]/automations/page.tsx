'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { PageLayout } from '@/components/layout/PageLayout'
import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { autopilotAwaitAPI } from '@/lib/api'
import { useStarshipBySlug } from '@/hooks/useStarships'

export default function StarshipAutomationsPage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''

  const { data: awaits = [], isLoading } = useQuery({
    queryKey: ['starship-automations-awaits', starshipId],
    queryFn: async () => {
      if (!starshipId) return []
      return autopilotAwaitAPI.listByStarship(starshipId, { status: 'waiting', limit: 100 })
    },
    enabled: Boolean(starshipId),
    staleTime: 10_000,
  })

  return (
    <PageLayout
      title="Automations"
      description="Event-driven automations that are currently waiting for external events."
      showHeader
      headerActions={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="workflow" className="w-4 h-4" />
          <span>Awaits</span>
        </div>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Waiting</CardTitle>
            <Badge variant="outline">{Array.isArray(awaits) ? awaits.length : 0}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {!isLoading && (!Array.isArray(awaits) || awaits.length === 0) && <div className="text-sm text-muted-foreground">No waiting automations.</div>}

            {!isLoading &&
              Array.isArray(awaits) &&
              awaits.map((a: any) => {
                const spec = (a?.specJson && typeof a.specJson === 'object' ? a.specJson : null) as any
                const kind = String(spec?.kind ?? '')
                const nodeRef = String(spec?.nodeRef ?? '')
                const inner = spec?.spec && typeof spec.spec === 'object' ? spec.spec : {}
                const provider = typeof inner?.provider === 'string' ? inner.provider : ''
                const connectorId = typeof inner?.connectorId === 'string' ? inner.connectorId : ''
                const eventTypes = Array.isArray(inner?.eventTypes) ? inner.eventTypes.map((x: any) => String(x)).filter(Boolean) : []

                return (
                  <div key={String(a?.id)} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon name="clock" className="w-4 h-4 text-muted-foreground" />
                        <div className="font-medium truncate">Await</div>
                        <Badge variant="secondary" className="capitalize">
                          {String(a?.status ?? 'waiting')}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {kind ? `kind=${kind}` : null}
                        {nodeRef ? ` • nodeRef=${nodeRef}` : null}
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {[provider ? `provider=${provider}` : null, connectorId ? `connectorId=${connectorId}` : null, eventTypes.length ? `eventTypes=${eventTypes.join(',')}` : null]
                          .filter(Boolean)
                          .join(' • ') || 'Wildcard (any connector event)'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{typeof a?.createdAt === 'string' ? new Date(a.createdAt).toLocaleString() : ''}</div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}


