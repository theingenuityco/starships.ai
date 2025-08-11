'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Activity,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  Users,
  Target,
  Wifi,
  WifiOff,
  RefreshCw,
  Pause,
  Play,
  Square,
  Eye,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Info,
  Sparkles,
  Calendar,
  Timer,
  Signal
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ExpeditionPhase, ExpeditionStatus } from '@starships/protocol'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface FourPhaseStatusDisplayProps {
  expeditionId: string
  starshipId: string
  currentPhase: ExpeditionPhase
  currentStatus: ExpeditionStatus
  realtimeData?: RealtimeStatusData
  enableWebSocket?: boolean
  onStatusChange?: (newStatus: RealtimeStatusData) => void
  onActionClick?: (action: StatusAction) => void
  className?: string
  variant?: 'compact' | 'detailed' | 'dashboard'
  showControls?: boolean
}

interface RealtimeStatusData {
  expeditionId: string
  phase: ExpeditionPhase
  status: ExpeditionStatus
  progress?: number
  currentTask?: string
  completedTasks?: number
  totalTasks?: number
  activeAgents?: Array<{
    id: string
    name: string
    currentTask: string
    status: 'working' | 'waiting' | 'error'
  }>
  recentEvents?: Array<{
    id: string
    type: 'task_completed' | 'task_started' | 'error' | 'phase_changed' | 'user_action'
    message: string
    timestamp: string
    severity?: 'info' | 'warning' | 'error' | 'success'
  }>
  metrics?: {
    elapsedTime: number
    estimatedTimeRemaining?: number
    errorCount: number
    successRate: number
  }
  lastUpdate: string
  isConnected?: boolean
}

interface StatusAction {
  type: 'pause' | 'resume' | 'stop' | 'restart' | 'view_details' | 'open_chat'
  label: string
  icon: any
}

// ============================================================================
// MOCK WEBSOCKET HOOK (Replace with actual implementation)
// ============================================================================

function useExpeditionWebSocket(expeditionId: string, starshipId: string, enabled: boolean = true) {
  const [data, setData] = useState<RealtimeStatusData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled || !expeditionId || !starshipId) return

    // For now, simulate WebSocket connection with mock data
    // TODO: Replace with actual WebSocket implementation
    const simulateConnection = () => {
      setIsConnected(true)
      setError(null)
      
      // Mock initial data
      const mockData: RealtimeStatusData = {
        expeditionId,
        phase: 'execute' as ExpeditionPhase,
        status: 'executing' as ExpeditionStatus,
        progress: 45,
        currentTask: 'Analyzing market trends and competitor data',
        completedTasks: 3,
        totalTasks: 7,
        activeAgents: [
          {
            id: 'agent-1',
            name: 'Research Agent',
            currentTask: 'Market analysis',
            status: 'working'
          },
          {
            id: 'agent-2', 
            name: 'Data Agent',
            currentTask: 'Competitor research',
            status: 'working'
          }
        ],
        recentEvents: [
          {
            id: '1',
            type: 'task_completed',
            message: 'Initial data collection completed successfully',
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            severity: 'success'
          },
          {
            id: '2',
            type: 'task_started',
            message: 'Started market trend analysis',
            timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
            severity: 'info'
          }
        ],
        metrics: {
          elapsedTime: 25,
          estimatedTimeRemaining: 35,
          errorCount: 0,
          successRate: 100
        },
        lastUpdate: new Date().toISOString(),
        isConnected: true
      }
      
      setData(mockData)
      
      // Simulate periodic updates
      const interval = setInterval(() => {
        setData(prev => {
          if (!prev) return prev
          
          // Simulate progress updates
          const newProgress = Math.min(prev.progress! + Math.random() * 5, 100)
          const newCompletedTasks = newProgress > 80 ? prev.totalTasks : prev.completedTasks
          
          return {
            ...prev,
            progress: newProgress,
            completedTasks: newCompletedTasks,
            metrics: prev.metrics ? {
              ...prev.metrics,
              elapsedTime: prev.metrics.elapsedTime + 1,
              estimatedTimeRemaining: Math.max((prev.metrics.estimatedTimeRemaining || 0) - 1, 0)
            } : undefined,
            lastUpdate: new Date().toISOString()
          }
        })
      }, 3000) // Update every 3 seconds

      return () => {
        clearInterval(interval)
        setIsConnected(false)
      }
    }

    const cleanup = simulateConnection()

    return cleanup
  }, [expeditionId, starshipId, enabled])

  const reconnect = () => {
    setError(null)
    // Trigger reconnection logic
  }

  return {
    data,
    isConnected,
    error,
    reconnect
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FourPhaseStatusDisplay({
  expeditionId,
  starshipId,
  currentPhase,
  currentStatus,
  realtimeData,
  enableWebSocket = false,
  onStatusChange,
  onActionClick,
  className = '',
  variant = 'detailed',
  showControls = true
}: FourPhaseStatusDisplayProps) {
  const { data: wsData, isConnected, error: wsError, reconnect } = useExpeditionWebSocket(
    expeditionId, 
    starshipId, 
    enableWebSocket
  )
  
  // Use WebSocket data if available, otherwise use props
  const statusData = enableWebSocket ? wsData : realtimeData
  const displayPhase = statusData?.phase || currentPhase
  const displayStatus = statusData?.status || currentStatus
  const connectionStatus = enableWebSocket ? isConnected : true

  // Notify parent of status changes
  useEffect(() => {
    if (statusData && onStatusChange) {
      onStatusChange(statusData)
    }
  }, [statusData, onStatusChange])

  // Get status color configuration
  const getStatusConfig = (status: ExpeditionStatus) => {
    switch (status) {
      case 'refining':
        return { color: 'text-blue-600', bg: 'bg-blue-100', icon: Activity, pulse: true }
      case 'planning':
        return { color: 'text-purple-600', bg: 'bg-purple-100', icon: Target, pulse: true }
      case 'executing':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: Zap, pulse: true }
      case 'completed':
        return { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle, pulse: false }
      case 'paused':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Pause, pulse: false }
      case 'failed':
        return { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle, pulse: false }
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: Clock, pulse: false }
    }
  }

  const statusConfig = getStatusConfig(displayStatus)
  const StatusIcon = statusConfig.icon

  // Get available control actions
  const getControlActions = (): StatusAction[] => {
    if (!showControls) return []
    
    const actions: StatusAction[] = []
    
    switch (displayStatus) {
      case 'executing':
        actions.push(
          { type: 'pause', label: 'Pause', icon: Pause },
          { type: 'stop', label: 'Stop', icon: Square }
        )
        break
      case 'paused':
        actions.push(
          { type: 'resume', label: 'Resume', icon: Play },
          { type: 'stop', label: 'Stop', icon: Square }
        )
        break
      case 'failed':
        actions.push(
          { type: 'restart', label: 'Restart', icon: RefreshCw }
        )
        break
    }
    
    // Always available actions
    actions.push(
      { type: 'view_details', label: 'Details', icon: Eye },
      { type: 'open_chat', label: 'Chat', icon: MessageSquare }
    )
    
    return actions
  }

  const controlActions = getControlActions()

  // Render compact variant
  if (variant === 'compact') {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
              <div>
                <div className="font-medium text-sm">{displayPhase.charAt(0).toUpperCase() + displayPhase.slice(1)}</div>
                <div className="text-xs text-muted-foreground">{displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}</div>
              </div>
            </div>
            
            {statusData?.progress !== undefined && (
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">{statusData.progress}%</div>
                <div className="w-12">
                  <Progress value={statusData.progress} className="h-2" />
                </div>
              </div>
            )}
            
            {/* Connection Status */}
            <div className="flex items-center gap-1">
              {connectionStatus ? (
                <Wifi className="w-4 h-4 text-green-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-600" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render detailed/dashboard variant
  return (
    <div className={`space-y-4 ${className}`}>
      {/* WebSocket Error */}
      <AnimatePresence>
        {wsError && enableWebSocket && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-red-50 border border-red-200 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <h4 className="font-medium text-red-800">Connection Error</h4>
                  <p className="text-sm text-red-700">{wsError}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={reconnect}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reconnect
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {displayPhase.charAt(0).toUpperCase() + displayPhase.slice(1)} Phase
                  <Badge variant="outline" className={`${statusConfig.color} ${statusConfig.bg}`}>
                    {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                  </Badge>
                </CardTitle>
                {statusData?.lastUpdate && (
                  <p className="text-sm text-muted-foreground">
                    Last updated {formatDistanceToNow(new Date(statusData.lastUpdate), { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
            
            {/* Connection Indicator */}
            <div className="flex items-center gap-2">
              {enableWebSocket && (
                <>
                  {connectionStatus ? (
                    <div className="flex items-center gap-1 text-green-600 text-xs">
                      <Signal className="w-4 h-4" />
                      <span>Live</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-600 text-xs">
                      <WifiOff className="w-4 h-4" />
                      <span>Offline</span>
                    </div>
                  )}
                </>
              )}
              
              {/* Control Actions */}
              {controlActions.length > 0 && (
                <div className="flex gap-1">
                  {controlActions.slice(0, 2).map((action) => (
                    <Button
                      key={action.type}
                      size="sm"
                      variant="outline"
                      onClick={() => onActionClick?.(action)}
                      className="h-8 w-8 p-0"
                    >
                      <action.icon className="w-4 h-4" />
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Progress Overview */}
          {statusData?.progress !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">{statusData.progress}%</span>
              </div>
              <Progress value={statusData.progress} className="h-3" />
              
              {statusData.currentTask && (
                <p className="text-sm text-muted-foreground mt-2">
                  Currently: {statusData.currentTask}
                </p>
              )}
            </div>
          )}

          {/* Metrics */}
          {statusData?.metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-xl font-bold text-blue-600">
                  {Math.floor(statusData.metrics.elapsedTime / 60)}h {statusData.metrics.elapsedTime % 60}m
                </div>
                <div className="text-xs text-muted-foreground">Elapsed</div>
              </div>
              
              {statusData.metrics.estimatedTimeRemaining !== undefined && (
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-xl font-bold text-green-600">
                    {statusData.metrics.estimatedTimeRemaining > 0 
                      ? `${Math.floor(statusData.metrics.estimatedTimeRemaining / 60)}h ${statusData.metrics.estimatedTimeRemaining % 60}m`
                      : '0m'
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">Remaining</div>
                </div>
              )}
              
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-xl font-bold text-amber-600">
                  {statusData.metrics.successRate}%
                </div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
              
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className={`text-xl font-bold ${statusData.metrics.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {statusData.metrics.errorCount}
                </div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          )}

          {/* Task Progress */}
          {statusData?.completedTasks !== undefined && statusData?.totalTasks && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Task Progress</span>
                <span className="text-sm text-muted-foreground">
                  {statusData.completedTasks}/{statusData.totalTasks} completed
                </span>
              </div>
              <Progress 
                value={(statusData.completedTasks / statusData.totalTasks) * 100} 
                className="h-2" 
              />
            </div>
          )}

          {/* Active Agents */}
          {statusData?.activeAgents && statusData.activeAgents.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Active Agents ({statusData.activeAgents.length})
              </h4>
              <div className="space-y-2">
                {statusData.activeAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        agent.status === 'working' ? 'bg-green-500 animate-pulse' :
                        agent.status === 'waiting' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`} />
                      <div>
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">{agent.currentTask}</div>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        agent.status === 'working' ? 'text-green-600 border-green-300' :
                        agent.status === 'waiting' ? 'text-yellow-600 border-yellow-300' :
                        'text-red-600 border-red-300'
                      }`}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {variant === 'dashboard' && (
            <>
              <Separator />
              
              {/* Recent Events */}
              {statusData?.recentEvents && statusData.recentEvents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Recent Activity
                  </h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {statusData.recentEvents.map((event) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-2 bg-muted/30 rounded text-sm"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          event.severity === 'success' ? 'bg-green-500' :
                          event.severity === 'warning' ? 'bg-yellow-500' :
                          event.severity === 'error' ? 'bg-red-500' :
                          'bg-blue-500'
                        }`} />
                        <div className="flex-1">
                          <p className="text-muted-foreground">{event.message}</p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* All Control Actions (for detailed view) */}
          {controlActions.length > 2 && variant === 'detailed' && (
            <div className="flex justify-center gap-2 pt-4 border-t">
              {controlActions.map((action) => (
                <Button
                  key={action.type}
                  size="sm"
                  variant="outline"
                  onClick={() => onActionClick?.(action)}
                  className="gap-2"
                >
                  <action.icon className="w-4 h-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default FourPhaseStatusDisplay