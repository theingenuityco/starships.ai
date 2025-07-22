/**
 * Expedition Orchestration System Types
 * 
 * Core TypeScript interfaces for the expedition system including expeditions,
 * tasks, messages, results, and their relationships.
 */

// ============================================================================
// CORE EXPEDITION TYPES
// ============================================================================

/**
 * Main expedition entity representing a coordinated multi-agent mission
 */
export interface Expedition {
  id: string;
  starshipId: string; // Foreign key to Starship
  title: string;
  description: string;
  objective: string; // Clear mission objective
  status: ExpeditionStatus;
  priority: ExpeditionPriority;
  assignedAgents: string[]; // Agent IDs from starship's deployed crew
  workflowState?: any; // LangGraph state persistence
  result?: string; // Final expedition outcome
  createdAt: string;
  updatedAt: string;
  createdBy: string; // User ID who created the expedition
  estimatedDuration?: number; // In minutes
  actualDuration?: number; // In minutes
  tags: string[]; // For categorization and filtering
}

/**
 * Individual tasks within an expedition
 */
export interface ExpeditionTask {
  id: string;
  expeditionId: string; // Foreign key to Expedition
  title: string;
  description: string;
  requiredSkills: string[]; // Skills needed to complete this task
  assignedAgentId?: string; // Agent assigned to this task
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[]; // Task IDs that must complete before this one
  deliverable: string; // Expected output format/description
  result?: string; // Actual task result
  estimatedEffort?: number; // In minutes
  actualEffort?: number; // In minutes
  createdAt: string;
  updatedAt: string;
  dueDate?: string; // Optional deadline
}

/**
 * Messages within expedition chat system
 */
export interface ExpeditionMessage {
  id: string;
  expeditionId: string; // Foreign key to Expedition
  role: MessageRole;
  agentId?: string; // For agent messages
  userId?: string; // For user messages
  content: string;
  messageType: MessageType;
  timestamp: string;
  threadId?: string; // For message threading
  parentMessageId?: string; // For replies
  metadata?: Record<string, any>; // Additional message data
}

/**
 * Final deliverables and results from expeditions
 */
export interface ExpeditionResult {
  id: string;
  expeditionId: string; // Foreign key to Expedition
  title: string;
  description: string;
  content: string; // Main result content
  resultType: ResultType;
  format: ResultFormat;
  quality: QualityScore;
  createdBy: string; // Agent or user ID
  createdAt: string;
  updatedAt: string;
  attachments?: string[]; // File paths or URLs
  metadata?: Record<string, any>; // Additional result data
}

// ============================================================================
// ENUMS AND STATUS TYPES
// ============================================================================

/**
 * Expedition lifecycle status
 */
export type ExpeditionStatus = 
  | 'draft'        // Created but not started
  | 'planning'     // First Officer analyzing requirements
  | 'in-progress'  // Active execution with agents
  | 'review'       // Completed, under review
  | 'completed'    // Successfully finished
  | 'failed'       // Failed or abandoned
  | 'cancelled';   // Cancelled by user

/**
 * Expedition priority levels
 */
export type ExpeditionPriority = 
  | 'low'
  | 'medium' 
  | 'high'
  | 'urgent';

/**
 * Task status within expeditions
 */
export type TaskStatus = 
  | 'pending'      // Not yet started
  | 'assigned'     // Assigned to agent but not started
  | 'in-progress'  // Currently being worked on
  | 'blocked'      // Waiting for dependencies
  | 'review'       // Completed, under review
  | 'completed'    // Successfully finished
  | 'failed';      // Failed to complete

/**
 * Task priority levels
 */
export type TaskPriority = 
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

/**
 * Message roles in expedition chat
 */
export type MessageRole = 
  | 'user'         // Human user
  | 'first-officer' // First Officer coordination
  | 'agent'        // Individual agent
  | 'system';      // System notifications

/**
 * Types of messages in expedition chat
 */
export type MessageType = 
  | 'coordination'  // First Officer coordination messages
  | 'task-work'     // Agent working on tasks
  | 'user-input'    // User messages and instructions
  | 'status-update' // System status updates
  | 'result'        // Task or expedition results
  | 'question'      // Questions requiring user input
  | 'notification'; // General notifications

/**
 * Types of expedition results
 */
export type ResultType = 
  | 'final-report'  // Complete expedition summary
  | 'task-output'   // Individual task result
  | 'analysis'      // Analysis or research output
  | 'code'          // Code or technical deliverable
  | 'document'      // Written document
  | 'design'        // Creative or design work
  | 'data'          // Data or dataset
  | 'recommendation'; // Recommendations or suggestions

/**
 * Format of expedition results
 */
export type ResultFormat = 
  | 'text'
  | 'markdown'
  | 'json'
  | 'code'
  | 'html'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive';

/**
 * Quality assessment for results
 */
export interface QualityScore {
  overall: number; // 0-100 overall quality score
  completeness: number; // 0-100 how complete the result is
  accuracy: number; // 0-100 accuracy assessment
  relevance: number; // 0-100 relevance to objective
  clarity: number; // 0-100 clarity and readability
  assessedBy: string; // Who assessed the quality
  assessedAt: string; // When quality was assessed
  notes?: string; // Additional quality notes
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new expedition
 */
export interface CreateExpeditionRequest {
  starshipId: string;
  title: string;
  description: string;
  objective: string;
  priority?: ExpeditionPriority;
  estimatedDuration?: number;
  tags?: string[];
  dueDate?: string;
  selectedAgents: string[]; // REQUIRED: At least one agent must be selected
}

/**
 * Request to update an expedition
 */
export interface UpdateExpeditionRequest {
  title?: string;
  description?: string;
  objective?: string;
  priority?: ExpeditionPriority;
  status?: ExpeditionStatus;
  estimatedDuration?: number;
  tags?: string[];
  dueDate?: string;
}

/**
 * Request to create a task within an expedition
 */
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

/**
 * Request to send a message in expedition chat
 */
export interface SendMessageRequest {
  expeditionId: string;
  content: string;
  messageType: MessageType;
  agentId?: string; // For directing message to specific agent
  threadId?: string; // For threaded conversations
  parentMessageId?: string; // For replies
}

/**
 * Request to create an expedition result
 */
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

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Response containing expedition data
 */
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

/**
 * Response for expedition list
 */
export interface ExpeditionListResponse {
  expeditions: Expedition[];
  total: number;
  page: number;
  limit: number;
  filters?: {
    status?: ExpeditionStatus[];
    priority?: ExpeditionPriority[];
    tags?: string[];
  };
}

/**
 * Response for expedition statistics
 */
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
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying expeditions
 */
export interface ExpeditionFilters {
  status?: ExpeditionStatus[];
  priority?: ExpeditionPriority[];
  tags?: string[];
  createdBy?: string;
  assignedAgent?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string; // Text search in title/description
}

/**
 * Sorting options for expeditions
 */
export interface ExpeditionSort {
  field: 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'title';
  direction: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

// ============================================================================
// WORKFLOW AND STATE TYPES
// ============================================================================

/**
 * LangGraph workflow state for expeditions
 */
export interface ExpeditionWorkflowState {
  expeditionId: string;
  currentPhase: WorkflowPhase;
  requirements: string;
  taskBreakdown: TaskBreakdown[];
  agentAssignments: Record<string, string[]>;
  agentResults: Record<string, string>;
  finalResult?: string;
  analysis?: any;
  userId: string;
  starshipId: string;
  errors?: string[];
  retryCount: number;
  lastUpdated: string;
}

/**
 * Workflow phases for First Officer coordination
 */
export type WorkflowPhase =
  | 'initializing'
  | 'analyzing'
  | 'decomposing'
  | 'plan_tasks'
  | 'assigning'
  | 'coordinating'
  | 'synthesizing'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed';

/**
 * Task breakdown structure for workflow
 */
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

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

/**
 * Integration with existing Starship entity
 */
export interface StarshipExpeditionSummary {
  starshipId: string;
  activeExpeditions: number;
  totalExpeditions: number;
  completedExpeditions: number;
  successRate: number;
  averageDuration: number;
  topCategories: string[];
}

/**
 * Integration with Agent entity for expedition context
 */
export interface AgentExpeditionContext {
  agentId: string;
  currentExpeditions: string[];
  completedTasks: number;
  averageQuality: number;
  specializations: string[];
  availability: 'available' | 'busy' | 'offline';
}

/**
 * Real-time event types for Socket.IO
 */
export interface ExpeditionEvent {
  type: ExpeditionEventType;
  expeditionId: string;
  data: any;
  timestamp: string;
  userId?: string;
  agentId?: string;
}

/**
 * Types of real-time expedition events
 */
export type ExpeditionEventType = 
  | 'expedition:created'
  | 'expedition:started'
  | 'expedition:status-changed'
  | 'expedition:completed'
  | 'expedition:failed'
  | 'task:created'
  | 'task:assigned'
  | 'task:completed'
  | 'message:sent'
  | 'agent:assigned'
  | 'agent:completed-task'
  | 'workflow:phase-changed'
  | 'result:created';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Expedition-specific error types
 */
export interface ExpeditionError {
  code: ExpeditionErrorCode;
  message: string;
  details?: any;
  expeditionId?: string;
  taskId?: string;
  agentId?: string;
}

/**
 * Error codes for expedition operations
 */
export type ExpeditionErrorCode =
  | 'EXPEDITION_NOT_FOUND'
  | 'EXPEDITION_ACCESS_DENIED'
  | 'EXPEDITION_ALREADY_STARTED'
  | 'EXPEDITION_CANNOT_MODIFY'
  | 'EXPEDITION_CANNOT_DELETE'
  | 'STARSHIP_NOT_FOUND'
  | 'STARSHIP_MAINTENANCE'
  | 'STARSHIP_VALIDATION_FAILED'
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_ASSIGNED'
  | 'AGENT_NOT_AVAILABLE'
  | 'AGENT_NOT_QUALIFIED'
  | 'WORKFLOW_FAILED'
  | 'INVALID_STATUS_TRANSITION'
  | 'DEPENDENCY_NOT_MET'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'VALIDATION_ERROR'
  | 'UPDATE_FAILED'
  | 'STATUS_UPDATE_FAILED'
  | 'CREATE_EXPEDITION_FAILED'
  | 'GET_EXPEDITION_FAILED'
  | 'GET_EXPEDITIONS_FAILED'
  | 'UPDATE_EXPEDITION_FAILED'
  | 'DELETE_EXPEDITION_FAILED'
  | 'START_EXPEDITION_FAILED'
  | 'PAUSE_EXPEDITION_FAILED'
  | 'RESUME_EXPEDITION_FAILED'
  | 'CANCEL_EXPEDITION_FAILED'
  | 'GET_STATS_FAILED';