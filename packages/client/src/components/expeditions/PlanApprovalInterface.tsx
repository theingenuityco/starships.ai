'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Target,
  Users,
  FileText,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  MessageSquare,
  Sparkles,
  TrendingUp,
  BarChart3,
  Settings,
  Zap,
  Play,
  Loader2,
  Info,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Workflow
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface PlanApprovalInterfaceProps {
  expeditionId: string
  starshipId: string
  planData: PlanData
  onApprove: (comments?: string) => Promise<void>
  onReject: (comments: string, requestedChanges: string[]) => Promise<void>
  onRequestChanges: (comments: string, requestedChanges: string[]) => Promise<void>
  className?: string
  disabled?: boolean
}

interface PlanData {
  expeditionName: string
  refinedMission: string
  taskBreakdown: TaskBreakdownItem[]
  workflowVisualization: string
  agentAssignments: Record<string, string[]>
  metrics: {
    estimatedDuration: number
    successProbability: number
    qualityScore: number
    complexity: 'simple' | 'moderate' | 'complex' | 'expert'
    riskAssessment: {
      overallRisk: 'low' | 'medium' | 'high'
      riskFactors: string[]
      mitigationStrategies: string[]
    }
  }
  dependencies: Record<string, string[]>
  generatedAt: string
  lastModified: string
}

interface TaskBreakdownItem {
  id: string
  description: string
  estimatedTime: number
  requiredSkills: string[]
  assignedAgent?: string
  agentName?: string
  priority: 'low' | 'medium' | 'high'
  dependencies: string[]
  acceptanceCriteria?: string
  deliverable?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PlanApprovalInterface({
  expeditionId,
  starshipId,
  planData,
  onApprove,
  onReject,
  onRequestChanges,
  className = '',
  disabled = false
}: PlanApprovalInterfaceProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [userComments, setUserComments] = useState('')
  const [requestedChanges, setRequestedChanges] = useState<string[]>([])
  const [newChangeRequest, setNewChangeRequest] = useState('')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false)

  // Handle approval action
  const handleApprove = async () => {
    if (isLoading || disabled) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onApprove(userComments.trim() || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve plan')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle rejection action
  const handleReject = async () => {
    if (isLoading || disabled) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onReject(userComments.trim() || 'Plan rejected by user', requestedChanges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject plan')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle request changes action
  const handleRequestChanges = async () => {
    if (isLoading || disabled || requestedChanges.length === 0) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onRequestChanges(userComments.trim() || 'Changes requested by user', requestedChanges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request changes')
    } finally {
      setIsLoading(false)
    }
  }

  // Add change request
  const addChangeRequest = () => {
    if (newChangeRequest.trim() && !requestedChanges.includes(newChangeRequest.trim())) {
      setRequestedChanges(prev => [...prev, newChangeRequest.trim()])
      setNewChangeRequest('')
    }
  }

  // Remove change request
  const removeChangeRequest = (index: number) => {
    setRequestedChanges(prev => prev.filter((_, i) => i !== index))
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

  // Get task priority styling
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-300 text-red-600 bg-red-50'
      case 'medium':
        return 'border-yellow-300 text-yellow-600 bg-yellow-50'
      case 'low':
        return 'border-green-300 text-green-600 bg-green-50'
      default:
        return 'border-gray-300 text-gray-600 bg-gray-50'
    }
  }

  // Get risk level styling
  const getRiskStyle = (risk: string) => {
    switch (risk) {
      case 'high':
        return 'text-red-600 bg-red-100'
      case 'medium':
        return 'text-yellow-600 bg-yellow-100'
      case 'low':
        return 'text-green-600 bg-green-100'
      default:
        return 'text-gray-600 bg-gray-100'
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
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <h4 className="font-medium text-red-800">Action Failed</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Plan Review: {planData.expeditionName}
                  <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
                    Pending Approval
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Generated {formatDistanceToNow(new Date(planData.generatedAt), { addSuffix: true })}
                  {planData.lastModified !== planData.generatedAt && (
                    <span> • Modified {formatDistanceToNow(new Date(planData.lastModified), { addSuffix: true })}</span>
                  )}
                </CardDescription>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-blue-600">{planData.taskBreakdown.length}</div>
                <div className="text-xs text-muted-foreground">Tasks</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-green-600">{planData.metrics.successProbability}%</div>
                <div className="text-xs text-muted-foreground">Success</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-purple-600">
                  {Math.floor(planData.metrics.estimatedDuration / 60)}h {planData.metrics.estimatedDuration % 60}m
                </div>
                <div className="text-xs text-muted-foreground">Duration</div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {/* Refined Mission */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Refined Mission
              </h4>
              <p className="text-sm text-muted-foreground">{planData.refinedMission}</p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-blue-600">{planData.metrics.qualityScore}%</div>
                <div className="text-xs text-muted-foreground">Quality Score</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className={`text-xl font-bold ${getRiskStyle(planData.metrics.riskAssessment.overallRisk).split(' ')[0]}`}>
                  {planData.metrics.riskAssessment.overallRisk.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">Risk Level</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-amber-600 capitalize">{planData.metrics.complexity}</div>
                <div className="text-xs text-muted-foreground">Complexity</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-xl font-bold text-gray-600">{Object.keys(planData.agentAssignments).length}</div>
                <div className="text-xs text-muted-foreground">Agents</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Details Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Plan Details
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-6 pt-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tasks">Tasks ({planData.taskBreakdown.length})</TabsTrigger>
                <TabsTrigger value="workflow">Workflow</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 pt-4">
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Agent Assignments */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Agent Assignments
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(planData.agentAssignments).map(([agentId, taskIds]) => {
                        const assignedTasks = planData.taskBreakdown.filter(task => taskIds.includes(task.id))
                        return (
                          <div key={agentId} className="p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">
                                {assignedTasks[0]?.agentName || `Agent ${agentId}`}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {taskIds.length} task{taskIds.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Est. time: {assignedTasks.reduce((sum, task) => sum + task.estimatedTime, 0)}m
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Success Factors */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Success Factors
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Task Distribution</span>
                        <Progress value={85} className="w-20 h-2" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Agent Availability</span>
                        <Progress value={92} className="w-20 h-2" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Resource Allocation</span>
                        <Progress value={78} className="w-20 h-2" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Time Estimation</span>
                        <Progress value={planData.metrics.qualityScore} className="w-20 h-2" />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-4">
                <div className="space-y-3">
                  {planData.taskBreakdown.map((task, index) => {
                    const isExpanded = expandedTasks.has(task.id)
                    const dependencies = task.dependencies.length > 0 
                      ? planData.taskBreakdown.filter(t => task.dependencies.includes(t.id))
                      : []

                    return (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border rounded-lg"
                      >
                        <div 
                          className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleTaskExpansion(task.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="flex items-center gap-2 mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium text-muted-foreground">
                                  {index + 1}
                                </span>
                              </div>
                              
                              <div className="flex-1">
                                <h5 className="font-medium text-sm mb-2">{task.description}</h5>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {task.estimatedTime}m
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {task.agentName || task.assignedAgent || 'Unassigned'}
                                  </span>
                                  {dependencies.length > 0 && (
                                    <span className="flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" />
                                      {dependencies.length} dep{dependencies.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getPriorityStyle(task.priority)}`}
                            >
                              {task.priority}
                            </Badge>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t bg-muted/20"
                            >
                              <div className="p-4 space-y-3">
                                {/* Required Skills */}
                                {task.requiredSkills.length > 0 && (
                                  <div>
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Required Skills</h6>
                                    <div className="flex flex-wrap gap-1">
                                      {task.requiredSkills.map((skill, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                          {skill}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Dependencies */}
                                {dependencies.length > 0 && (
                                  <div>
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Dependencies</h6>
                                    <div className="space-y-1">
                                      {dependencies.map((dep) => (
                                        <div key={dep.id} className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                                          {dep.description}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Deliverable */}
                                {task.deliverable && (
                                  <div>
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Expected Deliverable</h6>
                                    <p className="text-xs text-muted-foreground">{task.deliverable}</p>
                                  </div>
                                )}

                                {/* Acceptance Criteria */}
                                {task.acceptanceCriteria && (
                                  <div>
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Acceptance Criteria</h6>
                                    <p className="text-xs text-muted-foreground">{task.acceptanceCriteria}</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>
              </TabsContent>

              {/* Workflow Tab */}
              <TabsContent value="workflow" className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Workflow className="w-4 h-4" />
                    Execution Workflow
                  </h4>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showWorkflowDetails}
                      onCheckedChange={setShowWorkflowDetails}
                      id="workflow-details"
                    />
                    <Label htmlFor="workflow-details" className="text-sm">Show Details</Label>
                  </div>
                </div>

                <div className="p-4 bg-muted/20 rounded-lg">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                    {planData.workflowVisualization}
                  </pre>
                </div>

                {showWorkflowDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3"
                  >
                    <h5 className="font-medium text-sm">Execution Flow</h5>
                    <div className="space-y-2">
                      {planData.taskBreakdown.map((task, index) => (
                        <div key={task.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded text-sm">
                          <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium">{task.description}</span>
                            <span className="text-muted-foreground ml-2">({task.estimatedTime}m)</span>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </TabsContent>

              {/* Risks Tab */}
              <TabsContent value="risks" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Risk Assessment */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Risk Assessment
                    </h4>
                    
                    <div className={`p-4 rounded-lg mb-4 ${getRiskStyle(planData.metrics.riskAssessment.overallRisk)}`}>
                      <div className="font-medium text-sm">
                        Overall Risk: {planData.metrics.riskAssessment.overallRisk.toUpperCase()}
                      </div>
                    </div>

                    {planData.metrics.riskAssessment.riskFactors.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Risk Factors</h5>
                        <div className="space-y-1">
                          {planData.metrics.riskAssessment.riskFactors.map((factor, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <span>{factor}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mitigation Strategies */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Mitigation Strategies
                    </h4>
                    
                    {planData.metrics.riskAssessment.mitigationStrategies.length > 0 ? (
                      <div className="space-y-2">
                        {planData.metrics.riskAssessment.mitigationStrategies.map((strategy, index) => (
                          <div key={index} className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-green-700">{strategy}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/30 rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">No specific mitigation strategies identified.</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Comments and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Your Review
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* User Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments" className="text-sm font-medium">
              Comments & Feedback <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Textarea
              id="comments"
              value={userComments}
              onChange={(e) => setUserComments(e.target.value)}
              placeholder="Add any comments or feedback about the plan..."
              rows={3}
              disabled={disabled || isLoading}
              className="resize-none"
              maxLength={500}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Your feedback will be included in the decision record</span>
              <span>{userComments.length}/500</span>
            </div>
          </div>

          {/* Change Requests */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Requested Changes</Label>
            
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={newChangeRequest}
                  onChange={(e) => setNewChangeRequest(e.target.value)}
                  placeholder="Describe a specific change you'd like to see..."
                  disabled={disabled || isLoading}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addChangeRequest())}
                />
              </div>
              <Button 
                size="sm" 
                onClick={addChangeRequest}
                disabled={disabled || isLoading || !newChangeRequest.trim()}
                variant="outline"
              >
                Add
              </Button>
            </div>

            {requestedChanges.length > 0 && (
              <div className="space-y-2">
                {requestedChanges.map((change, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <span className="text-sm text-yellow-800">{change}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeChangeRequest(index)}
                      disabled={disabled || isLoading}
                      className="h-6 w-6 p-0 text-yellow-600 hover:text-yellow-800"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleRequestChanges}
              disabled={disabled || isLoading || requestedChanges.length === 0}
              className="gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Request Changes ({requestedChanges.length})
            </Button>
            
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={disabled || isLoading}
              className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              <ThumbsDown className="w-4 h-4" />
              Reject Plan
            </Button>
            
            <Button
              onClick={handleApprove}
              disabled={disabled || isLoading}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ThumbsUp className="w-4 h-4" />
              )}
              Approve & Execute
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default PlanApprovalInterface