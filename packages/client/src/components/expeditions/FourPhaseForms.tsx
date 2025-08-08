'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  Zap,
  Trophy,
  Brain,
  Sparkles,
  FileText,
  Users,
  Settings,
  ThumbsUp,
  ThumbsDown,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Info,
  ArrowRight,
  Edit3,
  Eye,
  Download
} from 'lucide-react'
import type { ExpeditionPhase } from '@starships/protocol'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface FourPhaseFormsProps {
  expeditionId: string
  starshipId: string
  currentPhase: ExpeditionPhase
  phaseData?: PhaseFormData
  onSubmit: (phase: ExpeditionPhase, data: any) => Promise<void>
  className?: string
  disabled?: boolean
}

interface PhaseFormData {
  refine?: RefineFormData
  plan?: PlanFormData
  execute?: ExecuteFormData
  result?: ResultFormData
}

interface RefineFormData {
  originalMission: string
  refinedMission?: string
  requirements: string[]
  complexity: 'simple' | 'moderate' | 'complex' | 'expert'
  visionContext?: string
  constraints?: string[]
  successCriteria?: string[]
}

interface PlanFormData {
  taskBreakdown: TaskBreakdownItem[]
  workflowVisualization: string
  estimatedDuration: number
  successProbability: number
  qualityScore: number
  approvalStatus: 'pending' | 'approved' | 'rejected'
  userComments?: string
  requestedChanges?: string[]
}

interface TaskBreakdownItem {
  id: string
  description: string
  estimatedTime: number
  requiredSkills: string[]
  assignedAgent?: string
  priority: 'low' | 'medium' | 'high'
  dependencies: string[]
}

interface ExecuteFormData {
  progress: number
  currentTask?: string
  completedTasks: string[]
  failedTasks: string[]
  runtimeErrors: string[]
  estimatedTimeRemaining: number
  canPause: boolean
  canResume: boolean
}

interface ResultFormData {
  finalOutput: string
  qualityMetrics: {
    completeness: number
    accuracy: number
    relevance: number
    clarity: number
  }
  executionSummary: string
  lessonsLearned: string[]
  recommendedNextSteps: string[]
  artifactsGenerated: Array<{
    name: string
    type: string
    size: number
    downloadUrl: string
  }>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FourPhaseForms({
  expeditionId,
  starshipId,
  currentPhase,
  phaseData,
  onSubmit,
  className = '',
  disabled = false
}: FourPhaseFormsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle form submission
  const handleSubmit = async (phase: ExpeditionPhase, data: any) => {
    setIsLoading(true)
    setError(null)

    try {
      await onSubmit(phase, data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Form submission failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Render appropriate form based on current phase
  const renderPhaseForm = () => {
    switch (currentPhase) {
      case 'refine':
        return <RefinePhaseForm data={phaseData?.refine} onSubmit={handleSubmit} disabled={disabled || isLoading} />
      case 'plan':
        return <PlanPhaseForm data={phaseData?.plan} onSubmit={handleSubmit} disabled={disabled || isLoading} />
      case 'execute':
        return <ExecutePhaseForm data={phaseData?.execute} onSubmit={handleSubmit} disabled={disabled || isLoading} />
      case 'result':
        return <ResultPhaseForm data={phaseData?.result} onSubmit={handleSubmit} disabled={disabled || isLoading} />
      default:
        return <div className="text-center text-muted-foreground py-8">Unknown phase: {currentPhase}</div>
    }
  }

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
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <h4 className="font-medium text-red-800">Form Submission Error</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase Form */}
      <motion.div
        key={currentPhase}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        {renderPhaseForm()}
      </motion.div>
    </div>
  )
}

// ============================================================================
// REFINE PHASE FORM
// ============================================================================

function RefinePhaseForm({
  data,
  onSubmit,
  disabled
}: {
  data?: RefineFormData
  onSubmit: (phase: ExpeditionPhase, data: any) => Promise<void>
  disabled: boolean
}) {
  const [formData, setFormData] = useState({
    refinedMission: data?.refinedMission || '',
    requirements: data?.requirements || [],
    complexity: data?.complexity || 'moderate' as const,
    visionContext: data?.visionContext || '',
    constraints: data?.constraints || [],
    successCriteria: data?.successCriteria || []
  })

  const [newRequirement, setNewRequirement] = useState('')
  const [newConstraint, setNewConstraint] = useState('')
  const [newCriterion, setNewCriterion] = useState('')

  const addRequirement = () => {
    if (newRequirement.trim()) {
      setFormData(prev => ({
        ...prev,
        requirements: [...prev.requirements, newRequirement.trim()]
      }))
      setNewRequirement('')
    }
  }

  const removeRequirement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requirements: prev.requirements.filter((_, i) => i !== index)
    }))
  }

  const addConstraint = () => {
    if (newConstraint.trim()) {
      setFormData(prev => ({
        ...prev,
        constraints: [...prev.constraints, newConstraint.trim()]
      }))
      setNewConstraint('')
    }
  }

  const addCriterion = () => {
    if (newCriterion.trim()) {
      setFormData(prev => ({
        ...prev,
        successCriteria: [...prev.successCriteria, newCriterion.trim()]
      }))
      setNewCriterion('')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit('refine', formData)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Refine Mission</CardTitle>
            <CardDescription>
              Clarify objectives, define requirements, and set success criteria
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Original Mission Display */}
          {data?.originalMission && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium mb-2 block">Original Mission</Label>
              <p className="text-sm text-muted-foreground">{data.originalMission}</p>
            </div>
          )}

          {/* Refined Mission */}
          <div className="space-y-2">
            <Label htmlFor="refinedMission" className="text-sm font-medium">
              Refined Mission Statement
            </Label>
            <Textarea
              id="refinedMission"
              value={formData.refinedMission}
              onChange={(e) => setFormData(prev => ({ ...prev, refinedMission: e.target.value }))}
              placeholder="Provide a detailed, refined version of the mission..."
              rows={3}
              disabled={disabled}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be specific about what you want to accomplish and why
            </p>
          </div>

          {/* Requirements */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Requirements</Label>
            <div className="flex gap-2">
              <Input
                value={newRequirement}
                onChange={(e) => setNewRequirement(e.target.value)}
                placeholder="Add a specific requirement..."
                disabled={disabled}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRequirement())}
              />
              <Button 
                type="button" 
                onClick={addRequirement} 
                disabled={disabled || !newRequirement.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            
            {formData.requirements.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.requirements.map((req, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {req}
                    <button
                      type="button"
                      onClick={() => removeRequirement(index)}
                      disabled={disabled}
                      className="ml-1 hover:text-red-600"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Complexity Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Complexity Level</Label>
            <div className="grid grid-cols-4 gap-2">
              {(['simple', 'moderate', 'complex', 'expert'] as const).map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={formData.complexity === level ? "default" : "outline"}
                  onClick={() => setFormData(prev => ({ ...prev, complexity: level }))}
                  disabled={disabled}
                  className="text-xs"
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Vision Context */}
          <div className="space-y-2">
            <Label htmlFor="visionContext" className="text-sm font-medium">
              Vision & Context <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Textarea
              id="visionContext"
              value={formData.visionContext}
              onChange={(e) => setFormData(prev => ({ ...prev, visionContext: e.target.value }))}
              placeholder="Provide additional context or vision for this mission..."
              rows={2}
              disabled={disabled}
              className="resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              type="submit" 
              disabled={disabled || !formData.refinedMission.trim()}
              className="gap-2"
            >
              {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Continue to Planning
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// PLAN PHASE FORM  
// ============================================================================

function PlanPhaseForm({
  data,
  onSubmit,
  disabled
}: {
  data?: PlanFormData
  onSubmit: (phase: ExpeditionPhase, data: any) => Promise<void>
  disabled: boolean
}) {
  const [userComments, setUserComments] = useState(data?.userComments || '')
  const [requestedChanges, setRequestedChanges] = useState<string[]>(data?.requestedChanges || [])
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected'>(data?.approvalStatus || 'pending')

  const handleApprove = () => {
    onSubmit('plan', { 
      approvalStatus: 'approved',
      userComments: userComments.trim() || undefined
    })
  }

  const handleReject = () => {
    onSubmit('plan', { 
      approvalStatus: 'rejected',
      userComments: userComments.trim() || undefined,
      requestedChanges
    })
  }

  const handleRequestChanges = () => {
    if (requestedChanges.length === 0) {
      // Add default change request
      setRequestedChanges(['Please review and revise the plan'])
    }
    onSubmit('plan', { 
      approvalStatus: 'rejected',
      userComments: userComments.trim() || undefined,
      requestedChanges
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Review Plan</CardTitle>
            <CardDescription>
              Review the generated task breakdown and workflow plan
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Task Breakdown Display */}
        {data?.taskBreakdown && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Task Breakdown ({data.taskBreakdown.length} tasks)
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.taskBreakdown.map((task, index) => (
                <div key={task.id} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h5 className="text-sm font-medium">{index + 1}. {task.description}</h5>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.estimatedTime}m
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {task.assignedAgent || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`
                        text-xs
                        ${task.priority === 'high' ? 'border-red-300 text-red-600' :
                          task.priority === 'medium' ? 'border-yellow-300 text-yellow-600' :
                          'border-green-300 text-green-600'}
                      `}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                  
                  {task.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {task.requiredSkills.map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan Metrics */}
        {data && (
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.floor(data.estimatedDuration / 60)}h {data.estimatedDuration % 60}m
              </div>
              <div className="text-xs text-muted-foreground">Est. Duration</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{data.successProbability}%</div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.qualityScore}%</div>
              <div className="text-xs text-muted-foreground">Quality Score</div>
            </div>
          </div>
        )}

        {/* Workflow Visualization */}
        {data?.workflowVisualization && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Workflow Preview
            </h4>
            <div className="p-4 bg-muted/30 rounded-lg">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {data.workflowVisualization}
              </pre>
            </div>
          </div>
        )}

        <Separator />

        {/* User Comments */}
        <div className="space-y-2">
          <Label htmlFor="userComments" className="text-sm font-medium">
            Comments & Feedback <span className="text-muted-foreground">(Optional)</span>
          </Label>
          <Textarea
            id="userComments"
            value={userComments}
            onChange={(e) => setUserComments(e.target.value)}
            placeholder="Add any comments or feedback about the plan..."
            rows={3}
            disabled={disabled}
            className="resize-none"
          />
        </div>

        {/* Plan Status Display */}
        {approvalStatus !== 'pending' && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            approvalStatus === 'approved' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {approvalStatus === 'approved' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <div>
              <h4 className={`font-medium ${approvalStatus === 'approved' ? 'text-green-800' : 'text-red-800'}`}>
                Plan {approvalStatus === 'approved' ? 'Approved' : 'Rejected'}
              </h4>
              <p className={`text-sm ${approvalStatus === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                {approvalStatus === 'approved' 
                  ? 'The plan has been approved and is ready for execution'
                  : 'The plan needs revisions before execution can begin'
                }
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {approvalStatus === 'pending' && (
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              variant="outline"
              onClick={handleRequestChanges}
              disabled={disabled}
              className="gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Request Changes
            </Button>
            <Button 
              variant="outline"
              onClick={handleReject}
              disabled={disabled}
              className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              <ThumbsDown className="w-4 h-4" />
              Reject Plan
            </Button>
            <Button 
              onClick={handleApprove}
              disabled={disabled}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Approve Plan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// EXECUTE PHASE FORM
// ============================================================================

function ExecutePhaseForm({
  data,
  onSubmit,
  disabled
}: {
  data?: ExecuteFormData
  onSubmit: (phase: ExpeditionPhase, data: any) => Promise<void>
  disabled: boolean
}) {
  const handleStart = () => onSubmit('execute', { action: 'start' })
  const handlePause = () => onSubmit('execute', { action: 'pause' })  
  const handleResume = () => onSubmit('execute', { action: 'resume' })
  const handleStop = () => onSubmit('execute', { action: 'stop' })

  const progress = data?.progress || 0
  const completedTasks = data?.completedTasks || []
  const failedTasks = data?.failedTasks || []
  const errors = data?.runtimeErrors || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 text-green-600">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Execute Workflow</CardTitle>
            <CardDescription>
              Monitor workflow execution and control the process
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Execution Status */}
        <div className="p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">Execution Progress</h4>
            <span className="text-2xl font-bold text-green-600">{progress}%</span>
          </div>
          
          <div className="w-full bg-muted rounded-full h-3 mb-4">
            <motion.div 
              className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-green-600">{completedTasks.length}</div>
              <div className="text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-red-600">{failedTasks.length}</div>
              <div className="text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-blue-600">
                {data?.estimatedTimeRemaining ? `${Math.floor(data.estimatedTimeRemaining / 60)}h ${data.estimatedTimeRemaining % 60}m` : 'N/A'}
              </div>
              <div className="text-muted-foreground">ETA</div>
            </div>
          </div>
        </div>

        {/* Current Task */}
        {data?.currentTask && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Settings className="w-5 h-5 text-blue-600 animate-spin" />
            <div>
              <h5 className="font-medium text-blue-800">Currently Executing</h5>
              <p className="text-sm text-blue-700">{data.currentTask}</p>
            </div>
          </div>
        )}

        {/* Runtime Errors */}
        {errors.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" />
              Runtime Issues ({errors.length})
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {errors.map((error, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                  <p className="text-red-700">{error}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Control Actions */}
        <div className="flex justify-center gap-3 pt-4 border-t">
          {!data?.currentTask && (
            <Button 
              onClick={handleStart}
              disabled={disabled}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Execution
            </Button>
          )}
          
          {data?.canPause && (
            <Button 
              variant="outline"
              onClick={handlePause}
              disabled={disabled}
              className="gap-2"
            >
              <Pause className="w-4 h-4" />
              Pause
            </Button>
          )}
          
          {data?.canResume && (
            <Button 
              onClick={handleResume}
              disabled={disabled}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Play className="w-4 h-4" />
              Resume
            </Button>
          )}
          
          <Button 
            variant="outline"
            onClick={handleStop}
            disabled={disabled}
            className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
          >
            <RotateCcw className="w-4 h-4" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// RESULT PHASE FORM
// ============================================================================

function ResultPhaseForm({
  data,
  onSubmit,
  disabled
}: {
  data?: ResultPhaseData
  onSubmit: (phase: ExpeditionPhase, data: any) => Promise<void>
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Expedition Complete</CardTitle>
            <CardDescription>
              Review results and expedition summary
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Quality Metrics */}
        {data?.qualityMetrics && (
          <div>
            <h4 className="font-medium mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Quality Assessment
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(data.qualityMetrics).map(([metric, value]) => (
                <div key={metric} className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">{value}%</div>
                  <div className="text-xs text-muted-foreground capitalize">{metric}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Output */}
        {data?.finalOutput && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Final Output
            </h4>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{data.finalOutput}</p>
            </div>
          </div>
        )}

        {/* Execution Summary */}
        {data?.executionSummary && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Execution Summary
            </h4>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">{data.executionSummary}</p>
            </div>
          </div>
        )}

        {/* Recommended Next Steps */}
        {data?.recommendedNextSteps && data.recommendedNextSteps.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              Recommended Next Steps
            </h4>
            <div className="space-y-2">
              {data.recommendedNextSteps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <p className="text-sm text-green-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated Artifacts */}
        {data?.artifactsGenerated && data.artifactsGenerated.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Generated Artifacts ({data.artifactsGenerated.length})
            </h4>
            <div className="space-y-2">
              {data.artifactsGenerated.map((artifact, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{artifact.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {artifact.type} • {(artifact.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <a href={artifact.downloadUrl} download>
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completion Actions */}
        <div className="flex justify-center pt-4 border-t">
          <Button 
            onClick={() => onSubmit('result', { action: 'complete' })}
            disabled={disabled}
            className="gap-2 bg-amber-600 hover:bg-amber-700"
          >
            {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark Complete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default FourPhaseForms