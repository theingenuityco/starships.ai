import { NotFoundError, ValidationError } from '@starships/errors';
import { ExecutionRepository } from '@starships/models';
import { CreateExecutionRequest, ExecutionModel, UpdateExecutionRequest } from '@starships/protocol';

/**
 * Execution Service - Contains business logic for execution operations
 */
export class ExecutionService {
  private executionRepository: ExecutionRepository;

  constructor() {
    this.executionRepository = new ExecutionRepository();
  }

  /**
   * Create a new execution
   */
  async createExecution(data: CreateExecutionRequest): Promise<ExecutionModel> {
    return this.executionRepository.create(data);
  }

  /**
   * Get execution by ID
   */
  async getExecutionById(executionId: string): Promise<ExecutionModel | null> {
    return this.executionRepository.findById(executionId);
  }

  /**
   * Get executions by workflow ID
   */
  async getExecutionsByWorkflow(workflowId: string): Promise<ExecutionModel[]> {
    return this.executionRepository.findByWorkflowId(workflowId);
  }

  /**
   * Update execution
   */
  async updateExecution(executionId: string, updates: UpdateExecutionRequest): Promise<ExecutionModel | null> {
    return this.executionRepository.update(executionId, updates);
  }

  /**
   * Delete execution
   */
  async deleteExecution(executionId: string): Promise<boolean> {
    return this.executionRepository.delete(executionId);
  }

  /**
   * Get executions by status (business logic)
   */
  async getExecutionsByStatus(status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'): Promise<ExecutionModel[]> {
    return this.executionRepository.findByStatus(status);
  }

  /**
   * Get active executions (business logic)
   */
  async getActiveExecutions(): Promise<ExecutionModel[]> {
    return this.executionRepository.findActiveExecutions();
  }

  /**
   * Start execution (business logic for status transitions)
   */
  async startExecution(executionId: string): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (execution.status !== 'not_started') {
      throw new ValidationError(`Cannot start execution in ${execution.status} status`, 'status');
    }

    return this.executionRepository.update(executionId, {
      status: 'running',
      startTime: new Date().toISOString(),
    });
  }

  /**
   * Pause execution (business logic for status transitions)
   */
  async pauseExecution(executionId: string): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (execution.status !== 'running') {
      throw new ValidationError(`Cannot pause execution in ${execution.status} status`, 'status');
    }

    return this.executionRepository.update(executionId, {
      status: 'paused',
      pausedAt: new Date().toISOString(),
    });
  }

  /**
   * Resume execution (business logic for status transitions)
   */
  async resumeExecution(executionId: string): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (execution.status !== 'paused') {
      throw new ValidationError(`Cannot resume execution in ${execution.status} status`, 'status');
    }

    return this.executionRepository.update(executionId, {
      status: 'running',
      pausedAt: undefined, // Clear pausedAt when resuming
    });
  }

  /**
   * Complete execution (business logic for status transitions)
   */
  async completeExecution(executionId: string, result?: Record<string, unknown>): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (execution.status !== 'running') {
      throw new ValidationError(`Cannot complete execution in ${execution.status} status`, 'status');
    }

    return this.executionRepository.update(executionId, {
      status: 'completed',
      endTime: new Date().toISOString(),
      result,
    });
  }

  /**
   * Fail execution (business logic for status transitions)
   */
  async failExecution(executionId: string, errorMessage: string): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (!['not_started', 'running', 'paused'].includes(execution.status)) {
      throw new ValidationError(`Cannot fail execution in ${execution.status} status`, 'status');
    }

    const executionError = {
      code: 'SYSTEM_ERROR' as const,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      recoverable: false,
    };

    return this.executionRepository.update(executionId, {
      status: 'failed',
      endTime: new Date().toISOString(),
      error: executionError,
    });
  }

  /**
   * Cancel execution (business logic for status transitions)
   */
  async cancelExecution(executionId: string, reason?: string): Promise<ExecutionModel | null> {
    return this.executionRepository.cancelExecution(executionId, reason);
  }

  /**
   * Update execution progress (business logic)
   */
  async updateExecutionProgress(
    executionId: string,
    currentNodeRef: string,
    executionData?: Record<string, unknown>
  ): Promise<ExecutionModel | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    if (execution.status !== 'running') {
      throw new ValidationError(`Cannot update progress for execution in ${execution.status} status`, 'status');
    }

    return this.executionRepository.update(executionId, {
      currentNodeRef,
      executionData,
    });
  }

  /**
   * Get execution statistics for a workflow (business logic)
   */
  async getExecutionStats(workflowId: string): Promise<{
    total: number;
    pending: number;
    running: number;
    paused: number;
    completed: number;
    failed: number;
    cancelled: number;
    averageExecutionTime: number;
  }> {
    const executions = await this.executionRepository.findByWorkflowId(workflowId);

    const stats = {
      total: executions.length,
      pending: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      averageExecutionTime: 0,
    };

    let totalExecutionTime = 0;
    let completedExecutions = 0;

    executions.forEach((execution: ExecutionModel) => {
      stats[execution.status as keyof typeof stats] = (stats[execution.status as keyof typeof stats] as number) + 1;

      // Calculate execution time for completed executions
      if (execution.status === 'completed' && execution.startTime && execution.endTime) {
        const executionTime = new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime();
        totalExecutionTime += executionTime;
        completedExecutions++;
      }
    });

    if (completedExecutions > 0) {
      stats.averageExecutionTime = Math.round(totalExecutionTime / completedExecutions);
    }

    return stats;
  }

  /**
   * Get execution duration (business logic)
   */
  async getExecutionDuration(executionId: string): Promise<number | null> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      return null;
    }

    if (!execution.startTime) {
      return null;
    }

    const endTime = execution.endTime || new Date().toISOString();
    return new Date(endTime).getTime() - new Date(execution.startTime).getTime();
  }

  /**
   * Cleanup old executions (business logic)
   */
  async cleanupOldExecutions(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const allExecutions = await this.executionRepository.findByStatus('completed');
    const oldExecutions = allExecutions.filter((execution: ExecutionModel) => {
      if (!execution.endTime) return false;
      return new Date(execution.endTime) < cutoffDate;
    });

    let deletedCount = 0;
    for (const execution of oldExecutions) {
      const deleted = await this.executionRepository.delete(execution.id);
      if (deleted) deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Validate execution state (business logic)
   */
  async validateExecutionState(executionId: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) {
      return {
        isValid: false,
        errors: [`Execution not found: ${executionId}`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate status transitions
    if (execution.status === 'running' && !execution.startTime) {
      errors.push('Running execution missing start time');
    }

    if (['completed', 'failed', 'cancelled'].includes(execution.status) && !execution.endTime) {
      errors.push('Finished execution missing end time');
    }

    if (execution.status === 'paused' && !execution.pausedAt) {
      warnings.push('Paused execution missing pausedAt timestamp');
    }

    // Validate time consistency
    if (execution.startTime && execution.endTime) {
      const startTime = new Date(execution.startTime);
      const endTime = new Date(execution.endTime);
      if (endTime <= startTime) {
        errors.push('End time must be after start time');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
