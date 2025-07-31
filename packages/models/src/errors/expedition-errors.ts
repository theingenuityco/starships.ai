/**
 * Expedition-specific error classes for the orchestration system
 * 
 * These errors provide detailed context for expedition workflow failures,
 * agent coordination issues, and task execution problems.
 */

import { BaseError, ErrorCategory } from './index';

/**
 * Expedition Workflow Error (422)
 * Used for workflow state transition failures, invalid phase changes, etc.
 */
export class ExpeditionWorkflowError extends BaseError {
  public readonly expeditionId: string;
  public readonly currentPhase: string;
  public readonly attemptedPhase?: string;
  public readonly workflowState?: any;

  constructor(
    message: string,
    expeditionId: string,
    currentPhase: string,
    attemptedPhase?: string,
    workflowState?: any,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'EXPEDITION_WORKFLOW_ERROR',
      422,
      ErrorCategory.VALIDATION,
      { expeditionId, currentPhase, attemptedPhase, workflowState },
      requestId,
      path
    );
    this.expeditionId = expeditionId;
    this.currentPhase = currentPhase;
    this.attemptedPhase = attemptedPhase;
    this.workflowState = workflowState;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      expeditionId: this.expeditionId,
      currentPhase: this.currentPhase,
      attemptedPhase: this.attemptedPhase,
    };
  }
}

/**
 * Agent Selection Error (503)
 * Used when no suitable agents are available for task assignment
 */
export class AgentSelectionError extends BaseError {
  public readonly requiredSkills: string[];
  public readonly availableAgents: number;
  public readonly taskId?: string;

  constructor(
    message: string,
    requiredSkills: string[],
    availableAgents: number,
    taskId?: string,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'AGENT_SELECTION_ERROR',
      503,
      ErrorCategory.SERVICE_UNAVAILABLE,
      { requiredSkills, availableAgents, taskId },
      requestId,
      path
    );
    this.requiredSkills = requiredSkills;
    this.availableAgents = availableAgents;
    this.taskId = taskId;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      requiredSkills: this.requiredSkills,
      availableAgents: this.availableAgents,
      taskId: this.taskId,
    };
  }
}

/**
 * Task Execution Error (500)
 * Used for task execution failures, agent communication issues, etc.
 */
export class TaskExecutionError extends BaseError {
  public readonly taskId: string;
  public readonly agentId?: string;
  public readonly executionPhase: string;
  public readonly retryCount: number;
  public readonly maxRetries: number;

  constructor(
    message: string,
    taskId: string,
    executionPhase: string,
    retryCount: number,
    maxRetries: number,
    agentId?: string,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'TASK_EXECUTION_ERROR',
      500,
      ErrorCategory.INTERNAL,
      { taskId, agentId, executionPhase, retryCount, maxRetries },
      requestId,
      path
    );
    this.taskId = taskId;
    this.agentId = agentId;
    this.executionPhase = executionPhase;
    this.retryCount = retryCount;
    this.maxRetries = maxRetries;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      taskId: this.taskId,
      agentId: this.agentId,
      executionPhase: this.executionPhase,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
    };
  }
}

/**
 * Quality Validation Error (422)
 * Used when task results fail quality checks
 */
export class QualityValidationError extends BaseError {
  public readonly taskId: string;
  public readonly qualityScore: number;
  public readonly threshold: number;
  public readonly issues: string[];
  public readonly suggestions: string[];

  constructor(
    message: string,
    taskId: string,
    qualityScore: number,
    threshold: number,
    issues: string[],
    suggestions: string[] = [],
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'QUALITY_VALIDATION_ERROR',
      422,
      ErrorCategory.VALIDATION,
      { taskId, qualityScore, threshold, issues, suggestions },
      requestId,
      path
    );
    this.taskId = taskId;
    this.qualityScore = qualityScore;
    this.threshold = threshold;
    this.issues = issues;
    this.suggestions = suggestions;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      taskId: this.taskId,
      qualityScore: this.qualityScore,
      threshold: this.threshold,
      issues: this.issues,
      suggestions: this.suggestions,
    };
  }
}

/**
 * Coordination Error (503)
 * Used for multi-agent coordination failures, communication breakdowns
 */
export class CoordinationError extends BaseError {
  public readonly expeditionId: string;
  public readonly involvedAgents: string[];
  public readonly coordinationPhase: string;
  public readonly communicationFailures: number;

  constructor(
    message: string,
    expeditionId: string,
    involvedAgents: string[],
    coordinationPhase: string,
    communicationFailures: number = 0,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'COORDINATION_ERROR',
      503,
      ErrorCategory.SERVICE_UNAVAILABLE,
      { expeditionId, involvedAgents, coordinationPhase, communicationFailures },
      requestId,
      path
    );
    this.expeditionId = expeditionId;
    this.involvedAgents = involvedAgents;
    this.coordinationPhase = coordinationPhase;
    this.communicationFailures = communicationFailures;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      expeditionId: this.expeditionId,
      involvedAgents: this.involvedAgents,
      coordinationPhase: this.coordinationPhase,
      communicationFailures: this.communicationFailures,
    };
  }
}

/**
 * Resource Exhaustion Error (503)
 * Used when system resources are exhausted (memory, connections, etc.)
 */
export class ResourceExhaustionError extends BaseError {
  public readonly resourceType: string;
  public readonly currentUsage: number;
  public readonly maxCapacity: number;
  public readonly expeditionId?: string;

  constructor(
    message: string,
    resourceType: string,
    currentUsage: number,
    maxCapacity: number,
    expeditionId?: string,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'RESOURCE_EXHAUSTION_ERROR',
      503,
      ErrorCategory.SERVICE_UNAVAILABLE,
      { resourceType, currentUsage, maxCapacity, expeditionId },
      requestId,
      path
    );
    this.resourceType = resourceType;
    this.currentUsage = currentUsage;
    this.maxCapacity = maxCapacity;
    this.expeditionId = expeditionId;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      resourceType: this.resourceType,
      currentUsage: this.currentUsage,
      maxCapacity: this.maxCapacity,
      expeditionId: this.expeditionId,
    };
  }
}

/**
 * Timeout Error (408)
 * Used for operation timeouts in expedition workflows
 */
export class ExpeditionTimeoutError extends BaseError {
  public readonly expeditionId: string;
  public readonly operation: string;
  public readonly timeoutMs: number;
  public readonly elapsedMs: number;

  constructor(
    message: string,
    expeditionId: string,
    operation: string,
    timeoutMs: number,
    elapsedMs: number,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'EXPEDITION_TIMEOUT_ERROR',
      408,
      ErrorCategory.INTERNAL,
      { expeditionId, operation, timeoutMs, elapsedMs },
      requestId,
      path
    );
    this.expeditionId = expeditionId;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      expeditionId: this.expeditionId,
      operation: this.operation,
      timeoutMs: this.timeoutMs,
      elapsedMs: this.elapsedMs,
    };
  }
}

/**
 * LangGraph State Error (500)
 * Used for LangGraph workflow state management issues
 */
export class LangGraphStateError extends BaseError {
  public readonly expeditionId: string;
  public readonly nodeId: string;
  public readonly stateSnapshot?: any;
  public readonly transitionError?: string;

  constructor(
    message: string,
    expeditionId: string,
    nodeId: string,
    stateSnapshot?: any,
    transitionError?: string,
    requestId?: string,
    path?: string
  ) {
    super(
      message,
      'LANGGRAPH_STATE_ERROR',
      500,
      ErrorCategory.INTERNAL,
      { expeditionId, nodeId, stateSnapshot, transitionError },
      requestId,
      path
    );
    this.expeditionId = expeditionId;
    this.nodeId = nodeId;
    this.stateSnapshot = stateSnapshot;
    this.transitionError = transitionError;
  }

  toResponse() {
    return {
      ...super.toResponse(),
      expeditionId: this.expeditionId,
      nodeId: this.nodeId,
      transitionError: this.transitionError,
      // Don't expose full state snapshot in production
      ...(process.env.NODE_ENV !== 'production' && { stateSnapshot: this.stateSnapshot }),
    };
  }
}

/**
 * Expedition Error Factory
 * Provides convenient methods for creating expedition-specific errors
 */
export class ExpeditionErrorFactory {
  /**
   * Create workflow error
   */
  static workflow(
    expeditionId: string,
    currentPhase: string,
    message: string,
    attemptedPhase?: string,
    workflowState?: any,
    requestId?: string
  ): ExpeditionWorkflowError {
    return new ExpeditionWorkflowError(
      message,
      expeditionId,
      currentPhase,
      attemptedPhase,
      workflowState,
      requestId
    );
  }

  /**
   * Create agent selection error
   */
  static agentSelection(
    requiredSkills: string[],
    availableAgents: number,
    taskId?: string,
    requestId?: string
  ): AgentSelectionError {
    const message = `No suitable agents available. Required skills: ${requiredSkills.join(', ')}. Available agents: ${availableAgents}`;
    return new AgentSelectionError(message, requiredSkills, availableAgents, taskId, requestId);
  }

  /**
   * Create task execution error
   */
  static taskExecution(
    taskId: string,
    executionPhase: string,
    retryCount: number,
    maxRetries: number,
    message: string,
    agentId?: string,
    requestId?: string
  ): TaskExecutionError {
    return new TaskExecutionError(
      message,
      taskId,
      executionPhase,
      retryCount,
      maxRetries,
      agentId,
      requestId
    );
  }

  /**
   * Create quality validation error
   */
  static qualityValidation(
    taskId: string,
    qualityScore: number,
    threshold: number,
    issues: string[],
    suggestions: string[] = [],
    requestId?: string
  ): QualityValidationError {
    const message = `Task quality below threshold. Score: ${qualityScore}, Required: ${threshold}`;
    return new QualityValidationError(
      message,
      taskId,
      qualityScore,
      threshold,
      issues,
      suggestions,
      requestId
    );
  }

  /**
   * Create coordination error
   */
  static coordination(
    expeditionId: string,
    involvedAgents: string[],
    coordinationPhase: string,
    message: string,
    communicationFailures: number = 0,
    requestId?: string
  ): CoordinationError {
    return new CoordinationError(
      message,
      expeditionId,
      involvedAgents,
      coordinationPhase,
      communicationFailures,
      requestId
    );
  }

  /**
   * Create timeout error
   */
  static timeout(
    expeditionId: string,
    operation: string,
    timeoutMs: number,
    elapsedMs: number,
    requestId?: string
  ): ExpeditionTimeoutError {
    const message = `Operation '${operation}' timed out after ${elapsedMs}ms (limit: ${timeoutMs}ms)`;
    return new ExpeditionTimeoutError(
      message,
      expeditionId,
      operation,
      timeoutMs,
      elapsedMs,
      requestId
    );
  }

  /**
   * Create resource exhaustion error
   */
  static resourceExhaustion(
    resourceType: string,
    currentUsage: number,
    maxCapacity: number,
    expeditionId?: string,
    requestId?: string
  ): ResourceExhaustionError {
    const message = `${resourceType} exhausted: ${currentUsage}/${maxCapacity}`;
    return new ResourceExhaustionError(
      message,
      resourceType,
      currentUsage,
      maxCapacity,
      expeditionId,
      requestId
    );
  }

  /**
   * Create LangGraph state error
   */
  static langGraphState(
    expeditionId: string,
    nodeId: string,
    message: string,
    stateSnapshot?: any,
    transitionError?: string,
    requestId?: string
  ): LangGraphStateError {
    return new LangGraphStateError(
      message,
      expeditionId,
      nodeId,
      stateSnapshot,
      transitionError,
      requestId
    );
  }
}

/**
 * Error recovery strategies for expedition errors
 */
export class ExpeditionErrorRecovery {
  /**
   * Determine if error is recoverable
   */
  static isRecoverable(error: BaseError): boolean {
    if (error instanceof TaskExecutionError) {
      return error.retryCount < error.maxRetries;
    }
    
    if (error instanceof QualityValidationError) {
      return error.suggestions.length > 0;
    }
    
    if (error instanceof AgentSelectionError) {
      return error.availableAgents > 0;
    }
    
    if (error instanceof CoordinationError) {
      return error.communicationFailures < 3;
    }
    
    return false;
  }

  /**
   * Get recovery suggestions
   */
  static getRecoveryStrategies(error: BaseError): string[] {
    const strategies: string[] = [];
    
    if (error instanceof TaskExecutionError) {
      strategies.push('Retry task execution with different parameters');
      strategies.push('Assign task to different agent');
      strategies.push('Break task into smaller subtasks');
    }
    
    if (error instanceof QualityValidationError) {
      strategies.push(...error.suggestions);
      strategies.push('Request human review and feedback');
    }
    
    if (error instanceof AgentSelectionError) {
      strategies.push('Wait for agents to become available');
      strategies.push('Modify task requirements to match available skills');
      strategies.push('Request additional agent resources');
    }
    
    if (error instanceof CoordinationError) {
      strategies.push('Restart coordination protocol');
      strategies.push('Switch to sequential execution mode');
      strategies.push('Escalate to human coordinator');
    }
    
    if (error instanceof ResourceExhaustionError) {
      strategies.push('Wait for resources to become available');
      strategies.push('Scale up system resources');
      strategies.push('Optimize resource usage');
    }
    
    return strategies;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static calculateRetryDelay(retryCount: number, baseDelayMs: number = 1000): number {
    return Math.min(baseDelayMs * Math.pow(2, retryCount), 30000); // Max 30 seconds
  }
}