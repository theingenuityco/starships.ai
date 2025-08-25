'use client'

import { useState, useEffect } from 'react'
import { MCPServerConnector } from '@/lib/api'
import {
  ConnectorHealthMetrics,
  monitoringService,
  connectorMonitoring,
} from '@/lib/connector-monitoring'
import { ConnectorApiKeyStatus, ApiKeyStatusInfo } from '@/lib/connector-api-key-status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Activity,
  Clock,
  TrendingUp,
  Zap,
  Target,
  Key,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectorPerformanceMetricsProps {
  connectorInstances: MCPServerConnector[]
  className?: string
  showDetails?: boolean
}

export function ConnectorPerformanceMetrics({
  connectorInstances,
  className,
  showDetails = false,
}: ConnectorPerformanceMetricsProps) {
  const [healthMetrics, setHealthMetrics] = useState<Map<string, ConnectorHealthMetrics>>(new Map())
  const [apiKeyStatus, setApiKeyStatus] = useState<Map<string, ApiKeyStatusInfo>>(new Map())

  // Update health metrics and API key status when connector instances change
  useEffect(() => {
    const metrics = new Map<string, ConnectorHealthMetrics>()
    const keyStatus = new Map<string, ApiKeyStatusInfo>()

    connectorInstances.forEach(connector => {
      const healthMetric = monitoringService.createHealthMetrics()
      metrics.set(connector.id, healthMetric)

      const apiStatus = ConnectorApiKeyStatus.checkApiKeyStatus(connector, connector.template)
      keyStatus.set(connector.id, apiStatus)
    })

    setHealthMetrics(metrics)
    setApiKeyStatus(keyStatus)
  }, [connectorInstances])

  // Calculate overall performance metrics
  const overallMetrics = {
    averageUptime:
      connectorInstances.length > 0
        ? Array.from(healthMetrics.values()).reduce((sum, metric) => sum + metric.uptime, 0) /
          connectorInstances.length
        : 0,
    averageSuccessRate:
      connectorInstances.length > 0
        ? Array.from(healthMetrics.values()).reduce((sum, metric) => sum + metric.successRate, 0) /
          connectorInstances.length
        : 0,
    averageResponseTime:
      connectorInstances.length > 0
        ? Array.from(healthMetrics.values())
            .filter(metric => metric.lastResponseTime)
            .reduce((sum, metric, _, arr) => sum + (metric.lastResponseTime || 0) / arr.length, 0)
        : 0,
    totalErrors: Array.from(healthMetrics.values()).reduce(
      (sum, metric) => sum + metric.errorCount,
      0
    ),
  }

  const activeConnectors = connectorInstances.filter(c => c.status === 'active')

  // Calculate API key status summary
  const apiKeysSummary = {
    total: connectorInstances.length,
    configured: Array.from(apiKeyStatus.values()).filter(status => status.status === 'configured')
      .length,
    missing: Array.from(apiKeyStatus.values()).filter(status => status.status === 'missing').length,
    notRequired: Array.from(apiKeyStatus.values()).filter(
      status => status.status === 'not_required'
    ).length,
  }

  if (connectorInstances.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <p className="text-sm text-muted-foreground">No performance data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Performance & Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Overall Performance Summary */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <span className="text-xs text-muted-foreground">Success Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={overallMetrics.averageSuccessRate} className="flex-1 h-2" />
              <span className="text-sm font-mono">
                {connectorMonitoring.formatSuccessRate()}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-blue-500" />
              <span className="text-xs text-muted-foreground">Avg Response</span>
            </div>
            <div className="text-sm font-mono">
              {connectorMonitoring.formatResponseTime()}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-muted-foreground">API Keys</span>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <span className="text-sm font-mono text-green-600">
                      {apiKeysSummary.configured}
                    </span>
                    <span className="text-xs text-muted-foreground">/</span>
                    <span className="text-sm font-mono">
                      {apiKeysSummary.total - apiKeysSummary.notRequired}
                    </span>
                    {apiKeysSummary.missing > 0 && (
                      <AlertTriangle className="w-3 h-3 text-amber-500 ml-1" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div>Configured: {apiKeysSummary.configured}</div>
                    <div>Missing: {apiKeysSummary.missing}</div>
                    <div>Not Required: {apiKeysSummary.notRequired}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Individual Connector Performance */}
        {showDetails && activeConnectors.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Active Connectors</h4>
            <div className="space-y-2">
              {activeConnectors.slice(0, 3).map(connector => {
                const metrics = healthMetrics.get(connector.id)
                const keyStatusInfo = apiKeyStatus.get(connector.id)
                if (!metrics) return null

                const getApiKeyIcon = () => {
                  if (!keyStatusInfo || keyStatusInfo.status === 'not_required') {
                    return null
                  }

                  switch (keyStatusInfo.status) {
                    case 'configured':
                      return <CheckCircle className="w-3 h-3 text-green-500" />
                    case 'missing':
                      return <AlertTriangle className="w-3 h-3 text-amber-500" />
                    case 'invalid':
                      return <AlertTriangle className="w-3 h-3 text-red-500" />
                    default:
                      return <Key className="w-3 h-3 text-gray-400" />
                  }
                }

                return (
                  <div
                    key={connector.id}
                    className="flex items-center justify-between p-2 rounded border bg-card/50"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          metrics.healthStatus === 'healthy' && 'bg-green-500',
                          metrics.healthStatus === 'warning' && 'bg-yellow-500',
                          metrics.healthStatus === 'critical' && 'bg-red-500',
                          metrics.healthStatus === 'unknown' && 'bg-gray-500'
                        )}
                      />
                      <span className="text-sm font-medium">
                        {connector.template?.name || connector.templateId}
                      </span>
                      {getApiKeyIcon() && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center">{getApiKeyIcon()}</div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                {keyStatusInfo &&
                                  ConnectorApiKeyStatus.getStatusMessage(keyStatusInfo)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <Target className="w-3 h-3 text-muted-foreground" />
                        <span>{connectorMonitoring.formatSuccessRate()}</span>
                      </div>
                      {metrics.lastResponseTime && (
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-muted-foreground" />
                          <span>
                            {connectorMonitoring.formatResponseTime()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-lg font-semibold text-green-600">{activeConnectors.length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-blue-600">
              {connectorMonitoring.formatUptime()}
            </p>
            <p className="text-xs text-muted-foreground">Avg Uptime</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-red-600">{overallMetrics.totalErrors}</p>
            <p className="text-xs text-muted-foreground">Total Errors</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <p className="text-lg font-semibold text-green-600">{apiKeysSummary.configured}</p>
              <span className="text-sm text-muted-foreground">/</span>
              <p className="text-lg font-semibold text-muted-foreground">
                {apiKeysSummary.total - apiKeysSummary.notRequired}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">API Keys</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
