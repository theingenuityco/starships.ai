'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  Circle,
  Clock,
  Target,
  Zap,
  FileCheck,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Brain,
  Cog,
  Trophy
} from 'lucide-react'
import { formatDistanceToNow, differenceInMinutes } from 'date-fns'
import type { ExpeditionPhase, ExpeditionStatus } from '@starships/protocol'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface FourPhaseProgressProps {
  expeditionId: string
  starshipId: string
  currentPhase: ExpeditionPhase
  currentStatus: ExpeditionStatus
  phaseData?: PhaseData
  className?: string
  onPhaseAction?: (action: PhaseAction) => Promise<void>
  enableActions?: boolean
  showDetails?: boolean
  variant?: 'compact' | 'detailed' | 'minimal'
}

interface PhaseData {
  refine?: RefinePhaseData
  plan?: PlanPhaseData
  execute?: ExecutePhaseData
  result?: ResultPhaseData
}

interface RefinePhaseData {
  originalMission: string
  refinedMission?: string
  requirements?: string[]
  complexity?: string
  estimatedDuration?: number
  lastUpdate?: string
}

interface PlanPhaseData {
  taskBreakdown?: Array<{
    id: string
    description: string
    estimatedTime: number
    requiredSkills: string[]
  }>
  workflowVisualization?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  estimatedSuccess?: number
  qualityScore?: number
  lastUpdate?: string
}

interface ExecutePhaseData {
  progress?: number
  currentTask?: string
  completedTasks?: number
  totalTasks?: number
  runtimeErrors?: string[]
  estimatedTimeRemaining?: number
  lastUpdate?: string
}

interface ResultPhaseData {
  finalOutput?: string
  qualityMetrics?: {
    completeness: number
    accuracy: number
    relevance: number
  }
  executionSummary?: string
  recommendedNextSteps?: string[]
  lastUpdate?: string
}

interface PhaseAction {
  type: 'progress' | 'approve' | 'reject' | 'start' | 'pause' | 'resume'
  phase: ExpeditionPhase
  data?: any
}

// ============================================================================
// COMPONENT CONFIGURATION
// ============================================================================

const PHASE_CONFIG = {
  refine: {
    label: 'Refine',
    icon: Brain,
    color: 'blue',
    description: 'Mission clarification and requirement gathering',
    gradient: 'from-blue-500 to-blue-600'
  },
  plan: {
    label: 'Plan',
    icon: Target,
    color: 'purple',
    description: 'Task breakdown and workflow generation',
    gradient: 'from-purple-500 to-purple-600'
  },
  execute: {
    label: 'Execute',
    icon: Zap,
    color: 'green',
    description: 'Workflow execution and progress monitoring',
    gradient: 'from-green-500 to-green-600'
  },
  result: {
    label: 'Result',
    icon: Trophy,
    color: 'amber',
    description: 'Output compilation and completion',
    gradient: 'from-amber-500 to-amber-600'
  }
} as const

const STATUS_CONFIG = {
  draft: { color: 'text-gray-500', bg: 'bg-gray-100', label: 'Draft' },
  refining: { color: 'text-blue-600', bg: 'bg-blue-100', label: 'Refining', pulse: true },
  planning: { color: 'text-purple-600', bg: 'bg-purple-100', label: 'Planning', pulse: true },
  executing: { color: 'text-green-600', bg: 'bg-green-100', label: 'Executing', pulse: true },
  completed: { color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Completed' },
  failed: { color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
  cancelled: { color: 'text-gray-600', bg: 'bg-gray-100', label: 'Cancelled' },
  paused: { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Paused' }
} as const

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FourPhaseProgress({
  expeditionId,
  starshipId,
  currentPhase,
  currentStatus,
  phaseData,
  className = '',
  onPhaseAction,
  enableActions = false,
  showDetails = true,
  variant = 'detailed'
}: FourPhaseProgressProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Get phase order and completion status
  const phases: ExpeditionPhase[] = ['refine', 'plan', 'execute', 'result']
  const currentPhaseIndex = phases.indexOf(currentPhase)
  
  // Calculate overall progress percentage
  const getOverallProgress = () => {
    const baseProgress = (currentPhaseIndex / phases.length) * 100
    
    // Add micro-progress within current phase based on status
    let microProgress = 0
    if (currentStatus === 'refining') microProgress = 25
    else if (currentStatus === 'planning') microProgress = 25  
    else if (currentStatus === 'executing') microProgress = phaseData?.execute?.progress || 25
    else if (currentStatus === 'completed') microProgress = 0 // Final phase complete
    
    return Math.min(Math.round(baseProgress + (microProgress / phases.length)), 100)
  }
  
  // Handle phase actions
  const handlePhaseAction = async (action: PhaseAction) => {
    if (!onPhaseAction) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onPhaseAction(action)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setIsLoading(false)
    }
  }
  
  // Render phase step
  const renderPhaseStep = (phase: ExpeditionPhase, index: number) => {
    const config = PHASE_CONFIG[phase]
    const isActive = currentPhase === phase
    const isCompleted = index < currentPhaseIndex
    const isUpcoming = index > currentPhaseIndex
    const IconComponent = config.icon
    
    // Get phase-specific data
    const data = phaseData?.[phase]
    const hasData = !!data
    
    return (
      <div key={phase} className="relative flex flex-col items-center">
        {/* Phase Icon */}
        <motion.div
          initial={false}
          animate={{
            scale: isActive ? 1.1 : 1,
            rotate: isCompleted ? 0 : 0
          }}
          className={`
            relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300
            ${isCompleted
              ? `bg-gradient-to-br ${config.gradient} border-${config.color}-500 text-white shadow-lg`
              : isActive
                ? `bg-gradient-to-br ${config.gradient} border-${config.color}-500 text-white shadow-lg animate-pulse`
                : `bg-background border-gray-300 text-gray-400 hover:border-${config.color}-300`
            }
          `}
        >
          {isCompleted ? (
            <CheckCircle className="w-6 h-6" />
          ) : isActive ? (
            <IconComponent className="w-6 h-6" />
          ) : (
            <Circle className="w-6 h-6" />
          )}
        </motion.div>
        
        {/* Phase Label */}
        <div className="mt-2 text-center">
          <div className={`
            text-sm font-medium transition-colors
            ${isActive ? `text-${config.color}-600` : isCompleted ? `text-${config.color}-500` : 'text-gray-500'}
          `}>
            {config.label}
          </div>
          {variant === 'detailed' && (
            <div className="text-xs text-muted-foreground mt-1 max-w-20 text-center">
              {config.description}
            </div>
          )}
        </div>
        
        {/* Phase Status Indicator */}
        {hasData && variant !== 'minimal' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1"
          >
            {isActive && (
              <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[currentStatus]?.color} ${STATUS_CONFIG[currentStatus]?.bg}`}>
                {STATUS_CONFIG[currentStatus]?.pulse && (
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-1" />
                )}
                {STATUS_CONFIG[currentStatus]?.label}
              </Badge>
            )}
          </motion.div>
        )}
        
        {/* Connection Line */}
        {index < phases.length - 1 && (
          <div className={`
            absolute top-6 left-full w-16 h-0.5 transition-colors duration-500
            ${index < currentPhaseIndex ? `bg-gradient-to-r ${config.gradient}` : 'bg-gray-300'}
          `} />
        )}
      </div>
    )
  }
  
  // Render phase details panel
  const renderPhaseDetails = () => {
    if (!showDetails || variant === 'minimal') return null
    
    const activePhaseData = phaseData?.[currentPhase]
    const config = PHASE_CONFIG[currentPhase]
    
    return (
      <motion.div
        key={currentPhase}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="mt-6"
      >
        <Card className="border-l-4" style={{ borderLeftColor: `var(--${config.color}-500)` }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${config.gradient} text-white`}>
                  <config.icon className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{config.label} Phase</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                </div>
              </div>
              
              {/* Phase Actions */}
              {enableActions && renderPhaseActions()}
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            {renderPhaseSpecificDetails(currentPhase, activePhaseData)}
          </CardContent>
        </Card>
      </motion.div>
    )
  }
  
  // Render phase-specific action buttons
  const renderPhaseActions = () => {
    const actions = getAvailableActions()
    
    return (
      <div className="flex gap-2">
        {actions.map((action, index) => (
          <Button
            key={index}
            size="sm"
            variant={action.variant}
            onClick={() => handlePhaseAction(action)}
            disabled={isLoading}
            className={action.className}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <action.icon className="w-4 h-4 mr-2" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    )
  }
  
  // Get available actions for current phase/status
  const getAvailableActions = () => {
    const actions = []
    
    switch (currentPhase) {
      case 'refine':
        if (currentStatus === 'draft' || currentStatus === 'refining') {
          actions.push({
            type: 'progress' as const,
            phase: 'refine' as const,
            icon: ArrowRight,
            label: 'Continue to Planning',
            variant: 'default' as const,
            className: 'bg-blue-600 hover:bg-blue-700'
          })
        }
        break
        
      case 'plan':
        if (currentStatus === 'planning') {
          actions.push({
            type: 'approve' as const,
            phase: 'plan' as const,
            icon: CheckCircle,
            label: 'Approve Plan',
            variant: 'default' as const,
            className: 'bg-green-600 hover:bg-green-700'
          })
          actions.push({
            type: 'reject' as const,
            phase: 'plan' as const,
            icon: AlertTriangle,
            label: 'Request Changes',
            variant: 'outline' as const,
            className: 'border-orange-300 hover:bg-orange-50'
          })
        }
        break
        
      case 'execute':
        if (currentStatus === 'planning') {
          actions.push({
            type: 'start' as const,
            phase: 'execute' as const,
            icon: Play,
            label: 'Start Execution',
            variant: 'default' as const,
            className: 'bg-green-600 hover:bg-green-700'
          })
        } else if (currentStatus === 'executing') {
          actions.push({
            type: 'pause' as const,
            phase: 'execute' as const,
            icon: Pause,
            label: 'Pause',
            variant: 'outline' as const,
            className: ''
          })
        } else if (currentStatus === 'paused') {
          actions.push({
            type: 'resume' as const,
            phase: 'execute' as const,
            icon: Play,
            label: 'Resume',
            variant: 'default' as const,
            className: 'bg-green-600 hover:bg-green-700'
          })
        }
        break
    }
    
    return actions
  }
  
  // Render phase-specific details
  const renderPhaseSpecificDetails = (phase: ExpeditionPhase, data: any) => {
    switch (phase) {
      case 'refine':
        return (
          <div className="space-y-4">
            {data?.refinedMission && (
              <div>
                <h4 className="text-sm font-medium mb-2">Refined Mission</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {data.refinedMission}
                </p>
              </div>
            )}
            
            {data?.requirements && (
              <div>
                <h4 className="text-sm font-medium mb-2">Requirements ({data.requirements.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {data.requirements.map((req: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {req}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {data?.complexity && (
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm font-medium">Complexity: </span>
                  <Badge variant="outline" className={`
                    ${data.complexity === 'simple' ? 'text-green-600 border-green-300' : 
                      data.complexity === 'moderate' ? 'text-yellow-600 border-yellow-300' :
                      data.complexity === 'complex' ? 'text-orange-600 border-orange-300' :
                      'text-red-600 border-red-300'}
                  `}>
                    {data.complexity}
                  </Badge>
                </div>
                
                {data.estimatedDuration && (
                  <div>
                    <span className="text-sm font-medium">Est. Duration: </span>
                    <span className="text-sm text-muted-foreground">
                      {Math.floor(data.estimatedDuration / 60)}h {data.estimatedDuration % 60}m
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
        
      case 'plan':
        return (
          <div className="space-y-4">
            {data?.taskBreakdown && (
              <div>
                <h4 className="text-sm font-medium mb-2">Task Breakdown ({data.taskBreakdown.length} tasks)</h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {data.taskBreakdown.map((task: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg text-sm">
                      <Circle className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1">{task.description}</span>
                      <Badge variant="outline" className="text-xs">
                        {task.estimatedTime}m
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              {data?.estimatedSuccess && (
                <div>
                  <span className="text-sm font-medium">Success Rate: </span>
                  <Badge variant="outline" className={`
                    ${data.estimatedSuccess >= 90 ? 'text-green-600 border-green-300' :
                      data.estimatedSuccess >= 75 ? 'text-blue-600 border-blue-300' :
                      data.estimatedSuccess >= 60 ? 'text-yellow-600 border-yellow-300' :
                      'text-red-600 border-red-300'}
                  `}>
                    {data.estimatedSuccess}%
                  </Badge>
                </div>
              )}
              
              {data?.qualityScore && (
                <div>
                  <span className="text-sm font-medium">Quality Score: </span>
                  <Badge variant="outline" className="text-blue-600 border-blue-300">
                    {data.qualityScore}%
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )
        
      case 'execute':
        return (
          <div className="space-y-4">
            {data?.progress !== undefined && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Execution Progress</span>
                  <span className="text-sm text-muted-foreground">{data.progress}%</span>
                </div>
                <Progress value={data.progress} className="h-2" />
              </div>
            )}
            
            {data?.currentTask && (
              <div>
                <h4 className="text-sm font-medium mb-2">Current Task</h4>
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <Cog className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>{data.currentTask}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4 text-sm">
              {data?.completedTasks !== undefined && data?.totalTasks && (
                <div>
                  <span className="font-medium">Tasks: </span>
                  <span className="text-muted-foreground">
                    {data.completedTasks}/{data.totalTasks} completed
                  </span>
                </div>
              )}
              
              {data?.estimatedTimeRemaining && (
                <div>
                  <span className="font-medium">Time Remaining: </span>
                  <span className="text-muted-foreground">
                    ~{Math.floor(data.estimatedTimeRemaining / 60)}h {data.estimatedTimeRemaining % 60}m
                  </span>
                </div>
              )}
            </div>
          </div>
        )
        
      case 'result':
        return (
          <div className="space-y-4">
            {data?.qualityMetrics && (
              <div>
                <h4 className="text-sm font-medium mb-3">Quality Metrics</h4>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(data.qualityMetrics).map(([key, value]) => (
                    <div key={key} className="text-center">
                      <div className="text-lg font-bold text-green-600">{value}%</div>
                      <div className="text-xs text-muted-foreground capitalize">{key}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {data?.recommendedNextSteps && (
              <div>
                <h4 className="text-sm font-medium mb-2">Recommended Next Steps</h4>
                <div className="space-y-1">
                  {data.recommendedNextSteps.map((step: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="w-4 h-4" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
        
      default:
        return null
    }
  }
  
  const overallProgress = getOverallProgress()
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-red-50 border border-red-200 rounded-lg"
          >
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Overall Progress */}
      {variant !== 'minimal' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Expedition Progress</span>
            <span className="text-sm text-muted-foreground">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" />
        </div>
      )}
      
      {/* Phase Stepper */}
      <div className="flex items-center justify-center space-x-16 py-4">
        {phases.map((phase, index) => renderPhaseStep(phase, index))}
      </div>
      
      {/* Phase Details */}
      <AnimatePresence mode="wait">
        {renderPhaseDetails()}
      </AnimatePresence>
    </div>
  )
}

export default FourPhaseProgress