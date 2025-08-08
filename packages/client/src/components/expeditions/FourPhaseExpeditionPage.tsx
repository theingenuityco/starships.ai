'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  RefreshCw,
  MessageSquare,
  Share2,
  MoreVertical,
  Eye,
  Download,
  Settings,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Clock,
  Play,
  Pause,
  Square
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Import our custom components
import FourPhaseProgress from './FourPhaseProgress'
import FourPhaseForms from './FourPhaseForms'
import FourPhaseStatusDisplay from './FourPhaseStatusDisplay'
import PlanApprovalInterface from './PlanApprovalInterface'
import ExecutionMonitoringDashboard from './ExecutionMonitoringDashboard'

import type { ExpeditionPhase, ExpeditionStatus } from '@starships/protocol'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface FourPhaseExpeditionPageProps {
  expeditionId: string
  starshipId: string
  starshipSlug: string
  onNavigateBack?: () => void
  onOpenChat?: () => void
  className?: string
}

interface ExpeditionData {
  id: string
  name: string
  currentPhase: ExpeditionPhase
  currentStatus: ExpeditionStatus
  createdAt: string
  updatedAt: string
  createdBy: string
  originalMission: string
  
  // Phase-specific data
  refineData?: {
    refinedMission: string
    requirements: string[]
    complexity: 'simple' | 'moderate' | 'complex' | 'expert'
    visionContext?: string
    estimatedDuration: number
  }
  
  planData?: {
    expeditionName: string
    refinedMission: string
    taskBreakdown: any[]
    workflowVisualization: string
    agentAssignments: Record<string, string[]>
    metrics: {
      estimatedDuration: number
      successProbability: number
      qualityScore: number
      complexity: string
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
  
  executeData?: {
    expeditionName: string
    phase: 'execute'
    status: 'executing' | 'paused' | 'completed' | 'failed'
    progress: number
    startTime: string
    currentTask?: any
    completedTasks: any[]
    failedTasks: any[]
    pendingTasks: any[]
    activeAgents: any[]
    metrics: any
    recentEvents: any[]
    workflowStats: any
    lastUpdate: string
  }
  
  resultData?: {
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
    artifactsGenerated: any[]
  }
  
  // Real-time status
  realtimeStatus?: {
    isConnected: boolean
    lastUpdate: string
    activeConnections: number
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FourPhaseExpeditionPage({
  expeditionId,
  starshipId,
  starshipSlug,
  onNavigateBack,
  onOpenChat,
  className = ''
}: FourPhaseExpeditionPageProps) {
  const [expeditionData, setExpeditionData] = useState<ExpeditionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Load expedition data
  const loadExpeditionData = async () => {
    try {
      // Mock data for now - replace with actual API call
      const mockData: ExpeditionData = {
        id: expeditionId,
        name: 'Market Research Deep Dive',
        currentPhase: 'plan' as ExpeditionPhase,
        currentStatus: 'planning' as ExpeditionStatus,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        createdBy: 'user-123',
        originalMission: 'Conduct comprehensive market research on AI productivity tools',
        
        refineData: {
          refinedMission: 'Conduct comprehensive market research on AI productivity tools, focusing on competitive landscape, pricing strategies, and user adoption patterns in the enterprise segment',
          requirements: [
            'Analyze top 10 competitors',
            'Identify pricing models',
            'Survey user adoption trends',
            'Assess market opportunities'
          ],
          complexity: 'moderate' as const,
          visionContext: 'This research will inform our product strategy for Q2',
          estimatedDuration: 180
        },
        
        planData: {
          expeditionName: 'Market Research Deep Dive',
          refinedMission: 'Conduct comprehensive market research on AI productivity tools, focusing on competitive landscape, pricing strategies, and user adoption patterns in the enterprise segment',
          taskBreakdown: [
            {
              id: 'task-1',
              description: 'Research competitor landscape and feature analysis',
              estimatedTime: 45,
              requiredSkills: ['research', 'analysis'],
              assignedAgent: 'agent-research',
              agentName: 'Research Agent',
              priority: 'high',
              dependencies: [],
              deliverable: 'Competitive analysis report'
            },
            {
              id: 'task-2', 
              description: 'Analyze pricing models and market positioning',
              estimatedTime: 60,
              requiredSkills: ['analysis', 'market-research'],
              assignedAgent: 'agent-analyst',
              agentName: 'Market Analyst',
              priority: 'high',
              dependencies: ['task-1'],
              deliverable: 'Pricing strategy analysis'
            },
            {
              id: 'task-3',
              description: 'Survey user adoption patterns and trends',
              estimatedTime: 75,
              requiredSkills: ['survey', 'data-analysis'],
              assignedAgent: 'agent-data',
              agentName: 'Data Agent',
              priority: 'medium',
              dependencies: [],
              deliverable: 'User adoption trend report'
            }
          ],
          workflowVisualization: `Workflow Execution Flow:

1. Research competitor landscape and feature analysis
   Dependencies: []

2. Analyze pricing models and market positioning  
   Dependencies: Research competitor landscape and feature analysis

3. Survey user adoption patterns and trends
   Dependencies: []

4. Compile comprehensive market research report
   Dependencies: Analyze pricing models and market positioning, Survey user adoption patterns and trends`,
          agentAssignments: {
            'agent-research': ['task-1'],
            'agent-analyst': ['task-2'],
            'agent-data': ['task-3']
          },
          metrics: {
            estimatedDuration: 180,
            successProbability: 87,
            qualityScore: 92,
            complexity: 'moderate',
            riskAssessment: {
              overallRisk: 'low' as const,
              riskFactors: [
                'Data availability might be limited for newer competitors',
                'User survey response rates could be lower than expected'
              ],
              mitigationStrategies: [
                'Use multiple data sources for competitor analysis',
                'Implement incentives for survey participation',
                'Prepare alternative research methodologies'
              ]
            }
          },
          dependencies: {
            'task-1': [],
            'task-2': ['task-1'],
            'task-3': []
          },
          generatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          lastModified: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        },
        
        realtimeStatus: {
          isConnected: true,
          lastUpdate: new Date().toISOString(),
          activeConnections: 3
        }
      }
      
      setExpeditionData(mockData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expedition data')
    }
  }

  // Initial load
  useEffect(() => {
    const initialLoad = async () => {
      setIsLoading(true)
      await loadExpeditionData()
      setIsLoading(false)
    }
    
    initialLoad()
  }, [expeditionId])

  // Refresh data
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadExpeditionData()
    setIsRefreshing(false)
  }

  // Handle phase actions
  const handlePhaseAction = async (action: any) => {
    console.log('Phase action:', action)
    
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Update expedition data
    await loadExpeditionData()
  }

  // Handle plan approval actions
  const handlePlanApproval = async (comments?: string) => {
    console.log('Plan approved:', comments)
    
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Update status to approved and ready for execution
    if (expeditionData) {
      setExpeditionData(prev => prev ? {
        ...prev,
        currentPhase: 'execute' as ExpeditionPhase,
        currentStatus: 'planning' as ExpeditionStatus
      } : null)
    }
  }

  const handlePlanRejection = async (comments: string, requestedChanges: string[]) => {
    console.log('Plan rejected:', comments, requestedChanges)
    
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Handle rejection logic
    await loadExpeditionData()
  }

  const handlePlanChanges = async (comments: string, requestedChanges: string[]) => {
    console.log('Plan changes requested:', comments, requestedChanges)
    
    // Mock API call  
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Handle change request logic
    await loadExpeditionData()
  }

  // Handle execution control
  const handleExecutionControl = async (action: any) => {
    console.log('Execution control:', action)
    
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Update execution data
    await loadExpeditionData()
  }

  // Handle status changes
  const handleStatusChange = (newStatus: any) => {
    console.log('Status changed:', newStatus)
    // Handle real-time status updates
  }

  // Get phase-specific data for forms
  const getPhaseFormData = () => {
    if (!expeditionData) return undefined
    
    switch (expeditionData.currentPhase) {
      case 'refine':
        return {
          refine: expeditionData.refineData ? {
            originalMission: expeditionData.originalMission,
            refinedMission: expeditionData.refineData.refinedMission,
            requirements: expeditionData.refineData.requirements,
            complexity: expeditionData.refineData.complexity,
            visionContext: expeditionData.refineData.visionContext,
            constraints: [],
            successCriteria: []
          } : undefined
        }
      case 'plan':
        return {
          plan: expeditionData.planData ? {
            ...expeditionData.planData,
            approvalStatus: 'pending' as const,
            userComments: '',
            requestedChanges: []
          } : undefined
        }
      case 'execute':
        return {
          execute: expeditionData.executeData ? {
            progress: expeditionData.executeData.progress,
            currentTask: expeditionData.executeData.currentTask?.description,
            completedTasks: expeditionData.executeData.completedTasks.map(t => t.id),
            failedTasks: expeditionData.executeData.failedTasks.map(t => t.id),
            runtimeErrors: [],
            estimatedTimeRemaining: expeditionData.executeData.metrics?.estimatedTimeRemaining || 0,
            canPause: expeditionData.executeData.status === 'executing',
            canResume: expeditionData.executeData.status === 'paused'
          } : undefined
        }
      case 'result':
        return {
          result: expeditionData.resultData
        }
      default:
        return undefined
    }
  }

  // Get phase-specific progress data
  const getPhaseProgressData = () => {
    if (!expeditionData) return undefined
    
    return {
      refine: expeditionData.refineData ? {
        originalMission: expeditionData.originalMission,
        refinedMission: expeditionData.refineData.refinedMission,
        requirements: expeditionData.refineData.requirements,
        complexity: expeditionData.refineData.complexity,
        estimatedDuration: expeditionData.refineData.estimatedDuration,
        lastUpdate: expeditionData.updatedAt
      } : undefined,
      plan: expeditionData.planData ? {
        taskBreakdown: expeditionData.planData.taskBreakdown,
        workflowVisualization: expeditionData.planData.workflowVisualization,
        approvalStatus: 'pending' as const,
        estimatedSuccess: expeditionData.planData.metrics.successProbability,
        qualityScore: expeditionData.planData.metrics.qualityScore,
        lastUpdate: expeditionData.planData.lastModified
      } : undefined,
      execute: expeditionData.executeData ? {
        progress: expeditionData.executeData.progress,
        currentTask: expeditionData.executeData.currentTask?.description,
        completedTasks: expeditionData.executeData.completedTasks.length,
        totalTasks: expeditionData.executeData.completedTasks.length + expeditionData.executeData.pendingTasks.length,
        runtimeErrors: [],
        estimatedTimeRemaining: expeditionData.executeData.metrics?.estimatedTimeRemaining || 0,
        lastUpdate: expeditionData.executeData.lastUpdate
      } : undefined,
      result: expeditionData.resultData ? {
        finalOutput: expeditionData.resultData.finalOutput,
        qualityMetrics: expeditionData.resultData.qualityMetrics,
        executionSummary: expeditionData.resultData.executionSummary,
        recommendedNextSteps: expeditionData.resultData.recommendedNextSteps,
        lastUpdate: expeditionData.updatedAt
      } : undefined
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading 4-phase expedition...</span>
        </div>
      </div>
    )
  }

  if (error || !expeditionData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Failed to Load Expedition</h3>
          <p className="text-red-600 mb-4">{error || 'Expedition not found'}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onNavigateBack && (
            <Button variant="outline" size="sm" onClick={onNavigateBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          
          <div>
            <h1 className="text-2xl font-bold">{expeditionData.name}</h1>
            <p className="text-muted-foreground">
              Created {formatDistanceToNow(new Date(expeditionData.createdAt), { addSuffix: true })} • 
              {expeditionData.currentPhase.charAt(0).toUpperCase() + expeditionData.currentPhase.slice(1)} Phase
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenChat && (
            <Button size="sm" variant="outline" onClick={onOpenChat}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Open Chat
            </Button>
          )}
          
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button size="sm" variant="outline">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Progress Overview */}
      <FourPhaseProgress
        expeditionId={expeditionId}
        starshipId={starshipId}
        currentPhase={expeditionData.currentPhase}
        currentStatus={expeditionData.currentStatus}
        phaseData={getPhaseProgressData()}
        onPhaseAction={handlePhaseAction}
        enableActions={true}
        showDetails={true}
        variant="detailed"
      />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="phase-detail">
            {expeditionData.currentPhase.charAt(0).toUpperCase() + expeditionData.currentPhase.slice(1)} Details
          </TabsTrigger>
          <TabsTrigger value="status">Real-time Status</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mission Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Mission Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">Original Mission</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                    {expeditionData.originalMission}
                  </p>
                </div>
                
                {expeditionData.refineData?.refinedMission && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Refined Mission</h4>
                    <p className="text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
                      {expeditionData.refineData.refinedMission}
                    </p>
                  </div>
                )}
                
                {expeditionData.refineData?.requirements && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Key Requirements</h4>
                    <div className="flex flex-wrap gap-2">
                      {expeditionData.refineData.requirements.map((req, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {req}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Phase Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Phase Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className={`p-3 rounded-lg ${expeditionData.currentPhase === 'refine' ? 'bg-blue-100 border border-blue-200' : 'bg-muted/30'}`}>
                    <div className={`text-sm font-medium ${expeditionData.currentPhase === 'refine' ? 'text-blue-800' : 'text-muted-foreground'}`}>
                      Refine
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {expeditionData.refineData ? 'Completed' : 'Pending'}
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${expeditionData.currentPhase === 'plan' ? 'bg-purple-100 border border-purple-200' : 'bg-muted/30'}`}>
                    <div className={`text-sm font-medium ${expeditionData.currentPhase === 'plan' ? 'text-purple-800' : 'text-muted-foreground'}`}>
                      Plan
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {expeditionData.planData ? 'In Review' : 'Pending'}
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${expeditionData.currentPhase === 'execute' ? 'bg-green-100 border border-green-200' : 'bg-muted/30'}`}>
                    <div className={`text-sm font-medium ${expeditionData.currentPhase === 'execute' ? 'text-green-800' : 'text-muted-foreground'}`}>
                      Execute
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {expeditionData.executeData ? 'Running' : 'Pending'}
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${expeditionData.currentPhase === 'result' ? 'bg-amber-100 border border-amber-200' : 'bg-muted/30'}`}>
                    <div className={`text-sm font-medium ${expeditionData.currentPhase === 'result' ? 'text-amber-800' : 'text-muted-foreground'}`}>
                      Result
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {expeditionData.resultData ? 'Complete' : 'Pending'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Phase Detail Tab */}
        <TabsContent value="phase-detail" className="space-y-6">
          {expeditionData.currentPhase === 'plan' && expeditionData.planData ? (
            <PlanApprovalInterface
              expeditionId={expeditionId}
              starshipId={starshipId}
              planData={expeditionData.planData}
              onApprove={handlePlanApproval}
              onReject={handlePlanRejection}
              onRequestChanges={handlePlanChanges}
            />
          ) : expeditionData.currentPhase === 'execute' && expeditionData.executeData ? (
            <ExecutionMonitoringDashboard
              expeditionId={expeditionId}
              starshipId={starshipId}
              executionData={expeditionData.executeData}
              onControlAction={handleExecutionControl}
              onOpenChat={onOpenChat}
              isRealtime={true}
              autoRefresh={true}
            />
          ) : (
            <FourPhaseForms
              expeditionId={expeditionId}
              starshipId={starshipId}
              currentPhase={expeditionData.currentPhase}
              phaseData={getPhaseFormData()}
              onSubmit={handlePhaseAction}
            />
          )}
        </TabsContent>

        {/* Real-time Status Tab */}
        <TabsContent value="status" className="space-y-6">
          <FourPhaseStatusDisplay
            expeditionId={expeditionId}
            starshipId={starshipId}
            currentPhase={expeditionData.currentPhase}
            currentStatus={expeditionData.currentStatus}
            enableWebSocket={true}
            onStatusChange={handleStatusChange}
            variant="dashboard"
            showControls={true}
          />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Expedition Timeline</CardTitle>
              <p className="text-sm text-muted-foreground">
                Track the progression through each phase
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-sm">Expedition Created</h5>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(expeditionData.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                
                {expeditionData.refineData && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-sm">Mission Refined</h5>
                      <p className="text-xs text-muted-foreground">
                        Clarified objectives and requirements
                      </p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                )}
                
                {expeditionData.planData && (
                  <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">
                      3
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-sm">Plan Generated</h5>
                      <p className="text-xs text-muted-foreground">
                        {expeditionData.planData.taskBreakdown.length} tasks, {expeditionData.planData.metrics.successProbability}% success probability
                      </p>
                    </div>
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default FourPhaseExpeditionPage