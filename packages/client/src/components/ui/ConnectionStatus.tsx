'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw, Clock, Activity, Shield, X } from 'lucide-react'
// Note: ConnectionMetrics type definition for socket client connections
interface ConnectionMetrics {
  isConnected: boolean
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected'
  circuitBreakerState: 'closed' | 'open' | 'half-open'
  eventCount: number
  failureCount: number
  reconnectAttempts: number
  lastPing: number | null
  uptime: number | null
}

interface ConnectionStatusProps {
  connectionState: ConnectionMetrics
  onForceReconnect?: () => void
  onResetCircuitBreaker?: () => void
  onClearQueue?: () => void
  getHealthStatus?: () => {
    isHealthy: boolean
    connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected'
    issues: string[]
    recommendations: string[]
  }
  getOfflineQueueStatus?: () => {
    queueSize: number
    maxQueueSize: number
    oldestOperationAge?: number
  }
  getCircuitBreakerStatus?: () => {
    state: 'closed' | 'open' | 'half-open'
    failureCount: number
    nextRetryTime?: number
    timeUntilRetry?: number
  }
  compact?: boolean
  showDetails?: boolean
  className?: string
}

export function ConnectionStatus({
  connectionState,
  onForceReconnect,
  onResetCircuitBreaker,
  onClearQueue,
  getHealthStatus,
  getOfflineQueueStatus,
  getCircuitBreakerStatus,
  compact = false,
  showDetails = false,
  className = '',
}: ConnectionStatusProps) {
  const [isExpanded, setIsExpanded] = useState(showDetails)
  const [healthStatus, setHealthStatus] = useState<ReturnType<NonNullable<typeof getHealthStatus>> | null>(null)
  const [queueStatus, setQueueStatus] = useState<ReturnType<NonNullable<typeof getOfflineQueueStatus>> | null>(null)
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<ReturnType<NonNullable<typeof getCircuitBreakerStatus>> | null>(null)

  // Update status information only when connection state changes
  useEffect(() => {
    let mounted = true

    const updateStatuses = () => {
      if (!mounted) return

      if (getHealthStatus) {
        try {
          const newHealthStatus = getHealthStatus()
          if (mounted) {
            setHealthStatus(newHealthStatus)
          }
        } catch (error) {
          console.error('Error getting health status:', error)
          if (mounted) {
            setHealthStatus(null)
          }
        }
      }

      if (getOfflineQueueStatus) {
        try {
          const newQueueStatus = getOfflineQueueStatus()
          if (mounted) {
            setQueueStatus(newQueueStatus)
          }
        } catch (error) {
          console.error('Error getting queue status:', error)
          if (mounted) {
            setQueueStatus(null)
          }
        }
      }

      if (getCircuitBreakerStatus) {
        try {
          const newCircuitBreakerStatus = getCircuitBreakerStatus()
          if (mounted) {
            setCircuitBreakerStatus(newCircuitBreakerStatus)
          }
        } catch (error) {
          console.error('Error getting circuit breaker status:', error)
          if (mounted) {
            setCircuitBreakerStatus(null)
          }
        }
      }
    }

    // Use a timeout to prevent synchronous state updates
    const timeoutId = setTimeout(updateStatuses, 0)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
  }, [
    connectionState.isConnected,
    connectionState.connectionQuality,
    connectionState.circuitBreakerState,
    connectionState.eventCount,
    connectionState.failureCount,
    connectionState.reconnectAttempts,
    connectionState.lastPing,
    connectionState.uptime,
    // Intentionally NOT including the function dependencies to prevent infinite loops
  ])

  // Memoize the status configuration to prevent unnecessary recalculations
  const statusConfig = useMemo(() => {
    const { isConnected, connectionQuality, circuitBreakerState } = connectionState

    if (circuitBreakerState === 'open') {
      return {
        icon: Shield,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-200',
        label: 'Circuit Breaker Open',
        description: 'Connection suspended due to repeated failures',
        severity: 'error' as const,
      }
    }

    if (circuitBreakerState === 'half-open') {
      return {
        icon: Activity,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-200',
        label: 'Testing Connection',
        description: 'Attempting to restore connection',
        severity: 'warning' as const,
      }
    }

    if (!isConnected) {
      return {
        icon: WifiOff,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-200',
        label: 'Disconnected',
        description: 'Not connected to server',
        severity: 'error' as const,
      }
    }

    switch (connectionQuality) {
      case 'excellent':
        return {
          icon: Wifi,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          label: 'Excellent',
          description: 'Connection is stable and fast',
          severity: 'success' as const,
        }
      case 'good':
        return {
          icon: Wifi,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          label: 'Good',
          description: 'Connection is stable',
          severity: 'info' as const,
        }
      case 'poor':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
          label: 'Poor',
          description: 'Connection is unstable',
          severity: 'warning' as const,
        }
      default:
        return {
          icon: WifiOff,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          label: 'Unknown',
          description: 'Connection status unknown',
          severity: 'info' as const,
        }
    }
  }, [connectionState.isConnected, connectionState.connectionQuality, connectionState.circuitBreakerState])

  const StatusIcon = statusConfig.icon

  // Format time duration
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  // Compact view
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`} title={`${statusConfig.label}: ${statusConfig.description}`}>
        <div className={`w-2 h-2 rounded-full ${statusConfig.bgColor.replace('bg-', 'bg-')}`} />
        <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
        {connectionState.reconnectAttempts > 0 && (
          <Badge variant="outline" className="text-xs">
            Retry {connectionState.reconnectAttempts}
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={`${statusConfig.borderColor} ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${statusConfig.bgColor}`}>
              <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-medium">{statusConfig.label}</h3>
                {connectionState.reconnectAttempts > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Retry {connectionState.reconnectAttempts}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{statusConfig.description}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isExpanded && (
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(true)} className="h-8 w-8 p-0">
                <Activity className="h-4 w-4" />
              </Button>
            )}
            {isExpanded && (
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-4">
              {/* Connection Metrics */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Event Count:</span>
                  <span className="ml-2 font-medium">{connectionState.eventCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Uptime:</span>
                  <span className="ml-2 font-medium">{connectionState.uptime ? formatDuration(Date.now() - connectionState.uptime) : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failures:</span>
                  <span className="ml-2 font-medium">{connectionState.failureCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Ping:</span>
                  <span className="ml-2 font-medium">{connectionState.lastPing ? `${Math.round((Date.now() - connectionState.lastPing) / 1000)}s ago` : 'N/A'}</span>
                </div>
              </div>

              {/* Circuit Breaker Status */}
              {circuitBreakerStatus && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Circuit Breaker</h4>
                  <div className="flex items-center justify-between">
                    <Badge variant={circuitBreakerStatus.state === 'closed' ? 'default' : 'destructive'} className="text-xs">
                      {circuitBreakerStatus.state.toUpperCase()}
                    </Badge>
                    {circuitBreakerStatus.timeUntilRetry && circuitBreakerStatus.timeUntilRetry > 0 && (
                      <span className="text-xs text-muted-foreground">Retry in {formatDuration(circuitBreakerStatus.timeUntilRetry)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Offline Queue Status */}
              {queueStatus && queueStatus.queueSize > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Offline Queue</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Queued Operations</span>
                      <span>
                        {queueStatus.queueSize}/{queueStatus.maxQueueSize}
                      </span>
                    </div>
                    <Progress value={(queueStatus.queueSize / queueStatus.maxQueueSize) * 100} className="h-2" />
                    {queueStatus.oldestOperationAge && <p className="text-xs text-muted-foreground">Oldest: {formatDuration(queueStatus.oldestOperationAge)} ago</p>}
                  </div>
                </div>
              )}

              {/* Health Issues */}
              {healthStatus && healthStatus.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-red-600">Issues</h4>
                  <ul className="text-xs space-y-1">
                    {healthStatus.issues.map((issue, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {healthStatus && healthStatus.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-blue-600">Recommendations</h4>
                  <ul className="text-xs space-y-1">
                    {healthStatus.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <CheckCircle className="h-3 w-3 text-blue-500" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {onForceReconnect && (
                  <Button variant="outline" size="sm" onClick={onForceReconnect} disabled={connectionState.isConnected && connectionState.circuitBreakerState === 'closed'}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Force Reconnect
                  </Button>
                )}
                {onResetCircuitBreaker && connectionState.circuitBreakerState !== 'closed' && (
                  <Button variant="outline" size="sm" onClick={onResetCircuitBreaker}>
                    <Shield className="h-3 w-3 mr-1" />
                    Reset Circuit Breaker
                  </Button>
                )}
                {onClearQueue && queueStatus && queueStatus.queueSize > 0 && (
                  <Button variant="outline" size="sm" onClick={onClearQueue}>
                    <Clock className="h-3 w-3 mr-1" />
                    Clear Queue ({queueStatus.queueSize})
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
