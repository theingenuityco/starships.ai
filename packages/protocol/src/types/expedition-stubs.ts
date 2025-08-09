/**
 * Expedition Stub Types
 * 
 * Minimal type definitions to prevent TypeScript compilation errors
 * while expedition functionality is disconnected. These are stub types
 * that maintain the interface without actual functionality.
 */

// ============================================================================
// STUB TYPES FOR COMPILATION
// ============================================================================

export type ExpeditionStatus = 
  | 'draft' | 'refining' | 'planning' | 'executing' 
  | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'paused';

export type ExpeditionPhase = 
  | 'refine' | 'plan' | 'execute' | 'result';

export type TaskStatus = 
  | 'pending' | 'assigned' | 'in-progress' 
  | 'blocked' | 'completed' | 'failed';

export type TaskPriority = 
  | 'low' | 'medium' | 'high' | 'critical';

export type MessageRole = 
  | 'user' | 'first-officer' | 'agent' | 'system';

export type MessageType = 
  | 'coordination' | 'task-work' | 'user-input' 
  | 'status-update' | 'result' | 'question' 
  | 'notification' | 'chain-of-thought';

export type WorkflowPhase =
  | 'initializing' | 'analyzing' | 'decomposing'
  | 'plan_tasks' | 'assigning' | 'coordinating'
  | 'synthesizing' | 'waiting_for_approval'
  | 'completed' | 'failed';

export type ResultType = 
  | 'final-report' | 'task-output' | 'analysis' 
  | 'code' | 'document' | 'design' | 'data' | 'recommendation';

export type ResultFormat = 
  | 'text' | 'markdown' | 'json' | 'code' 
  | 'html' | 'pdf' | 'image' | 'video' | 'audio' | 'archive';

export type AgentActivityType = 
  | 'task_started' | 'task_completed' | 'task_failed' 
  | 'agent_thinking' | 'agent_blocked' | 'quality_check' | 'retry_attempt';

// ============================================================================
// STUB INTERFACES
// ============================================================================

export interface Expedition {
  id: string;
  starshipId: string;
  name: string;
  mission: string;
  assignedAgents: string[];
  status: ExpeditionStatus;
  workflowState?: any;
  result?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  currentPhase?: ExpeditionPhase;
  phaseStartedAt?: string;
  phaseCompletedAt?: string;
  userApprovedPlan?: boolean;
  planApprovalRequired?: boolean;
  planApprovedAt?: string;
  userResponse?: any;
}

export interface ExpeditionTask {
  id: string;
  expeditionId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  assignedAgentId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  deliverable: string;
  result?: string;
  estimatedEffort?: number;
  actualEffort?: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}

export interface ExpeditionMessage {
  id: string;
  expeditionId: string;
  role: MessageRole;
  agentId?: string;
  userId?: string;
  content: string;
  messageType: MessageType;
  timestamp: string;
  threadId?: string;
  parentMessageId?: string;
  metadata?: Record<string, any>;
  chainOfThought?: {
    reasoning?: string;
    steps?: string[];
    alternatives?: string[];
    confidence?: number;
    assumptions?: string[];
    constraints?: string[];
    risks?: string[];
    mitigations?: string[];
    dependencies?: string[];
    tools?: string[];
    learnings?: string[];
  };
}

export interface ExpeditionResult {
  id: string;
  expeditionId: string;
  title: string;
  description: string;
  content: string;
  resultType: ResultType;
  format: ResultFormat;
  quality: QualityScore;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface QualityScore {
  overall: number;
  completeness: number;
  accuracy: number;
  relevance: number;
  clarity: number;
  assessedBy: string;
  assessedAt: string;
  notes?: string;
}

export interface TaskBreakdown {
  id: string;
  description: string;
  requiredSkills: string[];
  assignedAgentId?: string;
  status: TaskStatus;
  result?: string;
  deliverable: string;
  dependencies: string[];
  estimatedEffort?: number;
  actualEffort?: number;
}

export interface AgentActivity {
  id: string;
  expeditionId: string;
  agentId: string;
  agentName: string;
  type: AgentActivityType;
  taskId?: string;
  taskTitle?: string;
  message: string;
  timestamp: string;
  metadata?: {
    qualityScore?: number;
    duration?: number;
    retryCount?: number;
    blockedReason?: string;
    error?: string;
  };
}

// ============================================================================
// STUB REQUEST/RESPONSE TYPES
// ============================================================================

export interface ExpeditionFilters {
  status?: ExpeditionStatus[];
  createdBy?: string;
  assignedAgent?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface ExpeditionSort {
  field: 'createdAt' | 'updatedAt' | 'status' | 'name';
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

// ============================================================================
// REQUEST/RESPONSE STUB TYPES
// ============================================================================

export interface CreateExpeditionRequest {
  starshipId: string;
  name: string;
  mission: string;
  selectedAgents: string[];
}

export interface UpdateExpeditionRequest {
  name?: string;
  mission?: string;
  status?: ExpeditionStatus;
  assignedAgents?: string[];
}

export interface CreateTaskRequest {
  expeditionId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  priority?: TaskPriority;
  dependencies?: string[];
  deliverable: string;
  estimatedEffort?: number;
  dueDate?: string;
}

export interface SendMessageRequest {
  expeditionId: string;
  content: string;
  participantId?: string;
  threadId?: string;
  parentMessageId?: string;
  metadata?: Record<string, any>;
}

export interface CreateResultRequest {
  expeditionId: string;
  title: string;
  description: string;
  content: string;
  resultType: ResultType;
  format: ResultFormat;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface ExpeditionResponse {
  expedition: Expedition;
  tasks?: ExpeditionTask[];
  messages?: ExpeditionMessage[];
  results?: ExpeditionResult[];
  assignedAgents?: Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
  }>;
}

export interface ExpeditionListResponse {
  expeditions: Expedition[];
  total: number;
  page: number;
  limit: number;
  filters?: {
    status?: ExpeditionStatus[];
  };
}

export interface ExpeditionStatsResponse {
  totalExpeditions: number;
  activeExpeditions: number;
  completedExpeditions: number;
  failedExpeditions: number;
  averageDuration: number;
  successRate: number;
  topPerformingAgents: Array<{
    agentId: string;
    agentName: string;
    completedTasks: number;
    averageQuality: number;
  }>;
}

// ============================================================================
// STUB ERROR TYPES
// ============================================================================

export interface ExpeditionError {
  code: string;
  message: string;
  details?: any;
  expeditionId?: string;
  taskId?: string;
  agentId?: string;
}

export type ExpeditionErrorCode = string;

// ============================================================================
// STUB CONSTANTS
// ============================================================================

export const phaseToStatus: Record<ExpeditionPhase, ExpeditionStatus> = {
  'refine': 'refining',
  'plan': 'planning', 
  'execute': 'executing',
  'result': 'completed'
};

export const statusToPhase: Record<ExpeditionStatus, ExpeditionPhase | null> = {
  'draft': null,
  'refining': 'refine',
  'planning': 'plan',
  'executing': 'execute',
  'in-progress': null,
  'completed': 'result',
  'failed': null,
  'cancelled': null,
  'paused': 'execute'
};