/**
 * Workflow DSL Types
 * 
 * Defines the Domain Specific Language for workflow creation, approval, and execution
 * within the expedition orchestration system.
 */

// ============================================================================
// CORE WORKFLOW DSL TYPES
// ============================================================================

/**
 * Main workflow DSL entity representing a complete workflow graph
 */
export interface WorkflowDSL {
  id: string;
  expeditionId: string;
  nodes: WorkflowDSLNode[];
  edges: WorkflowDSLEdge[];
  visualization: string; // ASCII or other text-based visualization
  approvalStatus: WorkflowApprovalStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  metadata?: WorkflowMetadata;
}

/**
 * Individual nodes in the workflow graph
 */
export interface WorkflowDSLNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description: string;
  estimatedTime?: number; // In minutes
  parameters: Record<string, any>; // Node-specific parameters
  metadata?: Record<string, any>; // Additional node metadata
  position?: NodePosition; // For visual layout
}

/**
 * Edges connecting workflow nodes
 */
export interface WorkflowDSLEdge {
  id: string;
  from: string; // Source node ID
  to: string;   // Target node ID
  condition?: string; // Condition key for routing (optional)
  label?: string; // Human-readable edge label
  metadata?: Record<string, any>; // Additional edge metadata
}

/**
 * Node position for visualization
 */
export interface NodePosition {
  x: number;
  y: number;
  layer?: number; // For layered layouts
}

/**
 * Workflow metadata for additional information
 */
export interface WorkflowMetadata {
  complexity: WorkflowComplexity;
  estimatedDuration: number; // Total estimated time in minutes
  createdBy: string; // System or user that created the workflow
  version: string;
  tags?: string[];
  description?: string;
}

// ============================================================================
// NODE TYPE DEFINITIONS
// ============================================================================

/**
 * Types of workflow nodes
 */
export type WorkflowNodeType = 
  | 'agent'           // Execute work via AI agents
  | 'conditional'     // Data-driven routing
  | 'user_prompt'     // User interaction point
  | 'output'          // Final output generation
  | 'start'           // Workflow start node
  | 'end';            // Workflow end node

/**
 * Agent node parameters for executing agent tasks
 */
export interface AgentNodeParameters {
  agentId: string;
  taskIds: string[];
  instructions?: string;
  expectedOutput?: string;
  timeout?: number; // In minutes
}

/**
 * Conditional node parameters for data-driven routing
 */
export interface ConditionalNodeParameters {
  sourceNodeId: string; // Node whose output to evaluate
  expression: string; // JSONata expression to evaluate
  conditions: Record<string, string>; // conditionKey → JSONata boolean expression
  defaultCondition?: string; // Fallback condition if none match
}

/**
 * User prompt node parameters for user interaction
 */
export interface UserPromptNodeParameters {
  promptText: string;
  choices: UserPromptChoice[];
  sourceNodeId?: string; // Optional context from previous node
  timeout?: number; // In minutes, defaults to WORKFLOW_CONFIG.USER_PROMPT_TIMEOUT_MINUTES
  required?: boolean; // Whether user response is required
}

/**
 * User prompt choice definition
 */
export interface UserPromptChoice {
  id: string;
  text: string;
  description?: string;
  value: any; // Value to return when this choice is selected
}

/**
 * Output node parameters for final result generation
 */
export interface OutputNodeParameters {
  template: string; // Template for generating output
  sources: string[]; // Node IDs to gather data from
  format: OutputFormat;
  title?: string;
}

// ============================================================================
// WORKFLOW EXECUTION TYPES
// ============================================================================

/**
 * Runtime state of workflow execution
 */
export interface WorkflowRuntimeState {
  id: string;
  workflowId: string;
  currentNodeId?: string;
  status: WorkflowExecutionStatus;
  executionResults: Map<string, WorkflowNodeResult>; // nodeId → result
  startTime?: string;
  endTime?: string;
  pausedAt?: string;
  error?: WorkflowExecutionError;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of executing a workflow node
 */
export interface WorkflowNodeResult {
  nodeId: string;
  success: boolean;
  data?: any; // Node output data
  error?: string; // Error message if failed
  executedAt: string;
  duration?: number; // Execution time in milliseconds
  nextEdgeCondition?: string; // For conditional nodes
  metadata?: Record<string, any>;
}

/**
 * Context passed to node handlers during execution
 */
export interface WorkflowExecutionContext {
  expeditionId: string;
  workflowId: string;
  userId: string;
  previousResults: Map<string, WorkflowNodeResult>;
  expeditionState: any; // Current expedition state
  services: WorkflowServices; // Available services
}

/**
 * Services available during workflow execution
 */
export interface WorkflowServices {
  agentService: any; // Agent execution service
  userPromptService: any; // User prompt management
  dataService: any; // Data storage and retrieval
  notificationService?: any; // Optional notifications
}

// ============================================================================
// WORKFLOW GENERATION TYPES
// ============================================================================

/**
 * Request for workflow generation
 */
export interface WorkflowGenerationRequest {
  expeditionId: string;
  taskBreakdown: any[]; // Use any[] to avoid circular dependency with expedition types
  selectedAgents: AgentAssignment[];
  objective: string;
  complexity?: WorkflowComplexity;
  preferences?: WorkflowGenerationPreferences;
}

/**
 * Result of workflow generation
 */
export interface WorkflowGenerationResult {
  workflow: WorkflowDSL;
  confidence: number; // 0-1 confidence in generated workflow
  suggestions?: string[]; // Improvement suggestions
  warnings?: string[]; // Potential issues
  metadata: {
    generationTime: number; // Time taken to generate in ms
    llmModel: string;
    tokensUsed: number;
  };
}

/**
 * Preferences for workflow generation
 */
export interface WorkflowGenerationPreferences {
  maxNodes?: number;
  includeUserInteraction?: boolean;
  allowConditionals?: boolean;
  estimatedDuration?: number; // Target duration in minutes
  qualityGates?: boolean; // Include quality check nodes
}

// Note: TaskBreakdown is imported from expedition types to avoid duplication

/**
 * Agent assignment structure (imported from existing types)
 */
export interface AgentAssignment {
  agentId: string;
  agentName: string;
  skills: string[];
  availability: string;
  assignedTasks: string[];
}

// ============================================================================
// APPROVAL AND MANAGEMENT TYPES
// ============================================================================

/**
 * Workflow approval status
 */
export type WorkflowApprovalStatus = 
  | 'pending'    // Awaiting user approval
  | 'approved'   // User approved the workflow
  | 'rejected'   // User rejected the workflow
  | 'modified';  // User modified the workflow

/**
 * Workflow approval request
 */
export interface WorkflowApprovalRequest {
  workflowId: string;
  action: WorkflowApprovalAction;
  feedback?: string;
  modifications?: Partial<WorkflowDSL>;
}

/**
 * Workflow approval actions
 */
export type WorkflowApprovalAction = 
  | 'approve'
  | 'reject'
  | 'modify'
  | 'request_changes';

/**
 * Workflow approval result
 */
export interface WorkflowApprovalResult {
  approved: boolean;
  message: string;
  modifiedWorkflow?: WorkflowDSL;
  feedback?: string;
}

// ============================================================================
// VISUALIZATION TYPES
// ============================================================================

/**
 * Visualization configuration
 */
export interface VisualizationConfig {
  format: VisualizationFormat;
  includeMetadata?: boolean;
  showEstimates?: boolean;
  showNodeIds?: boolean;
  maxWidth?: number;
  theme?: VisualizationTheme;
}

/**
 * Visualization formats
 */
export type VisualizationFormat = 
  | 'ascii'      // ASCII art (initial implementation)
  | 'mermaid'    // Mermaid diagram syntax
  | 'dot'        // DOT/Graphviz format
  | 'json'       // JSON representation
  | 'svg';       // SVG format (future)

/**
 * Visualization themes
 */
export type VisualizationTheme = 
  | 'default'
  | 'compact'
  | 'detailed'
  | 'minimal';

/**
 * Visualization result
 */
export interface VisualizationResult {
  content: string;
  format: VisualizationFormat;
  metadata: {
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
    estimatedSize: {
      width: number;
      height: number;
    };
  };
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  severity: 'error' | 'warning';
  details?: any;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  suggestion?: string;
}

/**
 * Validation suggestion details
 */
export interface ValidationSuggestion {
  type: 'optimization' | 'improvement' | 'best_practice';
  message: string;
  impact: 'low' | 'medium' | 'high';
  nodeId?: string;
}

// ============================================================================
// ENUM TYPES
// ============================================================================

/**
 * Workflow complexity levels
 */
export type WorkflowComplexity = 
  | 'simple'     // Linear workflow, no conditionals
  | 'moderate'   // Some branching, limited conditionals
  | 'complex'    // Multiple branches, complex conditionals
  | 'advanced';  // Highly complex with nested logic

/**
 * Workflow execution status
 */
export type WorkflowExecutionStatus = 
  | 'not_started'  // Workflow created but not executed
  | 'running'      // Currently executing
  | 'paused'       // Execution paused (e.g., waiting for user input)
  | 'completed'    // Successfully completed
  | 'failed'       // Failed during execution
  | 'cancelled';   // Cancelled by user

/**
 * Output formats for workflow results
 */
export type OutputFormat = 
  | 'text'
  | 'markdown'
  | 'json'
  | 'html'
  | 'xml'
  | 'pdf'
  | 'csv';

/**
 * Validation error codes
 */
export type ValidationErrorCode = 
  | 'MISSING_START_NODE'
  | 'MISSING_END_NODE'
  | 'UNREACHABLE_NODE'
  | 'CIRCULAR_DEPENDENCY'
  | 'INVALID_NODE_TYPE'
  | 'INVALID_PARAMETERS'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_EDGE_CONNECTION'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_EDGE_ID'
  | 'EXCEEDS_MAX_NODES'
  | 'EXCEEDS_MAX_EDGES'
  | 'INVALID_JSONATA_EXPRESSION';

/**
 * Validation warning codes
 */
export type ValidationWarningCode = 
  | 'LONG_EXECUTION_PATH'
  | 'NO_ERROR_HANDLING'
  | 'MISSING_DESCRIPTIONS'
  | 'UNBALANCED_WORKLOAD'
  | 'NO_QUALITY_GATES'
  | 'POTENTIAL_TIMEOUT'
  | 'COMPLEX_CONDITIONALS'
  | 'LARGE_WORKFLOW_SIZE';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Workflow execution error
 */
export interface WorkflowExecutionError {
  code: WorkflowErrorCode;
  message: string;
  nodeId?: string;
  details?: any;
  timestamp: string;
  recoverable: boolean;
  retryCount?: number;
}

/**
 * Workflow error codes
 */
export type WorkflowErrorCode = 
  | 'NODE_EXECUTION_FAILED'
  | 'TIMEOUT_EXCEEDED'
  | 'USER_INPUT_TIMEOUT'
  | 'INVALID_CONDITION_RESULT'
  | 'AGENT_UNAVAILABLE'
  | 'RESOURCE_EXHAUSTED'
  | 'PERMISSION_DENIED'
  | 'WORKFLOW_CANCELLED'
  | 'SYSTEM_ERROR'
  | 'VALIDATION_FAILED'
  | 'JSONATA_ERROR';