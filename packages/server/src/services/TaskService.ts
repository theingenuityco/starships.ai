/**
 * Task Service - Task Management Layer
 *
 * Handles all business logic for task management including lifecycle operations,
 * dependency validation, agent assignment, and progress tracking.
 */

import {
  ExpeditionTask,
  TaskStatus,
  TaskPriority,
  CreateTaskRequest
} from '@starships/protocol';
import {
  ErrorFactory,
  StandardError,
  NotFoundError,
  ValidationError
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  requiredSkills?: string[];
  assignedAgentId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dependencies?: string[];
  deliverable?: string;
  result?: string;
  estimatedEffort?: number;
  actualEffort?: number;
  dueDate?: string;
}

export interface TaskAssignmentRequest {
  taskId: string;
  agentId: string;
  expeditionId: string;
}

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignedAgentId?: string;
  requiredSkills?: string[];
  hasDependencies?: boolean;
  overdue?: boolean;
}

export interface TaskWorkloadInfo {
  agentId: string;
  agentName: string;
  currentTasks: number;
  completedTasks: number;
  averageCompletionTime: number;
  skillMatch: number; // 0-100 percentage match
  availability: 'available' | 'busy' | 'overloaded';
}

export class TaskService {
  private static instance: TaskService;
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance({ service: 'TaskService' });
  }


  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  /**
   * Create a new task within an expedition
   */
  async createTask(
    userId: string,
    request: CreateTaskRequest
  ): Promise<ExpeditionTask> {
    const context = {
      service: 'TaskService',
      operation: 'createTask',
      resource: 'task',
      metadata: {
        userId,
        expeditionId: request.expeditionId,
        title: request.title
      }
    };

    this.logger.info('Creating task for expedition', context);

    try {
      // Validate inputs
      if (!userId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'userId', message: 'User ID is required' }
        ], context);
      }

      if (!request.expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      if (!request.title?.trim()) {
        throw ErrorFactory.validation([
          { field: 'title', message: 'Task title is required' }
        ], context);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(request.expeditionId, userId);

      // Validate dependencies
      if (request.dependencies && request.dependencies.length > 0) {
        await this.validateTaskDependencies(request.expeditionId, request.dependencies);
      }

      // Create task
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.create({
        expeditionId: request.expeditionId,
        title: request.title,
        description: request.description,
        requiredSkills: request.requiredSkills,
        status: 'pending',
        priority: request.priority || 'medium',
        dependencies: request.dependencies || [],
        deliverable: request.deliverable,
        estimatedEffort: request.estimatedEffort,
        updatedAt: new Date().toISOString(),
        dueDate: request.dueDate
      });


      this.logger.info('Task created successfully', {
        ...context,
        metadata: { ...context.metadata, taskId: task.id }
      });

      return task;
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to create task', error as StandardError, context);
        throw error;
      }

      const standardError = this.handleError(error, 'CREATE_TASK_FAILED', context);
      this.logger.error('Failed to create task', error instanceof Error ? error : undefined, context);
      throw standardError;
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string, userId: string): Promise<ExpeditionTask> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(task.expeditionId, userId);

      return task;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to get task:', error);
      throw this.handleError(error, 'GET_TASK_FAILED');
    }
  }

  /**
   * Get tasks for an expedition
   */
  async getExpeditionTasks(
    expeditionId: string,
    userId: string,
    filters?: TaskFilters
  ): Promise<ExpeditionTask[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      let tasks = await taskRepo.findByExpedition(expeditionId);

      // Apply filters
      if (filters) {
        tasks = this.applyTaskFilters(tasks, filters);
      }

      return tasks;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to get expedition tasks:', error);
      throw this.handleError(error, 'GET_TASKS_FAILED');
    }
  }

  /**
   * Update task
   */
  async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskRequest
  ): Promise<ExpeditionTask> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(task.expeditionId, userId);

      // Validate status transition
      if (updates.status) {
        this.validateStatusTransition(task.status, updates.status);
      }

      // Validate dependencies if updated
      if (updates.dependencies) {
        await this.validateTaskDependencies(task.expeditionId, updates.dependencies);
      }

      // Update task
      const updatedTask = await taskRepo.update(taskId, {
        ...updates,
        updatedAt: new Date().toISOString()
      });

      if (!updatedTask) {
        throw this.createError('UPDATE_FAILED', 'Failed to update task');
      }


      console.log(`[TASK-SERVICE] Task updated: ${taskId}`);
      return updatedTask;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to update task:', error);
      throw this.handleError(error, 'UPDATE_TASK_FAILED');
    }
  }

  /**
   * Assign task to agent
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<ExpeditionTask> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.findById(taskId);
    
    if (!task) {
      throw ErrorFactory.notFound('Task', taskId);
    }
    
    const updated = await taskRepo.update(taskId, { status });
    if (!updated) {
      throw new StandardError(
        'UPDATE_FAILED',
        'Failed to update task status'
      );
    }
    
    return updated;
  }

  async assignTask(
    userId: string,
    assignment: TaskAssignmentRequest
  ): Promise<ExpeditionTask> {
    console.log(`[TASK-SERVICE] Assigning task ${assignment.taskId} to agent ${assignment.agentId}`);

    try {
      // Validate expedition access
      await this.validateExpeditionAccess(assignment.expeditionId, userId);

      // Get task
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(assignment.taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${assignment.taskId}`);
      }

      // Validate agent availability and skills
      await this.validateAgentAssignment(assignment.agentId, task);

      // Check dependencies
      await this.validateTaskDependenciesCompleted(task);

      // Assign task
      const updatedTask = await taskRepo.update(assignment.taskId, {
        assignedAgentId: assignment.agentId,
        status: 'assigned',
        updatedAt: new Date().toISOString()
      });

      if (!updatedTask) {
        throw this.createError('UPDATE_FAILED', 'Failed to assign task');
      }


      console.log(`[TASK-SERVICE] Task assigned: ${assignment.taskId} to ${assignment.agentId}`);
      return updatedTask;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to assign task:', error);
      throw this.handleError(error, 'ASSIGN_TASK_FAILED');
    }
  }

  /**
   * Start task execution
   */
  async startTask(taskId: string, userId: string): Promise<ExpeditionTask> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(task.expeditionId, userId);

      // Validate task can be started
      this.validateTaskStart(task);

      // Check dependencies are completed
      await this.validateTaskDependenciesCompleted(task);

      // Start task
      const updatedTask = await taskRepo.update(taskId, {
        status: 'in-progress',
        updatedAt: new Date().toISOString()
      });

      if (!updatedTask) {
        throw this.createError('UPDATE_FAILED', 'Failed to start task');
      }


      console.log(`[TASK-SERVICE] Task started: ${taskId}`);
      return updatedTask;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to start task:', error);
      throw this.handleError(error, 'START_TASK_FAILED');
    }
  }

  /**
   * Complete task
   */
  async completeTask(
    taskId: string,
    userId: string,
    result: string,
    actualEffort?: number
  ): Promise<ExpeditionTask> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(task.expeditionId, userId);

      // Validate task can be completed
      this.validateTaskCompletion(task);

      // Complete task
      const updatedTask = await taskRepo.update(taskId, {
        status: 'completed',
        result,
        actualEffort,
        updatedAt: new Date().toISOString()
      });

      if (!updatedTask) {
        throw this.createError('UPDATE_FAILED', 'Failed to complete task');
      }

      // Check if this completion unblocks other tasks
      await this.checkAndUnblockDependentTasks(task.expeditionId, taskId);


      console.log(`[TASK-SERVICE] Task completed: ${taskId}`);
      return updatedTask;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to complete task:', error);
      throw this.handleError(error, 'COMPLETE_TASK_FAILED');
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string, userId: string): Promise<void> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        throw this.createError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(task.expeditionId, userId);

      // Validate task can be deleted
      this.validateTaskDeletion(task);

      // Check if other tasks depend on this one
      await this.validateNoDependentTasks(task.expeditionId, taskId);

      // Delete task
      await taskRepo.delete(taskId);


      console.log(`[TASK-SERVICE] Task deleted: ${taskId}`);
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to delete task:', error);
      throw this.handleError(error, 'DELETE_TASK_FAILED');
    }
  }

  /**
   * Get agent workload information for task assignment
   */
  async getAgentWorkloads(
    expeditionId: string,
    userId: string,
    requiredSkills?: string[]
  ): Promise<TaskWorkloadInfo[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      // Get expedition to find assigned agents
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Get agent information and calculate workloads
      const agentRepo = RepositoryFactory.getAgentRepository();
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      
      const workloads: TaskWorkloadInfo[] = [];

      for (const agentId of expedition.assignedAgents) {
        const agent = await agentRepo.findById(agentId);
        if (!agent) continue;

        // Get current tasks for this agent
        const allTasks = await taskRepo.findByExpedition(expeditionId);
        const agentTasks = allTasks.filter(task => task.assignedAgentId === agentId);
        const currentTasks = agentTasks.filter(task => 
          ['assigned', 'in-progress'].includes(task.status)
        ).length;
        const completedTasks = agentTasks.filter(task => 
          task.status === 'completed'
        ).length;

        // Calculate skill match
        const skillMatch = requiredSkills ? 
          this.calculateSkillMatch(agent.tags, requiredSkills) : 100;

        // Determine availability
        let availability: 'available' | 'busy' | 'overloaded' = 'available';
        if (currentTasks >= 5) availability = 'overloaded';
        else if (currentTasks >= 2) availability = 'busy';

        // Calculate average completion time (placeholder)
        const averageCompletionTime = this.calculateAverageCompletionTime(agentTasks);

        workloads.push({
          agentId,
          agentName: agent.name,
          currentTasks,
          completedTasks,
          averageCompletionTime,
          skillMatch,
          availability
        });
      }

      // Sort by best candidates (skill match, availability, workload)
      workloads.sort((a, b) => {
        if (a.availability !== b.availability) {
          const availabilityOrder = { 'available': 0, 'busy': 1, 'overloaded': 2 };
          return availabilityOrder[a.availability] - availabilityOrder[b.availability];
        }
        if (a.skillMatch !== b.skillMatch) {
          return b.skillMatch - a.skillMatch;
        }
        return a.currentTasks - b.currentTasks;
      });

      return workloads;
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to get agent workloads:', error);
      throw this.handleError(error, 'GET_WORKLOADS_FAILED');
    }
  }

  /**
   * Get task dependency graph
   */
  async getTaskDependencyGraph(
    expeditionId: string,
    userId: string
  ): Promise<{ nodes: any[], edges: any[] }> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const tasks = await taskRepo.findByExpedition(expeditionId);

      const nodes = tasks.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        assignedAgentId: task.assignedAgentId,
        priority: task.priority
      }));

      const edges: any[] = [];
      tasks.forEach(task => {
        task.dependencies.forEach(depId => {
          edges.push({
            from: depId,
            to: task.id,
            type: 'dependency'
          });
        });
      });

      return { nodes, edges };
    } catch (error) {
      console.error('[TASK-SERVICE] Failed to get dependency graph:', error);
      throw this.handleError(error, 'GET_DEPENDENCY_GRAPH_FAILED');
    }
  }

  // Private helper methods

  private async validateExpeditionAccess(expeditionId: string, userId: string): Promise<void> {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);

    if (!expedition) {
      throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
    }

    // Validate starship ownership
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  private async validateTaskDependencies(expeditionId: string, dependencies: string[]): Promise<void> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    
    for (const depId of dependencies) {
      const depTask = await taskRepo.findById(depId);
      if (!depTask || depTask.expeditionId !== expeditionId) {
        throw this.createError('DEPENDENCY_NOT_MET', `Invalid dependency: ${depId}`);
      }
    }
  }

  private async validateTaskDependenciesCompleted(task: ExpeditionTask): Promise<void> {
    if (task.dependencies.length === 0) return;

    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    
    for (const depId of task.dependencies) {
      const depTask = await taskRepo.findById(depId);
      if (!depTask || depTask.status !== 'completed') {
        throw this.createError('DEPENDENCY_NOT_MET', `Dependency not completed: ${depId}`);
      }
    }
  }

  private async validateAgentAssignment(agentId: string, task: ExpeditionTask): Promise<void> {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agentId);

    if (!agent) {
      throw this.createError('AGENT_NOT_AVAILABLE', `Agent not found: ${agentId}`);
    }

    // Check if agent has required skills (basic check)
    const hasRequiredSkills = task.requiredSkills.some(skill => 
      agent.tags.includes(skill) || agent.category === skill
    );

    if (task.requiredSkills.length > 0 && !hasRequiredSkills) {
      throw this.createError('AGENT_NOT_QUALIFIED', 'Agent does not have required skills');
    }
  }

  private validateStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): void {
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      'pending': ['assigned', 'in-progress'],
      'assigned': ['in-progress', 'pending'],
      'in-progress': ['completed', 'failed'],
      'blocked': ['pending', 'assigned'],
      'completed': [],
      'failed': ['pending', 'assigned']
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 
        `Cannot transition from ${currentStatus} to ${newStatus}`);
    }
  }

  private validateTaskStart(task: ExpeditionTask): void {
    if (!['pending', 'assigned'].includes(task.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Task cannot be started in current status');
    }
  }

  private validateTaskCompletion(task: ExpeditionTask): void {
    if (task.status !== 'in-progress') {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Only in-progress tasks can be completed');
    }
  }

  private validateTaskDeletion(task: ExpeditionTask): void {
    if (['in-progress'].includes(task.status)) {
      throw this.createError('VALIDATION_ERROR', 'Cannot delete task in progress');
    }
  }

  private async validateNoDependentTasks(expeditionId: string, taskId: string): Promise<void> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const allTasks = await taskRepo.findByExpedition(expeditionId);
    
    const dependentTasks = allTasks.filter(task => 
      task.dependencies.includes(taskId)
    );

    if (dependentTasks.length > 0) {
      throw this.createError('VALIDATION_ERROR', 'Task has dependent tasks');
    }
  }

  private async checkAndUnblockDependentTasks(expeditionId: string, completedTaskId: string): Promise<void> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const allTasks = await taskRepo.findByExpedition(expeditionId);
    
    const dependentTasks = allTasks.filter(task => 
      task.dependencies.includes(completedTaskId) && task.status === 'blocked'
    );

    for (const task of dependentTasks) {
      // Check if all dependencies are now completed
      const allDepsCompleted = await this.areAllDependenciesCompleted(task);
      
      if (allDepsCompleted) {
        await taskRepo.update(task.id, {
          status: 'pending',
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  private async areAllDependenciesCompleted(task: ExpeditionTask): Promise<boolean> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    
    for (const depId of task.dependencies) {
      const depTask = await taskRepo.findById(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  }

  private applyTaskFilters(tasks: ExpeditionTask[], filters: TaskFilters): ExpeditionTask[] {
    return tasks.filter(task => {
      if (filters.status && !filters.status.includes(task.status)) return false;
      if (filters.priority && !filters.priority.includes(task.priority)) return false;
      if (filters.assignedAgentId && task.assignedAgentId !== filters.assignedAgentId) return false;
      if (filters.requiredSkills && !filters.requiredSkills.some(skill => 
        task.requiredSkills.includes(skill))) return false;
      if (filters.hasDependencies !== undefined && 
        (task.dependencies.length > 0) !== filters.hasDependencies) return false;
      if (filters.overdue && task.dueDate) {
        const isOverdue = new Date(task.dueDate) < new Date();
        if (!isOverdue) return false;
      }
      return true;
    });
  }

  private calculateSkillMatch(agentTags: string[], requiredSkills: string[]): number {
    if (requiredSkills.length === 0) return 100;
    
    const matches = requiredSkills.filter(skill => 
      agentTags.some(tag => tag.toLowerCase().includes(skill.toLowerCase()))
    ).length;
    
    return Math.round((matches / requiredSkills.length) * 100);
  }

  private calculateAverageCompletionTime(tasks: ExpeditionTask[]): number {
    const completedTasks = tasks.filter(task => 
      task.status === 'completed' && task.actualEffort
    );
    
    if (completedTasks.length === 0) return 0;
    
    const totalTime = completedTasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
    return Math.round(totalTime / completedTasks.length);
  }

  private createError(code: string, message: string, context?: any): StandardError {
    return new StandardError(
      code as any,
      message,
      undefined,
      context
    );
  }

  private handleError(error: any, fallbackCode: string, context?: any): StandardError {
    if (error instanceof StandardError) {
      return error;
    }

    return new StandardError(
      fallbackCode as any,
      error.message || 'Unknown error occurred',
      { originalError: error instanceof Error ? error.message : String(error) },
      context
    );
  }
}