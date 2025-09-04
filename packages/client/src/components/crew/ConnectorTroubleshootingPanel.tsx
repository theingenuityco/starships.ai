'use client'

import { useState, useEffect } from 'react'
import { MCPServerConnector } from '@/lib/api'
import {
  ConnectorHealthMetrics,
  monitoringService,
  ConnectorError,
} from '@/lib/connector-monitoring'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, XCircle, Lightbulb, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectorTroubleshootingPanelProps {
  connectorInstances: MCPServerConnector[]
  className?: string
}

interface ErrorLogEntry {
  connectorId: string
  connectorName: string
  error: ConnectorError
  timestamp: string
}

export function ConnectorTroubleshootingPanel({
  connectorInstances,
  className,
}: ConnectorTroubleshootingPanelProps) {
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([])
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [healthMetrics, setHealthMetrics] = useState<Map<string, ConnectorHealthMetrics>>(new Map())

  // Update error logs and health metrics
  useEffect(() => {
    const logs: ErrorLogEntry[] = []
    const metrics = new Map<string, ConnectorHealthMetrics>()

    connectorInstances.forEach(connector => {
      const healthMetric = monitoringService.createHealthMetrics()
      metrics.set(connector.id, healthMetric)

      // Add error logs for connectors with errors
      if (connector.errorMessage) {
        const error = monitoringService.categorizeError(connector.errorMessage)
        logs.push({
          connectorId: connector.id,
          connectorName: connector.template?.name || connector.templateId,
          error,
          timestamp: new Date().toISOString(),
        })
      }
    })

    setErrorLogs(logs)
    setHealthMetrics(metrics)
  }, [connectorInstances])

  const toggleErrorExpansion = (errorId: string) => {
    const newExpanded = new Set(expandedErrors)
    if (newExpanded.has(errorId)) {
      newExpanded.delete(errorId)
    } else {
      newExpanded.add(errorId)
    }
    setExpandedErrors(newExpanded)
  }

  const getSeverityColor = (severity: ConnectorError['severity']) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20'
      case 'high':
        return 'text-red-500 bg-red-50 dark:bg-red-900/20'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
      case 'low':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20'
    }
  }

  const getTypeIcon = (type: ConnectorError['type']) => {
    switch (type) {
      case 'connection':
        return <XCircle className="w-4 h-4" />
      case 'authentication':
        return <AlertTriangle className="w-4 h-4" />
      case 'timeout':
        return <Clock className="w-4 h-4" />
      case 'configuration':
        return <AlertTriangle className="w-4 h-4" />
      case 'server':
        return <XCircle className="w-4 h-4" />
      default:
        return <AlertTriangle className="w-4 h-4" />
    }
  }

  // Get connectors that need attention
  const connectorsNeedingAttention = connectorInstances.filter(connector => {
    const metrics = healthMetrics.get(connector.id)
    return (
      connector.status === 'error' ||
      (metrics && (metrics.healthStatus === 'critical' || metrics.healthStatus === 'warning'))
    )
  })

  if (connectorsNeedingAttention.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center">
            <Lightbulb className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All connectors are running smoothly</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          Troubleshooting
        </CardTitle>
        <CardDescription>
          {connectorsNeedingAttention.length} connector
          {connectorsNeedingAttention.length !== 1 ? 's' : ''} need attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Error Logs */}
          {errorLogs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <XCircle className="w-3 h-3 text-red-500" />
                Recent Errors
              </h4>
              <div className="space-y-2">
                {errorLogs.slice(0, 3).map((log, index) => {
                  const errorId = `${log.connectorId}-${index}`
                  const isExpanded = expandedErrors.has(errorId)

                  return (
                    <div key={errorId} className="border rounded-lg p-3 bg-card/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(log.error.type)}
                          <span className="text-sm font-medium">{log.connectorName}</span>
                          <Badge
                            variant="outline"
                            className={cn('text-xs', getSeverityColor(log.error.severity))}
                          >
                            {log.error.severity}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleErrorExpansion(errorId)}
                          className="h-6 w-6 p-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground mb-2">{log.error.message}</p>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t">
                          <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-yellow-500" />
                            Troubleshooting Tips
                          </h5>
                          <ul className="space-y-1">
                            {log.error.troubleshootingHints.slice(0, 3).map((hint, hintIndex) => (
                              <li
                                key={hintIndex}
                                className="text-xs text-muted-foreground flex items-start gap-2"
                              >
                                <span className="text-yellow-500 mt-0.5">•</span>
                                <span>{hint}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Health Warnings */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              Health Warnings
            </h4>
            <div className="space-y-2">
              {connectorsNeedingAttention
                .filter(connector => !connector.errorMessage) // Don't duplicate error connectors
                .slice(0, 3)
                .map(connector => {
                  const metrics = healthMetrics.get(connector.id)
                  if (!metrics) return null

                  return (
                    <div key={connector.id} className="border rounded-lg p-3 bg-card/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium">
                            {connector.template?.name || connector.templateId}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {metrics.healthStatus}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {metrics.troubleshootingHints.slice(0, 2).map((hint, index) => (
                          <p
                            key={index}
                            className="text-xs text-muted-foreground flex items-start gap-2"
                          >
                            <Lightbulb className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <span>{hint}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
