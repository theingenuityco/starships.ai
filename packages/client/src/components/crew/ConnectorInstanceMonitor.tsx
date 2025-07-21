'use client'

import { useState, useEffect, useMemo } from 'react'
import { MCPServerConnector, MCPServerOption } from '@/lib/api'
import {
  ConnectorHealthMetrics,
  ConnectorStatusHistoryEntry,
  monitoringService,
  connectorMonitoring,
} from '@/lib/connector-monitoring'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  Zap,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  BarChart3,
  Settings,
  Info,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectorInstanceMonitorProps {
  starshipId: string
  connectorInstances: MCPServerConnector[]
  className?: string
  showDetailedView?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

interface ConnectorMonitorCardProps {
  connector: MCPServerConnector
  healthMetrics: ConnectorHealthMetrics
  onToggleDetails: (connectorId: string) => void
  showDetails: boolean
  statusHistory: ConnectorStatusHistoryEntry[]
}

// Individual connector monitoring card
function ConnectorMonitorCard({
  connector,
  healthMetrics,
  onToggleDetails,
  showDetails,
  statusHistory,
}: ConnectorMonitorCardProps) {
  const getStatusIcon = () => {
    switch (connector.status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'connecting':
        return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'inactive':
        return <WifiOff className="w-4 h-4 text-gray-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />
    }
  }

  const getHealthIcon = () => {
    switch (healthMetrics.healthStatus) {
      case 'healthy':
        return <CheckCircle className="w-3 h-3 text-green-500" />
      case 'warning':
        return <AlertTriangle className="w-3 h-3 text-yellow-500" />
      case 'critical':
        return <XCircle className="w-3 h-3 text-red-500" />
      case 'unknown':
        return <AlertCircle className="w-3 h-3 text-gray-500" />
    }
  }

  const getPerformanceIcon = () => {
    switch (healthMetrics.performanceLevel) {
      case 'excellent':
        return <Zap className="w-3 h-3 text-green-600" />
      case 'good':
        return <TrendingUp className="w-3 h-3 text-green-500" />
      case 'fair':
        return <Activity className="w-3 h-3 text-yellow-500" />
      case 'poor':
        return <AlertTriangle className="w-3 h-3 text-red-500" />
      case 'unknown':
        return <BarChart3 className="w-3 h-3 text-gray-500" />
    }
  }

  const recentHistory = statusHistory.slice(-10).reverse()

  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        healthMetrics.healthStatus === 'critical' && 'border-red-200 dark:border-red-800',
        healthMetrics.healthStatus === 'warning' && 'border-yellow-200 dark:border-yellow-800',
        healthMetrics.healthStatus === 'healthy' && 'border-green-200 dark:border-green-800'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">{healthMetrics.name}</CardTitle>
              <CardDescription className="text-xs">{connector.templateId}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {getHealthIcon()}
                    <span
                      className={cn(
                        'text-xs font-medium',
                        connectorMonitoring.getHealthStatusColor(healthMetrics.healthStatus)
                      )}
                    >
                      {healthMetrics.healthStatus}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Health Status: {healthMetrics.healthStatus}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleDetails(connector.id)}
              className="h-6 w-6 p-0"
            >
              {showDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Wifi className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Status</span>
            </div>
            <Badge
              variant={connector.status === 'active' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {connector.status}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {getPerformanceIcon()}
              <span className="text-xs text-muted-foreground">Performance</span>
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                connectorMonitoring.getPerformanceLevelColor(healthMetrics.performanceLevel)
              )}
            >
              {healthMetrics.performanceLevel}
            </span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Uptime</span>
            <span className="text-xs font-mono">
              {connectorMonitoring.formatUptime(healthMetrics.uptime)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Success Rate</span>
            <div className="flex items-center gap-2">
              <Progress value={healthMetrics.successRate} className="w-12 h-1" />
              <span className="text-xs font-mono">
                {connectorMonitoring.formatSuccessRate(healthMetrics.successRate)}
              </span>
            </div>
          </div>
          {healthMetrics.lastResponseTime && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Response Time</span>
              <span className="text-xs font-mono">
                {connectorMonitoring.formatResponseTime(healthMetrics.lastResponseTime)}
              </span>
            </div>
          )}
        </div>

        {/* Error Display */}
        {connector.errorMessage && (
          <div className="mb-4">
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-600 font-medium">Error</span>
            </div>
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded border">
              {connector.errorMessage}
            </p>
          </div>
        )}

        {/* Detailed View */}
        {showDetails && (
          <div className="space-y-4 pt-4 border-t">
            <Tabs defaultValue="metrics" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="metrics" className="text-xs">
                  Metrics
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  History
                </TabsTrigger>
                <TabsTrigger value="troubleshoot" className="text-xs">
                  Help
                </TabsTrigger>
              </TabsList>

              <TabsContent value="metrics" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Connected At</span>
                    <p className="font-mono">{new Date(connector.connectedAt).toLocaleString()}</p>
                  </div>
                  {healthMetrics.lastUsed && (
                    <div>
                      <span className="text-muted-foreground">Last Used</span>
                      <p className="font-mono">
                        {new Date(healthMetrics.lastUsed).toLocaleString()}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Error Count</span>
                    <p className="font-mono">{healthMetrics.errorCount}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Health Score</span>
                    <div className="flex items-center gap-1">
                      {getHealthIcon()}
                      <span className="font-mono">{healthMetrics.healthStatus}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-2 mt-3">
                {recentHistory.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {recentHistory.map((entry, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-xs p-1 rounded bg-muted/30"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              entry.status === 'active' && 'bg-green-500',
                              entry.status === 'connecting' && 'bg-blue-500',
                              entry.status === 'error' && 'bg-red-500',
                              entry.status === 'inactive' && 'bg-gray-500'
                            )}
                          />
                          <span>{entry.status}</span>
                        </div>
                        <span className="text-muted-foreground font-mono">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No history available
                  </p>
                )}
              </TabsContent>

              <TabsContent value="troubleshoot" className="space-y-2 mt-3">
                {healthMetrics.troubleshootingHints.length > 0 ? (
                  <div className="space-y-2">
                    {healthMetrics.troubleshootingHints.slice(0, 3).map((hint, index) => (
                      <div key={index} className="flex items-start gap-2 text-xs">
                        <Lightbulb className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{hint}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    <span>No issues detected</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ConnectorInstanceMonitor({
  starshipId,
  connectorInstances,
  className,
  showDetailedView = false,
  autoRefresh = true,
  refreshInterval = 30000,
}: ConnectorInstanceMonitorProps) {
  const [healthMetrics, setHealthMetrics] = useState<Map<string, ConnectorHealthMetrics>>(new Map())
  const [statusHistory, setStatusHistory] = useState<Map<string, ConnectorStatusHistoryEntry[]>>(
    new Map()
  )
  const [expandedConnectors, setExpandedConnectors] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Calculate overall health metrics
  const overallMetrics = useMemo(() => {
    const total = connectorInstances.length
    if (total === 0) return { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0 }

    let healthy = 0,
      warning = 0,
      critical = 0,
      unknown = 0

    connectorInstances.forEach(connector => {
      const metrics = healthMetrics.get(connector.id)
      if (!metrics) {
        unknown++
        return
      }

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
        case 'unknown':
          unknown++
          break
      }
    })

    return { total, healthy, warning, critical, unknown }
  }, [connectorInstances, healthMetrics])

  // Update health metrics when connector instances change
  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics = new Map<string, ConnectorHealthMetrics>()
      const newHistory = new Map<string, ConnectorStatusHistoryEntry[]>()

      connectorInstances.forEach(connector => {
        const metrics = monitoringService.createHealthMetrics(connector, connector.template)
        newMetrics.set(connector.id, metrics)

        const history = monitoringService.getStatusHistory(connector.id)
        newHistory.set(connector.id, history)

        // Record current status in history
        monitoringService.recordStatusChange(
          connector.id,
          connector.status,
          metrics.healthStatus,
          connector.errorMessage
        )
      })

      setHealthMetrics(newMetrics)
      setStatusHistory(newHistory)
    }

    updateMetrics()
  }, [connectorInstances])

  // Set up auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setIsRefreshing(true)
      // Trigger a refresh by updating metrics
      const newMetrics = new Map<string, ConnectorHealthMetrics>()
      connectorInstances.forEach(connector => {
        const metrics = monitoringService.createHealthMetrics(connector, connector.template)
        newMetrics.set(connector.id, metrics)
      })
      setHealthMetrics(newMetrics)
      setIsRefreshing(false)
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, connectorInstances])

  const handleToggleDetails = (connectorId: string) => {
    const newExpanded = new Set(expandedConnectors)
    if (newExpanded.has(connectorId)) {
      newExpanded.delete(connectorId)
    } else {
      newExpanded.add(connectorId)
    }
    setExpandedConnectors(newExpanded)
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    // Force refresh metrics
    const newMetrics = new Map<string, ConnectorHealthMetrics>()
    connectorInstances.forEach(connector => {
      const metrics = monitoringService.createHealthMetrics(connector, connector.template)
      newMetrics.set(connector.id, metrics)
    })
    setHealthMetrics(newMetrics)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  if (connectorInstances.length === 0) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <WifiOff className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Connectors</h3>
          <p className="text-sm text-muted-foreground text-center">
            No connector instances are currently configured for this starship.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overall Status Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Connector Health Monitor
              </CardTitle>
              <CardDescription>
                Real-time status monitoring for {overallMetrics.total} connector
                {overallMetrics.total !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Healthy</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{overallMetrics.healthy}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium">Warning</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600">{overallMetrics.warning}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium">Critical</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{overallMetrics.critical}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <AlertCircle className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Unknown</span>
              </div>
              <p className="text-2xl font-bold text-gray-600">{overallMetrics.unknown}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Connector Cards */}
      <div className="grid gap-4">
        {connectorInstances.map(connector => {
          const metrics = healthMetrics.get(connector.id)
          const history = statusHistory.get(connector.id) || []

          if (!metrics) return null

          return (
            <ConnectorMonitorCard
              key={connector.id}
              connector={connector}
              healthMetrics={metrics}
              onToggleDetails={handleToggleDetails}
              showDetails={expandedConnectors.has(connector.id)}
              statusHistory={history}
            />
          )
        })}
      </div>
    </div>
  )
}
