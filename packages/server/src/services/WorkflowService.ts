/**
 * Workflow Service
 *
 * Provides business logic APIs for workflow management and execution.
 * Orchestrates between database persistence (WorkflowRepository) and
 * stateless execution engine (autopilot Workflow).
 */

import { Blueprint, Workflow } from '@starships/autopilot';
import { NotFoundError, ValidationError } from '@starships/errors';
import { WorkflowRepository } from '@starships/models';
import type { CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowModel } from '@starships/protocol';

export interface WorkflowOptions {
  // Reserved for future workflow execution options
}

export interface WorkflowExecutionContext {
  workflowId: string;
  initialData?: Record<string, unknown>;
  timeout?: number;
}

/**
 * WorkflowService - Business logic for workflow management and execution
 */
export class WorkflowService {
  private workflowRepository: WorkflowRepository;

  constructor() {
    this.workflowRepository = new WorkflowRepository();
  }

  // ============================================================================
  // STATIC METHODS - Database operations (returns WorkflowModel)
  // ============================================================================

  /**
   * Get workflows by category - Static method
   */
  static async getWorkflowsByCategory(category: string): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.findByCategory(category);
  }

  /**
   * Get workflows by author - Static method
   */
  static async getWorkflowsByAuthor(authorId: string): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.findByAuthor(authorId);
  }

  /**
   * Get workflows by tags - Static method
   */
  static async getWorkflowsByTags(tags: string[]): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.findByTags(tags);
  }

  /**
   * Get public workflows - Static method
   */
  static async getPublicWorkflows(limit: number = 50, offset: number = 0): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.findPublic(limit, offset);
  }

  /**
   * Search workflows - Static method
   */
  static async searchWorkflows(query: string): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.searchWorkflows(query);
  }

  /**
   * Get workflow by ID - Static method (returns WorkflowModel, not Workflow)
   */
  static async getWorkflow(workflowId: string): Promise<WorkflowModel | null> {
    const repository = new WorkflowRepository();
    return await repository.findById(workflowId);
  }

  /**
   * Create workflow - Static method (returns WorkflowModel, not Workflow)
   */
  static async createWorkflow(request: CreateWorkflowRequest): Promise<WorkflowModel> {
    const repository = new WorkflowRepository();

    // Provide defaults for core WorkflowParams fields
    const workflowData = {
      ...request,
      blueprint: request.blueprint || { nodes: [], edges: [], metadata: {} },
      timeout: request.timeout || 30000,
    };

    return await repository.create(workflowData as Omit<WorkflowModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>);
  }

  /**
   * Update workflow - Static method (returns WorkflowModel, not Workflow)
   */
  static async updateWorkflow(workflowId: string, updates: UpdateWorkflowRequest): Promise<WorkflowModel | null> {
    const repository = new WorkflowRepository();
    return await repository.update(workflowId, updates as Partial<WorkflowModel>);
  }

  /**
   * Delete workflow - Static method
   */
  static async deleteWorkflow(workflowId: string): Promise<boolean> {
    const repository = new WorkflowRepository();
    return await repository.delete(workflowId);
  }

  /**
   * Get workflows by starship ID - Static method
   */
  static async getWorkflowsByStarshipId(starshipId: string): Promise<WorkflowModel[]> {
    const repository = new WorkflowRepository();
    return await repository.findByStarshipId(starshipId);
  }

  /**
   * Track workflow usage - Static method
   */
  static async trackUsage(workflowId: string): Promise<boolean> {
    const repository = new WorkflowRepository();
    try {
      await repository.incrementUsageCount(workflowId);
      return true;
    } catch (error) {
      console.error('Failed to track workflow usage:', error);
      return false;
    }
  }

  /**
   * Rate workflow - Static method
   */
  static async rateWorkflow(workflowId: string, userId: string, rating: number): Promise<boolean> {
    const repository = new WorkflowRepository();
    try {
      await repository.updateRating(workflowId, rating);
      return true;
    } catch (error) {
      console.error('Failed to rate workflow:', error);
      return false;
    }
  }

  /**
   * Get workflow analytics - Static method
   */
  static async getWorkflowAnalytics(workflowId: string): Promise<{
    workflowId: string;
    name: string;
    category: string;
    usageCount: number;
    rating: number;
    isPublic?: boolean;
    createdAt: string;
    lastUpdated: string;
  }> {
    const repository = new WorkflowRepository();
    const workflow = await repository.findById(workflowId);

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    return {
      workflowId,
      name: workflow.name,
      category: workflow.category,
      usageCount: workflow.usageCount || 0,
      rating: workflow.rating || 0,
      isPublic: workflow.isPublic,
      createdAt: workflow.createdAt,
      lastUpdated: workflow.updatedAt,
    };
  }

  // ============================================================================
  // INSTANCE METHODS - Execution operations (returns Workflow instances)
  // ============================================================================

  /**
   * Create a new workflow and return as Workflow instance
   */
  async createWorkflow(request: CreateWorkflowRequest, options: WorkflowOptions = {}): Promise<Workflow> {
    // Validate blueprint if provided
    if (request.blueprint) {
      const validation = this.validateBlueprint(request.blueprint);
      if (!validation.valid) {
        throw new ValidationError(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    const workflowData = {
      ...request,
      blueprint: request.blueprint || this.createDefaultBlueprint(),
      timeout: request.timeout || 30000,
    };

    const dbWorkflow = await this.workflowRepository.create(
      workflowData as Omit<WorkflowModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
    );
    return await this.createWorkflowInstance(dbWorkflow, options);
  }

  /**
   * Get workflow by ID as Workflow instance
   */
  async getWorkflow(workflowId: string, options: WorkflowOptions = {}): Promise<Workflow | null> {
    const dbWorkflow = await this.workflowRepository.findById(workflowId);
    if (!dbWorkflow) {
      return null;
    }
    return await this.createWorkflowInstance(dbWorkflow, options);
  }

  /**
   * Get all workflows as Workflow instances
   */
  async getAllWorkflows(options: WorkflowOptions = {}): Promise<Workflow[]> {
    const dbWorkflows = await this.workflowRepository.findAll();
    return Promise.all(dbWorkflows.map((dbWorkflow: WorkflowModel) => this.createWorkflowInstance(dbWorkflow, options)));
  }

  /**
   * Get workflows by starship as Workflow instances
   */
  async getWorkflowsByStarship(starshipId: string, options: WorkflowOptions = {}): Promise<Workflow[]> {
    const dbWorkflows = await this.workflowRepository.findByStarshipId(starshipId);
    return Promise.all(dbWorkflows.map((dbWorkflow: WorkflowModel) => this.createWorkflowInstance(dbWorkflow, options)));
  }

  /**
   * Get workflows by user as Workflow instances
   */
  async getWorkflowsByUser(userId: string, options: WorkflowOptions = {}): Promise<Workflow[]> {
    const dbWorkflows = await this.workflowRepository.findByAuthor(userId);
    return Promise.all(dbWorkflows.map((dbWorkflow: WorkflowModel) => this.createWorkflowInstance(dbWorkflow, options)));
  }

  /**
   * Update workflow and return as Workflow instance
   */
  async updateWorkflow(workflowId: string, updates: UpdateWorkflowRequest, options: WorkflowOptions = {}): Promise<Workflow | null> {
    // Validate blueprint if being updated
    if (updates.blueprint) {
      const validation = this.validateBlueprint(updates.blueprint);
      if (!validation.valid) {
        throw new ValidationError(`Invalid blueprint: ${validation.errors.join(', ')}`);
      }
    }

    const dbWorkflow = await this.workflowRepository.update(workflowId, updates as Partial<WorkflowModel>);
    if (!dbWorkflow) {
      return null;
    }
    return await this.createWorkflowInstance(dbWorkflow, options);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    return await this.workflowRepository.delete(workflowId);
  }

  /**
   * Deploy workflow to starship
   */
  async deployWorkflow(workflowId: string, starshipId: string): Promise<void> {
    await this.workflowRepository.updateStarshipId(workflowId, starshipId);
  }

  /**
   * Search workflows and return as Workflow instances
   */
  async searchWorkflows(query: string, options: WorkflowOptions = {}): Promise<Workflow[]> {
    const dbWorkflows = await this.workflowRepository.searchWorkflows(query);
    return Promise.all(dbWorkflows.map((dbWorkflow: WorkflowModel) => this.createWorkflowInstance(dbWorkflow, options)));
  }

  /**
   * Get workflows with filters as Workflow instances
   */
  async getWorkflowsWithFilters(
    filters: {
      category?: string;
      authorId?: string;
      isPublic?: boolean;
      tags?: string[];
      starshipClass?: 'scout' | 'cruiser';
    },
    options: WorkflowOptions = {}
  ): Promise<Workflow[]> {
    const dbWorkflows = await this.workflowRepository.findWithFilters(filters);
    return Promise.all(dbWorkflows.map((dbWorkflow: WorkflowModel) => this.createWorkflowInstance(dbWorkflow, options)));
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Execute workflow using WorkflowExecutionContext
   */
  async executeWorkflow(context: WorkflowExecutionContext, options: WorkflowOptions = {}): Promise<void> {
    const startTime = Date.now();

    // Get database workflow
    const dbWorkflow = await this.workflowRepository.findById(context.workflowId);
    if (!dbWorkflow) {
      throw new NotFoundError('Workflow', context.workflowId);
    }

    // Create workflow instance
    const workflow = await this.createWorkflowInstance(dbWorkflow, options);

    console.log(`✅ [WORKFLOW-SERVICE] Executing workflow: ${dbWorkflow.name} (${context.workflowId})`);

    // Execute workflow
    await workflow.execute();
    // Track usage
    await this.workflowRepository.incrementUsageCount(context.workflowId);

    const executionTime = Date.now() - startTime;
    console.log(`✅ [WORKFLOW-SERVICE] Workflow executed successfully in ${executionTime}ms`);
  }

  /**
   * Validate workflow
   */
  static async validateWorkflow(workflowId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const workflowRepo = new WorkflowRepository();
      const dbWorkflow = await workflowRepo.findById(workflowId);

      if (!dbWorkflow) {
        return {
          valid: false,
          errors: [`Workflow ${workflowId} not found`],
          warnings: [],
        };
      }

      // Basic validation - WorkflowService handles detailed validation internally
      if (!dbWorkflow.name || !dbWorkflow.blueprint) {
        return {
          valid: false,
          errors: ['Workflow name and blueprint are required'],
          warnings: [],
        };
      }

      // Add warnings for potential issues
      if (!dbWorkflow.blueprint.nodes || dbWorkflow.blueprint.nodes.length === 0) {
        warnings.push('Workflow blueprint has no nodes defined');
      }

      if (!dbWorkflow.starshipId) {
        warnings.push('Workflow is not assigned to any starship');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Create Workflow instance from database model
   */
  private async createWorkflowInstance(dbWorkflow: WorkflowModel, options: WorkflowOptions): Promise<Workflow> {
    // Get blueprint
    const blueprint = dbWorkflow.blueprint || this.createDefaultBlueprint();

    const workflowParams = {
      blueprint: blueprint,
      timeout: dbWorkflow.timeout || 30000,
    };

    return new Workflow({
      name: 'Workflow Execution',
      blueprint: workflowParams.blueprint || { nodes: [], edges: [] },
      timeout: workflowParams.timeout,
    });
  }

  /**
   * Validate blueprint structure
   */
  private validateBlueprint(blueprint: Blueprint): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!blueprint.nodes || !Array.isArray(blueprint.nodes)) {
      errors.push('Blueprint must have a nodes array');
    }

    if (!blueprint.edges || !Array.isArray(blueprint.edges)) {
      errors.push('Blueprint must have an edges array');
    }

    // Check for start node
    if (blueprint.nodes && !blueprint.nodes.some((node) => node.type === 'start')) {
      errors.push('Blueprint must have a start node');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create default blueprint for simple workflows
   */
  private createDefaultBlueprint(): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Workflow start point',
          parameters: {},
          metadata: {},
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Workflow end point',
          parameters: {},
          metadata: {},
        },
      ],
      edges: [
        {
          ref: 'start-to-end',
          from: 'start',
          to: 'end',
          metadata: {},
        },
      ],
      metadata: {
        generated: true,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
