'use client'

import { useState, useEffect, useMemo } from 'react'
import { MCPServerConnector } from '@/lib/api'
import {
  ConnectorHealthMetrics,
  monitoringService,
  connectorMonitoring,
} from '@/lib/connector-monitoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectorStatusDashboardProps {
  starshipId: string
  connectorInstances: MCPServerConnector[]
  className?: string
  compact?: boolean
}

export function ConnectorStatusDashboard({
  starshipId,
  connectorInstances,
  className,
  compact = false,
}: ConnectorStatusDashboardProps) {
  const [healthMetrics, setHealthMetrics] = useState<Map<string, ConnectorHealthMetrics>>(new Map())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Calculate overall health summary
  const healthSummary = useMemo(() => {
    const total = connectorInstances.length
    if (total === 0) return { total: 0, healthy: 0, warning: 0, critical: 0, active: 0 }

    let healthy = 0,
      warning = 0,
      critical = 0,
      active = 0

    connectorInstances.forEach(connector => {
      if (connector.status === 'active') active++

      const metrics = healthMetrics.get(connector.id)
      if (!metrics) return

      switch (metrics.healthStatus) {
        case 'healthy':
          healthy++
          break
        case 'warning':
          warning++
          break
        case 'critical':
          critical++
          break
      }
    })

    return { total, healthy, warning, critical, active }
  }, [connectorInstances, healthMetrics])

  // Update health metrics when connector instances change
  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics = new Map<string, ConnectorHealthMetrics>()
      connectorInstances.forEach(connector => {
        const metrics = monitoringService.createHealthMetrics(connector, connector.template)
        newMetrics.set(connector.id, metrics)
      })
      setHealthMetrics(newMetrics)
    }
    updateMetrics()
  }, [connectorInstances])

  const handleRefresh = () => {
    setIsRefreshing(true)
    const newMetrics = new Map<string, ConnectorHealthMetrics>()
    connectorInstances.forEach(connector => {
      const metrics = monitoringService.createHealthMetrics(connector, connector.template)
      newMetrics.set(connector.id, metrics)
    })
    setHealthMetrics(newMetrics)
    setTimeout(() => setIsRefreshing(false), 500)
  }

  if (connectorInstances.length === 0) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="flex items-center justify-center py-6">
          <p className="text-sm text-muted-foreground">No connectors configured</p>
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Activity className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {healthSummary.active}/{healthSummary.total} active
        </span>
        {healthSummary.critical > 0 && (
          <Badge variant="destructive" className="text-xs">
            {healthSummary.critical} critical
          </Badge>
        )}
        {healthSummary.warning > 0 && (
          <Badge variant="secondary" className="text-xs">
            {healthSummary.warning} warning
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Connector Status
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-7 px-2"
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Health Summary */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center">
            <CheckCircle className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-green-600">{healthSummary.healthy}</p>
            <p className="text-xs text-muted-foreground">Healthy</p>
          </div>
          <div className="text-center">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-yellow-600">{healthSummary.warning}</p>
            <p className="text-xs text-muted-foreground">Warning</p>
          </div>
          <div className="text-center">
            <XCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-red-600">{healthSummary.critical}</p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </div>
          <div className="text-center">
            <Clock className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-blue-600">{healthSummary.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>

        {/* Connector List */}
        <div className="space-y-2">
          {connectorInstances.map(connector => {
            const metrics = healthMetrics.get(connector.id)
            if (!metrics) return null

            return (
              <div
                key={connector.id}
                className="flex items-center justify-between p-2 rounded border bg-card/50"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      connector.status === 'active' && 'bg-green-500',
                      connector.status === 'connecting' && 'bg-blue-500 animate-pulse',
                      connector.status === 'error' && 'bg-red-500',
                      connector.status === 'inactive' && 'bg-gray-500'
                    )}
                  />
                  <span className="text-sm font-medium">{metrics.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      metrics.healthStatus === 'healthy'
                        ? 'default'
                        : metrics.healthStatus === 'warning'
                          ? 'secondary'
                          : metrics.healthStatus === 'critical'
                            ? 'destructive'
                            : 'outline'
                    }
                    className="text-xs"
                  >
                    {metrics.healthStatus}
                  </Badge>
                  {connector.errorMessage && (
                    <span
                      className="text-xs text-red-500 max-w-32 truncate"
                      title={connector.errorMessage}
                    >
                      {connector.errorMessage}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
