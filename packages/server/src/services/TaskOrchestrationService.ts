/**
 * Task Orchestration Service
 * 
 * Handles task management, breakdown, execution tracking, and coordination
 * for expeditions. Separated to manage the complexity of task-related operations.
 */

import {
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult,
} from '@starships/protocol';

import {
  ExpeditionError,
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';

export class TaskOrchestrationService {
  private static instance: TaskOrchestrationService;
  private logger = Logger.getInstance();

  private constructor() {}

  static getInstance(): TaskOrchestrationService {
    if (!TaskOrchestrationService.instance) {
      TaskOrchestrationService.instance = new TaskOrchestrationService();
    }
    return TaskOrchestrationService.instance;
  }

  /**
   * Get all tasks for an expedition
   */
  async getExpeditionTasks(expeditionId: string): Promise<ExpeditionTask[]> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      return await taskRepo.findByExpedition(expeditionId);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to get expedition tasks:', error);
      throw this.handleError(error, 'GET_TASKS_FAILED', expeditionId);
    }
  }

  /**
   * Get all messages for an expedition
   */
  async getExpeditionMessages(expeditionId: string): Promise<ExpeditionMessage[]> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      return await messageRepo.findByExpedition(expeditionId);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to get expedition messages:', error);
      throw this.handleError(error, 'GET_MESSAGES_FAILED', expeditionId);
    }
  }

  /**
   * Get all results for an expedition
   */
  async getExpeditionResults(expeditionId: string): Promise<ExpeditionResult[]> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      return await resultRepo.findByExpedition(expeditionId);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to get expedition results:', error);
      throw this.handleError(error, 'GET_RESULTS_FAILED', expeditionId);
    }
  }

  /**
   * Create a new task for an expedition
   */
  async createTask(
    expeditionId: string,
    taskData: Omit<ExpeditionTask, 'id' | 'expeditionId' | 'createdAt' | 'updatedAt'>
  ): Promise<ExpeditionTask> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      
      const task = {
        ...taskData,
        expeditionId,
        updatedAt: new Date().toISOString(),
      };

      return await taskRepo.create(task);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to create task:', error);
      throw this.handleError(error, 'CREATE_TASK_FAILED', expeditionId);
    }
  }

  /**
   * Update a task
   */
  async updateTask(
    taskId: string,
    updates: Partial<ExpeditionTask>
  ): Promise<ExpeditionTask | null> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      return await taskRepo.update(taskId, updates);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to update task:', error);
      throw this.handleError(error, 'UPDATE_TASK_FAILED');
    }
  }

  /**
   * Assign a task to an agent
   */
  async assignTaskToAgent(taskId: string, agentId: string): Promise<boolean> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const updated = await taskRepo.update(taskId, {
        assignedAgentId: agentId,
        updatedAt: new Date().toISOString(),
      });
      
      return !!updated;
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to assign task to agent:', error);
      throw this.handleError(error, 'ASSIGN_TASK_FAILED');
    }
  }

  /**
   * Complete a task with result
   */
  async completeTask(taskId: string, result: string): Promise<ExpeditionTask | null> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      return await taskRepo.update(taskId, {
        status: 'completed',
        result,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to complete task:', error);
      throw this.handleError(error, 'COMPLETE_TASK_FAILED');
    }
  }

  /**
   * Create a message in an expedition
   */
  async createMessage(
    expeditionId: string,
    messageData: Omit<ExpeditionMessage, 'id' | 'expeditionId' | 'createdAt'>
  ): Promise<ExpeditionMessage> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      
      const message = {
        ...messageData,
        expeditionId,
      };

      return await messageRepo.create(message);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to create message:', error);
      throw this.handleError(error, 'CREATE_MESSAGE_FAILED', expeditionId);
    }
  }

  /**
   * Create a result for an expedition
   */
  async createResult(
    expeditionId: string,
    resultData: Omit<ExpeditionResult, 'id' | 'expeditionId' | 'createdAt'>
  ): Promise<ExpeditionResult> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      
      const result = {
        ...resultData,
        expeditionId,
      };

      return await resultRepo.create(result);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to create result:', error);
      throw this.handleError(error, 'CREATE_RESULT_FAILED', expeditionId);
    }
  }

  /**
   * Get task progress summary for an expedition
   */
  async getTaskProgress(expeditionId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    failedTasks: number;
    progressPercentage: number;
  }> {
    try {
      const tasks = await this.getExpeditionTasks(expeditionId);
      
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const failedTasks = tasks.filter(t => t.status === 'failed').length;
      
      const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      return {
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        failedTasks,
        progressPercentage: Math.round(progressPercentage * 100) / 100,
      };
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to get task progress:', error);
      throw this.handleError(error, 'GET_TASK_PROGRESS_FAILED', expeditionId);
    }
  }

  /**
   * Get tasks assigned to a specific agent
   */
  async getTasksForAgent(expeditionId: string, agentId: string): Promise<ExpeditionTask[]> {
    try {
      const tasks = await this.getExpeditionTasks(expeditionId);
      return tasks.filter(task => task.assignedAgentId === agentId);
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to get tasks for agent:', error);
      throw this.handleError(error, 'GET_AGENT_TASKS_FAILED', expeditionId);
    }
  }

  /**
   * Check if all dependencies for a task are completed
   */
  async areTaskDependenciesCompleted(taskId: string): Promise<boolean> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);
      
      if (!task || !task.dependencies || task.dependencies.length === 0) {
        return true; // No dependencies or task not found
      }

      // Check if all dependency tasks are completed
      for (const depId of task.dependencies) {
        const depTask = await taskRepo.findById(depId);
        if (!depTask || depTask.status !== 'completed') {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[TASK-ORCHESTRATION] Failed to check task dependencies:', error);
      throw this.handleError(error, 'CHECK_DEPENDENCIES_FAILED');
    }
  }

  // Private helper methods

  private handleError(error: any, fallbackCode: string, expeditionId?: string): ExpeditionError {
    // If it's already a standard error, return as-is
    if (error.code) {
      return this.createError(error.code, error.message || 'Unknown error occurred', expeditionId);
    }

    // Create fallback error
    return ErrorFactory.expedition(
      fallbackCode as any,
      error.message || 'Unknown error occurred',
      expeditionId,
      {
        service: 'task-orchestration-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }

  private createError(code: string, message: string, expeditionId?: string): ExpeditionError {
    return ErrorFactory.expedition(code as any, message, expeditionId, {
      service: 'task-orchestration-service',
      operation: 'error_creation',
    });
  }
}