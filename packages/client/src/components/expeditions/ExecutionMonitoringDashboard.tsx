'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  Pause,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Users,
  BarChart3,
  TrendingUp,
  Eye,
  MessageSquare,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  Timer,
  Target,
  AlertCircle,
  Info,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface ExecutionMonitoringDashboardProps {
  expeditionId: string
  starshipId: string
  executionData: ExecutionData
  onControlAction: (action: ControlAction) => Promise<void>
  onOpenChat?: () => void
  onViewDetails?: () => void
  className?: string
  isRealtime?: boolean
  autoRefresh?: boolean
}

interface ExecutionData {
  expeditionName: string
  phase: 'execute'
  status: 'executing' | 'paused' | 'completed' | 'failed'
  progress: number
  startTime: string
  currentTask?: ExecutionTask
  completedTasks: ExecutionTask[]
  failedTasks: ExecutionTask[]
  pendingTasks: ExecutionTask[]
  activeAgents: Agent[]
  metrics: ExecutionMetrics
  recentEvents: ExecutionEvent[]
  workflowStats: WorkflowStats
  isConnected?: boolean
  lastUpdate: string
}

interface ExecutionTask {
  id: string
  description: string
  assignedAgent: string
  agentName: string
  startTime?: string
  endTime?: string
  duration?: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  result?: string
  error?: string
  estimatedTime: number
}

interface Agent {
  id: string
  name: string
  status: 'working' | 'waiting' | 'error' | 'idle'
  currentTask?: string
  completedTasks: number
  errorCount: number
  efficiency: number
  lastUpdate: string
}

interface ExecutionMetrics {
  elapsedTime: number
  estimatedTimeRemaining: number
  averageTaskTime: number
  successRate: number
  errorCount: number
  throughput: number
  efficiency: number
}

interface ExecutionEvent {
  id: string
  type: 'task_started' | 'task_completed' | 'task_failed' | 'agent_error' | 'workflow_paused' | 'workflow_resumed' | 'system_info'
  message: string
  agentId?: string
  taskId?: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  details?: any
}

interface WorkflowStats {
  totalNodes: number
  completedNodes: number
  failedNodes: number
  averageExecutionTime: number
  parallelExecution: boolean
  dependencies: Record<string, string[]>
}

interface ControlAction {
  type: 'pause' | 'resume' | 'stop' | 'restart'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExecutionMonitoringDashboard({
  expeditionId,
  starshipId,
  executionData,
  onControlAction,
  onOpenChat,
  onViewDetails,
  className = '',
  isRealtime = false,
  autoRefresh = true
}: ExecutionMonitoringDashboardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const refreshIntervalRef = useRef<NodeJS.Timeout>()

  // Auto refresh data
  useEffect(() => {
    if (autoRefresh && executionData.status === 'executing') {
      refreshIntervalRef.current = setInterval(() => {
        // Trigger refresh - this would normally call a parent refresh function
        console.log('Auto-refreshing execution data')
      }, 5000) // Refresh every 5 seconds

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
        }
      }
    }
  }, [autoRefresh, executionData.status])

  // Handle control actions
  const handleControlAction = async (action: ControlAction) => {
    if (isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      await onControlAction(action)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action.type} execution`)
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle event expansion
  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev)
      if (newSet.has(eventId)) {
        newSet.delete(eventId)
      } else {
        newSet.add(eventId)
      }
      return newSet
    })
  }

  // Toggle task expansion
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  // Get status styling
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'executing':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: Zap, pulse: true }
      case 'paused':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Pause, pulse: false }
      case 'completed':
        return { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle, pulse: false }
      case 'failed':
        return { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, pulse: false }
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: Clock, pulse: false }
    }
  }

  // Get event styling
  const getEventStyle = (severity: string) => {
    switch (severity) {
      case 'success':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' }
      case 'error':
        return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' }
      case 'warning':
        return { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' }
      default:
        return { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' }
    }
  }

  // Get task status styling
  const getTaskStatusStyle = (status: string) => {
    switch (status) {
      case 'running':
        return { color: 'text-blue-600', bg: 'bg-blue-100', icon: Activity }
      case 'completed':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle }
      case 'failed':
        return { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle }
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: Clock }
    }
  }

  // Get agent status styling
  const getAgentStatusStyle = (status: string) => {
    switch (status) {
      case 'working':
        return { color: 'text-green-600', bg: 'bg-green-100', pulse: true }
      case 'error':
        return { color: 'text-red-600', bg: 'bg-red-100', pulse: false }
      case 'waiting':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', pulse: false }
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', pulse: false }
    }
  }

  const statusConfig = getStatusStyle(executionData.status)
  const StatusIcon = statusConfig.icon

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 border border-red-200 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <h4 className="font-medium text-red-800">Control Action Failed</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Executing: {executionData.expeditionName}
                  <Badge variant="outline" className={`${statusConfig.color} ${statusConfig.bg}`}>
                    {executionData.status.charAt(0).toUpperCase() + executionData.status.slice(1)}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-4">
                  <span>Started {formatDistanceToNow(new Date(executionData.startTime), { addSuffix: true })}</span>
                  <span>•</span>
                  <span>Last updated {formatDistanceToNow(new Date(executionData.lastUpdate), { addSuffix: true })}</span>
                  {isRealtime && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {executionData.isConnected ? (
                          <>
                            <Wifi className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">Live</span>
                          </>
                        ) : (
                          <>
                            <WifiOff className="w-3 h-3 text-red-600" />
                            <span className="text-red-600">Offline</span>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-2">
              {onOpenChat && (
                <Button size="sm" variant="outline" onClick={onOpenChat}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat
                </Button>
              )}
              {onViewDetails && (
                <Button size="sm" variant="outline" onClick={onViewDetails}>
                  <Eye className="w-4 h-4 mr-2" />
                  Details
                </Button>
              )}
              
              {/* Execution Controls */}
              {executionData.status === 'executing' && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleControlAction({ type: 'pause' })}
                    disabled={isLoading}
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleControlAction({ type: 'stop' })}
                    disabled={isLoading}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </>
              )}
              
              {executionData.status === 'paused' && (
                <>
                  <Button 
                    size="sm" 
                    onClick={() => handleControlAction({ type: 'resume' })}
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Resume
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleControlAction({ type: 'stop' })}
                    disabled={isLoading}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </>
              )}
              
              {executionData.status === 'failed' && (
                <Button 
                  size="sm" 
                  onClick={() => handleControlAction({ type: 'restart' })}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Restart
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Overall Progress */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Execution Progress</span>
                <span className="text-sm text-muted-foreground">{executionData.progress}%</span>
              </div>
              <Progress value={executionData.progress} className="h-3" />
            </div>

            {/* Current Task */}
            {executionData.currentTask && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Settings className="w-5 h-5 text-blue-600 animate-spin" />
                <div className="flex-1">
                  <h5 className="font-medium text-blue-800">Currently Executing</h5>
                  <p className="text-sm text-blue-700">{executionData.currentTask.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-blue-600">
                    <span>Agent: {executionData.currentTask.agentName}</span>
                    <span>Progress: {executionData.currentTask.progress || 0}%</span>
                    <span>Started: {formatDistanceToNow(new Date(executionData.currentTask.startTime!), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-blue-600">
                  {Math.floor(executionData.metrics.elapsedTime / 60)}h {executionData.metrics.elapsedTime % 60}m
                </div>
                <div className="text-xs text-muted-foreground">Elapsed</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-green-600">
                  {executionData.metrics.estimatedTimeRemaining > 0
                    ? `${Math.floor(executionData.metrics.estimatedTimeRemaining / 60)}h ${executionData.metrics.estimatedTimeRemaining % 60}m`
                    : '0m'
                  }
                </div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-purple-600">{executionData.metrics.successRate}%</div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-amber-600">{executionData.metrics.efficiency}%</div>
                <div className="text-xs text-muted-foreground">Efficiency</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className={`text-xl font-bold ${executionData.metrics.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {executionData.metrics.errorCount}
                </div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Execution Details Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Execution Details
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-6 pt-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({executionData.completedTasks.length + executionData.failedTasks.length + executionData.pendingTasks.length})</TabsTrigger>
                <TabsTrigger value="agents">Agents ({executionData.activeAgents.length})</TabsTrigger>
                <TabsTrigger value="events">Events ({executionData.recentEvents.length})</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 pt-4">
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Task Status Summary */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Task Status
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium">Completed</span>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          {executionData.completedTasks.length}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium">Running</span>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {executionData.currentTask ? 1 : 0}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-600" />
                          <span className="text-sm font-medium">Pending</span>
                        </div>
                        <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                          {executionData.pendingTasks.length}
                        </Badge>
                      </div>
                      {executionData.failedTasks.length > 0 && (
                        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-sm font-medium">Failed</span>
                          </div>
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            {executionData.failedTasks.length}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Performance
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Average Task Time</span>
                        <span className="text-sm font-medium">{executionData.metrics.averageTaskTime}m</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Throughput</span>
                        <span className="text-sm font-medium">{executionData.metrics.throughput} tasks/hr</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Workflow Efficiency</span>
                        <div className="flex items-center gap-2">
                          <Progress value={executionData.metrics.efficiency} className="w-16 h-2" />
                          <span className="text-sm font-medium">{executionData.metrics.efficiency}%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Parallel Execution</span>
                        <Badge variant={executionData.workflowStats.parallelExecution ? "default" : "secondary"}>
                          {executionData.workflowStats.parallelExecution ? 'Enabled' : 'Sequential'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-4">
                <div className="space-y-4">
                  {/* Running Task */}
                  {executionData.currentTask && (
                    <div>
                      <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-600" />
                        Currently Running
                      </h5>
                      {[executionData.currentTask].map((task) => {
                        const taskStatusConfig = getTaskStatusStyle('running')
                        return (
                          <div key={task.id} className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h6 className="font-medium text-sm">{task.description}</h6>
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                  <span>Agent: {task.agentName}</span>
                                  <span>Started: {formatDistanceToNow(new Date(task.startTime!), { addSuffix: true })}</span>
                                  <span>Est: {task.estimatedTime}m</span>
                                </div>
                                {task.progress !== undefined && (
                                  <div className="mt-2">
                                    <Progress value={task.progress} className="h-2" />
                                  </div>
                                )}
                              </div>
                              <Badge className={`${taskStatusConfig.color} ${taskStatusConfig.bg}`}>
                                <taskStatusConfig.icon className="w-3 h-3 mr-1" />
                                Running
                              </Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Completed Tasks */}
                  {executionData.completedTasks.length > 0 && (
                    <div>
                      <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Completed ({executionData.completedTasks.length})
                      </h5>
                      <div className="space-y-2">
                        {executionData.completedTasks.map((task, index) => {
                          const isExpanded = expandedTasks.has(task.id)
                          const taskStatusConfig = getTaskStatusStyle('completed')
                          
                          return (
                            <motion.div
                              key={task.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.03 }}
                              className="border rounded-lg"
                            >
                              <div 
                                className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => toggleTaskExpansion(task.id)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-2 flex-1">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    )}
                                    <div className="flex-1">
                                      <h6 className="font-medium text-sm">{task.description}</h6>
                                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                        <span>Agent: {task.agentName}</span>
                                        <span>Duration: {task.duration}m</span>
                                        <span>Completed: {formatDistanceToNow(new Date(task.endTime!), { addSuffix: true })}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <Badge className={`${taskStatusConfig.color} ${taskStatusConfig.bg}`}>
                                    <taskStatusConfig.icon className="w-3 h-3 mr-1" />
                                    Completed
                                  </Badge>
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="border-t bg-muted/20 p-3"
                                  >
                                    {task.result && (
                                      <div>
                                        <h6 className="text-xs font-medium mb-2">Result</h6>
                                        <p className="text-xs text-muted-foreground bg-white/50 p-2 rounded">
                                          {task.result}
                                        </p>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Failed Tasks */}
                  {executionData.failedTasks.length > 0 && (
                    <div>
                      <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        Failed ({executionData.failedTasks.length})
                      </h5>
                      <div className="space-y-2">
                        {executionData.failedTasks.map((task, index) => {
                          const taskStatusConfig = getTaskStatusStyle('failed')
                          
                          return (
                            <div key={task.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h6 className="font-medium text-sm">{task.description}</h6>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                    <span>Agent: {task.agentName}</span>
                                    <span>Failed: {formatDistanceToNow(new Date(task.endTime!), { addSuffix: true })}</span>
                                  </div>
                                  {task.error && (
                                    <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                                      <strong>Error:</strong> {task.error}
                                    </div>
                                  )}
                                </div>
                                <Badge className={`${taskStatusConfig.color} ${taskStatusConfig.bg}`}>
                                  <taskStatusConfig.icon className="w-3 h-3 mr-1" />
                                  Failed
                                </Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pending Tasks */}
                  {executionData.pendingTasks.length > 0 && (
                    <div>
                      <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-600" />
                        Pending ({executionData.pendingTasks.length})
                      </h5>
                      <div className="space-y-2">
                        {executionData.pendingTasks.slice(0, 5).map((task, index) => {
                          const taskStatusConfig = getTaskStatusStyle('pending')
                          
                          return (
                            <div key={task.id} className="p-3 border border-gray-200 bg-gray-50 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h6 className="font-medium text-sm text-gray-700">{task.description}</h6>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                    <span>Agent: {task.agentName}</span>
                                    <span>Est: {task.estimatedTime}m</span>
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-gray-600 border-gray-300">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pending
                                </Badge>
                              </div>
                            </div>
                          )
                        })}
                        {executionData.pendingTasks.length > 5 && (
                          <div className="text-center p-2 text-sm text-muted-foreground">
                            ... and {executionData.pendingTasks.length - 5} more pending tasks
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Agents Tab */}
              <TabsContent value="agents" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {executionData.activeAgents.map((agent) => {
                    const agentStatusConfig = getAgentStatusStyle(agent.status)
                    
                    return (
                      <Card key={agent.id} className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h5 className="font-medium text-sm">{agent.name}</h5>
                            <p className="text-xs text-muted-foreground">
                              Updated {formatDistanceToNow(new Date(agent.lastUpdate), { addSuffix: true })}
                            </p>
                          </div>
                          <Badge className={`${agentStatusConfig.color} ${agentStatusConfig.bg}`}>
                            <div className={`w-2 h-2 rounded-full bg-current mr-1 ${agentStatusConfig.pulse ? 'animate-pulse' : ''}`} />
                            {agent.status}
                          </Badge>
                        </div>

                        {agent.currentTask && (
                          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                            <strong>Current Task:</strong> {agent.currentTask}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <div className="text-lg font-bold text-green-600">{agent.completedTasks}</div>
                            <div className="text-xs text-muted-foreground">Completed</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-blue-600">{agent.efficiency}%</div>
                            <div className="text-xs text-muted-foreground">Efficiency</div>
                          </div>
                          <div>
                            <div className={`text-lg font-bold ${agent.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {agent.errorCount}
                            </div>
                            <div className="text-xs text-muted-foreground">Errors</div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-4">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {executionData.recentEvents.map((event, index) => {
                    const eventConfig = getEventStyle(event.severity)
                    const EventIcon = eventConfig.icon
                    const isExpanded = expandedEvents.has(event.id)
                    
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`border rounded-lg ${eventConfig.bg}`}
                      >
                        <div 
                          className="p-3 cursor-pointer hover:bg-white/50 transition-colors"
                          onClick={() => toggleEventExpansion(event.id)}
                        >
                          <div className="flex items-start gap-3">
                            <EventIcon className={`w-4 h-4 ${eventConfig.color} mt-0.5 flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{event.message}</p>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span>{formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}</span>
                                {event.agentId && <span>Agent: {event.agentId}</span>}
                                {event.taskId && <span>Task: {event.taskId}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-xs ${eventConfig.color}`}>
                                {event.severity}
                              </Badge>
                              {event.details && (
                                isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )
                              )}
                            </div>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && event.details && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="border-t bg-white/50 p-3"
                            >
                              <div className="flex items-start gap-2">
                                <Terminal className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                                  {JSON.stringify(event.details, null, 2)}
                                </pre>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

export default ExecutionMonitoringDashboard