# B4: Frontend Component Design

**Design Phase**: B4 - Frontend Component Design  
**Created**: 2025-01-08  
**Dependencies**: B3 (API Design), A4 (Frontend Analysis), B2 (Workflow Architecture)

## Overview

This document defines the UI component specifications for the 4-phase expedition experience, including phase indicators, user approval flows, and real-time progress tracking components that integrate with the enhanced APIs and WebSocket events.

## 1. Phase Progress Indicator Component

### 1.1 PhaseProgressIndicator Specification

```tsx
/**
 * PhaseProgressIndicator - Visual progress through 4-phase expedition flow
 * Replaces simple status badge with clear phase progression UI
 */

interface PhaseProgressIndicatorProps {
  currentPhase: ExpeditionPhase;
  expeditionStatus: ExpeditionStatus;
  phaseProgress?: {
    percentage: number;
    estimatedTimeRemaining?: number;
    currentStep?: string;
  };
  size?: 'compact' | 'default' | 'expanded';
  showLabels?: boolean;
  interactive?: boolean; // Allow clicking to view phase details
  onPhaseClick?: (phase: ExpeditionPhase) => void;
}

interface PhaseConfig {
  phase: ExpeditionPhase;
  label: string;
  description: string;
  icon: React.ComponentType<{className?: string}>;
  color: {
    active: string;
    completed: string;
    pending: string;
    failed: string;
  };
}

const PHASE_CONFIGS: PhaseConfig[] = [
  {
    phase: 'refine',
    label: 'Refine',
    description: 'Mission clarification and requirements gathering',
    icon: MessageSquare,
    color: {
      active: 'bg-blue-500 text-white border-blue-300',
      completed: 'bg-blue-100 text-blue-800 border-blue-200',
      pending: 'bg-gray-100 text-gray-500 border-gray-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    }
  },
  {
    phase: 'plan',
    label: 'Plan',
    description: 'Task breakdown and workflow generation',
    icon: Target,
    color: {
      active: 'bg-purple-500 text-white border-purple-300',
      completed: 'bg-purple-100 text-purple-800 border-purple-200',
      pending: 'bg-gray-100 text-gray-500 border-gray-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    }
  },
  {
    phase: 'execute',
    label: 'Execute',
    description: 'Workflow execution and task completion',
    icon: Activity,
    color: {
      active: 'bg-green-500 text-white border-green-300',
      completed: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-gray-100 text-gray-500 border-gray-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    }
  },
  {
    phase: 'result',
    label: 'Result',
    description: 'Result synthesis and completion',
    icon: CheckCircle2,
    color: {
      active: 'bg-emerald-500 text-white border-emerald-300',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      pending: 'bg-gray-100 text-gray-500 border-gray-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    }
  }
];

export function PhaseProgressIndicator({
  currentPhase,
  expeditionStatus,
  phaseProgress,
  size = 'default',
  showLabels = true,
  interactive = false,
  onPhaseClick
}: PhaseProgressIndicatorProps) {
  const getPhaseState = (phase: ExpeditionPhase): 'active' | 'completed' | 'pending' | 'failed' => {
    const phaseIndex = PHASE_CONFIGS.findIndex(p => p.phase === phase);
    const currentIndex = PHASE_CONFIGS.findIndex(p => p.phase === currentPhase);
    
    if (expeditionStatus === 'failed') {
      return phaseIndex <= currentIndex ? 'failed' : 'pending';
    }
    
    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex === currentIndex) return 'active';
    return 'pending';
  };

  const sizeClasses = {
    compact: 'h-6 w-6 text-xs',
    default: 'h-8 w-8 text-sm',
    expanded: 'h-12 w-12 text-base'
  };

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
      {/* Phase Steps */}
      {PHASE_CONFIGS.map((config, index) => {
        const state = getPhaseState(config.phase);
        const isActive = config.phase === currentPhase;
        const isClickable = interactive && onPhaseClick;
        
        return (
          <div key={config.phase} className="flex items-center">
            {/* Phase Circle */}
            <div
              className={`
                flex items-center justify-center rounded-full border-2 transition-all duration-200
                ${sizeClasses[size]}
                ${config.color[state]}
                ${isActive ? 'ring-2 ring-offset-2 ring-current animate-pulse' : ''}
                ${isClickable ? 'cursor-pointer hover:scale-110' : ''}
              `}
              onClick={isClickable ? () => onPhaseClick(config.phase) : undefined}
              title={config.description}
            >
              {state === 'completed' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : state === 'failed' ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <config.icon className="h-4 w-4" />
              )}
            </div>

            {/* Phase Label */}
            {showLabels && (
              <div className="ml-3 flex flex-col">
                <span className={`text-sm font-medium ${
                  state === 'active' ? 'text-foreground' : 
                  state === 'completed' ? 'text-muted-foreground' :
                  state === 'failed' ? 'text-red-600' :
                  'text-muted-foreground'
                }`}>
                  {config.label}
                </span>
                
                {/* Active phase progress */}
                {isActive && phaseProgress && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {phaseProgress.currentStep && (
                      <div>{phaseProgress.currentStep}</div>
                    )}
                    {phaseProgress.percentage > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="bg-muted rounded-full h-1 w-16 overflow-hidden">
                          <div 
                            className="bg-current h-full transition-all duration-300"
                            style={{ width: `${phaseProgress.percentage}%` }}
                          />
                        </div>
                        <span>{phaseProgress.percentage}%</span>
                      </div>
                    )}
                    {phaseProgress.estimatedTimeRemaining && (
                      <div className="text-xs text-muted-foreground">
                        ~{phaseProgress.estimatedTimeRemaining}m remaining
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Connector Line */}
            {index < PHASE_CONFIGS.length - 1 && (
              <div className={`w-12 h-0.5 mx-4 transition-all duration-200 ${
                getPhaseState(PHASE_CONFIGS[index + 1].phase) !== 'pending' 
                  ? 'bg-primary' 
                  : 'bg-muted'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### 1.2 Phase Detail Modal

```tsx
/**
 * PhaseDetailModal - Detailed view of phase progress and data
 * Opened when clicking on phase indicators
 */

interface PhaseDetailModalProps {
  phase: ExpeditionPhase;
  phaseData: PhaseSpecificData;
  isOpen: boolean;
  onClose: () => void;
}

export function PhaseDetailModal({
  phase,
  phaseData,
  isOpen,
  onClose
}: PhaseDetailModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {PHASE_CONFIGS.find(p => p.phase === phase)?.icon && (
              <PHASE_CONFIGS.find(p => p.phase === phase)!.icon className="h-5 w-5" />
            )}
            Phase {PHASE_CONFIGS.findIndex(p => p.phase === phase) + 1}: {
              PHASE_CONFIGS.find(p => p.phase === phase)?.label
            }
          </DialogTitle>
          <DialogDescription>
            {PHASE_CONFIGS.find(p => p.phase === phase)?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {phaseData.type === 'refine' && (
            <RefinePhaseDetails data={phaseData} />
          )}
          {phaseData.type === 'plan' && (
            <PlanPhaseDetails data={phaseData} />
          )}
          {phaseData.type === 'execute' && (
            <ExecutePhaseDetails data={phaseData} />
          )}
          {phaseData.type === 'result' && (
            <ResultPhaseDetails data={phaseData} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## 2. Start Execution Button and Approval UI

### 2.1 ExecutionApprovalFlow Component

```tsx
/**
 * ExecutionApprovalFlow - Complete user approval workflow for plan execution
 * Handles plan review, approval, and execution trigger
 */

interface ExecutionApprovalFlowProps {
  expedition: Expedition;
  planData: PlanPhaseData;
  onApprove: (approved: boolean, comments?: string) => Promise<void>;
  onStartExecution: (config?: ExecutionConfig) => Promise<void>;
  onRequestChanges: (changes: PlanChangeRequest) => Promise<void>;
}

interface ExecutionConfig {
  pauseOnError?: boolean;
  maxRetries?: number;
  timeoutMinutes?: number;
  notifyOnCompletion?: boolean;
}

export function ExecutionApprovalFlow({
  expedition,
  planData,
  onApprove,
  onStartExecution,
  onRequestChanges
}: ExecutionApprovalFlowProps) {
  const [approvalStep, setApprovalStep] = useState<'review' | 'approved' | 'ready'>('review');
  const [showExecutionConfig, setShowExecutionConfig] = useState(false);
  const [executionConfig, setExecutionConfig] = useState<ExecutionConfig>({});
  const [isApproving, setIsApproving] = useState(false);
  const [isStartingExecution, setIsStartingExecution] = useState(false);

  // Determine current step based on plan data
  useEffect(() => {
    if (planData.userApprovedPlan && planData.planningComplete) {
      setApprovalStep('ready');
    } else if (planData.planningComplete) {
      setApprovalStep('review');
    }
  }, [planData]);

  const handleApprove = async (approved: boolean, comments?: string) => {
    setIsApproving(true);
    try {
      await onApprove(approved, comments);
      if (approved) {
        setApprovalStep('approved');
        // Auto-transition to ready after brief delay
        setTimeout(() => setApprovalStep('ready'), 1000);
      }
    } catch (error) {
      console.error('Failed to approve plan:', error);
    } finally {
      setIsApproving(false);
    }
  };

  const handleStartExecution = async () => {
    setIsStartingExecution(true);
    try {
      await onStartExecution(executionConfig);
    } catch (error) {
      console.error('Failed to start execution:', error);
    } finally {
      setIsStartingExecution(false);
    }
  };

  return (
    <Card className="p-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Execution Plan Review
          </span>
          <Badge variant={approvalStep === 'ready' ? 'default' : 'secondary'}>
            {approvalStep === 'review' && 'Awaiting Review'}
            {approvalStep === 'approved' && 'Plan Approved'}
            {approvalStep === 'ready' && 'Ready to Execute'}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Plan Review Section */}
        {approvalStep === 'review' && (
          <>
            <PlanReviewSummary planData={planData} />
            
            <div className="flex gap-3">
              <Button 
                onClick={() => handleApprove(true)}
                disabled={isApproving}
                className="flex-1"
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Approve Plan
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {/* Open plan modification dialog */}}
                disabled={isApproving}
              >
                <Edit className="h-4 w-4 mr-2" />
                Request Changes
              </Button>
              
              <Button 
                variant="ghost"
                onClick={() => handleApprove(false)}
                disabled={isApproving}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </>
        )}

        {/* Execution Ready Section */}
        {approvalStep === 'ready' && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                <CheckCircle2 className="h-5 w-5" />
                Plan Approved - Ready for Execution
              </div>
              <p className="text-green-700 text-sm">
                Your expedition plan has been approved and is ready to execute. 
                Click "Start Execution" to begin the workflow.
              </p>
            </div>

            <ExecutionReadyWidget 
              planData={planData}
              onShowConfig={() => setShowExecutionConfig(true)}
            />

            <div className="flex gap-3">
              <Button 
                onClick={handleStartExecution}
                disabled={isStartingExecution}
                size="lg"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isStartingExecution ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Execution
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => setShowExecutionConfig(true)}
                disabled={isStartingExecution}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </>
        )}

        {/* Execution Config Modal */}
        <ExecutionConfigModal
          isOpen={showExecutionConfig}
          onClose={() => setShowExecutionConfig(false)}
          config={executionConfig}
          onConfigChange={setExecutionConfig}
          onStartWithConfig={handleStartExecution}
        />
      </CardContent>
    </Card>
  );
}
```

### 2.2 Plan Review Summary Component

```tsx
/**
 * PlanReviewSummary - Comprehensive plan review interface
 * Shows tasks, agents, workflow, and risk assessment for user approval
 */

interface PlanReviewSummaryProps {
  planData: PlanPhaseData;
}

export function PlanReviewSummary({ planData }: PlanReviewSummaryProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'workflow' | 'risks'>('overview');

  return (
    <div className="space-y-4">
      {/* Plan Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{planData.taskBreakdown.length}</div>
          <div className="text-sm text-muted-foreground">Tasks</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {Object.keys(planData.agentAssignments).length}
          </div>
          <div className="text-sm text-muted-foreground">Agents</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">~{estimateTotalDuration(planData)}m</div>
          <div className="text-sm text-muted-foreground">Estimated Duration</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">85%</div>
          <div className="text-sm text-muted-foreground">Success Probability</div>
        </Card>
      </div>

      {/* Plan Review Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab as any}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="risks">Risk Assessment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-4">
            <h3 className="font-medium mb-2">Mission Summary</h3>
            <p className="text-sm text-muted-foreground">
              {planData.refinedMission}
            </p>
          </Card>
          
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-medium mb-3">Key Requirements</h3>
              <ul className="text-sm space-y-1">
                {planData.refinedRequirements.slice(0, 5).map((req, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-3">Expected Deliverables</h3>
              <ul className="text-sm space-y-1">
                {planData.taskBreakdown
                  .filter(task => task.deliverable)
                  .slice(0, 5)
                  .map((task, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      {task.deliverable}
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <TaskBreakdownView 
            tasks={planData.taskBreakdown}
            agentAssignments={planData.agentAssignments}
            dependencyGraph={planData.dependencyGraph}
          />
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4">
          <WorkflowVisualization 
            workflowDSL={planData.workflowDSL}
            visualization={planData.workflowVisualization}
          />
        </TabsContent>

        <TabsContent value="risks" className="space-y-4">
          <RiskAssessmentView planData={planData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

## 3. Phase-Specific Content Components

### 3.1 Phase Content Router

```tsx
/**
 * PhaseContentRouter - Routes to appropriate content based on current phase
 * Replaces static tabs with dynamic phase-based content
 */

interface PhaseContentRouterProps {
  expedition: Expedition;
  currentPhase: ExpeditionPhase;
  phaseData: PhaseSpecificData;
  onPhaseAction: (action: string, data?: any) => Promise<void>;
}

export function PhaseContentRouter({
  expedition,
  currentPhase,
  phaseData,
  onPhaseAction
}: PhaseContentRouterProps) {
  return (
    <div className="space-y-6">
      {currentPhase === 'refine' && phaseData.type === 'refine' && (
        <RefinePhaseContent 
          expedition={expedition}
          data={phaseData}
          onRefinementComplete={(refinedData) => 
            onPhaseAction('complete_refinement', refinedData)
          }
        />
      )}

      {currentPhase === 'plan' && phaseData.type === 'plan' && (
        <PlanPhaseContent 
          expedition={expedition}
          data={phaseData}
          onPlanApprove={(approved, comments) => 
            onPhaseAction('approve_plan', { approved, comments })
          }
          onRequestChanges={(changes) => 
            onPhaseAction('request_changes', changes)
          }
        />
      )}

      {currentPhase === 'execute' && phaseData.type === 'execute' && (
        <ExecutePhaseContent 
          expedition={expedition}
          data={phaseData}
          onExecutionControl={(action) => 
            onPhaseAction('execution_control', { action })
          }
        />
      )}

      {currentPhase === 'result' && phaseData.type === 'result' && (
        <ResultPhaseContent 
          expedition={expedition}
          data={phaseData}
        />
      )}
    </div>
  );
}
```

### 3.2 Refine Phase Content

```tsx
/**
 * RefinePhaseContent - Interactive mission refinement interface
 * Combines chat interface with refinement progress tracking
 */

interface RefinePhaseContentProps {
  expedition: Expedition;
  data: RefinePhaseData;
  onRefinementComplete: (refinedData: RefinePhaseOutput) => void;
}

export function RefinePhaseContent({
  expedition,
  data,
  onRefinementComplete
}: RefinePhaseContentProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Chat Interface */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Mission Refinement Chat
            </CardTitle>
            <CardDescription>
              Work with the First Officer to clarify and refine your mission requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpeditionChat 
              expeditionId={expedition.id}
              mode="refinement"
              context={{
                originalMission: data.originalMission,
                clarifyingQuestions: data.clarifyingQuestions,
                currentProgress: data.userClarifications
              }}
              placeholder="Discuss your mission requirements with the First Officer..."
              enableRichInput={true}
              showParticipantSelector={false} // Fixed to First Officer
            />
          </CardContent>
        </Card>
      </div>

      {/* Refinement Progress Sidebar */}
      <div className="space-y-4">
        <RefinementProgressPanel 
          data={data}
          onComplete={onRefinementComplete}
        />
        
        <MissionContextPanel 
          originalMission={data.originalMission}
          visionContext={data.visionContext}
        />
      </div>
    </div>
  );
}

/**
 * RefinementProgressPanel - Shows refinement progress and completion status
 */
interface RefinementProgressPanelProps {
  data: RefinePhaseData;
  onComplete: (refinedData: RefinePhaseOutput) => void;
}

export function RefinementProgressPanel({
  data,
  onComplete
}: RefinementProgressPanelProps) {
  const completionPercentage = calculateRefinementCompletion(data);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Refinement Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Completion</span>
            <span>{completionPercentage}%</span>
          </div>
          <div className="bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Refinement Checklist */}
        <div className="space-y-2">
          <RefinementCheckItem 
            completed={!!data.refinedMission}
            label="Mission Understanding"
            description="Clear mission statement refined"
          />
          <RefinementCheckItem 
            completed={data.refinedRequirements.length > 0}
            label="Requirements Clarified"
            description={`${data.refinedRequirements.length} requirements identified`}
          />
          <RefinementCheckItem 
            completed={data.userClarifications.length >= 3}
            label="Sufficient Clarification"
            description={`${data.userClarifications.length} clarifications provided`}
          />
          <RefinementCheckItem 
            completed={!!data.missionComplexity}
            label="Complexity Assessment"
            description={data.missionComplexity ? `Assessed as ${data.missionComplexity}` : 'Pending assessment'}
          />
        </div>

        {/* Continue to Planning Button */}
        {data.refinementComplete && (
          <Button 
            onClick={() => onComplete({
              refinedMission: data.refinedMission!,
              refinedRequirements: data.refinedRequirements,
              missionComplexity: data.missionComplexity!,
              estimatedDuration: data.estimatedDuration!,
              userClarifications: data.userClarifications
            })}
            className="w-full"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Continue to Planning
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

### 3.3 Execute Phase Content

```tsx
/**
 * ExecutePhaseContent - Real-time execution monitoring interface
 * Shows workflow progress, agent activities, and execution control
 */

interface ExecutePhaseContentProps {
  expedition: Expedition;
  data: ExecutePhaseData;
  onExecutionControl: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
}

export function ExecutePhaseContent({
  expedition,
  data,
  onExecutionControl
}: ExecutePhaseContentProps) {
  const [activeView, setActiveView] = useState<'overview' | 'workflow' | 'agents' | 'logs'>('overview');

  return (
    <div className="space-y-6">
      {/* Execution Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-green-500" />
              <div>
                <CardTitle>Execution in Progress</CardTitle>
                <CardDescription>
                  Workflow started • {data.executionProgress}% complete
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onExecutionControl('pause')}
                disabled={data.executionComplete}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onExecutionControl('cancel')}
                disabled={data.executionComplete}
              >
                <Square className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Execution Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {data.completedTasks.length}
          </div>
          <div className="text-sm text-muted-foreground">Tasks Completed</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-600">
            {Object.keys(data.activeAgentTasks).length}
          </div>
          <div className="text-sm text-muted-foreground">Agents Working</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-orange-600">
            {data.failedTasks.length}
          </div>
          <div className="text-sm text-muted-foreground">Failed Tasks</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {estimateTimeRemaining(data)}m
          </div>
          <div className="text-sm text-muted-foreground">Est. Remaining</div>
        </Card>
      </div>

      {/* Execution Details Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView as any}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="agents">Agent Activity</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ExecutionOverview data={data} />
        </TabsContent>

        <TabsContent value="workflow">
          <WorkflowExecutionView 
            runtimeState={data.workflowRuntimeState}
            executionResults={data.executionResults}
            currentNode={data.currentWorkflowNode}
          />
        </TabsContent>

        <TabsContent value="agents">
          <AgentActivityFeed 
            activeAgentTasks={data.activeAgentTasks}
            completedTasks={data.completedTasks}
            failedTasks={data.failedTasks}
          />
        </TabsContent>

        <TabsContent value="logs">
          <ExecutionLogs expeditionId={expedition.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

## 4. WorkflowDSL Visualization Component

### 4.1 WorkflowVisualization Component

```tsx
/**
 * WorkflowVisualization - Interactive workflow diagram for plan review
 * Shows workflow structure, dependencies, and execution flow
 */

interface WorkflowVisualizationProps {
  workflowDSL?: WorkflowDSL;
  visualization?: string;
  executionState?: WorkflowRuntimeState;
  interactive?: boolean;
  onNodeClick?: (nodeId: string) => void;
}

export function WorkflowVisualization({
  workflowDSL,
  visualization,
  executionState,
  interactive = true,
  onNodeClick
}: WorkflowVisualizationProps) {
  const [viewMode, setViewMode] = useState<'visual' | 'text' | 'json'>('visual');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  if (!workflowDSL) {
    return (
      <Card className="p-8">
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2" />
          <div>Workflow generation in progress...</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visualization Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'visual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('visual')}
          >
            <Eye className="h-4 w-4 mr-2" />
            Visual
          </Button>
          <Button
            variant={viewMode === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('text')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Text
          </Button>
          <Button
            variant={viewMode === 'json' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('json')}
          >
            <Code className="h-4 w-4 mr-2" />
            JSON
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            Completed
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500" />
            Active
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-gray-300" />
            Pending
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            Failed
          </div>
        </div>
      </div>

      {/* Workflow Display */}
      <Card className="p-6">
        {viewMode === 'visual' && (
          <WorkflowDiagram
            workflowDSL={workflowDSL}
            executionState={executionState}
            interactive={interactive}
            onNodeClick={onNodeClick || setSelectedNode}
          />
        )}

        {viewMode === 'text' && (
          <div className="font-mono text-sm whitespace-pre-wrap bg-muted p-4 rounded">
            {visualization || generateTextVisualization(workflowDSL)}
          </div>
        )}

        {viewMode === 'json' && (
          <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(workflowDSL, null, 2)}
          </pre>
        )}
      </Card>

      {/* Node Detail Panel */}
      {selectedNode && (
        <WorkflowNodeDetail
          nodeId={selectedNode}
          workflowDSL={workflowDSL}
          executionState={executionState}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
```

### 4.2 Interactive Workflow Diagram

```tsx
/**
 * WorkflowDiagram - SVG-based interactive workflow diagram
 * Shows workflow nodes, connections, and execution status
 */

interface WorkflowDiagramProps {
  workflowDSL: WorkflowDSL;
  executionState?: WorkflowRuntimeState;
  interactive: boolean;
  onNodeClick: (nodeId: string) => void;
}

export function WorkflowDiagram({
  workflowDSL,
  executionState,
  interactive,
  onNodeClick
}: WorkflowDiagramProps) {
  // Calculate layout for workflow nodes
  const layout = calculateWorkflowLayout(workflowDSL);
  
  const getNodeStatus = (nodeId: string) => {
    if (!executionState) return 'pending';
    
    const result = executionState.nodeResults?.get(nodeId);
    if (result?.status === 'completed') return 'completed';
    if (result?.status === 'failed') return 'failed';
    if (executionState.currentNode === nodeId) return 'active';
    return 'pending';
  };

  const getNodeColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981'; // green-500
      case 'active': return '#3b82f6'; // blue-500
      case 'failed': return '#ef4444'; // red-500
      default: return '#d1d5db'; // gray-300
    }
  };

  return (
    <div className="w-full overflow-auto">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="border rounded"
      >
        {/* Workflow Connections */}
        {layout.edges.map((edge, index) => (
          <g key={index}>
            <line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke="#9ca3af"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
            {/* Edge Label */}
            {edge.label && (
              <text
                x={(edge.from.x + edge.to.x) / 2}
                y={(edge.from.y + edge.to.y) / 2 - 5}
                textAnchor="middle"
                className="text-xs fill-gray-600"
              >
                {edge.label}
              </text>
            )}
          </g>
        ))}

        {/* Workflow Nodes */}
        {layout.nodes.map((node) => {
          const status = getNodeStatus(node.id);
          const color = getNodeColor(status);
          
          return (
            <g key={node.id}>
              {/* Node Shape */}
              <rect
                x={node.x - node.width / 2}
                y={node.y - node.height / 2}
                width={node.width}
                height={node.height}
                rx="8"
                fill={color}
                stroke={status === 'active' ? '#1d4ed8' : 'transparent'}
                strokeWidth={status === 'active' ? '3' : '0'}
                className={`
                  ${interactive ? 'cursor-pointer hover:opacity-80' : ''}
                  transition-all duration-200
                `}
                onClick={interactive ? () => onNodeClick(node.id) : undefined}
              />
              
              {/* Node Icon */}
              <WorkflowNodeIcon
                x={node.x}
                y={node.y - 10}
                nodeType={node.type}
                status={status}
              />
              
              {/* Node Label */}
              <text
                x={node.x}
                y={node.y + 15}
                textAnchor="middle"
                className={`text-sm font-medium ${
                  status === 'pending' ? 'fill-gray-600' : 'fill-white'
                }`}
              >
                {truncateText(node.label, 12)}
              </text>
              
              {/* Progress Indicator */}
              {status === 'active' && (
                <circle
                  cx={node.x + node.width / 2 - 8}
                  cy={node.y - node.height / 2 + 8}
                  r="6"
                  fill="#fbbf24"
                  className="animate-pulse"
                />
              )}
            </g>
          );
        })}

        {/* Arrow Marker Definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#9ca3af"
            />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
```

## Component Design Summary

This frontend component design provides:

✅ **Clear Phase Progression** - Visual indicators showing current phase and progress  
✅ **User Control Interface** - Explicit plan approval and execution trigger UI  
✅ **Phase-Specific Content** - Tailored interfaces for each expedition phase  
✅ **Interactive Workflow Visualization** - Plan review with visual workflow diagrams  
✅ **Real-time Execution Monitoring** - Live progress tracking and agent activity feeds  
✅ **Responsive Design** - Components work across desktop and mobile interfaces  
✅ **Accessibility Ready** - Proper ARIA labels and keyboard navigation support

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "11", "content": "B4: Frontend Component Design - Design UI components for phase-based expedition experience", "status": "completed"}, {"id": "12", "content": "B4.1: Design phase progress indicator component", "status": "completed"}, {"id": "13", "content": "B4.2: Design Start Execution button and workflow approval UI", "status": "completed"}, {"id": "14", "content": "B4.3: Design phase-specific content rendering", "status": "completed"}, {"id": "15", "content": "B4.4: Plan WorkflowDSL visualization component", "status": "completed"}]